/**
 * VN Engine Types - Définitions TypeScript
 * Basé sur la rétro-ingénierie de Virtual Navigator 2.1 (Sopra Multimedia, 1999)
 * Format validé sur 19/19 fichiers VND avec 0 bytes remaining
 */

// =============================================================================
// PRIMITIVES
// =============================================================================

export interface VNPoint {
  x: number;
  y: number;
}

export interface VNRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// =============================================================================
// VARIABLES
// =============================================================================

export interface VNVariable {
  name: string;
  value: number;
}

// =============================================================================
// COMMANDES - Format binaire validé (TVNCommand::Read @ 0x4132f1)
// =============================================================================

/**
 * Objet string dans une commande (readWord type + readBS string)
 * Le type indique la sémantique: 6=SCENE, 9=PLAYAVI, 10=PLAYBMP, 11=PLAYWAV, etc.
 */
export interface VNStringObject {
  type: number;
  string: string;
}

/**
 * Item de string collection (subIndex + objet)
 */
export interface VNStringCollectionItem {
  subIndex: number;
  type: number;
  string: string;
}

/**
 * Paire de paramètres (coordonnées de polygone)
 * Chaque paire (a, b) = (x, y) d'un vertex
 */
export interface VNParamPair {
  a: number;
  b: number;
}

/**
 * Commande VND parsée (format binaire exact de TVNCommand::Read)
 */
export interface VNCommandRaw {
  strings: VNStringCollectionItem[];
  commandType: number;
  paramPairCount: number;
  paramPairs: VNParamPair[];
  flags: number;
}

// =============================================================================
// COMMANDE TYPES - Noms des types de commandes (table @ 0x43f76c)
// =============================================================================

export enum VNCommandType {
  QUIT = 0,
  ABOUT = 1,
  PREFS = 2,
  PREV = 3,
  NEXT = 4,
  ZOOM = 5,
  SCENE = 6,
  HOTSPOT = 7,
  TIPTEXT = 8,
  PLAYAVI = 9,
  PLAYBMP = 10,
  PLAYWAV = 11,
  PLAYMID = 12,
  PLAYHTML = 13,
  ZOOMIN = 14,
  ZOOMOUT = 15,
  PAUSE = 16,
  EXEC = 17,
  EXPLORE = 18,
  PLAYCDA = 19,
  PLAYSEQ = 20,
  IF = 21,
  SET_VAR = 22,
  INC_VAR = 23,
  DEC_VAR = 24,
  INVALIDATE = 25,
  DEFCURSOR = 26,
  ADDBMP = 27,
  DELBMP = 28,
  SHOWBMP = 29,
  HIDEBMP = 30,
  RUNPRJ = 31,
  UPDATE = 32,
  RUNDLL = 33,
  MSGBOX = 34,
  PLAYCMD = 35,
  CLOSEWAV = 36,
  CLOSEDLL = 37,
  PLAYTEXT = 38,
  FONT = 39,
  REM = 40,
  ADDTEXT = 41,
  DELOBJ = 42,
  SHOWOBJ = 43,
  HIDEOBJ = 44,
  LOAD = 45,
  SAVE = 46,
  CLOSEAVI = 47,
  CLOSEMID = 48,
  // Valeurs spéciales pour collision
  POLYGON = 105,
}

