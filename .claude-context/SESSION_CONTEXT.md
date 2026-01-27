# VN-Studio - Contexte de session Claude

**Dernière mise à jour:** 2026-01-27
**Sessions précédentes:** ~5 sessions de rétro-ingénierie

---

## Objectif du projet

Porter le moteur de jeu **Virtual Navigator 2.1** (Sopra Multimedia, 1999) vers React/TypeScript.

Le jeu original est **Europeo** - un jeu éducatif sur l'Europe pour enfants.

---

## Fichiers clés

### Exécutable original
- `europeo.exe` - Exécutable principal (analysé avec IDA Pro/Ghidra)
- `bds52t.dll` - Bibliothèque Borland C++ pour sérialisation

### Fichiers de données
- `VNP-VND/start.vnd` - Fichier de données principal (scènes, hotspots)
- `VNP-VND/*.vnp` - Projets VN additionnels

### Code source React
- `src/engine/VNFileLoader.ts` - Parser principal des fichiers VND/VNP
- `src/types/vn.types.ts` - Types TypeScript

---

## Découvertes techniques majeures

### Format VND (voir docs/VND_FORMAT.md)

1. **Sérialisation Borland C++**
   - Strings: uint32 (longueur) + données Latin-1
   - Classes streamables avec tags de type

2. **Structure des scènes**
   - Nom: 50 bytes fixe (paddé avec \0)
   - Flag: 1 byte
   - Resource: Borland string (image de fond)
   - Données: séquence de records

3. **Structure des hotspots**
   ```
   PLAYBMP (10) → PLAYWAV (11) → Commandes → POLYGON (105)
   ```

4. **Types de records découverts**
   - Type 1 = Wrapper (subtype + Borland string)
   - Type 3 = Commande complexe (subtype + string)
   - Type 105 = Polygone de collision (count + points)

5. **5 hotspots dans Frontal**
   - jeu, livres, tirelire, oui, video
   - Tous avec polygones de collision

---

## État actuel

### Fonctionnel
- Lecture du header VND
- Identification des scènes
- Parsing des hotspots (tous les 5 trouvés)
- Extraction des polygones de collision

### À corriger
- Erreurs TypeScript dans VNFileLoader.ts
- Alignement des types (VNRect, VNCommandType)

### À implémenter
- Parser complet des variables
- Rendu des scènes et hotspots
- Exécution des commandes (SET_VAR, SCENE, etc.)
- Lecture audio/vidéo

---

## Scripts de debug

```bash
# Parser hotspots
npx ts-node --transpile-only scripts/parse-hotspots.ts VNP-VND/start.vnd

# Debug complet
npx ts-node --transpile-only scripts/debug-vnd.ts VNP-VND/start.vnd
```

---

## Notes pour la prochaine session

1. Commencer par corriger les erreurs TypeScript
2. Le fichier ENGINE_PSEUDOCODE.md contient des notes sur les fonctions désassemblées
3. Les positions des hotspots dans start.vnd: 5050, 5309, 5521, 5753, 5934
4. La scène "Frontal" commence à position 4895

---

## Conventions

- Français pour les commentaires et documentation
- Types préfixés VN (VNScene, VNHotspot, etc.)
- Records types dans enum VNRecordType
