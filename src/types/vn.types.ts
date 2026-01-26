/**
 * VN Engine Types - Définitions TypeScript exactes
 * Basé sur la rétro-ingénierie de Virtual Navigator 2.1 (Sopra Multimedia, 1999)
 */

// =============================================================================
// STRUCTURE VNVARIABLE - EXACTE (264 bytes dans l'original)
// Extrait de vndllapi.dll @ 0x004014dd
// =============================================================================

export interface VNVariable {
  name: string;           // Offset 0x000 - Max 255 chars, stocké en MAJUSCULES
  value: number;          // Offset 0x100 - int32_t signé
  // next: VNVariable*    // Offset 0x104 - En JS on utilise un Map à la place
}

// =============================================================================
// TYPES DE COMMANDES
// Extrait de europeo.exe - commands.cpp
// =============================================================================

export enum CommandType {
  GOTO_SCENE = 'GOTO',
  SET_VAR = 'SETVAR',
  INC_VAR = 'INCVAR',
  DEC_VAR = 'DECVAR',
  IF = 'IF',
  EXEC = 'EXEC',
  PLAY_WAVE = 'WAVE',
  PLAY_MIDI = 'MIDI',
  PLAY_CDA = 'CDA',
  PLAY_AVI = 'AVI',
  SHOW_IMAGE = 'IMAGE',
  SHOW_TEXT = 'TEXT',
  SHOW_HTML = 'HTML',
  HIDE_OBJECT = 'HIDE',
  TIMER_START = 'TIMERSTART',
  TIMER_STOP = 'TIMERSTOP',
  SCROLL = 'SCROLL',
  ZOOM = 'ZOOM',
  STOP_SOUND = 'STOPSOUND',
  STOP_MIDI = 'STOPMIDI',
  STOP_ALL = 'STOPALL',
  WAIT = 'WAIT',
  CURSOR = 'CURSOR',
  ENABLE_HOTSPOT = 'ENABLE',
  DISABLE_HOTSPOT = 'DISABLE',
  QUIT = 'QUIT',
  // Commandes de navigation
  FORWARD = 'FORWARD',
  BACKWARD = 'BACKWARD',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  MAP = 'MAP',
  INDEX = 'INDEX',
  REPLAY = 'REPLAY',
}

// =============================================================================
// OPÉRATEURS DE CONDITION
// =============================================================================

export enum ConditionOperator {
  EQUAL = '==',
  NOT_EQUAL = '!=',
  LESS_THAN = '<',
  LESS_EQUAL = '<=',
  GREATER_THAN = '>',
  GREATER_EQUAL = '>=',
}

// =============================================================================
// PARAMÈTRES DE COMMANDES
// =============================================================================

export interface VNCommandParms {
  type: CommandType;
}

export interface VNSceneParms extends VNCommandParms {
  type: CommandType.GOTO_SCENE;
  sceneIndex: number;
  sceneName?: string;
}

export interface VNSetVarParms extends VNCommandParms {
  type: CommandType.SET_VAR;
  varName: string;
  value: number;
}

export interface VNIncVarParms extends VNCommandParms {
  type: CommandType.INC_VAR;
  varName: string;
  amount?: number;  // Défaut: 1
}

export interface VNDecVarParms extends VNCommandParms {
  type: CommandType.DEC_VAR;
  varName: string;
  amount?: number;  // Défaut: 1
}

export interface VNCondition {
  varName: string;
  operator: ConditionOperator;
  value: number | string;  // Peut comparer à une variable ou valeur
  valueIsVar?: boolean;    // true si value est un nom de variable
}

export interface VNIfParms extends VNCommandParms {
  type: CommandType.IF;
  condition: VNCondition;
  thenCommands: VNCommand[];
  elseCommands?: VNCommand[];
}

export interface VNExecParms extends VNCommandParms {
  type: CommandType.EXEC;
  program: string;
  arguments?: string;
  waitForExit?: boolean;
}

export interface VNFileNameParms extends VNCommandParms {
  filename: string;
  loop?: boolean;
  volume?: number;  // 0-100
}

export interface VNWaveParms extends VNFileNameParms {
  type: CommandType.PLAY_WAVE;
}

export interface VNMidiParms extends VNFileNameParms {
  type: CommandType.PLAY_MIDI;
}

export interface VNCDAParms extends VNCommandParms {
  type: CommandType.PLAY_CDA;
  track: number;
  loop?: boolean;
}

export interface VNAviParms extends VNFileNameParms {
  type: CommandType.PLAY_AVI;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fullscreen?: boolean;
}

export interface VNImageParms extends VNCommandParms {
  type: CommandType.SHOW_IMAGE;
  objectId: string;
  filename: string;
  x: number;
  y: number;
  transparent?: boolean;
  transparentColor?: number;  // RGB color for transparency
  zOrder?: number;
}

export interface VNTextParms extends VNCommandParms {
  type: CommandType.SHOW_TEXT;
  objectId: string;
  text: string;
  x: number;
  y: number;
  fontName?: string;
  fontSize?: number;
  fontColor?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  backgroundColor?: number;
  width?: number;
  height?: number;
  alignment?: 'left' | 'center' | 'right';
}

