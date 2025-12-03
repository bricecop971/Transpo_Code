// api/analyze.js
// VERSION : SCANNER ULTIME (Liste et Choix Automatique)

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

        // --- ÉTAPE 1 : ON DEMANDE LA LISTE DES MODÈLES DISPONIBLES ---
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) {
            return res.status(500).json({ error: "Impossible de lister les modèles : " + listData.error.message });
        }

        // --- ÉTAPE 2 : ON FILTRE ---
        const allModels = listData.models || [];
        
        // On cherche les modèles qui acceptent "generateContent" (pour créer du texte)
        // ET qui ne sont PAS le "2.0" (car quota épuisé)
        // ET qui ne sont PAS "gemini-pro" tout court (car il ne voit pas les images, c'est du texte seul)
        const validModels = allModels.filter(m => 
            m.supportedGenerationMethods.includes("generateContent") && 
            !m.name.includes("2.0") &&
            !m.name.endsWith("gemini-pro") // Exclure le pro texte-only
        );

        if (validModels.length === 0) {
            // Si aucun modèle n'est trouvé, on affiche tout ce qu'on a pour comprendre
            const names = allModels.map(m => m.name).join(", ");
            return res.status(500).json({ error: `Aucun modèle compatible trouvé. Modèles dispos pour cette clé : ${names}` });
        }

        // --- ÉTAPE 3 : ON CHOISIT LE MEILLEUR ---
        // On préfère Flash, sinon Pro, sinon Vision, sinon le premier qui vient.
        let chosenModel = validModels.find(m => m.name.includes("flash"));
        if (!chosenModel) chosenModel = validModels.find(m => m.name.includes("1.5-pro"));
        if (!chosenModel) chosenModel = validModels.find(m => m.name.includes("vision"));
        if (!chosenModel) chosenModel = validModels[0];

        // On nettoie le nom (ex: "models/gemini-1.5-flash" -> "gemini-1.5-flash")
        const modelName = chosenModel.name.replace("models/", "");

        // --- ÉTAPE 4 : ANALYSE ---
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Transcribe this sheet music to ABC Notation. Output ONLY the music code starting with X:1. Include rhythm (L:1/4 default) and accidentals." },
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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            // Si ça plante, on affiche le modèle utilisé pour savoir lequel a échoué
            return res.status(500).json({ error: `Erreur (${modelName}) : ` + data.error.message });
        }
        
        if (data.candidates && data.candidates[0].content) {
            const notes = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ abc: notes.replace(/```abc/gi, "").replace(/```/g, "").trim() });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de notes." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
