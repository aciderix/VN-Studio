# Part Detection Algorithm for VND Format Type 54

## Overview

This document describes the algorithm for detecting parts (scenes) in VND files with Format Type 54, such as `couleurs1.vnd`.

## Verified Reference Points

- **maison.bmp = part 5** ✓
- **fontain2.bmp = part 39** ✓
- **Fin Perdu = part 54** ✓
- **Total: 54 parts**

## Detection Patterns

### Pattern 1: Standard Delimiter
- **Pattern**: 12+ consecutive zeros followed by `01 00 00 00` (uint32 = 1)
- **Content**: BMP or AVI file in the next 300 bytes
- **Zero counts**: Typically 12, 22, 27, 39, 40, 92, 108, 184 zeros

### Pattern 2: Music Scenes
- **Pattern**: `0x81 00 00 00` followed by "music.wav" within 50 bytes
- **Content**: BMP file after the music reference
- **Usage**: 4 scenes with background music (biblio, maison, transverteur2, bdmusee)

### Pattern 3: Empty Scenes
- **Pattern**: 50+ consecutive zeros followed by uint32 length=5 and string "Empty"
- **Content**: Literal string "Empty"
- **Usage**: 5 Empty placeholder scenes

### Pattern 4: Named Scenes
- **Pattern**: 5+ zeros followed by uint32 length and scene name string
- **Names**: "Toolbar", "Fin Perdu"
- **Usage**: Special named scenes without BMP backgrounds

## False Positive Filters

### Filter 1: Hotspot Markers
- **Condition**: 19-21 zeros AND same BMP as next part AND gap >= 250 bytes
- **Reason**: These are hotspot definitions that reference the same background BMP
- **Examples**: europe.bmp @26220, tele.bmp @32114, burzom.bmp @33088

### Filter 2: End-Game Commands
- **Condition**: 90+ zeros AND content = "fin2.avi"
- **Reason**: These are end-game video commands, not separate scenes
- **Examples**: @70356, @70498

## Content Detection

For each candidate part position:
1. Search up to 300 bytes forward
2. Look for uint32 length (4-80) followed by string
3. Match strings ending with `.bmp` or containing `.avi`
4. For AVI with parameters (e.g., "intro12.avi 0 150 150 470 350"), extract just the filename

## Part Composition

### By Type
- **BMP scenes**: 47 parts (background images)
- **AVI scenes**: 2 parts (intro12.avi, perdu.avi)
- **Empty scenes**: 5 parts
- **Named scenes**: 2 parts (Toolbar, Fin Perdu)

### BMPs Used Multiple Times
- calc2.bmp: 3 parts (#14, #15, #16)
- dossier.bmp: 2 parts (#21, #22)
- encre2.bmp: 2 parts (#23, #24)
- bonus.bmp: 5 parts (#28, #31, #32, #33, #35)
- euro1.bmp: 2 parts (#44, #45)
- euro2.bmp: 2 parts (#46, #47)
- mess2.bmp: 2 parts (#48, #50)
- mes_porta.bmp: 2 parts (#51, #52)

## Implementation

See `scripts/detect-parts-final.js` for the complete implementation.

## Usage

```bash
node scripts/detect-parts-final.js VNP-VND/couleurs1.vnd
```

## Notes

- This algorithm is specifically designed for Format Type 54
- Other format types (4, 5, 9, 14) use different scene structures
- Format Type 4 (start.vnd) uses 50-byte fixed scene names
- Format Type 5 (barre.vnd) is a resources file without named scenes
