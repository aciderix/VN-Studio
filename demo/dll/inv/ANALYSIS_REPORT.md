# Analyse de inv.dll - Système d'Inventaire VN-Studio

## Informations générales

| Propriété | Valeur |
|-----------|--------|
| **Fichier** | inv.dll |
| **Taille** | 156 KB |
| **Type** | Win32 DLL (Borland OWL) |
| **Compilateur** | Borland C++ |
| **Date** | 21 septembre 1999 |

## ⚠️ Différences avec pepe.dll

| Aspect | pepe.dll | inv.dll |
|--------|----------|---------|
| Framework | Delphi VCL (TForm) | Borland OWL (DIALOG) |
| UI Definition | RCDATA (DFM binaire) | DIALOG resource |
| Police | Comic Sans MS | **MS Sans Serif 8pt** |

## Ressources extraites

### Images (dans le DLL)
- **inventory_bg.png** (330×314) - Image de fond
- **button1.png** (50×50) - Bouton normal
- **button2.png** (50×50) - Bouton pressé

### Curseurs/Icônes
**❌ NON INCLUS dans le DLL !**

Les icônes des 87 items sont **externes** - chargées depuis:
```
cur\[nom_item].cur
```

Exemple: `cur\clejaune.cur`, `cur\loupe.cur`, etc.

## Layout original (extrait du DIALOG)

### Fenêtre principale
```
Taille: 330×337 pixels
Police: MS Sans Serif 8pt
```

### Contrôles

| Contrôle | Position (px) | Taille (px) | Notes |
|----------|---------------|-------------|-------|
| Static (fond) | (0, 0) | 330×314 | inventory_bg.bmp |
| **SysListView32** | (12, 14) | 306×266 | Liste scrollable - ID: 101 |
| Button | (63, 294) | 204×28 | "Fermer le sac à dos" - ID: 2 |

## 📜 Scroll automatique

**OUI** - Le `SysListView32` Windows natif inclut un **scroll automatique**.

Quand le nombre d'items dépasse l'espace visible (306×266px), une barre de défilement verticale apparaît automatiquement.

## ❌ Affichage conditionnel

**Le DLL ne gère PAS l'affichage conditionnel !**

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MOTEUR VN-STUDIO                         │
│  - Suit l'état des variables (item = 0, 1, ou 2)            │
│  - Sait quels items sont possédés (var = 1)                 │
│  - Appelle VNCreateDLLWindow avec la liste des items        │
│  - Reçoit et exécute les commandes du DLL                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       inv.dll                                │
│  - Affiche les items qu'on lui PASSE                        │
│  - Ne sait PAS quels items existent dans le jeu             │
│  - Renvoie set_var/defcursor quand l'utilisateur agit       │
└─────────────────────────────────────────────────────────────┘
```

### États des variables

| Valeur | Signification | Qui gère |
|--------|---------------|----------|
| 0 | Item non possédé | Moteur VN |
| 1 | Item possédé (dans inventaire) | Moteur VN (set_var via DLL) |
| 2 | Item utilisé/sélectionné | DLL → Moteur VN |

## Items (87 objets définis)

Liste complète dans `items.json`. Exemples:
- `clejaune` → "Clé jaune"
- `loupe` → "Loupe"
- `masque` → "Masque de plongée"
- `guitare` → "Guitare"
- etc.

## Commandes VN-Studio

### Exports du DLL
```
VNCreateDLLWindow  - Crée la fenêtre inventaire
VNDestroyDLLWindow - Détruit la fenêtre (si existant)
VNGetReturnValue   - Récupère la valeur de retour (si existant)
```

### Commandes envoyées au moteur

| Action | Commande |
|--------|----------|
| Item ajouté | `set_var [item] 1` |
| Item utilisé (double-clic) | `set_var [item] 2` |
| Curseur = item | `defcursor [item]` |
| Fermeture | `defcursor 0` |

### Chargement des curseurs

Le DLL charge les curseurs via:
```
cur\%s.cur
```

Où `%s` est le nom interne de l'item (ex: `cur\clejaune.cur`).

## Port HTML

Le fichier `inv-inventory.html` reproduit fidèlement:
- ✅ Dimensions et positions exactes du DIALOG original
- ✅ Police MS Sans Serif 8pt
- ✅ **Scroll automatique** quand beaucoup d'items
- ✅ Les 87 items avec noms internes/affichage
- ✅ Logique de sélection/utilisation
- ✅ Callbacks pour intégration VN-Studio
- ❌ Icônes des items (fichiers externes au DLL)

### Intégration

```javascript
const inventory = new VNInventory({
    cursorPath: 'cur/',  // Chemin vers les .cur
    onItemUsed: (internal, display) => {
        vnEngine.executeCommand(`set_var ${internal} 2`);
        vnEngine.executeCommand(`defcursor ${internal}`);
    },
    onClose: () => {
        vnEngine.executeCommand('defcursor 0');
    }
});

// LE MOTEUR VN doit appeler addItem pour chaque item possédé
// (ceux où la variable = 1)
inventory.addItem('clejaune');
inventory.addItem('loupe');

// Quand l'item est utilisé, le retirer si nécessaire
inventory.removeItem('clejaune');
```

### Ce que le MOTEUR VN doit faire

1. **Tracker les variables** de chaque item (0, 1, 2)
2. **Passer la liste** des items possédés (var=1) au système d'inventaire
3. **Recevoir les commandes** `set_var` et `defcursor` et les exécuter
4. **Charger les curseurs** depuis `cur/[item].cur`
