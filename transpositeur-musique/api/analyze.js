// api/analyze.js
// VERSION : TEST MODERNE (FETCH)

export const config = {
    api: {
        bodyParser: { sizeLimit: '1mb' },
    },
};

export default async function handler(req, res) {
    // 1. Autoriser le test même si on est en GET (pour test navigateur direct)
    // Mais on préfère POST.
    
    const apiKey = process.env.GEMINI_API_KEY;

    // TEST CLÉ
    if (!apiKey) {
        return res.status(500).json({ error: "CLÉ API MANQUANTE dans Vercel." });
    }

    const modelName = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const requestBody = {
        contents: [{
            parts: [{ text: "Reponds juste par le mot: SUCCESS" }]
        }]
    };

    try {
        // ON UTILISE FETCH (Plus fiable que https.request)
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: "Erreur Google: " + data.error.message });
        }

        // Si tout va bien
        return res.status(200).json({ 
            message: "CONNEXION REUSSIE !", 
            ia_response: data.candidates[0].content.parts[0].text 
        });

    } catch (error) {
        return res.status(500).json({ error: "Crash Serveur: " + error.message });
    }
}
