# VN-Studio - Document de Suivi Principal du Portage

**DOCUMENT PRINCIPAL** - Consulter ce fichier pour récupérer le contexte entre sessions.

## Vue d'ensemble du projet

**Objectif**: Porter le moteur de Visual Novel "VN 2.1" (Windows) vers React

### Fichiers source
| Fichier | Taille | Type | Description |
|---------|--------|------|-------------|
| europeo.exe | 868 KB | PE32 x86 GUI | Exécutable principal (vn21_32.exe) |
| vnoption.dll | 122 KB | PE32 x86 DLL | Module options utilisateur |
| vnresmod.dll | 565 KB | PE32 x86 DLL | Module ressources |

### Technologie originale
- **Compilateur**: Borland C++ Builder (linker 2.25)
- **Framework UI**: OWL 5.2 (Object Windows Library)
- **Graphiques**: DirectDraw (DDRAW.dll)
- **Audio/Média**: Windows Multimedia (WINMM.dll)
- **Runtime**: cw3230mt.DLL, bds52t.dll

---

## Architecture du moteur VN

### Classes principales identifiées (TVN*)

#### Core Engine
- `TVNApplication` - Application principale
- `TVNApplicationInfo` - Informations application
- `TVNFrame` - Fenêtre principale
- `TVNWindow` - Fenêtres génériques
- `TVNVersion` - Versioning

#### Gestion des scènes
- `TVNScene` - Scène individuelle
- `TVNSceneArray` - Collection de scènes
- `TVNSceneParms` - Paramètres de scène
- `TVNSceneProperties` - Propriétés de scène
- `TVNDisplayMode` - Mode d'affichage

#### Système de commandes (scripting)
- `TVNCommand` - Commande de base
- `TVNCommandArray` - Liste de commandes
- `TVNCommandParms` - Paramètres commande
- `TVNEventCommand` - Commande événementielle
- `TVNEventCommandArray` - Liste commandes événement

#### Variables et logique
- `TVNVariable` - Variable
- `TVNVariableArray` - Tableau de variables
- `TVNIfParms` - Conditions IF
- `TVNSetVarParms` - SET variable
- `TVNIncVarParms` - Incrémenter variable
- `TVNDecVarParms` - Décrémenter variable
- `TVNConditionParms` - Paramètres conditions

#### Graphiques et images
- `TVNBitmap` - Bitmap de base
- `TVNBmpImg` - Image BMP
- `TVNTransparentBmp` - Bitmap transparent
- `TVNImageObject` - Objet image
- `TVNImageParms` - Paramètres image
- `TVNImgObjParms` - Paramètres objet image
- `TVNImgSeqParms` - Séquence d'images
- `TVNBkTexture` - Texture de fond
- `TVNGdiObject` - Objet GDI
- `TVNPaletteEntries` - Palette de couleurs

#### Texte et polices
- `TVNTextObject` - Objet texte
- `TVNTextParms` - Paramètres texte
- `TVNTextObjParms` - Paramètres objet texte
- `TVNFontParms` - Paramètres police
- `TVNHtmlText` - Texte HTML
- `TVNHtmlParms` - Paramètres HTML
- `TVNDigitParms` - Chiffres/nombres

#### Interactions utilisateur
- `TVNHotspot` - Zone cliquable
- `TVNHotspotArray` - Collection de hotspots
- `TVNHotspotParms` - Paramètres hotspot
- `TVNRectParms` - Rectangle (collision)

#### Média et Audio
- `TVNMciBase` - Base MCI (Media Control Interface)
- `TVNWaveMedia` - Audio WAV
- `TVNMidiMedia` - Audio MIDI
- `TVNMidiParms` - Paramètres MIDI
- `TVNCDAMedia` - Audio CD
- `TVNCDAParms` - Paramètres CD Audio
- `TVNAviMedia` - Vidéo AVI
- `TVNVideoBaseMedia` - Base vidéo
- `TVNHiddenMedia` - Média caché (background)

