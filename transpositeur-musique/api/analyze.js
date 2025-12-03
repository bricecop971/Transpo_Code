// api/analyze.js
// VERSION "TERMINATOR" (Essaye tous les modèles jusqu'à ce que ça marche)

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

    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

    // LISTE DES MODÈLES À TESTER (Dans l'ordre de préférence)
    // On mélange les versions stables, les versions "latest" et les versions "beta"
    const MODELS_TO_TRY = [
        "gemini-1.5-flash",          // Le standard actuel
        "gemini-1.5-flash-002",      // La mise à jour de Septembre
        "gemini-1.5-flash-001",      // La version originale stable
        "gemini-1.5-flash-8b",       // La version ultra-légère
        "gemini-1.5-pro",            // Le modèle puissant
        "gemini-2.0-flash-exp"       // Le tout dernier (si dispo)
    ];

    const requestBody = {
        contents: [{
            parts: [
                { text: "Analyze this sheet music. Output ONLY the note names in English (C D E...) separated by spaces. Ignore title/clefs. If unsure, guess." },
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

    let lastError = "Aucun modèle n'a fonctionné.";

    // BOUCLE DE TENTATIVES
    for (const model of MODELS_TO_TRY) {
        try {
            console.log(`Tentative avec le modèle : ${model}`);
            
            // On tente avec v1beta qui est le plus compatible pour ces modèles
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            // Si erreur Google (ex: Not Found, Quota...), on passe au suivant
            if (data.error) {
                console.warn(`Échec avec ${model} : ${data.error.message}`);
                lastError = `Erreur (${model}) : ${data.error.message}`;
                continue; // On passe à l'itération suivante de la boucle
            }

            // Si ça marche !
            if (data.candidates && data.candidates[0].content) {
                const notes = data.candidates[0].content.parts[0].text;
                return res.status(200).json({ notes: notes, modelUsed: model }); // Succès ! On arrête tout et on répond.
            }

        } catch (error) {
            console.error(`Crash avec ${model}`);
            lastError = error.message;
        }
    }

    // Si on arrive ici, c'est que TOUS les modèles ont échoué
    return res.status(500).json({ error: "Tous les modèles ont échoué. Dernière erreur : " + lastError });
}
