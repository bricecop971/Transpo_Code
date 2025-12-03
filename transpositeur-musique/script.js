// =========================================================
//  SCRIPT.JS - VERSION FINALISÉE (RESPECT DU RYTHME)
// =========================================================

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('.upload-zone p');
const transposeBtn = document.querySelector('button');
const resultZone = document.getElementById('result-zone');
const instrumentDisplay = document.getElementById('instrument-display');
const selectInstrument = document.getElementById('transposition');
const notesInput = document.getElementById('notes-input');
const resultNotes = document.getElementById('result-notes');
const resetBtn = document.getElementById('reset-btn');
const printBtn = document.getElementById('print-btn');

let originalAbcString = ""; 

// --- OUTILS ---
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

// --- CHARGEMENT ---
fileInput.addEventListener('change', async function() {
    if (fileInput.files.length > 0) {
        const originalFile = fileInput.files[0];
        let imageToProcess;

        uploadText.innerHTML = `
            <strong>Analyse du Rythme & Tonalité...</strong><br>Patience 🎼<br>
            <button onclick="window.location.reload()" style="background:#d32f2f; border:none; color:white; padding:5px; border-radius:5px; margin-top:10px; cursor:pointer;">❌ Annuler</button>
        `;
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
            if (!data.abc) throw new Error("L'IA n'a pas renvoyé de code ABC valide.");

            // SUCCÈS : On garde le code exact de l'IA (qui contient maintenant M: et K:)
            originalAbcString = data.abc;
            notesInput.value = originalAbcString;

            uploadText.innerHTML = `<strong>Partition Détectée !</strong><br>Rythme et Clés trouvés.<br>Choisissez l'instrument ci-dessous.`;
            uploadZone.style.borderColor = "#00ff00";

        } catch (error) {
            console.error(error);
            uploadText.innerHTML = `<strong>Erreur</strong><br>${error.message}<br><button onclick="window.location.reload()">Réessayer</button>`;
            uploadZone.style.borderColor = "red";
        }
    }
});

// --- TRANSPOSITION ---
transposeBtn.addEventListener('click', function() {
    let abcToRender = notesInput.value || originalAbcString;
    
    if (!abcToRender) {
        alert("Veuillez d'abord charger une partition !");
        return;
    }

    const instrumentKey = selectInstrument.value;
    const instrumentName = selectInstrument.options[selectInstrument.selectedIndex].text;
    
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;
    else if (instrumentKey === "Eb") visualTranspose = 9;
    else if (instrumentKey === "F") visualTranspose = 7;

    instrumentDisplay.innerText = instrumentName;
    resultZone.style.display = "block";

    // ON AJOUTE JUSTE LE STYLE VISUEL (Largeur)
    // Mais on ne touche pas aux headers musicaux (M:, K:, L:) qui sont dans abcToRender
    if (!abcToRender.includes("%%staffwidth")) {
        abcToRender = "%%staffwidth 1000\n%%stretchlast 1\n" + abcToRender;
    }

    const renderParams = {
        responsive: "resize",
        visualTranspose: visualTranspose, // C'est abcjs qui fait le calcul savant ici
        paddingtop: 20,
        paddingbottom: 20,
        paddingleft: 20,
        paddingright: 20
    };

    const visualObj = ABCJS.renderAbc("paper", abcToRender, renderParams);

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
