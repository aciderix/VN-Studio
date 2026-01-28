/**
 * Script de débogage pour parser un fichier VND et afficher les hotspots trouvés
 * Usage: npx ts-node scripts/debug-vnd.ts VNP-VND/start.vnd
 */

import * as fs from 'fs';
import * as path from 'path';

// Minimal BinaryReader implementation for debugging
class BinaryReader {
  private buffer: Buffer;
  private offset: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  get pos(): number { return this.offset; }
  get remaining(): number { return this.buffer.length - this.offset; }

  seek(pos: number): void { this.offset = pos; }

  readUint8(): number {
    const val = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readUint16(): number {
    const val = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return val;
  }

  readUint32(): number {
    const val = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return val;
  }

  readInt32(): number {
    const val = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return val;
  }

  peekUint32(): number {
    return this.buffer.readUInt32LE(this.offset);
  }

  readBorlandString(): string {
    const len = this.readUint32();
    if (len === 0 || len > 1000) return '';
    const str = this.buffer.toString('latin1', this.offset, this.offset + len);
    this.offset += len;
    return str;
  }

  readFixedString(len: number): string {
    const str = this.buffer.toString('latin1', this.offset, this.offset + len);
    this.offset += len;
    return str.replace(/\x00+$/, '');
  }
}

// Record types
const PLAYBMP = 10;
const PLAYWAV = 11;
const PLAYAVI = 9;
const SCENE = 6;
const RUNPRJ = 31;
const SET_VAR = 22;
const POLYGON = 105;

function debugParseVND(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const reader = new BinaryReader(buffer);

  console.log(`\n=== Parsing ${filePath} (${buffer.length} bytes) ===\n`);

  // Read header - format découvert par analyse binaire
  const flags = [reader.readUint8(), reader.readUint8(), reader.readUint8(), reader.readUint8(), reader.readUint8()];
  console.log(`Header flags: [${flags.join(', ')}]`);

  const vnfile = reader.readBorlandString();
  const version = reader.readBorlandString();
  console.log(`Format: ${vnfile} v${version}`);

  // Format indicator?
  const formatType = reader.readUint32();
  console.log(`Format type: ${formatType}`);

  // Project metadata
  const projectName = reader.readBorlandString();
  const company = reader.readBorlandString();
  const serial = reader.readBorlandString();
  const projectId = reader.readBorlandString();
  const registryPath = reader.readBorlandString();
  console.log(`Project: ${projectName} by ${company} (serial: ${serial})`);

  // Screen dimensions
  const screenWidth = reader.readUint32();
  const screenHeight = reader.readUint32();
  const colorDepth = reader.readUint32();
  console.log(`Screen: ${screenWidth}x${screenHeight} @ ${colorDepth}bit`);

  // Unknown fields (4 × uint32) - entre dimensions écran et DLL path
  console.log(`\nPosition after metadata: ${reader.pos}`);
  console.log(`Unknown fields:`);
  for (let i = 0; i < 4; i++) {
    const val = reader.readUint32();
    console.log(`  [${reader.pos - 4}] = ${val}`);
  }

  // DLL path (juste avant le variable count)
  const dllPath = reader.readBorlandString();
  console.log(`\nDLL Path: ${dllPath}`);

  // VARIABLE COUNT - stocké directement après le DLL path!
  const varCount = reader.readUint32();
  console.log(`Variable count: ${varCount} (from header @ position ${reader.pos - 4})`);

  // Lire les variables
  const variables: string[] = [];
  const varStartPos = reader.pos;

  for (let i = 0; i < varCount; i++) {
    const varName = reader.readBorlandString();
    const varValue = reader.readUint32(); // valeur par défaut (généralement 0)
    variables.push(varName);
  }

  console.log(`Read ${variables.length} variables (${varStartPos} to ${reader.pos})`);
  console.log(`First 10 vars: ${variables.slice(0, 10).join(', ')}`);
  console.log(`Last 10 vars: ${variables.slice(-10).join(', ')}`);

  // Now search for scenes - they have 50-byte fixed names
  console.log(`\n=== Searching for scenes ===`);
  const scenePositions: { pos: number; name: string }[] = [];

  for (let pos = reader.pos; pos < buffer.length - 100; pos++) {
    // Look for scene pattern: readable name followed by nulls, then flag byte
    const chunk = buffer.toString('latin1', pos, pos + 50);
    // Scene names start with capital letter, contain only alnum, end with nulls
    const match = chunk.match(/^([A-Z][a-z]+)\x00+/);
    if (match && match[1].length >= 4) {
      const flagByte = buffer.readUInt8(pos + 50);
      // Verify next part looks like a Borland string
      const nextStrLen = buffer.readUInt32LE(pos + 51);
      if (flagByte <= 3 && nextStrLen < 100) {
        scenePositions.push({ pos, name: match[1] });
        // Skip ahead to avoid finding substrings
        pos += 80;
      }
    }
  }

  console.log(`Found ${scenePositions.length} potential scenes:`);
  scenePositions.forEach(s => console.log(`  ${s.name} @ ${s.pos}`));

  // Parse each scene
  let hotspotsFound: any[] = [];
  for (let i = 0; i < scenePositions.length; i++) {
    const sceneStart = scenePositions[i].pos;
    const sceneEnd = i < scenePositions.length - 1 ? scenePositions[i + 1].pos : buffer.length;

    reader.seek(sceneStart);
    const sceneName = reader.readFixedString(50);
    const flag = reader.readUint8();
    const resourceName = reader.readBorlandString();
    const reserved = reader.readFixedString(32);

    console.log(`\n--- Scene: "${sceneName}" (flag=${flag}, resource="${resourceName}") @ ${sceneStart} ---`);
    console.log(`Scene data: ${reader.pos} to ${sceneEnd}`);

    parseSceneRecords(reader, reader.pos, sceneEnd, sceneName, hotspotsFound);
  }

  // Summary
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Found ${hotspotsFound.length} hotspots:`);
  hotspotsFound.forEach((h, i) => {
    console.log(`  ${i + 1}. ${h.name} in scene "${h.scene}" @ ${h.position}`);
    if (h.polygon) {
      console.log(`     Polygon: ${h.polygon.length} points`);
    }
  });
}

function parseSceneRecords(reader: BinaryReader, start: number, end: number, sceneName: string, hotspots: any[]) {
  reader.seek(start);
  let currentHotspot: any = null;

  while (reader.pos < end && reader.remaining > 8) {
    const pos = reader.pos;
    const recordType = reader.peekUint32();

    // Valid record types check
    if (recordType > 200 || (recordType > 48 && recordType !== 105)) {
      // Skip invalid byte and retry
      reader.seek(pos + 1);
      continue;
    }

    reader.readUint32(); // Consume type

    switch (recordType) {
      case PLAYBMP: {
        // Save previous hotspot
        if (currentHotspot && currentHotspot.name) {
          hotspots.push(currentHotspot);
        }

        const bmpData = reader.readBorlandString();
        const parts = bmpData.split(' ');
        console.log(`  @ ${pos}: PLAYBMP "${bmpData}"`);

        currentHotspot = {
          name: parts[0]?.split('\\').pop()?.replace('.bmp', '') || 'unknown',
          scene: sceneName,
          position: pos,
          commands: [{ type: 'PLAYBMP', data: bmpData }],
        };
        break;
      }

      case PLAYWAV: {
        const wavData = reader.readBorlandString();
        console.log(`  @ ${pos}: PLAYWAV "${wavData}"`);
        if (currentHotspot) {
          currentHotspot.commands.push({ type: 'PLAYWAV', data: wavData });
        }
        break;
      }

      case PLAYAVI: {
        const aviData = reader.readBorlandString();
        console.log(`  @ ${pos}: PLAYAVI "${aviData}"`);
        break;
      }

      case SCENE: {
        const sceneData = reader.readBorlandString();
        console.log(`  @ ${pos}: SCENE "${sceneData}"`);
        if (currentHotspot) {
          currentHotspot.commands.push({ type: 'SCENE', data: sceneData });
        }
        break;
      }

      case RUNPRJ: {
        const prjData = reader.readBorlandString();
        console.log(`  @ ${pos}: RUNPRJ "${prjData}"`);
        if (currentHotspot) {
          currentHotspot.commands.push({ type: 'RUNPRJ', data: prjData });
        }
        break;
      }

      case SET_VAR: {
        const varData = reader.readBorlandString();
        console.log(`  @ ${pos}: SET_VAR "${varData}"`);
        if (currentHotspot) {
          currentHotspot.commands.push({ type: 'SET_VAR', data: varData });
        }
        break;
      }

      case 1: { // Wrapper type
        const subType = reader.readUint32();
        const cmdData = reader.readBorlandString();
        console.log(`  @ ${pos}: TYPE1 subtype=${subType} "${cmdData}"`);
        if (currentHotspot) {
          currentHotspot.commands.push({ type: `TYPE1_${subType}`, data: cmdData });
        }
        break;
      }

      case 3: { // Complex command
        const subType = reader.readUint32();
        if (subType === 6 || subType === 9 || subType === 16 || subType === 22) {
          const data = reader.readBorlandString();
          console.log(`  @ ${pos}: TYPE3 subtype=${subType} "${data}"`);
          if (currentHotspot) {
            currentHotspot.commands.push({ type: `TYPE3_${subType}`, data });
          }
        } else {
          console.log(`  @ ${pos}: TYPE3 subtype=${subType} (skipped)`);
        }
        break;
      }

      case POLYGON: {
        const pointCount = reader.readUint32();
        const polygon: { x: number; y: number }[] = [];
        for (let i = 0; i < pointCount && i < 50; i++) {
          polygon.push({
            x: reader.readInt32(),
            y: reader.readInt32(),
          });
        }
        console.log(`  @ ${pos}: POLYGON ${pointCount} points [${polygon.slice(0, 3).map(p => `(${p.x},${p.y})`).join(', ')}...]`);

        if (currentHotspot) {
          currentHotspot.polygon = polygon;
          hotspots.push(currentHotspot);
          currentHotspot = null;
        }
        break;
      }

      default: {
        // Try to read as string
        const strLen = reader.peekUint32();
        if (strLen > 0 && strLen < 200) {
          const data = reader.readBorlandString();
          console.log(`  @ ${pos}: TYPE${recordType} "${data.substring(0, 50)}..."`);
          if (currentHotspot) {
            currentHotspot.commands.push({ type: `TYPE${recordType}`, data });
          }
        } else {
          console.log(`  @ ${pos}: TYPE${recordType} (invalid length ${strLen}, skipping)`);
        }
        break;
      }
    }
  }

  // Save last hotspot
  if (currentHotspot && currentHotspot.name) {
    hotspots.push(currentHotspot);
  }
}

// Main
const filePath = process.argv[2] || 'VNP-VND/start.vnd';
debugParseVND(path.resolve(process.cwd(), filePath));
