// api/analyze.js
// VERSION : FIDÉLITÉ VISUELLE (LIGATURES) & HARMONIQUE

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

        // Détection du modèle
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();
        const models = listData.models || [];
        
        let chosenModel = models.find(m => m.name.includes("flash") && !m.name.includes("2.0") && m.supportedGenerationMethods.includes("generateContent"));
        if (!chosenModel) chosenModel = models.find(m => m.name.includes("pro") && !m.name.includes("2.0"));
        if (!chosenModel) chosenModel = models[0];

        const modelName = chosenModel.name.replace("models/", "");

        // --- PROMPT FIDÉLITÉ TOTALE ---
        const promptText = `
            Act as an expert Music Engraver. Transcribe this sheet music to ABC Notation.

            CONSTRAINT: Use Time Signature M:${userMeter}.

            1. **KEY SIGNATURE (CRITICAL)**: 
               - Look at the very beginning of the first staff. 
               - COUNT the sharps (#) or flats (b).
               - 0 = K:C
               - 1 Sharp = K:G
               - 2 Sharps = K:D
               - 1 Flat = K:F
               - Write the correct K: header based on this count.

            2. **BEAMING & GROUPING (VISUAL STYLE)**:
               - Look at how notes are connected.
               - If notes are connected by a horizontal bar (beam), write them WITHOUT SPACES between them.
                 -> Visual: [🎵-🎵] => ABC: C/2D/2 (Correct)
                 -> Visual: [🎵] [🎵] => ABC: C/2 D/2 (Incorrect if beamed)
               - Replicate the exact visual grouping of the image.

            3. **NOTE VALUES (STRICT)**:
               - Quarter (Noire) = Note (e.g. C)
               - Half (Blanche) = Note + '2' (e.g. C2)
               - Eighth (Croche) = Note + '/2' (e.g. C/2)
               - Dotted Quarter = Note + '3/2' (e.g. C3/2)
               
            4. **BAR LINES**:
               - Insert '|' exactly where they appear in the image.

            OUTPUT:
            Return ONLY the ABC code starting with X:1.
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
