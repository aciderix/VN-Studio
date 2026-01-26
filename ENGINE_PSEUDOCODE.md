# VN Engine - Pseudo-Code et Architecture Technique

**Document technique pour le portage React du moteur Virtual Navigator**

---

## 1. Vue d'ensemble de l'architecture

### 1.1 Structure du moteur

```
┌─────────────────────────────────────────────────────────────┐
│                    TVNApplication                            │
│  (Point d'entrée principal - Hérite de TApplication OWL)    │
├─────────────────────────────────────────────────────────────┤
│                      TVNFrame                                │
│  (Fenêtre principale - Hérite de TWindow OWL)               │
├──────────────────┬──────────────────┬───────────────────────┤
│   TVNWindow      │    TVNToolBar    │    TVNTimer           │
│ (Zone de rendu)  │ (Barre d'outils) │ (Gestion du temps)    │
├──────────────────┴──────────────────┴───────────────────────┤
│                   TVNProjectInfo                             │
│  (Données du projet - scènes, variables, commandes)         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Flux de données

```
Fichier projet (.vnp?)
    ↓
TVNProjectInfo::Load()
    ↓
TVNSceneArray (collection de scènes)
    ↓
TVNScene::Render()
    ↓
DirectDraw Surface / TVNBitmap
```

---

## 1.3 API vndllapi.dll - ANALYSE COMPLETE

**DLL d'API centrale analysée par rétro-ingénierie (12 KB)**

### Fonctions exportées

```cpp
// 1. InitVNCommandMessage() - Enregistre le message Windows personnalisé
// Adresse: 0x00401480
UINT InitVNCommandMessage() {
    // Enregistre "wm_vncommand" comme message Windows global
    return RegisterWindowMessageA("wm_vncommand");
}
// Retour: ID du message Windows (utilisé pour la communication inter-processus)

// 2. DirectDrawEnabled() - État de DirectDraw
// Adresse: 0x0040148f
BOOL DirectDrawEnabled() {
    return TRUE;  // Toujours activé (retourne 1)
}

// 3. VNDLLVarFind(VNVariable** head, const char* name) -> VNVariable*
// Adresse: 0x00401499
// Recherche une variable par nom (insensible à la casse)

// 4. VNDLLVarAddModify(VNVariable** head, const char* name, int value) -> VNVariable*
// Adresse: 0x004014dd
// Ajoute ou modifie une variable
```

### Protocole de communication

Le moteur utilise un message Windows personnalisé `wm_vncommand` pour:
- Communiquer entre les DLLs et l'exécutable principal
- Déclencher l'exécution de commandes VN
- Synchroniser les plugins

---

## 2. Classes principales - Pseudo-code

### 2.1 TVNApplication (Point d'entrée)

```cpp
class TVNApplication : public TApplication {
private:
    TVNFrame*        mainFrame;
    TVNProjectInfo*  projectInfo;
    TVNTimer*        timer;

public:
    // Constructeur
    TVNApplication() {
        // Initialiser le message custom pour les commandes VN
        InitVNCommandMessage();  // Importe depuis vndllapi.dll

        // Vérifier le mode couleur
        if (GetDeviceCaps(screenDC, BITSPIXEL) < 8) {
            MessageBox("Need 256 color mode at least.");
            return;
        }
    }

    // Initialisation
    void InitInstance() {
        mainFrame = new TVNFrame(this);
        mainFrame->Create();

        // Charger le projet si spécifié en ligne de commande
        string cmdLine = GetInitCmdLine();
        if (!cmdLine.empty()) {
            LoadProject(cmdLine);
        }
    }

    // Charger un projet
    bool LoadProject(string filename) {
        projectInfo = new TVNProjectInfo();
        return projectInfo->Load(filename);
    }

