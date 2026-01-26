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
    string    projectName;     // Nom du projet (offset +0x31)

    // Si version >= 0x2000d (2.0.13):
    string    extraField_2d;   // Champ additionnel (offset +0x35)

    // Toujours présent:
    // Paramètres d'affichage (offset +0x1d via fcn.00416781)
    uint16_t  displayWidth;    // Largeur d'affichage (offset +0x3d)
    uint16_t  displayHeight;   // Hauteur d'affichage (offset +0x41)

    // Si version >= 0x2000b (2.0.11):
    // Appel virtuel via objet à offset +0x49

    // Si version >= 0x2000b (2.0.11):
    uint16_t  extraWord_45;    // Champ additionnel (offset +0x45)

    // Si version >= 0x2000a (2.0.10):
    string    dataFilePath;    // Chemin vers le DATFILE (offset +0x39)

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

### 3.2 Commandes - LISTE COMPLETE (extraite de europeo.exe @ 0x43f700)

Les commandes sont stockées comme **chaînes de caractères en minuscules**, pas comme IDs binaires.

```
COMMANDES DE NAVIGATION
-----------------------
quit          - Quitter l'application
about         - Afficher la boîte "À propos"
prefs         - Ouvrir les préférences
prev          - Scène précédente
next          - Scène suivante
zoom          - Activer le mode zoom
scene         - Aller à une scène (scene nom_scene)
hotspot       - Référencer un hotspot
tiptext       - Afficher un texte d'aide

COMMANDES MÉDIA
---------------
playavi       - Jouer une vidéo AVI
playbmp       - Animer un bitmap
playwav       - Jouer un son WAV
playmid       - Jouer un fichier MIDI
playhtml      - Afficher du contenu HTML
playcda       - Jouer un CD Audio
playseq       - Jouer une séquence d'images
closeavi      - Arrêter la vidéo AVI
closemid      - Arrêter le MIDI
closewav      - Arrêter le son WAV
zoomin        - Zoom avant
zoomout       - Zoom arrière
pause         - Mettre en pause

COMMANDES D'AFFICHAGE
---------------------
addbmp        - Ajouter un bitmap (addbmp id,fichier,x,y)
delbmp        - Supprimer un bitmap
showbmp       - Afficher un bitmap
hidebmp       - Cacher un bitmap
addtext       - Ajouter du texte (addtext id,texte,x,y)
playtext      - Afficher du texte avec effet
font          - Définir la police
showobj       - Afficher un objet
hideobj       - Cacher un objet
delobj        - Supprimer un objet
defcursor     - Définir le curseur par défaut
invalidate    - Forcer le redessin
update        - Mettre à jour l'affichage

COMMANDES SYSTÈME
-----------------
exec          - Exécuter un programme externe
explore       - Ouvrir l'explorateur
rundll        - Exécuter une fonction DLL
runprj        - Charger un autre projet
load          - Charger une sauvegarde
save          - Sauvegarder
msgbox        - Afficher une boîte de message
playcmd       - Exécuter une commande
rem           - Commentaire (ignoré)
closedll      - Fermer une DLL

VARIABLES ET LOGIQUE
--------------------
set_var       - Définir une variable (set_var NOM,valeur)
inc_var       - Incrémenter (inc_var NOM)
dec_var       - Décrémenter (dec_var NOM)
if            - Condition (if NOM opérateur valeur then commande)

OPÉRATEURS DE COMPARAISON
-------------------------
=             - Égal
!=            - Différent
>             - Supérieur
<             - Inférieur
>=            - Supérieur ou égal
<=            - Inférieur ou égal
RANDOM        - Valeur aléatoire

ÉVÉNEMENTS
----------
EV_ONFOCUS    - Quand le focus est obtenu
EV_ONCLICK    - Quand un clic est effectué
EV_ONINIT     - À l'initialisation
EV_AFTERINIT  - Après l'initialisation
```

### 3.3 Syntaxe détaillée des commandes

Les commandes sont stockées au format textuel dans les fichiers VN. Voici la syntaxe exacte de chaque commande:

```
NAVIGATION
----------
scene <nom_scene>                     - Aller à une scène spécifique
next                                  - Scène suivante
prev                                  - Scène précédente
quit [code]                           - Quitter (code de sortie optionnel)
about                                 - Boîte "À propos"
prefs                                 - Préférences

VARIABLES
---------
set_var <VARNAME> <valeur>            - Définir une variable
set_var <VARNAME> RANDOM <min> <max>  - Valeur aléatoire entre min et max
inc_var <VARNAME> [montant]           - Incrémenter (défaut: 1)
dec_var <VARNAME> [montant]           - Décrémenter (défaut: 1)

CONDITION (avec commande binaire imbriquée)
-------------------------------------------
if <VARNAME> <op> <valeur>            - Condition suivie de then/else binaire
   Opérateurs: = != < > <= >=

MÉDIA AUDIO
-----------
playwav <fichier> [loop]              - Jouer WAV (loop = répétition)
playmid <fichier> [loop] [volume]     - Jouer MIDI (volume: 0-100)
playcda <piste> [loop]                - Jouer CD Audio
closewav                              - Arrêter WAV
closemid                              - Arrêter MIDI

MÉDIA VIDÉO
-----------
playavi <fichier> [x y w h] [loop]    - Jouer AVI avec position/taille
closeavi                              - Arrêter AVI

IMAGES/BITMAPS
--------------
addbmp <objname> <fichier> <x> <y> [transparent] [couleur]
                                      - Ajouter bitmap (couleur transparente en hex)
delbmp <objname>                      - Supprimer bitmap
showbmp <objname>                     - Afficher bitmap
hidebmp <objname>                     - Cacher bitmap
playseq <pattern> <start> <end> <x> <y> <delay> [loop]
                                      - Séquence d'images animées

TEXTE
-----
addtext <objname> <texte> <x> <y>     - Ajouter texte
playtext <objname> <texte> <x> <y>    - Texte avec effet
font <nom> <taille> [bold] [italic] [couleur]
                                      - Définir police
tiptext <texte>                       - Texte d'aide (tooltip)
playhtml <objname> <url> <x> <y> <w> <h>
                                      - Afficher HTML

OBJETS
------
showobj <objname>                     - Afficher objet
hideobj <objname>                     - Cacher objet
delobj <objname>                      - Supprimer objet

EFFETS
------
zoom <start> <end> <cx> <cy> <durée>  - Zoom animé
zoomin                                - Zoom avant (raccourci)
zoomout                               - Zoom arrière (raccourci)
pause <durée_ms>                      - Attendre

SYSTÈME
-------
exec <programme> [args] [wait]        - Exécuter programme
explore <url>                         - Ouvrir URL dans navigateur
rundll <dll> <fonction> [args]        - Appeler fonction DLL
runprj <projet> [scene]               - Charger autre projet
load <fichier>                        - Charger sauvegarde
save <fichier>                        - Sauvegarder
msgbox <message> [titre] [type]       - Boîte de message
defcursor <fichier>                   - Curseur par défaut
hotspot <nom> enable|disable          - Activer/désactiver hotspot
rem <commentaire>                     - Commentaire (ignoré)
closedll <dll>                        - Décharger DLL
update                                - Rafraîchir affichage
invalidate                            - Forcer redessin
```

