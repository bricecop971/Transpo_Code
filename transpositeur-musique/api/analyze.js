const https = require('https');

exports.handler = async function(event, context) {
    // On accepte POST pour faire simple avec ton bouton actuel
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "Clé API manquante" }) };

    // ON DEMANDE LA LISTE DES MODÈLES (GET /models)
    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models?key=${apiKey}`,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(responseBody);
                    
                    if (data.error) {
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur Google: " + data.error.message }) });
                    } else if (data.models) {
                        // ON A LA LISTE ! On filtre ceux qui acceptent "generateContent"
                        const availableModels = data.models
                            .filter(m => m.supportedGenerationMethods.includes("generateContent"))
                            .map(m => m.name) // On garde juste le nom (ex: models/gemini-pro)
                            .join("\n");
                        
                        // On renvoie la liste dans une fausse erreur pour l'afficher à l'écran
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "LISTE DES MODÈLES DISPOS :\n" + availableModels }) });
                    } else {
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "Aucun modèle trouvé." }) });
                    }
                } catch (e) { resolve({ statusCode: 500, body: JSON.stringify({ error: "Réponse illisible" }) }); }
            });
        });
        req.on('error', (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur Co: " + e.message }) }));
        req.end();
    });
};