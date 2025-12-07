// SCRIPT.JS - MODE INSPECTION

const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const inspector = document.getElementById('inspector');
const abcEditor = document.getElementById('abc-editor');
const refreshBtn = document.getElementById('refresh-btn');

// --- OUTILS IMAGE ---
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

// --- FONCTION D'AFFICHAGE ---
function renderABC() {
    const code = abcEditor.value;
    // On dessine simplement ce qu'il y a dans la zone de texte
    ABCJS.renderAbc("paper", code, {
        responsive: "resize",
        staffwidth: 800
    });
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    statusText.innerHTML = `⏳ Analyse de l'image en cours...`;
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

        // Appel API
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS : On affiche le code brut
        abcEditor.value = data.abc || "Erreur: Pas de code ABC reçu.";
        
        inspector.style.display = "block";
        statusText.innerHTML = `✅ Analyse terminée. Vérifiez le résultat ci-dessous.`;
        
        renderABC(); // Premier dessin

    } catch (e) {
        statusText.innerHTML = `❌ Erreur : ${e.message}`;
        console.error(e);
    }
});

// Bouton pour redessiner si l'utilisateur corrige le code
refreshBtn.addEventListener('click', renderABC);
