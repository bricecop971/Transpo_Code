// api/analyze.js
// VERSION : GÉNÉRATEUR MUSICXML (ROBUSTE)

const https = require('https');

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
    // On augmente le temps max d'exécution pour laisser l'IA écrire le XML
    maxDuration: 60, 
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

    try {
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // 1. Détection du modèle (Flash est requis pour la vitesse, Pro est mieux pour la vision)
        // On essaie de privilégier Flash pour éviter le Timeout Vercel, car XML est long à écrire
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        
        const models = listData.models || [];
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models[0]; // Fallback

        const modelName = chosenModel.name.replace("models/", "");

        // 2. Prompt MusicXML Strict
        const promptText = `
            Act as a professional MusicXML software. 
            Transcribe the attached sheet music image into a valid MusicXML 3.1 file.

            CRITICAL RULES:
            1. **Whole File**: Return the COMPLETE XML structure starting with <?xml ...> and <score-partwise>.
            2. **Measures**: Create a <measure> tag for every bar line in the image.
            3. **Notes**: 
               - Identify Pitch (Step/Octave) accurately.
               - Identify Duration/Type (quarter, half, eighth) accurately.
               - If you see a rest, use <rest/>.
            4. **Attributes**:
               - Set <divisions>4</divisions> at the start (Standard resolution).
               - Detect Key Signature (<fifths>) and Time Signature (<beats>/<beat-type>).
            
            Do not include markdown (\`\`\`xml). Just raw XML code.
        `;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            generationConfig: { 
                // On ne force pas JSON ici, on veut du texte XML brut
                temperature: 0.2 // Très faible créativité pour respecter la syntaxe
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
                        const parsedData = JSON.parse(responseBody);
                        
                        if (parsedData.error) {
                            resolve({ statusCode: 500, body: JSON.stringify({ error: "Google Error: " + parsedData.error.message }) });
                        } 
                        else if (parsedData.candidates && parsedData.candidates[0].content) {
                            let xmlText = parsedData.candidates[0].content.parts[0].text;
                            
                            // Nettoyage du Markdown si l'IA en met
                            xmlText = xmlText.replace(/```xml/g, '').replace(/```/g, '').trim();

                            // On renvoie le XML
                            resolve({ statusCode: 200, body: JSON.stringify({ musicXml: xmlText }) });
                        } else {
                            resolve({ statusCode: 500, body: JSON.stringify({ error: "L'IA n'a rien généré." }) });
                        }
                    } catch (e) { 
                        resolve({ statusCode: 500, body: JSON.stringify({ error: "Réponse invalide." }) }); 
                    }
                });
            });
            req.on('error', (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: "Erreur Co: " + e.message }) }));
            req.write(JSON.stringify(requestBody));
            req.end();
        });

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
