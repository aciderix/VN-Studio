/**
 * VNFileLoader - Parser pour les fichiers Virtual Navigator
 * Formats supportés: VNFILE (.vnp), DATFILE, VNSAVFILE
 *
 * Basé sur la rétro-ingénierie de europeo.exe (Virtual Navigator 2.1)
 * Utilise le format de sérialisation Borland C++ (ipstream/opstream)
 */

import {
  VNProject,
  VNScene,
  VNHotspot,
  VNCommand,
  VNCommandType,
  VNVariable,
  VNGdiObject,
  VNDisplayMode,
  VNRect,
  VNPoint,
} from '../types/vn.types';

/**
 * Buffer Reader - Lecture binaire avec position
 */
class BinaryReader {
  private buffer: ArrayBuffer;
  private view: DataView;
  private position: number = 0;
  private textDecoder: TextDecoder;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.textDecoder = new TextDecoder('windows-1252'); // Encodage Windows Europe de l'Ouest
  }

  get pos(): number {
    return this.position;
  }

  get length(): number {
    return this.buffer.byteLength;
  }

  get remaining(): number {
    return this.length - this.position;
  }

  seek(offset: number): void {
    this.position = offset;
  }

  skip(bytes: number): void {
    this.position += bytes;
  }

  // Lecture d'entiers
  readInt8(): number {
    const value = this.view.getInt8(this.position);
    this.position += 1;
    return value;
  }

  readUint8(): number {
    const value = this.view.getUint8(this.position);
    this.position += 1;
    return value;
  }

  readInt16(): number {
    const value = this.view.getInt16(this.position, true); // Little-endian
    this.position += 2;
    return value;
  }

  readUint16(): number {
    const value = this.view.getUint16(this.position, true);
    this.position += 2;
    return value;
  }

  readInt32(): number {
    const value = this.view.getInt32(this.position, true);
    this.position += 4;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.position, true);
    this.position += 4;
    return value;
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this.position, true);
    this.position += 4;
    return value;
  }

  readFloat64(): number {
    const value = this.view.getFloat64(this.position, true);
    this.position += 8;
    return value;
  }

  // Lecture de booléen (1 byte)
  readBool(): boolean {
    return this.readUint8() !== 0;
  }

  // Lecture d'octets bruts
  readBytes(count: number): Uint8Array {
    const bytes = new Uint8Array(this.buffer, this.position, count);
    this.position += count;
    return bytes;
  }

  // Lecture de chaîne null-terminée
  readCString(maxLength: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLength; i++) {
      const byte = this.readUint8();
      if (byte === 0) break;
      bytes.push(byte);
    }
    return this.textDecoder.decode(new Uint8Array(bytes));
  }

  // Lecture de chaîne avec longueur préfixée (format Borland)
  readBorlandString(): string {
    const length = this.readUint16();
    if (length === 0) return '';
    const bytes = this.readBytes(length);
    return this.textDecoder.decode(bytes);
  }

  // Lecture de chaîne fixe (sans null-terminator)
  readFixedString(length: number): string {
    const bytes = this.readBytes(length);
    // Trouver le premier null
    let end = bytes.indexOf(0);
    if (end === -1) end = length;
    return this.textDecoder.decode(bytes.slice(0, end));
  }

  // Lecture TRect (Borland)
  readRect(): VNRect {
    return {
      left: this.readInt32(),
      top: this.readInt32(),
      right: this.readInt32(),
      bottom: this.readInt32(),
    };
  }

  // Lecture TPoint
  readPoint(): VNPoint {
    return {
      x: this.readInt32(),
      y: this.readInt32(),
    };
  }

  // Vérification magic string
  checkMagic(expected: string): boolean {
    const magic = this.readCString(expected.length + 1);
    return magic === expected;
  }

  // Peek sans avancer
  peekUint8(): number {
    return this.view.getUint8(this.position);
  }

  peekUint16(): number {
    return this.view.getUint16(this.position, true);
  }

  peekUint32(): number {
    return this.view.getUint32(this.position, true);
  }
}

