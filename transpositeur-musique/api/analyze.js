// api/analyze.js
// VERSION : AUTO-DÉTECTION DU MODÈLE + SCANNER OPTIQUE

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

        // --- 1. DÉCOUVERTE AUTOMATIQUE DU MODÈLE ---
        // On demande à Google : "Quels modèles sont dispos pour cette clé ?"
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) {
            return res.status(500).json({ error: "Impossible de lister les modèles : " + listData.error.message });
        }

        const allModels = listData.models || [];
        
        // On filtre pour trouver un modèle :
        // 1. Qui accepte "generateContent" (Vision/Texte)
        // 2. Qui n'est PAS le 2.0 (car quota trop faible)
        // 3. Qui n'est PAS "gemini-pro" tout court (car il ne voit pas les images)
        const validModels = allModels.filter(m => 
            m.supportedGenerationMethods.includes("generateContent") && 
            !m.name.includes("2.0") &&
            !m.name.endsWith("gemini-pro") 
        );

        // On essaie de trouver un "Flash", sinon un "Pro", sinon le premier qui vient
        let chosenModel = validModels.find(m => m.name.includes("flash"));
        if (!chosenModel) chosenModel = validModels.find(m => m.name.includes("1.5-pro"));
        if (!chosenModel) chosenModel = validModels[0];

        if (!chosenModel) {
            return res.status(500).json({ error: "Aucun modèle compatible trouvé pour votre clé." });
        }

        // On nettoie le nom (ex: "models/gemini-1.5-flash-001" -> "gemini-1.5-flash-001")
        const modelName = chosenModel.name.replace("models/", "");

        // --- 2. ANALYSE VISUELLE (APPROCHE KLANG) ---
        const promptText = `
            Act as an Optical Music Recognition (OMR) engine.
            Task: Extract visual data about notes.

            RETURN JSON ONLY using this schema:
            {
                "attributes": {
                    "keySignature": "G", // Count sharps/flats. 1# = G.
                    "timeSignature": "4/4"
                },
                "notes": [
                    {
                        "pitch": "C", // Note name
                        "octave": 4, 
                        "accidental": "", // "#", "b", or ""
                        "visualType": "quarter" // CRITICAL: Identify by SHAPE.
                    }
                ]
            }

            VISUAL RULES FOR "visualType":
            - Hollow head (vide) = "half" (Blanche) or "whole" (Ronde).
            - Solid head (pleine) + Stem (tige) = "quarter" (Noire).
            - Solid head + Flag/Beam (barre) = "eighth" (Croche).
        `;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptText },
                        { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                    ]
                }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();

        if (data.error) return res.status(500).json({ error: `Erreur Google (${modelName}) : ` + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            const jsonText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ musicData: JSON.parse(jsonText) });
        } else {
            return res.status(500).json({ error: "L'IA n'a rien vu." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
