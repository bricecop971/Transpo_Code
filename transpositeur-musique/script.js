// =========================================================
//  SCRIPT.JS - VERSION SYNCHRO (IMAGE + AUDIO)
// =========================================================

const fileInput = document.getElementById('partition-upload');
const uploadText = document.getElementById('upload-text');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Dashboard
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');
const abcSource = document.getElementById('abc-source');

// Variable globale pour le code ABC original (sans notes)
let originalMusicBody = ""; 

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

// --- PARSING ABC ---
function parseABC(abcCode) {
    // 1. On extrait les infos
    const T = abcCode.match(/^T:(.*)$/m);
    const M = abcCode.match(/^M:(.*)$/m);
    const K = abcCode.match(/^K:(.*)$/m);
    
    // 2. On remplit le dashboard
    metaTitle.value = T ? T[1].trim() : "Morceau IA";
    metaMeter.value = M ? M[1].trim() : "4/4";
    metaKey.value = K ? K[1].trim() : "C";

    // 3. On extrait juste les notes (on enlève les headers pour les reconstruire proprement après)
    const lines = abcCode.split('\n');
    const musicLines = lines.filter(line => !/^[A-Z]:/.test(line));
    originalMusicBody = musicLines.join('\n');
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    let imgFile = file;

    uploadText.innerHTML = `<strong>Analyse en cours...</strong>`;
    
    try {
        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
        } else {
            imgFile = await compressImage(file);
        }

        const base64 = await getBase64(imgFile);
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS
        parseABC(data.abc);
        dashboard.style.display = "block";
        uploadText.innerHTML = `✅ Analyse terminée. Vérifiez la tonalité (K) ci-dessous.`;

    } catch (e) {
        uploadText.innerHTML = `❌ Erreur : ${e.message}`;
        console.error(e);
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!originalMusicBody) { alert("Chargez une partition !"); return; }

    const keySelect = document.getElementById('transposition');
    const instrumentKey = keySelect.value;
    
    // Calcul transposition (Demi-tons)
    let transposeSemitones = 0;
    if (instrumentKey === "Bb") transposeSemitones = 2; // +2
    if (instrumentKey === "Eb") transposeSemitones = 9; // +9
    if (instrumentKey === "F") transposeSemitones = 7;  // +7

    // 1. On reconstruit le ABC complet
    const finalABC = `
X:1
T:${metaTitle.value}
M:${metaMeter.value}
K:${metaKey.value}
L:1/4
%%staffwidth 800
${originalMusicBody}
|]`;

    document.getElementById('final-title').innerText = "Résultat : " + keySelect.options[keySelect.selectedIndex].text;
    resultZone.style.display = "block";

    // 2. RENDU VISUEL (Avec transposition visuelle)
    const visualObj = ABCJS.renderAbc("paper", finalABC, {
        responsive: "resize",
        visualTranspose: transposeSemitones // Décale les notes sur la portée
    });

    // 3. RENDU AUDIO (Avec transposition sonore !)
    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        
        const createSynth = new ABCJS.synth.CreateSynth();
        
        // C'EST ICI LA CLÉ : on dit au synthé de décaler le son aussi !
        createSynth.init({ 
            visualObj: visualObj[0],
            options: { 
                midiTranspose: transposeSemitones // Synchronise le son avec l'image
            } 
        }).then(() => synth.setTune(visualObj[0], false));
    }
    
    resultZone.scrollIntoView({behavior: "smooth"});
});
