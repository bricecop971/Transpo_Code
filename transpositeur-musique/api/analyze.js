// api/analyze.js
// VERSION : MATHÉMATIQUE STRICTE & BARRES DE MESURE

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
        const { image, mimeType, meter } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // On impose la mesure choisie par l'utilisateur
        const userMeter = meter || "4/4";

        // Détection du modèle
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        // On cherche Flash ou Pro (hors 2.0 exp)
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // --- PROMPT MATHÉMATIQUE ---
        const promptText = `
            Act as a strict Music Transcription Engine.
            
            INPUT CONSTRAINTS:
            - The Time Signature is FORCED to be: M:${userMeter}
            - Do not detect the meter. USE M:${userMeter}.

            TASK:
            Transcribe the notes into ABC Notation.
            
            MATHEMATICAL RULES (CRITICAL):
            1. **Bar Lines (|)**: You MUST identify every vertical bar line in the image.
            2. **Sum Check**: The sum of note durations inside every measure (between two |) MUST equal ${userMeter}.
               - If M:2/4, sum = 2 (e.g. C C | or C2 | or C/2 C/2 C |).
               - If M:4/4, sum = 4.
            3. **Note Values**:
               - Half Note (Blanche) = Note + '2' (e.g. C2)
               - Quarter Note (Noire) = Note (e.g. C)
               - Eighth Note (Croche) = Note + '/2' (e.g. C/2)
               - Dotted Quarter = Note + '3/2' (e.g. C3/2)
               - Whole Note (Ronde) = Note + '4' (e.g. C4)

            OUTPUT:
            Return ONLY the valid ABC code starting with X:1.
            Include K: (Detect Key Signature) and M:${userMeter}.
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
            ]
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
            let abcCode = data.candidates[0].content.parts[0].text;
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            // Double sécurité : on force le M: dans le code retourné
            abcCode = abcCode.replace(/^M:.*$/m, `M:${userMeter}`);
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de code ABC." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
