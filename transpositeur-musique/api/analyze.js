// api/analyze.js
// VERSION : GÉNÉRATION 2.5 (LES NOUVEAUX STANDARDS)

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

        // LISTE DES MODÈLES ACTIFS (Fin 2025)
        // On priorise le "Lite" qui est le nouveau standard gratuit/léger
        const MODELS_TO_TRY = [
            "gemini-2.5-flash-lite",     // Le remplaçant officiel du 1.5 Flash
            "gemini-2.5-flash",          // La version standard rapide
            "gemini-2.0-flash-lite-001", // L'ancienne version stable du Lite
            "gemini-2.0-flash-001"       // L'ancienne version stable du Flash
        ];

        const requestBody = {
            contents: [{
                parts: [
                    { text: "Analyze this sheet music. Transcribe it into ABC Notation. Include the note durations (rhythm) and accidentals (^ for sharp, _ for flat). Do not include headers (X:, T:, etc). Just the note sequence. Example: C2 D/2 ^F G" },
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

        // BOUCLE DE TENTATIVES
        for (const model of MODELS_TO_TRY) {
            try {
                // On utilise v1beta qui est requis pour les modèles 2.5
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                // Si erreur (Modèle introuvable ou Quota), on passe au suivant
                if (data.error) {
                    console.warn(`Échec avec ${model} : ${data.error.message}`);
                    lastError = `(${model}) : ${data.error.message}`;
                    
                    // Si c'est une erreur de quota (429), on ne s'acharne pas sur ce modèle précis
                    continue; 
                }

                // SUCCÈS !
                if (data.candidates && data.candidates[0].content) {
                    const notes = data.candidates[0].content.parts[0].text;
                    return res.status(200).json({ notes: notes, modelUsed: model });
                }

            } catch (error) {
                console.error(`Crash avec ${model}`);
                lastError = error.message;
            }
        }

        // Si tout a échoué
        return res.status(500).json({ error: "Échec sur tous les modèles 2.5. Dernière erreur : " + lastError });

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur Vercel : ' + error.message });
    }
}
