// SCRIPT.JS - VERSION ASSISTÉE ET TRANSPOSITION FINALE

const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const inspector = document.getElementById('inspector');
const abcEditor = document.getElementById('abc-editor');
const refreshBtn = document.getElementById('refresh-btn');
const meterSelect = document.getElementById('meter-select');
const transposeBtn = document.getElementById('transpose-btn');
const finalResultZone = document.getElementById('final-result-zone');
const transposedPaper = document.getElementById('transposed-paper');
const audioPlayer = document.getElementById('audio-player');

// --- OUTILS IMAGE ---
// Ces fonctions permettent de lire et compresser les images/PDF
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


// --- FONCTION D'AFFICHAGE DU CODE ORIGINAL ---
function renderABC() {
    const code = abcEditor.value;
    ABCJS.renderAbc("paper", code, {
        responsive: "resize",
        staffwidth: 800
    });
}

// --- CHARGEMENT DU FICHIER ET APPEL API ---
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    statusText.innerHTML = `⏳ Analyse en cours... (Sélectionnez la signature de temps)`;
    inspector.style.display = "none";

    try {
        let file = fileInput.files[0];
        let imgFile;
        const selectedMeter = meterSelect.value;

        // Préparation fichier
        if (file.type === 'application/pdf') {
            const blob = await convertPdfToImage(file);
            imgFile = new File([blob], "temp.jpg");
        } else {
            imgFile = await compressImage(file);
        }

        const base64 = await getBase64(imgFile);

        // Appel API avec le meter de l'utilisateur
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                image: base64, 
                mimeType: 'image/jpeg',
                meter: selectedMeter // ENVOI DU PARAMÈTRE DE L'UTILISATEUR
            })
        });

        if (!res.ok) {
            statusText.innerHTML = `❌ Erreur Serveur : Statut ${res.status}. Timeout probable.`;
            return; 
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // SUCCÈS : On affiche le code brut
        abcEditor.value = data.abc || "Erreur: Pas de code ABC reçu.";
        
        inspector.style.display = "block";
        statusText.innerHTML = `✅ Analyse terminée. Vérifiez et corrigez au besoin.`;
        
        renderABC(); // Premier dessin

    } catch (e) {
        statusText.innerHTML = `❌ Erreur critique : ${e.message}`;
        console.error('Erreur Critique:', e);
    }
});

// L'utilisateur corrige le code ABC ou change la mesure
refreshBtn.addEventListener('click', renderABC);
meterSelect.addEventListener('change', renderABC); // Redessine si l'utilisateur change la mesure

// --- TRANSPOSITION FINALE ---
transposeBtn.addEventListener('click', function() {
    const originalAbc = abcEditor.value;
    if (!originalAbc) { alert("Analyse d'abord une partition !"); return; }

    const keySelect = document.getElementById('instrument');
    const instrumentKey = keySelect.value;
    const instrumentName = keySelect.options[keySelect.selectedIndex].text;
    
    // Calcul transposition (Demi-tons)
    let transposeSemitones = 0;
    if (instrumentKey === "Bb") transposeSemitones = 2; 
    if (instrumentKey === "Eb") transposeSemitones = 9; 
    if (instrumentKey === "F") transposeSemitones = 7; 
    // Pour C, c'est 0

    // Affichage des résultats
    document.getElementById('transpose-title').innerText = `Résultat Transposé pour ${instrumentName}`;
    finalResultZone.style.display = "block";

    // 1. RENDU VISUEL ET MIDI (Avec transposition)
    const visualObj = ABCJS.renderAbc("transposed-paper", originalAbc, {
        responsive: "resize",
        visualTranspose: transposeSemitones // Décale les notes sur la portée
    });
    
    // 2. RENDU AUDIO SYNCHRONISÉ
    if (ABCJS.synth.supportsAudio()) {
        const synth = new ABCJS.synth.SynthController();
        synth.load("#audio-player", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true });
        
        const createSynth = new ABCJS.synth.CreateSynth();
        
        // La clé : on décale le son aussi !
        createSynth.init({ 
            visualObj: visualObj[0],
            options: { 
                midiTranspose: transposeSemitones // Synchronise le son avec l'image
            } 
        }).then(() => synth.setTune(visualObj[0], false));
    }
    
    finalResultZone.scrollIntoView({behavior: "smooth"});
});