#### Effets et Animations
- `TVNTimer` - Timer de base
- `TVNTimerRes` - Résolution timer
- `TVNTimerBasedFx` - Effets basés sur timer
- `TVNScrollFx` - Effet scroll
- `TVNZoomFx` - Effet zoom
- `TVNTimeParms` - Paramètres temps
- `TVNTimerProperties` - Propriétés timer

#### Système de fichiers et sauvegarde
- `TVNFileNameParms` - Paramètres fichier
- `TVNProtectData` - Données protection
- `TVNHistData` - Historique
- `TVNStreamable` - Sérialisation

#### Interface utilisateur
- `TVNToolBar` - Barre d'outils
- `TVNToolBarProperties` - Propriétés toolbar
- `TVNAboutDlg` - Dialogue À propos
- `TVNLoadingDlg` - Dialogue chargement
- `TVNUserPrefsDlg` - Préférences utilisateur
- `TVNPrjCapsDlg` - Capacités projet

#### Projet
- `TVNProjectInfo` - Informations projet
- `TVNProjectParms` - Paramètres projet
- `TVNPluginData` - Données plugins
- `TVNExecParms` - Paramètres exécution
- `TVNIndexDependant` - Index dépendances

#### Structures de données
- `TVNObject` - Objet de base
- `TVNStringParms` - Paramètres string

### Fonctions exportées DLL
- `VNCreateDLLWindow` - Créer fenêtre DLL (vnoption.dll)
- `VNDestroyDLLWindow` - Détruire fenêtre DLL
- `VNSetDLLArguments` - Définir arguments DLL

### API vndllapi.dll (ANALYSEE)
| Fonction | Description |
|----------|-------------|
| `InitVNCommandMessage()` | Enregistre le message Windows "wm_vncommand" |
| `DirectDrawEnabled()` | Retourne toujours TRUE |
| `VNDLLVarFind(head, name)` | Recherche une variable (insensible casse) |
| `VNDLLVarAddModify(head, name, value)` | Ajoute/modifie une variable |

### Structure VNVariable (EXACTE)
```
Offset 0x000: char name[256]      // Nom en MAJUSCULES
Offset 0x100: int32_t value       // Valeur entière
Offset 0x104: VNVariable* next    // Pointeur suivant
Total: 264 bytes (0x108)
```

---

## Progression du portage

### Phase 1: Analyse (COMPLETE)
- [x] Installation outils (radare2, pev)
- [x] Identification structure PE
- [x] Extraction classes TVN* (60+ classes identifiées)
- [x] Identification dépendances DLL
- [x] Décompilation pseudo-code europeo.exe
- [x] Analyse vnoption.dll (dialogues options)
- [x] Analyse vnresmod.dll (module ressources)
- [x] Analyse vndllapi.dll (API variables et messages)
- [x] Extraction des fichiers sources originaux (commands.cpp, scene.cpp, etc.)
- [x] Documentation pseudo-code (voir ENGINE_PSEUDOCODE.md)

### Phase 2: Conception React (COMPLETE)
- [x] Architecture des composants
- [x] Système de state management
- [x] Rendu graphique (Canvas/WebGL)
- [x] Système audio (Web Audio API)

### Phase 3: Implémentation (COMPLETE)
- [x] Core engine (VNEngine.ts)
- [x] Système de scènes (VNSceneManager.ts)
- [x] Système de commandes (VNCommandProcessor.ts)
- [x] Rendu graphique (VNRenderer.ts)
- [x] Système audio (VNAudioManager.ts)
- [x] Interactions utilisateur (Hotspots, curseurs)
- [x] Système de variables (VNVariableStore.ts - structure exacte 264 bytes)
- [x] Timers et effets (VNTimerManager.ts)
- [x] Composants React (GameContainer.tsx)
- [x] Hooks React (useVNEngine.ts)

### Structure du projet React

