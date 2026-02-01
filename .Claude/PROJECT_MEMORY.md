# VN-Studio - Mémoire Complète du Projet

**Dernière mise à jour:** 2026-02-01
**Branche de travail:** claude/review-docs-html-demo-oFkzQ

---

## 1. IDENTITÉ DU PROJET

- **Nom:** VN-Studio
- **Objectif:** Port React/TypeScript du moteur de jeu Virtual Navigator 2.1
- **Éditeur original:** Sopra Multimedia, 32 rue Arago, 92800 Puteaux, France (1999)
- **Jeu analysé:** Europeo - jeu éducatif sur l'Europe pour enfants
- **Exécutable original:** europeo.exe (868 KB, PE32 x86, compilé Borland C++ Builder)
- **Technologie originale:** OWL 5.2, DirectDraw, WINMM, bds52t.dll (sérialisation Borland)
- **Cible du port:** React + Canvas 2D + Web Audio API

---

## 2. FORMAT VND - SPÉCIFICATION COMPLÈTE (VALIDÉE 19/19 fichiers)

### 2.1 Découverte clé: Format UNIQUE

**Il n'y a PAS de TYPE_A vs TYPE_B.** Tous les 19 fichiers VND utilisent le même format.
Le champ à la position 23 (anciennement "projectID") est le **SCENE COUNT**.

### 2.2 Borland OWL 5.2 Streaming

Header de stream: 5 bytes `0x3A` + skip(1) + uint32LE version (0x00000101)
- Version 0x101 = 257 → readWord = uint32, string lengths = uint32
- Fonctions clés dans bds52t.dll:
  - readWord (0x403c0d): dispatcher version-dépendant
  - readWord16 (0x403c31): lit 2 bytes
  - readWord32 (0x403c74): lit 4 bytes
  - readStringLength (0x403cb6): si version > 0x100 → uint32, sinon uint8
  - readVersion (0x403e12): parse le header 5 bytes
  - operator>>(ipstream, TRect) (0x40aad8): 4 × readBytes(4) = 16 bytes
  - operator>>(ipstream, string) (0x4047bd): readStringLength + readBytes

### 2.3 Structure globale du VND

```
STREAM_HEADER(5) → BS "VNFILE" → BS version("2.13") → uint32 sceneCount
→ BS projectName → BS editor → BS serial → BS projectIDStr → BS registry
→ uint32 width → uint32 height → uint32 depth → uint32 flag
→ uint32 u1 → uint32 u2 → uint32 reserved
→ BS dllPath → uint32 varCount → VARIABLES[varCount] → SCENES[sceneCount]
```

### 2.4 Header

| Champ | Type | Exemple (start.vnd) |
|-------|------|---------------------|
| Stream header | 5 bytes | `3a 01 01 00 00` |
| Magic | BS | "VNFILE" |
| Version | BS | "2.13" |
| Scene Count | uint32 | 4 |
| Nom projet | BS | "Europeo" |
| Éditeur | BS | "Sopra Multimedia" |
| Serial | BS | "5D51F233" |
| ID projet | BS | "EUROPEO" |
| Registry | BS | chemin registre Windows |
| Largeur | uint32 | 640 |
| Hauteur | uint32 | 480 |
| Profondeur | uint32 | 16 (bits) |
| Flag projet | uint32 | 0=main, 1=sub |
| u1 | uint32 | variable |
| u2 | uint32 | variable |
| Réservé | uint32 | 0 |
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

### 2.8 Structure d'une scène (TVNScene::Read)

```
Depuis 0x414ca1 (base props):
  BS → nom de scène
  readBytes(4) → 4 flag bytes
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
  TRect (4 × int32 = 16 bytes: left, top, right, bottom)
  uint32 val6 (field_0x50)
  uint32 hotspotCount → si >0: readWord(timer) + collection(readWord count + N × readObject)
  int32 cmdListValue → si ≠0: 5 × readWord (cmdList Read 0x414d9c)
  Content collection (0x413e21): uint32 count + count × TVNCommand::Read
```

### 2.9 TVNCommand::Read (0x4132f1)

```
1. String collection (0x40e989):
   uint32 count + count × (uint32 subIndex + readObject(uint32 type + BS string))
2. uint32 commandType
3. uint32 paramPairCount → si >0: paramPairCount × (int32 a, int32 b) = points polygon
4. Si version >= 0x2000c: uint32 flags
```

### 2.10 Types de commandes (commandType)

Les commandes contiennent leurs paramètres dans la string collection.
Chaque string a un "type" qui indique sa sémantique:

| String Type | Sémantique |
|------------|-----------|
| 6 | SCENE (nom scène cible) |
| 7 | HOTSPOT |
| 9 | PLAYAVI (chemin + params) |
| 10 | PLAYBMP (chemin x y zOrder) |
| 11 | PLAYWAV (chemin + mode) |
| 16 | PAUSE (durée ms) |
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
| 103 | CMD_103 | Contrôle de score avec polygon |
| 105 | POLYGON | Hotspot interactif principal |
| 106 | CMD_106 | Information avec zone |
| 107 | CMD_107 | Question bonus avec zone |
| 108 | CMD_108 | Animation interactive avec polygon |

