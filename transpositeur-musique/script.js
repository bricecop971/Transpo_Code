// api/analyze.js
// VERSION : DONNÉES JSON STRICTES (Plus fiable)

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
        // On demande la liste et on prend le premier qui voit les images
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        
        const models = listData.models || [];
        // On cherche Flash ou Pro (hors 2.0 exp)
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // --- CONSIGNE JSON STRICTE ---
        // On demande à l'IA de remplir un objet JSON précis
        const promptText = `
            Analyze this sheet music perfectly. 
            Extract data into a strictly valid JSON object. Do not use Markdown blocks.
            
            Structure required:
            {
                "title": "Title of the piece",
                "keySignature": "G", (e.g. C, G, D, F, Bb...)
                "timeSignature": "4/4", (e.g. 4/4, 3/4, 6/8)
                "measures": [
                    [
                        { "note": "C", "octave": 4, "duration": 1.0, "accidental": "" },
                        { "note": "D", "octave": 4, "duration": 0.5, "accidental": "#" }
                    ]
                ]
            }

            Rules for duration:
            - Quarter note (Noire) = 1.0
            - Half note (Blanche) = 2.0
            - Eighth note (Croche) = 0.5
            - Whole note (Ronde) = 4.0
            
            Rules for Note:
            - Use letters C, D, E, F, G, A, B.
            - "rest" for pauses.
            
            IMPORTANT: Be mathematically precise. The sum of durations in a measure MUST match the time signature.
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
            // On force la réponse en JSON pour éviter le blabla
            generationConfig: {
                response_mime_type: "application/json"
            }
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
            // On nettoie au cas où
            jsonText = jsonText.replace(/```json/gi, "").replace(/```/g, "").trim();
            
            // On vérifie que c'est bien du JSON valide
            const musicData = JSON.parse(jsonText);
            return res.status(200).json({ musicData: musicData });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