/**
 * Exception pour les erreurs de parsing
 */
export class VNFileError extends Error {
  constructor(
    message: string,
    public readonly offset?: number
  ) {
    super(offset !== undefined ? `${message} (at offset 0x${offset.toString(16)})` : message);
    this.name = 'VNFileError';
  }
}

/**
 * Types de commandes mapping
 */
const CommandTypeMap: Record<number, VNCommandType> = {
  0: VNCommandType.GOTO,
  1: VNCommandType.SETVAR,
  2: VNCommandType.INCVAR,
  3: VNCommandType.DECVAR,
  4: VNCommandType.IF,
  5: VNCommandType.EXEC,
  6: VNCommandType.WAVE,
  7: VNCommandType.MIDI,
  8: VNCommandType.CDAUDIO,
  9: VNCommandType.AVI,
  10: VNCommandType.IMAGE,
  11: VNCommandType.TEXT,
  12: VNCommandType.FONT,
  13: VNCommandType.HTML,
  14: VNCommandType.HIDE,
  15: VNCommandType.SHOW,
  16: VNCommandType.SCROLL,
  17: VNCommandType.ZOOM,
  18: VNCommandType.WAIT,
  19: VNCommandType.RETURN,
  20: VNCommandType.EXIT,
  21: VNCommandType.IMGOBJ,
  22: VNCommandType.IMGSEQ,
  23: VNCommandType.TEXTOBJ,
  24: VNCommandType.DIGIT,
  25: VNCommandType.CURSOR,
  26: VNCommandType.STOPAUDIO,
  27: VNCommandType.STOPVIDEO,
};

/**
 * VNFileLoader - Classe principale de chargement
 */
export class VNFileLoader {
  /**
   * Charge un fichier projet VNFILE (.vnp)
   */
  async loadProject(fileOrUrl: File | string): Promise<VNProject> {
    const buffer = await this.loadBuffer(fileOrUrl);
    return this.parseVNFile(buffer);
  }

  /**
   * Charge un fichier DATFILE (ressources)
   */
  async loadDataFile(fileOrUrl: File | string): Promise<VNDataFile> {
    const buffer = await this.loadBuffer(fileOrUrl);
    return this.parseDatFile(buffer);
  }

  /**
   * Charge un fichier de sauvegarde VNSAVFILE
   */
  async loadSaveFile(fileOrUrl: File | string): Promise<VNSaveData> {
    const buffer = await this.loadBuffer(fileOrUrl);
    return this.parseSaveFile(buffer);
  }

  /**
   * Charge un buffer depuis File ou URL
   */
  private async loadBuffer(fileOrUrl: File | string): Promise<ArrayBuffer> {
    if (typeof fileOrUrl === 'string') {
      const response = await fetch(fileOrUrl);
      if (!response.ok) {
        throw new VNFileError(`Failed to fetch: ${response.statusText}`);
      }
      return response.arrayBuffer();
    } else {
      return fileOrUrl.arrayBuffer();
    }
  }

  /**
   * Parse un fichier VNFILE
   */
  private parseVNFile(buffer: ArrayBuffer): VNProject {
    const reader = new BinaryReader(buffer);

    // Vérifier le magic "VNFILE"
    if (!reader.checkMagic('VNFILE')) {
      throw new VNFileError('Invalid VNFILE: magic header not found', 0);
    }

    // Lire la version (format Borland readVersion)
    const version = this.readVersion(reader);
    console.log(`VNFile version: ${version.major}.${version.minor}`);

    // Paramètres du projet
    const projectParams = this.readProjectParams(reader);

    // Scènes
    const sceneCount = reader.readUint16();
    const scenes: VNScene[] = [];

    for (let i = 0; i < sceneCount; i++) {
      scenes.push(this.readScene(reader, i));
    }

    // Variables globales
    const variables = this.readVariables(reader);

    return {
      name: projectParams.name,
      version: `${version.major}.${version.minor}`,
      displayWidth: projectParams.displayWidth,
      displayHeight: projectParams.displayHeight,
      colorDepth: projectParams.colorDepth,
      displayMode: projectParams.displayMode,
      dataFilePath: projectParams.dataFilePath,
      scenes,
      variables,
      startSceneIndex: 0,
    };
  }

