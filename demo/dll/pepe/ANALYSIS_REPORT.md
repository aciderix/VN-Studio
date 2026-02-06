# Analyse de pepe.dll - Mini-jeu Quiz Tour Eiffel

## Informations générales

- **Type**: DLL Delphi 32-bit
- **Taille**: 584.00 KB
- **Architecture**: Intel x86 (PE32)
- **Framework**: Delphi/VCL

## Exports du DLL

| Fonction | Description |
|----------|-------------|
| `VNCreateDLLWindow` | Crée et affiche la fenêtre du mini-jeu |
| `VNDestroyDLLWindow` | Détruit la fenêtre du mini-jeu |

## Structure du formulaire (TForm1)

- **Dimensions**: 640 × 400 pixels
- **BorderStyle**: bsNone (pas de bordure)

### Composants :
- **imgBkgnd** (TImage) - Image de fond 640×400
- **lblQuestion1-4** (TLabel) - Texte de la question sur 4 lignes
- **maskEdit** (TVNMaskEdit) - Champ de saisie (4 chiffres max)
- **lblComment** (TLabel) - Zone de feedback
- **btnQuit** (TLabel) - Zone cliquable invisible pour quitter (8,296 - 73×97)

## Logique du jeu

1. L'utilisateur voit une question sur le nombre de marches de la Tour Eiffel
2. Il tape un nombre dans le champ de saisie (max 4 chiffres)
3. Le feedback s'affiche en temps réel :
   - Si le nombre est trop bas → "Il y en a plus"
   - Si le nombre est trop haut → "Il y en a moins"  
   - Si correct (1652) → "Tout ça !"
4. L'utilisateur peut quitter à tout moment via la zone cliquable en bas à gauche

---

## ⚠️ COMPORTEMENT IMPORTANT POUR L'INTÉGRATION

### ✅ Quand l'utilisateur trouve la bonne réponse (1652) :
- **Pause** : 1000ms 
- **Commande envoyée au moteur VN-Studio** : `scene 22`
- **Résultat** : Le moteur doit charger et exécuter la **scène 22** du scénario VND

### ❌ Quand l'utilisateur clique sur "Quitter" :
- **Aucune commande** envoyée au moteur
- La fenêtre se ferme simplement (`Visible = False`)
- Le contrôle retourne au moteur VN-Studio sans changement de scène
- Le joueur reste sur la scène actuelle

### API de communication :
- Le DLL importe **`vndllapi.dll`** avec la fonction **`InitVNCommandMessage`**
- Les commandes (`scene 22`, `Pause 1000`) sont envoyées via cette API

### Pas de système de score :
- ❌ Aucun score
- ❌ Aucune variable persistante  
- ❌ Aucun compteur d'essais
- ❌ Aucun timer

C'est un simple quiz **pass/fail** : on trouve la réponse → scène 22, ou on quitte → rien.

---

## Données extraites

- **Réponse correcte**: 1652 marches
- **Question**: "Combien y a t-il de marches pour monter au dernier étage de la tour Eiffel ?"

### Messages de feedback :
| Situation | Message |
|-----------|---------|
| Correct | "Tout ça !" |
| Trop haut | "Non... Essaye encore ! Il me semble qu'il y en a moins." |
| Trop bas | "Non... Essaye encore ! Je crois qu'il y en a plus." |
| En réflexion | "euh..." |

## Fichiers extraits

- `background.png` - Image de fond 640×400
- `tform1.dfm` - Structure du formulaire Delphi (texte)
- `pepe-game.html` - Port HTML fonctionnel du mini-jeu
