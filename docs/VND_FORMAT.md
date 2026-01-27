# Format VND - Virtual Navigator Data

**Document de rétro-ingénierie** - Projet VN-Studio
**Dernière mise à jour:** 2026-01-27
**Fichier analysé:** `start.vnd` de Europeo (Sopra Multimedia, 1999)

---

## Vue d'ensemble

Les fichiers `.vnd` sont des fichiers de données binaires utilisés par Virtual Navigator 2.1. Ils contiennent les scènes, hotspots, variables et commandes d'un projet VN.

Le format utilise la sérialisation Borland C++ (ipstream/opstream) depuis `bds52t.dll`.

---

## Structure globale

```
┌─────────────────────────────────────────┐
│ HEADER (métadonnées projet)             │
├─────────────────────────────────────────┤
│ VARIABLES (nom + valeur par défaut)     │
├─────────────────────────────────────────┤
│ SCÈNES (répétées N fois)                │
│   ├── Nom (50 bytes fixe)               │
│   ├── Flag (1 byte)                     │
│   ├── Resource (Borland string)         │
│   ├── Reserved (32 bytes)               │
│   └── RECORDS (hotspots, commandes...)  │
└─────────────────────────────────────────┘
```

---

## 1. Header

| Offset | Taille | Type | Description |
|--------|--------|------|-------------|
| 0 | 5 | bytes | Flags (ex: `3a 01 01 00 00`) |
| 5 | var | Borland string | Identifiant format ("VNFILE") |
| var | var | Borland string | Version ("2.13") |
| var | 4 | uint32 | Type de format (4) |
| var | var | Borland string | Nom du projet ("Europeo") |
| var | var | Borland string | Éditeur ("Sopra Multimedia") |
| var | var | Borland string | Numéro de série ("5D51F233") |
| var | var | Borland string | ID projet ("EUROPEO") |
| var | var | Borland string | Chemin registre Windows |
| var | 4 | uint32 | Largeur écran (640) |
| var | 4 | uint32 | Hauteur écran (480) |
| var | 4 | uint32 | Profondeur couleur (16) |
| var | 20 | bytes | Champs inconnus (5 × uint32) |
| var | var | Borland string | **Chemin DLL** ("..\vnstudio\vnresmod.dll") |
| var | 4 | uint32 | **VARIABLE COUNT** (284 dans start.vnd) |

### Exemple concret (start.vnd)

```
Position 146: 18 00 00 00 = 24 (longueur DLL path)
Position 150: "..\vnstudio\vnresmod.dll" (24 bytes)
Position 174: 1c 01 00 00 = 0x011c = 284 ← NOMBRE DE VARIABLES
Position 178: Début des variables (première = "SACADOS")
```

### Borland String
Format des chaînes Borland:
```
┌──────────────┬─────────────────────┐
│ Longueur (4) │ Données (N bytes)   │
│ uint32 LE    │ Latin-1, pas de \0  │
└──────────────┴─────────────────────┘
```

---

## 2. Variables

Les variables suivent immédiatement le **variable count** dans le header.

### Structure

```
Variable Count (uint32)     ← Lu dans le header, juste après DLL path
Variables[varCount]:
  ├── Nom (Borland string)
  └── Valeur (uint32, généralement 0)
```

| Taille | Type | Description |
|--------|------|-------------|
| var | Borland string | Nom de la variable |
| 4 | uint32 | Valeur par défaut (0x00000000) |

### Exemple (start.vnd = 284 variables)

```
Position 174: 1c 01 00 00 = 284 (count)
Position 178: 07 00 00 00 "SACADOS" 00 00 00 00
Position 193: 03 00 00 00 "JEU" 00 00 00 00
Position 204: 05 00 00 00 "BIDON" 00 00 00 00
... (284 variables au total)
```

**Fin des variables:** Après avoir lu exactement `varCount` variables.

---

## 3. Scènes

### Structure d'une scène

| Offset | Taille | Type | Description |
|--------|--------|------|-------------|
| 0 | 50 | fixed string | Nom de scène (paddé avec \0) |
| 50 | 1 | uint8 | Flag (0-3) |
| 51 | var | Borland string | Nom de ressource (image fond) |
| var | 32 | bytes | Réservé |
| var | var | Records | Séquence de records |

---

## 4. Records (Commandes et Hotspots)

### Format général d'un record

```
┌──────────────┬─────────────────────┐
│ Type (4)     │ Données (variable)  │
│ uint32 LE    │                     │
└──────────────┴─────────────────────┘
```

### Séparateurs
- **4 bytes nuls** (`00 00 00 00`) séparent souvent les groupes de records
- Le parser doit ignorer ces séparateurs

---

## 5. Types de Records

### Types simples (lecture directe)

| Type | Nom | Format données |
|------|-----|----------------|
| 6 | SCENE | Borland string (nom scène cible) |
| 9 | PLAYAVI | Borland string (chemin + params) |
| 10 | PLAYBMP | Borland string ("path x y zOrder") |
| 11 | PLAYWAV | Borland string (chemin audio) |
| 22 | SET_VAR | Borland string ("var value") |
| 31 | RUNPRJ | Borland string (chemin .vnp) |

### Types wrapper (avec sous-type)

#### Type 1 - Wrapper simple
```
┌──────────┬────────────┬─────────────────┐
│ Type=1   │ SubType    │ Borland string  │
│ uint32   │ uint32     │                 │
└──────────┴────────────┴─────────────────┘
```
Sous-types observés:
- 17 = EXEC (exécuter programme externe)
- 31 = RUNPRJ (ouvrir projet .vnp)
- 36 = Inconnu (paramètre vide?)

