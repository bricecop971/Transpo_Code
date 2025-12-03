// =========================================================
//  SCRIPT.JS - VERSION PRO (ABC NATIF + TRANSPOSITION VISUELLE)
// =========================================================

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.querySelector('.upload-zone p');
const transposeBtn = document.querySelector('button');
const resultZone = document.getElementById('result-zone');
const instrumentDisplay = document.getElementById('instrument-display');
const selectInstrument = document.getElementById('transposition');
const notesInput = document.getElementById('notes-input');
const resultNotes = document.getElementById('result-notes'); // On s'en servira pour afficher le code ABC
const resetBtn = document.getElementById('reset-btn');
const printBtn = document.getElementById('print-btn');

// Variable pour stocker la partition originale reçue de l'IA
let originalAbcString = ""; 

// --- 1. OUTILS IMAGES (Compression & Base64) ---

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
    const viewport = page.getViewport({ scale: 1.5 }); // Meilleure qualité pour lire le rythme
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
}

// --- 2. CHARGEMENT ET ANALYSE IA ---

fileInput.addEventListener('change', async function() {
    if (fileInput.files.length > 0) {
        const originalFile = fileInput.files[0];
        let imageToProcess;

        // Interface Bleue (Chargement)
        uploadText.innerHTML = `
            <strong>Analyse approfondie...</strong><br>Lecture du rythme et des clés 🎼<br>
            <button onclick="window.location.reload()" style="background:#d32f2f; border:none; color:white; padding:5px 10px; border-radius:5px; margin-top:10px; cursor:pointer;">❌ Annuler</button>
        `;
        uploadZone.style.borderColor = "#00e5ff";
        uploadZone.style.boxShadow = "0 0 20px rgba(0, 229, 255, 0.5)";

        try {
            // Conversion PDF si besoin
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

            // Envoi au serveur
            const base64 = await getBase64(imageToProcess);
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
            });

            const data = await response.json();

            if (data.error) throw new Error(data.error);
            if (!data.abc) throw new Error("L'IA n'a pas renvoyé de partition valide.");

            // SUCCÈS ! On stocke le code ABC original
            originalAbcString = data.abc;
            
            // On l'affiche dans la zone de texte pour que l'utilisateur puisse le corriger si besoin
            notesInput.value = originalAbcString;

            uploadText.innerHTML = `<strong>Partition Capturée !</strong><br>Rythme et notes détectés.<br>Choisissez votre instrument ci-dessous.`;
            uploadZone.style.borderColor = "#00ff00";

        } catch (error) {
            console.error(error);
            uploadText.innerHTML = `<strong>Erreur</strong><br>${error.message}<br><button onclick="window.location.reload()">Réessayer</button>`;
            uploadZone.style.borderColor = "red";
        }
    }
});

// --- 3. TRANSPOSITION ET AFFICHAGE ---

transposeBtn.addEventListener('click', function() {
    // Si l'utilisateur a modifié le texte manuellement, on prend sa version
    let abcToRender = notesInput.value || originalAbcString;
    
    if (!abcToRender) {
        alert("Veuillez d'abord charger une partition !");
        return;
    }

    const instrumentKey = selectInstrument.value;
    const instrumentName = selectInstrument.options[selectInstrument.selectedIndex].text;
    
    // Définition du décalage en demi-tons
    let visualTranspose = 0;
    if (instrumentKey === "Bb") visualTranspose = 2;      // +2 demi-tons (Do -> Ré)
    else if (instrumentKey === "Eb") visualTranspose = 9; // +9 demi-tons (Do -> La)
    else if (instrumentKey === "F") visualTranspose = 7;  // +7 demi-tons (Do -> Sol)

    instrumentDisplay.innerText = instrumentName;
    resultZone.style.display = "block";

    // --- LE SECRET EST ICI ---
    // On utilise la fonction native de abcjs pour transposer visuellement
    // Cela préserve tout le reste (rythme, barres, titre...)
    const renderParams = {
        responsive: "resize",
        visualTranspose: visualTranspose, // C'est ça qui fait la magie !
        staffwidth: 1000,
        paddingtop: 20,
        paddingbottom: 20,
        paddingleft: 20,
        paddingright: 20
    };

    const visualObj = ABCJS.renderAbc("paper", abcToRender, renderParams);

    // Audio (Synthé)
    // Note : Pour que l'audio soit transposé aussi, on doit feinter un peu
    // car visualTranspose est purement visuel. Mais pour l'instant, concentrons-nous sur la partition.
    if (ABCJS.synth.supportsAudio()) {
        const synthControl = new ABCJS.synth.SynthController();
        synthControl.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        // Pour l'audio transposé, il faudrait idéalement régénérer le ABC, mais visualObj contient les notes affichées
        createSynth.init({ visualObj: visualObj[0] }).then(() => synthControl.setTune(visualObj[0], false));
    }
    
    resultZone.scrollIntoView({behavior: "smooth"});
});

resetBtn.addEventListener('click', resetPage);
printBtn.addEventListener('click', (e) => { e.preventDefault(); window.print(); });
