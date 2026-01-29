/**
 * Universal VND Parser - Parses all VND file structures (TYPE_A + TYPE_B)
 *
 * Discovered structure:
 *
 * HEADER:
 *   5 bytes flags → BS "VNFILE" → BS version → uint32 projectID
 *   → BS projectName → BS editor → BS serial → BS projectID_str → BS registry
 *   → uint32 width → uint32 height → uint32 depth
 *   → uint32 flag → uint32 u1 → uint32 u2 → uint32 reserved
 *   → BS dllPath → uint32 varCount
 *
 * VARIABLES: varCount × (BS name + uint32 value)
 *
 * AFTER VARIABLES:
 *   TYPE_A (start, couleurs1): uint32 sceneCount > 0 → N scenes with 50-byte names
 *   TYPE_B (all others): 16 zero bytes → scene data starts with marker
 *
 * TYPE_B SCENE:
 *   marker (0x01/0x81/0x83/0x00) + 12 zeros + BS wav
 *   uint32(2) + 8 zeros + BS bmp
 *   uint32 props + 32 zeros
 *   int32(-12) + 20 zeros → hotspot data
 *
 * HOTSPOT EVENT GROUPS (separated by 4 zero bytes):
 *   uint32 eventType + uint32 cmdCount + N commands
 *   Terminated by: POLYGON(100-110) or TIPTEXT(FONT+PLAYTEXT+RECT) or nothing
 *
 * COMMANDS:
 *   type=0: NULL (no payload)
 *   type=1: Wrapper (uint32 sub + BS string)
 *   type=2: Marker (no payload)
 *   type=3: Complex (uint32 sub + BS string)
 *   type=4-48: Simple (BS string)
 *   type=100-110: Shape (uint32 count + N × (int32 x, int32 y))
 */

const fs = require('fs');
const path = require('path');

function readBS(buf, o) {
  if (o + 4 > buf.length) return null;
  const len = buf.readUInt32LE(o);
  if (len === 0) return { s: '', l: 4 };
  if (len > 10000 || o + 4 + len > buf.length) return null;
  return { s: buf.slice(o + 4, o + 4 + len).toString('latin1'), l: 4 + len };
}

function parseHeader(buf) {
  let p = 5; // skip flags
  const flags = buf.slice(0, 5);

  const magic = readBS(buf, p); p += magic.l;
  const version = readBS(buf, p); p += version.l;
  const projectID = buf.readUInt32LE(p); p += 4;
  const projectName = readBS(buf, p); p += projectName.l;
  const editor = readBS(buf, p); p += editor.l;
  const serial = readBS(buf, p); p += serial.l;
  const projectIDStr = readBS(buf, p); p += projectIDStr.l;
  const registry = readBS(buf, p); p += registry.l;
  const width = buf.readUInt32LE(p); p += 4;
  const height = buf.readUInt32LE(p); p += 4;
  const depth = buf.readUInt32LE(p); p += 4;
  const flag = buf.readUInt32LE(p); p += 4;
  const u1 = buf.readUInt32LE(p); p += 4;
  const u2 = buf.readUInt32LE(p); p += 4;
  const reserved = buf.readUInt32LE(p); p += 4;
  const dllPath = readBS(buf, p); p += dllPath.l;
  const varCount = buf.readUInt32LE(p); p += 4;

  return {
    magic: magic.s, version: version.s, projectID,
    projectName: projectName.s, editor: editor.s, serial: serial.s,
    projectIDStr: projectIDStr.s, registry: registry.s,
    width, height, depth, flag, u1, u2, reserved,
    dllPath: dllPath.s, varCount, endPos: p
  };
}

function parseVariables(buf, startPos, count) {
  let p = startPos;
  const vars = [];
  for (let i = 0; i < count; i++) {
    const name = readBS(buf, p);
    if (!name) break;
    p += name.l;
    const value = buf.readUInt32LE(p); p += 4;
    vars.push({ name: name.s, value });
  }
  return { vars, endPos: p };
}

