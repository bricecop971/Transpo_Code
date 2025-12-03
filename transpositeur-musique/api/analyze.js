// api/analyze.js
// VERSION : PRÉCISION RENFORCÉE (Compter les dièses)

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

        // --- 1. SÉLECTION DU MODÈLE ---
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        // On prend Flash (rapide et bon pour le texte structuré)
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models.find(m => m.supportedGenerationMethods.includes("generateContent"));
        
        const modelName = chosenModel.name.replace("models/", "");

        // --- 2. CONSIGNE "CHAÎNE DE PENSÉE" ---
        // On force l'IA à réfléchir étape par étape pour ne pas rater la tonalité
        const requestBody = {
            contents: [{
                parts: [
                    { text: `
                        You are an expert music transcriber. Convert this image to ABC Notation.
                        
                        STEP-BY-STEP INSTRUCTIONS:
                        1. Look at the beginning of the staff. COUNT the sharps (#) or flats (b).
                           - 0 sharp/flat = K:C (Do Maj) or K:Am
                           - 1 sharp = K:G (Sol Maj) or K:Em
                           - 1 flat = K:F (Fa Maj) or K:Dm
                           - 2 sharps = K:D ...
                           -> BE VERY CAREFUL. Do not hallucinate sharps that are not there.
                        
                        2. Identify the Time Signature (e.g., 2/4, 4/4, 6/8). Write it as M:x/x.
                        
                        3. Transcribe the notes and RHYTHM. 
                           - Use 'L:1/4' as default unit.
                           - A quarter note (noire) = c
                           - A half note (blanche) = c2
                           - An eighth note (croche) = c/2
                        
                        OUTPUT:
                        Return ONLY the ABC code block. Start with X:1. 
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
