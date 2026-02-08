# Analyse de Memory.dll - Jeu de Memory VN-Studio (Ecosse)

## Informations générales

| Propriété | Valeur |
|-----------|--------|
| Fichier | Memory.dll |
| Taille | 749,568 bytes |
| Type | PE32 DLL (Delphi VCL) |
| Framework | Borland Delphi |
| Source | demo/game-data/ecosse/ |

## Description du mini-jeu

Jeu de Memory classique avec grille 4×4 (16 cartes = 8 paires).
Thème : **Écosse** 🏴󠁧󠁢󠁳󠁣󠁴󠁿

## Structure du formulaire (TForm1)

### Dimensions
- ClientWidth: 640 px
- ClientHeight: 400 px
- Color: clBtnFace (#C0C0C0)
- Position: poScreenCenter
- BorderStyle: bsNone

### Grille de cartes

| Position | Left | Top | Cartes |
|----------|------|-----|--------|
| Row 1 | 128, 200, 272, 344 | 104 | 1-4 |
| Row 2 | 128, 200, 272, 344 | 152 | 5-8 |
| Row 3 | 128, 200, 272, 344 | 200 | 9-12 |
| Row 4 | 128, 200, 272, 344 | 248 | 13-16 |

### Taille des cartes
- Width: 65 px
- Height: 45 px

### Composants

| Composant | Quantité | Fonction |
|-----------|----------|----------|
| TImage (1-16) | 16 | Dos des cartes |
| TImage (17-32) | 16 | Faces des cartes (cliquables) |
| TTimer | 1 | Délai pour retourner les cartes |

## Images extraites

### Dos de carte
- **card_dos.png** (65×45) - Motif "X" gris/violet

### 8 motifs de face (thème écossais)
⚠️ **Les faces sont plus petites que le cadre (65×45) - les centrer, ne pas étirer !**

1. **face_01.png** (50×45) - Chardon 🌿
2. **face_02.png** (51×45) - Mouette/Oiseau 🐦
3. **face_03.png** (36×39) - Motif 3
4. **face_04.png** (52×43) - Motif 4
5. **face_05.png** (41×43) - Pièce 🪙
6. **face_06.png** (50×32) - Motif 6
7. **face_07.png** (50×28) - Motif 7
8. **face_08.png** (39×37) - Motif 8

## Logique du jeu

1. Mélanger 8 paires (16 cartes) aléatoirement sur la grille
2. Au clic sur une carte :
   - Retourner la carte (afficher la face)
   - Si 2 cartes retournées :
     - Si même motif → paire trouvée (cartes restent visibles)
     - Sinon → après délai (~1s via TTimer), retourner les 2 cartes
3. Quand toutes les 8 paires sont trouvées → Victoire

## Commandes VN-Studio

| Événement | Commandes |
|-----------|-----------|
| Victoire | `playwav bravo.wav 8` |
| | `Pause 1000` |
| | `inc_var MEMORY 1` |
| | `scene 34` |
| Abandon | `Pause 1000` |
| | `scene 35` |

## Ressources externes

| Fichier | Description |
|---------|-------------|
| bravo.wav | Son de victoire |

## Fichiers extraits

| Fichier | Description |
|---------|-------------|
| images/card_dos.png | Dos de carte |
| images/face_01.png | Chardon |
| images/face_02.png | Mouette |
| images/face_03.png | Motif 3 |
| images/face_04.png | Motif 4 |
| images/face_05.png | Pièce |
| images/face_06.png | Motif 6 |
| images/face_07.png | Motif 7 |
| images/face_08.png | Motif 8 |
| memory-game.html | Port HTML fidèle |
| ANALYSIS_REPORT.md | Ce document |

## Notes d'implémentation

1. Les 16 images de dos (Image1-16) utilisent toutes le même bitmap
2. Les 16 images de face (Image17-32) sont superposées aux images de dos
3. Le TTimer gère le délai avant de retourner les cartes non-paires
4. Les images de face ont des tailles légèrement différentes mais sont centrées