### 2.12 Sémantique des paramPairs

Les paramPairs sont des coordonnées (x, y) formant un polygone de collision.
Chaque paire (a, b) = (x, y) d'un vertex du polygone.

---

## 3. ARCHITECTURE DU CODE

### 3.1 Structure des fichiers

```
demo/                          # MOTEUR WEB FONCTIONNEL
├── index.html                 # ~2500 lignes - moteur complet vanilla JS
├── server.js                  # Serveur Node.js statique
└── game-data/                 # ~592MB ressources jeu (19 modules)
    ├── couleurs1/             # Module principal (hub, toolbar, bonus)
    ├── france/, allem/, angl/ # Modules pays
    └── ...

src/                           # Code React/TypeScript (en pause)
├── engine/
│   ├── VNEngine.ts
│   ├── VNFileLoader.ts       # Parser obsolète (voir demo/index.html)
│   └── ...
├── components/
├── hooks/
└── types/

scripts/
├── debug-vnd.ts              # Parser debug TypeScript
└── parse-hotspots.ts         # Parser hotspots

VNP-VND/                      # 19 fichiers .vnd + .vnp (copies)
```

### 3.2 Moteur Web (demo/index.html)

**Fonctions principales:**
- `parseVND(arrayBuffer)` - Parse fichier VND complet
- `readScene(buf, view, p, sv)` - Parse une scène
- `readCommand(buf, view, p, sv)` - Parse une commande
- `goToScene(index)` - Navigation
- `executeStringCommand(type, value)` - Exécution commande
- `evaluateIf(ifStr)` - Évaluateur conditionnel
- `playWav/playAvi/playHtml()` - Lecture média
- `addBmpOverlay/delBmpOverlay()` - Gestion overlays
- `pointInPolygon(x, y, pairs)` - Hit testing
- `preloadResources(callback)` - Préchargement

---

## 4. FONCTIONS CLÉS DANS EUROPEO.EXE

| Adresse | Fonction | Description |
|---------|----------|-------------|
| 0x41721d | VND loader entry | Ouvre fichier, setup stream |
| 0x4174e6 | Main loading | Après validation VNFILE |
| 0x4176d0 | Scene loop | sceneCount itérations |
| 0x4161fa | TVNScene::Read | Lecture scène complète |
| 0x414ca1 | Base props | nom + flags + 3 props |
| 0x413e21 | Content collection | Lecture commandes |
| 0x4132f1 | TVNCommand::Read | Lecture commande |
| 0x41318b | TVNCommand ctor | Constructeur + setup |
| 0x40e989 | String collection | Lecture strings commande |
| 0x40dc1e | Hotspot collection | Lecture hotspots |
| 0x40d6f4 | Object reader | readWord(type) + readBS(string) |
| 0x414d9c | CmdList::Read | 5 × readWord |
| 0x41505f | Hotspot::Read | timer + collection |

---

## 5. ÉTAT ACTUEL - DEMO HTML FONCTIONNELLE

### demo/index.html (~2500 lignes)
Le moteur de jeu complet est implémenté en vanilla JavaScript dans `demo/index.html`.

**Pour lancer:**
```bash
cd demo && node server.js
# Ouvrir http://localhost:8080
```

### Fonctionnalités implémentées
- ✅ Parser VND complet (parseVND, readScene, readCommand...)
- ✅ Parser VNP (format INI)
- ✅ Rendu Canvas 2D avec scroll panoramique
- ✅ 40+ types de commandes (SCENE, PLAYWAV, IF, SET_VAR, ADDBMP...)
- ✅ Système de variables avec persistance cross-module
- ✅ Hit testing polygones (clic + hover)
- ✅ Audio WAV avec auto-unlock
- ✅ Vidéo WebM (conversion AVI→WebM)
- ✅ Overlays HTML, BMP, texte
- ✅ Toolbar conditionnel
- ✅ Préchargement ressources avec barre de progression
- ✅ Navigation entre 19 modules de pays
- ✅ Support tactile (tap, long-press, drag)

### Fonctionnalités manquantes
- ❌ PAUSE (type 16) - délai entre commandes
- ❌ RUNDLL (type 33) - euro32.dll (calculatrice), inv.dll (inventaire)
- ❌ DEFCURSOR (type 26)
- ❌ PLAYMID (type 12) - MIDI
- ❌ SAVE/LOAD (types 45/46)
- ❌ Système de timer hotspot

### Prochaines étapes suggérées
1. Implémenter PAUSE pour les séquences d'activation toolbar
2. Recréer le système d'inventaire (sacados) en HTML/JS
3. Recréer la calculatrice de conversion euro
4. Ajouter la persistence de l'état (localStorage)

---

## 6. CONVENTIONS

- Français pour commentaires et documentation
- Types préfixés VN (VNScene, VNHotspot, etc.)
- Encodage fichiers: Latin-1 / windows-1252
- Little-endian pour tous les entiers
- Pas d'emojis sauf demande explicite
