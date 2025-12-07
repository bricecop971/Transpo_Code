// api/analyze.js
// VERSION : VISION GÉOMÉTRIQUE (Focalisation sur les symboles visuels)

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
        if (!image) return res.status(400).json({ error: 'Aucune image' });

        // On reprend le scanner de modèles qui fonctionnait
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];
        const modelName = chosenModel.name.replace("models/", "");

        // --- NOUVEAU PROMPT VISUEL ---
        // On demande à l'IA de décrire les symboles avant d'écrire le code.
        const requestBody = {
            contents: [{
                parts: [
                    { text: `
                        Task: Transcribe this sheet music image to ABC Notation.
                        
                        FOCUS ON VISUAL SYMBOLS:
                        1. **Time Signature**: Look at the start. Do you see two stacked numbers?
                           - If top is 2 and bottom is 4, write M:2/4.
                           - If top is 6 and bottom is 8, write M:6/8.
                           - Do NOT default to 4/4 unless you see a 'C' or 4/4.
                        
                        2. **Note Duration (Visual recognition)**:
                           - Note with **Solid Head** + **Stem** + **No Flag** = Quarter Note (Noire) -> ABC: C
                           - Note with **Solid Head** + **Stem** + **One Flag/Beam** = Eighth Note (Croche) -> ABC: C/2
                           - Note with **Solid Head** + **Stem** + **Two Flags/Beams** = Sixteenth Note (Double-croche) -> ABC: C/4
                           - Note with **Hollow Head** + **Stem** = Half Note (Blanche) -> ABC: C2
                        
                        3. **Rhythm Check**:
                           - Ensure the total duration of notes inside two '|' bars equals the Time Signature.
                        
                        OUTPUT:
                        Return ONLY the ABC code block starting with X:1.
                    `},
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

        if (data.error) return res.status(500).json({ error: "Erreur Google : " + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            let abcCode = data.candidates[0].content.parts[0].text;
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas pu lire la partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
