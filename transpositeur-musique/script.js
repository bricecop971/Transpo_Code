// SCRIPT.JS - MODE DIAGNOSTIC AVANCÉ (Vérification Timeout)

const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const inspector = document.getElementById('inspector');
const abcEditor = document.getElementById('abc-editor');
const refreshBtn = document.getElementById('refresh-btn');

// --- OUTILS IMAGE (Fonctions compressImage, convertPdfToImage, getBase64 inchangées) ---
function getBase64(file) {
    return new Promise((r, j) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.onerror = j;
    });
}
async function compressImage(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = Math.min(1024 / bitmap.width, 1);
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.6));
}
async function convertPdfToImage(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
}


// --- FONCTION D'AFFICHAGE (inchangée) ---
function renderABC() {
    const code = abcEditor.value;
    ABCJS.renderAbc("paper", code, {
        responsive: "resize",
        staffwidth: 800
    });
}

// --- CHARGEMENT ET DIAGNOSTIC ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    statusText.innerHTML = `⏳ Analyse en cours... (Max 15 secondes)`;
    inspector.style.display = "none";

    try {
        let file = fileInput.files[0];
        let imgFile;

        // Préparation fichier
        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
        } else {
            imgFile = await compressImage(file);
        }

        const base64 = await getBase64(imgFile);

        // Appel API (avec contrôle de délai)
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        if (!res.ok) {
            // Si la réponse n'est pas 200 OK (ex: 504 Timeout, 500 Erreur Serveur)
            statusText.innerHTML = `❌ Erreur Serveur : Statut ${res.status} (${res.statusText})`;
            const errorBody = await res.text();
            console.error('Réponse brute du serveur (Timeout probable) :', errorBody);
            alert(`Échec de l'analyse. Statut: ${res.status}. Le code d'erreur détaillé est dans la console.`);
            return; 
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS
        abcEditor.value = data.abc || "Erreur: Pas de code ABC reçu.";
        inspector.style.display = "block";
        statusText.innerHTML = `✅ Analyse terminée.`;
        renderABC(); 

    } catch (e) {
        statusText.innerHTML = `❌ Erreur critique : ${e.message}`;
        console.error('Erreur Critique du Client (ou Timeout du Réseau):', e);
        alert(`Une erreur technique est survenue. Ouvrez la console (F12) pour l'erreur détaillée.`);
    }
});

refreshBtn.addEventListener('click', renderABC);
