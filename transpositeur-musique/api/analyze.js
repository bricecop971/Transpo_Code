// api/analyze.js
// VERSION : EXTRACTION ABC COMPLÈTE (RYTHME & TONALITÉ)

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Clé API manquante sur Vercel' });
    }

    try {
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // LISTE DES MODÈLES (On cible la série 1.5 Flash ou Pro qui sont bons en OCR)
        const MODELS_TO_TRY = [
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-1.5-flash-001",
            "gemini-1.5-flash-002"
        ];

        // CONSIGNE EXPERTE : On demande une transcription ABC stricte
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Transcribe this sheet music into valid ABC Notation. Capture precisely: 1. The Key Signature (K:), 2. The Time Signature (M:), 3. The Note Durations (rhythm), 4. The Beaming and Bar lines. Do NOT simplify. Output ONLY the ABC code block starting with X:1. Do not add explanations." },
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

        let lastError = "";

        // BOUCLE DE TENTATIVES SUR LES MODÈLES
        for (const model of MODELS_TO_TRY) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (data.error) {
                    console.warn(`Échec ${model}: ${data.error.message}`);
                    lastError = data.error.message;
                    continue; 
                }

                if (data.candidates && data.candidates[0].content) {
                    // On nettoie la réponse pour n'avoir que le code ABC
                    let abcCode = data.candidates[0].content.parts[0].text;
                    // Petit nettoyage si l'IA ajoute des ```abc ... ```
                    abcCode = abcCode.replace(/```abc/g, "").replace(/```/g, "").trim();
                    
                    return res.status(200).json({ abc: abcCode, modelUsed: model });
                }

            } catch (error) {
                console.error(`Crash ${model}`, error);
                lastError = error.message;
            }
        }

        return res.status(500).json({ error: "Échec analyse : " + lastError });

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
