const https = require('https');

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

export default async function handler(req, res) {
    // 1. Vérification méthode
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante sur Vercel' });

    try {
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // 2. Détection automatique du modèle
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        
        const models = listData.models || [];
        // On cherche Flash ou Pro (hors 2.0 exp qui a des quotas faibles)
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        if (!chosenModel) return res.status(500).json({ error: "Aucun modèle IA disponible." });

        const modelName = chosenModel.name.replace("models/", "");

        // 3. Prompt "Vision Optique" (Retourne du JSON strict)
        const promptText = `
            Act as an Optical Music Recognition (OMR) engine.
            Task: Extract visual data about notes from the image.

            RETURN JSON ONLY using this schema:
            {
                "attributes": {
                    "keySignature": "C", 
                    "timeSignature": "4/4"
                },
                "notes": [
                    {
                        "pitch": "C4",  // Scientific pitch (C4, D#5, etc.) OR "rest"
                        "visualType": "quarter" // "whole", "half", "quarter", "eighth", "sixteenth"
                    }
                ]
            }
            
            RULES:
            - "rest" means a silence/pause.
            - "half" = Hollow head (vide) with stem.
            - "quarter" = Solid head (pleine) with stem.
            - "eighth" = Solid head with flag/beam.
        `;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            generationConfig: { response_mime_type: "application/json" },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
            }
        };

        // Utilisation de https natif pour éviter les erreurs de version de Node
        return new Promise((resolve, reject) => {
            const req = https.request(options, (googleRes) => {
                let responseBody = '';
                googleRes.on('data', (chunk) => { responseBody += chunk; });
                googleRes.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseBody);
                        
                        if (parsedData.error) {
                            resolve({ statusCode: 500, body: JSON.stringify({ error: "Google Error: " + parsedData.error.message }) });
                        } 
                        else if (parsedData.candidates && parsedData.candidates[0].content) {
                            const jsonText = parsedData.candidates[0].content.parts[0].text;
                            // On renvoie le JSON pur
                            resolve({ statusCode: 200, body: JSON.stringify({ musicData: JSON.parse(jsonText) }) });
                        } else {
                            resolve({ statusCode: 500, body: JSON.stringify({ error: "L'IA n'a rien trouvé." }) });
                        }
                    } catch (e) { 
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "Réponse illisible: " + responseBody }) }); 
                    }
                });
            });
            req.on('error', (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur Co: " + e.message }) }));
            req.write(JSON.stringify(requestBody));
            req.end();
        });

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur Vercel : ' + error.message });
    }
}