export interface VNHtmlParms extends VNCommandParms {
  type: CommandType.SHOW_HTML;
  objectId: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VNHideParms extends VNCommandParms {
  type: CommandType.HIDE_OBJECT;
  objectId: string;
}

export interface VNTimerParms extends VNCommandParms {
  timerId: string;
  interval?: number;  // millisecondes
  commands?: VNCommand[];
}

export interface VNTimerStartParms extends VNTimerParms {
  type: CommandType.TIMER_START;
}

export interface VNTimerStopParms extends VNTimerParms {
  type: CommandType.TIMER_STOP;
}

export enum ScrollDirection {
  UP = 0,
  DOWN = 1,
  LEFT = 2,
  RIGHT = 3,
}

export interface VNScrollParms extends VNCommandParms {
  type: CommandType.SCROLL;
  direction: ScrollDirection;
  duration: number;  // millisecondes
  distance?: number; // pixels, défaut: taille écran
}

export interface VNZoomParms extends VNCommandParms {
  type: CommandType.ZOOM;
  startScale: number;  // 1.0 = 100%
  endScale: number;
  centerX: number;
  centerY: number;
  duration: number;  // millisecondes
}

export interface VNWaitParms extends VNCommandParms {
  type: CommandType.WAIT;
  duration: number;  // millisecondes
}

export interface VNCursorParms extends VNCommandParms {
  type: CommandType.CURSOR;
  cursorFile?: string;  // null = curseur par défaut
}

export interface VNHotspotControlParms extends VNCommandParms {
  type: CommandType.ENABLE_HOTSPOT | CommandType.DISABLE_HOTSPOT;
  hotspotId: string;
}

// Union de tous les types de paramètres
export type VNCommand =
  | VNSceneParms
  | VNSetVarParms
  | VNIncVarParms
  | VNDecVarParms
  | VNIfParms
  | VNExecParms
  | VNWaveParms
  | VNMidiParms
  | VNCDAParms
  | VNAviParms
  | VNImageParms
  | VNTextParms
  | VNHtmlParms
  | VNHideParms
  | VNTimerStartParms
  | VNTimerStopParms
  | VNScrollParms
  | VNZoomParms
  | VNWaitParms
  | VNCursorParms
  | VNHotspotControlParms
  | { type: CommandType.STOP_SOUND }
  | { type: CommandType.STOP_MIDI }
  | { type: CommandType.STOP_ALL }
  | { type: CommandType.QUIT }
  | { type: CommandType.FORWARD }
  | { type: CommandType.BACKWARD }
  | { type: CommandType.LEFT }
  | { type: CommandType.RIGHT }
  | { type: CommandType.MAP }
  | { type: CommandType.INDEX }
  | { type: CommandType.REPLAY };

// =============================================================================
// HOTSPOT (Zone cliquable)
// =============================================================================

export enum HotspotShape {
  RECTANGLE = 0,
  POLYGON = 1,
  ELLIPSE = 2,
}

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

export interface VNHotspot {
  id: string;
  name: string;
  shape: HotspotShape;
  rect?: VNRect;           // Pour RECTANGLE et ELLIPSE
  points?: VNPoint[];      // Pour POLYGON
  cursorFile?: string;
  enabled: boolean;
  visible: boolean;        // Pour debug
  onClickCommands: VNCommand[];
  onEnterCommands: VNCommand[];
  onExitCommands: VNCommand[];
}

// =============================================================================
// OBJETS GRAPHIQUES
// =============================================================================

export enum GdiObjectType {
  IMAGE = 'IMAGE',
  TEXT = 'TEXT',
  HTML = 'HTML',
}

export interface VNGdiObject {
  id: string;
  type: GdiObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  zOrder: number;
  visible: boolean;
}

export interface VNImageObject extends VNGdiObject {
  type: GdiObjectType.IMAGE;
  imageData?: ImageBitmap | HTMLImageElement;
  filename: string;
  transparent: boolean;
  transparentColor?: number;
}

export interface VNTextObject extends VNGdiObject {
  type: GdiObjectType.TEXT;
  text: string;
  fontName: string;
  fontSize: number;
  fontColor: number;
  fontBold: boolean;
  fontItalic: boolean;
  backgroundColor?: number;
  alignment: 'left' | 'center' | 'right';
}

export interface VNHtmlObject extends VNGdiObject {
  type: GdiObjectType.HTML;
  content: string;
}

export type VNDisplayObject = VNImageObject | VNTextObject | VNHtmlObject;

// =============================================================================
// SCÈNE
// =============================================================================

export interface VNSceneProperties {
  title?: string;
  backgroundColor?: number;
  backgroundTexture?: string;
  transitionIn?: string;
  transitionOut?: string;
  musicFile?: string;
  musicLoop?: boolean;
}

export interface VNScene {
  index: number;
  name: string;
  properties: VNSceneProperties;
  backgroundImage?: string;
  hotspots: VNHotspot[];
  objects: VNDisplayObject[];
  onEnterCommands: VNCommand[];
  onExitCommands: VNCommand[];
  // Navigation links
  forwardScene?: number;
  backwardScene?: number;
  leftScene?: number;
  rightScene?: number;
}

// =============================================================================
// PROJET
// =============================================================================

export interface VNToolbarProperties {
  visible: boolean;
  alwaysVisible: boolean;
  position: 'top' | 'bottom';
  buttons: VNToolbarButton[];
}

export interface VNToolbarButton {
  id: string;
  icon?: string;
  tooltip: string;
  command: VNCommand;
  enabled: boolean;
  visible: boolean;
}

export interface VNTimerProperties {
  resolution: number;  // millisecondes, défaut: 16 (~60fps)
}

export interface VNDisplayMode {
  width: number;
  height: number;
  colorDepth: 8 | 16 | 24 | 32;  // bits par pixel
  fullscreen: boolean;
}

export interface VNProjectInfo {
  title: string;
  version: string;
  author?: string;
  copyright?: string;
  description?: string;
  startScene: number;
  displayMode: VNDisplayMode;
  toolbar: VNToolbarProperties;
  timer: VNTimerProperties;
  scenes: VNScene[];
  // Options
  smoothZoom: boolean;
  smoothScroll: boolean;
  texturedBackground: boolean;
  trueColor: boolean;
  voicesEnabled: boolean;
  musicEnabled: boolean;
  videosEnabled: boolean;
}

// =============================================================================
// ÉTAT DU MOTEUR
// =============================================================================

export interface VNEngineState {
  project: VNProjectInfo | null;
  currentSceneIndex: number;
  previousSceneIndex: number;
  variables: Map<string, number>;  // Noms en MAJUSCULES
  objects: Map<string, VNDisplayObject>;
  activeTimers: Map<string, NodeJS.Timeout | number>;
  isPlaying: boolean;
  isPaused: boolean;
  isZooming: boolean;
  isScrolling: boolean;
  // Audio state
  currentWave: string | null;
  currentMidi: string | null;
  waveVolume: number;
  midiVolume: number;
  // History
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

export type VNCommandCallback = (command: VNCommand) => Promise<void> | void;
export type VNEventCallback = (event: VNEvent) => void;
export type VNErrorCallback = (error: Error, context?: string) => void;

// =============================================================================
// TYPES POUR VNFileLoader (Compatibilité avec le parser de fichiers binaires)
// =============================================================================

/**
 * Type de commande utilisé dans les fichiers binaires VNFILE
 */
export enum VNCommandType {
  GOTO = 0,
  SETVAR = 1,
  INCVAR = 2,
  DECVAR = 3,
  IF = 4,
  EXEC = 5,
  WAVE = 6,
  MIDI = 7,
  CDAUDIO = 8,
  AVI = 9,
  IMAGE = 10,
  TEXT = 11,
  FONT = 12,
  HTML = 13,
  HIDE = 14,
  SHOW = 15,
  SCROLL = 16,
  ZOOM = 17,
  WAIT = 18,
  RETURN = 19,
  EXIT = 20,
  IMGOBJ = 21,
  IMGSEQ = 22,
  TEXTOBJ = 23,
  DIGIT = 24,
  CURSOR = 25,
  STOPAUDIO = 26,
  STOPVIDEO = 27,
  UNKNOWN = 255,
}

/**
 * Mode d'affichage pour le projet
 */
export enum VNDisplayMode {
  WINDOWED = 0,
  FULLSCREEN = 1,
  BORDERLESS = 2,
}

/**
 * Structure d'un projet VN (format fichier)
 */
export interface VNProject {
  name: string;
  version: string;
  displayWidth: number;
  displayHeight: number;
  colorDepth: number;
  displayMode: VNDisplayMode;
  dataFilePath: string;
  scenes: VNScene[];
  variables: Map<string, VNVariable>;
  startSceneIndex: number;
}

/**
 * Commande générique pour le parser
 */
export interface VNCommandGeneric {
  type: VNCommandType;
  params: Record<string, unknown>;
}

/**
 * Objet GDI générique (pour le parser)
 */
export interface VNGdiObjectGeneric {
  id: string;
  type: 'image' | 'text' | 'html';
  name: string;
  visible: boolean;
  bounds: VNRect;
  filename?: string;
  transparent?: boolean;
  transparentColor?: number;
  text?: string;
  color?: number;
  fontName?: string;
  fontSize?: number;
  content?: string;
}

/**
 * Hotspot pour le parser (format simplifié)
 */
export interface VNHotspotParsed {
  id: string;
  name: string;
  bounds?: VNRect;
  polygon?: VNPoint[];
  cursorFile?: string;
  enabled: boolean;
  onClickCommands: VNCommandGeneric[];
  onEnterCommands: VNCommandGeneric[];
  onExitCommands: VNCommandGeneric[];
}

/**
 * Scène pour le parser (format simplifié)
 */
export interface VNSceneParsed {
  id: string;
  name: string;
  index: number;
  backgroundFile: string;
  properties: Record<string, unknown>;
  hotspots: VNHotspotParsed[];
  onEnterCommands: VNCommandGeneric[];
  onExitCommands: VNCommandGeneric[];
  gdiObjects: VNGdiObjectGeneric[];
}
