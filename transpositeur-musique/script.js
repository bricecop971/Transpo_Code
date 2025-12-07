// SCRIPT.JS - VERSION VALIDATION MATHÉMATIQUE

const fileInput = document.getElementById('partition-upload');
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

// --- OUTILS IMAGES ---
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
    // On garde 2500px pour la netteté des têtes de notes (vides/pleines)
    const scale = Math.min(2500 / bitmap.width, 1);
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
}
async function convertPdfToImage(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
}

// --- CONSTRUCTEUR ABC ---
function buildAbcFromMathData(data) {
    if (!data) return "";

    const attr = data.attributes || {};
    const timeSig = metaMeter.value || attr.timeSignature || "4/4";
    const keySig = metaKey.value || attr.keySignature || "C";
    const title = metaTitle.value || "Partition Analysée";

    let abc = `X:1\nT:${title}\nM:${timeSig}\nK:${keySig}\nL:1/4\n%%staffwidth 800\n`;

    // Si les données sont en format "measures" (notre nouveau format)
    if (data.measures && Array.isArray(data.measures)) {
        data.measures.forEach(measure => {
            measure.forEach(n => {
                let abcNote = "";
                
                // 1. PITCH
                if (n.p === "rest") {
                    abcNote = "z";
                } else {
                    // Nettoyage ex: "C#4"
                    let pitch = n.p.replace(/[0-9]/g, '').toUpperCase();
                    let octave = parseInt(n.p.replace(/[^0-9]/g, '')) || 4;
                    
                    let char = pitch;
                    if (octave === 3) char += ",";
                    if (octave === 5) char = char.toLowerCase();
                    if (octave >= 6) char = char.toLowerCase() + "'";

                    // Gestion # et b
                    if (n.p.includes("#")) char = "^" + char.replace("#","");
                    if (n.p.includes("b")) char = "_" + char.replace("b","");
                    
                    abcNote = char;
                }

                // 2. DURÉE (d)
                let d = parseFloat(n.d);
                if (d === 4) abcNote += "4";
                else if (d === 3) abcNote += "3";
                else if (d === 2) abcNote += "2";
                else if (d === 1.5) abcNote += "3/2";
                else if (d === 0.5) abcNote += "/2";
                else if (d === 0.25) abcNote += "/4";
                else if (d === 0.75) abcNote += "3/4";
                
                abc += abcNote + " ";
            });
            abc += "| "; // Barre de mesure automatique après chaque groupe
        });
    } 
    // Fallback ancien format (juste une liste de notes)
    else if (data.notes) {
        data.notes.forEach(n => {
            // ... (code simple pour compatibilité) ...
            abc += (n.pitch || "C") + " ";
        });
    }

    abc += "|]";
    return abc;
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    if (uploadText) uploadText.innerHTML = `<strong>Analyse Mathématique...</strong><br>Vérification des mesures 🧮`;
    
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

        currentMusicData = responseData.musicData;

        // Remplissage Dashboard
        const attr = currentMusicData.attributes || {};
        metaTitle.value = "Partition Analysée";
        metaMeter.value = attr.timeSignature || "4/4";
        metaKey.value = attr.keySignature || "C";

        if (uploadText) uploadText.innerHTML = `<strong>Terminé !</strong><br><button onclick="window.location.reload()" style="background:#333;color:white;border:none;padding:5px;margin-top:5px;cursor:pointer">❌ Annuler</button>`;
        if (dashboard) dashboard.style.display = "grid";
        
        // Pré-rendu
        document.getElementById('transpose-btn').click();

    } catch (e) {
        if (uploadText) uploadText.innerHTML = `Erreur : ${e.message} <br><button onclick="window.location.reload()">Réessayer</button>`;
        console.error(e);
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
    const instrumentName = document.getElementById('transposition').options[document.getElementById('transposition').selectedIndex].text;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    const abcCode = buildAbcFromMathData(currentMusicData);
    
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
