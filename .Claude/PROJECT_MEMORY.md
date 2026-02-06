# VN-Studio - Memoire Complete du Projet

**Derniere mise a jour:** 2026-02-06
**Branche de travail:** claude/setup-project-context-XUsHC

---

## 1. IDENTITE DU PROJET

- **Nom:** VN-Studio
- **Objectif:** Port web du moteur de jeu Virtual Navigator 2.1
- **Editeur original:** Sopra Multimedia, 32 rue Arago, 92800 Puteaux, France (1999)
- **Jeu analyse:** Europeo - jeu educatif sur l'Europe pour enfants
- **Executable original:** europeo.exe (868 KB, PE32 x86, compile Borland C++ Builder)
- **Technologie originale:** OWL 5.2, DirectDraw, WINMM, bds52t.dll (serialisation Borland)
- **Cible du port:** Vanilla JS (demo/index.html) puis React + Canvas 2D + Web Audio API
- **Repo:** https://github.com/aciderix/VN-Studio.git

---

## 2. FORMAT VND - SPECIFICATION COMPLETE (VALIDEE 19/19 fichiers)

### 2.1 Decouverte cle: Format UNIQUE

**Il n'y a PAS de TYPE_A vs TYPE_B.** Tous les 19 fichiers VND utilisent le meme format.
Le champ a la position 23 (anciennement "projectID") est le **SCENE COUNT**.

### 2.2 Borland OWL 5.2 Streaming

Header de stream: 5 bytes `0x3A` + skip(1) + uint32LE version (0x00000101)
- Version 0x101 = 257 -> readWord = uint32, string lengths = uint32
- Fonctions cles dans bds52t.dll:
  - readWord (0x403c0d): dispatcher version-dependant
  - readWord16 (0x403c31): lit 2 bytes
  - readWord32 (0x403c74): lit 4 bytes
  - readStringLength (0x403cb6): si version > 0x100 -> uint32, sinon uint8
  - readVersion (0x403e12): parse le header 5 bytes
  - operator>>(ipstream, TRect) (0x40aad8): 4 x readBytes(4) = 16 bytes
  - operator>>(ipstream, string) (0x4047bd): readStringLength + readBytes

### 2.3 Structure globale du VND

```
STREAM_HEADER(5) -> BS "VNFILE" -> BS version("2.13") -> uint32 sceneCount
-> BS projectName -> BS editor -> BS serial -> BS projectIDStr -> BS registry
-> uint32 width -> uint32 height -> uint32 depth -> uint32 flag
-> uint32 u1 -> uint32 u2 -> uint32 reserved
-> BS dllPath -> uint32 varCount -> VARIABLES[varCount] -> SCENES[sceneCount]
```

### 2.4 Header

| Champ | Type | Exemple (start.vnd) |
|-------|------|---------------------|
| Stream header | 5 bytes | `3a 01 01 00 00` |
| Magic | BS | "VNFILE" |
| Version | BS | "2.13" |
| Scene Count | uint32 | 4 |
| Nom projet | BS | "Europeo" |
| Editeur | BS | "Sopra Multimedia" |
| Serial | BS | "5D51F233" |
| ID projet | BS | "EUROPEO" |
| Registry | BS | chemin registre Windows |
| Largeur | uint32 | 640 |
| Hauteur | uint32 | 480 |
| Profondeur | uint32 | 16 (bits) |
| Flag projet | uint32 | 0=main, 1=sub |
| u1 | uint32 | variable |
| u2 | uint32 | variable |
| Reserve | uint32 | 0 |
| DLL path | BS | "..\vnstudio\vnresmod.dll" |
| Variable count | uint32 | 284 |

### 2.5 Borland String (BS)

```
uint32 LE (longueur) + N bytes Latin-1 (pas de \0)
```

### 2.6 Variables

Pour chaque variable: BS(nom) + uint32(valeur)

### 2.7 Scene Count par fichier

