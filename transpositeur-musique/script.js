// SCRIPT.JS - VERSION DIAGNOSTIC & STRUCTURE

console.log(">>> Script chargé avec succès !");

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('#upload-text') || document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Inputs Dashboard
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
    const scale = Math.min(1500 / bitmap.width, 1); // 1500px pour bon compromis
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
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
}

// --- CONSTRUCTEUR ABC ---
function buildAbc(data) {
    if (!data) return "";
    const attr = data.attributes || {};
    let abc = `X:1\nT:Partition\nM:${metaMeter.value || attr.timeSignature || "4/4"}\nK:${metaKey.value || attr.keySignature || "C"}\nL:1/4\n%%staffwidth 800\n`;

    if (data.measures && Array.isArray(data.measures)) {
        data.measures.forEach(measure => {
            measure.forEach(n => {
                let noteStr = "";
                if (n.p === "rest") {
                    noteStr = "z";
                } else {
                    // Nettoyage Pitch (ex: "C#4")
                    let pitch = n.p.replace(/[0-9]/g, '').toUpperCase();
                    let octave = parseInt(n.p.replace(/[^0-9]/g, '')) || 4;
                    
                    let char = pitch;
                    if (octave === 3) char += ",";
                    if (octave === 5) char = char.toLowerCase();
                    if (octave >= 6) char = char.toLowerCase() + "'";

                    if (n.p.includes("#")) char = "^" + char.replace("#","");
                    if (n.p.includes("b")) char = "_" + char.replace("b","");
                    noteStr = char;
                }

                // Durée
                let d = parseFloat(n.d);
                if (d === 4) noteStr += "4";
                else if (d === 2) noteStr += "2";
                else if (d === 3) noteStr += "3";
                else if (d === 1.5) noteStr += "3/2";
                else if (d === 0.5) noteStr += "/2";
                else if (d === 0.25) noteStr += "/4";
                
                abc += noteStr + " ";
            });
            abc += "| ";
        });
    }
    abc += "|]";
    return abc;
}

// --- ACTION CHARGEMENT ---
if (fileInput) {
    fileInput.addEventListener('change', async function() {
        console.log(">>> Changement fichier détecté");
        if (!fileInput.files.length) return;
        
        if (uploadText) uploadText.innerHTML = `<strong>Envoi en cours...</strong><br>Analyse Rapide ⚡`;
        if (uploadZone) uploadZone.style.borderColor = "blue";

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
            console.log(">>> Image prête, envoi au serveur...");
            
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
            });

            console.log(">>> Réponse serveur reçue :", res.status);

            if (!res.ok) {
                const errTxt = await res.text();
                throw new Error(`Erreur HTTP ${res.status}: ${errTxt}`);
            }

            const responseData = await res.json();
            if (responseData.error) throw new Error(responseData.error);

            currentMusicData = responseData.musicData;
            console.log(">>> Données Musique :", currentMusicData);

            // Remplir Dashboard
            const attr = currentMusicData.attributes || {};
            if (metaMeter) metaMeter.value = attr.timeSignature || "4/4";
            if (metaKey) metaKey.value = attr.keySignature || "C";

            if (uploadText) uploadText.innerHTML = `<strong>Terminé !</strong><br><button onclick="window.location.reload()">Recommencer</button>`;
            if (uploadZone) uploadZone.style.borderColor = "green";
            if (dashboard) dashboard.style.display = "grid";
            
            // Auto-click transpose
            if (transposeBtn) transposeBtn.click();

        } catch (e) {
            console.error(">>> ERREUR CATCHÉE :", e);
            if (uploadText) uploadText.innerHTML = `❌ Erreur : ${e.message}`;
            if (uploadZone) uploadZone.style.borderColor = "red";
            alert("Une erreur est survenue : " + e.message);
        }
    });
}

// --- ACTION TRANSPOSER ---
if (transposeBtn) {
    transposeBtn.addEventListener('click', function() {
        if (!currentMusicData) return;

        const instrumentKey = document.getElementById('transposition').value;
        let visualTranspose = 0;
        if (instrumentKey === "Bb") visualTranspose = 2;
        if (instrumentKey === "Eb") visualTranspose = 9;
        if (instrumentKey === "F") visualTranspose = 7;

        const abcCode = buildAbc(currentMusicData);
        
        if (resultZone) resultZone.style.display = "block";
        
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
}
