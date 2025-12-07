// SCRIPT.JS - VERSION DIAGNOSTIC (Débuggage PDF)

console.log("Script chargé !");

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

// --- OUTILS ---
function getBase64(file) {
    return new Promise((r, j) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.onerror = j;
    });
}

async function convertPdfToImage(pdfFile) {
    console.log("Début conversion PDF...");
    try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        console.log("PDF chargé, pages:", pdf.numPages);
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        console.log("Page rendue sur Canvas");
        return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
    } catch (e) {
        console.error("Erreur PDF:", e);
        alert("Erreur lecture PDF : " + e.message);
        throw e;
    }
}

// --- CONSTRUCTEUR ABC (Logique Klang) ---
function buildAbcFromVisualData(data) {
    if (!data || !data.notes) return "";
    const attr = data.attributes || {};
    // Valeurs dashboard prioritaires
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
        let durationVal = 1;

        // Pitch
        if (note.pitch) {
            let char = note.pitch.toUpperCase();
            if (note.octave >= 5) char = char.toLowerCase();
            if (note.octave >= 6) char += "'";
            if (note.octave <= 3) char += ",";
            let acc = note.accidental === "#" ? "^" : note.accidental === "b" ? "_" : "";
            abcNote += acc + char;
        } else {
            abcNote += "x"; // Note inconnue
        }

        // Rythme Visuel
        let type = (note.visualType || "quarter").toLowerCase();
        if (type.includes("whole")) { abcNote += "4"; durationVal = 4; }
        else if (type.includes("half")) { abcNote += "2"; durationVal = 2; }
        else if (type.includes("eighth")) { abcNote += "/2"; durationVal = 0.5; }
        else if (type.includes("sixteenth")) { abcNote += "/4"; durationVal = 0.25; }
        else { durationVal = 1; }

        abc += abcNote + " ";
        currentDuration += durationVal;
        
        if (currentDuration >= measureLimit - 0.01) {
            abc += "| ";
            currentDuration = 0;
        }
    });
    abc += "|]";
    return abc;
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    console.log("Fichier sélectionné !");
    if (!fileInput.files.length) return;
    
    uploadText.innerText = "⏳ Traitement de l'image...";
    
    try {
        let file = fileInput.files[0];
        let imgFile = file; // Par défaut

        if (file.type === 'application/pdf') {
            imgFile = await convertPdfToImage(file); // Conversion explicite
        }

        // On envoie
        uploadText.innerText = "🚀 Envoi à l'IA...";
        const base64 = await getBase64(imgFile);
        
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Erreur serveur (${res.status}): ${errTxt}`);
        }

        const responseData = await res.json();
        currentMusicData = responseData.musicData;

        // Affichage Dashboard
        if (currentMusicData.attributes) {
            metaTitle.value = "Partition Scannée";
            metaMeter.value = currentMusicData.attributes.timeSignature || "4/4";
            metaKey.value = currentMusicData.attributes.keySignature || "C";
        }

        document.querySelector('.upload-zone').style.display = 'none';
        dashboard.style.display = 'block';
        
        // Pré-affichage
        document.getElementById('transpose-btn').click();

    } catch (e) {
        console.error(e);
        uploadText.innerText = "❌ Erreur : " + e.message;
        alert("Erreur : " + e.message);
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!currentMusicData) return;

    // Mise à jour attributs
    currentMusicData.attributes = currentMusicData.attributes || {};
    currentMusicData.attributes.timeSignature = metaMeter.value;
    currentMusicData.attributes.keySignature = metaKey.value;

    const instrumentKey = document.getElementById('transposition').value;
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    const abcCode = buildAbcFromVisualData(currentMusicData);
    
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
