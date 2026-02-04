# Gaps entre le runtime original et le moteur HTML (d'après europeo_functions)

Ce document recense les points manquants/incomplets dans `demo/index.html` en se basant
sur les exports/strings/imports du binaire `europeo.exe` (dossier `europeo_functions`).

## Sources consultées
- `europeo_functions/00_STRINGS.txt` (libellés UI, messages d'erreur runtime)
- `europeo_functions/00_IMPORTS.txt` (backends audio/vidéo, timers, registre)
- `demo/index.html` (moteur HTML actuel, commandes gérées)

## Manques/écarts observés

### 1) Préférences & options UI (runtime original)
**Indices exports/strings :**
- Options "Smooth zoom", "smooth scrolling", "toolbar always visible", "image quality",
  "textured background" et navigation de type "map/index/previous/next/left/right/forward/backward"
  présentes dans les ressources UI du runtime original. (00_STRINGS)

**État HTML :**
- Aucun système de préférences persistées (réglages UI/scroll/zoom) n'est exposé.
- Les actions de navigation type "map/index/left/right/forward/backward" ne sont pas implémentées.

### 2) Audio/vidéo et commandes multimédia
**Indices exports/imports :**
- Import WinMM : `PlaySoundA`, `mciSendCommandA`, `mciGetErrorStringA` + devices MIDI/WAV.
  Cela suggère la prise en charge de `PLAYWAV`, `PLAYMID`, `PLAYCDA`, `PLAYAVI` et séquences (MCI).

**État HTML :**
- `PLAYWAV` et `PLAYAVI` sont gérés, mais `PLAYMID`, `PLAYCDA`, `PLAYSEQ`,
  `CLOSEMID`, `CLOSEAVI` n'ont pas d'implémentation.

### 3) Timers haute résolution / pauses
**Indices exports/imports :**
- Usage de `timeBeginPeriod`, `timeSetEvent`, `timeKillEvent` → timers précis (animations / pauses).

**État HTML :**
- La commande `PAUSE` est explicitement marquée TODO, et il n'existe pas d'équivalent
  timer haute précision côté HTML.

### 4) Commandes VN déclarées mais non exécutées
**Indices HTML :**
- La table `CMD_NAMES` déclare de nombreuses commandes (ABOUT, PREFS, EXEC, EXPLORE,
  MSGBOX, PLAYCMD, RUNDLL, LOAD, SAVE, CLOSEMID, etc.).
- Le dispatch (`executeStringCommand`) n'implémente qu'un sous-ensemble (WAV/BMP/HTML/AVI,
  variables, overlays, update), les autres tombent dans le `default`.

**Manquants/incomplets notables :**
- `ABOUT`, `PREFS`, `ZOOM`, `ZOOMIN`, `ZOOMOUT`, `EXEC`, `EXPLORE`
- `PLAYMID`, `PLAYCDA`, `PLAYSEQ`, `PLAYCMD`
- `MSGBOX`, `RUNDLL`, `CLOSEDLL`
- `LOAD`, `SAVE`, `CLOSEAVI`, `CLOSEMID`
- `DEFCURSOR`, `DELOBJ`, `SHOWOBJ`, `HIDEOBJ`

### 5) Gestion d'erreurs / diagnostics
**Indices exports/strings :**
- Messages runtime “Unknown command”, “Invalid index. There is no scene/hotspot at %i”,
  “Unable to load file/module”.

**État HTML :**
- Le moteur logge quelques warnings, mais ne remonte pas explicitement des erreurs
  par type (commande inconnue, index hors bornes, etc.) pour aider au debug.

### 6) Préférences persistées (registre)
**Indices exports/imports :**
- Nombreux appels à l'API registre Windows (`RegQuery*`, `RegSet*`, etc.)
  → le runtime stocke des réglages (prefs, qualité, interface).

**État HTML :**
- Pas d'équivalent de stockage persisté (localStorage/IndexedDB) pour les réglages UI/affichage.

### 7) Logique conditionnelle & exécution séquentielle
**Indices export/format :**
- Les commandes VND utilisent des wrappers et sous-types (type 1 et 3) qui peuvent enchaîner
  plusieurs actions, et le runtime gère des “Unknown command”/diagnostics stricts. (00_STRINGS)

**État HTML :**
- Le `IF` actuel exécute une seule action (then/else) et ne gère pas toujours la chaîne complète
  d'actions associées à une commande (ex: enchaînements et side-effects multiples).
- Les commandes non gérées tombent silencieusement dans le `default`, ce qui masque les écarts
  avec le runtime d'origine.

### 8) Timing & transitions (zoom/scroll/animations)
**Indices exports/imports :**
- Les timers haute résolution et l'option “Smooth zoom/scrolling” suggèrent des transitions
  interpolées plutôt qu'immédiates. (00_STRINGS + timeSetEvent)

**État HTML :**
- `scrollX` est mis à jour “en dur” (pas d'inertie ni easing).
- ZOOM/ZOOMIN/ZOOMOUT n'ont pas de traitement, donc aucune transition/animation liée au zoom.
- `PAUSE` ne bloque pas la chaîne d'exécution (TODO), ce qui casse les timings scriptés.

### 9) Affichage & rendu (ordre, palettes, qualité)
**Indices exports/imports :**
- DirectDraw + GDI (BitBlt/StretchBlt/Palette) suggèrent un rendu basé sur bitmaps avec
  prise en charge de palettes/qualité d'image (ex: image quality, textured background).

**État HTML :**
- Pas de réglage de qualité d'image (pixelated vs smooth) ni de gestion palette/8-bit.
- Ordre de rendu des overlays (ADDBMP/PLAYBMP) et z-order n'est pas piloté par flags
  ou priorité (potentiel écart visuel).

### 10) Hotspots & navigation directionnelle
**Indices exports/strings :**
- Actions “Forward/Backward/Left/Right” et “Map/Index” indiquent des navigations
  en plus des hotspots classiques. (00_STRINGS)

**État HTML :**
- La navigation est surtout hotspot/scene/prev, sans couche “directionnelle”.
- Pas de “map/index” global qui liste/structure les scènes comme le runtime.

## Prochaines pistes (priorités)
1. Ajouter une couche "prefs" (localStorage) pour smooth zoom/scroll, toolbar always visible,
   qualité d'image, fond texturé.
2. Compléter les commandes multimédia : `PLAYMID`, `PLAYCDA`, `PLAYSEQ`, `CLOSEMID`, `CLOSEAVI`.
3. Implémenter `PAUSE` via timers JS (setTimeout/requestAnimationFrame + queue de commandes).
4. Gérer `MSGBOX`, `EXEC`, `EXPLORE`, `LOAD/SAVE` (même en no-op loggé au départ).
5. Ajouter des erreurs explicites pour commandes inconnues et index invalides.
6. Ajouter une exécution séquentielle/chaînée des actions par commande (IF + wrappers),
   pour refléter l'ordre runtime et éviter les effets perdus.
