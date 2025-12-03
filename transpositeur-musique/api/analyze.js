// api/analyze.js
// VERSION : SCANNER AUTOMATIQUE + EXPERT RYTHME

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

        // --- 1. SCAN DES MODÈLES DISPONIBLES ---
        // On demande la liste à Google pour ne plus jamais avoir d'erreur "Not Found"
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResp = await fetch(listUrl);
        const listData = await listResp.json();

        if (listData.error) {
            return res.status(500).json({ error: "Impossible de lister les modèles : " + listData.error.message });
        }

        // --- 2. SÉLECTION INTELLIGENTE ---
        const allModels = listData.models || [];
        
        // On cherche un modèle qui voit les images ("generateContent") et qui n'est pas le 2.0 (quota)
        const candidates = allModels.filter(m => 
            m.supportedGenerationMethods.includes("generateContent") && 
            !m.name.includes("2.0") 
        );

        // Priorité : Flash > Pro > Vision
        let chosenModel = candidates.find(m => m.name.includes("flash"));
        if (!chosenModel) chosenModel = candidates.find(m => m.name.includes("pro"));
        if (!chosenModel) chosenModel = candidates[0]; // Le premier qui vient

        if (!chosenModel) {
            return res.status(500).json({ error: "Aucun modèle compatible trouvé pour cette clé." });
        }

        // On nettoie le nom (ex: "models/gemini-1.5-flash" -> "gemini-1.5-flash")
        const modelName = chosenModel.name.replace("models/", "");

        // --- 3. CONSIGNE EXPERTE (RYTHME & STRUCTURE) ---
        const requestBody = {
            contents: [{
                parts: [
                    { text: `
                        Transcribe this sheet music into valid ABC Notation.
                        
                        RULES:
                        1. HEADER: You MUST detect 'M:' (Time Signature), 'L:' (Unit Note Length), and 'K:' (Key Signature).
                        2. RHYTHM: Ensure note durations match the time signature perfectly. If the time is 4/4, the sum of notes in a bar MUST be 4 beats. Use '2' for half notes, '4' for whole notes, etc.
                        3. PITCH: Transcribe notes accurately with octaves.
                        
                        OUTPUT:
                        Return ONLY the ABC code block starting with X:1. No text before or after.
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
            let abcCode = data.candidates[0].content.parts[0].text;
            // Nettoyage
            abcCode = abcCode.replace(/```abc/gi, "").replace(/```/g, "").trim();
            return res.status(200).json({ abc: abcCode });
        } else {
            return res.status(500).json({ error: "L'IA n'a pas trouvé de partition." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