  /**
   * Lit la version Borland
   */
  private readVersion(reader: BinaryReader): { major: number; minor: number } {
    // Format Borland: version stockée comme word (major << 8 | minor) ou similaire
    const versionWord = reader.readUint16();
    return {
      major: (versionWord >> 8) & 0xff,
      minor: versionWord & 0xff,
    };
  }

  /**
   * Lit les paramètres du projet
   */
  private readProjectParams(reader: BinaryReader): VNProjectParams {
    const name = reader.readBorlandString();
    const dataFilePath = reader.readBorlandString();
    const displayWidth = reader.readUint16();
    const displayHeight = reader.readUint16();
    const colorDepth = reader.readUint8();
    const displayModeValue = reader.readUint8();

    const displayMode: VNDisplayMode =
      displayModeValue === 0
        ? VNDisplayMode.WINDOWED
        : displayModeValue === 1
          ? VNDisplayMode.FULLSCREEN
          : VNDisplayMode.BORDERLESS;

    // Autres paramètres potentiels
    const hasToolbar = reader.readBool();
    const smoothZoom = reader.readBool();
    const smoothScroll = reader.readBool();

    return {
      name,
      dataFilePath,
      displayWidth,
      displayHeight,
      colorDepth,
      displayMode,
      hasToolbar,
      smoothZoom,
      smoothScroll,
    };
  }

  /**
   * Lit une scène
   */
  private readScene(reader: BinaryReader, index: number): VNScene {
    const name = reader.readBorlandString();
    const backgroundFile = reader.readBorlandString();

    // Propriétés de la scène
    const properties = this.readSceneProperties(reader);

    // Hotspots
    const hotspotCount = reader.readUint16();
    const hotspots: VNHotspot[] = [];
    for (let i = 0; i < hotspotCount; i++) {
      hotspots.push(this.readHotspot(reader, i));
    }

    // Commandes d'entrée
    const commandCount = reader.readUint16();
    const onEnterCommands: VNCommand[] = [];
    for (let i = 0; i < commandCount; i++) {
      onEnterCommands.push(this.readCommand(reader));
    }

    // Commandes de sortie
    const exitCommandCount = reader.readUint16();
    const onExitCommands: VNCommand[] = [];
    for (let i = 0; i < exitCommandCount; i++) {
      onExitCommands.push(this.readCommand(reader));
    }

    // Objets GDI
    const gdiCount = reader.readUint16();
    const gdiObjects: VNGdiObject[] = [];
    for (let i = 0; i < gdiCount; i++) {
      gdiObjects.push(this.readGdiObject(reader));
    }

    return {
      id: `scene_${index}`,
      name,
      index,
      backgroundFile,
      properties,
      hotspots,
      onEnterCommands,
      onExitCommands,
      gdiObjects,
    };
  }

  /**
   * Lit les propriétés d'une scène
   */
  private readSceneProperties(reader: BinaryReader): VNSceneProperties {
    return {
      backgroundColor: reader.readUint32(),
      hasTimer: reader.readBool(),
      timerDelay: reader.readUint32(),
      timerTargetScene: reader.readBorlandString(),
      musicFile: reader.readBorlandString(),
      musicLoop: reader.readBool(),
    };
  }

