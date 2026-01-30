/**
 * Universal VND Parser - Based on radare2 reverse-engineering of europeo.exe
 *
 * ALL VND files share the SAME format. There is NO TYPE_A vs TYPE_B.
 * The uint32 at position 23 is the SCENE COUNT (not projectID).
 *
 * Complete binary format (Borland OWL 5.2 streaming, version 0x101):
 *
 * STREAM HEADER:
 *   5 bytes: 0x3A + skip(1) + uint32LE version (0x00000101)
 *   → All readWord = uint32, string lengths = uint32
 *
 * VND HEADER:
 *   BS "VNFILE" (magic)
 *   BS version ("2.13")
 *   uint32 sceneCount
 *   BS projectName
 *   BS editor
 *   BS serial (compared with "PASSWORD" internally)
 *   BS projectIDStr
 *   BS registry
 *   uint32 width, uint32 height, uint32 depth, uint32 flag (display settings via virtual call)
 *   uint32 u1, uint32 u2, uint32 reserved
 *   BS dllPath
 *   uint32 varCount + varCount × (BS name + uint32 value)
 *
 * SCENES (sceneCount × TVNScene::Read):
 *   From 0x414ca1 (base props):
 *     BS sceneName
 *     readBytes(4) → 4 flag bytes
 *     uint32 prop1, uint32 prop2, uint32 prop3
 *
 *   From TVNScene::Read 0x4161fa (version >= 0x2000a):
 *     BS field_0x24 (string1)
 *     BS field_0x20 (string2)
 *     uint32 field_0x54
 *     BS field_0x28 (string3)
 *     uint32 field_0x58
 *     BS field_0x2c (string4)
 *     uint32 field_0x5c
 *     BS field_0x30 (resource, e.g. "<res0001>")
 *     uint32 field_0x60
 *     BS field_0x34 (string6)
 *     uint32 field_0x64
 *     TRect field_0x40 (4 × int32 = 16 bytes: left, top, right, bottom)
 *     uint32 field_0x50
 *     int32 hotspotCount → if >0: hotspot collection object
 *     int32 commandListCount → if >0: command list collection object
 *     Content collection (commands/events via 0x413e21)
 *
 * HOTSPOT COLLECTION (0x40dc1e):
 *   uint32 count
 *   count × hotspot objects via 0x40d6f4: uint32 type + BS string
 *
 * CONTENT COLLECTION / COMMAND LIST (0x413e21):
 *   uint32 count
 *   count × TVNCommand::Read
 *
 * TVNCommand::Read (0x4132f1):
 *   String collection read (0x40e989): uint32 count + count × (uint32 subIndex + object(uint32 type + BS string))
 *   uint32 commandType
 *   uint32 paramPairCount → if >0: paramPairCount × (int32 a, int32 b)
 *   if version >= 0x2000c: uint32 flags
 */

const fs = require('fs');
const path = require('path');

// ─── Primitive readers ────────────────────────────────────────────────
function readBS(buf, o) {
  if (o + 4 > buf.length) return null;
  const len = buf.readUInt32LE(o);
  if (len === 0) return { s: '', l: 4 };
  if (len > 100000 || o + 4 + len > buf.length) return null;
  return { s: buf.slice(o + 4, o + 4 + len).toString('latin1'), l: 4 + len };
}

function readUint32(buf, o) {
  if (o + 4 > buf.length) return null;
  return buf.readUInt32LE(o);
}

function readInt32(buf, o) {
  if (o + 4 > buf.length) return null;
  return buf.readInt32LE(o);
}