```
allem=15, angleterre=82, autr=24, barre=5, belge=28, biblio=62,
couleurs1=54, danem=16, ecosse=42, espa=20, finlan=20, france=34,
grece=19, holl=22, irland=23, italie=36, portu=17, start=4, suede=14
```

### 2.8 Structure d'une scene (TVNScene::Read)

```
Depuis 0x414ca1 (base props):
  BS -> nom de scene
  readBytes(4) -> 4 flag bytes
  uint32 prop1, uint32 prop2, uint32 prop3

Depuis TVNScene::Read (0x4161fa, version >= 0x2000a):
  BS string1 (field_0x24)
  BS string2 (field_0x20)
  uint32 val1 (field_0x54)
  BS string3 (field_0x28)
  uint32 val2 (field_0x58)
  BS string4 (field_0x2c)
  uint32 val3 (field_0x5c)
  BS resource (field_0x30, e.g. "interface.bmp", "<res0001>")
  uint32 val4 (field_0x60)
  BS string6 (field_0x34)
  uint32 val5 (field_0x64)
  TRect (4 x int32 = 16 bytes: left, top, right, bottom)
  uint32 val6 (field_0x50)
  uint32 hotspotCount -> si >0: readWord(timer) + collection(readWord count + N x readObject)
  int32 cmdListValue -> si !=0: 5 x readWord (cmdList Read 0x414d9c)
  Content collection (0x413e21): uint32 count + count x TVNCommand::Read
```

### 2.9 TVNCommand::Read (0x4132f1)

```
1. String collection (0x40e989):
   uint32 count + count x (uint32 subIndex + readObject(uint32 type + BS string))
2. uint32 commandType
3. uint32 paramPairCount -> si >0: paramPairCount x (int32 a, int32 b) = points polygon
4. Si version >= 0x2000c: uint32 flags
```

### 2.10 Types de commandes (commandType)

Les commandes contiennent leurs parametres dans la string collection.
Chaque string a un "type" qui indique sa semantique:

| String Type | Semantique |
|------------|-----------|
| 6 | SCENE (nom scene cible) |
| 7 | HOTSPOT |
| 9 | PLAYAVI (chemin + params) |
| 10 | PLAYBMP (chemin x y zOrder) |
| 11 | PLAYWAV (chemin + mode) |
| 16 | PAUSE (duree ms) |
| 17 | EXEC (commande) |
| 21 | IF (condition then action [else action]) |
| 22 | SET_VAR (var value) |
| 23 | INC_VAR (var value) |
| 24 | DEC_VAR (var value) |
| 26 | DEFCURSOR |
| 28 | DELBMP (nom) |
| 31 | RUNPRJ (chemin .vnp + scene) |
| 33 | RUNDLL (chemin .dll) |
| 36 | CLOSEWAV |
| 38 | PLAYTEXT (x y w h flags texte) |
| 39 | FONT (taille flags couleur famille) |

### 2.11 Command Types globaux

| commandType | Nom | Description |
|------------|------|-------------|
| 100 | CMD_100 | Commande avec hotspot polygon |
| 101 | CMD_101 | Navigation avec polygon |
| 103 | CMD_103 | Controle de score avec polygon |
| 105 | POLYGON | Hotspot interactif principal |
| 106 | CMD_106 | Information avec zone |
| 107 | CMD_107 | Question bonus avec zone |
| 108 | CMD_108 | Animation interactive avec polygon |

### 2.12 Semantique des paramPairs

Les paramPairs sont des coordonnees (x, y) formant un polygone de collision.
Chaque paire (a, b) = (x, y) d'un vertex du polygone.

---

## 3. ARCHITECTURE DU CODE

### 3.1 Structure des fichiers

