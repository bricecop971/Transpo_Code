// api/analyze.js
// VERSION INTELLIGENTE (AUTO-SÉLECTION DU MODÈLE)

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

export default async function handler(req, res) {
    // 1. Vérification POST
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

        // --- ÉTAPE 1 : ON DEMANDE LA LISTE DES MODÈLES DISPONIBLES ---
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) {
            return res.status(500).json({ error: "Impossible de lister les modèles : " + listData.error.message });
        }

        // --- ÉTAPE 2 : ON CHOISIT LE MEILLEUR MODÈLE ---
        // On cherche dans l'ordre de préférence : 1.5 Flash, puis 1.5 Pro, puis l'ancien Pro Vision
        // On vérifie que le modèle supporte bien "generateContent"
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("gemini-1.5-flash") && m.supportedGenerationMethods.includes("generateContent"));
        
        if (!chosenModel) {
            chosenModel = models.find(m => m.name.includes("gemini-1.5-pro") && m.supportedGenerationMethods.includes("generateContent"));
        }
        
        if (!chosenModel) {
            chosenModel = models.find(m => m.name.includes("gemini-pro-vision") && m.supportedGenerationMethods.includes("generateContent"));
        }

        if (!chosenModel) {
             // Cas désespéré : on prend n'importe quel Gemini qui n'est pas juste "gemini-pro" (qui est texte seul)
             chosenModel = models.find(m => m.name.includes("gemini") && !m.name.endsWith("gemini-pro") && m.supportedGenerationMethods.includes("generateContent"));
        }

        if (!chosenModel) {
            return res.status(500).json({ error: "Aucun modèle de vision (Image) n'est disponible pour cette clé API." });
        }

        // On a trouvé le gagnant ! (ex: "models/gemini-1.5-flash-001")
        const modelName = chosenModel.name.replace("models/", ""); // On nettoie le nom si besoin
        
        // --- ÉTAPE 3 : ON ANALYSE L'IMAGE AVEC CE MODÈLE ---
        const requestBody = {
            contents: [{
                parts: [
                    { text: "Analyze this sheet music. Identify the musical notes. Output ONLY the note names in English (C D E...) separated by spaces. Ignore title/clefs. If unsure, guess." },
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

        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(generateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: `Erreur Google (${modelName}) : ` + data.error.message });
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