// ─── Header parsing ──────────────────────────────────────────────────
function parseHeader(buf) {
  let p = 5; // skip stream version header (0x3A + 1 skip + uint32 version)
  const streamHeader = buf.slice(0, 5);

  const magic = readBS(buf, p); if (!magic) return null; p += magic.l;
  if (magic.s !== 'VNFILE') throw new Error(`Invalid magic: "${magic.s}"`);

  const version = readBS(buf, p); if (!version) return null; p += version.l;
  const sceneCount = buf.readUInt32LE(p); p += 4;
  const projectName = readBS(buf, p); p += projectName.l;
  const editor = readBS(buf, p); p += editor.l;

  // Function 0x416781: 3 BS strings (serial, projectIDStr, registry)
  const serial = readBS(buf, p); p += serial.l;
  const projectIDStr = readBS(buf, p); p += projectIDStr.l;
  const registry = readBS(buf, p); p += registry.l;

  // Virtual call: 4 uint32 display settings (width, height, depth, flag)
  const width = buf.readUInt32LE(p); p += 4;
  const height = buf.readUInt32LE(p); p += 4;
  const depth = buf.readUInt32LE(p); p += 4;
  const flag = buf.readUInt32LE(p); p += 4;

  // 3 more readWord
  const u1 = buf.readUInt32LE(p); p += 4;
  const u2 = buf.readUInt32LE(p); p += 4;
  const reserved = buf.readUInt32LE(p); p += 4;

  // BS dllPath
  const dllPath = readBS(buf, p); p += dllPath.l;

  // Variables: uint32 varCount
  const varCount = buf.readUInt32LE(p); p += 4;

  return {
    magic: magic.s, version: version.s, sceneCount,
    projectName: projectName.s, editor: editor.s,
    serial: serial.s, projectIDStr: projectIDStr.s, registry: registry.s,
    width, height, depth, flag, u1, u2, reserved,
    dllPath: dllPath.s, varCount, endPos: p
  };
}

// ─── Variables ────────────────────────────────────────────────────────
function parseVariables(buf, startPos, count) {
  let p = startPos;
  const vars = [];
  for (let i = 0; i < count; i++) {
    const name = readBS(buf, p);
    if (!name) { console.error(`  [!] Variable ${i}: readBS failed at pos ${p}`); break; }
    p += name.l;
    if (p + 4 > buf.length) break;
    const value = buf.readUInt32LE(p); p += 4;
    vars.push({ name: name.s, value });
  }
  return { vars, endPos: p };
}

// ─── Object reader (0x40d6f4): readWord type + readBS string ─────────
function readObject(buf, p) {
  if (p + 4 > buf.length) return null;
  const type = buf.readUInt32LE(p); p += 4;
  const str = readBS(buf, p);
  if (!str) return { type, string: '', endPos: p };
  p += str.l;
  return { type, string: str.s, endPos: p };
}

// ─── String collection item (0x40df8b): readWord subIndex + readObject ─
function readCollectionItem(buf, p) {
  if (p + 4 > buf.length) return null;
  const subIndex = buf.readUInt32LE(p); p += 4;
  const obj = readObject(buf, p);
  if (!obj) return null;
  return { subIndex, type: obj.type, string: obj.string, endPos: obj.endPos };
}

// ─── String collection read (0x40e989) ───────────────────────────────
function readStringCollection(buf, p) {
  if (p + 4 > buf.length) return { items: [], endPos: p };
  const count = buf.readUInt32LE(p); p += 4;
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = readCollectionItem(buf, p);
    if (!item) break;
    items.push(item);
    p = item.endPos;
  }
  return { items, endPos: p };
}

// ─── TVNCommand::Read (0x4132f1) ─────────────────────────────────────
function readCommand(buf, p, streamVersion) {
  const startPos = p;

  // 1. String collection
  const strCol = readStringCollection(buf, p);
  p = strCol.endPos;

  // 2. readWord → commandType
  if (p + 4 > buf.length) return null;
  const commandType = buf.readUInt32LE(p); p += 4;

  // 3. readWord → paramPairCount
  if (p + 4 > buf.length) return null;
  const paramPairCount = buf.readUInt32LE(p); p += 4;

  // If paramPairCount > 0: read paramPairCount × (int32, int32)
  const paramPairs = [];
  if (paramPairCount > 0 && paramPairCount < 10000) {
    for (let i = 0; i < paramPairCount; i++) {
      if (p + 8 > buf.length) break;
      const a = buf.readInt32LE(p); p += 4;
      const b = buf.readInt32LE(p); p += 4;
      paramPairs.push({ a, b });
    }
    // Post-process (0x412168): if count==2, sort pairs so first pair has min values
    // (cosmetic, skip for parsing)
  }

  // 4. If version >= 0x2000c: readWord → flags
  let flags = 0;
  if (streamVersion >= 0x2000c) {
    if (p + 4 <= buf.length) {
      flags = buf.readUInt32LE(p); p += 4;
    }
  }

  return {
    strings: strCol.items,
    commandType,
    paramPairCount,
    paramPairs,
    flags,
    endPos: p
  };
}