    // Boucle principale - traitement des événements
    void ProcessMessage(MSG& msg) {
        if (msg.message == wm_vncommand) {
            ProcessVNCommand(msg.wParam, msg.lParam);
        }
        // ... traitement standard
    }
};
```

### 2.2 TVNScene (Scène)

```cpp
class TVNScene : public TVNStreamable {
private:
    string              name;
    int                 index;
    TVNSceneProperties* properties;
    TVNBitmap*          backgroundImage;
    TVNHotspotArray*    hotspots;        // Zones cliquables
    TVNCommandArray*    commands;         // Commandes de la scène
    TVNEventCommandArray* eventCommands;  // Commandes événementielles
    TVNGdiObjectArray*  gdiObjects;       // Objets graphiques (textes, images)

public:
    // Charger depuis un flux
    void Read(ipstream& is) {
        is >> name;
        is >> index;
        properties->Read(is);
        backgroundImage->Load(is);

        // Charger les hotspots
        int hotspotCount;
        is >> hotspotCount;
        for (int i = 0; i < hotspotCount; i++) {
            TVNHotspot* hs = new TVNHotspot();
            hs->Read(is);
            hotspots->Add(hs);
        }

        // Charger les commandes
        int cmdCount;
        is >> cmdCount;
        for (int i = 0; i < cmdCount; i++) {
            TVNCommand* cmd = ReadCommand(is);
            commands->Add(cmd);
        }
    }

    // Afficher la scène
    void Render(TDC& dc) {
        // 1. Dessiner l'arrière-plan
        if (backgroundImage) {
            backgroundImage->Draw(dc, 0, 0);
        }

        // 2. Dessiner les objets GDI (images, textes)
        for (int i = 0; i < gdiObjects->GetCount(); i++) {
            gdiObjects->At(i)->Draw(dc);
        }

        // 3. Dessiner les hotspots (si mode debug)
        #ifdef DEBUG
        for (int i = 0; i < hotspots->GetCount(); i++) {
            hotspots->At(i)->DrawOutline(dc);
        }
        #endif
    }

    // Gérer un clic
    TVNHotspot* HitTest(int x, int y) {
        for (int i = 0; i < hotspots->GetCount(); i++) {
            if (hotspots->At(i)->Contains(x, y)) {
                return hotspots->At(i);
            }
        }
        return NULL;
    }

    // Exécuter les commandes d'entrée
    void OnEnter() {
        for (int i = 0; i < commands->GetCount(); i++) {
            commands->At(i)->Execute();
        }
    }
};
```

### 2.3 TVNCommand (Système de commandes/scripting)

```cpp
// Types de commandes
enum CommandType {
    CMD_GOTO_SCENE,      // Aller à une scène
    CMD_SET_VAR,         // Définir une variable
    CMD_INC_VAR,         // Incrémenter variable
    CMD_DEC_VAR,         // Décrémenter variable
    CMD_IF,              // Condition
    CMD_EXEC,            // Exécuter programme externe
    CMD_PLAY_SOUND,      // Jouer un son
    CMD_PLAY_MIDI,       // Jouer MIDI
    CMD_PLAY_VIDEO,      // Jouer vidéo AVI
    CMD_SHOW_IMAGE,      // Afficher image
    CMD_SHOW_TEXT,       // Afficher texte
    CMD_HIDE_OBJECT,     // Cacher objet
    CMD_TIMER_START,     // Démarrer timer
    CMD_TIMER_STOP,      // Arrêter timer
    CMD_SCROLL,          // Effet scroll
    CMD_ZOOM,            // Effet zoom
    // ... autres commandes
};

class TVNCommand : public TVNStreamable {
private:
    CommandType   type;
    TVNCommandParms* params;  // Paramètres spécifiques au type

public:
    // Lire depuis flux
    static TVNCommand* ReadCommand(ipstream& is) {
        string cmdName;
        is >> cmdName;

        TVNCommand* cmd = new TVNCommand();

        if (cmdName == "GOTO") {
            cmd->type = CMD_GOTO_SCENE;
            cmd->params = new TVNSceneParms();
        }
        else if (cmdName == "SETVAR") {
            cmd->type = CMD_SET_VAR;
            cmd->params = new TVNSetVarParms();
        }
        else if (cmdName == "IF") {
            cmd->type = CMD_IF;
            cmd->params = new TVNIfParms();
        }
        else if (cmdName == "WAVE") {
            cmd->type = CMD_PLAY_SOUND;
            cmd->params = new TVNFileNameParms();
        }
        else if (cmdName == "MIDI") {
            cmd->type = CMD_PLAY_MIDI;
            cmd->params = new TVNMidiParms();
        }
        else if (cmdName == "AVI") {
            cmd->type = CMD_PLAY_VIDEO;
            cmd->params = new TVNFileNameParms();
        }
        else if (cmdName == "IMAGE") {
            cmd->type = CMD_SHOW_IMAGE;
            cmd->params = new TVNImageParms();
        }
        else if (cmdName == "TEXT") {
            cmd->type = CMD_SHOW_TEXT;
            cmd->params = new TVNTextParms();
        }
        // ... autres commandes
        else {
            // Commande inconnue
            throw Exception("Unknown command: " + cmdName);
        }

        cmd->params->Read(is);
        return cmd;
    }

