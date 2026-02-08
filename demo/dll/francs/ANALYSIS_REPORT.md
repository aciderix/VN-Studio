# Analyse de francs.dll - Conversion Francs→Euros VN-Studio

## Informations générales

| Propriété | Valeur |
|-----------|--------|
| Fichier | francs.dll |
| Taille | 578,048 bytes |
| Type | PE32 DLL (Delphi VCL) |
| Framework | Borland Delphi |
| Source | demo/game-data/couleurs1/ |

## Description du mini-jeu

Quiz de conversion monétaire : convertir 100 francs français en euros.

### Question
> "Combien font 100 francs français en euros ?"

### Réponse attendue
**15,24** euros

(Calcul: 100 FRF / 6.55957 = 15.2449... ≈ 15,24 EUR)

## Structure du formulaire (TForm1)

### Dimensions
- ClientWidth: 640 px
- ClientHeight: 400 px
- Color: clNone (transparent)
- ActiveControl: maskEdit

### Composants

| Composant | Type | Position | Taille | Contenu |
|-----------|------|----------|--------|---------|
| imgBkgnd | TImage | (0, 0) | 640×400 | Arrière-plan (pièce €) |
| lblQuestion | TLabel | (64, 88) | 160×78 | "Combien font 100 francs français en euros ?" |
| lblAnswer1 | TLabel | (428, 52) | 141×26 | "100 francs font" |
| maskEdit | TMaskEdit | (428, 90) | 65×23 | Champ de saisie |
| lblAnswer2 | TLabel | (500, 88) | 52×26 | "euros." |
| lblComment | TLabel | (508, 288) | 97×89 | "Entre les chiffres au clavier." |
| btnQuit | TLabel | (16, 284) | 81×101 | Zone cliquable quitter |
| lblQuit | TLabel | (100, 336) | 70×27 | "Quitter" |

### Format de saisie
- EditMask: `00,00;0;*`
- Format attendu: 2 chiffres, virgule, 2 chiffres (ex: 15,24)

### Police
- Font: Comic Sans MS (labels)
- MS Sans Serif (champ de saisie)

## Logique de validation

```
SI réponse == "15,24" ALORS
    Envoyer "Pause 1000"
    Envoyer "inc_var calc 1"
    Envoyer "scene 14"
SINON SI longueur >= 4 ALORS
    Envoyer "playwav essaye.wav 0"
FIN SI
```

## Commandes VN-Studio

| Événement | Commande |
|-----------|----------|
| Bonne réponse (15,24) | `Pause 1000` |
| | `inc_var calc 1` |
| | `scene 14` |
| Mauvaise réponse | `playwav essaye.wav 0` |
| Pause intermédiaire | `Pause 500` |

## Ressources externes

| Fichier | Description |
|---------|-------------|
| essaye.wav | Son joué en cas de mauvaise réponse |

## Fichiers extraits

| Fichier | Description | Taille |
|---------|-------------|--------|
| background.png | Arrière-plan 640×400 (pièce euro) | 101 KB |
| francs-conversion.html | Port HTML fidèle | - |
| ANALYSIS_REPORT.md | Ce document | - |

## Notes d'implémentation

1. Le personnage est une **pièce d'euro animée** avec un chapeau
2. Trois bulles de dialogue :
   - Grande bulle gauche : question principale
   - Bulle haute droite : zone de réponse
   - Petite bulle basse droite : instruction
3. Le petit personnage en bas à gauche est une zone cliquable pour quitter
4. Le masque `00,00` insère automatiquement la virgule après 2 chiffres