// ─── Content collection read (0x413e21): commands ────────────────────
function readContentCollection(buf, p, streamVersion) {
  if (p + 4 > buf.length) return { commands: [], endPos: p };
  const count = buf.readUInt32LE(p); p += 4;
  const commands = [];
  for (let i = 0; i < count; i++) {
    const cmd = readCommand(buf, p, streamVersion);
    if (!cmd) { console.error(`  [!] Command ${i}/${count} failed at pos ${p}`); break; }
    commands.push(cmd);
    p = cmd.endPos;
  }
  return { commands, endPos: p };
}

// ─── Hotspot collection read (0x40dc1e) ──────────────────────────────
function readHotspotCollection(buf, p) {
  if (p + 4 > buf.length) return { hotspots: [], endPos: p };
  const count = buf.readUInt32LE(p); p += 4;
  const hotspots = [];
  for (let i = 0; i < count; i++) {
    const obj = readObject(buf, p);
    if (!obj) break;
    hotspots.push({ type: obj.type, string: obj.string });
    p = obj.endPos;
  }
  return { hotspots, endPos: p };
}

// ─── Hotspot Read (0x41505f) ─────────────────────────────────────────
function readHotspot(buf, p, streamVersion) {
  // readWord → timer/value (e.g. 5000)
  if (p + 4 > buf.length) return null;
  const timerValue = buf.readUInt32LE(p); p += 4;

  // Collection reader (0x40dc1e): reads the hotspot's event collections
  const hotCol = readHotspotCollection(buf, p);
  p = hotCol.endPos;

  return {
    timerValue,
    objects: hotCol.hotspots,
    endPos: p
  };
}

// ─── TVNScene::Read (0x4161fa) ───────────────────────────────────────
function readScene(buf, p, streamVersion) {
  const sceneStart = p;

  // --- Base props (0x414ca1) ---
  // 1. BS → scene name
  const nameBS = readBS(buf, p);
  if (!nameBS) return null;
  p += nameBS.l;
  const name = nameBS.s;

  // 2. readBytes(4) → 4 flag bytes
  if (p + 4 > buf.length) return null;
  const flagBytes = buf.slice(p, p + 4);
  p += 4;

  // 3-5. 3 × readWord → properties
  if (p + 12 > buf.length) return null;
  const prop1 = buf.readUInt32LE(p); p += 4;
  const prop2 = buf.readUInt32LE(p); p += 4;
  const prop3 = buf.readUInt32LE(p); p += 4;

  // --- TVNScene::Read for version >= 0x2000a ---
  // 6 pairs of (BS + readWord)
  const fields = {};

  const bs1 = readBS(buf, p); p += bs1 ? bs1.l : 4; fields.string1 = bs1 ? bs1.s : '';
  const bs2 = readBS(buf, p); p += bs2 ? bs2.l : 4; fields.string2 = bs2 ? bs2.s : '';
  if (p + 4 > buf.length) return null;
  fields.val1 = buf.readUInt32LE(p); p += 4;

  const bs3 = readBS(buf, p); p += bs3 ? bs3.l : 4; fields.string3 = bs3 ? bs3.s : '';
  if (p + 4 > buf.length) return null;
  fields.val2 = buf.readUInt32LE(p); p += 4;

  const bs4 = readBS(buf, p); p += bs4 ? bs4.l : 4; fields.string4 = bs4 ? bs4.s : '';
  if (p + 4 > buf.length) return null;
  fields.val3 = buf.readUInt32LE(p); p += 4;

  const bs5 = readBS(buf, p); p += bs5 ? bs5.l : 4; fields.resource = bs5 ? bs5.s : '';
  if (p + 4 > buf.length) return null;
  fields.val4 = buf.readUInt32LE(p); p += 4;

  const bs6 = readBS(buf, p); p += bs6 ? bs6.l : 4; fields.string6 = bs6 ? bs6.s : '';
  if (p + 4 > buf.length) return null;
  fields.val5 = buf.readUInt32LE(p); p += 4;

  // TRect (4 × int32 = 16 bytes)
  if (p + 16 > buf.length) return null;
  const rect = {
    left: buf.readInt32LE(p), top: buf.readInt32LE(p + 4),
    right: buf.readInt32LE(p + 8), bottom: buf.readInt32LE(p + 12)
  };
  p += 16;

  // readWord
  if (p + 4 > buf.length) return null;
  fields.val6 = buf.readUInt32LE(p); p += 4;

  // readWord32 → hotspot count (if >0: read hotspot data from stream)
  if (p + 4 > buf.length) return null;
  const hotspotCount = buf.readUInt32LE(p); p += 4;

  // If hotspot exists: read timer + hotspot collection from stream
  let hotspot = null;
  if (hotspotCount > 0) {
    if (p + 4 > buf.length) return null;
    const timerValue = buf.readUInt32LE(p); p += 4;

    // Read hotspot collection: readWord count + count × readObject(readWord type + readBS string)
    if (p + 4 > buf.length) return null;
    const collCount = buf.readUInt32LE(p); p += 4;
    const objects = [];
    for (let i = 0; i < collCount && i < 1000; i++) {
      const obj = readObject(buf, p);
      if (!obj) break;
      objects.push({ type: obj.type, string: obj.string });
      p = obj.endPos;
    }
    hotspot = { timerValue, objects };
  }

  // readWord → cmdList value (if nonzero: create cmdList object and read 5 × readWord)
  if (p + 4 > buf.length) return null;
  const cmdListValue = buf.readInt32LE(p); p += 4;

  // cmdList Read (0x414d9c): 5 × readWord
  const cmdListData = [];
  if (cmdListValue !== 0) {
    if (p + 20 > buf.length) return null;
    for (let i = 0; i < 5; i++) {
      cmdListData.push(buf.readUInt32LE(p)); p += 4;
    }
  }

  // Content collection (commands/events via 0x413e21)
  const contentCol = readContentCollection(buf, p, streamVersion);
  p = contentCol.endPos;

  return {
    name,
    flagBytes: Array.from(flagBytes),
    prop1, prop2, prop3,
    fields,
    rect,
    hotspotCount,
    hotspot,
    cmdListValue,
    cmdListData,
    commands: contentCol.commands,
    endPos: p,
    bytesParsed: p - sceneStart
  };
}

