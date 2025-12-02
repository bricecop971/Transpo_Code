// =========================================================
//  SCRIPT.JS - VERSION FINALE (COMPRESSION AUTOMATIQUE)
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

// --- 1. OUTILS DE TRAITEMENT ---

// Convertit un fichier en texte pour l'envoi
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// CRUCIAL : Compresse l'image pour éviter le crash serveur
async function compressImage(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // On limite la largeur à 1024px (Léger et suffisant pour l'IA)
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

    // Export en JPEG qualité 60%
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.6));
}

// Convertit PDF -> Image
async function convertPdfToImage(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 }); // Zoom normal
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
}

// --- 2. GESTION DU CHARGEMENT ---

fileInput.addEventListener('change', async function() {
    if (fileInput.files.length > 0) {
        const originalFile = fileInput.files[0];
        let imageToProcess;

        uploadText.innerHTML = `<strong>Optimisation...</strong><br>Traitement de l'image 🖼️`;
        uploadZone.style.borderColor = "#00e5ff";
        uploadZone.style.boxShadow = "0 0 20px rgba(0, 229, 255, 0.5)";

        try {
            // A. PRÉPARATION ET COMPRESSION
            if (originalFile.type === 'application/pdf') {
                uploadText.innerHTML = `Lecture PDF...`;
                const pdfBlob = await convertPdfToImage(originalFile);
                // On compresse le résultat du PDF
                imageToProcess = await compressImage(new File([pdfBlob], "temp.jpg"));
                
                uploadZone.style.backgroundImage = "none";
                uploadZone.style.backgroundColor = "rgba(255, 0, 0, 0.1)";

            } else if (originalFile.type.startsWith('image/')) {
                // Affichage
                const reader = new FileReader();
                reader.onload = e => {
                    uploadZone.style.backgroundImage = `url(${e.target.result})`;
                    uploadZone.style.backgroundSize = "cover";
                    uploadZone.style.backgroundPosition = "center";
                };
                reader.readAsDataURL(originalFile);

                // Compression
                imageToProcess = await compressImage(originalFile);
            } else {
                alert("Format non supporté. Utilisez JPG, PNG ou PDF.");
                return;
            }

            // B. ENVOI À L'IA
            uploadText.innerHTML = `<strong>L'IA analyse...</strong><br>Envoi au serveur 🚀`;
            
            const base64 = await getBase64(imageToProcess);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
            });

            // Lecture sécurisée de la réponse
            const textResponse = await response.text();

            if (!response.ok) throw new Error(`Erreur ${response.status}: ${textResponse}`);

            let result;
            try { result = JSON.parse(textResponse); } 
            catch (e) { throw new Error("Réponse serveur illisible (Crash possible)"); }

            if (result.notes) {
                notesInput.value = result.notes.trim();
                uploadText.innerHTML = `<strong>Succès !</strong><br>Notes trouvées.`;
                uploadZone.style.borderColor = "#00ff00";
                notesInput.style.backgroundColor = "#333";
                setTimeout(() => notesInput.style.backgroundColor = "#1e1e1e", 500);
            } else {
                throw new Error(result.error || "Aucune note détectée");
            }

        } catch (error) {
            console.error(error);
            uploadText.innerHTML = `<strong>Échec</strong><br>Réessayez.`;
            uploadZone.style.borderColor = "red";
            alert("⚠️ " + error.message);
        }
    }
});


// --- 3. LOGIQUE MUSICALE (Reste inchangé) ---
const scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const englishToFrenchDict = { "C": "Do", "C#": "Do#", "D": "Ré", "D#": "Ré#", "E": "Mi", "F": "Fa", "F#": "Fa#", "G": "Sol", "G#": "Sol#", "A": "La", "A#": "La#", "B": "Si" };

function translateToEnglish(text) {
    return text.replace(/Do#/gi, "C#").replace(/Do/gi, "C").replace(/Ré#/gi, "D#").replace(/Re#/gi, "D#").replace(/Ré/gi, "D").replace(/Re/gi, "D").replace(/Mi/gi, "E").replace(/Fa#/gi, "F#").replace(/Fa/gi, "F").replace(/Sol#/gi, "G#").replace(/Sol/gi, "G").replace(/La#/gi, "A#").replace(/La/gi, "A").replace(/Si/gi, "B");
}

function transposeNote(note, semitones) {
    let index = scale.indexOf(note.toUpperCase());
    if (index === -1) return note;
    let newIndex = index + semitones;
    if (newIndex >= 12) newIndex = newIndex - 12;
    if (newIndex < 0) newIndex = newIndex + 12;
    return scale[newIndex];
}

function convertToAbcFormat(notesArray) {
    return notesArray.map(note => {
        if (note.length > 1 && note[1] === "#") return "^" + note[0];
        return note;
    }).join(" ");
}

function drawSheetMusic(notesArray) {
    const abcNotes = convertToAbcFormat(notesArray);
    const abcString = `X:1\nT:Partition Transposee\nM:4/4\nL:1/4\nQ:120\nK:C\n%%staffwidth 1000\n%%stretchlast 1\n${abcNotes}|]`;
    const visualObj = ABCJS.renderAbc("paper", abcString, { responsive: "resize", clickListener: null });
    if (ABCJS.synth.supportsAudio()) {
        const synthControl = new ABCJS.synth.SynthController();
        synthControl.load("#audio", null, { displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true });
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj[0] }).then(() => synthControl.setTune(visualObj[0], false));
    }
}

transposeBtn.addEventListener('click', function() {
    const instrumentName = selectInstrument.options[selectInstrument.selectedIndex].text;
    const instrumentKey = selectInstrument.value;
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
            if (!text || text.trim() === "") { alert("Aucune note à transposer !"); return; }
            
            const isFrench = /Do|Re|Ré|Mi|Fa|Sol|La|Si/i.test(text);
            let englishText = translateToEnglish(text);
            let words = englishText.trim().split(/\s+/);
            let rawTransposedNotes = [];
            
            let newNotesArray = words.map(word => {
                if (!word) return "";
                let notePart = "", suffix = "";
                if (word.length > 1 && word[1] === "#") { notePart = word.substring(0, 2); suffix = word.substring(2); } 
                else { notePart = word.substring(0, 1); suffix = word.substring(1); }
                let transposedNote = transposeNote(notePart, shift);
                rawTransposedNotes.push(transposedNote);
                let displayNote = transposedNote;
                if (isFrench && englishToFrenchDict[transposedNote]) displayNote = englishToFrenchDict[transposedNote];
                return displayNote + suffix;
            });

            instrumentDisplay.innerText = instrumentName;
            resultNotes.innerText = newNotesArray.join("  ");
            drawSheetMusic(rawTransposedNotes);
            resultZone.style.display = "block";
            resultZone.scrollIntoView({behavior: "smooth"});
        } catch (e) { alert("Erreur : " + e.message); }
    }, 300);
});

resetBtn.addEventListener('click', () => window.location.reload());
printBtn.addEventListener('click', (e) => { e.preventDefault(); window.print(); });