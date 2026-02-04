/**
 * VNFileLoader - Parser pour les fichiers VND (Virtual Navigator Data)
 *
 * Port TypeScript exact de parse-vnd-universal.js, validé sur 19/19 fichiers VND.
 * Basé sur la rétro-ingénierie de europeo.exe via radare2.
 *
 * Format: Borland OWL 5.2 streaming, version 0x101 (uint32 partout).
 */

import {
  VNDFile,
  VNDHeader,
  VNVariable,
  VNSceneRaw,
  VNCommandRaw,
  VNStringCollectionItem,
  VNStringObject,
  VNParamPair,
  VNHotspotData,
  VNRect,
} from '../types/vn.types';

// =============================================================================
// ERREUR
// =============================================================================

export class VNFileError extends Error {
  constructor(message: string, public readonly position?: number) {
    super(position !== undefined ? `${message} at position ${position}` : message);
    this.name = 'VNFileError';
  }
}

// =============================================================================
// LECTEUR BINAIRE
// =============================================================================

class BinaryReader {
  private view: DataView;
  private bytes: Uint8Array;
  pos: number;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.pos = 0;
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  canRead(n: number): boolean {
    return this.pos + n <= this.bytes.length;
  }

  readUint32(): number {
    if (!this.canRead(4)) throw new VNFileError('Unexpected end of data', this.pos);
    const val = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readInt32(): number {
    if (!this.canRead(4)) throw new VNFileError('Unexpected end of data', this.pos);
    const val = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readBytes(n: number): Uint8Array {
    if (!this.canRead(n)) throw new VNFileError(`Cannot read ${n} bytes`, this.pos);
    const data = this.bytes.slice(this.pos, this.pos + n);
    this.pos += n;
    return data;
  }

  skip(n: number): void {
    this.pos += n;
  }

  /**
   * Borland String: uint32LE length + N bytes Latin-1
   */
  readBS(): string {
    const len = this.readUint32();
    if (len === 0) return '';
    if (len > 100000) throw new VNFileError(`BS length too large: ${len}`, this.pos - 4);
    const data = this.readBytes(len);
    // Décodage Latin-1 (chaque byte = code point directement)
    let s = '';
    for (let i = 0; i < data.length; i++) {
      s += String.fromCharCode(data[i]);
    }
    return s;
  }
}

// =============================================================================
// OBJECT READER (0x40d6f4): readWord type + readBS string
// =============================================================================

function readObject(reader: BinaryReader): VNStringObject {
  const type = reader.readUint32();
  const str = reader.readBS();
  return { type, string: str };
}

// =============================================================================
// STRING COLLECTION ITEM (0x40df8b): readWord subIndex + readObject
// =============================================================================

function readCollectionItem(reader: BinaryReader): VNStringCollectionItem {
  const subIndex = reader.readUint32();
  const obj = readObject(reader);
  return { subIndex, type: obj.type, string: obj.string };
}

// =============================================================================
// STRING COLLECTION (0x40e989): readWord count + count × item
// =============================================================================

function readStringCollection(reader: BinaryReader): VNStringCollectionItem[] {
  const count = reader.readUint32();
  const items: VNStringCollectionItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push(readCollectionItem(reader));
  }
  return items;
}

// =============================================================================
// TVNCommand::Read (0x4132f1)
// =============================================================================

function readCommand(reader: BinaryReader, streamVersion: number): VNCommandRaw {
  // 1. String collection
  const strings = readStringCollection(reader);

  // 2. commandType
  const commandType = reader.readUint32();

  // 3. paramPairCount + pairs (coordonnées polygone)
  const paramPairCount = reader.readUint32();
  const paramPairs: VNParamPair[] = [];
  if (paramPairCount > 0 && paramPairCount < 10000) {
    for (let i = 0; i < paramPairCount; i++) {
      const a = reader.readInt32();
      const b = reader.readInt32();
      paramPairs.push({ a, b });
    }
  }

  // 4. Flags (version >= 0x2000c seulement)
  let flags = 0;
  if (streamVersion >= 0x2000c) {
    flags = reader.readUint32();
  }

  return { strings, commandType, paramPairCount, paramPairs, flags };
}

// =============================================================================
// CONTENT COLLECTION (0x413e21): uint32 count + count × TVNCommand
// =============================================================================

function readContentCollection(reader: BinaryReader, streamVersion: number): VNCommandRaw[] {
  const count = reader.readUint32();
  const commands: VNCommandRaw[] = [];
  for (let i = 0; i < count; i++) {
    commands.push(readCommand(reader, streamVersion));
  }
  return commands;
}

// =============================================================================
// HOTSPOT COLLECTION (0x40dc1e): uint32 count + count × readObject
// =============================================================================

function readHotspotCollection(reader: BinaryReader): VNStringObject[] {
  const count = reader.readUint32();
  const objects: VNStringObject[] = [];
  for (let i = 0; i < count; i++) {
    objects.push(readObject(reader));
  }
  return objects;
}

// =============================================================================
// TVNScene::Read (0x4161fa)
// =============================================================================

function readScene(reader: BinaryReader, streamVersion: number): VNSceneRaw {
  // --- Base props (0x414ca1) ---
  const name = reader.readBS();
  const flagBytes = Array.from(reader.readBytes(4));
  const prop1 = reader.readUint32();
  const prop2 = reader.readUint32();
  const prop3 = reader.readUint32();

  // --- TVNScene::Read (version >= 0x2000a) ---
  // 6 paires (BS + uint32), sauf la première qui est 2 BS + uint32
  const string1 = reader.readBS();
  const string2 = reader.readBS();
  const val1 = reader.readUint32();
  const string3 = reader.readBS();
  const val2 = reader.readUint32();
  const string4 = reader.readBS();
  const val3 = reader.readUint32();
  const resource = reader.readBS();
  const val4 = reader.readUint32();
  const string6 = reader.readBS();
  const val5 = reader.readUint32();

  // TRect (4 × int32 = 16 bytes)
  const rect: VNRect = {
    left: reader.readInt32(),
    top: reader.readInt32(),
    right: reader.readInt32(),
    bottom: reader.readInt32(),
  };

  // val6 (field_0x50, usage inconnu)
  reader.readUint32();

  // hotspotCount → si >0: timer + collection
  const hotspotCount = reader.readUint32();
  let hotspot: VNHotspotData | null = null;
  if (hotspotCount > 0) {
    const timerValue = reader.readUint32();
    const objects = readHotspotCollection(reader);
    hotspot = { timerValue, objects };
  }

  // cmdListValue → si ≠0: 5 × readWord
  const cmdListValue = reader.readInt32();
  const cmdListData: number[] = [];
  if (cmdListValue !== 0) {
    for (let i = 0; i < 5; i++) {
      cmdListData.push(reader.readUint32());
    }
  }

  // Content collection (commandes)
  const commands = readContentCollection(reader, streamVersion);

  return {
    name,
    flagBytes,
    prop1, prop2, prop3,
    fields: { string1, string2, val1, string3, val2, string4, val3, resource, val4, string6, val5 },
    rect,
    hotspotCount,
    hotspot,
    cmdListValue,
    cmdListData,
    commands,
  };
}

// =============================================================================
// HEADER PARSING
// =============================================================================

function parseHeader(reader: BinaryReader): VNDHeader {
  // Skip stream header (5 bytes: 0x3A + 1 skip + uint32 version)
  reader.skip(5);

  const magic = reader.readBS();
  if (magic !== 'VNFILE') {
    throw new VNFileError(`Invalid magic: "${magic}"`);
  }

  const version = reader.readBS();
  const sceneCount = reader.readUint32();
  const projectName = reader.readBS();
  const editor = reader.readBS();
  const serial = reader.readBS();
  const projectIDStr = reader.readBS();
  const registry = reader.readBS();

  const width = reader.readUint32();
  const height = reader.readUint32();
  const depth = reader.readUint32();
  const flag = reader.readUint32();

  const u1 = reader.readUint32();
  const u2 = reader.readUint32();
  const reserved = reader.readUint32();

  const dllPath = reader.readBS();
  const varCount = reader.readUint32();

  return {
    magic, version, sceneCount, projectName, editor,
    serial, projectIDStr, registry,
    width, height, depth, flag, u1, u2, reserved,
    dllPath, varCount,
  };
}

// =============================================================================
// VARIABLES PARSING
// =============================================================================

function parseVariables(reader: BinaryReader, count: number): VNVariable[] {
  const vars: VNVariable[] = [];
  for (let i = 0; i < count; i++) {
    const name = reader.readBS();
    const value = reader.readUint32();
    vars.push({ name, value });
  }
  return vars;
}

// =============================================================================
// CLASSE PRINCIPALE
// =============================================================================

export class VNFileLoader {
  /**
   * Parse un fichier VND depuis un ArrayBuffer
   */
  parseVND(buffer: ArrayBuffer, fileName: string = 'unknown.vnd'): VNDFile {
    const reader = new BinaryReader(buffer);

    // Header
    const header = parseHeader(reader);

    // Variables
    const variables = parseVariables(reader, header.varCount);

    // Version du stream depuis la string version
    // "2.13" → 0x2000d (version 2, sub 13 = 0xD)
    const versionParts = header.version.split('.');
    const streamVersion = (parseInt(versionParts[0]) << 16) | parseInt(versionParts[1] || '0');

    // Scènes
    const scenes: VNSceneRaw[] = [];
    const errors: string[] = [];

    for (let i = 0; i < header.sceneCount; i++) {
      try {
        scenes.push(readScene(reader, streamVersion));
      } catch (e) {
        errors.push(`Scene ${i}: ${(e as Error).message} at pos ${reader.pos}`);
        break;
      }
    }

    return {
      fileName,
      fileSize: buffer.byteLength,
      header,
      variables,
      scenes,
      streamVersion,
      bytesRemaining: reader.remaining,
      errors,
    };
  }

  /**
   * Parse un fichier VND depuis un Uint8Array
   */
  parseVNDFromBytes(data: Uint8Array, fileName?: string): VNDFile {
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    return this.parseVND(ab, fileName);
  }
}

export const vnFileLoader = new VNFileLoader();