    // Exécuter la commande
    void Execute() {
        switch (type) {
            case CMD_GOTO_SCENE:
                GoToScene(((TVNSceneParms*)params)->sceneIndex);
                break;

            case CMD_SET_VAR:
                SetVariable(
                    ((TVNSetVarParms*)params)->varName,
                    ((TVNSetVarParms*)params)->value
                );
                break;

            case CMD_INC_VAR:
                IncrementVariable(((TVNIncVarParms*)params)->varName);
                break;

            case CMD_IF:
                if (EvaluateCondition(((TVNIfParms*)params)->condition)) {
                    ((TVNIfParms*)params)->thenCommand->Execute();
                } else if (((TVNIfParms*)params)->elseCommand) {
                    ((TVNIfParms*)params)->elseCommand->Execute();
                }
                break;

            case CMD_PLAY_SOUND:
                PlaySound(((TVNFileNameParms*)params)->filename, SND_ASYNC);
                break;

            case CMD_PLAY_MIDI:
                midiPlayer->Play(((TVNMidiParms*)params)->filename);
                break;

            case CMD_SHOW_IMAGE:
                ShowImageObject(
                    ((TVNImageParms*)params)->filename,
                    ((TVNImageParms*)params)->x,
                    ((TVNImageParms*)params)->y
                );
                break;

            // ... autres commandes
        }
    }
};
```

### 2.4 TVNVariable (Système de variables) - STRUCTURE EXACTE

**Extrait de vndllapi.dll - Structure confirmée par rétro-ingénierie:**

```cpp
// Structure exacte (264 bytes = 0x108)
// Extraite de VNDLLVarAddModify @ 0x004014dd
struct VNVariable {
    char        name[256];      // Offset 0x000 - Nom (converti en MAJUSCULES via strupr)
    int32_t     value;          // Offset 0x100 - Valeur entière (4 bytes)
    VNVariable* next;           // Offset 0x104 - Pointeur vers variable suivante
};
// Total: 0x108 (264 bytes)

// API exportée par vndllapi.dll:
// - VNDLLVarFind(VNVariable** head, const char* name) -> VNVariable*
// - VNDLLVarAddModify(VNVariable** head, const char* name, int value) -> VNVariable*

class TVNVariableList {
private:
    VNVariable* head;  // Tête de la liste chaînée

public:
    // Recherche insensible à la casse (utilise stricmp)
    VNVariable* Find(const char* name) {
        VNVariable* current = head;
        while (current != NULL) {
            if (stricmp(current->name, name) == 0) {
                return current;
            }
            current = current->next;
        }
        return NULL;
    }

    // Ajouter ou modifier une variable
    VNVariable* AddModify(const char* name, int value) {
        // Chercher si existe déjà
        VNVariable* existing = Find(name);
        if (existing) {
            existing->value = value;
            return existing;
        }

        // Créer nouvelle variable
        VNVariable* newVar = (VNVariable*)malloc(0x108);
        strcpy(newVar->name, name);
        strupr(newVar->name);  // Convertir en majuscules
        newVar->value = value;
        newVar->next = NULL;

        // Ajouter à la fin de la liste
        if (head == NULL) {
            head = newVar;
        } else {
            VNVariable* last = head;
            while (last->next != NULL) {
                last = last->next;
            }
            last->next = newVar;
        }
        return newVar;
    }

    int GetValue(const char* name) {
        VNVariable* var = Find(name);
        return var ? var->value : 0;
    }

    void Increment(const char* name) {
        VNVariable* var = Find(name);
        if (var) var->value++;
    }

