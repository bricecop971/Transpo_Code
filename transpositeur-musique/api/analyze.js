// api/analyze.js
// VERSION AUTO-PILOTE (Détection automatique du modèle valide)

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

        // --- ÉTAPE 1 : ON RÉCUPÈRE LA LISTE OFFICIELLE DES MODÈLES ---
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) {
            return res.status(500).json({ error: "Impossible de lister les modèles : " + listData.error.message });
        }

        // --- ÉTAPE 2 : ON CHOISIT LE BON MODÈLE DANS LA LISTE ---
        // On cherche un modèle qui :
        // 1. Supporte "generateContent" (pour analyser)
        // 2. Contient "flash" (pour la vitesse et le quota gratuit)
        // 3. N'est PAS le "2.0" (car ton quota est épuisé dessus)
        
        const models = listData.models || [];
        
        // On cherche le meilleur candidat
        let chosenModel = models.find(m => 
            m.supportedGenerationMethods.includes("generateContent") && 
            m.name.includes("flash") && 
            !m.name.includes("2.0") // On évite celui qui est bloqué
        );

        // Si on ne trouve pas de Flash 1.5, on cherche un "Pro" (1.5 ou 1.0)
        if (!chosenModel) {
            chosenModel = models.find(m => 
                m.supportedGenerationMethods.includes("generateContent") && 
                m.name.includes("pro") &&
                !m.name.includes("2.0")
            );
        }

        if (!chosenModel) {
             // Secours ultime : on prend le premier qui marche
             chosenModel = models.find(m => m.supportedGenerationMethods.includes("generateContent"));
        }

        if (!chosenModel) {
            return res.status(500).json({ error: "Aucun modèle IA disponible pour cette clé." });
        }

        // On nettoie le nom (ex: "models/gemini-1.5-flash-001" -> "gemini-1.5-flash-001")
        const modelName = chosenModel.name.replace("models/", "");

        // --- ÉTAPE 3 : ANALYSE ---
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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: `Erreur (${modelName}) : ` + data.error.message });
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
