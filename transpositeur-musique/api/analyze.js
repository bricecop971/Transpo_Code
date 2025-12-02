// api/analyze.js
// VERSION FINALE POUR VERCEL

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb', // On laisse passer les images
        },
    },
};

export default async function handler(req, res) {
    // 1. On vérifie que le site envoie bien des données (POST)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Clé API manquante dans les réglages Vercel' });
    }

    try {
        const { image, mimeType } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'Aucune image reçue' });
        }

        // 2. CONSIGNE POUR L'IA
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Analyze this sheet music. Identify the musical notes. Output ONLY the note names in English (C D E...) separated by spaces. Ignore title/clefs. If unsure, guess." },
                    { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
                ]
            }],
            // On désactive les sécurités pour éviter les blocages sur les partitions
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        // 3. ENVOI À GOOGLE (Modèle confirmé : gemini-1.5-flash)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // 4. GESTION DE LA RÉPONSE
        if (data.error) {
            return res.status(500).json({ error: "Erreur Google : " + data.error.message });
        }
        
        if (data.candidates && data.candidates[0].content) {
            const notes = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ notes: notes });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de notes." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur Vercel : ' + error.message });
    }
}