```
src/
├── engine/
│   ├── VNEngine.ts           # Moteur principal (TVNApplication)
│   ├── VNVariableStore.ts    # Variables (structure exacte 264 bytes)
│   ├── VNCommandProcessor.ts # Commandes (30+ types)
│   ├── VNSceneManager.ts     # Scènes (TVNScene, TVNSceneArray)
│   ├── VNRenderer.ts         # Rendu Canvas (DirectDraw → Canvas 2D)
│   ├── VNAudioManager.ts     # Audio (MCI → Web Audio API)
│   ├── VNTimerManager.ts     # Timers (TVNTimer, effets)
│   └── index.ts
├── components/
│   ├── GameContainer.tsx     # Composant principal (TVNFrame)
│   └── index.ts
├── hooks/
│   ├── useVNEngine.ts        # Hook React
│   └── index.ts
├── types/
│   └── vn.types.ts           # Types TypeScript complets
├── examples/
│   └── ExampleProject.ts     # Projet de démo
└── index.ts                  # Export principal
```

---

## Informations produit

- **Nom officiel**: Virtual Navigator Studio / Virtual Navigator Runtime
- **Éditeur**: Sopra Multimedia
- **Adresse**: 32 rue Arago, 92800 Puteaux, France
- **Date**: Copyright 1999
- **Version interne**: vn21_32.exe (VN 2.1 32-bit)
- **Date ressources**: 20 septembre 1999

---

## Notes techniques importantes

### DLLs système Windows requises
| DLL | Fonction |
|-----|----------|
| ADVAPI32.dll | Registry et sécurité |
| DDRAW.dll | DirectDraw (graphiques) |
| GDI32.dll | Graphics Device Interface |
| KERNEL32.dll | Fonctions système |
| OLE32.dll | COM/OLE |
| USER32.dll | Interface utilisateur |
| SHELL32.dll | Shell Windows |
| VERSION.dll | Versioning |
| WINMM.dll | Windows Multimedia |

### Mapping vers React

| Windows/C++ | React Équivalent |
|-------------|-----------------|
| DirectDraw | Canvas 2D / WebGL |
| WINMM (Wave/MIDI) | Web Audio API |
| GDI/OWL UI | React Components |
| Timer events | requestAnimationFrame / setInterval |
| Registry | localStorage / IndexedDB |
| File streams | FileReader API |

---

## Fichiers source originaux identifiés

Le code source original utilisait ces fichiers (extraits des symboles de debug):
- `commands.cpp` - Système de commandes/scripting
- `scene.cpp` - Gestion des scènes
- `hotspot.cpp` - Zones cliquables
- `htmldata.cpp` - Données HTML
- `gdiobjec.cpp/h` - Objets graphiques GDI
- `palette.cpp` - Palette de couleurs
- `timernfx.cpp` - Timer et effets spéciaux
- `toolsfct.cpp` - Fonctions utilitaires
- `sysinfo.cpp` - Informations système
- `dll_var.cpp` - Variables DLL
- `histqueu.h` - Queue d'historique
- `lib/strarray.cpp` - Tableaux de strings

---

## Dernière mise à jour
**Date**: 2026-01-25
**Session**: Analyse complète - Rétro-ingénierie terminée

## Documents du projet
1. **PORTAGE_SUIVI.md** (ce fichier) - Suivi principal, récupération de contexte
2. **ENGINE_PSEUDOCODE.md** - Pseudo-code détaillé du moteur pour portage React

## Prochaines étapes
1. ~~Extraire le pseudo-code complet avec radare2~~ FAIT
2. ~~Documenter la logique des commandes TVNCommand~~ FAIT
3. ~~Analyser les DLLs vnoption et vnresmod~~ FAIT
4. Créer l'architecture React
5. Implémenter le chargeur de projets VN
6. Porter le système de rendu (DirectDraw → Canvas)
7. Porter le système audio (MCI/WINMM → Web Audio API)
