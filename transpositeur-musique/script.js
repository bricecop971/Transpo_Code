// =========================================================
//  SCRIPT.JS - VERSION TOLÉRANTE & DEBUG
// =========================================================

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('#upload-text') || document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Inputs
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');

let currentMusicData = null;

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

// --- CONSTRUCTEUR ABC INTELLIGENT ---
function buildAbcFromVisualData(data) {
    if (!data || !data.notes) return "";

    const attr = data.attributes || {};
    // On utilise les valeurs du dashboard (modifiées par l'utilisateur) en priorité
    const timeSig = metaMeter.value || attr.timeSignature || "4/4";
    const keySig = metaKey.value || attr.keySignature || "C";
    const title = metaTitle.value || "Partition Scannée";

    let abc = `X:1\nT:${title}\nM:${timeSig}\nK:${keySig}\nL:1/4\n%%staffwidth 800\n`;

    // Calcul de la mesure
    let [beats, value] = timeSig.split('/').map(Number);
    if (!beats) { beats=4; value=4; }
    // Durée d'une mesure en 'noires' (1.0)
    let measureLimit = beats * (4 / value); 
    
    let currentDuration = 0;

    data.notes.forEach(note => {
        let abcNote = "";
        let durationVal = 1; // Valeur par défaut = Noire

        // 1. PITCH (Hauteur)
        if (note.pitch) {
            let char = note.pitch.toUpperCase();
            let oct = note.octave || 4;
            
            // Ajustement octave ABC standard
            if (oct >= 5) char = char.toLowerCase();
            if (oct >= 6) char += "'";
            if (oct <= 3) char += ",";
            
            let acc = "";
            if (note.accidental === "#" || note.accidental === "sharp") acc = "^";
            if (note.accidental === "b" || note.accidental === "flat") acc = "_";
            if (note.accidental === "n" || note.accidental === "natural") acc = "=";
            
            abcNote += acc + char;
        } else {
            // Si pas de pitch, c'est peut-être un silence ou une erreur
            abcNote += "x"; 
        }

        // 2. RYTHME (Tolérance MAJUSCULES/minuscules)
        // On nettoie le type (enlève les espaces, met en minuscule)
        let type = (note.visualType || "quarter").toLowerCase().trim();

        if (type.includes("whole") || type.includes("ronde")) {
            abcNote += "4"; durationVal = 4;
        } 
        else if (type.includes("half") || type.includes("blanche")) {
            abcNote += "2"; durationVal = 2;
        } 
        else if (type.includes("eighth") || type.includes("croche")) {
            abcNote += "/2"; durationVal = 0.5;
        } 
        else if (type.includes("sixteenth") || type.includes("double")) {
            abcNote += "/4"; durationVal = 0.25;
        } 
        else {
            // "quarter", "noire", ou inconnu -> On garde 1 temps
            durationVal = 1;
        }

        // Ajout au code global
        abc += abcNote + " ";
        
        // Gestion Barre de mesure automatique
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
    if (!fileInput.files.length) return;
    
    if (uploadText) uploadText.innerHTML = `<strong>Scanner...</strong><br>Analyse des formes 👁️`;
    if (uploadZone) uploadZone.style.borderColor = "#00e5ff";

    try {
        let file = fileInput.files[0];
        let imgFile;

        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
            if (uploadZone) uploadZone.style.background = "rgba(0,229,255,0.1)";
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

        // DEBUG : On affiche dans la console ce que l'IA a vu
        console.log("DONNÉES REÇUES DE L'IA :", currentMusicData);

        // Remplissage Dashboard
        if (currentMusicData.attributes) {
            metaTitle.value = "Partition Scannée";
            metaMeter.value = currentMusicData.attributes.timeSignature || "4/4";
            metaKey.value = currentMusicData.attributes.keySignature || "C";
        }

        if (uploadText) uploadText.innerHTML = `<strong>Scan Terminé !</strong><br><button onclick="window.location.reload()" style="background:#333;color:white;border:none;padding:5px;margin-top:5px;cursor:pointer">❌ Annuler</button>`;
        if (uploadZone) uploadZone.style.borderColor = "#00ff00";
        if (dashboard) dashboard.style.display = "grid";

        // Déclenche une pré-transposition pour voir si ça marche direct
        document.getElementById('transpose-btn').click();

    } catch (e) {
        if (uploadText) uploadText.innerHTML = `Erreur : ${e.message} <br><button onclick="window.location.reload()">Réessayer</button>`;
        if (uploadZone) uploadZone.style.borderColor = "red";
        console.error(e);
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!currentMusicData) { 
        alert("Les données sont vides. L'IA n'a rien renvoyé."); 
        return; 
    }

    const instrumentKey = document.getElementById('transposition').value;
    const instrumentName = document.getElementById('transposition').options[document.getElementById('transposition').selectedIndex].text;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    // CONSTRUCTION DU CODE
    const abcCode = buildAbcFromVisualData(currentMusicData);
    
    // DEBUG : Afficher le code généré dans la console
    console.log("CODE ABC GÉNÉRÉ :", abcCode);

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
