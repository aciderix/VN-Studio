# Analyse de roue.dll - Coffre-Fort VN-Studio

## Informations générales

| Propriété | Valeur |
|-----------|--------|
| Fichier | roue.dll |
| Taille | 620 KB |
| Type | PE32 DLL (Delphi VCL) |
| Date compilation | 29 Décembre 1998 |
| Localisation | demo/game-data/couleurs1/ |

## Description du mini-jeu

Un **coffre-fort** avec 4 roues de combinaison à couleurs. L'utilisateur doit trouver la bonne combinaison pour ouvrir le coffre.

## Layout du TForm1 (extrait du DFM)

### Dimensions fenêtre
```
ClientWidth: 640
ClientHeight: 400
BorderStyle: bsNone
```

### Image de fond (Image1)
```
Left: 250  (offset X négatif pour affichage)
Top: 178   (offset Y négatif pour affichage)
Width: 640
Height: 480
```

### Labels (affichage des chiffres)

| Label | Left | Top | Width | Height | Font.Height |
|-------|------|-----|-------|--------|-------------|
| Label1 | 106 | 156 | 13 | 28 | -24 |
| Label2 | 266 | 102 | 9 | 19 | -16 |
| Label3 | 358 | 240 | 13 | 28 | -24 |
| Label4 | 434 | 62 | 12 | 25 | -21 |

**Propriétés communes des Labels:**
- Font.Name: **Century Gothic**
- Font.Color: **clBlue**
- Font.Style: **[fsBold]**
- Transparent: **True**
- Caption: "0" (valeur initiale)

### Zones cliquables (Images)

Chaque roue a **2 zones** : haut pour -1, bas pour +1

| Image | Roue | Direction | Left | Top | Width | Height |
|-------|------|-----------|------|-----|-------|--------|
| Image3 | 1 | -1 (haut) | 52 | 148 | 105 | 45 |
| Image2 | 1 | +1 (bas) | 49 | 198 | 109 | 58 |
| Image5 | 2 | -1 (haut) | 229 | 87 | 71 | 44 |
| Image4 | 2 | +1 (bas) | 230 | 132 | 69 | 37 |
| Image7 | 3 | -1 (haut) | 300 | 219 | 107 | 64 |
| Image6 | 3 | +1 (bas) | 302 | 284 | 106 | 48 |
| Image9 | 4 | -1 (haut) | 390 | 47 | 87 | 44 |
| Image8 | 4 | +1 (bas) | 391 | 92 | 88 | 43 |

### Bouton Reset (Image10)
```
Left: 8
Top: 336
Width: 57
Height: 49
```

## Logique du jeu (extraite du code assembleur)

### Combinaison secrète
```
1999
```

### Fonctionnement des roues
- **4 roues** numérotées (chiffres 0-9)
- **Clic zone haute** : décrémenter (-1)
- **Clic zone basse** : incrémenter (+1)
- Les valeurs sont cycliques (9+1 = 0, 0-1 = 9)

### Séquence de validation (fonction @ 0x0043f2f4)

1. Joue `playwav tic1.wav 8` à chaque clic
2. Lit les 4 valeurs des roues (Form+0x2c8, +0x2cc, +0x2d0, +0x2d4)
3. Concatène les 4 chiffres en chaîne
4. Compare avec "1999"
5. Si égal → Exécute la séquence de victoire

### Commandes VN-Studio envoyées

#### À chaque clic sur une zone
```
playwav tic1.wav 8
```

#### Sur combinaison correcte (1999)
```
Pause 1000
playwav ouvre.wav 0
Playavi coffreouvre.avi
inc_var milleeuro 1
inc_var score 1000
scene 19
```

## Variables VN-Studio modifiées

| Variable | Modification | Description |
|----------|--------------|-------------|
| milleeuro | +1 | Compteur d'euros gagnés |
| score | +1000 | Score du joueur |

## Fichiers audio/vidéo requis (externes)

| Fichier | Type | Usage |
|---------|------|-------|
| tic1.wav | Audio | Son de clic sur roue |
| ouvre.wav | Audio | Son d'ouverture du coffre |
| coffreouvre.avi | Vidéo | Animation du coffre qui s'ouvre |

## Ressources extraites

### Images
| Fichier | Dimensions | Description |
|---------|------------|-------------|
| coffre_bg.png | 640×480 | Arrière-plan avec les 4 roues colorées |

## Intégration VN-Studio

### Initialisation
```javascript
window.coffre = new VNCoffre();

// Configurer le callback pour les commandes
window.coffre.setOnCommand((cmd) => {
    vnStudio.executeCommand(cmd);
});
```

### API JavaScript
```javascript
coffre.reset()              // Réinitialiser toutes les roues à 0
coffre.wheels               // [0-9, 0-9, 0-9, 0-9] valeurs actuelles
coffre.isOpen               // true si le coffre est ouvert
coffre.setOnCommand(fn)     // Définir le callback de commande
```
