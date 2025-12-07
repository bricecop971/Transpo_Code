// api/analyze.js
// VERSION : VÉRIFICATION MATHÉMATIQUE STRICTE

export const config = {
    api: {
        bodyParser: { sizeLimit: '4mb' },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

    try {
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // 1. SÉLECTION DU MODÈLE
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // 2. PROMPT "MATHÉMATIQUE"
        const promptText = `
            Act as a strict Optical Music Recognition engine with Mathematical Verification.
            
            TASK: Extract notes and rhythm from the image.
            
            STEP 1: VISUAL SCAN
            - Identify the Time Signature (e.g., 4/4). Let's call the top number "TARGET_SUM".
            - Identify note heads:
              - Hollow Head (Vide) = Half Note (Blanche) -> Value: 2.0
              - Solid Head (Pleine) + Stem = Quarter Note (Noire) -> Value: 1.0
              - Solid Head + Flag/Beam = Eighth Note (Croche) -> Value: 0.5
              - Dot (.) after note = Value * 1.5

            STEP 2: MATHEMATICAL CHECK (CRITICAL)
            - For every measure (between bar lines):
              1. Sum the values of all notes found.
              2. Compare with TARGET_SUM.
              3. IF Sum < TARGET_SUM: You likely missed a rest or mistook a Half for a Quarter. FIX IT to match the target.
              4. IF Sum > TARGET_SUM: You likely mistook a Quarter for a Half. FIX IT.

            RETURN JSON FORMAT:
            {
                "attributes": { "keySignature": "G", "timeSignature": "4/4" },
                "measures": [
                    [
                        { "p": "C4", "d": 1.0 },  // Quarter
                        { "p": "D4", "d": 0.5 },  // Eighth
                        { "p": "E4", "d": 0.5 },  // Eighth
                        { "p": "F4", "d": 2.0 }   // Half (Total = 4.0 -> OK for 4/4)
                    ],
                    ...
                ]
            }
            Use "rest" for p (pitch) if it is a silence.
        `;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            generationConfig: { response_mime_type: "application/json" }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) return res.status(500).json({ error: `Erreur Google : ` + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            const jsonText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ musicData: JSON.parse(jsonText) });
        } else {
            return res.status(500).json({ error: "L'IA n'a rien lu." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
