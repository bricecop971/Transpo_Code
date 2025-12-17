// api/analyze.js
// VERSION : SPEED MODE (ANTI-TIMEOUT)

const https = require('https');

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
        if (!image) return res.status(400).json({ error: 'Image manquante' });

        // 1. On force le modèle FLASH (le plus rapide)
        // On ne cherche même pas le Pro, car il est trop lent pour le timeout de 10s
        const modelName = "gemini-1.5-flash";

        // 2. Prompt Optimisé pour la Vitesse
        // On demande des clés courtes ("p", "l") pour réduire le temps d'écriture
        const promptText = `
            OMR Task. Extract notes. Speed is critical.
            
            Return JSON:
            {
                "time": "4/4",
                "key": "C", 
                "notes": [
                    {"p": "C4", "l": "q"}, 
                    {"p": "rest", "l": "h"}
                ]
            }

            LEGEND:
            "p": Pitch (e.g. C4, G#5) OR "rest".
            "l": Length -> "w"(whole), "h"(half), "q"(quarter), "8"(eighth), "16"(sixteenth).
            
            Analyze the FIRST 4 measures only if the image is long.
        `;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            generationConfig: { 
                response_mime_type: "application/json",
                maxOutputTokens: 2000 // On limite pour éviter le timeout
            }
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

        return new Promise((resolve, reject) => {
            const req = https.request(options, (googleRes) => {
                let responseBody = '';
                googleRes.on('data', (chunk) => { responseBody += chunk; });
                googleRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseBody);
                        if (parsed.error) {
                            resolve({ statusCode: 500, body: JSON.stringify({ error: parsed.error.message }) });
                        } else if (parsed.candidates && parsed.candidates[0].content) {
                            const text = parsed.candidates[0].content.parts[0].text;
                            resolve({ statusCode: 200, body: JSON.stringify({ musicData: JSON.parse(text) }) });
                        } else {
                            resolve({ statusCode: 500, body: JSON.stringify({ error: "L'IA n'a rien vu." }) });
                        }
                    } catch (e) {
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur lecture JSON Google" }) });
                    }
                });
            });
            req.on('error', (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }));
            req.write(JSON.stringify(requestBody));
            req.end();
        });

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Vercel: ' + error.message });
    }
}