```
demo/                          # MOTEUR WEB FONCTIONNEL
  index.html                   # ~2300 lignes - moteur complet vanilla JS
  server.js                    # Serveur Node.js statique (port 8080)
  game-data/                   # ~592MB ressources jeu (19 modules)
    couleurs1/                 # Module principal (hub, toolbar, bonus)
    france/, allem/, angl/     # Modules pays
    barre/                     # Toolbar assets
    euroland/                  # Ressources partagees
    biblio/                    # Bibliotheque
    ...

src/                           # Code React/TypeScript (EN PAUSE)
  engine/
    VNEngine.ts
    VNFileLoader.ts            # Parser obsolete (voir demo/index.html)
    VNCommandProcessor.ts
    VNSceneManager.ts
    VNRenderer.ts
    VNAudioManager.ts
    VNTimerManager.ts
    VNVariableStore.ts
  components/
    GameContainer.tsx
  hooks/
    useVNEngine.ts
  types/
    vn.types.ts

scripts/                       # Outils de debug/analyse
  debug-vnd.ts                 # Parser debug TypeScript
  parse-hotspots.ts            # Parser hotspots TypeScript
  detect-parts-final.js        # Detection parts couleurs1 (54 parts)
  detect-parts-universal.js    # Detection universelle
  parse-vnd-universal.js       # Parser VND complet (526 lignes)
  test-vnd-loader.ts           # Tests validation 19 VND

tools/                         # Outils CLI avances
  vnd-debug.js                 # CLI debug complet (1418 lignes)

VNP-VND/                       # 19 fichiers .vnd + .vnp (copies)

europeo_functions/             # Dump fonctions depuis europeo.exe
  00_STRINGS.txt               # Chaines extraites
  00_IMPORTS.txt               # Imports DLL
  ...
```

### 3.2 Moteur Web (demo/index.html ~2300 lignes)

**Fonctions principales:**
- `parseVND(arrayBuffer)` - Parse fichier VND complet
- `readScene(buf, view, p, sv)` - Parse une scene
- `readCommand(buf, view, p, sv)` - Parse une commande
- `goToScene(index)` - Navigation entre scenes
- `executeStringCommand(type, value)` - Execution commande par type
- `evaluateIf(ifStr)` - Evaluateur conditionnel
- `evaluateIfReadOnly(ifStr)` - Version read-only pour hover
- `playWav/playAvi/playHtml()` - Lecture media
- `addBmpOverlay/delBmpOverlay()` - Gestion overlays images
- `pointInPolygon(x, y, pairs)` - Hit testing polygones
- `preloadResources(callback)` - Prechargement avec barre progression
- `handleCommandClick(cmd)` - Traitement clic
- `resumeCommandProcessing(cmd, startIdx)` - Two-pass execution
- `evaluateHoverEffects(cmd)` - Effets au survol

**Globales cles:**
- `project` - Donnees VND parsees
- `currentSceneIndex` - Index scene courante
- `gameVars` - Variables du jeu (Map)
- `overlayImages` - Overlays BMP actifs
- `overlayTexts` - Overlays texte actifs
- `audioElements` - Elements audio en cours

**Pour lancer:**
```bash
cd demo && node server.js
# Ouvrir http://localhost:8080
```

### 3.3 Outil CLI debug (tools/vnd-debug.js)

**Commandes disponibles:**
- `parse` - Afficher etapes de parsing detaillees
- `info` - Infos VND (header, version, resolution, scene count)
- `scenes` - Lister toutes les scenes
- `scene <n>` - Detail d'une scene
- `vars` - Lister variables
- `validate` - Verifier problemes (vars indefinies, scenes invalides)
- `elements <n>` - Elements avec positions (fond, audio, HTML, images, textes, videos, polygones)
- `hover <n>` - Effets hover uniquement
- `click <n>` - Actions clic uniquement
- `resources [type]` - Lister ressources (images/sounds/videos/html)
- `search <pattern>` - Rechercher dans les commandes
- `conditions [scene]` - Lister conditions IF
- `flow <scene>` - Analyser transitions de scenes
- `simulate <scene>` - Simuler chargement scene
- `state <scene> [actions]` - Etat complet avec historique
- `diff <scene> <action>` - Comparer avant/apres action

