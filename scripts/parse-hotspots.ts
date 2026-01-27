/**
 * Script de débogage ciblé pour parser les hotspots dans la scène Frontal
 * Basé sur l'analyse binaire du fichier start.vnd
 */

import * as fs from 'fs';
import * as path from 'path';

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

  hexDump(count: number): string {
    const bytes: string[] = [];
    for (let i = 0; i < count && this.offset + i < this.buffer.length; i++) {
      bytes.push(this.buffer.readUInt8(this.offset + i).toString(16).padStart(2, '0'));
    }
    return bytes.join(' ');
  }
}

// Record types
const PLAYBMP = 10;
const PLAYWAV = 11;
const POLYGON = 105;

interface Hotspot {
  name: string;
  bmpPath: string;
  x: number;
  y: number;
  zOrder: number;
  wavPath?: string;
  commands: { type: number; data: string }[];
  polygon?: { x: number; y: number }[];
  startPos: number;
}

function parseHotspots(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const reader = new BinaryReader(buffer);

  console.log(`\n=== Parsing hotspots from ${filePath} ===\n`);

  // Chercher directement les PLAYBMP (type 10) dans la zone 5000-6300
  const hotspots: Hotspot[] = [];
  let currentHotspot: Hotspot | null = null;

  // Scan for PLAYBMP records
  for (let pos = 5000; pos < 6300; pos++) {
    const type = buffer.readUInt32LE(pos);

    if (type === PLAYBMP) {
      // Verify it's actually a PLAYBMP by checking the string looks valid
      const strLen = buffer.readUInt32LE(pos + 4);
      if (strLen > 5 && strLen < 100) {
        const str = buffer.toString('latin1', pos + 8, pos + 8 + strLen);
        if (str.includes('\\') && str.includes('.bmp')) {
          // Save previous hotspot
          if (currentHotspot) {
            hotspots.push(currentHotspot);
          }

          // Parse BMP data
          const parts = str.split(' ');
          const bmpPath = parts[0] || '';
          const x = parseInt(parts[1]) || 0;
          const y = parseInt(parts[2]) || 0;
          const zOrder = parseInt(parts[3]) || 0;

          currentHotspot = {
            name: bmpPath.split('\\').pop()?.replace('.bmp', '') || 'unknown',
            bmpPath,
            x,
            y,
            zOrder,
            commands: [],
            startPos: pos,
          };

          console.log(`\n[${pos}] PLAYBMP: "${str}"`);

          // Continue parsing from after this record
          reader.seek(pos + 8 + strLen);
          parseHotspotCommands(reader, currentHotspot, buffer);

          // Move scan position past what we just parsed
          pos = reader.pos - 1;
        }
      }
    }
  }

  // Save last hotspot
  if (currentHotspot) {
    hotspots.push(currentHotspot);
  }

  // Summary
  console.log(`\n\n=== SUMMARY: ${hotspots.length} hotspots found ===\n`);
  hotspots.forEach((h, i) => {
    console.log(`${i + 1}. ${h.name}`);
    console.log(`   BMP: ${h.bmpPath} @ (${h.x}, ${h.y}) z=${h.zOrder}`);
    if (h.wavPath) console.log(`   WAV: ${h.wavPath}`);
    console.log(`   Commands: ${h.commands.length}`);
    h.commands.forEach(c => console.log(`     - Type ${c.type}: ${c.data.substring(0, 50)}`));
    if (h.polygon) {
      console.log(`   Polygon: ${h.polygon.length} points`);
      console.log(`     First 3: ${h.polygon.slice(0, 3).map(p => `(${p.x},${p.y})`).join(', ')}`);
    }
    console.log();
  });
}

function parseHotspotCommands(reader: BinaryReader, hotspot: Hotspot, buffer: Buffer) {
  // Parse commands until we hit next PLAYBMP, POLYGON, or invalid data
  while (reader.pos < buffer.length - 8) {
    // Skip null separators
    while (reader.peekUint32() === 0 && reader.remaining > 8) {
      reader.readUint32();
    }

    const pos = reader.pos;
    const type = reader.peekUint32();

    // Check for next PLAYBMP (new hotspot)
    if (type === PLAYBMP) {
      const strLen = buffer.readUInt32LE(pos + 4);
      if (strLen > 5 && strLen < 100) {
        const str = buffer.toString('latin1', pos + 8, pos + 8 + strLen);
        if (str.includes('.bmp')) {
          // New hotspot, stop here
          return;
        }
      }
    }

    // Handle POLYGON (end of hotspot)
    if (type === POLYGON) {
      reader.readUint32(); // consume type
      const pointCount = reader.readUint32();
      console.log(`  [${pos}] POLYGON: ${pointCount} points`);

      hotspot.polygon = [];
      for (let i = 0; i < pointCount && i < 50; i++) {
        hotspot.polygon.push({
          x: reader.readInt32(),
          y: reader.readInt32(),
        });
      }
      console.log(`    Points: ${hotspot.polygon.slice(0, 3).map(p => `(${p.x},${p.y})`).join(', ')}...`);
      return;
    }

    // Handle PLAYWAV
    if (type === PLAYWAV) {
      reader.readUint32(); // consume type
      const wavPath = reader.readBorlandString();
      hotspot.wavPath = wavPath;
      console.log(`  [${pos}] PLAYWAV: "${wavPath}"`);
      continue;
    }

    // Handle Type 1 (wrapper command)
    if (type === 1) {
      reader.readUint32(); // consume type
      const subType = reader.readUint32();
      const cmdData = reader.readBorlandString();
      hotspot.commands.push({ type: subType, data: cmdData });
      console.log(`  [${pos}] TYPE1 subtype=${subType}: "${cmdData}"`);
      continue;
    }

    // Handle Type 3 (complex command)
    if (type === 3) {
      reader.readUint32(); // consume type
      const subType = reader.readUint32();
      if (subType === 6 || subType === 9 || subType === 16 || subType === 22) {
        const cmdData = reader.readBorlandString();
        hotspot.commands.push({ type: subType, data: cmdData });
        console.log(`  [${pos}] TYPE3 subtype=${subType}: "${cmdData}"`);
      } else {
        // Unknown subtype, try to read string anyway
        const strLen = reader.peekUint32();
        if (strLen > 0 && strLen < 100) {
          const cmdData = reader.readBorlandString();
          hotspot.commands.push({ type: subType, data: cmdData });
          console.log(`  [${pos}] TYPE3 subtype=${subType}: "${cmdData}"`);
        }
      }
      continue;
    }

    // Handle Type 4/5 (markers/separators)
    if (type === 4 || type === 5) {
      reader.readUint32(); // consume type
      // Read next uint32 as a value
      reader.readUint32();
      continue;
    }

    // Handle other valid types (1-48)
    if (type > 0 && type <= 48) {
      reader.readUint32(); // consume type
      const strLen = reader.peekUint32();
      if (strLen > 0 && strLen < 200) {
        const cmdData = reader.readBorlandString();
        hotspot.commands.push({ type, data: cmdData });
        console.log(`  [${pos}] TYPE${type}: "${cmdData.substring(0, 50)}"`);
      }
      continue;
    }

    // Unknown/invalid type - check if scene name pattern
    if (type > 48 && type !== POLYGON) {
      // Might be end of scene, stop parsing
      return;
    }

    // Skip one byte and continue
    reader.seek(pos + 1);
  }
}

// Main
const filePath = process.argv[2] || 'VNP-VND/start.vnd';
parseHotspots(path.resolve(process.cwd(), filePath));