    void Decrement(const char* name) {
        VNVariable* var = Find(name);
        if (var) var->value--;
    }
};
```

**Notes importantes:**
- Les noms de variables sont insensibles à la casse (comparaison avec `stricmp`)
- Les noms sont stockés en MAJUSCULES (conversion avec `strupr`)
- Les valeurs sont uniquement des entiers 32-bit signés
- Structure en liste chaînée simple (pas un tableau)

### 2.5 TVNHotspot (Zone cliquable)

```cpp
class TVNHotspot : public TVNStreamable {
private:
    string          name;
    TRegion*        region;           // Région polygonale ou rectangulaire
    string          cursorFile;       // Curseur personnalisé
    TVNCommandArray* clickCommands;   // Commandes au clic
    TVNCommandArray* enterCommands;   // Commandes à l'entrée (survol)
    TVNCommandArray* exitCommands;    // Commandes à la sortie
    bool            enabled;

public:
    void Read(ipstream& is) {
        is >> name;

        // Lire la forme
        int shapeType;
        is >> shapeType;

        if (shapeType == 0) {  // Rectangle
            TRect rect;
            is >> rect.left >> rect.top >> rect.right >> rect.bottom;
            region = new TRegion(rect);
        }
        else {  // Polygone
            int pointCount;
            is >> pointCount;
            TPoint* points = new TPoint[pointCount];
            for (int i = 0; i < pointCount; i++) {
                is >> points[i].x >> points[i].y;
            }
            region = new TRegion(points, pointCount);
        }

        is >> cursorFile;
        is >> enabled;

        // Lire les commandes
        ReadCommands(is, clickCommands);
        ReadCommands(is, enterCommands);
        ReadCommands(is, exitCommands);
    }

    bool Contains(int x, int y) {
        return enabled && region->Contains(TPoint(x, y));
    }

    void OnClick() {
        for (int i = 0; i < clickCommands->GetCount(); i++) {
            clickCommands->At(i)->Execute();
        }
    }

    void OnMouseEnter() {
        // Changer le curseur
        if (!cursorFile.empty()) {
            HCURSOR cursor = LoadCursorFromFile(cursorFile.c_str());
            SetCursor(cursor);
        }

        // Exécuter commandes d'entrée
        for (int i = 0; i < enterCommands->GetCount(); i++) {
            enterCommands->At(i)->Execute();
        }
    }

    void OnMouseExit() {
        SetCursor(LoadCursor(NULL, IDC_ARROW));

        for (int i = 0; i < exitCommands->GetCount(); i++) {
            exitCommands->At(i)->Execute();
        }
    }
};
```

### 2.6 Système Audio (TVNMciBase, TVNWaveMedia, TVNMidiMedia)

```cpp
class TVNMciBase {
protected:
    MCIDEVICEID deviceId;
    string      filename;
    bool        isPlaying;
    bool        isLooping;

public:
    virtual bool Open(string file) = 0;
    virtual void Play() = 0;
    virtual void Stop() = 0;
    virtual void Pause() = 0;
    virtual void SetVolume(int volume) = 0;  // 0-100
};

class TVNWaveMedia : public TVNMciBase {
public:
    bool Open(string file) {
        filename = file;
        // Utilise PlaySound ou MCI
        return true;
    }

    void Play() {
        if (isLooping) {
            PlaySound(filename.c_str(), NULL, SND_ASYNC | SND_LOOP);
        } else {
            PlaySound(filename.c_str(), NULL, SND_ASYNC);
        }
        isPlaying = true;
    }

    void Stop() {
        PlaySound(NULL, NULL, 0);
        isPlaying = false;
    }
};

class TVNMidiMedia : public TVNMciBase {
public:
    bool Open(string file) {
        MCI_OPEN_PARMS mciOpen;
        mciOpen.lpstrDeviceType = "sequencer";
        mciOpen.lpstrElementName = file.c_str();

        MCIERROR err = mciSendCommand(0, MCI_OPEN,
            MCI_OPEN_TYPE | MCI_OPEN_ELEMENT, (DWORD_PTR)&mciOpen);

        if (err == 0) {
            deviceId = mciOpen.wDeviceID;
            filename = file;
            return true;
        }
        return false;
    }

    void Play() {
        MCI_PLAY_PARMS mciPlay;
        mciSendCommand(deviceId, MCI_PLAY, 0, (DWORD_PTR)&mciPlay);
        isPlaying = true;
    }

    void Stop() {
        mciSendCommand(deviceId, MCI_STOP, 0, NULL);
        isPlaying = false;
    }
};
```

### 2.7 Effets visuels (TVNScrollFx, TVNZoomFx)

```cpp
class TVNTimerBasedFx {
protected:
    TVNTimer*   timer;
    int         duration;     // Durée en ms
    int         elapsed;      // Temps écoulé
    bool        isActive;

public:
    virtual void Start() {
        elapsed = 0;
        isActive = true;
        timer->Start(16);  // ~60 FPS
    }

