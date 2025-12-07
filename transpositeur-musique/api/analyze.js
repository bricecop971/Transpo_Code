// api/analyze.js
// VERSION : SCIENTIFIC PITCH & DURATION

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

        // Scan automatique du modèle
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];
        const modelName = chosenModel.name.replace("models/", "");

        // --- PROMPT SCIENTIFIQUE ---
        const promptText = `
            Analyze this sheet music image.
            
            TASK: Extract every single note in reading order (left to right).
            
            RETURN JSON format:
            {
                "attributes": {
                    "keySignature": "G", // e.g., C, G, D, F...
                    "timeSignature": "4/4"
                },
                "notes": [
                    { "pitch": "C4", "duration": 1.0 },
                    { "pitch": "D4", "duration": 0.5 },
                    { "pitch": "F#4", "duration": 2.0 }
                ]
            }

            DATA RULES:
            1. **PITCH**: Use Scientific Pitch Notation (e.g., C4 = Middle C). 
               - Be precise about vertical position on the staff lines.
               - Include accidentals (#/b) directly in the pitch string if written next to the note.
            
            2. **DURATION (Decimal)**:
               - Quarter Note (Noire) = 1.0
               - Half Note (Blanche) = 2.0
               - Eighth Note (Croche) = 0.5
               - Whole Note (Ronde) = 4.0
               - Dotted Quarter = 1.5
               - Dotted Half = 3.0

            Ignore text lyrics. Focus on note heads.
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
