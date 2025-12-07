<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scanner de Partition</title>
    
    <style>
        body { background-color: #121212; color: #e0e0e0; font-family: sans-serif; text-align: center; }
        
        .upload-zone { 
            border: 2px dashed #00e5ff; 
            padding: 40px; 
            margin: 20px auto; 
            width: 80%; 
            background: rgba(0,229,255,0.05); 
            cursor: pointer; 
            border-radius: 10px;
        }
        .upload-zone:hover { background: rgba(0,229,255,0.1); }

        #dashboard {
            display: none;
            margin: 20px auto;
            width: 80%;
            background: #222;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #444;
        }

        .dash-row { display: flex; gap: 10px; justify-content: space-between; margin-bottom: 10px; }
        .dash-card { flex: 1; background: #111; padding: 10px; border-radius: 5px; text-align: left; }
        .dash-card label { font-size: 11px; color: #888; display: block; margin-bottom: 5px; }
        .dash-card input { width: 100%; background: transparent; border: none; color: #00e5ff; font-weight: bold; font-size: 16px; }

        #paper { background: white; color: black; padding: 10px; border-radius: 5px; margin-top: 20px; overflow-x: auto; }
        #paper svg { width: 100%; }
        #paper svg path { fill: black; stroke: black; }

        button { cursor: pointer; padding: 10px 20px; border-radius: 5px; border: none; font-weight: bold; margin: 5px; }
        .btn-primary { background: #00e5ff; color: black; }
        .btn-danger { background: #d32f2f; color: white; }
        
        /* Audio player fix */
        .abcjs-inline-audio { background: #222; border: 1px solid #444; border-radius: 5px; padding: 5px; margin-top: 10px; }
        .abcjs-btn { background: #00e5ff; color: black; border-radius: 3px; padding: 2px 6px; }
    </style>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.2.2/abcjs-basic-min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
    <script>
        // Configuration du Worker PDF (OBLIGATOIRE)
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    </script>
</head>
<body>

    <h1>🎼 Scanner de Partition</h1>

    <div class="upload-zone" onclick="document.getElementById('file-input').click()">
        <p id="upload-text">📂 Cliquez ici pour choisir un PDF ou une Image</p>
        <input type="file" id="file-input" accept="image/*,.pdf" style="display:none;">
    </div>

    <div id="dashboard">
        <div class="dash-row">
            <div class="dash-card"><label>TITRE</label><input type="text" id="meta-title"></div>
            <div class="dash-card"><label>MESURE</label><input type="text" id="meta-meter"></div>
            <div class="dash-card"><label>TONALITÉ</label><input type="text" id="meta-key"></div>
        </div>

        <div style="border-top: 1px solid #444; padding-top: 15px; margin-top: 15px;">
            <label style="color:#aaa; margin-right: 10px;">Transposer vers : </label>
            <select id="transposition" style="padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;">
                <option value="Eb">Saxophone Alto (Eb)</option>
                <option value="Bb">Trompette (Bb)</option>
                <option value="F">Cor (F)</option>
                <option value="C" selected>Piano / Flûte (C)</option>
            </select>
            <button id="transpose-btn" class="btn-primary">Transposer</button>
        </div>

        <div id="result-zone" style="display:none;">
            <h2 id="final-title" style="margin-top:20px;">Résultat</h2>
            <div id="audio"></div>
            <div id="paper"></div>
            <button onclick="window.location.reload()" class="btn-danger">Recommencer</button>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>