function parseCommand(buf, p) {
  if (p + 4 > buf.length) return null;
  const type = buf.readUInt32LE(p); p += 4;

  if (type === 0) return { type: 0, desc: 'NULL', end: p };
  if (type === 2) return { type: 2, desc: 'MARKER', end: p };

  if (type === 1) { // Wrapper: sub + BS
    const sub = buf.readUInt32LE(p); p += 4;
    const bs = readBS(buf, p);
    if (bs) p += bs.l;
    return { type: 1, sub, str: bs ? bs.s : '', desc: `W(sub=${sub}) "${bs ? bs.s : ''}"`, end: p };
  }

  if (type === 3) { // Complex: sub + BS
    const sub = buf.readUInt32LE(p); p += 4;
    const bs = readBS(buf, p);
    if (bs) p += bs.l;
    return { type: 3, sub, str: bs ? bs.s : '', desc: `CMD(sub=${sub}) "${bs ? bs.s : ''}"`, end: p };
  }

  // Simple records with BS payload (types 4-48 including FONT=39, PLAYTEXT=38, etc.)
  if (type >= 4 && type <= 48) {
    const bs = readBS(buf, p);
    if (bs) p += bs.l;
    return { type, str: bs ? bs.s : '', desc: `T${type} "${bs ? bs.s : ''}"`, end: p };
  }

  // Shape records (polygon/rect): types 100-110
  if (type >= 100 && type <= 110) {
    const count = buf.readUInt32LE(p); p += 4;
    if (count > 100) return null; // sanity
    const points = [];
    for (let i = 0; i < count; i++) {
      points.push({ x: buf.readInt32LE(p), y: buf.readInt32LE(p + 4) });
      p += 8;
    }
    return { type, shape: true, points, desc: `SHAPE(${type},${count}pts)`, end: p };
  }

  return null; // unrecognized type
}

function parseEventGroup(buf, startPos) {
  let p = startPos;
  if (p + 8 > buf.length) return null;

  const eventType = buf.readUInt32LE(p); p += 4;
  const cmdCount = buf.readUInt32LE(p); p += 4;

  // Sanity check
  if (cmdCount > 50 || eventType > 10) return null;

  const commands = [];
  for (let i = 0; i < cmdCount; i++) {
    const cmd = parseCommand(buf, p);
    if (!cmd) break;
    commands.push(cmd);
    p = cmd.end;
  }

  // After commands: check for shape (POLYGON/RECT) or tiptext (FONT+PLAYTEXT+RECT)
  let shape = null;
  let tiptext = null;

  // Skip zero separator
  while (p < buf.length - 4 && buf.readUInt32LE(p) === 0) p += 4;

  if (p < buf.length - 4) {
    const nextType = buf.readUInt32LE(p);

    if (nextType >= 100 && nextType <= 110) {
      // Shape record
      const shapeRec = parseCommand(buf, p);
      if (shapeRec) {
        shape = shapeRec;
        p = shapeRec.end;
      }
    } else if (nextType === 39) {
      // FONT → PLAYTEXT → RECT (tiptext)
      tiptext = {};
      const font = parseCommand(buf, p);
      if (font) {
        tiptext.font = font.str;
        p = font.end;
        // Skip zeros
        while (p < buf.length - 4 && buf.readUInt32LE(p) === 0) p += 4;
        // PLAYTEXT
        if (buf.readUInt32LE(p) === 38) {
          const text = parseCommand(buf, p);
          if (text) {
            tiptext.text = text.str;
            p = text.end;
          }
        }
        // RECT
        if (p < buf.length - 4 && buf.readUInt32LE(p) >= 100 && buf.readUInt32LE(p) <= 110) {
          const rect = parseCommand(buf, p);
          if (rect) {
            tiptext.rect = rect.points;
            p = rect.end;
          }
        }
      }
    }
  }

  return { eventType, cmdCount, commands, shape, tiptext, end: p };
}

function parseTypeB(buf, startPos) {
  let p = startPos;

  // Skip 16 zero bytes
  p += 16;

  const scenes = [];
  let sceneNum = 0;

  while (p < buf.length - 20) {
    sceneNum++;
    const scene = { index: sceneNum, wav: '', bmp: '', marker: 0, hotspots: [] };

    // Read marker
    scene.marker = buf.readUInt32LE(p); p += 4;

    // 12 zeros
    p += 12;

    // WAV string
    const wav = readBS(buf, p);
    if (wav) { scene.wav = wav.s; p += wav.l; }

    // BMP marker (uint32=2 typically) + 8 zeros + BMP string
    const bmpMarker = buf.readUInt32LE(p); p += 4;

    if (bmpMarker === 2 || bmpMarker === 0) {
      // 8 zeros
      p += 8;
      const bmp = readBS(buf, p);
      if (bmp) { scene.bmp = bmp.s; p += bmp.l; }
    } else {
      // BMP string might come differently
      // For barre.vnd the structure is different (marker=0x81, then BMP directly)
      const bs = readBS(buf, p - 4);
      if (bs && bs.s.includes('.bmp')) {
        scene.bmp = bs.s;
        p = p - 4 + bs.l;
      }
    }

    // Scene properties + reserved
    const propVal = buf.readUInt32LE(p); p += 4;
    scene.props = propVal;

    // Skip zeros until we hit int32(-12) or non-zero data
    let zeroCount = 0;
    while (p < buf.length - 4 && buf.readUInt32LE(p) === 0) { p += 4; zeroCount++; }

    // Check for int32(-12) hotspot marker
    if (p < buf.length - 4 && buf.readInt32LE(p) === -12) {
      p += 4;
      // Skip more zeros
      while (p < buf.length - 4 && buf.readUInt32LE(p) === 0) p += 4;
    }

    // Parse event groups (hotspot data)
    let hotspotEvents = [];
    while (p < buf.length - 8) {
      const possibleEventType = buf.readUInt32LE(p);
      const possibleCmdCount = buf.readUInt32LE(p + 4);

      // Detect if this is an event group (eventType <= 10, cmdCount <= 50)
      if (possibleEventType <= 10 && possibleCmdCount <= 50 && possibleCmdCount > 0) {
        const eg = parseEventGroup(buf, p);
        if (eg) {
          hotspotEvents.push(eg);
          p = eg.end;
          // Skip zero separator
          while (p < buf.length - 4 && buf.readUInt32LE(p) === 0) p += 4;
          continue;
        }
      }

      // Check for next scene (marker 0x01/0x81/0x83 after many zeros)
      // or end of file
      break;
    }

    scene.events = hotspotEvents;
    scenes.push(scene);

    // Check if we're at a new scene boundary
    // New scenes start with marker (0x01/0x81/0x83) preceded by >10 zeros
    // We already consumed zeros, so check the current value
    if (p >= buf.length - 20) break;

    const nextVal = buf.readUInt32LE(p);
    if (nextVal === 0x01 || nextVal === 0x81 || nextVal === 0x83 || nextVal === 0x00) {
      // Could be a new scene - continue loop
      continue;
    }

    // Not a new scene marker, try to continue
    break;
  }

  return scenes;
}

