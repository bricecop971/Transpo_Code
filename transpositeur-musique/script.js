// =========================================================
//  SCRIPT.JS - MOTEUR DE RECONSTRUCTION (STYLE KLANG)
// =========================================================

const fileInput = document.getElementById('file-input');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('#upload-text') || document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Dashboard inputs
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');

let currentMusicData = null;

// --- 1. OUTILS IMAGES ---
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

// --- 2. LE CONSTRUCTEUR ABC (LOGIQUE MATHÉMATIQUE) ---
function buildAbcFromVisualData(data) {
    if (!data || !data.notes) return "";

    const attr = data.attributes || {};
    let abc = `X:1\n`;
    abc += `T:Partition Scannée\n`;
    abc += `M:${attr.timeSignature || "4/4"}\n`;
    abc += `K:${attr.keySignature || "C"}\n`;
    abc += `L:1/4\n`; // On base tout sur la noire
    abc += `%%staffwidth 800\n`;

    // Calcul de la durée mathématique attendue par mesure
    // Ex: 2/4 -> 2 temps. 4/4 -> 4 temps.
    let timeSig = attr.timeSignature || "4/4";
    let [beats, value] = timeSig.split('/').map(Number);
    // En base 1/4 (noire), la durée totale d'une mesure est :
    let measureLimit = beats * (4 / value); 
    
    let currentMeasureDuration = 0;

    data.notes.forEach(note => {
        // --- A. TRADUCTION VISUEL -> ABC ---
        let abcNote = "";
        let durationVal = 0;

        // 1. La Hauteur (Pitch)
        let noteChar = note.pitch.toUpperCase();
        if (note.octave >= 5) noteChar = noteChar.toLowerCase();
        if (note.octave >= 6) noteChar += "'";
        if (note.octave <= 3) noteChar += ",";
        
        // Gestion des altérations détectées (si l'IA en envoie, sinon vide)
        if (note.accidental === "#") abcNote += "^";
        if (note.accidental === "b") abcNote += "_";
        
        abcNote += noteChar;

        // 2. Le Rythme (Shape -> Code)
        switch (note.visualType) {
            case "whole": // Ronde
                abcNote += "4";
                durationVal = 4;
                break;
            case "half": // Blanche (Tête vide)
                abcNote += "2";
                durationVal = 2;
                break;
            case "quarter": // Noire (Tête pleine)
                // Pas de chiffre = 1 temps
                durationVal = 1;
                break;
            case "eighth": // Croche (Drapeau/Barre)
                abcNote += "/2";
                durationVal = 0.5;
                break;
            case "sixteenth": // Double
                abcNote += "/4";
                durationVal = 0.25;
                break;
            default:
                durationVal = 1; // Par défaut noire
        }

        // Ajout de la note au code
        abc += abcNote + " ";
        
        // --- B. GESTION DES BARRES DE MESURE ---
        // On compte les temps. Si on dépasse la mesure, on met une barre.
        currentMeasureDuration += durationVal;
        
        if (currentMeasureDuration >= measureLimit) {
            abc += "| ";
            currentMeasureDuration = 0; // Reset compteur
        }
    });

    abc += "|]";
    return abc;
}

// --- 3. CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    if (uploadText) uploadText.innerHTML = `<strong>Scanner Optique...</strong><br>Analyse des formes 👁️`;
    if (uploadZone) uploadZone.style.borderColor = "#00e5ff";

    try {
        let file = fileInput.files[0];
        let imgFile;

        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
            if (uploadZone) uploadZone.style.backgroundImage = "none";
            if (uploadZone) uploadZone.style.backgroundColor = "rgba(0,229,255,0.1)";
        } else {
            imgFile = await compressImage(file);
            const reader = new FileReader();
            reader.onload = e => {
                if (uploadZone) {
                    uploadZone.style.backgroundImage = `url(${e.target.result})`;
                    uploadZone.style.backgroundSize = "contain";
                    uploadZone.style.backgroundRepeat = "no-repeat";
                    uploadZone.style.backgroundPosition = "center";
                }
            };
            reader.readAsDataURL(file);
        }

        const base64 = await getBase64(imgFile);
        
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        const responseData = await res.json();
        if (responseData.error) throw new Error(responseData.error);

        // Récupération des données brutes
        currentMusicData = responseData.musicData;

        // On remplit le Dashboard
        if (currentMusicData.attributes) {
            metaTitle.value = "Partition Scannée";
            metaMeter.value = currentMusicData.attributes.timeSignature || "4/4";
            metaKey.value = currentMusicData.attributes.keySignature || "C";
        }

        if (uploadText) uploadText.innerHTML = `<strong>Scan Terminé !</strong><br>Formes détectées.<br><button onclick="window.location.reload()" style="background:#333;color:white;border:none;padding:5px;margin-top:5px;cursor:pointer">❌ Annuler</button>`;
        if (uploadZone) uploadZone.style.borderColor = "#00ff00";
        if (dashboard) dashboard.style.display = "grid";

    } catch (e) {
        if (uploadText) uploadText.innerHTML = `Erreur : ${e.message} <br><button onclick="window.location.reload()">Réessayer</button>`;
        if (uploadZone) uploadZone.style.borderColor = "red";
        console.error(e);
    }
});

// --- 4. TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!currentMusicData) { alert("Aucune donnée !"); return; }

    // On met à jour les attributs si l'utilisateur a changé le dashboard
    if (!currentMusicData.attributes) currentMusicData.attributes = {};
    currentMusicData.attributes.timeSignature = metaMeter.value;
    currentMusicData.attributes.keySignature = metaKey.value;

    const instrumentKey = document.getElementById('transposition').value;
    const instrumentName = document.getElementById('transposition').options[document.getElementById('transposition').selectedIndex].text;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    // CONSTRUCTION DU CODE ABC
    const abcCode = buildAbcFromVisualData(currentMusicData);

    document.getElementById('final-title').innerText = "Résultat : " + instrumentName;
    resultZone.style.display = "block";

    const visualObj = ABCJS.renderAbc("paper", abcCode, {
        responsive: "resize",
        visualTranspose: visualTranspose,
        add_classes: true
    });

    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ 
            visualObj: visualObj[0],
            options: { midiTranspose: visualTranspose } 
        }).then(() => synth.setTune(visualObj[0], false));
    }
    
    resultZone.scrollIntoView({behavior: "smooth"});
});
