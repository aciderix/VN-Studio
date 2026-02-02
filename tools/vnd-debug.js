#!/usr/bin/env node
/**
 * VND Debug CLI - Virtual Navigator Debug Tool
 * Analyse, inspect and debug VND game files without GUI
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// VND PARSER
// =============================================================================

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

function readScene(buf, p, sv) {
  const nameBS = readBS(buf, p); if (!nameBS) return null; p += nameBS.l;
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
  const rect = { left: buf.readInt32LE(p), top: buf.readInt32LE(p+4), right: buf.readInt32LE(p+8), bottom: buf.readInt32LE(p+12) }; p += 16;
  p += 4; // val6
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
  }
  const cmdListValue = buf.readInt32LE(p); p += 4;
  if (cmdListValue !== 0) p += 20;
  const contentCol = readContentCollection(buf, p, sv);
  p = contentCol.endPos;
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

function parseVND(buf) {
  let p = 5;
  const magic = readBS(buf, p); p += magic.l;
  if (magic.s !== 'VNFILE') throw new Error('Invalid magic: ' + magic.s);
  const version = readBS(buf, p); p += version.l;
  const sceneCount = buf.readUInt32LE(p); p += 4;
  const projectName = readBS(buf, p); p += projectName.l;
  const editor = readBS(buf, p); p += editor.l;
  const serial = readBS(buf, p); p += serial.l;
  const projectIDStr = readBS(buf, p); p += projectIDStr.l;
  const registry = readBS(buf, p); p += registry.l;
  const width = buf.readUInt32LE(p); p += 4;
  const height = buf.readUInt32LE(p); p += 4;
  const depth = buf.readUInt32LE(p); p += 4;
  p += 16; // flags + reserved
  const dllPath = readBS(buf, p); p += dllPath.l;
  const varCount = buf.readUInt32LE(p); p += 4;
  const vars = [];
  for (let vi = 0; vi < varCount; vi++) {
    const vname = readBS(buf, p); p += vname.l;
    const vval = buf.readUInt32LE(p); p += 4;
    vars.push({ name: vname.s, value: vval });
  }
  const vp = version.s.split('.');
  const sv = (parseInt(vp[0]) << 16) | parseInt(vp[1] || '0');
  const scenes = [];
  for (let si = 0; si < sceneCount; si++) {
    const scene = readScene(buf, p, sv);
    if (!scene) break;
    scenes.push(scene); p = scene.endPos;
  }
  return { header: { magic: magic.s, version: version.s, sceneCount, projectName: projectName.s, editor: editor.s, width, height, depth }, variables: vars, scenes, bytesRemaining: buf.length - p };
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
// GAME STATE SIMULATOR
// =============================================================================

class GameState {
  constructor(vnd) {
    this.vnd = vnd;
    this.vars = {};
    this.sceneHistory = [];
    this.currentScene = -1;
    this.logs = [];
    vnd.variables.forEach(v => { this.vars[v.name.toLowerCase()] = v.value; });
  }

  log(msg) { this.logs.push(msg); }
  getVar(name) { return this.vars[name.toLowerCase()] || 0; }
  setVar(name, val) {
    const old = this.getVar(name);
    this.vars[name.toLowerCase()] = val;
    if (old !== val) this.log(`  VAR ${name}: ${old} -> ${val}`);
  }

  evalCondition(cond) {
    const m = cond.match(/(\w+)\s*([<>=!]+)\s*(\d+)/);
    if (!m) return false;
    const [, varName, op, valStr] = m;
    const varVal = this.getVar(varName);
    const val = parseInt(valStr);
    switch (op) {
      case '=': case '==': return varVal === val;
      case '<': return varVal < val;
      case '>': return varVal > val;
      case '<=': return varVal <= val;
      case '>=': return varVal >= val;
      case '!=': case '<>': return varVal !== val;
      default: return false;
    }
  }

  parseIf(str) {
    const m = str.match(/^if\s+(.+?)\s+then\s+(.+?)(?:\s+else\s+(.+))?$/i);
    if (!m) return null;
    return { condition: m[1], thenAction: m[2], elseAction: m[3] || null };
  }

  executeAction(action) {
    const parts = action.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    if (cmd === 'set_var') this.setVar(parts[1], parseInt(parts[2]) || 0);
    else if (cmd === 'inc_var') this.setVar(parts[1], this.getVar(parts[1]) + (parseInt(parts[2]) || 1));
    else if (cmd === 'dec_var') this.setVar(parts[1], this.getVar(parts[1]) - (parseInt(parts[2]) || 1));
    else if (cmd === 'scene') return { nav: 'scene', target: parts[1] };
    else if (cmd === 'runprj') return { nav: 'runprj', target: parts.slice(1).join(' ') };
    else if (cmd === 'prev') return { nav: 'prev' };
    else if (cmd === 'playavi') this.log(`  PLAY VIDEO: ${parts.slice(1).join(' ')}`);
    else if (cmd === 'playwav') this.log(`  PLAY AUDIO: ${parts.slice(1).join(' ')}`);
    else if (cmd === 'playhtml') this.log(`  SHOW HTML: ${parts.slice(1).join(' ')}`);
    else if (cmd === 'addbmp') this.log(`  ADD IMAGE: ${parts.slice(1).join(' ')}`);
    else if (cmd === 'delbmp') this.log(`  DEL IMAGE: ${parts[1]}`);
    return null;
  }

  goToScene(idx) {
    if (idx < 0 || idx >= this.vnd.scenes.length) return;
    this.sceneHistory.push(this.currentScene);
    this.currentScene = idx;
    const scene = this.vnd.scenes[idx];
    this.log(`\n=== ENTER SCENE ${idx + 1}: ${scene.name} ===`);
    if (scene.fields.resource) this.log(`  LOAD BG: ${scene.fields.resource}`);
    if (scene.fields.string3) this.log(`  PLAY WAV: ${scene.fields.string3} (loops=${scene.fields.val2})`);
    if (scene.fields.string6) this.log(`  LOAD HTM: ${scene.fields.string6}`);

    // Execute auto commands
    scene.commands.forEach((cmd, ci) => {
      if (cmd.paramPairs.length > 0) return;
      cmd.strings.forEach(s => {
        if ([6, 38, 39, 3, 7].includes(s.type)) return;
        if (s.type === 21) {
          const parsed = this.parseIf(s.string);
          if (parsed && this.evalCondition(parsed.condition)) {
            this.log(`  IF ${parsed.condition} -> TRUE`);
            this.executeAction(parsed.thenAction);
          }
        } else if (s.type === 11) this.log(`  PLAY WAV: ${s.string}`);
        else if (s.type === 9) this.log(`  PLAY AVI: ${s.string}`);
        else if (s.type === 27) this.log(`  ADD BMP: ${s.string}`);
        else if (s.type === 22) { const p = s.string.split(/\s+/); this.setVar(p[0], parseInt(p[1]) || 0); }
        else if (s.type === 23) { const p = s.string.split(/\s+/); this.setVar(p[0], this.getVar(p[0]) + (parseInt(p[1]) || 1)); }
        else if (s.type === 24) { const p = s.string.split(/\s+/); this.setVar(p[0], this.getVar(p[0]) - (parseInt(p[1]) || 1)); }
      });
    });
  }

  simulateClick(cmdIdx) {
    const scene = this.vnd.scenes[this.currentScene];
    if (!scene || cmdIdx >= scene.commands.length) return null;
    const cmd = scene.commands[cmdIdx];
    if (cmd.paramPairs.length === 0) return null;

    this.log(`\n>>> CLICK on C${cmdIdx}`);
    let navigation = null;

    cmd.strings.forEach(s => {
      if (s.type === 21) {
        const parsed = this.parseIf(s.string);
        if (parsed && this.evalCondition(parsed.condition)) {
          this.log(`  IF ${parsed.condition} -> TRUE`);
          const result = this.executeAction(parsed.thenAction);
          if (result) navigation = result;
        }
      } else if (s.type === 6) navigation = { nav: 'scene', target: s.string };
      else if (s.type === 3) navigation = { nav: 'prev' };
      else if (s.type === 31) navigation = { nav: 'runprj', target: s.string };
      else if (s.type === 9) this.log(`  PLAY AVI: ${s.string}`);
      else if (s.type === 11) this.log(`  PLAY WAV: ${s.string}`);
      else if (s.type === 22) { const p = s.string.split(/\s+/); this.setVar(p[0], parseInt(p[1]) || 0); }
      else if (s.type === 23) { const p = s.string.split(/\s+/); this.setVar(p[0], this.getVar(p[0]) + (parseInt(p[1]) || 1)); }
      else if (s.type === 24) { const p = s.string.split(/\s+/); this.setVar(p[0], this.getVar(p[0]) - (parseInt(p[1]) || 1)); }
      else if (s.type === 27) this.log(`  ADD BMP: ${s.string}`);
      else if (s.type === 28) this.log(`  DEL BMP: ${s.string}`);
    });

    if (navigation) {
      this.log(`  NAVIGATE: ${navigation.nav} ${navigation.target || ''}`);
      if (navigation.nav === 'scene') {
        const idx = parseInt(navigation.target) - 1;
        if (!isNaN(idx)) this.goToScene(idx);
      } else if (navigation.nav === 'prev' && this.sceneHistory.length > 0) {
        this.goToScene(this.sceneHistory.pop());
      }
    }
    return navigation;
  }
}

// =============================================================================
// CLI COMMANDS
// =============================================================================

function loadVND(filePath) {
  if (!fs.existsSync(filePath)) { console.error(`Error: File not found: ${filePath}`); process.exit(1); }
  try { return parseVND(fs.readFileSync(filePath)); }
  catch (e) { console.error(`Error parsing VND: ${e.message}`); process.exit(1); }
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
    hasVideo: s.commands.some(c => c.strings.some(st => st.type === 9)) || (s.fields.string4 || '').toLowerCase().includes('.avi'),
    hasHotspot: s.hotspot !== null,
    hasHtml: !!s.fields.string6,
    resource: s.fields.resource
  }));
  if (json) { console.log(JSON.stringify(scenes, null, 2)); return; }
  scenes.forEach(s => {
    const flags = [s.hasVideo ? 'VIDEO' : '', s.hasHotspot ? 'HOTSPOT' : '', s.hasHtml ? 'HTM' : ''].filter(Boolean).join(',');
    console.log(`${String(s.id).padStart(3)}. ${s.name.padEnd(25)} cmds=${s.commands} polys=${s.polygons} ${flags ? `[${flags}]` : ''}`);
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
      polygon: cmd.paramPairs.length > 0 ? (cmd.paramPairs.length === 2 ?
        `rect(${cmd.paramPairs[0].a},${cmd.paramPairs[0].b}->${cmd.paramPairs[1].a},${cmd.paramPairs[1].b})` :
        `poly(${cmd.paramPairs.length}pts)`) : null,
      strings: cmd.strings.map(s => ({ type: s.type, typeName: typeName(s.type), value: s.string }))
    }))
  };

  if (json) { console.log(JSON.stringify(data, null, 2)); return; }

  console.log(`\n=== SCENE ${data.id}: ${data.name} ===\n`);
  console.log('FIELDS:');
  if (scene.fields.resource) console.log(`  resource: ${scene.fields.resource}`);
  if (scene.fields.string3) console.log(`  string3 (WAV): ${scene.fields.string3} loops=${scene.fields.val2}`);
  if (scene.fields.string4) console.log(`  string4 (AVI): ${scene.fields.string4} flags=${scene.fields.val3}`);
  if (scene.fields.string6) console.log(`  string6 (HTM): ${scene.fields.string6}`);
  console.log(`  rect: ${scene.rect.left},${scene.rect.top} -> ${scene.rect.right},${scene.rect.bottom}`);

  if (scene.hotspot) {
    console.log(`\nHOTSPOT (timer=${scene.hotspot.timerValue}ms):`);
    scene.hotspot.objects.forEach(obj => console.log(`  [${typeName(obj.type)}] ${obj.string}`));
  }

  console.log(`\nCOMMANDS (${scene.commands.length}):`);
  data.commands.forEach(cmd => {
    const mode = cmd.interactive ? 'INTERACTIVE' : 'AUTO';
    console.log(`\n${cmd.id} [${mode}] ${cmd.polygon || ''}`);
    cmd.strings.forEach(s => console.log(`  [${s.typeName.padEnd(10)}] ${s.value}`));
  });
}

function cmdVars(file, json) {
  const vnd = loadVND(file);
  if (json) { console.log(JSON.stringify(vnd.variables, null, 2)); return; }
  console.log(`VARIABLES (${vnd.variables.length}):`);
  vnd.variables.forEach(v => console.log(`  ${v.name.padEnd(20)} = ${v.value}`));
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
    if (scene.fields.resource) add('images', scene.fields.resource, 'field:resource');
    if (scene.fields.string3) add('sounds', scene.fields.string3, 'field:string3');
    if (scene.fields.string4 && scene.fields.string4.toLowerCase().includes('.avi')) add('videos', scene.fields.string4, 'field:string4');
    if (scene.fields.string6) add('html', scene.fields.string6, 'field:string6');

    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach(s => {
        if (s.type === 11) add('sounds', s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 9) add('videos', s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 13) add('html', s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 27 || s.type === 10) add('images', s.string.split(/\s+/)[1] || s.string.split(/\s+/)[0], `C${ci}`);
        if (s.type === 21) {
          const str = s.string.toLowerCase();
          if (str.includes('playwav')) { const m = s.string.match(/playwav\s+(\S+)/i); if (m) add('sounds', m[1], `C${ci}:IF`); }
          if (str.includes('playavi')) { const m = s.string.match(/playavi\s+(\S+)/i); if (m) add('videos', m[1], `C${ci}:IF`); }
          if (str.includes('playhtml')) { const m = s.string.match(/playhtml\s+(\S+)/i); if (m) add('html', m[1], `C${ci}:IF`); }
          if (str.includes('addbmp')) { const m = s.string.match(/addbmp\s+\S+\s+(\S+)/i); if (m) add('images', m[1], `C${ci}:IF`); }
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

function cmdVideos(file, json) { cmdResources(file, 'videos', json); }

function cmdConditions(file, sceneFilter, json) {
  const vnd = loadVND(file);
  const conditions = [];

  vnd.scenes.forEach((scene, si) => {
    if (sceneFilter && (si + 1) !== parseInt(sceneFilter)) return;
    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach(s => {
        if (s.type === 21) {
          conditions.push({
            scene: si + 1, sceneName: scene.name, command: `C${ci}`,
            interactive: cmd.paramPairs.length > 0, condition: s.string
          });
        }
      });
    });
    scene.hotspot?.objects.forEach(obj => {
      if (obj.type === 21) {
        conditions.push({ scene: si + 1, sceneName: scene.name, command: 'hotspot', interactive: false, condition: obj.string });
      }
    });
  });

  if (json) { console.log(JSON.stringify(conditions, null, 2)); return; }
  console.log(`IF CONDITIONS (${conditions.length}):\n`);
  conditions.forEach(c => {
    const mode = c.interactive ? 'CLICK' : 'AUTO';
    console.log(`Scene ${c.scene} ${c.command} [${mode}]: ${c.condition}`);
  });
}

function cmdSimulate(file, sceneNum, json) {
  const vnd = loadVND(file);
  const state = new GameState(vnd);
  state.goToScene(parseInt(sceneNum) - 1);

  if (json) {
    console.log(JSON.stringify({ logs: state.logs, vars: state.vars, scene: state.currentScene + 1 }, null, 2));
    return;
  }
  state.logs.forEach(l => console.log(l));
  console.log('\nVARIABLES AFTER LOAD:');
  Object.entries(state.vars).filter(([k,v]) => v !== 0).forEach(([k,v]) => console.log(`  ${k} = ${v}`));
}

function cmdTrace(file, sceneNum, cmdFilter, json) {
  const vnd = loadVND(file);
  const idx = parseInt(sceneNum) - 1;
  if (idx < 0 || idx >= vnd.scenes.length) { console.error(`Scene ${sceneNum} not found`); process.exit(1); }
  const scene = vnd.scenes[idx];

  const interactions = scene.commands
    .map((cmd, ci) => {
      if (cmd.paramPairs.length === 0) return null;
      if (cmdFilter && ci !== parseInt(cmdFilter)) return null;
      return {
        command: `C${ci}`,
        polygon: cmd.paramPairs.length === 2 ?
          `rect(${cmd.paramPairs[0].a},${cmd.paramPairs[0].b}->${cmd.paramPairs[1].a},${cmd.paramPairs[1].b})` :
          `poly(${cmd.paramPairs.length}pts)`,
        hoverText: cmd.strings.find(s => s.type === 38)?.string.match(/\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(.+)/)?.[1] || null,
        actions: cmd.strings.filter(s => ![38, 39].includes(s.type)).map(s => ({
          type: typeName(s.type), value: s.string,
          isNav: [3, 6, 31].includes(s.type) || (s.type === 21 && /\b(scene|runprj|prev)\b/i.test(s.string)),
          isVideo: s.type === 9 || (s.type === 21 && /playavi/i.test(s.string)),
          isConditional: s.type === 21
        }))
      };
    })
    .filter(Boolean);

  if (json) { console.log(JSON.stringify(interactions, null, 2)); return; }

  console.log(`\nINTERACTIONS IN SCENE ${sceneNum} (${scene.name}):\n`);
  interactions.forEach(int => {
    console.log(`${int.command} ${int.polygon}${int.hoverText ? ` "${int.hoverText}"` : ''}`);
    console.log('  On click:');
    int.actions.forEach((a, i) => {
      const flags = [a.isVideo ? 'VIDEO' : '', a.isNav ? 'NAV' : '', a.isConditional ? 'COND' : ''].filter(Boolean).join(',');
      console.log(`    ${i + 1}. [${a.type}]${flags ? ` {${flags}}` : ''} ${a.value}`);
    });
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
        if (s.type === 6) target = parseInt(s.string) - 1;
        if (s.type === 21 && /scene\s+(\d+)/i.test(s.string)) {
          const m = s.string.match(/scene\s+(\d+)/i);
          if (m) target = parseInt(m[1]) - 1;
        }
        if (target !== null && target >= 0 && target < vnd.scenes.length) {
          edges.push({ from: idx + 1, to: target + 1, command: `C${ci}`, interactive: cmd.paramPairs.length > 0 });
          analyzeScene(target);
        }
      });
    });
  }

  analyzeScene(start);

  if (json) { console.log(JSON.stringify({ visited: [...visited].map(i => i + 1), edges }, null, 2)); return; }

  console.log(`FLOW FROM SCENE ${startScene}:\n`);
  console.log(`Reachable scenes: ${[...visited].map(i => i + 1).join(', ')}\n`);
  console.log('Transitions:');
  edges.forEach(e => {
    const mode = e.interactive ? 'click' : 'auto';
    console.log(`  ${e.from} -> ${e.to} [${e.command}, ${mode}]`);
  });
}

function cmdRun(file, startScene, actions) {
  const vnd = loadVND(file);
  const state = new GameState(vnd);
  state.goToScene(parseInt(startScene) - 1);

  if (actions) {
    actions.split(',').forEach(a => {
      const [type, val] = a.split(':');
      if (type === 'click' || type === 'c') {
        state.simulateClick(parseInt(val));
      } else if (type === 'set' || type === 's') {
        const [varName, varVal] = val.split('=');
        state.setVar(varName, parseInt(varVal));
      }
    });
  }

  state.logs.forEach(l => console.log(l));
  console.log('\nFINAL STATE:');
  console.log(`  Scene: ${state.currentScene + 1} (${vnd.scenes[state.currentScene]?.name || 'unknown'})`);
  console.log('  Variables (non-zero):');
  Object.entries(state.vars).filter(([k,v]) => v !== 0).forEach(([k,v]) => console.log(`    ${k} = ${v}`));
}

// =============================================================================
// MAIN
// =============================================================================

function printUsage() {
  console.log(`
VND Debug CLI - Virtual Navigator Debug Tool

USAGE: node vnd-debug.js <command> [options]

PARSING & INFO:
  info <file>                      Show VND file info
  scenes <file>                    List all scenes
  scene <file> <n>                 Show scene N details
  vars <file>                      List all variables

RESOURCES:
  resources <file> [type]          List resources (images/sounds/videos/html)
  videos <file>                    List all videos
  search <file> <pattern>          Search in commands

LOGIC & CONDITIONS:
  conditions <file> [scene]        List IF conditions
  flow <file> <scene>              Analyze scene flow/transitions

SIMULATION:
  simulate <file> <scene>          Simulate scene load
  trace <file> <scene> [cmd]       Trace interactions
  run <file> <scene> [actions]     Run with actions (click:N,set:var=val)

OPTIONS:
  --json                           Output as JSON

EXAMPLES:
  node vnd-debug.js scene couleurs1.vnd 27
  node vnd-debug.js search couleurs1.vnd "home2.avi"
  node vnd-debug.js trace italie.vnd 27
  node vnd-debug.js run couleurs1.vnd 35 "click:0"
  node vnd-debug.js flow couleurs1.vnd 1 --json
`);
}

const args = process.argv.slice(2);
if (args.length === 0) { printUsage(); process.exit(0); }

const json = args.includes('--json');
const cleanArgs = args.filter(a => a !== '--json');
const [cmd, file, ...rest] = cleanArgs;

const commands = {
  info: () => cmdInfo(file, json),
  scenes: () => cmdScenes(file, json),
  scene: () => cmdScene(file, rest[0], json),
  vars: () => cmdVars(file, json),
  resources: () => cmdResources(file, rest[0], json),
  videos: () => cmdVideos(file, json),
  search: () => cmdSearch(file, rest[0], json),
  conditions: () => cmdConditions(file, rest[0], json),
  flow: () => cmdFlow(file, rest[0], json),
  simulate: () => cmdSimulate(file, rest[0], json),
  trace: () => cmdTrace(file, rest[0], rest[1], json),
  run: () => cmdRun(file, rest[0], rest[1])
};

if (!commands[cmd]) { console.error(`Unknown command: ${cmd}`); printUsage(); process.exit(1); }
if (!file) { console.error('Missing file argument'); process.exit(1); }
commands[cmd]();