// ─── Main parser ─────────────────────────────────────────────────────
function parseVND(filePath) {
  const buf = fs.readFileSync(filePath);
  const header = parseHeader(buf);
  if (!header) throw new Error('Failed to parse header');

  const { vars, endPos: varEnd } = parseVariables(buf, header.endPos, header.varCount);

  // Stream version from the VND version string
  // "2.13" → 0x2000d (2.13 = version 2, sub 13 = 0xD)
  const versionParts = header.version.split('.');
  const streamVersion = (parseInt(versionParts[0]) << 16) | parseInt(versionParts[1] || '0');

  // Read scenes (sceneCount from header position 23)
  const scenes = [];
  let p = varEnd;
  let errors = [];

  for (let i = 0; i < header.sceneCount; i++) {
    try {
      const scene = readScene(buf, p, streamVersion);
      if (!scene) {
        errors.push(`Scene ${i}: readScene returned null at pos ${p}`);
        break;
      }
      scenes.push(scene);
      p = scene.endPos;
    } catch (e) {
      errors.push(`Scene ${i}: ${e.message} at pos ${p}`);
      break;
    }
  }

  return {
    fileName: path.basename(filePath),
    fileSize: buf.length,
    header,
    varCount: vars.length,
    vars,
    sceneCount: header.sceneCount,
    scenesParsed: scenes.length,
    scenes,
    errors,
    bytesRemaining: buf.length - p,
    endPos: p
  };
}

