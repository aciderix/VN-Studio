# Analyse de probleme.dll - Problème de Maths VN-Studio

## Informations générales

| Propriété | Valeur |
|-----------|--------|
| Fichier | probleme.dll |
| Taille | 1,088,512 bytes |
| Type | PE32 DLL (Delphi VCL) |
| Framework | Borland Delphi |
| Source | demo/game-data/belge/ |

## Description du mini-jeu

Un problème de mathématiques avec conversion de devises européennes (francs belges, lires, euros).

### Énoncé
> "Toto est parti en vacances en Italie avec 2000 francs belges. Sachant qu'il a dépensé 48000 lires, combien lui reste-t-il d'euros ?"

### Réponse attendue
**23** (euros)

## Structure du formulaire (TForm1)

### Dimensions
- ClientWidth: 640 px
- ClientHeight: 400 px
- Color: clSilver

### Composants

| Composant | Type | Position | Taille | Contenu |
|-----------|------|----------|--------|---------|
| Image2 | TImage | (0, 0) | 640×400 | Arrière-plan (professeure) |
| Label1 | TLabel | (272, 24) | 310×26 | "Toto est parti en vacances en Italie" |
| Label2 | TLabel | (280, 56) | 299×26 | "avec 2000 francs belges. Sachant" |
| Label3 | TLabel | (304, 88) | 248×26 | "qu'il a dépensé 48000 lires," |
| Label4 | TLabel | (304, 120) | 268×26 | "combien lui reste-t-il d'euros ?" |
| Label5 | TLabel | (192, 360) | 174×26 | "C'est facile, voyons!" |
| Label6 | TLabel | (392, 280) | 133×26 | "La réponse est" |
| Label7 | TLabel | (540, 360) | 12×26 | Feedback (vide/OUI!/Non...) |
| Label8 | TLabel | (464, 312) | 60×26 | "euros..." |
| MaskEdit1 | TMaskEdit | (424, 312) | 33×23 | Champ de saisie (masque: "00") |
| Image1 | TImage | (4, 352) | 53×45 | Bouton quitter |

### Police
- Font: Comic Sans MS
- Les labels utilisent le style par défaut du formulaire

## Logique de validation

```
SI réponse == "23" ALORS
    Afficher "OUI!" dans Label7
    Envoyer "Pause 1500"
    Envoyer "inc_var math 1"
    Envoyer "scene 17"
SINON
    Afficher "Non..." dans Label7
FIN SI
```

## Commandes VN-Studio

| Événement | Commande |
|-----------|----------|
| Bonne réponse (23) | `Pause 1500` |
| | `inc_var math 1` |
| | `scene 17` |
| Bouton quitter | `scene 18` |

## Fichiers extraits

| Fichier | Description | Taille |
|---------|-------------|--------|
| background.png | Arrière-plan 640×400 (professeure avec tableau) | 185 KB |
| probleme-math.html | Port HTML fidèle | - |
| ANALYSIS_REPORT.md | Ce document | - |

## Notes d'implémentation

1. **MaskEdit1** utilise un masque "00;0;*" qui n'accepte que 2 chiffres
2. Le champ est pré-focusé au chargement (ActiveControl)
3. La validation se fait sur blur ou Enter
4. Les labels du problème sont positionnés dans la grande bulle de dialogue
5. Le feedback "OUI!" ou "Non..." apparaît dans la petite bulle du personnage bleu (droite)