  /**
   * Lit un hotspot
   */
  private readHotspot(reader: BinaryReader, index: number): VNHotspot {
    const name = reader.readBorlandString();
    const shapeType = reader.readUint8();

    let bounds: VNRect | undefined;
    let polygon: VNPoint[] | undefined;

    if (shapeType === 0) {
      // Rectangle
      bounds = reader.readRect();
    } else {
      // Polygone
      const pointCount = reader.readUint16();
      polygon = [];
      for (let i = 0; i < pointCount; i++) {
        polygon.push(reader.readPoint());
      }
    }

    const cursorFile = reader.readBorlandString();
    const enabled = reader.readBool();

    // Commandes onClick
    const clickCount = reader.readUint16();
    const onClickCommands: VNCommand[] = [];
    for (let i = 0; i < clickCount; i++) {
      onClickCommands.push(this.readCommand(reader));
    }

    // Commandes onEnter (survol)
    const enterCount = reader.readUint16();
    const onEnterCommands: VNCommand[] = [];
    for (let i = 0; i < enterCount; i++) {
      onEnterCommands.push(this.readCommand(reader));
    }

    // Commandes onExit
    const exitCount = reader.readUint16();
    const onExitCommands: VNCommand[] = [];
    for (let i = 0; i < exitCount; i++) {
      onExitCommands.push(this.readCommand(reader));
    }

    return {
      id: `hotspot_${index}`,
      name,
      bounds,
      polygon,
      cursorFile: cursorFile || undefined,
      enabled,
      onClickCommands,
      onEnterCommands,
      onExitCommands,
    };
  }

  /**
   * Lit une commande
   */
  private readCommand(reader: BinaryReader): VNCommand {
    const typeValue = reader.readUint16();
    const type = CommandTypeMap[typeValue] || VNCommandType.UNKNOWN;

    const command: VNCommand = {
      type,
      params: {},
    };

    // Lecture des paramètres selon le type
    switch (type) {
      case VNCommandType.GOTO:
        command.params = {
          sceneIndex: reader.readUint16(),
          sceneName: reader.readBorlandString(),
        };
        break;

      case VNCommandType.SETVAR:
        command.params = {
          varName: reader.readBorlandString(),
          value: reader.readInt32(),
        };
        break;

      case VNCommandType.INCVAR:
      case VNCommandType.DECVAR:
        command.params = {
          varName: reader.readBorlandString(),
          amount: reader.readInt32() || 1,
        };
        break;

      case VNCommandType.IF:
        command.params = {
          varName: reader.readBorlandString(),
          operator: reader.readUint8(), // 0: ==, 1: !=, 2: <, 3: >, 4: <=, 5: >=
          compareValue: reader.readInt32(),
          thenCommand: this.readCommand(reader),
          elseCommand: reader.readBool() ? this.readCommand(reader) : undefined,
        };
        break;

      case VNCommandType.EXEC:
        command.params = {
          program: reader.readBorlandString(),
          arguments: reader.readBorlandString(),
          waitForCompletion: reader.readBool(),
        };
        break;

      case VNCommandType.WAVE:
      case VNCommandType.AVI:
        command.params = {
          filename: reader.readBorlandString(),
          loop: reader.readBool(),
        };
        break;

      case VNCommandType.MIDI:
        command.params = {
          filename: reader.readBorlandString(),
          loop: reader.readBool(),
          volume: reader.readUint8(),
        };
        break;

      case VNCommandType.CDAUDIO:
        command.params = {
          track: reader.readUint8(),
          loop: reader.readBool(),
        };
        break;

      case VNCommandType.IMAGE:
      case VNCommandType.IMGOBJ:
        command.params = {
          filename: reader.readBorlandString(),
          x: reader.readInt16(),
          y: reader.readInt16(),
          transparent: reader.readBool(),
          transparentColor: reader.readUint32(),
        };
        break;

      case VNCommandType.TEXT:
      case VNCommandType.TEXTOBJ:
        command.params = {
          text: reader.readBorlandString(),
          x: reader.readInt16(),
          y: reader.readInt16(),
          color: reader.readUint32(),
          fontName: reader.readBorlandString(),
          fontSize: reader.readUint16(),
          fontStyle: reader.readUint8(),
        };
        break;

      case VNCommandType.HTML:
        command.params = {
          content: reader.readBorlandString(),
          bounds: reader.readRect(),
        };
        break;

      case VNCommandType.FONT:
        command.params = {
          fontName: reader.readBorlandString(),
          fontSize: reader.readUint16(),
          fontStyle: reader.readUint8(),
          color: reader.readUint32(),
        };
        break;

      case VNCommandType.HIDE:
      case VNCommandType.SHOW:
        command.params = {
          objectName: reader.readBorlandString(),
        };
        break;

      case VNCommandType.SCROLL:
        command.params = {
          direction: reader.readUint8(), // 0: up, 1: down, 2: left, 3: right
          duration: reader.readUint32(),
          targetScene: reader.readBorlandString(),
        };
        break;

      case VNCommandType.ZOOM:
        command.params = {
          startZoom: reader.readFloat32(),
          endZoom: reader.readFloat32(),
          centerX: reader.readInt16(),
          centerY: reader.readInt16(),
          duration: reader.readUint32(),
        };
        break;

      case VNCommandType.WAIT:
        command.params = {
          duration: reader.readUint32(),
        };
        break;

      case VNCommandType.CURSOR:
        command.params = {
          cursorFile: reader.readBorlandString(),
        };
        break;

      case VNCommandType.IMGSEQ:
        command.params = {
          filenamePattern: reader.readBorlandString(),
          startFrame: reader.readUint16(),
          endFrame: reader.readUint16(),
          x: reader.readInt16(),
          y: reader.readInt16(),
          delay: reader.readUint32(),
          loop: reader.readBool(),
        };
        break;

      case VNCommandType.DIGIT:
        command.params = {
          varName: reader.readBorlandString(),
          x: reader.readInt16(),
          y: reader.readInt16(),
          digitCount: reader.readUint8(),
          digitImages: reader.readBorlandString(), // Pattern pour 0-9
        };
        break;

      case VNCommandType.RETURN:
      case VNCommandType.EXIT:
      case VNCommandType.STOPAUDIO:
      case VNCommandType.STOPVIDEO:
        // Pas de paramètres
        break;

      default:
        // Commande inconnue - essayer de lire la taille et skipper
        console.warn(`Unknown command type: ${typeValue}`);
        break;
    }

    return command;
  }

