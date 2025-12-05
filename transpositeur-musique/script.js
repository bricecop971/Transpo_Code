// =========================================================
//  SCRIPT.JS - VERSION ROBUSTE (ANTI-CRASH JSON)
// =========================================================

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Champs Dashboard
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');

// Variable globale
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

// --- 2. FONCTION DE CONVERSION JSON -> ABC ---
function buildABCFromData(data) {
    // SÉCURITÉ : On vérifie que les données existent
    if (!data) return "";

    // 1. En-têtes (avec valeurs par défaut si manquant)
    let abc = `X:1\n`;
    abc += `T:${data.title || "Partition Sans Titre"}\n`;
    abc += `M:${data.timeSignature || "4/4"}\n`;
    abc += `K:${data.keySignature || "C"}\n`;
    abc += `L:1/4\n`; 
    abc += `%%staffwidth 1000\n`;

    // 2. Construction des notes
    if (data.measures && Array.isArray(data.measures)) {
        data.measures.forEach(measure => {
            if (Array.isArray(measure)) {
                measure.forEach(n => {
                    if (n.note === "rest") {
                        abc += "z"; 
                    } else {
                        // Gestion Accidentels
                        let acc = "";
                        if (n.accidental === "#") acc = "^";
                        if (n.accidental === "b") acc = "_";
                        if (n.accidental === "n") acc = "=";

                        // Gestion Octave
                        let noteName = (n.note || "C").toUpperCase();
                        if (n.octave >= 5) noteName = noteName.toLowerCase();
                        if (n.octave >= 6) noteName += "'";
                        if (n.octave <= 3) noteName += ",";

                        abc += acc + noteName;
                    }

                    // Gestion Durée
                    if (n.duration === 2) abc += "2";
                    else if (n.duration === 4) abc += "4";
                    else if (n.duration === 3) abc += "3";
                    else if (n.duration === 0.5) abc += "/2";
                    else if (n.duration === 0.25) abc += "/4";
                    else if (n.duration === 1.5) abc += "3/2"; 

                    abc += " "; 
                });
                abc += "| "; 
            }
        });
    }
    
    abc += "|]"; 
    return abc;
}

// --- 3. CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    uploadText.innerHTML = `<strong>Extraction des données...</strong><br>Analyse structurelle 📐`;
    uploadZone.style.borderColor = "#00e5ff";

    try {
        let file = fileInput.files[0];
        let imgFile;

        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
            uploadZone.style.backgroundImage = "none";
            uploadZone.style.backgroundColor = "rgba(0,229,255,0.1)";
        } else {
            imgFile = await compressImage(file);
            const reader = new FileReader();
            reader.onload = e => {
                uploadZone.style.backgroundImage = `url(${e.target.result})`;
                uploadZone.style.backgroundSize = "contain";
                uploadZone.style.backgroundRepeat = "no-repeat";
                uploadZone.style.backgroundPosition = "center";
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

        // --- CORRECTIF DU BUG "UNDEFINED" ---
        // Parfois l'IA met les données direct dans musicData, parfois dans musicData.musicData
        // On cherche le bon endroit.
        let safeData = responseData.musicData;
        
        if (!safeData) {
            // Si vide, c'est peut-être direct à la racine (rare) ou mal formaté
            // On tente de voir si c'est responseData tout court
            if (responseData.title) safeData = responseData;
            else throw new Error("Format de données reçu invalide.");
        }

        currentMusicData = safeData;

        // Remplissage Dashboard (avec sécurité)
        metaTitle.value = currentMusicData.title || "Sans Titre";
        metaMeter.value = currentMusicData.timeSignature || "4/4";
        metaKey.value = currentMusicData.keySignature || "C";

        uploadText.innerHTML = `<strong>Données extraites !</strong><br>Partition prête.<br><button onclick="window.location.reload()" style="background:#333;color:white;border:none;padding:5px;margin-top:5px;cursor:pointer">❌ Annuler</button>`;
        uploadZone.style.borderColor = "#00ff00";
        dashboard.style.display = "block";

    } catch (e) {
        uploadText.innerHTML = `Erreur : ${e.message}`;
        uploadZone.style.borderColor = "red";
        console.error(e);
    }
});

// --- 4. TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!currentMusicData) { alert("Pas de données !"); return; }

    // Mise à jour avec les valeurs utilisateur
    currentMusicData.title = metaTitle.value;
    currentMusicData.timeSignature = metaMeter.value;
    currentMusicData.keySignature = metaKey.value;

    const instrumentKey = document.getElementById('transposition').value;
    const instrumentName = document.getElementById('transposition').options[document.getElementById('transposition').selectedIndex].text;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    const abcCode = buildABCFromData(currentMusicData);

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
        createSynth.init({ visualObj: visualObj[0] }).then(() => synth.setTune(visualObj[0], false));
    }
    
    resultZone.scrollIntoView({behavior: "smooth"});
});
