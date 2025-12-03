// =========================================================
//  SCRIPT.JS - VERSION FINALE (RYTHME + UX)
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

// --- 1. OUTILS DIVERS ---

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
    const viewport = page.getViewport({ scale: 1.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
}

// Fonction pour recharger la page (Bouton Annuler)
function resetPage() {
    window.location.reload();
}

// --- 2. GESTION DU CHARGEMENT ---

fileInput.addEventListener('change', async function() {
    if (fileInput.files.length > 0) {
        const originalFile = fileInput.files[0];
        let imageToProcess;

        // UX : Bouton "Changer de fichier" apparait
        // On remplace le texte par un message + un bouton rouge pour annuler
        uploadText.innerHTML = `
            <strong>Traitement en cours...</strong><br>Optimisation de l'image 🖼️<br>
            <button onclick="window.location.reload()" style="background:red; border:none; color:white; padding:5px 10px; border-radius:5px; margin-top:10px; cursor:pointer; font-size:12px;">❌ Changer de fichier</button>
        `;
        
        // UX : Couleur Bleu (au lieu de rouge)
        uploadZone.style.borderColor = "#00e5ff";
        uploadZone.style.boxShadow = "0 0 20px rgba(0, 229, 255, 0.5)";

        try {
            if (originalFile.type === 'application/pdf') {
                uploadText.innerHTML = `Lecture PDF... <br><button onclick="window.location.reload()" style="background:#333; border:1px solid #555; color:white; padding:5px; border-radius:5px; margin-top:5px; cursor:pointer;">❌ Annuler</button>`;
                const pdfBlob = await convertPdfToImage(originalFile);
                imageToProcess = await compressImage(new File([pdfBlob], "temp.jpg"));
                
                // UX : Fond BLEU TRANSPARENT (au lieu de rouge)
                uploadZone.style.backgroundImage = "none";
                uploadZone.style.backgroundColor = "rgba(0, 229, 255, 0.1)"; 

            } else if (originalFile.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = e => {
                    uploadZone.style.backgroundImage = `url(${e.target.result})`;
                    uploadZone.style.backgroundSize = "cover";
                    uploadZone.style.backgroundPosition = "center";
                };
                reader.readAsDataURL(originalFile);
                imageToProcess = await compressImage(originalFile);
            } else {
                alert("Format non supporté."); return;
            }

            // ENVOI IA
            uploadText.innerHTML = `<strong>L'IA analyse le rythme...</strong><br>Envoi au serveur 🚀`;
            
            const base64 = await getBase64(imageToProcess);
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
            });

            const textResponse = await response.text();
            if (!response.ok) throw new Error(`Erreur ${response.status}: ${textResponse}`);
            
            let result;
            try { result = JSON.parse(textResponse); } catch (e) { throw new Error("Réponse serveur illisible"); }

            if (result.notes) {
                // On nettoie un peu le résultat (enlève les retours à la ligne)
                notesInput.value = result.notes.replace(/\n/g, " ").trim();
                
                uploadText.innerHTML = `<strong>Succès !</strong><br>Partition détectée.<br><button onclick="window.location.reload()" style="background:#333; border:1px solid #555; color:white; padding:5px; border-radius:5px; margin-top:5px; cursor:pointer; font-size:12px;">❌ Changer de fichier</button>`;
                uploadZone.style.borderColor = "#00ff00";
                
                notesInput.style.backgroundColor = "#333";
                setTimeout(() => notesInput.style.backgroundColor = "#1e1e1e", 500);
            } else {
                throw new Error(result.error || "Aucune note détectée");
            }

        } catch (error) {
            console.error(error);
            uploadText.innerHTML = `<strong>Échec</strong><br><button onclick="window.location.reload()">Réessayer</button>`;
            uploadZone.style.borderColor = "red";
            alert("⚠️ " + error.message);
        }
    }
});


// --- 3. NOUVEAU MOTEUR DE TRANSPOSITION (COMPATIBLE ABC/RYTHME) ---