    virtual void Stop() {
        isActive = false;
        timer->Stop();
    }

    virtual void OnTimer() = 0;

    float GetProgress() {
        return (float)elapsed / (float)duration;
    }
};

class TVNScrollFx : public TVNTimerBasedFx {
private:
    TVNBitmap*  sourceBitmap;
    int         direction;    // 0=haut, 1=bas, 2=gauche, 3=droite
    int         scrollX, scrollY;

public:
    void OnTimer() {
        float progress = GetProgress();

        switch (direction) {
            case 0: // Haut
                scrollY = (int)(sourceBitmap->GetHeight() * progress);
                break;
            case 1: // Bas
                scrollY = (int)(-sourceBitmap->GetHeight() * progress);
                break;
            case 2: // Gauche
                scrollX = (int)(sourceBitmap->GetWidth() * progress);
                break;
            case 3: // Droite
                scrollX = (int)(-sourceBitmap->GetWidth() * progress);
                break;
        }

        // Redessiner avec décalage
        Invalidate();

        elapsed += 16;
        if (elapsed >= duration) {
            Stop();
        }
    }
};

class TVNZoomFx : public TVNTimerBasedFx {
private:
    TVNBitmap*  sourceBitmap;
    float       startZoom;
    float       endZoom;
    int         centerX, centerY;

public:
    void OnTimer() {
        float progress = GetProgress();
        float currentZoom = startZoom + (endZoom - startZoom) * progress;

        // Calculer les dimensions zoomées
        int newWidth = (int)(sourceBitmap->GetWidth() * currentZoom);
        int newHeight = (int)(sourceBitmap->GetHeight() * currentZoom);

        // Calculer la position centrée
        int x = centerX - newWidth / 2;
        int y = centerY - newHeight / 2;

        // Étirer le bitmap
        StretchBlt(dc, x, y, newWidth, newHeight,
                   sourceBitmap->GetDC(), 0, 0,
                   sourceBitmap->GetWidth(), sourceBitmap->GetHeight(),
                   SRCCOPY);

        elapsed += 16;
        if (elapsed >= duration) {
            Stop();
        }
    }
};
```

---

## 3. Format de fichier projet - SPECIFICATIONS EXACTES

**Extrait par rétro-ingénierie de europeo.exe (fonction à 0x0041721d)**

### 3.1 Format VNFILE (Fichier projet .vnp)

Le fichier projet utilise la sérialisation Borland C++ (`ipstream`/`opstream` de bds52t.dll).

```
VNFILE_FORMAT {
    // En-tête
    string    magic;           // "VNFILE" (6 bytes null-terminated)
    TVNVersion version;        // Version via ipstream::readVersion()

    // Paramètres du projet
    TVNProjectParms projectParams;

    // Tableau des scènes
    uint16_t  sceneCount;
    TVNScene  scenes[sceneCount];

    // Variables globales
    TVNVariableArray variables;
}

TVNProjectParms {
    string    projectName;     // Nom du projet
    string    dataFilePath;    // Chemin vers le DATFILE
    uint16_t  displayWidth;    // Largeur d'affichage (ex: 640)
    uint16_t  displayHeight;   // Hauteur d'affichage (ex: 480)
    uint8_t   colorDepth;      // 8 (256 couleurs) ou 24 (TrueColor)
    TVNDisplayMode displayMode;
    // ... autres paramètres
}

TVNScene {
    string    name;            // Nom de la scène
    uint16_t  index;           // Index dans le projet
    TVNSceneProperties properties;

    // Image de fond
    string    backgroundFile;  // Fichier de fond (référence DATFILE)

    // Hotspots
    uint16_t  hotspotCount;
    TVNHotspot hotspots[hotspotCount];

    // Commandes d'entrée de scène
    uint16_t  commandCount;
    TVNCommand commands[commandCount];

    // Commandes événementielles
    TVNEventCommandArray eventCommands;

    // Objets graphiques
    TVNGdiObjectArray gdiObjects;
}

