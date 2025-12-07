// api/analyze.js
// VERSION : ASSISTÉE ET STABILISÉE (Le Prompt utilise la donnée utilisateur)

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
        // On récupère le nouveau paramètre 'meter'
        const { image, mimeType, meter } = req.body;
        
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // On utilise la signature de temps fournie, ou 4/4 par défaut (pour la sécurité)
        const userMeter = meter || "4/4";

        // Détection du modèle (Pour utiliser le plus rapide : Flash)
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");


        // --- PROMPT FINAL COMPACTÉ ---
        const promptText = `
            Transcribe the attached sheet music image into valid ABC Notation.

            ***INSTRUCTION CRITIQUE***: The user has explicitly set the Time Signature. You MUST use M:${userMeter} in the header.

            STRICT RHYTHM MAPPING: Use these rules based on visual note shapes to determine duration:
            - Half Note (Blanche / Hollow Head): Add '2' (e.g., C2).
            - Quarter Note (Noire / Solid Head): Write the note letter only (e.g., C).
            - Eighth Note (Croche / Flag or Beam): Add '/2' (e.g., C/2).
            - Dotted Notes: Use '3/2' or '3'.

            STRICT HEADERS:
            - You MUST include K: (Key Signature).
            - You MUST use the provided Time Signature: M:${userMeter}.
            - The sum of note durations in each bar MUST mathematically equal the measure M:${userMeter}.

            OUTPUT FORMAT: Return ONLY the ABC code starting with X:1. No markdown, no explanations.
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
            // Sécurité: Si l'IA n'a pas mis le bon M:, on le corrige de force avant de renvoyer le code.
            let fixedAbcCode = abcCode.replace(/^M:(.*)$/m, `M:${userMeter}`);
            return res.status(200).json({ abc: fixedAbcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de code ABC." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
