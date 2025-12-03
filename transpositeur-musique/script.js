// SCRIPT.JS - VERSION FINALE (Dashboard & Transposition)

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('.upload-zone p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');
const dashboard = document.getElementById('dashboard');

// Champs du Dashboard
const metaTitle = document.getElementById('meta-title');
const metaMeter = document.getElementById('meta-meter');
const metaKey = document.getElementById('meta-key');
const abcHidden = document.getElementById('abc-hidden');

let originalNotesBody = ""; // Stocke les notes sans les en-têtes

// --- FONCTIONS ---

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
    const scale = Math.min(1024 / bitmap.width, 1); // Max 1024px
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.6));
}

// Convertit PDF -> Image
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

// --- PARSING ABC (LE CŒUR DU SYSTÈME) ---
function parseABC(abcCode) {
    // 1. Extraire les infos
    const T = abcCode.match(/^T:(.*)$/m);
    const M = abcCode.match(/^M:(.*)$/m);
    const K = abcCode.match(/^K:(.*)$/m);
    const L = abcCode.match(/^L:(.*)$/m);

    // 2. Remplir le Dashboard
    metaTitle.value = T ? T[1].trim() : "Partition inconnue";
    metaMeter.value = M ? M[1].trim() : "4/4";
    metaKey.value = K ? K[1].trim() : "C";

    // 3. Isoler les notes (tout ce qui n'est pas un header)
    const lines = abcCode.split('\n');
    // On garde L: s'il existe pour la référence
    const unitLength = L ? L[0] : "L:1/4"; 
    
    // On filtre pour ne garder que la musique
    const musicLines = lines.filter(line => !/^[A-Z]:/.test(line));
    originalNotesBody = unitLength + "\n" + musicLines.join('\n');
}

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    let imgFile = file;

    uploadText.innerHTML = `<strong>Analyse IA...</strong><br>Détection Rythme & Tonalité 🎼`;
    uploadZone.style.borderColor = "#00e5ff";

    try {
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

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS : On remplit le Dashboard
        parseABC(data.abc);
        
        uploadText.innerHTML = `<strong>Terminé !</strong><br>Vérifiez les infos ci-dessous.<br><button onclick="window.location.reload()" style="background:#333;color:white;border:none;padding:5px;margin-top:5px;cursor:pointer">❌ Annuler</button>`;
        uploadZone.style.borderColor = "#00ff00";
        dashboard.style.display = "block";

    } catch (e) {
        uploadText.innerHTML = `Erreur : ${e.message} <br><button onclick="window.location.reload()">Réessayer</button>`;
        uploadZone.style.borderColor = "red";
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    if (!originalNotesBody) { alert("Chargez une partition !"); return; }

    const keySelect = document.getElementById('transposition');
    const instrumentKey = keySelect.value;
    
    // Décalage visuel pour l'instrument
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    if (instrumentKey === "Eb") visualTranspose = 9;
    if (instrumentKey === "F") visualTranspose = 7;

    // On reconstruit le ABC propre avec les valeurs du Dashboard (au cas où l'utilisateur les a corrigées)
    const finalABC = `
X:1
T:${metaTitle.value}
M:${metaMeter.value}
K:${metaKey.value}
%%staffwidth 800
${originalNotesBody}
|]`;

    document.getElementById('final-title').innerText = "Résultat pour : " + keySelect.options[keySelect.selectedIndex].text;
    resultZone.style.display = "block";

    // Rendu
    const visualObj = ABCJS.renderAbc("paper", finalABC, {
        responsive: "resize",
        visualTranspose: visualTranspose // La bibliothèque gère tout !
    });

    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj[0] }).then(() => synth.setTune(visualObj[0], false));
    }
    
    resultZone.scrollIntoView({behavior: "smooth"});
});