**Utilisation:**
```bash
node tools/vnd-debug.js <fichier.vnd> <commande> [args]
# Exemple: node tools/vnd-debug.js demo/game-data/couleurs1/couleurs1.vnd scenes
# Exemple: node tools/vnd-debug.js demo/game-data/couleurs1/couleurs1.vnd scene 0
# Exemple: node tools/vnd-debug.js demo/game-data/couleurs1/couleurs1.vnd simulate 0
```

---

## 4. FONCTIONS CLES DANS EUROPEO.EXE

| Adresse | Fonction | Description |
|---------|----------|-------------|
| 0x41721d | VND loader entry | Ouvre fichier, setup stream |
| 0x4174e6 | Main loading | Apres validation VNFILE |
| 0x4176d0 | Scene loop | sceneCount iterations |
| 0x4161fa | TVNScene::Read | Lecture scene complete |
| 0x414ca1 | Base props | nom + flags + 3 props |
| 0x413e21 | Content collection | Lecture commandes |
| 0x4132f1 | TVNCommand::Read | Lecture commande |
| 0x41318b | TVNCommand ctor | Constructeur + setup |
| 0x40e989 | String collection | Lecture strings commande |
| 0x40dc1e | Hotspot collection | Lecture hotspots |
| 0x40d6f4 | Object reader | readWord(type) + readBS(string) |
| 0x414d9c | CmdList::Read | 5 x readWord |
| 0x41505f | Hotspot::Read | timer + collection |
| 0x43177D | Command dispatcher | Table de saut opcodes (index = opcode - 6) |
| 0x43f700 | Command table | 49 commandes textuelles |
| 0x43f8cf | Event names | EV_ONFOCUS, EV_ONCLICK, EV_ONINIT, EV_AFTERINIT |

---

## 5. BINAIRES DU JEU

| Fichier | Taille | Type | Description |
|---------|--------|------|-------------|
| europeo.exe | 868 KB | PE32 x86 GUI | Executable principal (vn21_32.exe) |
| Euro32.dll | 552 KB | PE32 x86 DLL | Calculatrice conversion euros |
| inv.dll | 160 KB | PE32 x86 DLL | Systeme inventaire (sacados) |
| vnoption.dll | 122 KB | PE32 x86 DLL | Module options utilisateur |
| vnresmod.dll | 565 KB | PE32 x86 DLL | Module ressources |
| vndllapi.dll | 12 KB | PE32 x86 DLL | API variables et messages |
| bds52t.dll | 84 KB | PE32 x86 DLL | Runtime Borland (serialisation) |

### API vndllapi.dll
- `InitVNCommandMessage()` - Enregistre "wm_vncommand" message Windows
- `DirectDrawEnabled()` - Retourne toujours TRUE
- `VNDLLVarFind(head, name)` - Recherche variable (insensible casse)
- `VNDLLVarAddModify(head, name, value)` - Ajoute/modifie variable

### Structure VNVariable (264 bytes = 0x108)
```
Offset 0x000: char name[256]      // Nom en MAJUSCULES
Offset 0x100: int32_t value       // Valeur entiere
Offset 0x104: VNVariable* next    // Pointeur suivant
```

---

## 6. ETAT ACTUEL - DEMO HTML FONCTIONNELLE