// ─── Command type names ──────────────────────────────────────────────
const CMD_NAMES = {
  0:'QUIT', 1:'ABOUT', 2:'PREFS', 3:'PREV', 4:'NEXT', 5:'ZOOM',
  6:'SCENE', 7:'HOTSPOT', 8:'TIPTEXT', 9:'PLAYAVI', 10:'PLAYBMP',
  11:'PLAYWAV', 12:'PLAYMID', 13:'PLAYHTML', 14:'ZOOMIN', 15:'ZOOMOUT',
  16:'PAUSE', 17:'EXEC', 18:'EXPLORE', 19:'PLAYCDA', 20:'PLAYSEQ',
  21:'IF', 22:'SET_VAR', 23:'INC_VAR', 24:'DEC_VAR', 25:'INVALIDATE',
  26:'DEFCURSOR', 27:'ADDBMP', 28:'DELBMP', 29:'SHOWBMP', 30:'HIDEBMP',
  31:'RUNPRJ', 32:'UPDATE', 33:'RUNDLL', 34:'MSGBOX', 35:'PLAYCMD',
  36:'CLOSEWAV', 37:'CLOSEDLL', 38:'PLAYTEXT', 39:'FONT', 40:'REM',
  41:'ADDTEXT', 42:'DELOBJ', 43:'SHOWOBJ', 44:'HIDEOBJ', 45:'LOAD',
  46:'SAVE', 47:'CLOSEAVI', 48:'CLOSEMID',
  105:'POLYGON'
};

function cmdName(type) {
  return CMD_NAMES[type] || `CMD_${type}`;
}

function formatCommand(cmd) {
  const name = cmdName(cmd.commandType);
  const strs = cmd.strings.map(s => `${s.type}:"${s.string}"`).join(', ');
  const pairs = cmd.paramPairs.length > 0
    ? ` pairs=[${cmd.paramPairs.map(p => `(${p.a},${p.b})`).join(',')}]`
    : '';
  const flags = cmd.flags ? ` flags=${cmd.flags}` : '';
  return `${name}(${cmd.commandType}) [${strs}]${pairs}${flags}`;
}

// ─── CLI ─────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('-v') || args.includes('--verbose');
  const files = args.filter(a => !a.startsWith('-'));

  if (files.length === 0) {
    // Default: parse all VND files
    const vndDir = path.join(__dirname, '..', 'VNP-VND');
    if (fs.existsSync(vndDir)) {
      const vndFiles = fs.readdirSync(vndDir).filter(f => f.endsWith('.vnd')).sort();
      files.push(...vndFiles.map(f => path.join(vndDir, f)));
    } else {
      console.log('Usage: node parse-vnd-universal.js [file.vnd ...] [-v]');
      console.log('       Without args: parses all VNP-VND/*.vnd');
      process.exit(1);
    }
  }

  let totalOk = 0;
  let totalFail = 0;

  for (const filePath of files) {
    const result = parseVND(filePath);
    const ok = result.scenesParsed === result.sceneCount && result.errors.length === 0;

    if (ok) totalOk++;
    else totalFail++;

    const status = ok ? 'OK' : 'FAIL';
    const remaining = result.bytesRemaining;

    console.log(`[${status}] ${result.fileName}: ${result.sceneCount} scenes (${result.scenesParsed} parsed), ${result.varCount} vars, ${remaining} bytes remaining`);

    if (result.errors.length > 0) {
      result.errors.forEach(e => console.log(`  ERROR: ${e}`));
    }

    if (verbose && result.scenes.length > 0) {
      result.scenes.forEach((scene, i) => {
        const hotInfo = scene.hotspotCount > 0
          ? ` hotspot(timer=${scene.hotspot?.timerValue}, objs=${scene.hotspot?.objects?.length || 0})`
          : '';
        const cmdListInfo = scene.cmdListValue ? ` cmdList=[${scene.cmdListData}]` : '';
        const cmdInfo = scene.commands.length > 0
          ? `, ${scene.commands.length} cmds`
          : '';
        console.log(`  Scene ${i + 1}: "${scene.name}" flags=[${scene.flagBytes}] props=[${scene.prop1},${scene.prop2},${scene.prop3}] resource="${scene.fields.resource}"${hotInfo}${cmdListInfo}${cmdInfo}`);

        if (scene.commands.length > 0) {
          scene.commands.forEach((cmd, j) => {
            console.log(`    cmd[${j}]: ${formatCommand(cmd)}`);
          });
        }
      });
    }
  }

  console.log(`\n=== TOTAL: ${totalOk} OK, ${totalFail} FAIL out of ${files.length} files ===`);
}

module.exports = { parseVND, parseHeader, parseVariables };
