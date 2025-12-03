// SCRIPT.JS - VERSION INSPECTEUR

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const editorZone = document.getElementById('editor-zone');
const abcEditor = document.getElementById('abc-editor');

// --- OUTILS ---
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
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
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

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    // UI
    uploadText.innerHTML = `<strong>Analyse IA...</strong><br>Recherche des erreurs 🔎`;
    uploadZone.style.borderColor = "#00e5ff";

    try {
        let file = fileInput.files[0];
        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            file = new File([blob], "temp.jpg");
            uploadZone.style.backgroundImage = "none";
            uploadZone.style.backgroundColor = "rgba(0,229,255,0.1)";
        } else {
            file = await compressImage(file);
            const reader = new FileReader();
            reader.onload = e => {
                uploadZone.style.backgroundImage = `url(${e.target.result})`;
                uploadZone.style.backgroundSize = "contain";
                uploadZone.style.backgroundRepeat = "no-repeat";
                uploadZone.style.backgroundPosition = "center";
            };
            reader.readAsDataURL(file);
        }

        const base64 = await getBase64(file);
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS : On affiche le code dans l'éditeur
        abcEditor.value = data.abc;
        
        // On affiche la zone d'édition
        editorZone.style.display = "block";
        
        uploadText.innerHTML = `<strong>Terminé !</strong><br>Vérifiez le code ci-dessous.`;
        uploadZone.style.borderColor = "#00ff00";

    } catch (e) {
        uploadText.innerHTML = `Erreur : ${e.message}`;
        uploadZone.style.borderColor = "red";
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    let abcCode = abcEditor.value; // On prend ce qu'Il y a dans la zone de texte (modifié ou pas)
    
    if (!abcCode) { alert("Pas de partition !"); return; }

    const keySelect = document.getElementById('transposition');
    const instrumentKey = keySelect.value;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    // Rendu
    const visualObj = ABCJS.renderAbc("paper", abcCode, {
        responsive: "resize",
        visualTranspose: visualTranspose, // Transposition visuelle automatique
        staffwidth: 800
    });

    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj[0] }).then(() => synth.setTune(visualObj[0], false));
    }
    
    resultZone.style.display = "block";
    resultZone.scrollIntoView({behavior: "smooth"});
});
