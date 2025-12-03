// =========================================================
//  SCRIPT.JS - VERSION DASHBOARD (PARSING INTELLIGENT)
// =========================================================

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const instrumentDisplay = document.getElementById('instrument-display');
const selectInstrument = document.getElementById('transposition');
const notesInput = document.getElementById('notes-input');
const dashboard = document.getElementById('music-dashboard');

// Champs du dashboard
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');

const resetBtn = document.getElementById('reset-btn');
const printBtn = document.getElementById('print-btn');

let originalAbcBody = ""; // Stocke les notes SANS les en-têtes

// --- FONCTIONS UTILITAIRES ---

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function compressImage(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const MAX_WIDTH = 1024;
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
    }
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.6));
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
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
}

// --- FONCTION DE PARSING (Le Traducteur) ---
function parseAndFillDashboard(abcCode) {
    // On extrait les infos avec des Regex
    const titleMatch = abcCode.match(/^T:(.*)$/m);
    const meterMatch = abcCode.match(/^M:(.*)$/m);
    const keyMatch = abcCode.match(/^K:(.*)$/m);

    // On remplit les cases (ou valeurs par défaut)
    metaTitle.value = titleMatch ? titleMatch[1].trim() : "Partition sans titre";
    metaMeter.value = meterMatch ? meterMatch[1].trim() : "4/4";
    metaKey.value = keyMatch ? keyMatch[1].trim() : "C";

    // On extrait juste les notes (tout ce qui n'est pas un header X: T: M: K: L:)
    // On enlève les lignes qui commencent par une lettre majuscule suivie de deux points
    const lines = abcCode.split('\n');
    const noteLines = lines.filter(line => !/^[A-Z]:/.test(line));
    originalAbcBody = noteLines.join('\n').trim();
    
    // On remplit aussi la zone cachée
    notesInput.value = abcCode;
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (fileInput.files.length > 0) {
        const originalFile = fileInput.files[0];
        let imageToProcess;

        uploadText.innerHTML = `<strong>Analyse IA en cours...</strong><br>Vérification du rythme ⏱️`;
        uploadZone.style.borderColor = "#00e5ff";

        try {
            if (originalFile.type === 'application/pdf') {
                const pdfBlob = await convertPdfToImage(originalFile);
                imageToProcess = await compressImage(new File([pdfBlob], "temp.jpg"));
                uploadZone.style.backgroundImage = "none";
                uploadZone.style.backgroundColor = "rgba(0, 229, 255, 0.1)";
            } else {
                const reader = new FileReader();
                reader.onload = e => {
                    uploadZone.style.backgroundImage = `url(${e.target.result})`;
                    uploadZone.style.backgroundSize = "contain";
                    uploadZone.style.backgroundRepeat = "no-repeat";
                    uploadZone.style.backgroundPosition = "center";
                };
                reader.readAsDataURL(originalFile);
                imageToProcess = await compressImage(originalFile);
            }

            const base64 = await getBase64(imageToProcess);
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);
            
            // SUCCÈS : On affiche le dashboard
            uploadText.innerHTML = `<strong>Analyse Terminée !</strong><br>Vérifiez les infos ci-dessous.<br><button onclick="window.location.reload()" style="background:#333; color:white; border:none; padding:5px; margin-top:5px; cursor:pointer;">❌ Changer</button>`;
            uploadZone.style.borderColor = "#00ff00";
            
            dashboard.style.display = "grid"; // Affiche les cases
            parseAndFillDashboard(data.abc);  // Remplit les cases

        } catch (error) {
            console.error(error);
            uploadText.innerHTML = `<strong>Erreur</strong><br>${error.message}`;
            uploadZone.style.borderColor = "red";
        }
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!originalAbcBody) {
        alert("Veuillez charger une partition d'abord !");
        return;
    }

    const instrumentKey = selectInstrument.value;
    const instrumentName = selectInstrument.options[selectInstrument.selectedIndex].text;
    
    // Calcul transposition visuelle
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    else if (instrumentKey === "Eb") visualTranspose = 9;
    else if (instrumentKey === "F") visualTranspose = 7;

    // RECONSTRUCTION DU CODE ABC PROPRE
    // On prend les valeurs des inputs (l'utilisateur peut les avoir corrigées !)
    const finalABC = `
X:1
T:${metaTitle.value}
M:${metaMeter.value}
K:${metaKey.value}
L:1/4
%%staffwidth 1000
%%stretchlast 1
${originalAbcBody}
|]`;

    instrumentDisplay.innerText = instrumentName;
    resultZone.style.display = "block";

    // Dessin
    const visualObj = ABCJS.renderAbc("paper", finalABC, {
        responsive: "resize",
        visualTranspose: visualTranspose // La magie opère ici
    });

    // Audio
    if (ABCJS.synth.supportsAudio()) {
        const synthControl = new ABCJS.synth.SynthController();
        synthControl.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj[0] }).then(() => synthControl.setTune(visualObj[0], false));
    }
    
    resultZone.scrollIntoView({behavior: "smooth"});
});

resetBtn.addEventListener('click', () => window.location.reload());
printBtn.addEventListener('click', (e) => { e.preventDefault(); window.print(); });
