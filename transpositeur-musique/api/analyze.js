// api/analyze.js
// VERSION : EXPERT RYTHME & STRUCTURE

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

        const requestBody = {
            contents: [{
                parts: [
                    { text: `
                        Act as a professional music transcriber. Convert this sheet music to ABC Notation.
                        
                        CRITICAL RULES FOR RHYTHM:
                        1. Identify the Time Signature (e.g. M:4/4).
                        2. You MUST ensure that the sum of note durations in every bar matches the Time Signature exactly. 
                        3. If you see a half note, write it as '2'. If a dotted quarter, '3/2'. Do not guess. Be mathematically precise.
                        4. Detect the Key Signature (K:) accurately (count sharps/flats).

                        OUTPUT FORMAT:
                        Return ONLY the raw ABC code starting with X:1.
                        Do NOT add explanations or markdown blocks.
                    `},
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

        // On utilise le modèle Flash 1.5 (le plus stable pour les quotas actuels)
        // Si besoin, le code peut basculer sur Pro, mais Flash est meilleur en maths rapides
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) return res.status(500).json({ error: "Erreur Google : " + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            let abcCode = data.candidates[0].content.parts[0].text;
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