  /**
   * Lit un objet GDI
   */
  private readGdiObject(reader: BinaryReader): VNGdiObject {
    const type = reader.readUint8(); // 0: image, 1: text, 2: html
    const name = reader.readBorlandString();
    const visible = reader.readBool();
    const bounds = reader.readRect();

    const obj: VNGdiObject = {
      id: name,
      type: type === 0 ? 'image' : type === 1 ? 'text' : 'html',
      name,
      visible,
      bounds,
    };

    if (obj.type === 'image') {
      obj.filename = reader.readBorlandString();
      obj.transparent = reader.readBool();
      obj.transparentColor = reader.readUint32();
    } else if (obj.type === 'text') {
      obj.text = reader.readBorlandString();
      obj.color = reader.readUint32();
      obj.fontName = reader.readBorlandString();
      obj.fontSize = reader.readUint16();
    } else if (obj.type === 'html') {
      obj.content = reader.readBorlandString();
    }

    return obj;
  }

  /**
   * Lit les variables
   */
  private readVariables(reader: BinaryReader): Map<string, VNVariable> {
    const variables = new Map<string, VNVariable>();

    // Vérifier s'il reste des données
    if (reader.remaining < 2) {
      return variables;
    }

    const count = reader.readUint16();

    for (let i = 0; i < count; i++) {
      const name = reader.readBorlandString().toUpperCase();
      const value = reader.readInt32();

      variables.set(name, {
        name,
        value,
      });
    }

    return variables;
  }