TVNHotspot {
    string    name;            // Nom (format: "HOTSPOT_%u")
    uint8_t   shapeType;       // 0=rectangle, 1=polygone

    // Si rectangle:
    TRect     bounds;          // left, top, right, bottom (4x int32)

    // Si polygone:
    uint16_t  pointCount;
    TPoint    points[pointCount];  // x, y (2x int32 chacun)

    string    cursorFile;      // Fichier curseur personnalisé
    bool      enabled;

    // Commandes
    uint16_t  clickCmdCount;
    TVNCommand clickCommands[clickCmdCount];
    uint16_t  enterCmdCount;
    TVNCommand enterCommands[enterCmdCount];
    uint16_t  exitCmdCount;
    TVNCommand exitCommands[exitCmdCount];
}

TVNCommand {
    uint16_t  type;            // Type de commande (voir CommandType)
    // Paramètres spécifiques selon le type
    union {
        TVNSceneParms     sceneParms;      // GOTO
        TVNSetVarParms    setVarParms;     // SETVAR
        TVNIncVarParms    incVarParms;     // INCVAR
        TVNDecVarParms    decVarParms;     // DECVAR
        TVNIfParms        ifParms;         // IF
        TVNExecParms      execParms;       // EXEC
        TVNFileNameParms  fileNameParms;   // WAVE, AVI, etc.
        TVNMidiParms      midiParms;       // MIDI
        TVNImageParms     imageParms;      // IMAGE
        TVNTextParms      textParms;       // TEXT
        TVNFontParms      fontParms;       // FONT
        TVNHtmlParms      htmlParms;       // HTML
        TVNDigitParms     digitParms;      // DIGIT
        TVNImgObjParms    imgObjParms;     // IMGOBJ
        TVNImgSeqParms    imgSeqParms;     // IMGSEQ
        TVNTextObjParms   textObjParms;    // TEXTOBJ
        TVNTimeParms      timeParms;       // TIME
        TVNConditionParms conditionParms;  // Condition IF
    } params;
}
```

### 3.2 Types de paramètres de commandes

```cpp
// Types de paramètres identifiés par rétro-ingénierie
TVNCommandParms     // Base class
TVNConditionParms   // Paramètres de condition (IF)
TVNDigitParms       // Affichage de chiffres
TVNExecParms        // Exécution programme externe
TVNFontParms        // Paramètres de police
TVNHotspotParms     // Paramètres de hotspot
TVNHtmlParms        // Texte HTML
TVNIfParms          // Structure conditionnelle
TVNImageParms       // Paramètres image
TVNMidiParms        // Paramètres MIDI
TVNProjectParms     // Paramètres projet
TVNRectParms        // Rectangle
TVNSceneParms       // Paramètres scène (GOTO)
TVNStringParms      // Chaîne de caractères
TVNTextParms        // Paramètres texte
TVNTimeParms        // Paramètres temporels
TVNFileNameParms    // Chemin de fichier (WAVE, AVI, etc.)
TVNSetVarParms      // SETVAR (nom + valeur)
TVNIncVarParms      // INCVAR (nom de variable)
TVNDecVarParms      // DECVAR (nom de variable)
TVNImgObjParms      // Objet image
TVNImgSeqParms      // Séquence d'images
TVNTextObjParms     // Objet texte
```

### 3.3 Format DATFILE (Ressources)

Le DATFILE contient toutes les ressources du projet dans un format conteneur.

```
DATFILE_FORMAT {
    string    magic;           // "DATFILE"

    // Index des ressources
    ResourceIndex {
        string  section;       // MAIN, LIMITS, PREFS, WAV, MID, PAL, IMG8, IMG24, AVI, TXT
        uint32  offset;        // Offset dans le fichier
        uint32  size;          // Taille des données
    }

    // Sections identifiées:
    MAIN     // Section principale
    LIMITS   // Limites/paramètres
    PREFS    // Préférences
    WAV      // Fichiers audio WAV
    MID      // Fichiers MIDI
    PAL      // Palettes de couleurs
    IMG8     // Images 8-bit (256 couleurs)
    IMG24    // Images 24-bit (TrueColor)
    AVI      // Fichiers vidéo AVI
    TXT      // Fichiers texte
}
```

### 3.4 Format VNSAVFILE (Sauvegarde)

```
VNSAVFILE_FORMAT {
    string    magic;           // "VNSAVFILE"

    // État de la session
    uint16_t  currentSceneIndex;

    // Variables
    uint16_t  variableCount;
    VNVariable variables[variableCount];  // Structure 264 bytes chacune

    // Historique de navigation
    uint16_t  historyCount;
    TVNHistData history[historyCount];
}
```

### 3.5 Format VNPALETTE

```
VNPALETTE_FORMAT {
    string    magic;           // "VNPALETTE"

    // Palette 256 couleurs
    uint8_t   entries[256][4]; // R, G, B, Flags pour chaque entrée
}
```

### 3.6 Lecture de chaînes (Borland string format)

Les chaînes Borland sont sérialisées avec:
```cpp
// Lecture via __brsh_qr8ipstreamr6string
void ReadString(ipstream& is, string& s) {
    uint16_t length;
    is >> length;
    s.resize(length);
    is.readBytes(s.data(), length);
}
```
```

