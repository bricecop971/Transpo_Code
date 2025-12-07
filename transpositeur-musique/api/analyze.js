// api/analyze.js
// VERSION : EXPERT DU COURS (PROMPT RIGOUREUX)

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

        // 1. DÉTECTION AUTOMATIQUE DU MODÈLE DISPONIBLE
        // On reprend le scanner qui a bien marché pour toi, car c'est le plus sûr
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        
        const models = listData.models || [];
        // On cherche un modèle Flash ou Pro (hors 2.0 exp qui est limité)
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // 2. LE PROMPT "COURANT D'INGÉNIEUR"
        // Inspiré de ton cours : on définit le contexte, la tâche, et les contraintes strictes.
        const promptText = `
            CONTEXT: You are an expert music engraver and transcriber. Your task is to convert sheet music images into precise ABC Notation.

            TASK: Transcribe the attached sheet music image into valid ABC code.

            CRITICAL RULES (MUST FOLLOW):
            1. **Key Signature (K:)**: Look at the start of the staff. Count the sharps (#) or flats (b) exactly. 
               - 1 Sharp = K:G
               - 2 Sharps = K:D
               - 1 Flat = K:F
               - No sharps/flats = K:C
               Do not guess. Count them.

            2. **Time Signature (M:)**: Identify the meter (e.g., 4/4, 3/4, 6/8, C).

            3. **Rhythm & Duration (L:1/4)**: 
               - The default length is a quarter note (1.0).
               - A half note (blanche) MUST be written as '2' (e.g., C2).
               - A dotted half note MUST be '3' (e.g., C3).
               - A whole note (ronde) MUST be '4' (e.g., C4).
               - An eighth note (croche) MUST be '/2' (e.g., C/2).
               - A dotted quarter note MUST be '3/2' (e.g., C3/2).
               - **VERIFICATION**: The sum of durations in each bar MUST equal the time signature (e.g., in 4/4, sum must be 4).

            4. **Beaming**: Group notes as they appear (e.g., C/2D/2E/2F/2).

            OUTPUT FORMAT:
            Return ONLY the ABC code block starting with X:1. No markdown, no explanations.
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

        if (data.error) return res.status(500).json({ error: `Erreur Google (${modelName}) : ` + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            let abcCode = data.candidates[0].content.parts[0].text;
            // Nettoyage agressif du markdown pour ne garder que le code ABC
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
