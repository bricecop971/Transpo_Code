// SCRIPT.JS - VERSION DIAGNOSTIC RAPIDE

const fileInput = document.getElementById('partition-upload');
const uploadZone = document.querySelector('.upload-zone');
const uploadText = document.getElementById('upload-text') || document.querySelector('p');
const transposeBtn = document.getElementById('transpose-btn');
const resultZone = document.getElementById('result-zone');

let originalAbcString = "";

// Outils
function getBase64(file) {
    return new Promise((r, j) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => r(reader.result.split(',')[1]);
        reader.onerror = j;
    });
}

// Fonction simple pour compresser (évite les erreurs de taille)
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

// 1. CHARGEMENT
fileInput.addEventListener('change', async function() {
    if (!fileInput.files.length) return;
    
    uploadText.innerHTML = "Analyse rythmique en cours...";
    if (uploadZone) uploadZone.style.borderColor = "blue";

    try {
        let file = fileInput.files[0];
        // On compresse toujours pour être sûr
        const compressedFile = await compressImage(file);
        const base64 = await getBase64(compressedFile);

        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        originalAbcString = data.abc;
        
        // AFFICHAGE DEBUG
        console.log("Code ABC reçu :", originalAbcString);
        alert("Code reçu ! Vérifiez s'il y a des chiffres (ex: C2, G/2) :\n" + originalAbcString.substring(0, 100) + "...");

        uploadText.innerHTML = "Analyse terminée ! Cliquez sur Transposer.";
        if (uploadZone) uploadZone.style.borderColor = "green";

    } catch (e) {
        alert("Erreur: " + e.message);
    }
});

// 2. TRANSPOSITION
if (transposeBtn) {
    transposeBtn.addEventListener('click', function() {
        if (!originalAbcString) { alert("Chargez une image !"); return; }
        
        const instrumentKey = document.getElementById('transposition').value;
        let visualTranspose = 0;
        if (instrumentKey === "Bb") visualTranspose = 2;
        if (instrumentKey === "Eb") visualTranspose = 9;
        if (instrumentKey === "F") visualTranspose = 7;

        if (resultZone) resultZone.style.display = "block";

        ABCJS.renderAbc("paper", originalAbcString, {
            responsive: "resize",
            visualTranspose: visualTranspose,
            staffwidth: 800
        });
    });
}
