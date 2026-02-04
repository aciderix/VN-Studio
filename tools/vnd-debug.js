#!/usr/bin/env node
/**
 * VND Debug CLI - Virtual Navigator Debug Tool
 * Complete analysis, inspection and debugging of VND game files
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// VND PARSER WITH STEP LOGGING
// =============================================================================

let parseLog = [];

function logParse(step, detail) {
  parseLog.push({ step, detail, ts: Date.now() });
}

function readBS(buf, p) {
  if (p + 4 > buf.length) return null;
  const len = buf.readUInt32LE(p);
  if (len === 0 || len > 10000 || p + 4 + len > buf.length) return { s: '', l: 4 };
  return { s: buf.slice(p + 4, p + 4 + len).toString('latin1'), l: 4 + len };
}

function readObject(buf, p) {
  const type = buf.readUInt32LE(p); p += 4;
  const bs = readBS(buf, p);
  return { type, string: bs ? bs.s : '', endPos: p + (bs ? bs.l : 4) };
}

function readStringCollection(buf, p) {
  const count = buf.readUInt32LE(p); p += 4;
  const items = [];
  for (let i = 0; i < count; i++) {
    const subIndex = buf.readUInt32LE(p); p += 4;
    const obj = readObject(buf, p);
    items.push({ subIndex, type: obj.type, string: obj.string });
    p = obj.endPos;
  }
  return { items, endPos: p };
}

function readCommand(buf, p, sv) {
  const strCol = readStringCollection(buf, p); p = strCol.endPos;
  const commandType = buf.readUInt32LE(p); p += 4;
  const paramPairCount = buf.readUInt32LE(p); p += 4;
  const paramPairs = [];
  if (paramPairCount > 0 && paramPairCount < 10000) {
    for (let i = 0; i < paramPairCount; i++) {
      paramPairs.push({ a: buf.readInt32LE(p), b: buf.readInt32LE(p + 4) }); p += 8;
    }
  }
  let flags = 0;
  if (sv >= 0x2000c) { flags = buf.readUInt32LE(p); p += 4; }
  return { strings: strCol.items, commandType, paramPairCount, paramPairs, flags, endPos: p };
}

function readContentCollection(buf, p, sv) {
  const count = buf.readUInt32LE(p); p += 4;
  const cmds = [];
  for (let i = 0; i < count; i++) {
    const cmd = readCommand(buf, p, sv);
    cmds.push(cmd); p = cmd.endPos;
  }
  return { commands: cmds, endPos: p };
}

function readScene(buf, p, sv, sceneIndex) {
  const startPos = p;
  const nameBS = readBS(buf, p); if (!nameBS) return null; p += nameBS.l;
  logParse('SCENE_NAME', `Scene ${sceneIndex + 1}: "${nameBS.s}" at offset ${startPos}`);

  const flagBytes = [buf[p], buf[p+1], buf[p+2], buf[p+3]]; p += 4;
  const prop1 = buf.readUInt32LE(p); p += 4;
  const prop2 = buf.readUInt32LE(p); p += 4;
  const prop3 = buf.readUInt32LE(p); p += 4;
  const s1 = readBS(buf, p); p += s1 ? s1.l : 4;
  const s2 = readBS(buf, p); p += s2 ? s2.l : 4;
  const val1 = buf.readUInt32LE(p); p += 4;
  const s3 = readBS(buf, p); p += s3 ? s3.l : 4;
  const val2 = buf.readUInt32LE(p); p += 4;
  const s4 = readBS(buf, p); p += s4 ? s4.l : 4;
  const val3 = buf.readUInt32LE(p); p += 4;
  const s5 = readBS(buf, p); p += s5 ? s5.l : 4;
  const val4 = buf.readUInt32LE(p); p += 4;
  const s6 = readBS(buf, p); p += s6 ? s6.l : 4;
  const val5 = buf.readUInt32LE(p); p += 4;

  if (s5?.s) logParse('SCENE_RESOURCE', `  Resource: ${s5.s}`);
  if (s3?.s) logParse('SCENE_WAV', `  WAV: ${s3.s}`);
  if (s4?.s) logParse('SCENE_AVI', `  AVI: ${s4.s}`);
  if (s6?.s) logParse('SCENE_HTM', `  HTM: ${s6.s}`);

  const rect = { left: buf.readInt32LE(p), top: buf.readInt32LE(p+4), right: buf.readInt32LE(p+8), bottom: buf.readInt32LE(p+12) }; p += 16;
  p += 4;
  const hotspotCount = buf.readUInt32LE(p); p += 4;
  let hotspot = null;
  if (hotspotCount > 0) {
    const timerValue = buf.readUInt32LE(p); p += 4;
    const collCount = buf.readUInt32LE(p); p += 4;
    const objects = [];
    for (let hi = 0; hi < collCount; hi++) {
      const obj = readObject(buf, p);
      objects.push({ type: obj.type, string: obj.string });
      p = obj.endPos;
    }
    hotspot = { timerValue, objects };
    logParse('SCENE_HOTSPOT', `  Hotspot: timer=${timerValue}ms, ${collCount} actions`);
  }
  const cmdListValue = buf.readInt32LE(p); p += 4;
  if (cmdListValue !== 0) p += 20;
  const contentCol = readContentCollection(buf, p, sv);
  p = contentCol.endPos;

  logParse('SCENE_COMMANDS', `  Commands: ${contentCol.commands.length} (${contentCol.commands.filter(c => c.paramPairs.length > 0).length} interactive)`);

  return {
    name: nameBS.s, flagBytes, prop1, prop2, prop3,
    fields: {
      string1: s1?.s || '', string2: s2?.s || '', val1,
      string3: s3?.s || '', val2, string4: s4?.s || '', val3,
      resource: s5?.s || '', val4, string6: s6?.s || '', val5
    },
    rect, hotspotCount, hotspot, commands: contentCol.commands, endPos: p
  };
}

function parseVND(buf, verbose = false) {
  parseLog = [];
  let p = 5;

  logParse('START', `Parsing VND file (${buf.length} bytes)`);

  const magic = readBS(buf, p); p += magic.l;
  if (magic.s !== 'VNFILE') throw new Error('Invalid magic: ' + magic.s);
  logParse('HEADER_MAGIC', `Magic: ${magic.s}`);

  const version = readBS(buf, p); p += version.l;
  logParse('HEADER_VERSION', `Version: ${version.s}`);

  const sceneCount = buf.readUInt32LE(p); p += 4;
  logParse('HEADER_SCENES', `Scene count: ${sceneCount}`);

  const projectName = readBS(buf, p); p += projectName.l;
  logParse('HEADER_PROJECT', `Project: ${projectName.s}`);

  const editor = readBS(buf, p); p += editor.l;
  const serial = readBS(buf, p); p += serial.l;
  const projectIDStr = readBS(buf, p); p += projectIDStr.l;
  const registry = readBS(buf, p); p += registry.l;
  const width = buf.readUInt32LE(p); p += 4;
  const height = buf.readUInt32LE(p); p += 4;
  const depth = buf.readUInt32LE(p); p += 4;
  logParse('HEADER_SIZE', `Resolution: ${width}x${height}x${depth}`);

  p += 16;
  const dllPath = readBS(buf, p); p += dllPath.l;
  if (dllPath.s) logParse('HEADER_DLL', `DLL: ${dllPath.s}`);

  const varCount = buf.readUInt32LE(p); p += 4;
  logParse('VARIABLES', `Variables: ${varCount}`);

  const vars = [];
  for (let vi = 0; vi < varCount; vi++) {
    const vname = readBS(buf, p); p += vname.l;
    const vval = buf.readUInt32LE(p); p += 4;
    vars.push({ name: vname.s, value: vval });
    if (verbose) logParse('VAR', `  ${vname.s} = ${vval}`);
  }

  const vp = version.s.split('.');
  const sv = (parseInt(vp[0]) << 16) | parseInt(vp[1] || '0');

  logParse('SCENES_START', `Parsing ${sceneCount} scenes...`);
  const scenes = [];
  for (let si = 0; si < sceneCount; si++) {
    const scene = readScene(buf, p, sv, si);
    if (!scene) {
      logParse('SCENE_ERROR', `Failed to parse scene ${si + 1}`);
      break;
    }
    scenes.push(scene); p = scene.endPos;
  }

  logParse('END', `Parsing complete. ${buf.length - p} bytes remaining.`);

  return {
    header: { magic: magic.s, version: version.s, sceneCount, projectName: projectName.s, editor: editor.s, width, height, depth },
    variables: vars,
    scenes,
    bytesRemaining: buf.length - p,
    parseLog
  };
}

// =============================================================================
// COMMAND TYPES
// =============================================================================

const CMD_NAMES = {
  0:'QUIT', 1:'ABOUT', 2:'PREFS', 3:'PREV', 4:'NEXT', 5:'ZOOM', 6:'SCENE', 7:'HOTSPOT',
  8:'TIPTEXT', 9:'PLAYAVI', 10:'PLAYBMP', 11:'PLAYWAV', 12:'PLAYMID', 13:'PLAYHTML',
  14:'ZOOMIN', 15:'ZOOMOUT', 16:'PAUSE', 17:'EXEC', 18:'EXPLORE', 19:'PLAYCDA',
  20:'PLAYSEQ', 21:'IF', 22:'SET_VAR', 23:'INC_VAR', 24:'DEC_VAR', 25:'INVALIDATE',
  26:'DEFCURSOR', 27:'ADDBMP', 28:'DELBMP', 29:'SHOWBMP', 30:'HIDEBMP', 31:'RUNPRJ',
  32:'UPDATE', 33:'RUNDLL', 34:'MSGBOX', 35:'PLAYCMD', 36:'CLOSEWAV', 37:'CLOSEDLL',
  38:'PLAYTEXT', 39:'FONT', 40:'REM', 41:'ADDTEXT', 42:'DELOBJ', 43:'SHOWOBJ',
  44:'HIDEOBJ', 45:'LOAD', 46:'SAVE', 47:'CLOSEAVI', 48:'CLOSEMID', 105:'POLYGON'
};

const typeName = t => CMD_NAMES[t] || `UNK_${t}`;

// =============================================================================
// ENHANCED GAME STATE WITH FULL TRACKING
// =============================================================================

class GameState {
  constructor(vnd) {
    this.vnd = vnd;
    this.vars = {};
    this.overlays = {}; // name -> { file, x, y, w, h, visible }
    this.texts = {}; // name -> { text, x, y, fontSize }
    this.sceneHistory = [];
    this.currentScene = -1;
    this.logs = [];
    this.stateHistory = []; // Full state snapshots
    this.warnings = [];

    vnd.variables.forEach(v => { this.vars[v.name.toLowerCase()] = v.value; });
  }

  log(msg) { this.logs.push(msg); }
  warn(msg) { this.warnings.push(msg); this.logs.push(`WARNING: ${msg}`); }

  snapshot() {
    return {
      scene: this.currentScene,
      sceneName: this.vnd.scenes[this.currentScene]?.name || '',
      vars: { ...this.vars },
      overlays: JSON.parse(JSON.stringify(this.overlays)),
      texts: JSON.parse(JSON.stringify(this.texts)),
      timestamp: Date.now()
    };
  }

  saveState() {
    this.stateHistory.push(this.snapshot());
  }

  getVar(name) { return this.vars[name.toLowerCase()] || 0; }

  setVar(name, val) {
    const key = name.toLowerCase();
    const old = this.vars[key] || 0;
    this.vars[key] = val;
    if (old !== val) this.log(`  VAR ${name}: ${old} -> ${val}`);
  }

  addOverlay(name, file, x, y, w, h) {
    this.overlays[name.toLowerCase()] = { name, file, x, y, w, h, visible: true };
    this.log(`  OVERLAY+ ${name}: ${file} at (${x},${y}) ${w}x${h}`);
  }

  delOverlay(name) {
    const key = name.toLowerCase();
    if (this.overlays[key]) {
      delete this.overlays[key];
      this.log(`  OVERLAY- ${name}`);
    }
  }

  showOverlay(name) {
    const key = name.toLowerCase();
    if (this.overlays[key]) {
      this.overlays[key].visible = true;
      this.log(`  OVERLAY_SHOW ${name}`);
    }
  }

  hideOverlay(name) {
    const key = name.toLowerCase();
    if (this.overlays[key]) {
      this.overlays[key].visible = false;
      this.log(`  OVERLAY_HIDE ${name}`);
    }
  }

  evalCondition(cond) {
    const m = cond.match(/(\w+)\s*([<>=!]+)\s*(\d+)/);
    if (!m) return false;
    const [, varName, op, valStr] = m;
    const varVal = this.getVar(varName);
    const val = parseInt(valStr);
    let result;
    switch (op) {
      case '=': case '==': result = varVal === val; break;
      case '<': result = varVal < val; break;
      case '>': result = varVal > val; break;
      case '<=': result = varVal <= val; break;
      case '>=': result = varVal >= val; break;
      case '!=': case '<>': result = varVal !== val; break;
      default: result = false;
    }
    return result;
  }

  parseIf(str) {
    const m = str.match(/^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$/i);
    if (!m) return null;
    return { condition: m[1], thenAction: m[2], elseAction: m[3] || null };
  }

  executeAction(action) {
    const parts = action.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'set_var') {
      this.setVar(parts[1], parseInt(parts[2]) || 0);
    } else if (cmd === 'inc_var') {
      this.setVar(parts[1], this.getVar(parts[1]) + (parseInt(parts[2]) || 1));
    } else if (cmd === 'dec_var') {
      this.setVar(parts[1], this.getVar(parts[1]) - (parseInt(parts[2]) || 1));
    } else if (cmd === 'scene') {
      return { nav: 'scene', target: parts[1] };
    } else if (cmd === 'runprj') {
      return { nav: 'runprj', target: parts.slice(1).join(' ') };
    } else if (cmd === 'prev') {
      return { nav: 'prev' };
    } else if (cmd === 'playavi') {
      this.log(`  VIDEO: ${parts.slice(1).join(' ')}`);
    } else if (cmd === 'playwav') {
      this.log(`  AUDIO: ${parts.slice(1).join(' ')}`);
    } else if (cmd === 'playhtml') {
      this.log(`  HTML: ${parts.slice(1).join(' ')}`);
    } else if (cmd === 'addbmp') {
      // addbmp name file flags x y [w h]
      const name = parts[1];
      const file = parts[2];
      const x = parseInt(parts[4]) || 0;
      const y = parseInt(parts[5]) || 0;
      this.addOverlay(name, file, x, y, 0, 0);
    } else if (cmd === 'delbmp') {
      this.delOverlay(parts[1]);
    } else if (cmd === 'showbmp') {
      this.showOverlay(parts[1]);
    } else if (cmd === 'hidebmp') {
      this.hideOverlay(parts[1]);
    }
    return null;
  }

  processString(s) {
    if (s.type === 22) { // SET_VAR
      const p = s.string.split(/\s+/);
      this.setVar(p[0], parseInt(p[1]) || 0);
    } else if (s.type === 23) { // INC_VAR
      const p = s.string.split(/\s+/);
      this.setVar(p[0], this.getVar(p[0]) + (parseInt(p[1]) || 1));
    } else if (s.type === 24) { // DEC_VAR
      const p = s.string.split(/\s+/);
      this.setVar(p[0], this.getVar(p[0]) - (parseInt(p[1]) || 1));
    } else if (s.type === 11) { // PLAYWAV
      this.log(`  AUDIO: ${s.string}`);
    } else if (s.type === 9) { // PLAYAVI
      this.log(`  VIDEO: ${s.string}`);
    } else if (s.type === 13) { // PLAYHTML
      this.log(`  HTML: ${s.string}`);
    } else if (s.type === 27) { // ADDBMP
      const p = s.string.split(/\s+/);
      this.addOverlay(p[0], p[1], parseInt(p[3]) || 0, parseInt(p[4]) || 0, 0, 0);
    } else if (s.type === 28) { // DELBMP
      this.delOverlay(s.string.split(/\s+/)[0]);
    } else if (s.type === 29) { // SHOWBMP
      this.showOverlay(s.string.split(/\s+/)[0]);
    } else if (s.type === 30) { // HIDEBMP
      this.hideOverlay(s.string.split(/\s+/)[0]);
    } else if (s.type === 21) { // IF
      const parsed = this.parseIf(s.string);
      if (parsed) {
        const result = this.evalCondition(parsed.condition);
        if (result) {
          this.log(`  IF ${parsed.condition} -> TRUE`);
          return this.executeAction(parsed.thenAction);
        } else if (parsed.elseAction) {
          this.log(`  IF ${parsed.condition} -> FALSE (else)`);
          return this.executeAction(parsed.elseAction);
        }
      }
    } else if (s.type === 6) { // SCENE
      return { nav: 'scene', target: s.string };
    } else if (s.type === 3) { // PREV
      return { nav: 'prev' };
    } else if (s.type === 31) { // RUNPRJ
      return { nav: 'runprj', target: s.string };
    }
    return null;
  }

  goToScene(idx) {
    if (idx < 0 || idx >= this.vnd.scenes.length) {
      this.warn(`Invalid scene index: ${idx + 1}`);
      return;
    }

    this.saveState();
    this.sceneHistory.push(this.currentScene);
    this.currentScene = idx;
    const scene = this.vnd.scenes[idx];

    this.log(`\n=== SCENE ${idx + 1}: ${scene.name} ===`);

    // Scene fields
    if (scene.fields.resource) this.log(`  BG: ${scene.fields.resource}`);
    if (scene.fields.string3) this.log(`  WAV: ${scene.fields.string3} (loops=${scene.fields.val2})`);
    if (scene.fields.string6) this.log(`  HTM: ${scene.fields.string6}`);

    // Auto commands (no polygon)
    scene.commands.forEach((cmd, ci) => {
      if (cmd.paramPairs.length > 0) return;
      cmd.strings.forEach(s => {
        if ([6, 38, 39, 3, 7].includes(s.type)) return;
        this.processString(s);
      });
    });
  }

  simulateClick(cmdIdx) {
    const scene = this.vnd.scenes[this.currentScene];
    if (!scene || cmdIdx >= scene.commands.length) return null;
    const cmd = scene.commands[cmdIdx];
    if (cmd.paramPairs.length === 0) {
      this.warn(`C${cmdIdx} is not interactive (no polygon)`);
      return null;
    }

    this.saveState();
    this.log(`\n>>> CLICK C${cmdIdx}`);

    let navigation = null;
    cmd.strings.forEach(s => {
      if ([38, 39].includes(s.type)) return; // Skip hover stuff
      const result = this.processString(s);
      if (result) navigation = result;
    });

    if (navigation) {
      this.log(`  NAV: ${navigation.nav} ${navigation.target || ''}`);
      if (navigation.nav === 'scene') {
        const idx = parseInt(navigation.target) - 1;
        if (!isNaN(idx)) this.goToScene(idx);
      } else if (navigation.nav === 'prev' && this.sceneHistory.length > 0) {
        const prev = this.sceneHistory.pop();
        if (prev >= 0) this.goToScene(prev);
      }
    }
    return navigation;
  }

  getPossibleActions() {
    const scene = this.vnd.scenes[this.currentScene];
    if (!scene) return [];

    return scene.commands
      .map((cmd, ci) => {
        if (cmd.paramPairs.length === 0) return null;

        const hoverText = cmd.strings.find(s => s.type === 38);
        const actions = cmd.strings.filter(s => ![38, 39].includes(s.type));

        // Evaluate which IF conditions would be true
        const evaluatedActions = actions.map(s => {
          if (s.type === 21) {
            const parsed = this.parseIf(s.string);
            if (parsed) {
              const wouldExecute = this.evalCondition(parsed.condition);
              return { ...s, wouldExecute, evaluatedAction: wouldExecute ? parsed.thenAction : parsed.elseAction };
            }
          }
          return { ...s, wouldExecute: true };
        });

        return {
          command: `C${ci}`,
          polygon: cmd.paramPairs,
          hoverText: hoverText?.string || null,
          actions: evaluatedActions
        };
      })
      .filter(Boolean);
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateVND(vnd) {
  const issues = [];
  const definedVars = new Set(vnd.variables.map(v => v.name.toLowerCase()));
  const usedVars = new Set();
  const referencedScenes = new Set();
  const referencedResources = { images: new Set(), sounds: new Set(), videos: new Set(), html: new Set() };

  vnd.scenes.forEach((scene, si) => {
    const sceneRef = `Scene ${si + 1} (${scene.name})`;

    // Check resources
    if (scene.fields.resource) referencedResources.images.add(scene.fields.resource.toLowerCase());
    if (scene.fields.string3) referencedResources.sounds.add(scene.fields.string3.toLowerCase());
    if (scene.fields.string4) referencedResources.videos.add(scene.fields.string4.toLowerCase());
    if (scene.fields.string6) referencedResources.html.add(scene.fields.string6.toLowerCase());

    scene.commands.forEach((cmd, ci) => {
      const cmdRef = `${sceneRef} C${ci}`;

      cmd.strings.forEach(s => {
        // Check variable references
        if (s.type === 21) { // IF
          const varMatch = s.string.match(/if\s+(\w+)/i);
          if (varMatch) {
            const varName = varMatch[1].toLowerCase();
            usedVars.add(varName);
            if (!definedVars.has(varName)) {
              issues.push({ type: 'UNDEFINED_VAR', severity: 'warning', location: cmdRef, detail: `Variable "${varMatch[1]}" used but not defined in header` });
            }
          }

          // Check scene references in IF
          const sceneMatch = s.string.match(/scene\s+(\d+)/i);
          if (sceneMatch) {
            const targetScene = parseInt(sceneMatch[1]);
            referencedScenes.add(targetScene);
            if (targetScene < 1 || targetScene > vnd.scenes.length) {
              issues.push({ type: 'INVALID_SCENE', severity: 'error', location: cmdRef, detail: `Scene ${targetScene} does not exist (max: ${vnd.scenes.length})` });
            }
          }

          // Check resources in IF
          const aviMatch = s.string.match(/playavi\s+(\S+)/i);
          if (aviMatch) referencedResources.videos.add(aviMatch[1].toLowerCase());
          const wavMatch = s.string.match(/playwav\s+(\S+)/i);
          if (wavMatch) referencedResources.sounds.add(wavMatch[1].split(/\s/)[0].toLowerCase());
          const htmMatch = s.string.match(/playhtml\s+(\S+)/i);
          if (htmMatch) referencedResources.html.add(htmMatch[1].toLowerCase());
        }

        if (s.type === 22 || s.type === 23 || s.type === 24) { // SET/INC/DEC_VAR
          const varName = s.string.split(/\s+/)[0].toLowerCase();
          usedVars.add(varName);
        }

        if (s.type === 6) { // SCENE
          const targetScene = parseInt(s.string);
          referencedScenes.add(targetScene);
          if (targetScene < 1 || targetScene > vnd.scenes.length) {
            issues.push({ type: 'INVALID_SCENE', severity: 'error', location: cmdRef, detail: `Scene ${targetScene} does not exist` });
          }
        }

        if (s.type === 9) referencedResources.videos.add(s.string.split(/\s+/)[0].toLowerCase());
        if (s.type === 11) referencedResources.sounds.add(s.string.split(/\s+/)[0].toLowerCase());
        if (s.type === 13) referencedResources.html.add(s.string.split(/\s+/)[0].toLowerCase());
        if (s.type === 27) referencedResources.images.add(s.string.split(/\s+/)[1]?.toLowerCase() || '');
      });

      // Check polygon validity
      if (cmd.paramPairs.length === 1) {
        issues.push({ type: 'INVALID_POLYGON', severity: 'warning', location: cmdRef, detail: 'Polygon has only 1 point' });
      }
    });

    // Check hotspot
    if (scene.hotspot) {
      scene.hotspot.objects.forEach((obj, oi) => {
        if (obj.type === 21) {
          const varMatch = obj.string.match(/if\s+(\w+)/i);
          if (varMatch) {
            const varName = varMatch[1].toLowerCase();
            usedVars.add(varName);
            if (!definedVars.has(varName)) {
              issues.push({ type: 'UNDEFINED_VAR', severity: 'warning', location: `${sceneRef} Hotspot`, detail: `Variable "${varMatch[1]}" used but not defined` });
            }
          }
        }
      });
    }
  });

  // Check for unused variables
  definedVars.forEach(v => {
    if (!usedVars.has(v)) {
      issues.push({ type: 'UNUSED_VAR', severity: 'info', location: 'Header', detail: `Variable "${v}" defined but never used` });
    }
  });

  // Check for unreachable scenes
  const reachableFromScene1 = new Set([1]);
  let changed = true;
  while (changed) {
    changed = false;
    referencedScenes.forEach(s => {
      if (!reachableFromScene1.has(s)) {
        // Check if any scene that can reach this one is reachable
        vnd.scenes.forEach((scene, si) => {
          if (reachableFromScene1.has(si + 1)) {
            scene.commands.forEach(cmd => {
              cmd.strings.forEach(str => {
                if (str.type === 6 && parseInt(str.string) === s) {
                  reachableFromScene1.add(s);
                  changed = true;
                }
                if (str.type === 21) {
                  const m = str.string.match(/scene\s+(\d+)/i);
                  if (m && parseInt(m[1]) === s) {
                    reachableFromScene1.add(s);
                    changed = true;
                  }
                }
              });
            });
          }
        });
      }
    });
  }

  for (let i = 1; i <= vnd.scenes.length; i++) {
    if (!reachableFromScene1.has(i)) {
      issues.push({ type: 'UNREACHABLE_SCENE', severity: 'info', location: `Scene ${i}`, detail: `Scene ${i} (${vnd.scenes[i-1].name}) may not be reachable from Scene 1` });
    }
  }

  return {
    issues,
    stats: {
      totalScenes: vnd.scenes.length,
      definedVars: definedVars.size,
      usedVars: usedVars.size,
      referencedScenes: referencedScenes.size,
      resources: {
        images: referencedResources.images.size,
        sounds: referencedResources.sounds.size,
        videos: referencedResources.videos.size,
        html: referencedResources.html.size
      }
    }
  };
}

// =============================================================================
// CLI COMMANDS
// =============================================================================

function loadVND(filePath, verbose = false) {
  if (!fs.existsSync(filePath)) { console.error(`Error: File not found: ${filePath}`); process.exit(1); }
  try { return parseVND(fs.readFileSync(filePath), verbose); }
  catch (e) { console.error(`Error parsing VND: ${e.message}`); process.exit(1); }
}

function cmdParse(file, json) {
  const vnd = loadVND(file, true);
  if (json) {
    console.log(JSON.stringify(vnd.parseLog, null, 2));
  } else {
    console.log('PARSING STEPS:\n');
    vnd.parseLog.forEach((log, i) => {
      console.log(`${String(i + 1).padStart(4)}. [${log.step}] ${log.detail}`);
    });
  }
}

function cmdInfo(file, json) {
  const vnd = loadVND(file);
  const info = {
    file: path.basename(file),
    project: vnd.header.projectName,
    version: vnd.header.version,
    resolution: `${vnd.header.width}x${vnd.header.height}`,
    scenes: vnd.scenes.length,
    variables: vnd.variables.length,
    bytesRemaining: vnd.bytesRemaining
  };
  if (json) { console.log(JSON.stringify(info, null, 2)); return; }
  console.log(`FILE: ${info.file}`);
  console.log(`PROJECT: ${info.project}`);
  console.log(`VERSION: ${info.version}`);
  console.log(`RESOLUTION: ${info.resolution}`);
  console.log(`SCENES: ${info.scenes}`);
  console.log(`VARIABLES: ${info.variables}`);
}

function cmdScenes(file, json) {
  const vnd = loadVND(file);
  const scenes = vnd.scenes.map((s, i) => ({
    id: i + 1,
    name: s.name,
    commands: s.commands.length,
    polygons: s.commands.filter(c => c.paramPairs.length > 0).length,
    hasVideo: s.commands.some(c => c.strings.some(st => st.type === 9 || (st.type === 21 && /playavi/i.test(st.string)))),
    hasHotspot: s.hotspot !== null,
    hasHtml: !!s.fields.string6,
    resource: s.fields.resource
  }));
  if (json) { console.log(JSON.stringify(scenes, null, 2)); return; }
  scenes.forEach(s => {
    const flags = [s.hasVideo ? 'VIDEO' : '', s.hasHotspot ? 'HOTSPOT' : '', s.hasHtml ? 'HTM' : ''].filter(Boolean).join(',');
    console.log(`${String(s.id).padStart(3)}. ${(s.name || '(unnamed)').padEnd(25)} cmds=${s.commands} polys=${s.polygons} ${flags ? `[${flags}]` : ''}`);
  });
}

function cmdScene(file, sceneNum, json) {
  const vnd = loadVND(file);
  const idx = parseInt(sceneNum) - 1;
  if (idx < 0 || idx >= vnd.scenes.length) { console.error(`Scene ${sceneNum} not found`); process.exit(1); }
  const scene = vnd.scenes[idx];

  const data = {
    id: idx + 1,
    name: scene.name,
    fields: scene.fields,
    rect: scene.rect,
    hotspot: scene.hotspot,
    commands: scene.commands.map((cmd, ci) => ({
      id: `C${ci}`,
      type: cmd.commandType,
      interactive: cmd.paramPairs.length > 0,
      polygon: cmd.paramPairs,
      strings: cmd.strings.map(s => ({ type: s.type, typeName: typeName(s.type), value: s.string }))
    }))
  };

  if (json) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log(`\n=== SCENE ${data.id}: ${data.name} ===\n`);
  console.log('FIELDS:');
  if (scene.fields.resource) console.log(`  resource: ${scene.fields.resource}`);
  if (scene.fields.string3) console.log(`  WAV: ${scene.fields.string3} loops=${scene.fields.val2}`);
  if (scene.fields.string4) console.log(`  AVI: ${scene.fields.string4} flags=${scene.fields.val3}`);
  if (scene.fields.string6) console.log(`  HTM: ${scene.fields.string6}`);
  console.log(`  rect: ${scene.rect.left},${scene.rect.top} -> ${scene.rect.right},${scene.rect.bottom}`);

  if (scene.hotspot) {
    console.log(`\nHOTSPOT (timer=${scene.hotspot.timerValue}ms):`);
    scene.hotspot.objects.forEach(obj => console.log(`  [${typeName(obj.type)}] ${obj.string}`));
  }

  console.log(`\nCOMMANDS (${scene.commands.length}):`);
  data.commands.forEach(cmd => {
    const mode = cmd.interactive ? 'INTERACTIVE' : 'AUTO';
    const polyStr = cmd.polygon.length > 0 ?
      (cmd.polygon.length === 2 ? `rect(${cmd.polygon[0].a},${cmd.polygon[0].b}->${cmd.polygon[1].a},${cmd.polygon[1].b})` : `poly(${cmd.polygon.length}pts)`) : '';
    console.log(`\n${cmd.id} [${mode}] ${polyStr}`);
    cmd.strings.forEach(s => console.log(`  [${s.typeName.padEnd(10)}] ${s.value}`));
  });
}

function cmdElements(file, sceneNum, json) {
  const vnd = loadVND(file);
  const idx = parseInt(sceneNum) - 1;
  if (idx < 0 || idx >= vnd.scenes.length) { console.error(`Scene ${sceneNum} not found`); process.exit(1); }
  const scene = vnd.scenes[idx];

  const elements = {
    background: scene.fields.resource ? { file: scene.fields.resource } : null,
    audio: scene.fields.string3 ? { file: scene.fields.string3, loops: scene.fields.val2 } : null,
    html: scene.fields.string6 ? { file: scene.fields.string6, rect: scene.rect } : null,
    images: [],
    texts: [],
    videos: [],
    polygons: []
  };

  scene.commands.forEach((cmd, ci) => {
    // Polygons
    if (cmd.paramPairs.length > 0) {
      const hoverText = cmd.strings.find(s => s.type === 38);
      let hoverContent = null;
      if (hoverText) {
        const m = hoverText.string.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+(.+)/);
        if (m) hoverContent = { x: parseInt(m[1]), y: parseInt(m[2]), x2: parseInt(m[3]), y2: parseInt(m[4]), text: m[5] };
      }
      elements.polygons.push({
        command: `C${ci}`,
        points: cmd.paramPairs,
        bounds: cmd.paramPairs.length >= 2 ? {
          minX: Math.min(...cmd.paramPairs.map(p => p.a)),
          minY: Math.min(...cmd.paramPairs.map(p => p.b)),
          maxX: Math.max(...cmd.paramPairs.map(p => p.a)),
          maxY: Math.max(...cmd.paramPairs.map(p => p.b))
        } : null,
        hoverText: hoverContent
      });
    }

    // Images, texts, videos from commands
    cmd.strings.forEach(s => {
      if (s.type === 27) { // ADDBMP
        const p = s.string.split(/\s+/);
        elements.images.push({ name: p[0], file: p[1], x: parseInt(p[3]) || 0, y: parseInt(p[4]) || 0, source: `C${ci}`, auto: cmd.paramPairs.length === 0 });
      }
      if (s.type === 9) { // PLAYAVI
        const p = s.string.split(/\s+/);
        elements.videos.push({ file: p[0], flags: p[1], x: parseInt(p[2]) || 0, y: parseInt(p[3]) || 0, x2: parseInt(p[4]) || 0, y2: parseInt(p[5]) || 0, source: `C${ci}`, auto: cmd.paramPairs.length === 0 });
      }
      if (s.type === 38) { // PLAYTEXT
        const m = s.string.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+(.+)/);
        if (m) elements.texts.push({ x: parseInt(m[1]), y: parseInt(m[2]), x2: parseInt(m[3]), y2: parseInt(m[4]), text: m[5], source: `C${ci}`, isHover: true });
      }
      if (s.type === 21 && /addbmp/i.test(s.string)) {
        const m = s.string.match(/addbmp\s+(\S+)\s+(\S+)\s+\d+\s+(\d+)\s+(\d+)/i);
        if (m) elements.images.push({ name: m[1], file: m[2], x: parseInt(m[3]), y: parseInt(m[4]), source: `C${ci}:IF`, conditional: true });
      }
      if (s.type === 21 && /playavi/i.test(s.string)) {
        const m = s.string.match(/playavi\s+(\S+)/i);
        if (m) elements.videos.push({ file: m[1], source: `C${ci}:IF`, conditional: true });
      }
    });
  });

  if (json) { console.log(JSON.stringify(elements, null, 2)); return; }

  console.log(`\n=== ELEMENTS IN SCENE ${sceneNum}: ${scene.name} ===\n`);

  if (elements.background) console.log(`BACKGROUND: ${elements.background.file}`);
  if (elements.audio) console.log(`AUDIO: ${elements.audio.file} (loops=${elements.audio.loops})`);
  if (elements.html) console.log(`HTML: ${elements.html.file} at (${elements.html.rect.left},${elements.html.rect.top}->${elements.html.rect.right},${elements.html.rect.bottom})`);

  if (elements.images.length > 0) {
    console.log(`\nIMAGES (${elements.images.length}):`);
    elements.images.forEach(img => {
      const flags = [img.auto ? 'AUTO' : 'CLICK', img.conditional ? 'COND' : ''].filter(Boolean).join(',');
      console.log(`  ${img.name}: ${img.file} at (${img.x},${img.y}) [${img.source}] {${flags}}`);
    });
  }

  if (elements.videos.length > 0) {
    console.log(`\nVIDEOS (${elements.videos.length}):`);
    elements.videos.forEach(vid => {
      const flags = [vid.auto ? 'AUTO' : 'CLICK', vid.conditional ? 'COND' : ''].filter(Boolean).join(',');
      const pos = vid.x2 ? `(${vid.x},${vid.y}->${vid.x2},${vid.y2})` : '';
      console.log(`  ${vid.file} ${pos} [${vid.source}] {${flags}}`);
    });
  }

  if (elements.polygons.length > 0) {
    console.log(`\nPOLYGONS (${elements.polygons.length}):`);
    elements.polygons.forEach(poly => {
      const bounds = poly.bounds ? `(${poly.bounds.minX},${poly.bounds.minY}->${poly.bounds.maxX},${poly.bounds.maxY})` : '';
      const hover = poly.hoverText ? ` "${poly.hoverText.text}"` : '';
      console.log(`  ${poly.command}: ${poly.points.length}pts ${bounds}${hover}`);
    });
  }
}

function cmdHover(file, sceneNum, json) {
  const vnd = loadVND(file);
  const idx = parseInt(sceneNum) - 1;
  if (idx < 0 || idx >= vnd.scenes.length) { console.error(`Scene ${sceneNum} not found`); process.exit(1); }
  const scene = vnd.scenes[idx];

  const hovers = [];
  scene.commands.forEach((cmd, ci) => {
    if (cmd.paramPairs.length === 0) return;

    const font = cmd.strings.find(s => s.type === 39);
    const texts = cmd.strings.filter(s => s.type === 38);

    if (texts.length > 0) {
      texts.forEach(t => {
        const m = t.string.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+)/);
        if (m) {
          hovers.push({
            command: `C${ci}`,
            polygon: cmd.paramPairs.length === 2 ?
              { type: 'rect', x1: cmd.paramPairs[0].a, y1: cmd.paramPairs[0].b, x2: cmd.paramPairs[1].a, y2: cmd.paramPairs[1].b } :
              { type: 'poly', points: cmd.paramPairs.length },
            text: { x: parseInt(m[1]), y: parseInt(m[2]), w: parseInt(m[3]) - parseInt(m[1]), h: parseInt(m[4]) - parseInt(m[2]), flags: m[5], content: m[6] },
            font: font?.string || null
          });
        }
      });
    }
  });

  if (json) { console.log(JSON.stringify(hovers, null, 2)); return; }

  console.log(`\nHOVER EFFECTS IN SCENE ${sceneNum} (${hovers.length}):\n`);
  hovers.forEach(h => {
    const polyStr = h.polygon.type === 'rect' ? `rect(${h.polygon.x1},${h.polygon.y1}->${h.polygon.x2},${h.polygon.y2})` : `poly(${h.polygon.points}pts)`;
    console.log(`${h.command} ${polyStr}`);
    console.log(`  Text: "${h.text.content}"`);
    console.log(`  Position: (${h.text.x},${h.text.y}) ${h.text.w}x${h.text.h}`);
    if (h.font) console.log(`  Font: ${h.font}`);
    console.log('');
  });
}

function cmdClick(file, sceneNum, json) {
  const vnd = loadVND(file);
  const idx = parseInt(sceneNum) - 1;
  if (idx < 0 || idx >= vnd.scenes.length) { console.error(`Scene ${sceneNum} not found`); process.exit(1); }
  const scene = vnd.scenes[idx];

  const clicks = [];
  scene.commands.forEach((cmd, ci) => {
    if (cmd.paramPairs.length === 0) return;

    const actions = cmd.strings.filter(s => ![38, 39].includes(s.type)).map(s => {
      let category = 'other';
      if ([22, 23, 24].includes(s.type)) category = 'variable';
      else if ([27, 28, 29, 30].includes(s.type)) category = 'overlay';
      else if ([9, 47].includes(s.type)) category = 'video';
      else if ([11, 36].includes(s.type)) category = 'audio';
      else if ([6, 3, 31].includes(s.type)) category = 'navigation';
      else if (s.type === 13) category = 'html';
      else if (s.type === 21) {
        if (/scene|runprj|prev/i.test(s.string)) category = 'navigation';
        else if (/playavi/i.test(s.string)) category = 'video';
        else if (/playwav/i.test(s.string)) category = 'audio';
        else if (/addbmp|delbmp|showbmp|hidebmp/i.test(s.string)) category = 'overlay';
        else if (/set_var|inc_var|dec_var/i.test(s.string)) category = 'variable';
        else category = 'condition';
      }
      return { type: typeName(s.type), value: s.string, category };
    });

    const hoverText = cmd.strings.find(s => s.type === 38);
    let label = null;
    if (hoverText) {
      const m = hoverText.string.match(/\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(.+)/);
      if (m) label = m[1];
    }

    clicks.push({
      command: `C${ci}`,
      label,
      polygon: cmd.paramPairs,
      actions
    });
  });

  if (json) { console.log(JSON.stringify(clicks, null, 2)); return; }

  console.log(`\nCLICK ACTIONS IN SCENE ${sceneNum} (${clicks.length}):\n`);
  clicks.forEach(c => {
    const polyStr = c.polygon.length === 2 ?
      `rect(${c.polygon[0].a},${c.polygon[0].b}->${c.polygon[1].a},${c.polygon[1].b})` :
      `poly(${c.polygon.length}pts)`;
    console.log(`${c.command} ${polyStr}${c.label ? ` "${c.label}"` : ''}`);

    const byCategory = {};
    c.actions.forEach(a => {
      if (!byCategory[a.category]) byCategory[a.category] = [];
      byCategory[a.category].push(a);
    });

    Object.entries(byCategory).forEach(([cat, actions]) => {
      console.log(`  ${cat.toUpperCase()}:`);
      actions.forEach(a => console.log(`    [${a.type}] ${a.value}`));
    });
    console.log('');
  });
}

function cmdVars(file, json) {
  const vnd = loadVND(file);
  if (json) { console.log(JSON.stringify(vnd.variables, null, 2)); return; }
  console.log(`VARIABLES (${vnd.variables.length}):`);
  vnd.variables.forEach(v => console.log(`  ${v.name.padEnd(20)} = ${v.value}`));
}

function cmdValidate(file, json) {
  const vnd = loadVND(file);
  const result = validateVND(vnd);

  if (json) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log('VALIDATION REPORT\n');
  console.log('STATS:');
  console.log(`  Scenes: ${result.stats.totalScenes}`);
  console.log(`  Variables: ${result.stats.definedVars} defined, ${result.stats.usedVars} used`);
  console.log(`  Resources: ${result.stats.resources.images} images, ${result.stats.resources.sounds} sounds, ${result.stats.resources.videos} videos, ${result.stats.resources.html} html`);

  if (result.issues.length === 0) {
    console.log('\nNo issues found.');
    return;
  }

  console.log(`\nISSUES (${result.issues.length}):\n`);

  const byType = {};
  result.issues.forEach(i => {
    if (!byType[i.type]) byType[i.type] = [];
    byType[i.type].push(i);
  });

  Object.entries(byType).forEach(([type, issues]) => {
    console.log(`${type} (${issues.length}):`);
    issues.forEach(i => console.log(`  [${i.severity}] ${i.location}: ${i.detail}`));
    console.log('');
  });
}

function cmdSearch(file, pattern, json) {
  const vnd = loadVND(file);
  const regex = new RegExp(pattern, 'i');
  const results = [];

  vnd.scenes.forEach((scene, si) => {
    const check = (source, value) => {
      if (value && regex.test(value)) results.push({ scene: si + 1, sceneName: scene.name, source, value });
    };
    check('field:resource', scene.fields.resource);
    check('field:string3', scene.fields.string3);
    check('field:string4', scene.fields.string4);
    check('field:string6', scene.fields.string6);
    scene.hotspot?.objects.forEach((obj, i) => check(`hotspot:${i}`, obj.string));
    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach((s, si) => check(`C${ci}:${typeName(s.type)}`, s.string));
    });
  });

  if (json) { console.log(JSON.stringify(results, null, 2)); return; }
  console.log(`SEARCH "${pattern}" - ${results.length} results:\n`);
  results.forEach(r => console.log(`Scene ${r.scene} (${r.sceneName}) [${r.source}]: ${r.value}`));
}

function cmdResources(file, type, json) {
  const vnd = loadVND(file);
  const resources = { images: [], sounds: [], videos: [], html: [] };

  vnd.scenes.forEach((scene, si) => {
    const add = (cat, file, source) => {
      if (file && !resources[cat].find(r => r.file.toLowerCase() === file.toLowerCase())) {
        resources[cat].push({ file, scene: si + 1, source });
      }
    };
    if (scene.fields.resource) add('images', scene.fields.resource, 'field');
    if (scene.fields.string3) add('sounds', scene.fields.string3, 'field');
    if (scene.fields.string4 && scene.fields.string4.toLowerCase().includes('.avi')) add('videos', scene.fields.string4, 'field');
    if (scene.fields.string6) add('html', scene.fields.string6, 'field');

    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach(s => {
        if (s.type === 11) add('sounds', s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 9) add('videos', s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 13) add('html', s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 27 || s.type === 10) add('images', s.string.split(/\s+/)[1] || s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 21) {
          if (/playwav\s+(\S+)/i.test(s.string)) add('sounds', s.string.match(/playwav\s+(\S+)/i)[1], `C${ci}:IF`);
          if (/playavi\s+(\S+)/i.test(s.string)) add('videos', s.string.match(/playavi\s+(\S+)/i)[1], `C${ci}:IF`);
          if (/playhtml\s+(\S+)/i.test(s.string)) add('html', s.string.match(/playhtml\s+(\S+)/i)[1], `C${ci}:IF`);
          if (/addbmp\s+\S+\s+(\S+)/i.test(s.string)) add('images', s.string.match(/addbmp\s+\S+\s+(\S+)/i)[1], `C${ci}:IF`);
        }
      });
    });
  });

  if (type) {
    const filtered = resources[type] || [];
    if (json) { console.log(JSON.stringify(filtered, null, 2)); return; }
    console.log(`${type.toUpperCase()} (${filtered.length}):`);
    filtered.forEach(r => console.log(`  ${r.file} [Scene ${r.scene}, ${r.source}]`));
    return;
  }

  if (json) { console.log(JSON.stringify(resources, null, 2)); return; }
  Object.entries(resources).forEach(([cat, items]) => {
    console.log(`\n${cat.toUpperCase()} (${items.length}):`);
    items.forEach(r => console.log(`  ${r.file}`));
  });
}

function cmdConditions(file, sceneFilter, json) {
  const vnd = loadVND(file);
  const conditions = [];

  vnd.scenes.forEach((scene, si) => {
    if (sceneFilter && (si + 1) !== parseInt(sceneFilter)) return;
    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach(s => {
        if (s.type === 21) {
          const parsed = s.string.match(/^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$/i);
          conditions.push({
            scene: si + 1, sceneName: scene.name, command: `C${ci}`,
            interactive: cmd.paramPairs.length > 0,
            condition: parsed ? parsed[1] : s.string,
            thenAction: parsed ? parsed[2] : null,
            elseAction: parsed ? parsed[3] : null,
            raw: s.string
          });
        }
      });
    });
    scene.hotspot?.objects.forEach(obj => {
      if (obj.type === 21) {
        conditions.push({ scene: si + 1, sceneName: scene.name, command: 'hotspot', interactive: false, raw: obj.string });
      }
    });
  });

  if (json) { console.log(JSON.stringify(conditions, null, 2)); return; }
  console.log(`IF CONDITIONS (${conditions.length}):\n`);
  conditions.forEach(c => {
    const mode = c.interactive ? 'CLICK' : 'AUTO';
    console.log(`Scene ${c.scene} ${c.command} [${mode}]:`);
    console.log(`  IF: ${c.condition}`);
    if (c.thenAction) console.log(`  THEN: ${c.thenAction}`);
    if (c.elseAction) console.log(`  ELSE: ${c.elseAction}`);
    console.log('');
  });
}

function cmdFlow(file, startScene, json) {
  const vnd = loadVND(file);
  const start = parseInt(startScene) - 1;
  if (start < 0 || start >= vnd.scenes.length) { console.error(`Scene ${startScene} not found`); process.exit(1); }

  const visited = new Set();
  const edges = [];

  function analyzeScene(idx) {
    if (visited.has(idx)) return;
    visited.add(idx);
    const scene = vnd.scenes[idx];

    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach(s => {
        let target = null;
        let type = 'scene';
        if (s.type === 6) target = parseInt(s.string) - 1;
        if (s.type === 21 && /scene\s+(\d+)/i.test(s.string)) {
          const m = s.string.match(/scene\s+(\d+)/i);
          if (m) target = parseInt(m[1]) - 1;
        }
        if (s.type === 31) type = 'runprj';
        if (s.type === 3) type = 'prev';

        if (target !== null && target >= 0 && target < vnd.scenes.length) {
          edges.push({ from: idx + 1, fromName: scene.name, to: target + 1, toName: vnd.scenes[target].name, command: `C${ci}`, interactive: cmd.paramPairs.length > 0, type });
          analyzeScene(target);
        }
      });
    });
  }

  analyzeScene(start);

  if (json) { console.log(JSON.stringify({ visited: [...visited].map(i => ({ id: i + 1, name: vnd.scenes[i].name })), edges }, null, 2)); return; }

  console.log(`FLOW FROM SCENE ${startScene}:\n`);
  console.log(`Reachable: ${[...visited].map(i => `${i + 1}:${vnd.scenes[i].name || '?'}`).join(', ')}\n`);
  console.log('Transitions:');
  edges.forEach(e => console.log(`  ${e.from} -> ${e.to} [${e.command}, ${e.interactive ? 'click' : 'auto'}]`));
}

function cmdSimulate(file, sceneNum, json) {
  const vnd = loadVND(file);
  const state = new GameState(vnd);
  state.goToScene(parseInt(sceneNum) - 1);

  if (json) {
    console.log(JSON.stringify({
      logs: state.logs,
      vars: state.vars,
      overlays: state.overlays,
      scene: state.currentScene + 1,
      warnings: state.warnings
    }, null, 2));
    return;
  }
  state.logs.forEach(l => console.log(l));
  if (state.warnings.length > 0) {
    console.log('\nWARNINGS:');
    state.warnings.forEach(w => console.log(`  ${w}`));
  }
  console.log('\nSTATE AFTER LOAD:');
  console.log('  Variables (non-zero):');
  Object.entries(state.vars).filter(([k,v]) => v !== 0).forEach(([k,v]) => console.log(`    ${k} = ${v}`));
  if (Object.keys(state.overlays).length > 0) {
    console.log('  Overlays:');
    Object.values(state.overlays).forEach(o => console.log(`    ${o.name}: ${o.file} (${o.visible ? 'visible' : 'hidden'})`));
  }
}

function cmdState(file, sceneNum, actions, json) {
  const vnd = loadVND(file);
  const state = new GameState(vnd);
  state.goToScene(parseInt(sceneNum) - 1);

  if (actions) {
    actions.split(',').forEach(a => {
      const [type, val] = a.split(':');
      if (type === 'click' || type === 'c') state.simulateClick(parseInt(val));
      else if (type === 'set' || type === 's') {
        const [varName, varVal] = val.split('=');
        state.setVar(varName, parseInt(varVal));
      } else if (type === 'scene' || type === 'go') {
        state.goToScene(parseInt(val) - 1);
      }
    });
  }

  const currentState = state.snapshot();
  const possibleActions = state.getPossibleActions();

  if (json) {
    console.log(JSON.stringify({
      current: currentState,
      history: state.stateHistory,
      possibleActions,
      logs: state.logs,
      warnings: state.warnings
    }, null, 2));
    return;
  }

  console.log('EXECUTION LOG:');
  state.logs.forEach(l => console.log(l));

  console.log('\nCURRENT STATE:');
  console.log(`  Scene: ${currentState.scene + 1} (${currentState.sceneName})`);
  console.log('  Variables (non-zero):');
  Object.entries(currentState.vars).filter(([k,v]) => v !== 0).forEach(([k,v]) => console.log(`    ${k} = ${v}`));

  if (Object.keys(currentState.overlays).length > 0) {
    console.log('  Overlays:');
    Object.values(currentState.overlays).forEach(o => console.log(`    ${o.name}: ${o.file} (${o.visible ? 'visible' : 'hidden'})`));
  }

  if (state.stateHistory.length > 1) {
    console.log(`\nSTATE HISTORY (${state.stateHistory.length} snapshots)`);
  }

  console.log('\nPOSSIBLE ACTIONS:');
  possibleActions.forEach(pa => {
    console.log(`  ${pa.command}${pa.hoverText ? ` "${pa.hoverText.match(/\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(.+)/)?.[1] || ''}"` : ''}`);
    const activeActions = pa.actions.filter(a => a.wouldExecute);
    activeActions.forEach(a => {
      const action = a.evaluatedAction || a.value;
      console.log(`    -> ${action}`);
    });
  });
}

function cmdDiff(file, sceneNum, action, json) {
  const vnd = loadVND(file);

  const stateBefore = new GameState(vnd);
  stateBefore.goToScene(parseInt(sceneNum) - 1);
  const snapshotBefore = stateBefore.snapshot();

  const stateAfter = new GameState(vnd);
  stateAfter.goToScene(parseInt(sceneNum) - 1);

  const [type, val] = action.split(':');
  if (type === 'click' || type === 'c') {
    stateAfter.simulateClick(parseInt(val));
  }
  const snapshotAfter = stateAfter.snapshot();

  const diff = {
    sceneBefore: snapshotBefore.scene + 1,
    sceneAfter: snapshotAfter.scene + 1,
    sceneChanged: snapshotBefore.scene !== snapshotAfter.scene,
    varsChanged: {},
    overlaysAdded: [],
    overlaysRemoved: [],
    overlaysVisibilityChanged: []
  };

  // Compare variables
  const allVars = new Set([...Object.keys(snapshotBefore.vars), ...Object.keys(snapshotAfter.vars)]);
  allVars.forEach(v => {
    const before = snapshotBefore.vars[v] || 0;
    const after = snapshotAfter.vars[v] || 0;
    if (before !== after) {
      diff.varsChanged[v] = { before, after };
    }
  });

  // Compare overlays
  const beforeOverlays = new Set(Object.keys(snapshotBefore.overlays));
  const afterOverlays = new Set(Object.keys(snapshotAfter.overlays));

  afterOverlays.forEach(o => {
    if (!beforeOverlays.has(o)) diff.overlaysAdded.push(o);
  });
  beforeOverlays.forEach(o => {
    if (!afterOverlays.has(o)) diff.overlaysRemoved.push(o);
    else if (snapshotBefore.overlays[o].visible !== snapshotAfter.overlays[o].visible) {
      diff.overlaysVisibilityChanged.push({ name: o, visible: snapshotAfter.overlays[o].visible });
    }
  });

  if (json) { console.log(JSON.stringify(diff, null, 2)); return; }

  console.log(`DIFF: Scene ${sceneNum} + ${action}\n`);

  if (diff.sceneChanged) {
    console.log(`SCENE: ${diff.sceneBefore} -> ${diff.sceneAfter}`);
  }

  if (Object.keys(diff.varsChanged).length > 0) {
    console.log('\nVARIABLES CHANGED:');
    Object.entries(diff.varsChanged).forEach(([v, change]) => {
      console.log(`  ${v}: ${change.before} -> ${change.after}`);
    });
  }

  if (diff.overlaysAdded.length > 0) {
    console.log('\nOVERLAYS ADDED:');
    diff.overlaysAdded.forEach(o => console.log(`  + ${o}`));
  }

  if (diff.overlaysRemoved.length > 0) {
    console.log('\nOVERLAYS REMOVED:');
    diff.overlaysRemoved.forEach(o => console.log(`  - ${o}`));
  }

  if (diff.overlaysVisibilityChanged.length > 0) {
    console.log('\nOVERLAYS VISIBILITY CHANGED:');
    diff.overlaysVisibilityChanged.forEach(o => console.log(`  ${o.name}: ${o.visible ? 'shown' : 'hidden'}`));
  }

  if (!diff.sceneChanged && Object.keys(diff.varsChanged).length === 0 &&
      diff.overlaysAdded.length === 0 && diff.overlaysRemoved.length === 0 &&
      diff.overlaysVisibilityChanged.length === 0) {
    console.log('No changes detected.');
  }
}

// =============================================================================
// MAIN
// =============================================================================

function printUsage() {
  console.log(`
VND Debug CLI - Complete Virtual Navigator Debug Tool

USAGE: node vnd-debug.js <command> [options]

PARSING & INFO:
  parse <file>                     Show parsing steps
  info <file>                      Show VND file info
  scenes <file>                    List all scenes
  scene <file> <n>                 Show scene details
  vars <file>                      List variables
  validate <file>                  Check for issues

ELEMENTS & POSITIONS:
  elements <file> <n>              List all elements with positions
  hover <file> <n>                 Show hover effects only
  click <file> <n>                 Show click actions only

RESOURCES:
  resources <file> [type]          List resources (images/sounds/videos/html)
  search <file> <pattern>          Search in commands

LOGIC:
  conditions <file> [scene]        List IF conditions
  flow <file> <scene>              Analyze scene transitions

SIMULATION:
  simulate <file> <scene>          Simulate scene load
  state <file> <scene> [actions]   Full state with history
  diff <file> <scene> <action>     Compare before/after action

ACTIONS FORMAT: click:N, set:var=val, scene:N (comma-separated)

OPTIONS:
  --json                           Output as JSON

EXAMPLES:
  node vnd-debug.js parse couleurs1.vnd
  node vnd-debug.js validate couleurs1.vnd
  node vnd-debug.js elements couleurs1.vnd 1
  node vnd-debug.js hover italie.vnd 27
  node vnd-debug.js click couleurs1.vnd 35
  node vnd-debug.js state couleurs1.vnd 35 "set:bonus1=1,click:0"
  node vnd-debug.js diff couleurs1.vnd 35 "click:0"
`);
}

const args = process.argv.slice(2);
if (args.length === 0) { printUsage(); process.exit(0); }

const json = args.includes('--json');
const cleanArgs = args.filter(a => a !== '--json');
const [cmd, file, ...rest] = cleanArgs;

const commands = {
  parse: () => cmdParse(file, json),
  info: () => cmdInfo(file, json),
  scenes: () => cmdScenes(file, json),
  scene: () => cmdScene(file, rest[0], json),
  vars: () => cmdVars(file, json),
  validate: () => cmdValidate(file, json),
  elements: () => cmdElements(file, rest[0], json),
  hover: () => cmdHover(file, rest[0], json),
  click: () => cmdClick(file, rest[0], json),
  resources: () => cmdResources(file, rest[0], json),
  videos: () => cmdResources(file, 'videos', json),
  search: () => cmdSearch(file, rest[0], json),
  conditions: () => cmdConditions(file, rest[0], json),
  flow: () => cmdFlow(file, rest[0], json),
  simulate: () => cmdSimulate(file, rest[0], json),
  state: () => cmdState(file, rest[0], rest[1], json),
  diff: () => cmdDiff(file, rest[0], rest[1], json),
  run: () => cmdState(file, rest[0], rest[1], json) // Alias
};

if (!commands[cmd]) { console.error(`Unknown command: ${cmd}`); printUsage(); process.exit(1); }
if (!file) { console.error('Missing file argument'); process.exit(1); }
commands[cmd]();
