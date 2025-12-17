// api/analyze.js
// VERSION : AUTO-DÉTECTION DU MODÈLE (AUTO-PILOTE)

export const config = {
    api: {
        bodyParser: { sizeLimit: '1mb' },
    },
};

export default async function handler(req, res) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: "CLÉ API MANQUANTE dans Vercel." });
    }

    try {
        // ÉTAPE 1 : DEMANDER LA LISTE DES MODÈLES DISPONIBLES
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) {
            return res.status(500).json({ error: "Erreur lors du listage des modèles : " + listData.error.message });
        }

        // On cherche un modèle qui contient "flash" (rapide) ou "pro"
        // et qui supporte la méthode "generateContent"
        const models = listData.models || [];
        
        let chosenModel = models.find(m => 
            m.name.includes("flash") && 
            m.supportedGenerationMethods.includes("generateContent")
        );

        // Si pas de flash, on cherche un pro
        if (!chosenModel) {
            chosenModel = models.find(m => 
                m.name.includes("pro") && 
                m.supportedGenerationMethods.includes("generateContent")
            );
        }

        // Si toujours rien, on prend le premier qui supporte la génération
        if (!chosenModel) {
            chosenModel = models.find(m => m.supportedGenerationMethods.includes("generateContent"));
        }

        if (!chosenModel) {
            return res.status(500).json({ error: "Aucun modèle compatible trouvé pour cette clé API." });
        }

        // Le nom arrive sous la forme "models/gemini-1.5-flash-001", on garde tel quel ou on nettoie si besoin
        // L'API attend souvent juste le nom sans "models/" dans l'URL suivante
        const modelName = chosenModel.name.replace("models/", "");

        // ÉTAPE 2 : TESTER CE MODÈLE
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{
                parts: [{ text: "Reponds juste par le mot: SUCCESS (Modèle utilisé: " + modelName + ")" }]
            }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: `Erreur avec le modèle ${modelName}: ` + data.error.message });
        }

        // SUCCÈS
        return res.status(200).json({ 
            message: "CONNEXION REUSSIE !", 
            ia_response: data.candidates[0].content.parts[0].text 
        });

    } catch (error) {
        return res.status(500).json({ error: "Crash Serveur: " + error.message });
    }
}
