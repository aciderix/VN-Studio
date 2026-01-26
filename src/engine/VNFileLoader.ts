/**
 * VNFileLoader - Parser pour les fichiers Virtual Navigator
 * Formats supportés: VNFILE (.vnp), DATFILE, VNSAVFILE
 *
 * Basé sur la rétro-ingénierie de europeo.exe (Virtual Navigator 2.1)
 * Utilise le format de sérialisation Borland C++ (ipstream/opstream)
 */

import {
  VNProject,
  VNSceneParsed,
  VNHotspotParsed,
  VNCommandGeneric,
  VNCommandType,
  VNVariable,
  VNGdiObjectGeneric,
  VNDisplayModeType,
  VNRect,
  VNPoint,
} from '../types/vn.types';

// Alias pour compatibilité
type VNScene = VNSceneParsed;
type VNHotspot = VNHotspotParsed;
type VNCommand = VNCommandGeneric;
type VNGdiObject = VNGdiObjectGeneric;

/**
 * Information sur un opcode suffixe
 * Découvert dans europeo.exe @ sub_43177D (table de dispatch)
 */
interface VNOpcodeInfo {
  code: number;       // Index dans la table de dispatch
  name: string;       // Nom de l'opcode (DIRECT_JUMP, SCENE_JUMP, etc.)
  description: string; // Description en français
}

/**
 * Référence parsée avec opcode
 * Format: "[+-]<nombre><opcode_letter>"
 */