// Les 12 demi-tons
const semiTones = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Fonction pour transposer un "Token" ABC (ex: "^C'2" ou "_E/2")
function transposeABCToken(token, shift) {
    // Regex magique qui découpe : (Accidentel)(Note)(Octave/Durée)
    // 1: ^=_ (Optionnel)
    // 2: A-G or a-g (La note)
    // 3: Tout le reste (',2/ etc)
    const match = token.match(/^([_\^=]?)([a-gA-G])(.*)$/);
    
    if (!match) return token; // Si ce n'est pas une note (ex: barre de mesure |), on renvoie tel quel
    
    let accidental = match[1]; // ^, _, = ou vide
    let noteChar = match[2];   // C ou c
    let suffix = match[3];     // '2 etc.

    // On normalise la note en Majuscule pour chercher dans notre tableau
    let noteUpper = noteChar.toUpperCase();
    
    // On trouve l'index de base (C=0, D=2, E=4...)
    let baseIndex = semiTones.indexOf(noteUpper);
    
    // On ajuste selon l'accidentel ABC
    if (accidental === "^") baseIndex += 1;
    if (accidental === "_") baseIndex -= 1;
    
    // On calcule le nouvel index
    let newIndex = baseIndex + shift;
    
    // On gère les octaves (si on dépasse 12, on doit peut-être ajouter une apostrophe ' ou virgule ,)
    // Pour simplifier ici, on fait juste le modulo 12
    while (newIndex < 0) newIndex += 12;
    while (newIndex >= 12) newIndex -= 12;
    
    // On récupère la nouvelle note (ex: F#)
    let newNoteRaw = semiTones[newIndex];
    
    // On convertit le format "F#" en format ABC "^F"
    let newAccidental = "";
    let newNoteLetter = newNoteRaw.charAt(0);
    
    if (newNoteRaw.length > 1 && newNoteRaw[1] === "#") {
        newAccidental = "^";
    }
    
    // On remet la casse (Minuscule si c'était minuscule)
    if (noteChar === noteChar.toLowerCase()) {
        newNoteLetter = newNoteLetter.toLowerCase();
    }
    
    return newAccidental + newNoteLetter + suffix;
}


function drawSheetMusic(abcString) {
    // On s'assure que le header ABC est propre
    const finalAbc = `X:1\nT:Partition Transposee\nM:4/4\nL:1/4\nQ:120\nK:C\n%%staffwidth 1000\n%%stretchlast 1\n${abcString}|]`;
    
    const visualObj = ABCJS.renderAbc("paper", finalAbc, { responsive: "resize", clickListener: null });
    
    if (ABCJS.synth.supportsAudio()) {
        const synthControl = new ABCJS.synth.SynthController();
        synthControl.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj[0] }).then(() => synthControl.setTune(visualObj[0], false));
    }
}

transposeBtn.addEventListener('click', function() {
    const instrumentKey = selectInstrument.value;
    const instrumentName = selectInstrument.options[selectInstrument.selectedIndex].text;
    
    let shift = 0;
    if (instrumentKey === "Bb") shift = 2; else if (instrumentKey === "Eb") shift = 9; else if (instrumentKey === "F") shift = 7;
    
    const originalText = transposeBtn.innerText;
    transposeBtn.innerText = "Calcul...";
    transposeBtn.style.opacity = "0.5";

    setTimeout(function() {
        transposeBtn.innerText = originalText;
        transposeBtn.style.opacity = "1";
        try {
            let text = notesInput.value;
            if (!text || text.trim() === "") { alert("Aucune note !"); return; }
            
            // On sépare par espaces
            let tokens = text.trim().split(/\s+/);
            
            // On transpose chaque token en gardant le rythme
            let transposedTokens = tokens.map(token => transposeABCToken(token, shift));
            
            let resultString = transposedTokens.join(" ");

            instrumentDisplay.innerText = instrumentName;
            // On affiche le code ABC transposé dans la zone texte
            resultNotes.innerText = resultString;
            
            drawSheetMusic(resultString);
            
            resultZone.style.display = "block";
            resultZone.scrollIntoView({behavior: "smooth"});
        } catch (e) { alert("Erreur : " + e.message); }
    }, 300);
});

resetBtn.addEventListener('click', () => window.location.reload());
printBtn.addEventListener('click', (e) => { e.preventDefault(); window.print(); });
