// api/analyze.js
// VERSION : RECONNAISSANCE VISUELLE DES FORMES (RYTHME)

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

        // 1. SCANNER DE MODÈLES
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // 2. CONSIGNE "DICTIONNAIRE VISUEL"
        // On apprend à l'IA à traduire les formes en code ABC
        const requestBody = {
            contents: [{
                parts: [
                    { text: `
                        Transcribe this sheet music to ABC Notation.
                        
                        --- VISUAL DICTIONARY FOR RHYTHM (CRITICAL) ---
                        Look closely at the note heads and stems:
                        
                        1. **HOLLOW HEAD (Tête Blanche)**:
                           - Usually a Half Note (Blanche).
                           - RULE: You MUST add '2' after the note letter. (e.g., C2, D2).
                        
                        2. **SOLID HEAD (Tête Noire) + STEM (Tige)**:
                           - Usually a Quarter Note (Noire).
                           - RULE: Write just the letter. (e.g., C, D).
                        
                        3. **SOLID HEAD + FLAG/BEAM (Drapeau/Barre)**:
                           - Usually an Eighth Note (Croche) or Sixteenth.
                           - RULE: You MUST add '/2' or '/4' after the note. (e.g., C/2, D/2).
                           - Look at groups of notes connected by a thick line (beam) -> These are /2.
                        
                        4. **DOTS (Points)**:
                           - If a note has a dot '.' next to it, add '3/2' (if solid) or '3' (if hollow).

                        --- STRUCTURE ---
                        - Detect Time Signature (M:).
                        - Detect Key Signature (K:).
                        - Output ONLY the ABC code starting with X:1.
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

        if (data.error) return res.status(500).json({ error: `Erreur Google : ` + data.error.message });
        
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
