# Analyse de frog.dll - Jeu Simon Grenouilles VN-Studio (Écosse)

## Architecture
- **Type** : Delphi VCL TForm + DFM
- **Dimensions** : 640×400 pixels
- **Police** : MS Sans Serif (pas Comic Sans !)

## Logique du jeu

### Type de Simon
**PROGRESSIF ET ALÉATOIRE** :
- Le jeu génère `Random(7)+1` = nombre aléatoire 1-7 à chaque tour
- Ce nombre est ajouté à la séquence
- Le joueur doit reproduire toute la séquence accumulée
- **8 tours réussis** = Victoire !

### Grenouilles

#### Grenouilles JOUABLES (6)
| Grenouille | Image visuelle | Zone de clic | Position zone | Son |
|------------|----------------|--------------|---------------|-----|
| 1 | Image1 (127, 96) | Image10 | (115, 89) | g1.wav |
| 2 | Image2 (543, 7) | Image17 | (536, 3) | g2.wav |
| 4 | Image4 (306, 148) | Image13 | (287, 142) | g4.wav |
| 5 | Image5 (125, 19) | Image14 | (92, 3) | g5.wav |
| 6 | Image6 (402, 95) | Image15 | (390, 82) | g6.wav |
| 7 | Image7 (426, 239) | Image16 | (428, 222) | g7.wav |

#### Grenouille DÉCORATIVE (non jouable)
| Grenouille | Image visuelle | Zone de clic | Statut |
|------------|----------------|--------------|--------|
| 3 (orange) | Image3 (585, 157) | Image12 | **Visible=false** (désactivée) |

**Note** : La grenouille orange a 2 sons associés (g3.wav et g8.wav) mais sa zone de clic est invisible, elle n'est donc pas jouable. Elle est purement décorative.

### Zones spéciales
| Zone | Position | Fonction |
|------|----------|----------|
| Image18 | (566, 339) | Bouton (quitter?) |
| Image19 | (192, 305) | Zone bulle dialogue (démarrer) |
| Image20 | (132, 203) | Bulle de dialogue visuelle |

## Messages

### Au démarrage
- "Clique sur moi"
- "pour commencer"

### Pendant la démo
- "regarde"

### Après la démo
- "puis répète..."
- "à toi de jouer maintenant!"

### Résultats
- Bon clic : "vrai" / "bien vu!"
- Mauvais clic : "faux" / "Perdu !!!" / "Essaye encore"

## Commandes VN-Studio

### Victoire (après 8 tours)
```
pause 1000
set_var frog 1
inc_var score 010
closewav
scene 10
```

### Défaite (mauvais clic)
```
dec_var score 10
playwav cartoon.wav 1
```
Puis le jeu recommence avec une nouvelle séquence.

### Quitter
```
scene 10
```

## Fichiers sons
| Fichier | Description |
|---------|-------------|
| cartoon.wav | Musique de fond |
| cling.wav | Son supplémentaire |
| g1.wav | Son grenouille 1 |
| g2.wav | Son grenouille 2 |
| g3.wav | Son grenouille 3 (décorative) |
| g4.wav | Son grenouille 4 |
| g5.wav | Son grenouille 5 |
| g6.wav | Son grenouille 6 |
| g7.wav | Son grenouille 7 |
| g8.wav | Son alternatif grenouille 3 |

## Images extraites
| Fichier | Taille | Description |
|---------|--------|-------------|
| img_01_640x400.png | Fond | Mare avec nénuphars |
| img_02_146x133.png | Bulle | Bulle de dialogue |
| img_03_68x53.png | 68×53 | Grenouille 1 |
| img_04_83x58.png | 83×58 | Grenouille 2 |
| img_05_78x70.png | 78×70 | Grenouille orange (déco) |
| img_06_61x44.png | 61×44 | Grenouille 4 |
| img_07_56x65.png | 56×65 | Grenouille 5 |
| img_08_60x56.png | 60×56 | Grenouille 6 |
| img_09_64x63.png | 64×63 | Grenouille 7 |
| img_10_55x57.png | 55×57 | Grenouille langue (non utilisée) |

## Timer
- Timer1 : Enabled=false au démarrage
- Interval : 2000ms (0x07d0)
- Gère la progression des tours et l'affichage du compteur

## Variables internes
| Adresse | Description |
|---------|-------------|
| 0x442804 | Séquence à reproduire (chaîne de caractères "1", "14", "147", etc.) |
| 0x442808 | Réponse du joueur |
| 0x44280c | Compteur de tour (1-9, victoire à 9) |
| 0x442810 | Flag d'état du jeu |

## Structure du fichier HTML
```
frog-simon.html     - Jeu interactif
images/             - Images extraites
sounds/             - Fichiers audio
```
