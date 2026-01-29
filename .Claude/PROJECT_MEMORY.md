# VN-Studio - Mémoire Complète du Projet

**Dernière mise à jour:** 2026-01-29
**Branche de travail:** claude/review-vn-studio-context-OEujj
**Branche précédente:** claude/game-engine-reverse-engineer-xlLE9 (mergée via PR #1)

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

## 2. FORMAT VND - SPÉCIFICATION COMPLÈTE (VALIDÉE)

### 2.1 Structure globale

```
HEADER → VARIABLES[284] → SCENE_COUNT → SCENES[7]
```

### 2.2 Header

| Champ | Type | Exemple (start.vnd) |
|-------|------|---------------------|
| Flags | 5 bytes | `3a 01 01 00 00` |
| Magic | Borland string | "VNFILE" |
| Version | Borland string | "2.13" |
| Format type | uint32 | 4 |
| Nom projet | Borland string | "Europeo" |
| Éditeur | Borland string | "Sopra Multimedia" |
| Serial | Borland string | "5D51F233" |
| ID projet | Borland string | "EUROPEO" |
| Registry path | Borland string | chemin registre Windows |
| Largeur | uint32 | 640 |
| Hauteur | uint32 | 480 |
| Profondeur | uint32 | 16 (bits) |
| 4 inconnus | 4 × uint32 | 0, 4, 1, 0 |
| DLL path | Borland string | "..\vnstudio\vnresmod.dll" |
| Variable count | uint32 | 284 |

### 2.3 Borland String

```
uint32 LE (longueur) + N bytes Latin-1 (pas de \0)
```

### 2.4 Variables

Immédiatement après variable count. Pour chaque variable:
- Borland string (nom)
- uint32 (valeur, généralement 0)

Exemples: SACADOS, JEU, BIDON... (284 au total, positions 178-4526)

### 2.5 Scene Count

- Position 4527 dans start.vnd
- uint32 = 7

### 2.6 Structure d'une scène

| Champ | Taille | Type |
|-------|--------|------|
| Nom | 50 bytes | fixe, null-padded |
| Flag | 1 byte | uint8 (0-3) |
| Resource | variable | Borland string (image fond) |
| Réservé | 32 bytes | zéros |
| Records | variable | séquence de records |

### 2.7 Types de records

| Type | Nom | Format données |
|------|-----|----------------|
| 1 | Wrapper | subtype(uint32) + Borland string |
| 3 | Commande complexe | subtype(uint32) + Borland string |
| 6 | SCENE | Borland string (nom scène cible) |
| 9 | PLAYAVI | Borland string |
| 10 | PLAYBMP | Borland string ("path x y zOrder") |
| 11 | PLAYWAV | Borland string (chemin audio) |
| 22 | SET_VAR | Borland string ("var value") |
| 31 | RUNPRJ | Borland string (chemin .vnp) |
| 105 | POLYGON | count(uint32) + N × (int32 x, int32 y) |

Sous-types Type 1: 17=EXEC, 31=RUNPRJ, 36=inconnu
Sous-types Type 3: 6=SCENE, 9=PLAYAVI, 22=SET_VAR, 26=DEFCURSOR

Séparateurs: 4 bytes nuls entre groupes de records.

### 2.8 Structure d'un hotspot

```
PLAYBMP (10) → PLAYWAV (11, optionnel) → Commandes → POLYGON (105)
```

### 2.9 Hotspots découverts dans start.vnd (scène Frontal)

| # | Nom | Image | Position | z | Actions |
|---|-----|-------|----------|---|---------|
| 1 | jeu | interface\jeu.bmp | (0,176) | 257 | SET_VAR jeu=0, score=0 |
| 2 | livres | interface\livres.bmp | (0,0) | 273 | RUNPRJ biblio.vnp |
| 3 | tirelire | interface\tirelire.bmp | (0,483) | 207 | EXEC tirelire.exe |
| 4 | oui | interface\oui.bmp | (0,470) | 0 | - |
| 5 | video | interface\video.bmp | (0,0) | 0 | - |

### 2.10 Enum VNRecordType complet (0-48 + 105)

```
0=QUIT, 1=ABOUT, 2=PREFS, 3=PREV, 4=NEXT, 5=ZOOM,
6=SCENE, 7=HOTSPOT, 8=TIPTEXT, 9=PLAYAVI, 10=PLAYBMP,
11=PLAYWAV, 12=PLAYMID, 13=PLAYHTML, 14=ZOOMIN, 15=ZOOMOUT,
16=PAUSE, 17=EXEC, 18=EXPLORE, 19=PLAYCDA, 20=PLAYSEQ,
21=IF, 22=SET_VAR, 23=INC_VAR, 24=DEC_VAR, 25=INVALIDATE,
26=DEFCURSOR, 27=ADDBMP, 28=DELBMP, 29=SHOWBMP, 30=HIDEBMP,
31=RUNPRJ, 32=UPDATE, 33=RUNDLL, 34=MSGBOX, 35=PLAYCMD,
36=CLOSEWAV, 37=CLOSEDLL, 38=PLAYTEXT, 39=FONT, 40=REM,
41=ADDTEXT, 42=DELOBJ, 43=SHOWOBJ, 44=HIDEOBJ, 45=LOAD,
46=SAVE, 47=CLOSEAVI, 48=CLOSEMID,
105=POLYGON_COLLISION
```

### 2.11 Positions clés dans start.vnd (6323 bytes)

| Élément | Position | Valeur |
|---------|----------|--------|
| Variable count | 174 | 284 |
| Variables | 178-4526 | 284 vars |
| Scene count | 4527 | 7 |
| Scènes | 4531+ | 7 scènes |
| Hotspots Frontal | 5050, 5309, 5521, 5753, 5934 | 5 hotspots |

---

## 3. ARCHITECTURE DU CODE

### 3.1 Structure des fichiers

```
src/
├── engine/
│   ├── VNEngine.ts           # Moteur principal (TVNApplication)
│   ├── VNFileLoader.ts       # Parser VND/VNP (88 KB, ~1800 lignes)
│   ├── VNSceneManager.ts     # Gestion des scènes
│   ├── VNCommandProcessor.ts # Exécution des commandes
│   ├── VNRenderer.ts         # Rendu Canvas 2D
│   ├── VNAudioManager.ts     # Audio Web Audio API
│   ├── VNTimerManager.ts     # Timers et effets
│   ├── VNVariableStore.ts    # Variables (struct 264 bytes)
│   └── index.ts
├── components/
│   ├── GameContainer.tsx     # Composant React principal
│   └── index.ts
├── hooks/
│   ├── useVNEngine.ts        # Hook React
│   └── index.ts
├── types/
│   └── vn.types.ts           # Types TS complets (627 lignes)
├── examples/
│   └── ExampleProject.ts
└── index.ts

scripts/
├── debug-vnd.ts              # Parser debug complet (header + vars + scènes)
└── parse-hotspots.ts         # Parser hotspots ciblé (zone 5000-6300)

docs/
└── VND_FORMAT.md             # Documentation format VND

VNP-VND/                      # Fichiers de données du jeu
├── start.vnd (6323 B)        # Fichier principal analysé
├── start.vnp (141 B)
├── barre.vnd/vnp
├── biblio.vnd/vnp
├── couleurs1.vnd/vnp
└── danem.vnd/vnp
```

### 3.2 Types importants (vn.types.ts)

- `VNProject` - Projet complet (scenes, variables, display settings)
- `VNSceneParsed` - Scène parsée (id, name, index, backgroundFile, hotspots, commands, gdiObjects)
- `VNHotspotParsed` - Hotspot parsé (id, name, bounds, polygon, commands)
- `VNCommandGeneric` - Commande générique (type: VNCommandType, params)
- `VNVariable` - Variable (name, value)
- `VNRect` - Rectangle (left, top, right, bottom) ← PAS x1/y1/x2/y2
- `VNPoint` - Point (x, y)
- `VNCommandType` - Enum des types de commandes binaires (GOTO=0..UNKNOWN=255)
- `VNDisplayModeType` - Enum (WINDOWED=0, FULLSCREEN=1, BORDERLESS=2)
- `VNGdiObjectGeneric` - Objet graphique (bounds: VNRect)
- `CommandType` - Enum des commandes haut niveau ('GOTO', 'SETVAR', etc.)

### 3.3 VNFileLoader.ts - État actuel

Le fichier contient:
- `VNRecordType` enum (0-48 + 105)
- `VNRecordTypeNames` mapping
- `VNCommandCategory` enum + mapping
- Interfaces pour les records typés (VNRectCollision, VNAudioWavRecord, etc.)
- `VNEventType` enum (EV_ONFOCUS=0..EV_AFTERINIT=3)
- `TVNParmsType` enum + interfaces pour tous les paramètres TVN
- `TVNStreamableClass` enum + mapping
- `BinaryReader` class (ArrayBuffer-based, windows-1252)
- `VNFileLoader` class avec:
  - `loadProject()` / `loadDataFile()` / `loadSaveFile()`
  - `parseVNFile()` - Parse le header VND complet (validé)
  - `readSceneVND()` - Parse une scène (50b nom + flag + resource + 32b réservé + propriétés)
  - `readCommandBlockVND()` - Parse un bloc commande (24b header + type + 50b desc + 48b padding)
  - `parseRecordSequence()` - Parse les records séquentiels (hotspots/commandes)

---

## 4. PROBLÈMES CONNUS À CORRIGER

### 4.1 Erreurs TypeScript dans VNFileLoader.ts

1. **VNRect incompatibilité**: Le type `VNRect` utilise `left/top/right/bottom` mais le code dans `parseRecordSequence()` utilise `x1/y1/x2/y2` (ligne ~1513). Il faut utiliser `left/top/right/bottom`.

2. **Casting VNRecordType → VNCommandType**: Le code cast `VNRecordType.PLAYBMP as VNCommandType` etc. (lignes ~1522, 1532, 1544, etc.). Ces enums ont des valeurs différentes (PLAYBMP=10 dans VNRecordType mais IMAGE=10 dans VNCommandType). Il faudrait un mapping correct.

3. **readSceneVND mal structuré**: La méthode `readSceneVND()` lit 6 uint32 de propriétés + hotspotCount + commandCount après les 32 bytes réservés, mais le format réel (validé par les scripts debug) ne contient pas ces champs. Les scènes VND réelles enchaînent directement les records après les 32 bytes réservés.

4. **Propriété `index` absente**: `VNHotspotParsed` n'a pas de propriété `index` mais le code l'utilise dans `parseRecordSequence()`.

5. **Type `id` manquant**: Le code crée des hotspots sans `id` (requis par `VNHotspotParsed`).

### 4.2 Parser de scènes incomplet

Le script `debug-vnd.ts` utilise un pattern matching pour trouver les scènes (regex `^[A-Z][a-z]+`), ce qui est fragile. Le parser `parseVNFile()` dans VNFileLoader.ts lit correctement le `sceneCount` depuis le header, mais la méthode `readSceneVND()` assume une structure avec des compteurs hotspot/commandes qui n'existent pas dans le format réel.

### 4.3 Logique de parsing des scènes à porter

La logique correcte (validée dans debug-vnd.ts):
1. Lire le scene count (uint32) après les variables
2. Pour chaque scène: 50 bytes nom + 1 byte flag + Borland string resource + 32 bytes réservés
3. Puis parser les records séquentiellement jusqu'à la prochaine scène

Le problème: on ne connaît pas la taille exacte de chaque scène. debug-vnd.ts utilise le pattern matching pour délimiter. Il faudrait soit:
- Trouver un marqueur de fin de scène
- Calculer la taille depuis les données elles-mêmes

---

## 5. PROCHAINES ÉTAPES (PRIORITÉ)

### Priorité haute
1. **Corriger VNFileLoader.ts** - Aligner les types (VNRect, VNCommandType), corriger readSceneVND()
2. **Porter logique debug-vnd.ts → VNFileLoader.ts** - Utiliser sceneCount, parser records séquentiels
3. **Tester avec tous les fichiers VND** - biblio.vnd (140KB), couleurs1.vnd (76KB), etc.

### Priorité moyenne
4. **Implémenter le rendu React** - Charger BMP, dessiner polygones debug, gérer clics
5. **Implémenter les commandes** - SET_VAR, SCENE, PLAYWAV, RUNPRJ, EXEC, IF

### Priorité basse
6. **Optimisations** - Cache ressources, préchargement
7. **Support VNP** - Parser les fichiers .vnp (INI-like, réfèrent les .vnd)

---

## 6. OUTILS ET COMMANDES

```bash
# Debug VND complet
npx ts-node --transpile-only scripts/debug-vnd.ts VNP-VND/start.vnd

# Parser hotspots
npx ts-node --transpile-only scripts/parse-hotspots.ts VNP-VND/start.vnd

# Hex dump
od -A d -t x1z -v VNP-VND/start.vnd | less

# Radare2 (désactiver couleurs)
r2 -e scr.color=0 europeo.exe
```

---

## 7. FICHIERS VND DISPONIBLES

| Fichier | Taille | Contenu probable |
|---------|--------|------------------|
| start.vnd | 6323 B | Menu principal (7 scènes, 284 vars) |
| barre.vnd | 28252 B | Barre de navigation |
| biblio.vnd | 140765 B | Bibliothèque (plus gros fichier) |
| couleurs1.vnd | 76174 B | Jeu des couleurs |
| danem.vnd | 41862 B | Danemark? |

---

## 8. CLASSES TVN ORIGINALES (60+)

Core: TVNApplication, TVNFrame, TVNWindow, TVNVersion, TVNProjectInfo
Scènes: TVNScene, TVNSceneArray, TVNSceneParms, TVNSceneProperties, TVNDisplayMode
Commandes: TVNCommand, TVNCommandArray, TVNCommandParms, TVNEventCommand
Variables: TVNVariable, TVNVariableArray, TVNIfParms, TVNSetVarParms, TVNIncVarParms, TVNDecVarParms
Graphiques: TVNBitmap, TVNBmpImg, TVNTransparentBmp, TVNImageObject, TVNGdiObject
Texte: TVNTextObject, TVNTextParms, TVNFontParms, TVNHtmlText, TVNHtmlParms
Hotspots: TVNHotspot, TVNHotspotArray, TVNHotspotParms, TVNRectParms
Média: TVNMciBase, TVNWaveMedia, TVNMidiMedia, TVNCDAMedia, TVNAviMedia
Effets: TVNTimer, TVNTimerRes, TVNScrollFx, TVNZoomFx
Sérialisation: TVNStreamable (hérite TStreamableBase Borland)

---

## 9. CONVENTIONS DU PROJET

- Français pour commentaires et documentation
- Types préfixés VN (VNScene, VNHotspot, etc.)
- Enum VNRecordType pour les types de records binaires
- Encodage fichiers: Latin-1 / windows-1252
- Little-endian pour tous les entiers

---

## 10. ALGORITHME DE DÉTECTION DE PARTS (branche part-detection-algorithm)

### Scripts ajoutés
- `scripts/detect-parts-final.js` - Détection ciblée Format 54 (couleurs1.vnd)
- `scripts/detect-parts-universal.js` - Détection universelle multi-formats
- `docs/PART_DETECTION_FORMAT54.md` - Documentation de l'algorithme

### Concept de "Part"
Une "part" est un segment de scène dans le VND. Les fichiers VND avec format type > 4
n'utilisent PAS la structure 50-bytes nom fixe de start.vnd. Ils utilisent des délimiteurs
binaires pour séparer les parts/scènes.

### Format Type par fichier VND
| Fichier | Format Type | Parts détectées | Commentaire |
|---------|-------------|-----------------|-------------|
| start.vnd | 4 | 4 (incomplet) | 7 scènes connues, algo pas adapté pour type 4 |
| barre.vnd | 5 | 0 | Algo non adapté |
| danem.vnd | 16 | 13 | Semble bon |
| couleurs1.vnd | 54 | 54 | Validé (maison=#5, fontain2=#39, Fin Perdu=#54) |
| biblio.vnd | 62 | 10 | Probablement incomplet pour 140KB |

### 4 Patterns de détection
1. **Standard delimiter** : 12+ zéros + `01 00 00 00`, puis BMP/AVI dans les 300 bytes suivants
2. **Music scenes** : `0x81` + "music.wav" dans les 50 bytes, puis BMP après
3. **Empty scenes** : 50+ zéros + uint32=5 + "Empty"
4. **Named scenes** : zéros + Borland string = nom connu ("Toolbar", "Fin Perdu", etc.)

### Filtres de faux positifs
- z=19-21 ET même BMP que le suivant ET gap >= 250 → marqueur hotspot, pas une part
- z >= 90 ET content = "fin2.avi" → commande fin de jeu

### Bug connu
`detect-parts-final.js` ligne Pattern 3 : utilise `buf` au lieu de `buffer`

### Découverte: Deux types de structures VND après les variables

**TYPE_A** (start.vnd, couleurs1.vnd) : `uint32 sceneCount` > 0, puis N scènes de 50 bytes
**TYPE_B** (tous les autres 17 fichiers) : 16 bytes de zéros, puis records directs

Marqueurs TYPE_B : `0x01` (10 fichiers), `0x81` (4 fichiers), `0x83` (2 fichiers), `0x00` (1 fichier)

Le champ "format type" dans le header est un ID séquentiel (4-82), PAS un compteur de parts/scènes.

### Tous les fichiers VND du jeu Europeo
| Fichier | Format Type | Vars | Structure | Taille |
|---------|-------------|------|-----------|--------|
| start | 4 | 284 | TYPE_A (7 scènes) | 6 KB |
| barre | 5 | 12 | TYPE_B (0x81) | 28 KB |
| suede | 14 | 280 | TYPE_B (0x01) | 52 KB |
| allem | 15 | 280 | TYPE_B (0x81) | 64 KB |
| danem | 16 | 281 | TYPE_B (0x01) | 42 KB |
| portu | 17 | 280 | TYPE_B (0x01) | 74 KB |
| grece | 19 | 285 | TYPE_B (0x01) | 56 KB |
| espa | 20 | 285 | TYPE_B (0x01) | 75 KB |
| finlan | 20 | 280 | TYPE_B (0x81) | 45 KB |
| holl | 22 | 282 | TYPE_B (0x83) | 56 KB |
| irland | 23 | 280 | TYPE_B (0x01) | 62 KB |
| autr | 24 | 283 | TYPE_B (0x01) | 75 KB |
| belge | 28 | 280 | TYPE_B (0x01) | 76 KB |
| france | 34 | 284 | TYPE_B (0x01) | 100 KB |
| italie | 36 | 284 | TYPE_B (0x83) | 74 KB |
| ecosse | 42 | 280 | TYPE_B (0x81) | 72 KB |
| couleurs1 | 54 | 280 | TYPE_A (7 scènes) | 76 KB |
| biblio | 62 | 284 | TYPE_B (0x00) | 141 KB |
| angleterre | 82 | 284 | TYPE_B (0x00) | 87 KB |

### À consolider
- Comprendre la structure TYPE_B (records directs après 16 zéros)
- Clarifier le rôle des marqueurs 0x01 vs 0x81 vs 0x83
- Adapter le parser pour les deux types de structure
- Fusionner la logique avec VNFileLoader.ts
