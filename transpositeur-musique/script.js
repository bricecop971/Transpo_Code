// =========================================================
//  SCRIPT.JS - VERSION BLINDÉE (SÉCURITÉ HTML)
// =========================================================

// Sélections HTML
const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('#upload-text') || document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Champs Dashboard (Avec sécurité si null)
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

function buildABCFromData(data) {
    if (!data) return "";
    let abc = `X:1\nT:${data.title || "Sans Titre"}\nM:${data.timeSignature || "4/4"}\nK:${data.keySignature || "C"}\nL:1/4\n%%staffwidth 800\n`;
    
    if (data.measures && Array.isArray(data.measures)) {
        data.measures.forEach(measure => {
            measure.forEach(n => {
                if (n.note === "rest") abc += "z"; 
                else {
                    let acc = n.accidental === "#" ? "^" : n.accidental === "b" ? "_" : n.accidental === "n" ? "=" : "";
                    let note = n.note.toUpperCase();
                    if (n.octave >= 5) note = note.toLowerCase();
                    if (n.octave >= 6) note += "'";
                    if (n.octave <= 3) note += ",";
                    abc += acc + note;
                }
                if (n.duration === 2) abc += "2";
                else if (n.duration === 4) abc += "4";
                else if (n.duration === 3) abc += "3";
                else if (n.duration === 0.5) abc += "/2";
                else if (n.duration === 0.25) abc += "/4";
                else if (n.duration === 1.5) abc += "3/2"; 
                abc += " "; 
            });
            abc += "| "; 
        });
    }
    abc += "|]"; 
    return abc;
}

// --- LOGIQUE PRINCIPALE ---
if (fileInput) {
    fileInput.addEventListener('change', async function() {
        if (!fileInput.files.length) return;
        
        if (uploadText) uploadText.innerHTML = `<strong>Analyse IA...</strong><br>Extraction des données 🧠`;
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

            let safeData = responseData.musicData;
            if (!safeData && responseData.title) safeData = responseData;
            if (!safeData) throw new Error("Format JSON invalide");

            currentMusicData = safeData;

            // SÉCURITÉ : On ne remplit que si les éléments existent dans le HTML
            if (metaTitle) metaTitle.value = currentMusicData.title || "";
            if (metaMeter) metaMeter.value = currentMusicData.timeSignature || "4/4";
            if (metaKey) metaKey.value = currentMusicData.keySignature || "C";

            if (uploadText) uploadText.innerHTML = `<strong>Terminé !</strong><br>Vérifiez les infos ci-dessous.<br><button onclick="window.location.reload()" style="background:#333;color:white;border:none;padding:5px;margin-top:5px;cursor:pointer">❌ Changer</button>`;
            if (uploadZone) uploadZone.style.borderColor = "#00ff00";
            if (dashboard) dashboard.style.display = "grid";

        } catch (e) {
            if (uploadText) uploadText.innerHTML = `Erreur : ${e.message} <br><button onclick="window.location.reload()">Réessayer</button>`;
            if (uploadZone) uploadZone.style.borderColor = "red";
            console.error(e);
        }
    });
}

if (transposeBtn) {
    transposeBtn.addEventListener('click', function() {
        if (!currentMusicData) { alert("Aucune donnée chargée !"); return; }

        // Mise à jour depuis le dashboard (avec sécurité)
        if (metaTitle) currentMusicData.title = metaTitle.value;
        if (metaMeter) currentMusicData.timeSignature = metaMeter.value;
        if (metaKey) currentMusicData.keySignature = metaKey.value;

        const instrumentKey = document.getElementById('transposition').value;
        const instrumentName = document.getElementById('transposition').options[document.getElementById('transposition').selectedIndex].text;
        
        let visualTranspose = 0;
        if (instrumentKey === "Bb") visualTranspose = 2;
        if (instrumentKey === "Eb") visualTranspose = 9;
        if (instrumentKey === "F") visualTranspose = 7;

        const abcCode = buildABCFromData(currentMusicData);

        const titleEl = document.getElementById('final-title');
        if (titleEl) titleEl.innerText = "Résultat : " + instrumentName;
        
        if (resultZone) resultZone.style.display = "block";

        const visualObj = ABCJS.renderAbc("paper", abcCode, {
            responsive: "resize",
            visualTranspose: visualTranspose,
            add_classes: true
        });

        if (ABCJS.synth.supportsAudio()) {
            const synth = new ABCJS.synth.SynthController();
            synth.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
            const createSynth = new ABCJS.synth.CreateSynth();
            createSynth.init({ visualObj: visualObj[0] }).then(() => synth.setTune(visualObj[0], false));
        }
        
        if (resultZone) resultZone.scrollIntoView({behavior: "smooth"});
    });
}