function parseTypeA(buf, startPos) {
  let p = startPos;
  const sceneCount = buf.readUInt32LE(p); p += 4;
  const scenes = [];

  for (let s = 0; s < sceneCount; s++) {
    // 50-byte fixed name
    const nameBytes = buf.slice(p, p + 50);
    const name = nameBytes.toString('latin1').replace(/\x00+$/, '');
    p += 50;

    // 1 byte flag
    const flag = buf.readUInt8(p); p += 1;

    // Borland string resource
    const resource = readBS(buf, p);
    p += resource ? resource.l : 4;

    // 32 bytes reserved
    p += 32;

    scenes.push({ index: s + 1, name, flag, resource: resource ? resource.s : '' });
  }

  // Parse records after scene headers (TYPE_A records like in start.vnd)
  // Records: type(uint32) + payload until end of file
  const records = [];
  while (p < buf.length - 4) {
    const type = buf.readUInt32LE(p);
    if (type === 0) { p += 4; continue; }

    const cmd = parseCommand(buf, p);
    if (!cmd) break;
    records.push(cmd);
    p = cmd.end;
  }

  return { scenes, records };
}

function parseVND(filePath) {
  const buf = fs.readFileSync(filePath);
  const header = parseHeader(buf);
  const { vars, endPos: varEnd } = parseVariables(buf, header.endPos, header.varCount);

  // Detect structure type
  const afterVars = buf.readUInt32LE(varEnd);
  const isTypeA = afterVars > 0 && afterVars < 100;

  let sceneData;
  if (isTypeA) {
    sceneData = parseTypeA(buf, varEnd);
  } else {
    sceneData = { scenes: parseTypeB(buf, varEnd) };
  }

  return { header, vars, structureType: isTypeA ? 'A' : 'B', ...sceneData };
}

// CLI
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Usage: node parse-vnd-universal.js <file.vnd>');
    process.exit(1);
  }

  const result = parseVND(filePath);
  console.log('=== ' + path.basename(filePath) + ' ===');
  console.log('Project: ' + result.header.projectName + ' (ID=' + result.header.projectID + ')');
  console.log('Display: ' + result.header.width + 'x' + result.header.height + ' @' + result.header.depth + 'bit');
  console.log('Variables: ' + result.vars.length);
  console.log('Structure: TYPE_' + result.structureType);
  console.log();

  if (result.structureType === 'A') {
    console.log('Scenes: ' + result.scenes.length);
    result.scenes.forEach(s => {
      console.log('  ' + s.index + '. "' + s.name + '" flag=' + s.flag + ' res="' + s.resource + '"');
    });
    console.log('\nRecords: ' + result.records.length);
    result.records.slice(0, 20).forEach(r => console.log('  ' + r.desc));
  } else {
    console.log('Scenes: ' + result.scenes.length);
    result.scenes.forEach(s => {
      console.log('  ' + s.index + '. marker=0x' + s.marker.toString(16) + ' wav="' + s.wav + '" bmp="' + s.bmp + '"');
      if (s.events) {
        s.events.forEach(e => {
          console.log('    Event ' + e.eventType + ': ' + e.cmdCount + ' cmds' +
            (e.shape ? ' → ' + e.shape.desc : '') +
            (e.tiptext ? ' → TIPTEXT' : ''));
          e.commands.forEach(c => console.log('      ' + c.desc));
        });
      }
    });
  }
}

module.exports = { parseVND, parseHeader, parseVariables };
