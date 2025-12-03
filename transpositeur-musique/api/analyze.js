// api/analyze.js
// VERSION : DÉTECTION COMPLÈTE (Rythme + Tonalité)

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

        // 1. SÉLECTION DU MODÈLE (Scanner Intelligent)
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        // On évite le 2.0 (quota) et on cherche Flash ou Pro
        const validModels = models.filter(m => 
            m.supportedGenerationMethods.includes("generateContent") && 
            !m.name.includes("2.0") &&
            !m.name.endsWith("gemini-pro")
        );
        
        let chosenModel = validModels.find(m => m.name.includes("flash")); // Priorité Flash
        if (!chosenModel) chosenModel = validModels[0]; // Sinon le premier dispo

        if (!chosenModel) return res.status(500).json({ error: "Aucun modèle IA compatible trouvé." });
        
        const modelName = chosenModel.name.replace("models/", "");

        // 2. CONSIGNE EXPERTE (C'est ici que tout change !)
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Analyze this sheet music. Convert it to full ABC Notation. \nIMPORTANT: \n1. Detect the Key Signature (K:). \n2. Detect the Time Signature (M:). \n3. Detect the Unit Note Length (L:). \n4. Transcribe the notes with correct rhythm (e.g. c2, d/2). \nOutput ONLY the ABC code block starting with X:1." },
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
            // Nettoyage du code
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
