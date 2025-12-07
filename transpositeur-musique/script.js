// SCRIPT.JS - FLUX SÉQUENTIEL (Config avant Analyse)

const fileInput = document.getElementById('file-input');
const configZone = document.getElementById('config-zone');
const uploadText = document.getElementById('upload-text');
const startAnalysisBtn = document.getElementById('start-analysis-btn');
const userMeterSelect = document.getElementById('user-meter');
const resultZone = document.getElementById('result-zone');

// Champs résultats
const abcEditor = document.getElementById('abc-editor');
const metaTitle = document.getElementById('meta-title');
const metaKey = document.getElementById('meta-key');
const metaMeter = document.getElementById('meta-meter');
const transposeBtn = document.getElementById('transpose-btn');

let currentFileBase64 = null;
let currentFileType = null;

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

// 1. ÉTAPE 1 : FICHIER SÉLECTIONNÉ
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    uploadText.innerHTML = "⏳ Préparation du fichier...";
    const file = fileInput.files[0];

    try {
        let imgFile;
        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
        } else {
            imgFile = await compressImage(file);
        }

        currentFileBase64 = await getBase64(imgFile);
        currentFileType = 'image/jpeg';

        // On cache l'upload et on montre la config
        document.querySelector('.upload-zone').style.display = 'none';
        configZone.style.display = 'block';

    } catch (e) {
        alert("Erreur fichier : " + e.message);
        window.location.reload();
    }
});

// 2. ÉTAPE 2 : LANCEMENT ANALYSE
startAnalysisBtn.addEventListener('click', async function() {
    const selectedMeter = userMeterSelect.value;
    
    startAnalysisBtn.disabled = true;
    startAnalysisBtn.innerHTML = "🧠 L'IA travaille... (Calcul mathématique)";

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: currentFileBase64, 
                mimeType: currentFileType,
                meter: selectedMeter // On envoie le choix utilisateur
            })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS
        configZone.style.display = 'none';
        resultZone.style.display = 'block';
        
        // Remplissage
        abcEditor.value = data.abc;
        parseABC(data.abc); // Met à jour les cases titre/clé
        renderABC(data.abc); // Dessine le résultat initial

    } catch (e) {
        alert("Erreur IA : " + e.message);
        startAnalysisBtn.disabled = false;
        startAnalysisBtn.innerHTML = "Réessayer";
    }
});

// --- PARSING ET RENDU ---
function parseABC(abcCode) {
    const T = abcCode.match(/^T:(.*)$/m);
    const K = abcCode.match(/^K:(.*)$/m);
    
    metaTitle.value = T ? T[1].trim() : "Partition IA";
    metaKey.value = K ? K[1].trim() : "C";
    metaMeter.value = userMeterSelect.value; // On affiche ce qu'on a forcé
}

function renderABC(code) {
    // On s'assure que le staffwidth est là
    if (!code.includes("%%staffwidth")) code = "%%staffwidth 800\n" + code;
    
    ABCJS.renderAbc("paper", code, { responsive: "resize" });
    
    // Audio initial
    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio", null, { displayLoop: true, displayPlay: true, displayProgress: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: ABCJS.renderAbc("paper", code, { responsive: "resize" })[0] })
                   .then(() => synth.setTune(ABCJS.renderAbc("paper", code, { responsive: "resize" })[0], false));
    }
}

// 3. TRANSPOSITION
transposeBtn.addEventListener('click', function() {
    let abcCode = abcEditor.value;
    
    // Mise à jour de la tonalité si l'utilisateur l'a changée dans la case
    const userKey = metaKey.value;
    abcCode = abcCode.replace(/^K:.*$/m, `K:${userKey}`);

    const keySelect = document.getElementById('transposition');
    const instrumentKey = keySelect.value;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    document.getElementById('final-title').innerText = "Résultat : " + keySelect.options[keySelect.selectedIndex].text;

    // Rendu Visuel Transposé
    const visualObj = ABCJS.renderAbc("paper", abcCode, {
        responsive: "resize",
        visualTranspose: visualTranspose
    });

    // Rendu Audio Transposé
    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio", null, { displayLoop: true, displayPlay: true, displayProgress: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ 
            visualObj: visualObj[0],
            options: { midiTranspose: visualTranspose } 
        }).then(() => synth.setTune(visualObj[0], false));
    }
});
