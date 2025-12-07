// api/analyze.js
// VERSION : STRUCTURELLE RAPIDE (Anti-Timeout)

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
        // On vise Flash 1.5 pour la vitesse
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // 2. PROMPT "SCANNER STRUCTUREL" (Plus rapide)
        const promptText = `
            Analyze this sheet music image.
            
            TASK: Extract notes measure by measure.
            
            OUTPUT JSON FORMAT:
            {
                "attributes": { "keySignature": "C", "timeSignature": "4/4" },
                "measures": [
                    [ {"p": "C4", "d": 1.0}, {"p": "rest", "d": 1.0} ], // Measure 1
                    [ {"p": "G4", "d": 2.0} ] // Measure 2
                ]
            }

            RULES:
            - "p": Pitch (e.g. C4, D#5) OR "rest" (silence).
            - "d": Duration value based on shape:
               - Hollow head (Blanche/Ronde) -> 2.0 or 4.0
               - Solid head (Noire) -> 1.0
               - Flag/Beam (Croche) -> 0.5
            - Split the array into sub-arrays for each measure (bar line).
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
