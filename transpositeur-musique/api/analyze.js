// api/analyze.js
// VERSION : APPROCHE KLANG.IO (EXTRACTION VISUELLE STRICTE)

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
        const { image, mimeType } = req.body;
        if (!image) return res.status(400).json({ error: 'Aucune image reçue' });

        // On utilise Flash 1.5 pour sa rapidité de traitement visuel
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        // --- PROMPT "COMPUTER VISION" ---
        // On ne demande pas de la musique, mais une description technique visuelle.
        const promptText = `
            Act as an Optical Music Recognition (OMR) engine. 
            Do not "interpret" the music. Just "detect" the symbols visually.

            TASK: Extract structured data about every note note-by-note.

            RETURN JSON ONLY with this specific structure:
            {
                "attributes": {
                    "keySignature": "G",  // Count sharps/flats visually. 1 sharp = G.
                    "timeSignature": "2/4" // Read the numbers at the start.
                },
                "notes": [
                    {
                        "pitch": "G",       // The letter name (A-G)
                        "octave": 4,        // 4 is middle, 5 is high
                        "visualType": "quarter" // CRITICAL: Identify by SHAPE.
                                                // "quarter" = Solid head, no flag.
                                                // "half" = Hollow head, stem.
                                                // "eighth" = Solid head, 1 flag or 1 beam.
                                                // "whole" = Hollow head, no stem.
                    },
                    ...
                ]
            }

            VISUAL RULES FOR "visualType":
            - IF Note Head is HOLLOW -> It is "half" (or "whole" if no stem).
            - IF Note Head is SOLID -> Check the stem.
                 - No flag/beam? -> "quarter"
                 - 1 flag/beam? -> "eighth"
            - IGNORE musical context. Trust your eyes. If it looks like a half note, it is a half note.
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
            ],
            // On force le mode JSON natif de Gemini (nouveauté puissante)
            generationConfig: {
                response_mime_type: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) return res.status(500).json({ error: `Erreur Google : ` + data.error.message });
        
        if (data.candidates && data.candidates[0].content) {
            const jsonText = data.candidates[0].content.parts[0].text;
            // Pas besoin de regex complexe, Gemini renvoie du JSON pur grâce à generationConfig
            const musicData = JSON.parse(jsonText);
            return res.status(200).json({ musicData: musicData });
        } else {
            return res.status(500).json({ error: "L'IA n'a rien vu." });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Erreur Serveur : ' + error.message });
    }
}
