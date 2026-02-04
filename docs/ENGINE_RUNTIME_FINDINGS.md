# Findings from europeo.exe function dump

This note summarizes additional runtime clues extracted from `europeo.exe` via the bundled `europeo_functions` dump. It focuses on UI features, audio/video backends, timers, and error strings that should inform the HTML/TS engine port.

## Runtime preferences/UI hints
Resource strings in the binary show explicit UI/feature toggles that should map to engine behavior:

- **Smooth zoom** and **smooth scrolling** preferences are present, suggesting the original runtime exposes toggles and likely interpolated movement instead of immediate jumps. These map to the in-engine zoom/scroll state and should be wired to user prefs or config flags. 【F:europeo_functions/00_STRINGS.txt†L4920-L4939】
- **Toolbar always visible**, **image quality**, and **textured background** options imply the runtime has display preferences that affect rendering and UI chrome. 【F:europeo_functions/00_STRINGS.txt†L4930-L4939】
- Navigation actions (previous/next scene, index, map, forward/backward/left/right) are baked into the runtime UI, confirming the engine expects direct scene traversal actions beyond hotspots. 【F:europeo_functions/00_STRINGS.txt†L4961-L4974】

## Error messages that hint at expected behavior
Runtime error strings indicate how the original engine reports parsing and scene issues:

- “Unknown command” suggests a command dispatch table with validation and user-facing error reporting (useful for debugging unhandled VND commands). 【F:europeo_functions/00_STRINGS.txt†L4956-L4961】
- “Invalid index. There is no scene at %i.” and “Invalid index. There is no hotspot at %i.” imply strict bounds checks on scene/hotspot access. 【F:europeo_functions/00_STRINGS.txt†L4955-L4957】
- “Unable to load file”/“Unknown file format”/“Unable to load module” strings show explicit runtime load failures that should be mirrored by the HTML engine for parity. 【F:europeo_functions/00_STRINGS.txt†L4955-L4963】

## Audio/video + timer backends (imports)
The imported WinMM APIs clarify which media backends the original runtime uses:

- **PlaySoundA** → classic WAV playback. 【F:europeo_functions/00_IMPORTS.txt†L456-L466】
- **mciSendCommandA / mciGetErrorStringA** → MCI commands (commonly for CD audio, MIDI, and AVI playback) suggest support for `PLAYCDA`, `PLAYMID`, `PLAYAVI`-style commands. 【F:europeo_functions/00_IMPORTS.txt†L462-L465】
- **midiOutGetNumDevs / waveOutGetNumDevs** → MIDI and wave device availability checks. 【F:europeo_functions/00_IMPORTS.txt†L456-L463】
- **timeBeginPeriod / timeSetEvent / timeKillEvent** → high‑resolution timers, likely used for animation/transition timing and scheduled effects. 【F:europeo_functions/00_IMPORTS.txt†L456-L465】

## Rendering backend confirmation (imports)
- **DirectDrawCreate** confirms the original runtime used DirectDraw for blitting/bitmap rendering (matching the porting docs and VN renderer expectations). 【F:europeo_functions/00_IMPORTS.txt†L466-L466】

## Recommended porting priorities (based on these findings)
1. **Preference‑driven zoom/scroll smoothing**: introduce toggles that control interpolated zoom/scroll behavior (from prefs) before matching exact timing. 【F:europeo_functions/00_STRINGS.txt†L4920-L4939】
2. **Navigation commands**: add explicit support for previous/next scene, index/map navigation, and turn left/right/forward/backward actions beyond hotspots. 【F:europeo_functions/00_STRINGS.txt†L4961-L4974】
3. **Media command parity**: implement/bridge MIDI, CD audio, and MCI‑style playback, at least as graceful no‑ops with logs, to prevent scenario regressions. 【F:europeo_functions/00_IMPORTS.txt†L456-L465】
4. **Timer‑driven transitions**: wire timers to scene transitions/animations to match the original use of `timeSetEvent`. 【F:europeo_functions/00_IMPORTS.txt†L456-L465】
