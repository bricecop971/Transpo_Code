// api/analyze.js
// VERSION : SÉCURITÉ DOUBLE (Flash -> Pro)

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

        // ON DÉFINIT NOS DEUX CHAMPIONS
        // 1. Le standard rapide (Priorité)
        // 2. Le standard puissant (Secours)
        const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro"];
        
        let lastError = "";

        // CONSIGNE POUR AVOIR LE FORMAT ABC (RYTHME)
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Transcribe this sheet music to ABC Notation. Output ONLY the music code starting with X:1. Include rhythm (L:1/4 default) and accidentals. Ignore lyrics and text." },
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

        // BOUCLE DE TENTATIVE
        for (const model of modelsToTry) {
            try {
                console.log(`Tentative avec ${model}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                // On ajoute un timeout de 15 secondes pour ne pas bloquer Vercel
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const data = await response.json();

                if (data.error) {
                    console.warn(`Erreur sur ${model}: ${data.error.message}`);
                    lastError = data.error.message;
                    continue; // On passe au modèle suivant (Pro)
                }

                if (data.candidates && data.candidates[0].content) {
                    let abcCode = data.candidates[0].content.parts[0].text;
                    // Nettoyage
                    abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
                    return res.status(200).json({ abc: abcCode, modelUsed: model });
                }

            } catch (err) {
                console.error(`Crash sur ${model}: ${err.message}`);
                lastError = err.message;
            }
        }

        // Si on est ici, c'est que Flash ET Pro ont échoué
        return res.status(500).json({ error: "Échec Google : " + lastError });

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