#### Type 3 - Commande complexe
```
┌──────────┬────────────┬─────────────────┐
│ Type=3   │ SubType    │ Borland string  │
│ uint32   │ uint32     │                 │
└──────────┴────────────┴─────────────────┘
```
Sous-types observés:
- 6 = SCENE (navigation)
- 9 = PLAYAVI (vidéo)
- 22 = SET_VAR (variable)
- 26 = DEFCURSOR? (curseur)

### Type 105 - POLYGON (collision)
```
┌──────────┬────────────┬─────────────────────────────┐
│ Type=105 │ PointCount │ Points (x,y pairs)          │
│ uint32   │ uint32     │ N × (int32 x, int32 y)      │
└──────────┴────────────┴─────────────────────────────┘
```

---

## 6. Structure d'un Hotspot

Un hotspot est une séquence de records:

```
PLAYBMP (10)     → Image du hotspot
   ↓
PLAYWAV (11)     → Son au clic (optionnel)
   ↓
Commandes        → Actions (TYPE1, TYPE3, SET_VAR...)
   ↓
POLYGON (105)    → Zone cliquable (collision)
```

### Exemple: Hotspot "jeu" dans Frontal

```
Position 5050: PLAYBMP "interface\jeu.bmp 0 176 257"
Position 5089: PLAYWAV "..\..\couleurs1\digit\super.wav"
Position 5128: TYPE3 subtype=26 "0"
Position 5141: TYPE3 subtype=22 "jeu 0"
Position 5158: TYPE3 subtype=22 "score 0"
Position 5177: POLYGON 14 points [(219,475), (218,442), ...]
```

---

## 7. Hotspots découverts dans start.vnd

| # | Nom | Image | Position | Actions |
|---|-----|-------|----------|---------|
| 1 | jeu | interface\jeu.bmp | (0,176) z=257 | SET_VAR jeu=0, score=0 |
| 2 | livres | interface\livres.bmp | (0,0) z=273 | RUNPRJ biblio.vnp |
| 3 | tirelire | interface\tirelire.bmp | (0,483) z=207 | EXEC tirelire.exe |
| 4 | oui | interface\oui.bmp | (0,470) z=0 | - |
| 5 | video | interface\video.bmp | (0,0) z=0 | - |

Tous ont un polygone de collision définissant leur zone cliquable.

---

## 8. Valeurs connues des types de commande

```typescript
enum VNRecordType {
  QUIT = 0,        // quit
  ABOUT = 1,       // about
  PREFS = 2,       // prefs
  PREV = 3,        // prev
  NEXT = 4,        // next
  ZOOM = 5,        // zoom
  SCENE = 6,       // scene
  HOTSPOT = 7,     // hotspot
  TIPTEXT = 8,     // tiptext
  PLAYAVI = 9,     // playavi
  PLAYBMP = 10,    // playbmp
  PLAYWAV = 11,    // playwav
  PLAYMID = 12,    // playmid
  PLAYHTML = 13,   // playhtml
  ZOOMIN = 14,     // zoomin
  ZOOMOUT = 15,    // zoomout
  PAUSE = 16,      // pause
  EXEC = 17,       // exec
  EXPLORE = 18,    // explore
  PLAYCDA = 19,    // playcda
  PLAYSEQ = 20,    // playseq
  IF = 21,         // if
  SET_VAR = 22,    // set_var
  INC_VAR = 23,    // inc_var
  DEC_VAR = 24,    // dec_var
  INVALIDATE = 25, // invalidate
  DEFCURSOR = 26,  // defcursor
  // ... jusqu'à 48
  RUNPRJ = 31,     // runprj

  POLYGON_COLLISION = 105  // Polygone de collision
}
```

---

## Prochaines étapes

### Priorité haute
1. **Corriger les erreurs TypeScript** dans `VNFileLoader.ts`
   - Types VNRect (left/top/right/bottom vs x1/y1/x2/y2)
   - Casting VNRecordType vers VNCommandType
   - Imports manquants (AUDIO_WAV, etc.)

2. **Parser le header complet**
   - Comprendre les champs inconnus après les dimensions
   - Identifier le nombre de scènes/variables dans le header

3. **Parser les variables**
   - Implémenter la lecture correcte de la section variables
   - Gérer les valeurs par défaut

### Priorité moyenne
4. **Tester avec d'autres fichiers VND**
   - Valider le format avec d'autres scènes d'Europeo
   - Tester avec d'autres projets VN si disponibles

5. **Implémenter le rendu**
   - Charger les images BMP des hotspots
   - Dessiner les polygones de collision (debug)
   - Gérer les z-order pour l'affichage

6. **Implémenter les commandes**
   - SET_VAR / INC_VAR / DEC_VAR
   - Navigation entre scènes (SCENE)
   - Lecture audio (PLAYWAV)

### Priorité basse
7. **Optimisations**
   - Cache des ressources chargées
   - Préchargement des scènes adjacentes

8. **Documentation**
   - Compléter ce document au fur et à mesure
   - Ajouter des diagrammes visuels

---

## Scripts de debug

- `scripts/debug-vnd.ts` - Analyse complète d'un fichier VND
- `scripts/parse-hotspots.ts` - Parser ciblé pour extraire les hotspots

Usage:
```bash
npx ts-node --transpile-only scripts/parse-hotspots.ts VNP-VND/start.vnd
```

---

## Références

- **europeo.exe** - Exécutable original (Virtual Navigator 2.1)
- **bds52t.dll** - Bibliothèque Borland C++ pour sérialisation
- **start.vnd** - Fichier de données principal d'Europeo
