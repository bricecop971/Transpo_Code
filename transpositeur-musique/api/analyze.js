// api/analyze.js
// VERSION : INSPIRATION OMR & VÉRIFICATION MATHÉMATIQUE

export const config = {
    api: {
        bodyParser: { sizeLimit: '4mb' },
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé API manquante' });

    try {
        const { image, mimeType, meter } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        const userMeter = meter || "4/4";

        // Détection du modèle (inchangée)
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // --- PROMPT OMR ET MATHÉMATIQUE ---
        const promptText = `
            Agissez comme un Moteur de Reconnaissance Optique Musicale (OMR) qui traduit rigoureusement les symboles en Notation ABC.

            RAPPEL CRITIQUE: La Signature de Temps est M:${userMeter}.

            1. **PRÉ-ANALYSE L: (Unité de Base) :**
               - Déterminez la note la plus courte présente (croche, noire, etc.).
               - Si la note la plus courte est une croche (crochet simple), vous DEVEZ ajouter la ligne L:1/8.
               - Si la note la plus courte est une noire, utilisez L:1/4.
               - Placez la ligne L: juste après T: ou K:.

            2. **TRADUCTION DES VALEURS (L:1/8 FORCÉE PAR EXEMPLE) :**
               - Si L:1/8 est utilisé:
                 - Croche (Eighth Note) = Note (Ex: C)
                 - Noire (Quarter Note) = Note + '2' (Ex: C2)
                 - Blanche (Half Note) = Note + '4' (Ex: C4)

            3. **VÉRIFICATION MATHÉMATIQUE PAR MESURE (OMR CHECK)**:
               - Après avoir généré chaque mesure (entre deux barres '|'), vérifiez que la somme des durées correspond EXACTEMENT à M:${userMeter}, en utilisant l'unité L: que vous avez choisie. Si ce n'est pas le cas, ajustez la durée de la dernière note de la mesure.

            4. **FIDÉLITÉ VISUELLE (BEAMING/TONALITÉ)**:
               - K: (Tonalité) : Comptez les altérations à la clé pour être exact.
               - Ligatures : Collez les notes (Ex: C/2D/2) quand elles sont liées visuellement.

            OUTPUT:
            Retournez UNIQUEMENT le code ABC valide, commençant par X:1.
        `;

        const requestBody = {
            contents: [{
                parts: [
                    { text: promptText },
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

        if (data.error) return res.status(500).json({ error: `Erreur Google : ` + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            let abcCode = data.candidates[0].content.parts[0].text;
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            // On force le M: choisi par l'utilisateur
            abcCode = abcCode.replace(/^M:.*$/m, `M:${userMeter}`);
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de code ABC." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
