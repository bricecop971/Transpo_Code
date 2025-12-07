// api/analyze.js
// VERSION : SÉCURITÉ RYTHMIQUE MAXIMALE

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

        // Détection du modèle (Flash est préféré pour la vitesse)
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // --- PROMPT MATHÉMATIQUE RENFORCÉ ---
        const promptText = `
            Agissez comme un Moteur de Transcription Musicale strict.

            RAPPEL CRITIQUE: La Signature de Temps est M:${userMeter}. Le total des durées entre chaque barre verticale (|) DOIT être égal à cette valeur.

            TÂCHE: Transcrivez les hauteurs de notes et les rythmes en Notation ABC.

            RÈGLES DE TRADUCTION RYTHMIQUE (STRICTES):
            1. **Noire (Quarter Note / Tête Pleine SANS crochet):** Note seulement (Ex: C). Durée = 1/4.
            2. **Blanche (Half Note / Tête Creuse):** Note + '2' (Ex: C2). Durée = 2/4.
            3. **Croche (Eighth Note / Un seul crochet ou une seule ligature):** Note + '/2' (Ex: C/2). Durée = 1/8.
            4. **Ronde (Whole Note):** Note + '4' (Ex: C4). Durée = 4/4.
            5. **Notes Pointées:** Utiliser un '3' suivi de la durée (Ex: C3/2 pour une noire pointée, C/2 pour une croche pointée).
            6. **Barres de Mesure (|):** Utilisez-les rigoureusement pour séparer chaque mesure, vérifiant que la somme des durées est correcte (égale à M:${userMeter}).

            CONTRAINTE EXTRÊME: N'utilisez JAMAIS de double-croches (notation /4 ou //) sauf si vous êtes certain à 100% que la note a DEUX crochets. En cas de doute, utilisez TOUJOURS la notation de la Croche simple (/2).

            SORTIE:
            Retournez UNIQUEMENT le code ABC valide, commençant par X:1.
            Incluez K: (Tonalité détectée) et M:${userMeter} (Mesure forcée).
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
            // Double sécurité: on force le M: dans le code retourné
            abcCode = abcCode.replace(/^M:.*$/m, `M:${userMeter}`);
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de code ABC." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