---

## 4. Mapping vers React

### 4.1 Correspondance des classes

| Classe C++ | Composant React | Notes |
|-----------|-----------------|-------|
| TVNApplication | App.tsx | Context providers |
| TVNFrame | GameContainer.tsx | Layout principal |
| TVNWindow | GameCanvas.tsx | Canvas 2D |
| TVNScene | Scene.tsx | Composant scène |
| TVNHotspot | Hotspot.tsx | Zone cliquable SVG |
| TVNCommand | useCommands.ts | Hook de commandes |
| TVNVariable | useGameState.ts | Zustand store |
| TVNTimer | useTimer.ts | requestAnimationFrame |
| TVNBitmap | useImage.ts | Image loading hook |
| TVNWaveMedia | useAudio.ts | Web Audio API |
| TVNScrollFx | ScrollEffect.tsx | CSS transitions |
| TVNZoomFx | ZoomEffect.tsx | CSS transform |

### 4.2 Architecture React proposée

```
src/
├── components/
│   ├── GameContainer.tsx    # Conteneur principal
│   ├── GameCanvas.tsx       # Canvas de rendu
│   ├── Scene.tsx            # Scène active
│   ├── Hotspot.tsx          # Zone cliquable
│   ├── TextObject.tsx       # Objet texte
│   ├── ImageObject.tsx      # Objet image
│   ├── Toolbar.tsx          # Barre d'outils
│   └── effects/
│       ├── ScrollEffect.tsx
│       └── ZoomEffect.tsx
├── hooks/
│   ├── useGameState.ts      # État global
│   ├── useCommands.ts       # Système de commandes
│   ├── useAudio.ts          # Gestion audio
│   ├── useTimer.ts          # Timers/animations
│   └── useProject.ts        # Chargement projet
├── engine/
│   ├── CommandProcessor.ts  # Exécution commandes
│   ├── ProjectLoader.ts     # Parsing fichier projet
│   ├── SceneManager.ts      # Gestion scènes
│   └── VariableStore.ts     # Variables du jeu
├── types/
│   └── vn.types.ts          # Types TypeScript
└── App.tsx
```

---

## 5. Messages et chaînes extraites

### 5.1 Messages d'erreur

```
"Virtual Navigator Runtime"
"Error"
"Need 256 color mode at least."
"Unable to load file:\n%s."
"Invalid index. There is no scene at %i."
"Invalid index. There is no hotspot at %i."
"Unable to load data. You should install the application again."
"Unable to stretch bitmap"
"Unable to load the main bitmap:\n%s."
"Bitmap has no color table."
"Unknown file format:\n\"%s\"."
"Unknown command \"%s\"."
"Unknown event \"%s\"."
"Unable to load: no project file defined."
"Unable to save: no project file defined."
"Unable to find file:\n%s."
"Unable to load module:\n%s"
"Unable to start \"%s\", CD-ROM needed."
```

### 5.2 Actions de navigation

```
"Show Map"
"Turn on left" / "Left"
"Turn on right" / "Right"
"Forward"
"Backward"
"Zoom mode" / "Zoom"
"Preferences"
"Previous scene"
"Next scene"
"Show index" / "Index"
"Replay sound"
"Stop zoom mode"
"About Virtual Navigator"
```

### 5.3 Options utilisateur (de vnoption.dll)

```
"Preferences"
"Multimedia"
    - "Voices & Sounds"
    - "Midi Musics"
    - "Videos"
"Performances"
    - "Smooth zoom"
    - "Smooth Scrolling"
    - "Toolbar always visible"
"Image quality"
    - "256 colors"
    - "TrueColor"
    - "Textured background"
```

---

**Dernière mise à jour**: 2026-01-25
**Analysé par**: radare2 5.5.0
