#!/usr/bin/env node
/**
 * VND Debug CLI - Virtual Navigator Debug Tool
 * Analyse, inspect and debug VND game files without GUI
 *
 * Usage:
 *   node vnd-debug.js <command> [options]
 *
 * Commands:
 *   info <file.vnd>              - Show VND file info (header, scene count, variables)
 *   scenes <file.vnd>            - List all scenes with summary
 *   scene <file.vnd> <n>         - Show detailed scene info (1-indexed)
 *   cmd <file.vnd> <scene> <cmd> - Show command details
 *   vars <file.vnd>              - List all variables
 *   search <file.vnd> <pattern>  - Search in commands/strings
 *   simulate <file.vnd> <scene>  - Simulate scene load and show what happens
 *   trace <file.vnd> <scene>     - Trace all possible interactions
 *   videos <file.vnd>            - Find all video references
 *   conditions <file.vnd>        - List all IF conditions
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// VND PARSER (ported from browser JS)
// =============================================================================

function readBS(buf, p) {
  if (p + 4 > buf.length) return null;
  var len = buf.readUInt32LE(p);
  if (len === 0 || len > 10000 || p + 4 + len > buf.length) {
    return { s: '', l: 4 };
  }
  var str = buf.slice(p + 4, p + 4 + len).toString('latin1');
  return { s: str, l: 4 + len };
}

function readObject(buf, p) {
  var type = buf.readUInt32LE(p); p += 4;
  var bs = readBS(buf, p);
  var str = bs ? bs.s : '';
  p += bs ? bs.l : 4;
  return { type: type, string: str, endPos: p };
}

function readStringCollection(buf, p) {
  var count = buf.readUInt32LE(p); p += 4;
  var items = [];
  for (var i = 0; i < count; i++) {
    var subIndex = buf.readUInt32LE(p); p += 4;
    var obj = readObject(buf, p);
    items.push({ subIndex: subIndex, type: obj.type, string: obj.string });
    p = obj.endPos;
  }
  return { items: items, endPos: p };
}

function readCommand(buf, p, streamVersion) {
  var strCol = readStringCollection(buf, p);
  p = strCol.endPos;
  var commandType = buf.readUInt32LE(p); p += 4;
  var paramPairCount = buf.readUInt32LE(p); p += 4;
  var paramPairs = [];
  if (paramPairCount > 0 && paramPairCount < 10000) {
    for (var i = 0; i < paramPairCount; i++) {
      var a = buf.readInt32LE(p); p += 4;
      var b = buf.readInt32LE(p); p += 4;
      paramPairs.push({ a: a, b: b });
    }
  }
  var flags = 0;
  if (streamVersion >= 0x2000c) {
    flags = buf.readUInt32LE(p); p += 4;
  }
  return { strings: strCol.items, commandType: commandType, paramPairCount: paramPairCount, paramPairs: paramPairs, flags: flags, endPos: p };
}

function readContentCollection(buf, p, sv) {
  var count = buf.readUInt32LE(p); p += 4;
  var cmds = [];
  for (var i = 0; i < count; i++) {
    var cmd = readCommand(buf, p, sv);
    cmds.push(cmd); p = cmd.endPos;
  }
  return { commands: cmds, endPos: p };
}

function readScene(buf, p, sv) {
  var nameBS = readBS(buf, p); if (!nameBS) return null; p += nameBS.l;
  var flagBytes = []; for (var fb = 0; fb < 4; fb++) flagBytes.push(buf[p + fb]); p += 4;
  var prop1 = buf.readUInt32LE(p); p += 4;
  var prop2 = buf.readUInt32LE(p); p += 4;
  var prop3 = buf.readUInt32LE(p); p += 4;

  var s1 = readBS(buf, p); p += s1 ? s1.l : 4;
  var s2 = readBS(buf, p); p += s2 ? s2.l : 4;
  var val1 = buf.readUInt32LE(p); p += 4;
  var s3 = readBS(buf, p); p += s3 ? s3.l : 4;
  var val2 = buf.readUInt32LE(p); p += 4;
  var s4 = readBS(buf, p); p += s4 ? s4.l : 4;
  var val3 = buf.readUInt32LE(p); p += 4;
  var s5 = readBS(buf, p); p += s5 ? s5.l : 4;
  var val4 = buf.readUInt32LE(p); p += 4;
  var s6 = readBS(buf, p); p += s6 ? s6.l : 4;
  var val5 = buf.readUInt32LE(p); p += 4;

  var rect = {
    left: buf.readInt32LE(p), top: buf.readInt32LE(p+4),
    right: buf.readInt32LE(p+8), bottom: buf.readInt32LE(p+12)
  }; p += 16;

  buf.readUInt32LE(p); p += 4; // val6

  var hotspotCount = buf.readUInt32LE(p); p += 4;
  var hotspot = null;
  if (hotspotCount > 0) {
    var timerValue = buf.readUInt32LE(p); p += 4;
    var collCount = buf.readUInt32LE(p); p += 4;
    var objects = [];
    for (var hi = 0; hi < collCount; hi++) {
      var obj = readObject(buf, p);
      objects.push({ type: obj.type, string: obj.string });
      p = obj.endPos;
    }
    hotspot = { timerValue: timerValue, objects: objects };
  }

  var cmdListValue = buf.readInt32LE(p); p += 4;
  var cmdListData = [];
  if (cmdListValue !== 0) {
    for (var ci = 0; ci < 5; ci++) { cmdListData.push(buf.readUInt32LE(p)); p += 4; }
  }

  var contentCol = readContentCollection(buf, p, sv);
  p = contentCol.endPos;

  return {
    name: nameBS.s, flagBytes: flagBytes, prop1: prop1, prop2: prop2, prop3: prop3,
    fields: {
      string1: s1 ? s1.s : '', string2: s2 ? s2.s : '', val1: val1,
      string3: s3 ? s3.s : '', val2: val2, string4: s4 ? s4.s : '', val3: val3,
      resource: s5 ? s5.s : '', val4: val4, string6: s6 ? s6.s : '', val5: val5
    },
    rect: rect, hotspotCount: hotspotCount, hotspot: hotspot,
    cmdListValue: cmdListValue, cmdListData: cmdListData,
    commands: contentCol.commands, endPos: p
  };
}

function parseVND(buf) {
  var p = 5; // skip stream header

  var magic = readBS(buf, p); p += magic.l;
  if (magic.s !== 'VNFILE') throw new Error('Invalid magic: ' + magic.s);
  var version = readBS(buf, p); p += version.l;
  var sceneCount = buf.readUInt32LE(p); p += 4;
  var projectName = readBS(buf, p); p += projectName.l;
  var editor = readBS(buf, p); p += editor.l;
  var serial = readBS(buf, p); p += serial.l;
  var projectIDStr = readBS(buf, p); p += projectIDStr.l;
  var registry = readBS(buf, p); p += registry.l;
  var width = buf.readUInt32LE(p); p += 4;
  var height = buf.readUInt32LE(p); p += 4;
  var depth = buf.readUInt32LE(p); p += 4;
  var flag = buf.readUInt32LE(p); p += 4;
  var u1 = buf.readUInt32LE(p); p += 4;
  var u2 = buf.readUInt32LE(p); p += 4;
  var reserved = buf.readUInt32LE(p); p += 4;
  var dllPath = readBS(buf, p); p += dllPath.l;
  var varCount = buf.readUInt32LE(p); p += 4;

  var vars = [];
  for (var vi = 0; vi < varCount; vi++) {
    var vname = readBS(buf, p); p += vname.l;
    var vval = buf.readUInt32LE(p); p += 4;
    vars.push({ name: vname.s, value: vval });
  }

  var vp = version.s.split('.');
  var sv = (parseInt(vp[0]) << 16) | parseInt(vp[1] || '0');

  var scenes = [];
  for (var si = 0; si < sceneCount; si++) {
    var scene = readScene(buf, p, sv);
    if (!scene) break;
    scenes.push(scene); p = scene.endPos;
  }

  return {
    header: {
      magic: magic.s, version: version.s, sceneCount: sceneCount,
      projectName: projectName.s, editor: editor.s,
      width: width, height: height, depth: depth
    },
    variables: vars, scenes: scenes,
    bytesRemaining: buf.length - p
  };
}

// =============================================================================
// COMMAND TYPE NAMES
// =============================================================================

const CMD_NAMES = {
  0:'QUIT', 1:'ABOUT', 2:'PREFS', 3:'PREV', 4:'NEXT', 5:'ZOOM',
  6:'SCENE', 7:'HOTSPOT', 8:'TIPTEXT', 9:'PLAYAVI', 10:'PLAYBMP',
  11:'PLAYWAV', 12:'PLAYMID', 13:'PLAYHTML', 14:'ZOOMIN', 15:'ZOOMOUT',
  16:'PAUSE', 17:'EXEC', 18:'EXPLORE', 19:'PLAYCDA', 20:'PLAYSEQ',
  21:'IF', 22:'SET_VAR', 23:'INC_VAR', 24:'DEC_VAR', 25:'INVALIDATE',
  26:'DEFCURSOR', 27:'ADDBMP', 28:'DELBMP', 29:'SHOWBMP', 30:'HIDEBMP',
  31:'RUNPRJ', 32:'UPDATE', 33:'RUNDLL', 34:'MSGBOX', 35:'PLAYCMD',
  36:'CLOSEWAV', 37:'CLOSEDLL', 38:'PLAYTEXT', 39:'FONT', 40:'REM',
  41:'ADDTEXT', 42:'DELOBJ', 43:'SHOWOBJ', 44:'HIDEOBJ',
  45:'LOAD', 46:'SAVE', 47:'CLOSEAVI', 48:'CLOSEMID', 105:'POLYGON'
};

function getTypeName(type) {
  return CMD_NAMES[type] || `UNKNOWN_${type}`;
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function c(color, text) {
  return colors[color] + text + colors.reset;
}

function formatPolygon(pairs) {
  if (pairs.length === 0) return c('gray', '(no polygon)');
  if (pairs.length === 2) {
    return c('cyan', `rect(${pairs[0].a},${pairs[0].b} -> ${pairs[1].a},${pairs[1].b})`);
  }
  return c('cyan', `poly(${pairs.length} points)`);
}

function formatString(s) {
  const typeName = getTypeName(s.type);
  let color = 'white';
  if (s.type === 6) color = 'green';      // SCENE
  if (s.type === 9) color = 'magenta';    // PLAYAVI
  if (s.type === 11) color = 'blue';      // PLAYWAV
  if (s.type === 13) color = 'yellow';    // PLAYHTML
  if (s.type === 21) color = 'cyan';      // IF
  if (s.type === 22 || s.type === 23 || s.type === 24) color = 'yellow'; // SET/INC/DEC_VAR
  if (s.type === 27 || s.type === 28) color = 'blue'; // ADDBMP/DELBMP
  if (s.type === 38) color = 'gray';      // PLAYTEXT

  return `[${c(color, typeName.padEnd(10))}] ${s.string}`;
}

// =============================================================================
// COMMANDS
// =============================================================================

function loadVND(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(c('red', `Error: File not found: ${filePath}`));
    process.exit(1);
  }
  const buf = fs.readFileSync(filePath);
  try {
    return parseVND(buf);
  } catch (e) {
    console.error(c('red', `Error parsing VND: ${e.message}`));
    process.exit(1);
  }
}

function cmdInfo(filePath) {
  const vnd = loadVND(filePath);
  console.log(c('bright', '═══════════════════════════════════════════════════════════════'));
  console.log(c('bright', ` VND FILE INFO: ${path.basename(filePath)}`));
  console.log(c('bright', '═══════════════════════════════════════════════════════════════'));
  console.log(`  Project:    ${c('cyan', vnd.header.projectName)}`);
  console.log(`  Version:    ${vnd.header.version}`);
  console.log(`  Editor:     ${vnd.header.editor}`);
  console.log(`  Resolution: ${vnd.header.width}x${vnd.header.height}`);
  console.log(`  Scenes:     ${c('green', vnd.scenes.length)}`);
  console.log(`  Variables:  ${c('yellow', vnd.variables.length)}`);
  console.log(`  Remaining:  ${vnd.bytesRemaining} bytes`);
  console.log();
}

function cmdScenes(filePath) {
  const vnd = loadVND(filePath);
  console.log(c('bright', `\nSCENES IN ${path.basename(filePath)} (${vnd.scenes.length} total)\n`));

  vnd.scenes.forEach((scene, i) => {
    const cmdCount = scene.commands.length;
    const polyCount = scene.commands.filter(c => c.paramPairs.length > 0).length;
    const hasVideo = scene.commands.some(c => c.strings.some(s => s.type === 9)) ||
                     (scene.fields.string4 && scene.fields.string4.toLowerCase().includes('.avi'));
    const hasHotspot = scene.hotspot !== null;

    let flags = [];
    if (hasVideo) flags.push(c('magenta', 'VIDEO'));
    if (hasHotspot) flags.push(c('yellow', 'HOTSPOT'));
    if (scene.fields.string6) flags.push(c('cyan', 'HTM'));

    console.log(`${c('gray', String(i+1).padStart(3))}. ${c('bright', scene.name.padEnd(25))} ` +
                `${c('gray', cmdCount + ' cmds')} ${c('gray', polyCount + ' polys')} ` +
                `${flags.join(' ')}`);
  });
  console.log();
}

function cmdScene(filePath, sceneNum) {
  const vnd = loadVND(filePath);
  const idx = parseInt(sceneNum) - 1;

  if (idx < 0 || idx >= vnd.scenes.length) {
    console.error(c('red', `Error: Scene ${sceneNum} not found (1-${vnd.scenes.length})`));
    process.exit(1);
  }

  const scene = vnd.scenes[idx];

  console.log(c('bright', '\n═══════════════════════════════════════════════════════════════'));
  console.log(c('bright', ` SCENE ${sceneNum}: ${scene.name}`));
  console.log(c('bright', '═══════════════════════════════════════════════════════════════\n'));

  // Fields
  console.log(c('yellow', '▸ FIELDS:'));
  if (scene.fields.resource) console.log(`    resource: ${c('cyan', scene.fields.resource)}`);
  if (scene.fields.string1) console.log(`    string1:  ${scene.fields.string1}`);
  if (scene.fields.string2) console.log(`    string2:  ${scene.fields.string2}`);
  if (scene.fields.string3) console.log(`    string3 (WAV): ${c('blue', scene.fields.string3)} loops=${scene.fields.val2}`);
  if (scene.fields.string4) console.log(`    string4 (AVI): ${c('magenta', scene.fields.string4)} flags=${scene.fields.val3}`);
  if (scene.fields.string6) console.log(`    string6 (HTM): ${c('cyan', scene.fields.string6)}`);
  console.log(`    rect: ${scene.rect.left},${scene.rect.top} -> ${scene.rect.right},${scene.rect.bottom}`);

  // Hotspot
  if (scene.hotspot) {
    console.log(c('yellow', '\n▸ HOTSPOT:') + ` timer=${scene.hotspot.timerValue}ms`);
    scene.hotspot.objects.forEach((obj, i) => {
      console.log(`    ${formatString(obj)}`);
    });
  }

  // Commands
  console.log(c('yellow', `\n▸ COMMANDS (${scene.commands.length}):`));
  scene.commands.forEach((cmd, ci) => {
    const hasPolygon = cmd.paramPairs.length > 0;
    const polyLabel = hasPolygon ? c('green', ' [INTERACTIVE]') : c('gray', ' [AUTO]');

    console.log(`\n  ${c('bright', 'C' + ci)} type=${cmd.commandType}${polyLabel} ${formatPolygon(cmd.paramPairs)}`);

    cmd.strings.forEach((s, si) => {
      console.log(`      ${formatString(s)}`);
    });
  });

  console.log();
}

function cmdVars(filePath) {
  const vnd = loadVND(filePath);
  console.log(c('bright', `\nVARIABLES IN ${path.basename(filePath)} (${vnd.variables.length} total)\n`));

  vnd.variables.forEach((v, i) => {
    console.log(`  ${c('yellow', v.name.padEnd(20))} = ${v.value}`);
  });
  console.log();
}

function cmdSearch(filePath, pattern) {
  const vnd = loadVND(filePath);
  const regex = new RegExp(pattern, 'i');
  let found = 0;

  console.log(c('bright', `\nSEARCHING FOR "${pattern}" IN ${path.basename(filePath)}\n`));

  vnd.scenes.forEach((scene, si) => {
    // Search in fields
    const fields = [scene.fields.string1, scene.fields.string2, scene.fields.string3,
                    scene.fields.string4, scene.fields.resource, scene.fields.string6];
    fields.forEach((f, fi) => {
      if (f && regex.test(f)) {
        console.log(`${c('green', `Scene ${si+1}`)} ${scene.name} - ${c('yellow', 'field')}: ${f}`);
        found++;
      }
    });

    // Search in hotspot
    if (scene.hotspot) {
      scene.hotspot.objects.forEach((obj, oi) => {
        if (regex.test(obj.string)) {
          console.log(`${c('green', `Scene ${si+1}`)} ${scene.name} - ${c('yellow', 'hotspot')}: ${obj.string}`);
          found++;
        }
      });
    }

    // Search in commands
    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach((s, sti) => {
        if (regex.test(s.string)) {
          const hasPolygon = cmd.paramPairs.length > 0;
          const polyLabel = hasPolygon ? '[INTERACTIVE]' : '[AUTO]';
          console.log(`${c('green', `Scene ${si+1}`)} ${scene.name} - C${ci} ${c('gray', polyLabel)}`);
          console.log(`      ${formatString(s)}`);
          found++;
        }
      });
    });
  });

  console.log(c('bright', `\nFound ${found} matches\n`));
}

function cmdVideos(filePath) {
  const vnd = loadVND(filePath);
  console.log(c('bright', `\nVIDEOS IN ${path.basename(filePath)}\n`));

  vnd.scenes.forEach((scene, si) => {
    let videos = [];

    // Check string4 field
    if (scene.fields.string4 && scene.fields.string4.toLowerCase().includes('.avi')) {
      videos.push({
        source: 'field:string4',
        file: scene.fields.string4,
        trigger: 'SCENE_LOAD',
        polygon: false
      });
    }

    // Check commands
    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach((s) => {
        if (s.type === 9) { // PLAYAVI
          videos.push({
            source: `C${ci}`,
            file: s.string,
            trigger: cmd.paramPairs.length > 0 ? 'CLICK' : 'AUTO',
            polygon: cmd.paramPairs.length > 0
          });
        }
        if (s.type === 21 && s.string.toLowerCase().includes('playavi')) { // IF with playavi
          const match = s.string.match(/playavi\s+(\S+)/i);
          videos.push({
            source: `C${ci}:IF`,
            file: match ? match[1] : '(conditional)',
            trigger: cmd.paramPairs.length > 0 ? 'CLICK+CONDITION' : 'AUTO+CONDITION',
            polygon: cmd.paramPairs.length > 0,
            condition: s.string
          });
        }
      });
    });

    // Check hotspot
    if (scene.hotspot) {
      scene.hotspot.objects.forEach((obj) => {
        if (obj.type === 9) {
          videos.push({
            source: 'hotspot',
            file: obj.string,
            trigger: 'TIMER',
            polygon: false
          });
        }
        if (obj.type === 21 && obj.string.toLowerCase().includes('playavi')) {
          const match = obj.string.match(/playavi\s+(\S+)/i);
          videos.push({
            source: 'hotspot:IF',
            file: match ? match[1] : '(conditional)',
            trigger: 'TIMER+CONDITION',
            polygon: false,
            condition: obj.string
          });
        }
      });
    }

    if (videos.length > 0) {
      console.log(c('green', `Scene ${si+1}: ${scene.name}`));
      videos.forEach(v => {
        const triggerColor = v.trigger.includes('AUTO') ? 'yellow' :
                            v.trigger.includes('CLICK') ? 'cyan' : 'magenta';
        console.log(`    ${c('magenta', v.file.padEnd(25))} ${c(triggerColor, v.trigger.padEnd(20))} [${v.source}]`);
        if (v.condition) {
          console.log(`      ${c('gray', 'IF: ' + v.condition.substring(0, 70))}`);
        }
      });
    }
  });
  console.log();
}

function cmdConditions(filePath) {
  const vnd = loadVND(filePath);
  console.log(c('bright', `\nIF CONDITIONS IN ${path.basename(filePath)}\n`));

  vnd.scenes.forEach((scene, si) => {
    let conditions = [];

    scene.commands.forEach((cmd, ci) => {
      cmd.strings.forEach((s) => {
        if (s.type === 21) {
          conditions.push({
            source: `C${ci}`,
            condition: s.string,
            polygon: cmd.paramPairs.length > 0
          });
        }
      });
    });

    if (scene.hotspot) {
      scene.hotspot.objects.forEach((obj) => {
        if (obj.type === 21) {
          conditions.push({
            source: 'hotspot',
            condition: obj.string,
            polygon: false
          });
        }
      });
    }

    if (conditions.length > 0) {
      console.log(c('green', `Scene ${si+1}: ${scene.name}`));
      conditions.forEach(cond => {
        const polyLabel = cond.polygon ? c('cyan', '[CLICK]') : c('yellow', '[AUTO]');
        console.log(`    ${polyLabel} [${cond.source}] ${c('cyan', cond.condition)}`);
      });
    }
  });
  console.log();
}

function cmdSimulate(filePath, sceneNum) {
  const vnd = loadVND(filePath);
  const idx = parseInt(sceneNum) - 1;

  if (idx < 0 || idx >= vnd.scenes.length) {
    console.error(c('red', `Error: Scene ${sceneNum} not found`));
    process.exit(1);
  }

  const scene = vnd.scenes[idx];
  const vars = {};
  vnd.variables.forEach(v => { vars[v.name.toLowerCase()] = v.value; });

  console.log(c('bright', `\n═══════════════════════════════════════════════════════════════`));
  console.log(c('bright', ` SIMULATING SCENE ${sceneNum}: ${scene.name}`));
  console.log(c('bright', `═══════════════════════════════════════════════════════════════\n`));

  console.log(c('yellow', '▸ ON SCENE LOAD:'));

  // Background
  if (scene.fields.resource) {
    console.log(`  ${c('green', '✓')} Load background: ${scene.fields.resource}`);
  }

  // Auto WAV
  if (scene.fields.string3) {
    console.log(`  ${c('green', '✓')} Play WAV: ${scene.fields.string3} (loops=${scene.fields.val2})`);
  }

  // Auto AVI from field
  if (scene.fields.string4 && scene.fields.string4.toLowerCase().includes('.avi')) {
    console.log(`  ${c('magenta', '?')} string4 AVI: ${scene.fields.string4} (MAY NOT AUTO-PLAY)`);
  }

  // Auto HTM
  if (scene.fields.string6) {
    console.log(`  ${c('green', '✓')} Load HTM: ${scene.fields.string6}`);
  }

  // Execute auto commands (no polygon)
  console.log(c('yellow', '\n▸ AUTO-EXECUTE COMMANDS (no polygon):'));
  scene.commands.forEach((cmd, ci) => {
    if (cmd.paramPairs.length > 0) return; // Skip interactive

    cmd.strings.forEach((s) => {
      if (s.type === 6 || s.type === 38 || s.type === 39 || s.type === 3 || s.type === 7) return;

      if (s.type === 21) {
        console.log(`  ${c('cyan', '→')} C${ci} IF: ${s.string}`);
        // Simple condition evaluation display
        const match = s.string.match(/if\s+(\w+)\s*([<>=!]+)\s*(\d+)/i);
        if (match) {
          const varName = match[1].toLowerCase();
          const op = match[2];
          const val = parseInt(match[3]);
          const current = vars[varName] || 0;
          console.log(`      ${c('gray', `(${varName}=${current} ${op} ${val})`)} → would execute action if true`);
        }
      } else {
        console.log(`  ${c('green', '✓')} C${ci} [${getTypeName(s.type)}] ${s.string}`);
      }
    });
  });

  // Interactive commands
  console.log(c('yellow', '\n▸ INTERACTIVE COMMANDS (with polygon):'));
  scene.commands.forEach((cmd, ci) => {
    if (cmd.paramPairs.length === 0) return;

    console.log(`\n  ${c('bright', 'C' + ci)} ${formatPolygon(cmd.paramPairs)}`);
    console.log(c('gray', '    On CLICK:'));

    cmd.strings.forEach((s) => {
      if (s.type === 38 || s.type === 39) {
        console.log(`    ${c('gray', '  (hover)')} [${getTypeName(s.type)}] ${s.string.substring(0, 50)}`);
      } else {
        console.log(`      [${c('cyan', getTypeName(s.type).padEnd(10))}] ${s.string}`);
      }
    });
  });

  // Hotspot
  if (scene.hotspot) {
    console.log(c('yellow', `\n▸ HOTSPOT (timer=${scene.hotspot.timerValue}ms):`));
    scene.hotspot.objects.forEach((obj) => {
      console.log(`    [${c('magenta', getTypeName(obj.type).padEnd(10))}] ${obj.string}`);
    });
  }

  console.log();
}

function cmdTrace(filePath, sceneNum) {
  const vnd = loadVND(filePath);
  const idx = parseInt(sceneNum) - 1;

  if (idx < 0 || idx >= vnd.scenes.length) {
    console.error(c('red', `Error: Scene ${sceneNum} not found`));
    process.exit(1);
  }

  const scene = vnd.scenes[idx];

  console.log(c('bright', `\n═══════════════════════════════════════════════════════════════`));
  console.log(c('bright', ` INTERACTION TRACE: Scene ${sceneNum} - ${scene.name}`));
  console.log(c('bright', `═══════════════════════════════════════════════════════════════\n`));

  scene.commands.forEach((cmd, ci) => {
    if (cmd.paramPairs.length === 0) return;

    console.log(c('yellow', `▸ CLICK on C${ci}`) + ` ${formatPolygon(cmd.paramPairs)}`);

    let hasVideo = false;
    let hasNav = false;
    let navTarget = null;
    let videoFile = null;

    cmd.strings.forEach((s) => {
      if (s.type === 9) { hasVideo = true; videoFile = s.string; }
      if (s.type === 6) { hasNav = true; navTarget = s.string; }
      if (s.type === 21) {
        if (s.string.toLowerCase().includes('playavi')) hasVideo = true;
        if (s.string.toLowerCase().includes('scene')) hasNav = true;
      }
    });

    console.log(c('gray', '    Sequence:'));
    let step = 1;

    cmd.strings.forEach((s) => {
      if (s.type === 38 || s.type === 39) return; // Skip hover stuff

      if (s.type === 9) {
        console.log(`    ${step++}. ${c('magenta', 'PLAY VIDEO')}: ${s.string}`);
        if (hasNav) {
          console.log(`       ${c('yellow', '→ Navigation will wait for video to end')}`);
        }
      } else if (s.type === 6) {
        console.log(`    ${step++}. ${c('green', 'NAVIGATE')}: Scene ${s.string}`);
      } else if (s.type === 21) {
        console.log(`    ${step++}. ${c('cyan', 'IF')}: ${s.string}`);
      } else if (s.type === 22 || s.type === 23 || s.type === 24) {
        console.log(`    ${step++}. ${c('yellow', 'SET VAR')}: ${s.string}`);
      } else if (s.type === 11) {
        console.log(`    ${step++}. ${c('blue', 'PLAY SOUND')}: ${s.string}`);
      } else if (s.type === 27 || s.type === 28) {
        console.log(`    ${step++}. ${c('blue', getTypeName(s.type))}: ${s.string}`);
      } else {
        console.log(`    ${step++}. [${getTypeName(s.type)}]: ${s.string}`);
      }
    });

    console.log();
  });
}

// =============================================================================
// MAIN
// =============================================================================

function printUsage() {
  console.log(`
${c('bright', 'VND Debug CLI')} - Virtual Navigator Debug Tool

${c('yellow', 'Usage:')}
  node vnd-debug.js <command> [options]

${c('yellow', 'Commands:')}
  ${c('cyan', 'info')} <file.vnd>              Show VND file info
  ${c('cyan', 'scenes')} <file.vnd>            List all scenes
  ${c('cyan', 'scene')} <file.vnd> <n>         Show scene details (1-indexed)
  ${c('cyan', 'vars')} <file.vnd>              List all variables
  ${c('cyan', 'search')} <file.vnd> <pattern>  Search in commands/strings
  ${c('cyan', 'videos')} <file.vnd>            Find all video references
  ${c('cyan', 'conditions')} <file.vnd>        List all IF conditions
  ${c('cyan', 'simulate')} <file.vnd> <n>      Simulate scene load
  ${c('cyan', 'trace')} <file.vnd> <n>         Trace all interactions

${c('yellow', 'Examples:')}
  node vnd-debug.js info couleurs1.vnd
  node vnd-debug.js scene couleurs1.vnd 27
  node vnd-debug.js search couleurs1.vnd "home2.avi"
  node vnd-debug.js videos couleurs1.vnd
  node vnd-debug.js simulate couleurs1.vnd 27
`);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  printUsage();
  process.exit(0);
}

const cmd = args[0];
const file = args[1];

switch (cmd) {
  case 'info':
    if (!file) { console.error('Missing file argument'); process.exit(1); }
    cmdInfo(file);
    break;
  case 'scenes':
    if (!file) { console.error('Missing file argument'); process.exit(1); }
    cmdScenes(file);
    break;
  case 'scene':
    if (!file || !args[2]) { console.error('Usage: scene <file> <scene_number>'); process.exit(1); }
    cmdScene(file, args[2]);
    break;
  case 'vars':
    if (!file) { console.error('Missing file argument'); process.exit(1); }
    cmdVars(file);
    break;
  case 'search':
    if (!file || !args[2]) { console.error('Usage: search <file> <pattern>'); process.exit(1); }
    cmdSearch(file, args[2]);
    break;
  case 'videos':
    if (!file) { console.error('Missing file argument'); process.exit(1); }
    cmdVideos(file);
    break;
  case 'conditions':
    if (!file) { console.error('Missing file argument'); process.exit(1); }
    cmdConditions(file);
    break;
  case 'simulate':
    if (!file || !args[2]) { console.error('Usage: simulate <file> <scene_number>'); process.exit(1); }
    cmdSimulate(file, args[2]);
    break;
  case 'trace':
    if (!file || !args[2]) { console.error('Usage: trace <file> <scene_number>'); process.exit(1); }
    cmdTrace(file, args[2]);
    break;
  default:
    console.error(c('red', `Unknown command: ${cmd}`));
    printUsage();
    process.exit(1);
}
