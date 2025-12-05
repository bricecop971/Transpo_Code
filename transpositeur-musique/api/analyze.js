// api/analyze.js
// VERSION : SCHEMA STRICT (Anti-Hallucination)

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

        // LISTE DES MODÈLES
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // --- DÉFINITION DU SCHÉMA JSON STRICT ---
        // On explique à l'API exactement à quoi doit ressembler le JSON
        const generationConfig = {
            response_mime_type: "application/json",
            response_schema: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    keySignature: { type: "STRING" },
                    timeSignature: { type: "STRING" },
                    measures: {
                        type: "ARRAY",
                        items: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    note: { type: "STRING" },
                                    octave: { type: "INTEGER" },
                                    duration: { type: "NUMBER" },
                                    accidental: { type: "STRING" }
                                },
                                required: ["note", "duration"]
                            }
                        }
                    }
                },
                required: ["title", "keySignature", "timeSignature", "measures"]
            }
        };

        const requestBody = {
            contents: [{
                parts: [
                    { text: `Analyze this sheet music. Fill the data structure strictly.` },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            generationConfig: generationConfig // On applique le schéma ici
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
            let jsonText = data.candidates[0].content.parts[0].text;
            // Avec le schéma strict, le JSON est garanti d'être pur, mais on nettoie au cas où
            jsonText = jsonText.replace(/```json/gi, "").replace(/```/g, "").trim();
            
            // On renvoie directement l'objet parsé
            const parsed = JSON.parse(jsonText);
            return res.status(200).json({ musicData: parsed });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
