// api/analyze.js
// TEST DE CONNEXION SIMPLE

const https = require('https');

export default async function handler(req, res) {
    const apiKey = process.env.GEMINI_API_KEY;

    // DIAGNOSTIC 1 : Clé présente ?
    if (!apiKey) {
        return res.status(500).json({ error: "ERREUR FATALE: La clé API n'est pas configurée dans Vercel." });
    }

    const modelName = "gemini-1.5-flash";
    const requestBody = {
        contents: [{
            parts: [{ text: "Reponds juste par ce mot : 'CONNEXION_OK'" }]
        }]
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
                    // DIAGNOSTIC 2 : Erreur Google ?
                    if (parsed.error) {
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur Google: " + parsed.error.message }) });
                    } else {
                        // SUCCÈS
                        const text = parsed.candidates[0].content.parts[0].text;
                        resolve({ statusCode: 200, body: JSON.stringify({ message: text.trim() }) });
                    }
                } catch (e) {
                    resolve({ statusCode: 500, body: JSON.stringify({ error: "Réponse illisible: " + responseBody }) });
                }
            });
        });
        
        req.on('error', (e) => {
            resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur Réseau Vercel: " + e.message }) });
        });
        
        req.write(JSON.stringify(requestBody));
        req.end();
    });
}