### 3.4 Types de paramètres de commandes (C++)

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

    // Palette 256 couleurs (Windows PALETTEENTRY)
    struct PALETTEENTRY {
        uint8_t peRed;         // Composante rouge
        uint8_t peGreen;       // Composante verte
        uint8_t peBlue;        // Composante bleue
        uint8_t peFlags;       // 0 = normal, PC_RESERVED, PC_EXPLICIT, PC_NOCOLLAPSE
    } entries[256];
}
```

### 3.6 Formats d'images (IMG8 et IMG24)

Le moteur utilise OWL TDib pour les images, qui sont des DIB (Device Independent Bitmaps).

```
IMG8_FORMAT (8-bit palettisé) {
    // En-tête DIB standard Windows
    BITMAPINFOHEADER header;   // 40 bytes
    RGBQUAD          colors[256]; // Palette locale (4 bytes × 256)
    uint8_t          pixels[];    // Données pixels (1 byte par pixel)
}

IMG24_FORMAT (24-bit TrueColor) {
    BITMAPINFOHEADER header;   // 40 bytes
    uint8_t          pixels[];    // Données BGR (3 bytes par pixel)
                                  // Note: ordre Blue-Green-Red (pas RGB!)
}

BITMAPINFOHEADER {
    uint32_t biSize;           // 40
    int32_t  biWidth;          // Largeur en pixels
    int32_t  biHeight;         // Hauteur (positif = bottom-up, négatif = top-down)
    uint16_t biPlanes;         // 1
    uint16_t biBitCount;       // 8 ou 24
    uint32_t biCompression;    // 0 (BI_RGB = non compressé)
    uint32_t biSizeImage;      // Taille des données (peut être 0 si BI_RGB)
    int32_t  biXPelsPerMeter;  // Résolution horizontale
    int32_t  biYPelsPerMeter;  // Résolution verticale
    uint32_t biClrUsed;        // Nombre de couleurs utilisées (0 = toutes)
    uint32_t biClrImportant;   // Nombre de couleurs importantes (0 = toutes)
}
```

### 3.7 Système de sérialisation des commandes (DÉCOUVERTE IMPORTANTE)

Les commandes VN utilisent un système de **sérialisation textuelle** avec des patterns printf-style.
Découvert dans europeo.exe @ 0x0043f900.

#### Formats de base
```
%li           - Long integer
%u            - Unsigned integer
%i            - Signed integer
%s            - String (sans guillemets)
"%s"          - String (avec guillemets, échappement: \")
%+i, %+u      - Valeur signée avec signe explicite (+5 ou -3)
#%lX          - Couleur hexadécimale avec préfixe # (ex: #FF00FF)
```

#### Formats composites pour les commandes
```
"%s" %u                            - addbmp: "nom_objet" index
"%s" %u %i %i %i %i               - objet + param + rectangle (x,y,w,h)
"%s" %u %i %i %i %i %s            - objet + param + rect + fichier
%s "%s" %u %i %i %i %i %s         - cmd + "nom" + param + rect + extra
"%s" %u %u %u %i %i %i %i %s      - format complexe multi-params
%s %li                             - set_var: VARNAME valeur
%li %s %li                         - condition: valeur opérateur valeur
%i %i %i %i                        - rectangle (left,top,right,bottom)
%i %i %i %i %u %s                 - rect + unsigned + string
```

#### Format conditionnel IF
```
%s then %s                         - if COND then CMD
%s then %s else %s                 - if COND then CMD1 else CMD2

Exemple: "if SCORE > 10 then scene WIN else scene LOSE"
```

#### Opérateurs de comparaison
```
=    - Égal
!=   - Différent
>    - Supérieur
<    - Inférieur
>=   - Supérieur ou égal
<=   - Inférieur ou égal
```

#### Valeur spéciale
```
RANDOM        - Génère une valeur aléatoire
              Exemple: set_var SCORE RANDOM 1 100
```

### 3.8 Lecture de chaînes (Borland string format)

**IMPORTANT: Découverte confirmée par analyse hexadécimale des fichiers .vnd**

Les chaînes Borland utilisent un préfixe **uint32** (4 bytes) pour la longueur, pas uint16!

```cpp
// Lecture de chaîne - Format réel découvert
void ReadString(ipstream& is, string& s) {
    uint32_t length;    // 4 bytes, little-endian!
    is >> length;
    s.resize(length);
    is.readBytes(s.data(), length);
}
```

**Exemple de hex dump:**
```
11 00 00 00 65 75 72 6F 6C 61 6E 64 5C 66 61 63 65 2E 62 6D 70
└── 17 ───┘ └─────────── "euroland\face.bmp" (17 chars) ───────┘
```

### 3.9 Format de police (font command)

Le format de police découvert à 0x0043fa50:
```
%u %u #%lX %i %u %s
```

**Structure:**
```
<size> <style> #<color> <weight> <charset> <fontname>
```

**Exemple:**
```
"18 0 #ffffff Comic sans MS"
  │  │    │        └── Nom de la police
  │  │    └── Couleur hex (blanc)
  │  └── Style (0 = normal)
  └── Taille en points
```

### 3.10 Entités HTML supportées

Le moteur reconnaît les entités HTML suivantes (pour le contenu HTML/texte):
```
&quot;    - Guillemet double (")
&lt;      - Inférieur (<)
&gt;      - Supérieur (>)
&middot;  - Point médian (·)
```

### 3.11 Système d'Opcodes - Table de Dispatch Complète (43 entrées)

**DÉCOUVERTE MAJEURE:** Le moteur utilise un système d'opcodes binaires allant de 0x06 à 0x30.

#### Mécanisme de parsing (sub_407FE5)

Le moteur lit le flux binaire `.vnd` de manière séquentielle :
1. La fonction utilise **`atol()`** pour extraire la valeur numérique
2. `atol()` consomme les chiffres et **s'arrête** dès qu'il rencontre un non-chiffre
3. Le caractère suivant est interprété comme **opcode**
4. Le répartiteur (`sub_43177D`) dispatch via : **`index = opcode - 6`**

#### Table de dispatch COMPLÈTE (sub_43177D @ 0x4317D5)

**Caractères de contrôle (0x06-0x1F):**

| Opcode | Index | Handler | Description |
|:------:|:-----:|:--------|:------------|
| 0x06 | 0 | sub_4319FA | Control (inconnu) |
| 0x07 | 1 | sub_431A20 | Control (inconnu) |
| 0x08 | 2 | sub_431A39 | Control (inconnu) |
| 0x09 | 3 | sub_431881 | Control (inconnu) |
| 0x0A | 4 | sub_431A53 | Control (inconnu) |
| 0x0B | 5 | sub_4318EE | Control (inconnu) |
| 0x0C | 6 | sub_43198B | Control (inconnu) |
| 0x0D (\\r) | 7 | sub_431B2B | **Retour chariot / nouveau record** |
| 0x0E | 8 | sub_4321B6 | Skip/défaut |
| 0x0F | 9 | sub_4321B6 | Skip/défaut |
| 0x10 | 10 | sub_431B4E | Control (inconnu) |
| 0x11 | 11 | sub_431B71 | Control (inconnu) |
| 0x12 | 12 | sub_431B91 | Control (inconnu) |
| 0x13 | 13 | sub_4319CB | Control (inconnu) |
| 0x14 | 14 | sub_431BAB | Control (inconnu) |
| 0x15 | 15 | sub_431BB8 | Control (inconnu) |
| 0x16 | 16 | sub_431BCF | Control (inconnu) |
| 0x17 | 17 | sub_431BEE | Control (inconnu) |
| 0x18 | 18 | sub_431C0D | Control (inconnu) |
| 0x19 | 19 | sub_431C2C | Control (inconnu) |
| 0x1A | 20 | sub_431D6A | Control (inconnu) |
| 0x1B (ESC) | 21 | sub_431A7C | **Séquence d'échappement** |
| 0x1C | 22 | sub_431AD9 | Control (inconnu) |
| 0x1D | 23 | sub_431AF3 | Control (inconnu) |
| 0x1E | 24 | sub_431B0F | Control (inconnu) |
| 0x1F | 25 | sub_431D84 | Control (inconnu) |

**Caractères ASCII imprimables (0x20-0x30):**

| Opcode | Char | Index | Handler | Description |
|:------:|:----:|:-----:|:--------|:------------|
| 0x20 | SPACE | 26 | sub_431D58 | **Séparateur / espace** |
| 0x21 | ! | 27 | sub_431DE5 | **Opérateur NOT / flag** |
| 0x22 | " | 28 | sub_431E11 | **Délimiteur de chaîne** |
| 0x23 | # | 29 | sub_431F5A | **Couleur hex (#RRGGBB)** |
| 0x24 | $ | 30 | sub_43192E | **Référence variable / Stop WAV** |
| 0x25 | % | 31 | sub_431E05 | **Spécificateur de format** |
| 0x26 | & | 32 | sub_431FE0 | **Opération bitmap / AND** |
| 0x27 | ' | 33 | sub_432005 | **Caractère littéral / flags** |
| 0x28 | ( | 34 | sub_4321B6 | Skip/défaut (groupement) |
| 0x29 | ) | 35 | sub_431AAB | **Fin de groupement** |
| 0x2A | * | 36 | sub_431AD9 | **Multiplication / wildcard** |
| 0x2B | + | 37 | sub_431AF3 | **Addition / relatif positif** (→ sub_428E06) |
| 0x2C | , | 38 | sub_431B0F | **Séparateur virgule** (→ sub_428E06) |
| 0x2D | - | 39 | sub_432105 | **Soustraction / relatif négatif** (→ sub_42999A) |
| 0x2E | . | 40 | sub_43216D | **Point décimal / extension** |
| 0x2F | / | 41 | sub_43194D | **Division / path / Stop MIDI** |
| 0x30 | 0 | 42 | sub_43196C | **Chiffre 0 / contrôle MIDI** |

#### Opcodes "suffixes" pour la navigation (lettres)

Les lettres a-z (0x61-0x7A) suivent un autre schéma via la formule `index = char - 'a' + 1`:

| Suffixe | Fonction principale |
|:-------:|:--------------------|
| **d** | Saut Direct (ID absolu) |
| **f** | Saut de Scène (sub_4268F8) |
| **h** | Tooltip (sub_426D33) |
| **i** | Index/Image (sub_42703A) |
| **j** | Bitmap/Palette (sub_4275F6) |
| **k** | Audio WAV (sub_427B56) |
| **l** | Musique MIDI (sub_427C42) |

#### Logique de navigation avec opcodes

| Syntaxe | Description |
|:--------|:------------|
| `Ni` | **Index** : cible = INDEX_ID + N |
| `Nd` | **Direct** : saut à scène N (ID absolu) |
| `N+` ou `+N` | **Relatif +** : scène actuelle + N |
| `N-` ou `-N` | **Relatif -** : scène actuelle - N |
| `N` | **Défaut** : mode direct |

#### Classes de paramètres (TVN*Parms)

Chaque type de record utilise une classe de paramètres spécifique :

```
TVNCommandParms     - Base class pour tous les paramètres
TVNSceneParms       - Navigation (GOTO)
TVNSetVarParms      - set_var (nom + valeur)
TVNIncVarParms      - inc_var
TVNDecVarParms      - dec_var
TVNIfParms          - Conditions IF
TVNConditionParms   - Expressions conditionnelles
TVNImageParms       - Images/bitmaps
TVNImgObjParms      - Objets image
TVNImgSeqParms      - Séquences animées
TVNTextParms        - Texte
TVNTextObjParms     - Objets texte
TVNFontParms        - Polices
TVNHtmlParms        - Contenu HTML
TVNDigitParms       - Affichage chiffres
TVNMidiParms        - Musique MIDI
TVNFileNameParms    - Chemins de fichiers (WAV, AVI)
TVNExecParms        - Exécution externe
TVNTimeParms        - Temporisation
TVNHotspotParms     - Zones cliquables
TVNCDAParms         - CD Audio
TVNRectParms        - Rectangles
TVNStringParms      - Chaînes
TVNProjectParms     - Paramètres projet
```

#### Pseudo-code du dispatcher

```cpp
// sub_43177D - Command dispatcher
void DispatchCommand(TVNApp* app, int opcode, void* params) {
    int index = opcode - 6;  // Offset de la table

    if (index > 42) {
        // Opcode invalide
        return;
    }

    // Table de saut à 0x4317D5
    void (*handler)(TVNApp*, void*) = jumpTable[index];
    handler(app, params);
}

// Exemple: Handler 'f' (scene jump) @ 0x4268F8
void HandleSceneJump(TVNApp* app, int sceneId) {
    if (!app->IsReady()) return;
    if (app->sceneManager == NULL) return;

    // Calculer la scène cible
    int targetScene = CalculateTargetScene(app, sceneId);

    // Effectuer le saut
    app->sceneManager->GoToScene(targetScene);
}

// Exemple: Handler 'k' (WAV) @ 0x427B56
void HandlePlayWav(TVNApp* app, const char* filename) {
    if (!app->IsReady()) return;

    // Vérifier si audio activé
    if (!(app->prefs & PREF_AUDIO_ENABLED)) return;

    // Vérifier si déjà en lecture
    if (app->prefs & PREF_AUDIO_PLAYING) {
        app->wavePlayer->Stop();
    }

    // Jouer le fichier
    app->wavePlayer->Play(filename, 0x62);  // 0x62 = flags
}
```

### 3.12 Structure mixte texte/opcodes

**CORRECTION:** Le moteur utilise un système **HYBRIDE** :

1. **Commandes textuelles** (`playwav`, `set_var`, `scene`) pour le haut niveau
2. **Opcodes par suffixe** (d, f, h, i, j, k, l) pour le contrôle bas niveau

Les commandes textuelles sont **enveloppées** dans le système d'opcodes :
- Une commande `scene 54h` est d'abord parsée comme texte "scene"
- Puis le paramètre "54h" est traité par le système d'opcodes
- atol extrait 54, puis 'h' déclenche l'opcode tooltip

**Structure réelle du flux de données :**
```
[command: uint32_len + "scene 54h"]
        ↓
    "scene" → match commande texte
    "54h"   → atol(54) + opcode 'h' (tooltip)
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

## 6. Énumération complète des classes et commandes

### 6.1 Liste des 49 commandes textuelles (extraite @ 0x43f76c)

Commandes extraites de europeo.exe, stockées comme chaînes null-terminées :

```
NAVIGATION (6)
--------------
 1. quit          - Quitter l'application
 2. about         - Afficher "À propos"
 3. prefs         - Ouvrir les préférences
 4. prev          - Scène précédente
 5. next          - Scène suivante
 6. scene         - Aller à une scène

MÉDIA AUDIO (7)
---------------
 7. playwav       - Jouer fichier WAV
 8. playmid       - Jouer fichier MIDI
 9. playcda       - Jouer CD Audio
10. closewav      - Arrêter WAV
11. closemid      - Arrêter MIDI
12. closedll      - Fermer DLL audio

MÉDIA VIDÉO (2)
---------------
13. playavi       - Jouer vidéo AVI
14. closeavi      - Arrêter vidéo AVI

IMAGES/BITMAPS (7)
------------------
15. playbmp       - Animer un bitmap
16. playseq       - Séquence d'images
17. addbmp        - Ajouter bitmap
18. delbmp        - Supprimer bitmap
19. showbmp       - Afficher bitmap
20. hidebmp       - Cacher bitmap

TEXTE/HTML (5)
--------------
21. playhtml      - Afficher contenu HTML
22. playtext      - Texte avec effet
23. addtext       - Ajouter texte
24. tiptext       - Tooltip
25. font          - Définir police

OBJETS (3)
----------
26. showobj       - Afficher objet
27. hideobj       - Cacher objet
28. delobj        - Supprimer objet

HOTSPOTS (2)
------------
29. hotspot       - Gérer hotspot
30. defcursor     - Curseur par défaut

ZOOM/EFFETS (4)
---------------
31. zoom          - Activer zoom
32. zoomin        - Zoom avant
33. zoomout       - Zoom arrière
34. pause         - Mettre en pause

VARIABLES/LOGIQUE (4)
---------------------
35. if            - Condition
36. set_var       - Définir variable
37. inc_var       - Incrémenter
38. dec_var       - Décrémenter

SYSTÈME (11)
------------
39. exec          - Exécuter programme
40. explore       - Ouvrir explorateur
41. rundll        - Appeler fonction DLL
42. runprj        - Charger projet
43. msgbox        - Boîte de message
44. playcmd       - Exécuter commande
45. update        - Rafraîchir affichage
46. invalidate    - Forcer redessin
47. rem           - Commentaire
48. load          - Charger sauvegarde
49. save          - Sauvegarder
```

### 6.2 Événements VN (extraits @ 0x43f8cf)

Les événements VN sont utilisés pour déclencher des commandes à différents moments du cycle de vie d'une scène ou d'un hotspot.

```cpp
// Enumération des types d'événements
enum VNEventType {
    EV_ONFOCUS    = 0,  // Événement déclenché au survol (mouse over)
    EV_ONCLICK    = 1,  // Événement déclenché au clic
    EV_ONINIT     = 2,  // Événement déclenché à l'initialisation (avant affichage)
    EV_AFTERINIT  = 3   // Événement déclenché après l'initialisation (après background)
};

// Chaînes correspondantes (@ 0x43f8cf)
const char* EventNames[] = {
    "EV_ONFOCUS",     // Offset 0x43f8cf
    "EV_ONCLICK",     // Offset 0x43f8da
    "EV_ONINIT",      // Offset 0x43f8e5
    "EV_AFTERINIT"    // Offset 0x43f8ef
};
```

**Utilisation dans les scènes :**

| Événement     | Déclencheur                     | Cas d'usage typique                    |
|:--------------|:--------------------------------|:---------------------------------------|
| EV_ONINIT     | Entrée dans la scène (phase 1)  | Initialiser variables, préparer audio  |
| EV_AFTERINIT  | Après chargement du fond        | Jouer son d'ambiance, afficher objets  |
| EV_ONFOCUS    | Survol d'un hotspot             | Afficher tooltip, changer curseur      |
| EV_ONCLICK    | Clic sur un hotspot             | Naviguer, déclencher action            |

**Structure TVNEventCommand :**

```cpp
class TVNEventCommand : public TVNStreamable {
    VNEventType   eventType;    // Type d'événement
    TVNCommand*   command;      // Commande à exécuter
};

class TVNEventCommandArray : public TVNStreamable {
    int                count;
    TVNEventCommand*   items[];
};
```

### 6.3 Énumération complète des classes TVN*Parms (sérialisation Borland)

Classes de paramètres utilisées pour la sérialisation des commandes.
Découvertes dans europeo.exe @ 0x40ec00-0x411000.

```cpp
// ============================================================================
// ENUMÉRATION TVNParmsType
// ============================================================================

enum TVNParmsType {
    // === Paramètres projet/scène ===
    PARMS_PROJECT,      // TVNProjectParms - Paramètres globaux du projet
    PARMS_SCENE,        // TVNSceneParms - Paramètres d'une scène
    PARMS_HOTSPOT,      // TVNHotspotParms - Paramètres d'un hotspot

    // === Paramètres média audio ===
    PARMS_MIDI,         // TVNMidiParms - Lecture fichier MIDI
    PARMS_DIGIT,        // TVNDigitParms - Lecture audio numérique (WAV)
    PARMS_CDA,          // TVNCDAParms - Lecture CD Audio

    // === Paramètres média visuel ===
    PARMS_IMAGE,        // TVNImageParms - Affichage image statique
    PARMS_IMG_OBJ,      // TVNImgObjParms - Objet image (sprite)
    PARMS_IMG_SEQ,      // TVNImgSeqParms - Séquence d'images (animation)

    // === Paramètres texte ===
    PARMS_TEXT,         // TVNTextParms - Affichage texte simple
    PARMS_TEXT_OBJ,     // TVNTextObjParms - Objet texte (label)
    PARMS_FONT,         // TVNFontParms - Configuration police
    PARMS_STRING,       // TVNStringParms - Chaîne de caractères
    PARMS_HTML,         // TVNHtmlParms - Contenu HTML

    // === Paramètres variables ===
    PARMS_SET_VAR,      // TVNSetVarParms - Définir variable
    PARMS_INC_VAR,      // TVNIncVarParms - Incrémenter variable
    PARMS_DEC_VAR,      // TVNDecVarParms - Décrémenter variable

    // === Paramètres contrôle de flux ===
    PARMS_IF,           // TVNIfParms - Condition if
    PARMS_CONDITION,    // TVNConditionParms - Expression conditionnelle

    // === Paramètres géométrie ===
    PARMS_RECT,         // TVNRectParms - Rectangle (collision/zone)

    // === Paramètres système ===
    PARMS_EXEC,         // TVNExecParms - Exécution programme externe
    PARMS_FILENAME,     // TVNFileNameParms - Référence fichier
    PARMS_TIME,         // TVNTimeParms - Temporisation/délai
    PARMS_COMMAND       // TVNCommandParms - Commande générique
};

// ============================================================================
// STRUCTURES DÉTAILLÉES
// ============================================================================

// Base class pour tous les paramètres
class TVNCommandParms : public TVNStreamable {
    virtual void Read(ipstream& is) = 0;
    virtual void Write(opstream& os) = 0;
};

// Paramètres projet
class TVNProjectParms : public TVNCommandParms {
    string  name;           // Nom du projet
    uint16  displayWidth;   // Largeur d'affichage
    uint16  displayHeight;  // Hauteur d'affichage
    uint8   colorDepth;     // 8 ou 24 bits
    string  dataFilePath;   // Chemin du DATFILE
};

// Paramètres scène
class TVNSceneParms : public TVNCommandParms {
    string  name;           // Nom de la scène
    string  backgroundFile; // Fichier de fond
    uint32  backgroundColor;// Couleur de fond
    string  musicFile;      // Musique de fond
    bool    musicLoop;      // Boucle audio
};

// Paramètres hotspot
class TVNHotspotParms : public TVNCommandParms {
    string  name;           // Nom du hotspot
    uint8   shapeType;      // 0 = rect, 1 = polygon
    bool    enabled;        // Actif ou non
    string  cursorFile;     // Fichier curseur
};

// Paramètres MIDI
class TVNMidiParms : public TVNCommandParms {
    string  filename;       // Fichier MIDI
    bool    loop;           // Boucle
    int     volume;         // Volume 0-100
};

// Paramètres audio numérique (WAV)
class TVNDigitParms : public TVNCommandParms {
    string  filename;       // Fichier WAV
    bool    loop;           // Boucle
    int     volume;         // Volume 0-100
};

// Paramètres CD Audio
class TVNCDAParms : public TVNCommandParms {
    int     track;          // Piste CD
    bool    loop;           // Boucle
};

// Paramètres image
class TVNImageParms : public TVNCommandParms {
    string  filename;       // Fichier image
    int     x, y;           // Position
    bool    transparent;    // Transparence activée
    uint32  transparentColor; // Couleur transparente
};

// Paramètres objet image
class TVNImgObjParms : public TVNCommandParms {
    string  objectName;     // Nom de l'objet
    string  filename;       // Fichier image
    int     x, y;           // Position
    bool    visible;        // Visible ou non
    bool    transparent;    // Transparence
    uint32  transparentColor;
};

// Paramètres séquence d'images
class TVNImgSeqParms : public TVNCommandParms {
    string  filenamePattern; // Pattern (ex: "img%03d.bmp")
    int     startFrame;     // Frame de début
    int     endFrame;       // Frame de fin
    int     x, y;           // Position
    int     delay;          // Délai entre frames (ms)
    bool    loop;           // Boucle
};

// Paramètres texte
class TVNTextParms : public TVNCommandParms {
    string  text;           // Texte à afficher
    int     x, y;           // Position
    uint32  color;          // Couleur du texte
};

// Paramètres objet texte
class TVNTextObjParms : public TVNCommandParms {
    string  objectName;     // Nom de l'objet
    string  text;           // Texte
    int     x, y;           // Position
    bool    visible;        // Visible
    uint32  color;          // Couleur
    string  fontName;       // Police
    int     fontSize;       // Taille
};

// Paramètres police
class TVNFontParms : public TVNCommandParms {
    string  fontName;       // Nom de la police
    int     fontSize;       // Taille en points
    int     fontStyle;      // 0=normal, 1=bold, 2=italic, 3=both
    uint32  color;          // Couleur
};

// Paramètres chaîne
class TVNStringParms : public TVNCommandParms {
    string  value;          // Valeur de la chaîne
};

// Paramètres HTML
class TVNHtmlParms : public TVNCommandParms {
    string  objectName;     // Nom de l'objet
    string  content;        // Contenu HTML ou URL
    int     x, y;           // Position
    int     width, height;  // Dimensions
};

// Paramètres set_var
class TVNSetVarParms : public TVNCommandParms {
    string  varName;        // Nom de la variable (MAJUSCULES)
    int     value;          // Valeur ou type spécial
    bool    random;         // Si true, valeur aléatoire
    int     min, max;       // Bornes si random
};

// Paramètres inc_var
class TVNIncVarParms : public TVNCommandParms {
    string  varName;        // Nom de la variable
    int     amount;         // Montant à ajouter (défaut: 1)
};

// Paramètres dec_var
class TVNDecVarParms : public TVNCommandParms {
    string  varName;        // Nom de la variable
    int     amount;         // Montant à soustraire (défaut: 1)
};

// Paramètres if
class TVNIfParms : public TVNCommandParms {
    string  varName;        // Variable à tester
    string  operator;       // =, !=, <, >, <=, >=
    int     compareValue;   // Valeur de comparaison
    TVNCommand* thenCommand; // Commande si vrai
    TVNCommand* elseCommand; // Commande si faux (optionnel)
};

// Paramètres condition
class TVNConditionParms : public TVNCommandParms {
    string  expression;     // Expression complète
    string  variable;       // Variable extraite
    string  operator;       // Opérateur
    int     value;          // Valeur
};

// Paramètres rectangle
class TVNRectParms : public TVNCommandParms {
    int     x1, y1;         // Coin haut-gauche
    int     x2, y2;         // Coin bas-droit
};

// Paramètres exécution
class TVNExecParms : public TVNCommandParms {
    string  program;        // Programme à exécuter
    string  arguments;      // Arguments
    bool    waitForCompletion; // Attendre la fin
};

// Paramètres nom de fichier
class TVNFileNameParms : public TVNCommandParms {
    string  filename;       // Chemin du fichier
    string  path;           // Chemin complet (optionnel)
};

// Paramètres temps
class TVNTimeParms : public TVNCommandParms {
    int     duration;       // Durée en millisecondes
};
```

### 6.4 Classes streamables principales (pour fichiers VN)

Toutes les classes sérialisables héritent de TStreamableBase (Borland) via TVNStreamable.
Découvertes dans europeo.exe @ 0x40ec00-0x411600.

```cpp
// ============================================================================
// ENUMÉRATION TVNStreamableClass
// ============================================================================

enum TVNStreamableClass {
    // === Classes de base ===
    STREAMABLE_BASE,        // TStreamableBase (Borland)
    VN_STREAMABLE,          // TVNStreamable (base VN)
    VN_OBJECT,              // TVNObject
    VN_INDEX_DEPENDANT,     // TVNIndexDependant

    // === Variables ===
    VN_VARIABLE,            // TVNVariable
    VN_VARIABLE_ARRAY,      // TVNVariableArray

    // === Commandes ===
    VN_COMMAND,             // TVNCommand
    VN_COMMAND_ARRAY,       // TVNCommandArray
    VN_EVENT_COMMAND,       // TVNEventCommand
    VN_EVENT_COMMAND_ARRAY, // TVNEventCommandArray

    // === Classes de paramètres ===
    PROJECT_PARMS,          // TVNProjectParms
    SCENE_PARMS,            // TVNSceneParms
    HOTSPOT_PARMS,          // TVNHotspotParms
    MIDI_PARMS,             // TVNMidiParms
    DIGIT_PARMS,            // TVNDigitParms
    CDA_PARMS,              // TVNCDAParms
    IMAGE_PARMS,            // TVNImageParms
    IMG_OBJ_PARMS,          // TVNImgObjParms
    IMG_SEQ_PARMS,          // TVNImgSeqParms
    TEXT_PARMS,             // TVNTextParms
    TEXT_OBJ_PARMS,         // TVNTextObjParms
    FONT_PARMS,             // TVNFontParms
    STRING_PARMS,           // TVNStringParms
    HTML_PARMS,             // TVNHtmlParms
    SET_VAR_PARMS,          // TVNSetVarParms
    INC_VAR_PARMS,          // TVNIncVarParms
    DEC_VAR_PARMS,          // TVNDecVarParms
    IF_PARMS,               // TVNIfParms
    CONDITION_PARMS,        // TVNConditionParms
    RECT_PARMS,             // TVNRectParms
    EXEC_PARMS,             // TVNExecParms
    FILENAME_PARMS,         // TVNFileNameParms
    TIME_PARMS,             // TVNTimeParms
    COMMAND_PARMS           // TVNCommandParms
};

// ============================================================================
// MAPPING NOM DE CLASSE -> TYPE
// ============================================================================

// Pour la désérialisation Borland, les noms de classes sont stockés
// comme chaînes dans le flux et mappés vers les types correspondants

const char* StreamableClassNames[] = {
    "TStreamableBase",
    "TVNStreamable",
    "TVNObject",
    "TVNIndexDependant",
    "TVNVariable",
    "TVNVariableArray",
    "TVNCommand",
    "TVNCommandArray",
    "TVNEventCommand",
    "TVNEventCommandArray",
    "TVNProjectParms",
    "TVNSceneParms",
    "TVNHotspotParms",
    "TVNMidiParms",
    "TVNDigitParms",
    "TVNCDAParms",
    "TVNImageParms",
    "TVNImgObjParms",
    "TVNImgSeqParms",
    "TVNTextParms",
    "TVNTextObjParms",
    "TVNFontParms",
    "TVNStringParms",
    "TVNHtmlParms",
    "TVNSetVarParms",
    "TVNIncVarParms",
    "TVNDecVarParms",
    "TVNIfParms",
    "TVNConditionParms",
    "TVNRectParms",
    "TVNExecParms",
    "TVNFileNameParms",
    "TVNTimeParms",
    "TVNCommandParms"
};

// ============================================================================
// HIÉRARCHIE COMPLÈTE DES CLASSES
// ============================================================================

// Hiérarchie TVNStreamable
TVNStreamable           // Classe de base sérialisable
├── TVNObject           // Objet de base
├── TVNCommand          // Commande simple
├── TVNEventCommand     // Commande événementielle
├── TVNHotspot          // Zone cliquable
├── TVNScene            // Scène complète
├── TVNGdiObject        // Objet GDI (image, texte)
├── TVNVariable         // Variable du jeu
├── TVNProjectInfo      // Informations projet
├── TVNVersion          // Version du fichier
└── TVNHistData         // Données d'historique

// Classes multimédia
TVNMciBase              // Base MCI
├── TVNWaveMedia        // Audio WAV
├── TVNMidiMedia        // Audio MIDI
├── TVNAviMedia         // Vidéo AVI
└── TVNCDAMedia         // CD Audio

// Classes graphiques
TVNBitmap               // Bitmap simple
TVNTransparentBmp       // Bitmap transparent
TVNBmpImg               // Image bitmap
TVNBkTexture            // Texture de fond
TVNHtmlText             // Texte HTML

// Classes d'effets
TVNTimerBasedFx         // Base effets temporels
├── TVNZoomFx           // Effet zoom
└── TVNScrollFx         // Effet défilement

// Classes UI
TVNWindow               // Fenêtre principale
TVNFrame                // Cadre
TVNToolBar              // Barre d'outils
TVNTimer                // Timer
TVNTimerRes             // Résolution timer

// Classes conteneurs (Borland templates)
TVNCommandArray         // Tableau de commandes
TVNEventCommandArray    // Tableau de commandes événementielles
TVNHotspotArray         // Tableau de hotspots
TVNSceneArray           // Tableau de scènes
TVNGdiObjectArray       // Tableau d'objets GDI
TVNVariableArray        // Tableau de variables
TVNPaletteEntries       // Entrées de palette

// Classes d'application
TVNApplication          // Application principale
TVNApplicationInfo      // Infos application
TVNDisplayMode          // Mode d'affichage
TVNSceneProperties      // Propriétés de scène
TVNTimerProperties      // Propriétés de timer
TVNToolBarProperties    // Propriétés toolbar
TVNProtectData          // Données de protection
TVNPluginData           // Données plugin
```

**Notes sur la sérialisation Borland :**

1. **Enregistrement des classes** : Chaque classe streamable doit être enregistrée
   avec `TStreamableBase::RegisterClass()` avant de pouvoir être lue/écrite.

2. **Format du flux** : Le nom de la classe est écrit en premier (chaîne null-terminée),
   suivi d'un numéro de version (uint16), puis des données de l'objet.

3. **Références circulaires** : Le système Borland gère les références circulaires
   via un mécanisme de "delta" (offset dans le flux) pour les objets déjà écrits.

### 6.5 Table complète des opcodes de contrôle (0x06-0x30)

Table de dispatch complète extraite de sub_43177D @ 0x4317D5 :

| Opcode | Char | Index | Handler    | Nom              | Description                    |
|:------:|:----:|:-----:|:-----------|:-----------------|:-------------------------------|
| 0x06   | -    | 0     | sub_4319FA | CTRL_06          | Contrôle (réservé)             |
| 0x07   | -    | 1     | sub_431A20 | CTRL_07          | Contrôle (réservé)             |
| 0x08   | -    | 2     | sub_431A39 | CTRL_08          | Contrôle (réservé)             |
| 0x09   | TAB  | 3     | sub_431881 | CTRL_TAB         | Tabulation                     |
| 0x0A   | LF   | 4     | sub_431A53 | LINE_FEED        | Nouvelle ligne                 |
| 0x0B   | -    | 5     | sub_4318EE | CTRL_0B          | Contrôle (réservé)             |
| 0x0C   | -    | 6     | sub_43198B | CTRL_0C          | Contrôle (réservé)             |
| 0x0D   | CR   | 7     | sub_431B2B | CARRIAGE_RETURN  | Retour chariot / nouveau record |
| 0x0E   | -    | 8     | sub_4321B6 | DEFAULT          | Défaut/skip                    |
| 0x0F   | -    | 9     | sub_4321B6 | DEFAULT          | Défaut/skip                    |
| 0x10   | -    | 10    | sub_431B4E | CTRL_10          | Contrôle (réservé)             |
| 0x11   | -    | 11    | sub_431B71 | CTRL_11          | Contrôle (réservé)             |
| 0x12   | -    | 12    | sub_431B91 | CTRL_12          | Contrôle (réservé)             |
| 0x13   | -    | 13    | sub_4319CB | CTRL_13          | Contrôle (réservé)             |
| 0x14   | -    | 14    | sub_431BAB | CTRL_14          | Contrôle (réservé)             |
| 0x15   | -    | 15    | sub_431BB8 | CTRL_15          | Contrôle (réservé)             |
| 0x16   | -    | 16    | sub_431BCF | CTRL_16          | Contrôle (réservé)             |
| 0x17   | -    | 17    | sub_431BEE | CTRL_17          | Contrôle (réservé)             |
| 0x18   | -    | 18    | sub_431C0D | CTRL_18          | Contrôle (réservé)             |
| 0x19   | -    | 19    | sub_431C2C | CTRL_19          | Contrôle (réservé)             |
| 0x1A   | -    | 20    | sub_431D6A | CTRL_1A          | Contrôle (réservé)             |
| 0x1B   | ESC  | 21    | sub_431A7C | ESCAPE           | Séquence d'échappement         |
| 0x1C   | -    | 22    | sub_431AD9 | CTRL_1C          | Contrôle (réservé)             |
| 0x1D   | -    | 23    | sub_431AF3 | CTRL_1D          | Contrôle (réservé)             |
| 0x1E   | -    | 24    | sub_431B0F | CTRL_1E          | Contrôle (réservé)             |
| 0x1F   | -    | 25    | sub_431D84 | CTRL_1F          | Contrôle (réservé)             |
| 0x20   | ' '  | 26    | sub_431D58 | SPACE            | Séparateur / espace            |
| 0x21   | '!'  | 27    | sub_431DE5 | NOT/EXCLAIM      | Opérateur NOT / flag           |
| 0x22   | '"'  | 28    | sub_431E11 | QUOTE            | Délimiteur de chaîne           |
| 0x23   | '#'  | 29    | sub_431F5A | COLOR            | Couleur hex (#RRGGBB)          |
| 0x24   | '$'  | 30    | sub_43192E | VARIABLE/STOP_WAV| Référence variable / Stop WAV  |
| 0x25   | '%'  | 31    | sub_431E05 | FORMAT           | Spécificateur de format        |
| 0x26   | '&'  | 32    | sub_431FE0 | BITMAP/AND       | Opération bitmap / AND         |
| 0x27   | "'"  | 33    | sub_432005 | APOSTROPHE       | Caractère littéral / flags     |
| 0x28   | '('  | 34    | sub_4321B6 | PAREN_OPEN       | Parenthèse ouvrante (défaut)   |
| 0x29   | ')'  | 35    | sub_431AAB | PAREN_CLOSE      | Fin de groupement              |
| 0x2A   | '*'  | 36    | sub_431AD9 | MULTIPLY/WILDCARD| Multiplication / wildcard      |
| 0x2B   | '+'  | 37    | sub_431AF3 | ADD/REL_PLUS     | Addition / relatif positif     |
| 0x2C   | ','  | 38    | sub_431B0F | COMMA            | Séparateur virgule             |
| 0x2D   | '-'  | 39    | sub_432105 | SUB/REL_MINUS    | Soustraction / relatif négatif |
| 0x2E   | '.'  | 40    | sub_43216D | DOT/DECIMAL      | Point décimal / extension      |
| 0x2F   | '/'  | 41    | sub_43194D | DIVIDE/STOP_MIDI | Division / path / Stop MIDI    |
| 0x30   | '0'  | 42    | sub_43196C | ZERO/MIDI_CTRL   | Chiffre 0 / contrôle MIDI      |

### 6.6 Opcodes de navigation par lettre (suffixes)

Ces opcodes utilisent la formule `index = char - 'a' + offset` :

| Suffixe | Code | Nom           | Description                    | Handler    |
|:-------:|:----:|:--------------|:-------------------------------|:-----------|
| d       | 4    | DIRECT_JUMP   | Saut direct vers ID absolu     | sub_4268F8 |
| f       | 6    | SCENE_JUMP    | Changement de scène            | sub_4268F8 |
| h       | 8    | TOOLTIP       | Afficher tooltip/texte info    | sub_426D33 |
| i       | 9    | INDEX_IMAGE   | Saut indexé ou chargement image| sub_42703A |
| j       | 10   | BITMAP_PALETTE| Gestion bitmap/palette         | sub_4275F6 |
| k       | 11   | PLAY_WAV      | Jouer fichier audio WAV        | sub_427B56 |
| l       | 12   | PLAY_MIDI     | Jouer séquence MIDI            | sub_427C42 |

### 6.7 Combinaisons navigation + opcode

| Syntaxe    | Description                                   |
|:-----------|:----------------------------------------------|
| `Ni`       | Index : cible = INDEX_ID + N                  |
| `Nd`       | Direct : saut à scène N (ID absolu)           |
| `Nf`       | Scene : changement de scène N                 |
| `Nh`       | Tooltip : afficher tooltip avec paramètre N   |
| `Nj`       | Bitmap : charger bitmap N                     |
| `Nk`       | WAV : jouer fichier audio N                   |
| `Nl`       | MIDI : jouer musique N                        |
| `N+` ou `+N` | Relatif + : scène actuelle + N              |
| `N-` ou `-N` | Relatif - : scène actuelle - N              |
| `N`        | Défaut : mode direct                          |

---

## 7. Types de Records Binaires (Sérialisation VN)

Les fichiers VN utilisent un système de records typés pour stocker les différentes structures de données.
Chaque record commence par un identifiant de type codé sur 4 octets (uint32 Little Endian).

### 7.1 Énumération des types de records (0x00 - 0x69+)

| Type | Hex    | Nom                | Description                                    |
|:----:|:------:|:-------------------|:-----------------------------------------------|
| 2    | 0x02   | RECT_COLLISION     | Rectangle de collision simple (X1,Y1,X2,Y2)    |
| 11   | 0x0B   | AUDIO_WAV          | Référence fichier audio WAV                    |
| 12   | 0x0C   | AUDIO_MIDI         | Référence fichier audio MIDI                   |
| 21   | 0x15   | CONDITIONAL        | Instructions conditionnelles (if...then)       |
| 38   | 0x26   | HOTSPOT_TEXT       | Texte de hotspot (libellé survol)              |
| 105  | 0x69   | POLYGON_COLLISION  | Zone de collision polygonale (n sommets)       |

### 7.2 Structure détaillée des types de records

#### Type 2 (0x02) - Rectangle de collision

Structure simple pour zones cliquables rectangulaires :

```
Offset  Taille  Type    Description
------  ------  ------  -----------
0x00    4       uint32  Type = 0x02
0x04    4       int32   X1 (coin haut-gauche)
0x08    4       int32   Y1 (coin haut-gauche)
0x0C    4       int32   X2 (coin bas-droit)
0x10    4       int32   Y2 (coin bas-droit)
```

#### Type 11 (0x0B) - Audio WAV

Référence vers un fichier audio WAV :

```
Offset  Taille  Type    Description
------  ------  ------  -----------
0x00    4       uint32  Type = 0x0B
0x04    4       uint32  Longueur du chemin
0x08    n       string  Chemin du fichier WAV
```

#### Type 21 (0x15) - Instructions conditionnelles

Script conditionnel utilisant une syntaxe if/then :

```
Offset  Taille  Type    Description
------  ------  ------  -----------
0x00    4       uint32  Type = 0x15
0x04    4       uint32  Longueur de la chaîne
0x08    n       string  Expression conditionnelle
                        Format: "VARIABLE OPERATEUR VALEUR then COMMANDE"
                        Exemple: "score < 0 then runprj gameover.vnp"
```

Opérateurs supportés : `=`, `!=`, `<`, `>`, `<=`, `>=`

#### Type 38 (0x26) - Texte de Hotspot

Libellé affiché au survol d'une zone interactive :

```
Offset  Taille  Type    Description
------  ------  ------  -----------
0x00    4       uint32  Type = 0x26
0x04    4       uint32  Longueur du texte
0x08    n       string  Texte du tooltip
0x??    4       int32   X position affichage
0x??    4       int32   Y position affichage
```

#### Type 105 (0x69) - Polygone de collision

Zone cliquable de forme complexe (polygone) pour détourer bâtiments/personnages :

```
Offset  Taille  Type    Description
------  ------  ------  -----------
0x00    4       uint32  Type = 0x69
0x04    4       uint32  Nombre de sommets (N)
0x08    8*N     int32[] Coordonnées des sommets
                        Pour chaque sommet: X (4 bytes), Y (4 bytes)
```

Exemple pour un polygone à 8 sommets :
- 4 bytes : Type (0x69 0x00 0x00 0x00)
- 4 bytes : Count (0x08 0x00 0x00 0x00)
- 64 bytes : 8 paires (X, Y) de 32 bits chacune

### 7.3 Enchaînement logique des records

Dans le flux binaire d'un fichier VN, les records suivent un ordre spécifique :

```
[Record Type 38 - Texte du Hotspot]
       ↓
[Record Type 105 - Polygone de collision]
       ↓
[Record suivant...]
```

Le Type 38 définit le texte affiché au survol, puis le Type 105 définit la zone
géométrique de la collision.

### 7.4 Notes sur le parsing

1. **Version du moteur** : Certaines versions lisent les données binaires directement
   après le texte sans ID de type explicite. Les versions finales (comme europeo.exe)
   utilisent l'ID 105 pour isoler proprement les données géométriques.

2. **Validation** : Toujours vérifier que le nombre de sommets est raisonnable
   (< 1000) pour éviter les corruptions de données.

3. **Ordre des octets** : Tous les entiers sont en format Little Endian (x86).

---

**Dernière mise à jour**: 2026-01-26
**Analysé par**: radare2 5.5.0

---

## 8. Récapitulatif des découvertes

### 8.1 Éléments intégrés dans VNFileLoader.ts

| Catégorie | Élément | Statut |
|:----------|:--------|:-------|
| Records binaires | VNRecordType enum (6 types) | ✅ Implémenté |
| Événements | VNEventType enum (4 types) | ✅ Implémenté |
| Paramètres | TVNParmsType enum (24 types) | ✅ Implémenté |
| Paramètres | Interfaces TVN*Parms (24 interfaces) | ✅ Implémenté |
| Classes | TVNStreamableClass enum (34 classes) | ✅ Implémenté |
| Classes | StreamableClassMap (mapping nom→type) | ✅ Implémenté |
| Opcodes | OPCODE_MAP (43 entrées) | ✅ Implémenté |
| Commandes | CommandNameMap (49 commandes) | ✅ Implémenté |

### 8.2 Adresses clés dans europeo.exe

| Adresse | Contenu |
|:--------|:--------|
| 0x40ec00 | Début table enregistrement classes TVN*Parms |
| 0x411600 | Fin table classes streamables |
| 0x43f76c | Table des 49 commandes textuelles |
| 0x43f8cf | Chaînes événements (EV_ONFOCUS, etc.) |
| 0x4317D5 | Table de dispatch opcodes (43 entrées) |
| 0x43177D | Fonction dispatcher principal |

### 8.3 Formats de données clés

- **Chaînes** : uint32 LE longueur + données (pas uint16!)
- **Records** : uint32 LE type + données spécifiques
- **Couleurs** : #RRGGBB (format hexadécimal avec préfixe #)
- **Polygones** : uint32 count + (int32 x, int32 y) * count