  /**
   * Parse un fichier DATFILE
   */
  private parseDatFile(buffer: ArrayBuffer): VNDataFile {
    const reader = new BinaryReader(buffer);

    // Vérifier le magic "DATFILE"
    if (!reader.checkMagic('DATFILE')) {
      throw new VNFileError('Invalid DATFILE: magic header not found', 0);
    }

    const resources: VNResource[] = [];

    // Lire l'index des ressources
    while (reader.remaining > 0) {
      const section = reader.readBorlandString();
      if (!section) break;

      const resourceCount = reader.readUint16();

      for (let i = 0; i < resourceCount; i++) {
        const name = reader.readBorlandString();
        const offset = reader.readUint32();
        const size = reader.readUint32();

        resources.push({
          section,
          name,
          offset,
          size,
        });
      }
    }

    return {
      resources,
      buffer,
    };
  }

  /**
   * Parse un fichier de sauvegarde
   */
  private parseSaveFile(buffer: ArrayBuffer): VNSaveData {
    const reader = new BinaryReader(buffer);

    // Vérifier le magic "VNSAVFILE"
    if (!reader.checkMagic('VNSAVFILE')) {
      throw new VNFileError('Invalid VNSAVFILE: magic header not found', 0);
    }

    const currentSceneIndex = reader.readUint16();
    const variables = this.readVariables(reader);

    // Historique
    const historyCount = reader.readUint16();
    const history: number[] = [];
    for (let i = 0; i < historyCount; i++) {
      history.push(reader.readUint16());
    }

    return {
      currentSceneIndex,
      variables,
      history,
    };
  }

  /**
   * Extrait une ressource du DATFILE
   */
  extractResource(dataFile: VNDataFile, resource: VNResource): ArrayBuffer {
    return dataFile.buffer.slice(resource.offset, resource.offset + resource.size);
  }

  /**
   * Extrait une image du DATFILE
   */
  async extractImage(
    dataFile: VNDataFile,
    resource: VNResource
  ): Promise<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
    palette?: Uint8Array;
  }> {
    const buffer = this.extractResource(dataFile, resource);
    const reader = new BinaryReader(buffer);

    // Format IMG8 ou IMG24
    const width = reader.readUint16();
    const height = reader.readUint16();
    const bpp = reader.readUint8(); // 8 ou 24

    if (bpp === 8) {
      // Image palettisée
      const palette = reader.readBytes(256 * 4); // RGBX
      const pixels = reader.readBytes(width * height);

      // Convertir en RGBA
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < pixels.length; i++) {
        const colorIndex = pixels[i];
        data[i * 4] = palette[colorIndex * 4]; // R
        data[i * 4 + 1] = palette[colorIndex * 4 + 1]; // G
        data[i * 4 + 2] = palette[colorIndex * 4 + 2]; // B
        data[i * 4 + 3] = 255; // A
      }

      return { width, height, data, palette };
    } else {
      // Image 24-bit
      const pixels = reader.readBytes(width * height * 3);
      const data = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        data[i * 4] = pixels[i * 3]; // R
        data[i * 4 + 1] = pixels[i * 3 + 1]; // G
        data[i * 4 + 2] = pixels[i * 3 + 2]; // B
        data[i * 4 + 3] = 255; // A
      }

      return { width, height, data };
    }
  }
}

// Types auxiliaires
interface VNProjectParams {
  name: string;
  dataFilePath: string;
  displayWidth: number;
  displayHeight: number;
  colorDepth: number;
  displayMode: VNDisplayMode;
  hasToolbar: boolean;
  smoothZoom: boolean;
  smoothScroll: boolean;
}

interface VNSceneProperties {
  backgroundColor: number;
  hasTimer: boolean;
  timerDelay: number;
  timerTargetScene: string;
  musicFile: string;
  musicLoop: boolean;
}

export interface VNDataFile {
  resources: VNResource[];
  buffer: ArrayBuffer;
}

export interface VNResource {
  section: string;
  name: string;
  offset: number;
  size: number;
}

export interface VNSaveData {
  currentSceneIndex: number;
  variables: Map<string, VNVariable>;
  history: number[];
}

// Export singleton
export const vnFileLoader = new VNFileLoader();