### Fonctionnalites implementees
- Parser VND complet (parseVND, readScene, readCommand)
- Parser VNP (format INI)
- Rendu Canvas 2D avec scroll panoramique
- 40+ types de commandes (SCENE, PLAYWAV, IF, SET_VAR, ADDBMP...)
- Systeme de variables avec persistance cross-module
- Hit testing polygones (clic + hover)
- Audio WAV avec auto-unlock
- Video WebM (conversion AVI->WebM)
- Overlays HTML, BMP, texte
- Toolbar conditionnel (y=400-480)
- Prechargement ressources avec barre de progression
- Navigation entre 19 modules de pays
- Support tactile (tap, long-press, drag)
- Debug panel (liste scenes, polygones, variables)
- Two-pass command processing (side-effects d'abord, puis navigation)

### Fonctionnalites manquantes
- PAUSE (type 16) - delai entre commandes
- RUNDLL (type 33) - euro32.dll (calculatrice), inv.dll (inventaire)
- DEFCURSOR (type 26)
- PLAYMID (type 12) - MIDI
- SAVE/LOAD (types 45/46)
- Systeme de timer hotspot
- CLOSEMID / CLOSEAVI

### Prochaines etapes suggerees
1. Implementer PAUSE pour les sequences d'activation toolbar
2. Recreer le systeme d'inventaire (sacados) en HTML/JS
3. Recreer la calculatrice de conversion euro
4. Ajouter la persistence de l'etat (localStorage)

---

## 7. SCENES IMPORTANTES (couleurs1.vnd)

- Index 0: Village (scene de depart)
- Index 7: Collection d'objets (sacados, allumettes, cle jaune)
- Index 8: Ecran info sacados
- Index 35: Definition overlay toolbar
- Index 34: Scene reponse bonus (routage conditionnel)
- Index 53: Game over
- Total: 54 scenes

---

## 8. VARIABLES CLES DU JEU

- `sacados` - Sac a dos (inventaire)
- `score` - Score joueur
- `calc` / `telephone` / `trans` - Outils actifs
- `fiole` - Completion pays (0-12)
- `bonus1`-`bonus9` - Etats questions bonus
- Variables pays: `france`, `allemagne`, `angleterre`, `ecosse`, `belgique`, `grece`, `hollande`, `irlande`, `italie`, `portugal`, `espagne`, `autriche`, `danemark`, `finlande`, `suede`
- Total: 284 variables dans start.vnd

---

## 9. OUTILS DISPONIBLES

### Radare2 (installe)
```bash
# Analyse binaire des .exe et .dll
r2 -e scr.color=0 europeo.exe   # Mode no-color pour output CLI
r2 -e scr.color=0 Euro32.dll    # Analyser la calculatrice
r2 -e scr.color=0 inv.dll       # Analyser l'inventaire
```

### Scripts Node.js
```bash
# Parser VND universel
node scripts/parse-vnd-universal.js VNP-VND/start.vnd

# Debugger CLI complet
node tools/vnd-debug.js demo/game-data/couleurs1/couleurs1.vnd scenes
node tools/vnd-debug.js demo/game-data/couleurs1/couleurs1.vnd simulate 0
node tools/vnd-debug.js demo/game-data/couleurs1/couleurs1.vnd flow 0

# Detection de parts
node scripts/detect-parts-final.js VNP-VND/couleurs1.vnd

# Serveur de dev
cd demo && node server.js  # -> http://localhost:8080
```

### Scripts TypeScript
```bash
npx ts-node --transpile-only scripts/debug-vnd.ts VNP-VND/start.vnd
npx ts-node --transpile-only scripts/parse-hotspots.ts VNP-VND/start.vnd
```

---

## 10. RUNTIME FINDINGS (europeo_functions dump)

- **Smooth zoom/scrolling** - preferences utilisateur avec interpolation
- **Toolbar always visible** - option de config
- **Image quality** - 256 couleurs ou TrueColor
- **Navigation actions** - previous/next scene, index, map, forward/backward/left/right
- **Error messages** - "Unknown command", "Invalid index", "Unable to load file"
- **Audio** - PlaySoundA (WAV), mciSendCommandA (MIDI/AVI/CD), midiOutGetNumDevs
- **Timers** - timeBeginPeriod, timeSetEvent, timeKillEvent (animations/transitions)
- **Rendu** - DirectDrawCreate confirme DirectDraw pour le blitting

---

## 11. FORMAT MIXTE TEXTE/OPCODES

Le moteur utilise un systeme **HYBRIDE**:
1. **Commandes textuelles** (playwav, set_var, scene) pour le haut niveau
2. **Opcodes par suffixe** (d, f, h, i, j, k, l) pour le controle bas niveau

Table de dispatch: 43 entrees (opcodes 0x06-0x30), index = opcode - 6.
Suffixes lettres: index = char - 'a' + 1 (d=direct, f=scene jump, h=tooltip, i=index, j=bitmap, k=wav, l=midi).

---

## 12. DECOUVERTE CLE: subIndex (TIMING D'EXECUTION)

### 12.1 Le champ subIndex

Chaque string dans un TVNCommand a un champ `subIndex` (uint32) qui determine
**quand** la commande s'execute. Ce champ etait deja parse correctement dans
`readStringCollection()` mais n'etait jamais utilise par le moteur web.

| subIndex | Nom | Quand |
|----------|-----|-------|
| 0 | ONFOCUS | Au survol (hover) du polygone |
| 1 | ONCLICK | Au clic sur le polygone |
| 2 | ONINIT | A l'entree dans la scene |
| 3 | AFTERINIT | Apres l'init de la scene |

### 12.2 Impact sur le moteur

Les commandes interactives (celles avec `paramPairs.length > 0`, i.e. avec un polygone)
contiennent souvent des strings avec differents subIndex. Exemple dans france.vnd:

- Un hotspot peut avoir un ADDBMP avec subIndex=2 (afficher helice au chargement)
  ET un PLAYBMP avec subIndex=1 (image au clic seulement)
- Les commandes de type SET_VAR, PLAYAVI, etc. dans un hotspot avec subIndex=2
  doivent s'executer automatiquement au chargement de la scene

### 12.3 Implementation dans executeSceneCommands

Pass 0 et Pass 1 filtrent maintenant avec `if (isInteractive && s.subIndex < 2) return;`
pour ne pas executer les actions hover/clic au chargement de la scene.

### 12.4 Reference binaire

- `0x43f8cf` dans europeo.exe: Table des noms d'evenements
  - EV_ONFOCUS, EV_ONCLICK, EV_ONINIT, EV_AFTERINIT
- Le dispatcher de commande a `0x43177D` utilise le subIndex pour router

---

## 13. BUGS CORRIGES (SESSION 2026-02-05/06)

### 13.1 Overlay persistence (helice.bmp)

**Probleme:** `overlayImages = {}` dans `executeSceneCommands` effacait tous les overlays
a chaque changement de scene. Les ADDBMP des commandes interactives n'etaient pas
re-executes au retour dans une scene.

**Fix:** Reset des flags `autoPlayedVideo`/`autoShowedBmp` sur chaque commande au debut
de `executeSceneCommands`, et utilisation du subIndex pour determiner quelles commandes
des hotspots interactifs doivent s'executer au chargement.

### 13.2 Stale video error events

**Probleme:** Les event handlers `error` d'une video precedente pouvaient tuer la video
suivante si l'evenement arrivait apres le remplacement de `currentVideo`.

**Fix:** Guard `if (currentVideo === video)` sur les handlers ended/error de playAvi.

### 13.3 Race condition video error/navigation (CRITIQUE)

**Probleme:** Quand une video est jouee avec double source (webm + avi fallback),
le navigateur peut emettre un `error` sur `<video>` meme si le webm fonctionne.
Deux handlers etaient enregistres sur le meme evenement:
1. `playAvi` error handler → appelait `closeVideo()` → `currentVideo = null`
2. `onVideoEnd` dans `resumeCommandProcessing` → voyait `currentVideo !== vid` → return

La navigation (scene 6 → scene 23) n'etait jamais executee.

**Fix (3 changements):**
1. `playAvi` error handler: seulement fermer si `readyState === 0` (aucune source chargee)
2. `playAvi` ended handler: defer a `onVideoEnd` si `waitingForVideoEnd === true`
3. `onVideoEnd`: ignorer les events `error` si `readyState > 0` (source active)
4. `closeVideo()`: retrait de `vid.load()` qui declenchait des events spurieux

---

## 14. CONVENTIONS

- Francais pour commentaires et documentation
- Types prefixes VN (VNScene, VNHotspot, etc.)
- Encodage fichiers: Latin-1 / windows-1252
- Little-endian pour tous les entiers
- Pas d'emojis sauf demande explicite
- radare2 en mode no-color: `-e scr.color=0`