interface VNOpcodeRef {
  raw: string;           // Chaîne originale
  value?: number;        // Valeur numérique extraite
  isRelative?: boolean;  // true si préfixé par + ou -
  opcode?: VNOpcodeInfo; // Opcode détecté (d, f, h, i, j, k, l)
  sceneName?: string;    // Nom de scène si pas de nombre
}

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
  // IMPORTANT: Le format VN utilise uint32 pour la longueur (pas uint16!)
  // Confirmé par hex dump: 11 00 00 00 = 17 (uint32 LE) suivi de "euroland\face.bmp"
  readBorlandString(): string {
    const length = this.readUint32();
    if (length === 0) return '';
    // Protection contre les longueurs invalides
    if (length > this.remaining || length > 0x10000) {
      throw new Error(`Invalid string length: ${length} at offset 0x${(this.position - 4).toString(16)}`);
    }
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
 * Mapping des noms de commandes textuelles vers les types
 * Extrait de europeo.exe @ 0x43f700
 */
const CommandNameMap: Record<string, VNCommandType> = {
  // Navigation
  'scene': VNCommandType.GOTO,
  'quit': VNCommandType.EXIT,
  'prev': VNCommandType.RETURN,
  'next': VNCommandType.GOTO,
  'about': VNCommandType.UNKNOWN,
  'prefs': VNCommandType.UNKNOWN,

  // Variables
  'set_var': VNCommandType.SETVAR,
  'inc_var': VNCommandType.INCVAR,
  'dec_var': VNCommandType.DECVAR,
  'if': VNCommandType.IF,

  // Média audio
  'playwav': VNCommandType.WAVE,
  'playmid': VNCommandType.MIDI,
  'playcda': VNCommandType.CDAUDIO,
  'closewav': VNCommandType.STOPAUDIO,
  'closemid': VNCommandType.STOPAUDIO,

  // Vidéo
  'playavi': VNCommandType.AVI,
  'closeavi': VNCommandType.STOPVIDEO,

  // Images/Bitmaps
  'addbmp': VNCommandType.IMAGE,
  'delbmp': VNCommandType.HIDE,
  'showbmp': VNCommandType.SHOW,
  'hidebmp': VNCommandType.HIDE,
  'playbmp': VNCommandType.IMGSEQ,
  'playseq': VNCommandType.IMGSEQ,

  // Texte
  'addtext': VNCommandType.TEXT,
  'playtext': VNCommandType.TEXT,
  'font': VNCommandType.FONT,
  'playhtml': VNCommandType.HTML,
  'tiptext': VNCommandType.TEXT,

  // Objets
  'showobj': VNCommandType.SHOW,
  'hideobj': VNCommandType.HIDE,
  'delobj': VNCommandType.HIDE,

  // Zoom/Effets
  'zoom': VNCommandType.ZOOM,
  'zoomin': VNCommandType.ZOOM,
  'zoomout': VNCommandType.ZOOM,
  'pause': VNCommandType.WAIT,

  // Système
  'exec': VNCommandType.EXEC,
  'explore': VNCommandType.EXEC,
  'rundll': VNCommandType.EXEC,
  'runprj': VNCommandType.EXEC,
  'load': VNCommandType.UNKNOWN,
  'save': VNCommandType.UNKNOWN,
  'msgbox': VNCommandType.TEXT,
  'playcmd': VNCommandType.UNKNOWN,
  'update': VNCommandType.UNKNOWN,
  'invalidate': VNCommandType.UNKNOWN,
  'defcursor': VNCommandType.CURSOR,
  'rem': VNCommandType.UNKNOWN, // Commentaire
  'closedll': VNCommandType.UNKNOWN,
  'hotspot': VNCommandType.UNKNOWN,
};

/**
 * Parse une commande textuelle et retourne le type
 */
function parseCommandName(name: string): VNCommandType {
  const normalized = name.toLowerCase().trim();
  return CommandNameMap[normalized] || VNCommandType.UNKNOWN;
}

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
    // Calculer le mot de version pour les comparaisons (format 0x2000a, 0x2000b, etc.)
    const versionWord = (version.major << 12) | version.minor;
    console.log(`VNFile version: ${version.major}.${version.minor} (0x${versionWord.toString(16)})`);

    // Paramètres du projet (dépend de la version)
    const projectParams = this.readProjectParams(reader, versionWord);

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
   * Lit les paramètres du projet (version-aware)
   *
   * Structure basée sur l'analyse de fcn.0041721d:
   * - Version >= 0x2000a (2.0.10): champ dataFilePath ajouté
   * - Version >= 0x2000b (2.0.11): champs additionnels
   * - Version >= 0x2000d (2.0.13): encore plus de champs
   */
  private readProjectParams(reader: BinaryReader, versionWord: number): VNProjectParams {
    // Nom du projet (toujours présent)
    const name = reader.readBorlandString();

    // Champ additionnel pour version >= 0x2000d (usage futur, structure inconnue)
    if (versionWord >= 0x2000d) {
      reader.readBorlandString(); // Skip extra field
    }

    // Paramètres d'affichage
    const displayWidth = reader.readUint16();
    const displayHeight = reader.readUint16();

    // Champ additionnel pour version >= 0x2000b (usage futur, structure inconnue)
    if (versionWord >= 0x2000b) {
      reader.readUint16(); // Skip extra word
    }

    // Chemin du fichier de données (version >= 0x2000a)
    let dataFilePath = '';
    if (versionWord >= 0x2000a) {
      dataFilePath = reader.readBorlandString();
    }

    // Profondeur de couleur et mode d'affichage
    const colorDepth = reader.readUint8();
    const displayModeValue = reader.readUint8();

    const displayMode: VNDisplayModeType =
      displayModeValue === 0
        ? VNDisplayModeType.WINDOWED
        : displayModeValue === 1
          ? VNDisplayModeType.FULLSCREEN
          : VNDisplayModeType.BORDERLESS;

    // Autres paramètres optionnels
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
      properties: { ...properties } as Record<string, unknown>,
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
   * Lit une commande (format textuel)
   * Le format VN utilise des commandes textuelles comme "playwav", "set_var", etc.
   * Format typique: "commande param1,param2,param3" ou données binaires additionnelles
   */
  private readCommand(reader: BinaryReader): VNCommand {
    // Lire la chaîne de commande textuelle
    const commandStr = reader.readBorlandString();

    // Parser les paramètres de la commande textuelle
    // Format typique: "commande param1,param2,param3" ou "commande param1 param2"
    const parts = commandStr.split(/[\s,]+/);
    const cmdName = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);

    const type = parseCommandName(cmdName);

    const command: VNCommand = {
      type,
      params: { rawCommand: commandStr },
    };

    // Lecture des paramètres selon le type de commande
    switch (cmdName) {
      // === NAVIGATION ===
      case 'scene':
        // Format: "scene <ref>" où ref peut être:
        // - Un nom de scène: "menu"
        // - Un index avec suffixe: "57j", "13i", "38"
        {
          const sceneRef = args[0] || '';
          const sceneRefParsed = this.parseSceneReference(sceneRef);
          command.params = {
            ...command.params,
            sceneName: sceneRef,
            sceneIndex: sceneRefParsed.index,
            sceneSuffix: sceneRefParsed.suffix,
          };
        }
        break;

      case 'next':
      case 'prev':
        // Navigation simple, pas de paramètres nécessaires
        break;

      case 'quit':
        // Peut avoir un code de sortie optionnel
        command.params = {
          ...command.params,
          exitCode: args[0] ? parseInt(args[0]) : 0,
        };
        break;

      // === VARIABLES ===
      case 'set_var':
        // Format: "set_var VARNAME value" ou "set_var VARNAME RANDOM min max"
        if (args[1]?.toUpperCase() === 'RANDOM') {
          command.params = {
            ...command.params,
            varName: args[0]?.toUpperCase() || '',
            random: true,
            min: parseInt(args[2]) || 0,
            max: parseInt(args[3]) || 100,
          };
        } else {
          command.params = {
            ...command.params,
            varName: args[0]?.toUpperCase() || '',
            value: parseInt(args[1]) || 0,
          };
        }
        break;

      case 'inc_var':
        // Format: "inc_var VARNAME [amount]"
        command.params = {
          ...command.params,
          varName: args[0]?.toUpperCase() || '',
          amount: parseInt(args[1]) || 1,
        };
        break;

      case 'dec_var':
        // Format: "dec_var VARNAME [amount]"
        command.params = {
          ...command.params,
          varName: args[0]?.toUpperCase() || '',
          amount: parseInt(args[1]) || 1,
        };
        break;

      case 'if':
        // Format: "if VARNAME operator value" + données binaires pour then/else
        // Opérateurs: =, !=, <, >, <=, >=
        command.params = {
          ...command.params,
          varName: args[0]?.toUpperCase() || '',
          operator: args[1] || '=',
          compareValue: this.parseValue(args[2]),
          thenCommand: this.readCommand(reader),
          elseCommand: reader.readBool() ? this.readCommand(reader) : undefined,
        };
        break;

      // === MÉDIA AUDIO ===
      case 'playwav':
        // Format: "playwav filename [loop]"
        command.params = {
          ...command.params,
          filename: args[0] || '',
          loop: args[1]?.toLowerCase() === 'loop' || args[1] === '1',
        };
        break;

      case 'playmid':
        // Format: "playmid filename [loop] [volume]"
        command.params = {
          ...command.params,
          filename: args[0] || '',
          loop: args[1]?.toLowerCase() === 'loop' || args[1] === '1',
          volume: parseInt(args[2]) || 100,
        };
        break;

      case 'playcda':
        // Format: "playcda track [loop]"
        command.params = {
          ...command.params,
          track: parseInt(args[0]) || 1,
          loop: args[1]?.toLowerCase() === 'loop' || args[1] === '1',
        };
        break;

      case 'closewav':
      case 'closemid':
        // Arrêt audio - pas de paramètres
        break;

      // === VIDÉO ===
      case 'playavi':
        // Format: "playavi filename [x,y,width,height] [loop]"
        command.params = {
          ...command.params,
          filename: args[0] || '',
          x: parseInt(args[1]) || 0,
          y: parseInt(args[2]) || 0,
          width: parseInt(args[3]) || 0,
          height: parseInt(args[4]) || 0,
          loop: args[5]?.toLowerCase() === 'loop',
        };
        break;

      case 'closeavi':
        // Arrêt vidéo - pas de paramètres
        break;

      // === IMAGES/BITMAPS ===
      case 'addbmp':
        // Format: "addbmp objname filename x y [transparent] [color]"
        command.params = {
          ...command.params,
          objectName: args[0] || '',
          filename: args[1] || '',
          x: parseInt(args[2]) || 0,
          y: parseInt(args[3]) || 0,
          transparent: args[4]?.toLowerCase() === 'transparent' || args[4] === '1',
          transparentColor: parseInt(args[5]) || 0xFF00FF, // Magenta par défaut
        };
        break;

      case 'delbmp':
      case 'showbmp':
      case 'hidebmp':
        // Format: "delbmp objname" ou "showbmp objname" ou "hidebmp objname"
        command.params = {
          ...command.params,
          objectName: args[0] || '',
        };
        break;

      case 'playbmp':
      case 'playseq':
        // Format: "playseq pattern startframe endframe x y delay [loop]"
        command.params = {
          ...command.params,
          filenamePattern: args[0] || '',
          startFrame: parseInt(args[1]) || 0,
          endFrame: parseInt(args[2]) || 0,
          x: parseInt(args[3]) || 0,
          y: parseInt(args[4]) || 0,
          delay: parseInt(args[5]) || 100,
          loop: args[6]?.toLowerCase() === 'loop',
        };
        break;

      // === TEXTE ===
      case 'addtext':
        // Format: "addtext objname text x y"
        command.params = {
          ...command.params,
          objectName: args[0] || '',
          text: args.slice(1, -2).join(' '),
          x: parseInt(args[args.length - 2]) || 0,
          y: parseInt(args[args.length - 1]) || 0,
        };
        break;

      case 'playtext':
        // Format: "playtext objname text x y"
        command.params = {
          ...command.params,
          objectName: args[0] || '',
          text: args.slice(1, -2).join(' '),
          x: parseInt(args[args.length - 2]) || 0,
          y: parseInt(args[args.length - 1]) || 0,
        };
        break;

      case 'font':
        // Format découvert: "%u %u #%lX %i %u %s"
        // Exemple: "18 0 #ffffff Comic sans MS"
        // Args: [size, style, #color, ...fontname_parts]
        {
          const fontParts: string[] = [];
          let fontColor = 0x000000;
          let fontStyle = 0;
          let fontSize = 12;

          for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (i === 0) {
              fontSize = parseInt(arg) || 12;
            } else if (i === 1) {
              fontStyle = parseInt(arg) || 0;
            } else if (arg.startsWith('#')) {
              // Parse hex color (#RRGGBB or #RGB)
              fontColor = this.parseHexColor(arg);
            } else if (!isNaN(parseInt(arg)) && fontParts.length === 0) {
              // Skip numeric values before font name
              continue;
            } else {
              fontParts.push(arg);
            }
          }

          command.params = {
            ...command.params,
            fontSize,
            fontStyle, // 0 = normal, 1 = bold, 2 = italic, 3 = bold+italic
            fontName: fontParts.join(' ') || 'Arial',
            color: fontColor,
            bold: (fontStyle & 1) !== 0,
            italic: (fontStyle & 2) !== 0,
          };
        }
        break;

      case 'tiptext':
        // Format: "tiptext text"
        command.params = {
          ...command.params,
          text: args.join(' '),
        };
        break;

      case 'playhtml':
        // Format: "playhtml objname url/content x y width height"
        command.params = {
          ...command.params,
          objectName: args[0] || '',
          content: args[1] || '',
          x: parseInt(args[2]) || 0,
          y: parseInt(args[3]) || 0,
          width: parseInt(args[4]) || 320,
          height: parseInt(args[5]) || 240,
        };
        break;

      // === OBJETS ===
      case 'showobj':
      case 'hideobj':
      case 'delobj':
        // Format: "showobj objname"
        command.params = {
          ...command.params,
          objectName: args[0] || '',
        };
        break;

      // === EFFETS ===
      case 'zoom':
      case 'zoomin':
      case 'zoomout':
        // Format: "zoom startscale endscale centerx centery duration"
        command.params = {
          ...command.params,
          startZoom: parseFloat(args[0]) || 1.0,
          endZoom: parseFloat(args[1]) || 2.0,
          centerX: parseInt(args[2]) || 0,
          centerY: parseInt(args[3]) || 0,
          duration: parseInt(args[4]) || 1000,
        };
        break;

      case 'pause':
        // Format: "pause duration_ms"
        command.params = {
          ...command.params,
          duration: parseInt(args[0]) || 1000,
        };
        break;

      // === SYSTÈME ===
      case 'exec':
        // Format: "exec program [args] [wait]"
        command.params = {
          ...command.params,
          program: args[0] || '',
          arguments: args.slice(1, -1).join(' '),
          waitForCompletion: args[args.length - 1]?.toLowerCase() === 'wait',
        };
        break;

      case 'explore':
        // Format: "explore url"
        command.params = {
          ...command.params,
          url: args[0] || '',
        };
        break;

      case 'rundll':
        // Format: "rundll dllname function [args]"
        command.params = {
          ...command.params,
          dllName: args[0] || '',
          functionName: args[1] || '',
          arguments: args.slice(2).join(' '),
        };
        break;

      case 'runprj':
        // Format: "runprj projectfile [scene]"
        command.params = {
          ...command.params,
          projectFile: args[0] || '',
          startScene: args[1] || '',
        };
        break;

      case 'msgbox':
        // Format: "msgbox message [title] [type]"
        command.params = {
          ...command.params,
          message: args[0] || '',
          title: args[1] || 'Message',
          type: args[2] || 'info',
        };
        break;

      case 'defcursor':
        // Format: "defcursor cursorfile"
        command.params = {
          ...command.params,
          cursorFile: args[0] || '',
        };
        break;

      case 'hotspot':
        // Format: "hotspot name enable/disable"
        command.params = {
          ...command.params,
          hotspotName: args[0] || '',
          enabled: args[1]?.toLowerCase() !== 'disable',
        };
        break;

      case 'rem':
        // Commentaire - ignorer
        command.params = {
          ...command.params,
          comment: args.join(' '),
        };
        break;

      case 'load':
        // Format: "load savefile"
        command.params = {
          ...command.params,
          saveFile: args[0] || '',
        };
        break;

      case 'save':
        // Format: "save savefile"
        command.params = {
          ...command.params,
          saveFile: args[0] || '',
        };
        break;

      case 'update':
      case 'invalidate':
        // Rafraîchissement d'affichage - pas de paramètres
        break;

      case 'about':
      case 'prefs':
        // Dialogues système - pas de paramètres
        break;

      case 'closedll':
        // Format: "closedll dllname"
        command.params = {
          ...command.params,
          dllName: args[0] || '',
        };
        break;

      case 'playcmd':
        // Commande spéciale pour exécuter une série de commandes
        command.params = {
          ...command.params,
          commandString: args.join(' '),
        };
        break;

      default:
        // Commande inconnue - garder la commande brute pour debugging
        console.warn(`Unknown command: ${cmdName} (raw: ${commandStr})`);
        break;
    }

    return command;
  }

  /**
   * Parse une valeur (peut être un nombre ou un nom de variable)
   */
  private parseValue(value: string | undefined): number | string {
    if (!value) return 0;

    // Si c'est un nombre
    const num = parseInt(value);
    if (!isNaN(num)) return num;

    // Sinon c'est probablement une référence à une variable
    return value.toUpperCase();
  }

  /**
   * Parse une couleur hexadécimale avec préfixe #
   * Formats supportés: #RGB, #RRGGBB
   * Découvert dans europeo.exe @ 0x0043fa48: format "#%lX"
   */
  private parseHexColor(colorStr: string): number {
    if (!colorStr || !colorStr.startsWith('#')) return 0x000000;

    const hex = colorStr.slice(1); // Enlever le #

    if (hex.length === 3) {
      // Format #RGB -> #RRGGBB
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return (r << 16) | (g << 8) | b;
    } else if (hex.length === 6) {
      // Format #RRGGBB
      return parseInt(hex, 16);
    }

    return 0x000000;
  }

  /**
   * Opcodes par suffixe - Découverts dans europeo.exe @ sub_43177D
   *
   * Les "suffixes" (d, f, h, i, j, k, l) sont des OPCODES !
   * Le moteur utilise atol() pour extraire le nombre, puis le caractère
   * suivant est interprété comme opcode par le dispatcher.
   *
   * Table de dispatch (43 entrées, offset -6):
   * - 'd' (0x64) = index 4  = Saut Direct (ID absolu)
   * - 'f' (0x66) = index 6  = Saut de Scène
   * - 'h' (0x68) = index 8  = Tooltip
   * - 'i' (0x69) = index 9  = Index/Image
   * - 'j' (0x6A) = index 10 = Bitmap/Palette
   * - 'k' (0x6B) = index 11 = Audio WAV
   * - 'l' (0x6C) = index 12 = Musique MIDI
   */
  private static readonly OPCODE_MAP: Record<string, VNOpcodeInfo> = {
    d: { code: 4, name: 'DIRECT_JUMP', description: 'Saut direct vers ID scène absolu' },
    f: { code: 6, name: 'SCENE_JUMP', description: 'Changement de scène' },
    h: { code: 8, name: 'TOOLTIP', description: 'Afficher tooltip/texte info' },
    i: { code: 9, name: 'INDEX_IMAGE', description: 'Saut indexé ou chargement image' },
    j: { code: 10, name: 'BITMAP_PALETTE', description: 'Gestion bitmap/palette' },
    k: { code: 11, name: 'PLAY_WAV', description: 'Jouer fichier audio WAV' },
    l: { code: 12, name: 'PLAY_MIDI', description: 'Jouer séquence MIDI' },
  };

  /**
   * Parse une référence avec opcode suffixe
   * Format: "<nombre><opcode>" où opcode est une lettre (d, f, h, i, j, k, l, etc.)
   *
   * Exemples:
   * - "54h" -> value=54, opcode='h' (tooltip)
   * - "13i" -> value=13, opcode='i' (index/image)
   * - "57j" -> value=57, opcode='j' (bitmap)
   * - "38"  -> value=38, opcode=undefined (défaut)
   * - "+1"  -> relative=+1, opcode=undefined (relatif)
   * - "-2"  -> relative=-2, opcode=undefined (relatif)
   */
  private parseOpcodeReference(ref: string): VNOpcodeRef {
    if (!ref) return { raw: ref };

    // Pattern: signe optionnel + chiffres + lettre optionnelle
    const match = ref.match(/^([+-])?(\d+)([a-z])?$/i);

    if (match) {
      const sign = match[1];
      const value = parseInt(match[2]);
      const opcodeLetter = match[3]?.toLowerCase();

      const result: VNOpcodeRef = {
        raw: ref,
        value: sign === '-' ? -value : value,
        isRelative: sign === '+' || sign === '-',
      };

      if (opcodeLetter && VNFileLoader.OPCODE_MAP[opcodeLetter]) {
        result.opcode = VNFileLoader.OPCODE_MAP[opcodeLetter];
      }

      return result;
    }

    // Sinon c'est un nom de scène sans opcode
    return { raw: ref, sceneName: ref };
  }

  /**
   * Parse une référence de scène (wrapper pour compatibilité)
   */
  private parseSceneReference(ref: string): { index?: number; suffix?: string; opcode?: VNOpcodeInfo } {
    const parsed = this.parseOpcodeReference(ref);

    return {
      index: parsed.value,
      suffix: parsed.opcode?.name?.charAt(0).toLowerCase(),
      opcode: parsed.opcode,
      };
    }

    // Sinon c'est un nom de scène sans index
    return {};
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
   * Supporte les formats IMG8 (8-bit palettisé) et IMG24 (24-bit TrueColor)
   * Les images sont stockées au format Windows DIB (BITMAPINFOHEADER)
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

    // Lire BITMAPINFOHEADER (40 bytes)
    const biSize = reader.readUint32(); // Doit être 40
    if (biSize !== 40) {
      throw new VNFileError(`Invalid BITMAPINFOHEADER size: ${biSize}`, reader.pos);
    }

    const biWidth = reader.readInt32();
    const biHeight = reader.readInt32(); // Négatif = top-down, positif = bottom-up
    reader.readUint16(); // biPlanes (doit être 1)
    const biBitCount = reader.readUint16(); // 8 ou 24
    reader.readUint32(); // biCompression (0 = BI_RGB non compressé)
    reader.skip(20); // biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant

    const width = Math.abs(biWidth);
    const height = Math.abs(biHeight);
    const isBottomUp = biHeight > 0;

    // Calculer le stride (lignes alignées sur 4 bytes pour Windows DIB)
    const rowSize = Math.ceil((width * biBitCount) / 32) * 4;

    if (biBitCount === 8) {
      // Image 8-bit palettisée - lire la palette (256 entrées RGBQUAD)
      const palette = reader.readBytes(256 * 4); // B, G, R, Reserved

      // Lire les pixels
      const pixelData = reader.readBytes(rowSize * height);

      // Convertir en RGBA
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        const srcY = isBottomUp ? (height - 1 - y) : y;
        for (let x = 0; x < width; x++) {
          const srcIndex = srcY * rowSize + x;
          const dstIndex = (y * width + x) * 4;
          const colorIndex = pixelData[srcIndex];

          // RGBQUAD est B, G, R, Reserved (pas R, G, B!)
          data[dstIndex] = palette[colorIndex * 4 + 2]; // R
          data[dstIndex + 1] = palette[colorIndex * 4 + 1]; // G
          data[dstIndex + 2] = palette[colorIndex * 4]; // B
          data[dstIndex + 3] = 255; // A
        }
      }

      return { width, height, data, palette };
    } else if (biBitCount === 24) {
      // Image 24-bit - pas de palette
      const pixelData = reader.readBytes(rowSize * height);
      const data = new Uint8ClampedArray(width * height * 4);

      for (let y = 0; y < height; y++) {
        const srcY = isBottomUp ? (height - 1 - y) : y;
        for (let x = 0; x < width; x++) {
          const srcIndex = srcY * rowSize + x * 3;
          const dstIndex = (y * width + x) * 4;

          // DIB 24-bit est B, G, R (pas R, G, B!)
          data[dstIndex] = pixelData[srcIndex + 2]; // R
          data[dstIndex + 1] = pixelData[srcIndex + 1]; // G
          data[dstIndex + 2] = pixelData[srcIndex]; // B
          data[dstIndex + 3] = 255; // A
        }
      }

      return { width, height, data };
    } else {
      throw new VNFileError(`Unsupported bit depth: ${biBitCount}`, reader.pos);
    }
  }

  /**
   * Extrait une image avec format simplifié (fallback pour formats non-DIB)
   */
  async extractImageSimple(
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

    // Format simplifié: width(16), height(16), bpp(8), [palette], pixels
    const width = reader.readUint16();
    const height = reader.readUint16();
    const bpp = reader.readUint8();

    if (bpp === 8) {
      const palette = reader.readBytes(256 * 4);
      const pixels = reader.readBytes(width * height);
      const data = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < pixels.length; i++) {
        const colorIndex = pixels[i];
        data[i * 4] = palette[colorIndex * 4 + 2]; // R (BGR order)
        data[i * 4 + 1] = palette[colorIndex * 4 + 1]; // G
        data[i * 4 + 2] = palette[colorIndex * 4]; // B
        data[i * 4 + 3] = 255;
      }

      return { width, height, data, palette };
    } else {
      const pixels = reader.readBytes(width * height * 3);
      const data = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        data[i * 4] = pixels[i * 3 + 2]; // R (BGR order)
        data[i * 4 + 1] = pixels[i * 3 + 1]; // G
        data[i * 4 + 2] = pixels[i * 3]; // B
        data[i * 4 + 3] = 255;
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
  displayMode: VNDisplayModeType;
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
