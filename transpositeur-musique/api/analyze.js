// api/analyze.js
// VERSION : INSPECTEUR (Commentaires explicatifs)

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

    try {
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // LISTE DES MODÈLES (Scanner)
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        // On cherche Flash ou Pro (en évitant le 2.0 buggé pour l'instant)
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // CONSIGNE "INSPECTEUR"
        const requestBody = {
            contents: [{
                parts: [
                    { text: `
                        Transcribe this sheet music to ABC Notation.
                        
                        CRITICAL INSTRUCTION: Add comments starting with '%' to explain your findings.
                        
                        1. KEY SIGNATURE: Count sharps (#) and flats (b) at the very beginning of the staff carefully.
                           - If you see 1 sharp, write: % Detected 1 Sharp (G Major) -> K:G
                           - If you see 4 sharps, write: % Detected 4 Sharps (E Major) -> K:E
                        
                        2. TIME SIGNATURE: Look for 4/4, C, 2/4, etc. Write it in M:.
                        
                        3. NOTES: Transcribe the melody. Use '2' for half notes, '4' for whole notes.
                        
                        OUTPUT FORMAT EXAMPLE:
                        X:1
                        % Detected Key: 1 Sharp
                        K:G
                        % Detected Time: 4/4
                        M:4/4
                        L:1/4
                        c d e f | g2 g2 |
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

        if (data.error) return res.status(500).json({ error: `Erreur Google (${modelName}) : ` + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            let abcCode = data.candidates[0].content.parts[0].text;
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