export const VNCommandTypeNames: Record<number, string> = {
  0: 'QUIT', 1: 'ABOUT', 2: 'PREFS', 3: 'PREV', 4: 'NEXT', 5: 'ZOOM',
  6: 'SCENE', 7: 'HOTSPOT', 8: 'TIPTEXT', 9: 'PLAYAVI', 10: 'PLAYBMP',
  11: 'PLAYWAV', 12: 'PLAYMID', 13: 'PLAYHTML', 14: 'ZOOMIN', 15: 'ZOOMOUT',
  16: 'PAUSE', 17: 'EXEC', 18: 'EXPLORE', 19: 'PLAYCDA', 20: 'PLAYSEQ',
  21: 'IF', 22: 'SET_VAR', 23: 'INC_VAR', 24: 'DEC_VAR', 25: 'INVALIDATE',
  26: 'DEFCURSOR', 27: 'ADDBMP', 28: 'DELBMP', 29: 'SHOWBMP', 30: 'HIDEBMP',
  31: 'RUNPRJ', 32: 'UPDATE', 33: 'RUNDLL', 34: 'MSGBOX', 35: 'PLAYCMD',
  36: 'CLOSEWAV', 37: 'CLOSEDLL', 38: 'PLAYTEXT', 39: 'FONT', 40: 'REM',
  41: 'ADDTEXT', 42: 'DELOBJ', 43: 'SHOWOBJ', 44: 'HIDEOBJ',
  45: 'LOAD', 46: 'SAVE', 47: 'CLOSEAVI', 48: 'CLOSEMID',
  100: 'CMD_100', 101: 'CMD_101', 103: 'CMD_103',
  105: 'POLYGON', 106: 'CMD_106', 107: 'CMD_107', 108: 'CMD_108',
};

// =============================================================================
// HOTSPOT (données dans le stream de la scène)
// =============================================================================

export interface VNHotspotData {
  timerValue: number;
  objects: VNStringObject[];
}

// =============================================================================
// SCÈNE - Format binaire validé (TVNScene::Read @ 0x4161fa)
// =============================================================================

export interface VNSceneRaw {
  name: string;
  flagBytes: number[];
  prop1: number;
  prop2: number;
  prop3: number;
  fields: {
    string1: string;
    string2: string;
    val1: number;
    string3: string;
    val2: number;
    string4: string;
    val3: number;
    resource: string;
    val4: number;
    string6: string;
    val5: number;
  };
  rect: VNRect;
  hotspotCount: number;
  hotspot: VNHotspotData | null;
  cmdListValue: number;
  cmdListData: number[];
  commands: VNCommandRaw[];
}

// =============================================================================
// HEADER VND
// =============================================================================

export interface VNDHeader {
  magic: string;
  version: string;
  sceneCount: number;
  projectName: string;
  editor: string;
  serial: string;
  projectIDStr: string;
  registry: string;
  width: number;
  height: number;
  depth: number;
  flag: number;
  u1: number;
  u2: number;
  reserved: number;
  dllPath: string;
  varCount: number;
}

// =============================================================================
// FICHIER VND PARSÉ (résultat complet)
// =============================================================================

export interface VNDFile {
  fileName: string;
  fileSize: number;
  header: VNDHeader;
  variables: VNVariable[];
  scenes: VNSceneRaw[];
  streamVersion: number;
  bytesRemaining: number;
  errors: string[];
}

// =============================================================================
// ÉTAT DU MOTEUR (runtime)
// =============================================================================

export interface VNEngineState {
  project: VNDFile | null;
  currentSceneIndex: number;
  previousSceneIndex: number;
  variables: Map<string, number>;
  isPlaying: boolean;
  isPaused: boolean;
  sceneHistory: number[];
  historyIndex: number;
}

// =============================================================================
// ÉVÉNEMENTS
// =============================================================================

export enum VNEventType {
  SCENE_ENTER = 'SCENE_ENTER',
  SCENE_EXIT = 'SCENE_EXIT',
  HOTSPOT_CLICK = 'HOTSPOT_CLICK',
  HOTSPOT_ENTER = 'HOTSPOT_ENTER',
  HOTSPOT_EXIT = 'HOTSPOT_EXIT',
  TIMER_TICK = 'TIMER_TICK',
  COMMAND_EXECUTE = 'COMMAND_EXECUTE',
  VARIABLE_CHANGE = 'VARIABLE_CHANGE',
  MEDIA_START = 'MEDIA_START',
  MEDIA_END = 'MEDIA_END',
  ERROR = 'ERROR',
}

export interface VNEvent {
  type: VNEventType;
  timestamp: number;
  data?: unknown;
}

// =============================================================================
// CALLBACKS
// =============================================================================

export type VNEventCallback = (event: VNEvent) => void;
export type VNErrorCallback = (error: Error, context?: string) => void;
