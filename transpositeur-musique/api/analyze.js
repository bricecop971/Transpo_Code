// api/analyze.js
// VERSION : AUTO-PILOTE + MUSIQUE (Final)

export const config = {
    api: {
        bodyParser: { sizeLimit: '4mb' },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Clé API manquante." });

    try {
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: "Image manquante." });

        // --- 1. AUTO-PILOTE : Trouver le bon modèle ---
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) return res.status(500).json({ error: "Erreur Google List: " + listData.error.message });

        const models = listData.models || [];
        
        // Priorité : Flash (Vitesse) > Pro (Qualité)
        let chosenModel = models.find(m => m.name.includes("flash") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models[0];

        if (!chosenModel) return res.status(500).json({ error: "Aucun modèle compatible trouvé." });
        
        const modelName = chosenModel.name.replace("models/", "");

        // --- 2. ANALYSE MUSICALE RAPIDE ---
        const promptText = `
            OMR Task. Extract notes from this sheet music.
            Return ONLY JSON. Speed is critical.
            
            JSON Structure:
            {
                "time": "4/4",
                "key": "C", 
                "notes": [
                    {"p": "C4", "l": "q"}, 
                    {"p": "rest", "l": "h"}
                ]
            }

            Legend:
            "p": Pitch (e.g. C4, G#5) OR "rest".
            "l": Length -> "w"(whole), "h"(half), "q"(quarter), "8"(eighth), "16"(sixteenth).
        `;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            generationConfig: { 
                response_mime_type: "application/json",
                maxOutputTokens: 2500
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) return res.status(500).json({ error: "Erreur Analyse: " + data.error.message });

        if (data.candidates && data.candidates[0].content) {
            const jsonText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ musicData: JSON.parse(jsonText) });
        } else {
            return res.status(500).json({ error: "L'IA n'a rien vu sur l'image." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Crash Serveur: " + error.message });
    }
}
