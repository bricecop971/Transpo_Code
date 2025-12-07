// SCRIPT.JS - VERSION HAUTE DÉFINITION (HD)

const fileInput = document.getElementById('file-input');
const uploadText = document.getElementById('upload-text');
const dashboard = document.getElementById('dashboard');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');

// Dashboard inputs
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');

let currentMusicData = null;

// --- OUTILS IMAGES (AMÉLIORÉS) ---
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
    
    // CHANGEMENT MAJEUR : ON PASSE À 2500px (HD)
    // C'est nécessaire pour distinguer les lignes des interlignes
    const MAX_WIDTH = 2500; 
    let width = bitmap.width;
    let height = bitmap.height;
    
    if (width > MAX_WIDTH) {
        height = Math.round(height * (MAX_WIDTH / width));
        width = MAX_WIDTH;
    }

    canvas.width = width;
    canvas.height = height;
    
    // Fond blanc forcé (aide l'IA à lire si le PNG est transparent)
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Qualité 0.85 (Meilleure netteté)
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
}

async function convertPdfToImage(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);
    // Zoom x2.0 pour une netteté maximale des notes
    const viewport = page.getViewport({ scale: 2.0 }); 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
}

// --- CONSTRUCTEUR ABC (SCIENTIFIC PITCH) ---
function buildAbcFromScientificData(data) {
    if (!data || !data.notes) return "";

    const attr = data.attributes || {};
    const timeSig = metaMeter.value || attr.timeSignature || "4/4";
    const keySig = metaKey.value || attr.keySignature || "C";
    const title = metaTitle.value || "Partition Scannée";

    let abc = `X:1\nT:${title}\nM:${timeSig}\nK:${keySig}\nL:1/4\n%%staffwidth 800\n`;

    let [beats, value] = timeSig.split('/').map(Number);
    if (!beats) { beats=4; value=4; }
    let measureLimit = beats * (4 / value); 
    let currentDuration = 0;

    data.notes.forEach(note => {
        let abcNote = "";
        
        // 1. GESTION HAUTEUR (Scientific Pitch C4, D5...)
        // On nettoie la donnée (ex: "C4" -> Note:C, Octave:4)
        let pitch = note.pitch.replace(/[0-9]/g, '').toUpperCase(); // "C"
        let octave = parseInt(note.pitch.replace(/[^0-9]/g, '')) || 4; // 4
        
        // Conversion Scientific -> ABC
        // C4 = C (Do du milieu)
        // C5 = c (Do aigu)
        let char = pitch;
        if (octave === 3) char = char + ",";      // Grave
        else if (octave === 4) char = char;       // Medium
        else if (octave === 5) char = char.toLowerCase(); // Aigu
        else if (octave >= 6) char = char.toLowerCase() + "'"; // Très aigu

        // Accidentels
        if (note.pitch.includes("#")) char = "^" + char.replace("#","");
        if (note.pitch.includes("b")) char = "_" + char.replace("b","");

        abcNote += char;

        // 2. GESTION DURÉE (Décimal)
        // 1.0 = Noire, 2.0 = Blanche, 0.5 = Croche
        let duration = parseFloat(note.duration);
        
        if (duration === 4) abcNote += "4";
        else if (duration === 3) abcNote += "3";
        else if (duration === 2) abcNote += "2";
        else if (duration === 1.5) abcNote += "3/2";
        else if (duration === 0.5) abcNote += "/2";
        else if (duration === 0.25) abcNote += "/4";
        else if (duration === 0.75) abcNote += "3/4";
        // Si 1.0, on ne met rien (défaut)

        abc += abcNote + " ";
        
        // Barres de mesure
        currentDuration += duration;
        if (Math.abs(currentDuration - measureLimit) < 0.1 || currentDuration > measureLimit) {
            abc += "| ";
            currentDuration = 0;
        }
    });

    abc += "|]";
    return abc;
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    uploadText.innerHTML = `<strong>Analyse Haute Définition...</strong><br>Lecture précise des notes 🎯`;
    
    try {
        let file = fileInput.files[0];
        let imgFile;

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

        const responseData = await res.json();
        if (responseData.error) throw new Error(responseData.error);

        currentMusicData = responseData.musicData;

        // Remplissage Dashboard
        if (currentMusicData.attributes) {
            metaTitle.value = "Partition Scannée";
            metaMeter.value = currentMusicData.attributes.timeSignature || "4/4";
            metaKey.value = currentMusicData.attributes.keySignature || "C";
        }

        document.querySelector('.upload-zone').style.display = 'none';
        dashboard.style.display = 'block';
        
        document.getElementById('transpose-btn').click();

    } catch (e) {
        uploadText.innerHTML = `Erreur : ${e.message} <br><button onclick="window.location.reload()">Réessayer</button>`;
        console.error(e);
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!currentMusicData) return;

    currentMusicData.attributes = currentMusicData.attributes || {};
    currentMusicData.attributes.timeSignature = metaMeter.value;
    currentMusicData.attributes.keySignature = metaKey.value;

    const instrumentKey = document.getElementById('transposition').value;
    const instrumentName = document.getElementById('transposition').options[document.getElementById('transposition').selectedIndex].text;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    const abcCode = buildAbcFromScientificData(currentMusicData);
    
    document.getElementById('final-title').innerText = "Résultat : " + instrumentName;
    resultZone.style.display = "block";
    
    const visualObj = ABCJS.renderAbc("paper", abcCode, {
        responsive: "resize",
        visualTranspose: visualTranspose,
        add_classes: true
    });

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
