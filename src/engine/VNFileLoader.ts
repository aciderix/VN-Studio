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
 * Types de records binaires pour la sérialisation VN
 * Découverts dans europeo.exe - fonction sub_40B990 (switch géant)
 * Les indices 0-48 correspondent exactement aux commandes textuelles @ 0x43f76c
 */
export enum VNRecordType {
  // === NAVIGATION (0-5) ===
  QUIT = 0,              // quit - Quitter l'application
  ABOUT = 1,             // about - Afficher "À propos"
  PREFS = 2,             // prefs - Ouvrir les préférences
  PREV = 3,              // prev - Scène précédente
  NEXT = 4,              // next - Scène suivante
  ZOOM = 5,              // zoom - Activer le mode zoom

  // === SCÈNE/HOTSPOT (6-8) ===
  SCENE = 6,             // scene - Aller à une scène
  HOTSPOT = 7,           // hotspot - Gérer un hotspot
  TIPTEXT = 8,           // tiptext - Afficher texte d'aide (tooltip)

  // === MÉDIA VIDÉO (9-10) ===
  PLAYAVI = 9,           // playavi - Jouer vidéo AVI
  PLAYBMP = 10,          // playbmp - Animer un bitmap

  // === MÉDIA AUDIO (11-13) ===
  PLAYWAV = 11,          // playwav - Jouer fichier WAV (= AUDIO_WAV)
  PLAYMID = 12,          // playmid - Jouer fichier MIDI (= AUDIO_MIDI)
  PLAYHTML = 13,         // playhtml - Afficher contenu HTML

  // === ZOOM/PAUSE (14-16) ===
  ZOOMIN = 14,           // zoomin - Zoom avant
  ZOOMOUT = 15,          // zoomout - Zoom arrière
  PAUSE = 16,            // pause - Mettre en pause

  // === SYSTÈME (17-18) ===
  EXEC = 17,             // exec - Exécuter programme externe
  EXPLORE = 18,          // explore - Ouvrir l'explorateur/URL

  // === MÉDIA SUITE (19-20) ===
  PLAYCDA = 19,          // playcda - Jouer CD Audio
  PLAYSEQ = 20,          // playseq - Jouer séquence d'images

  // === LOGIQUE/VARIABLES (21-24) ===
  IF = 21,               // if - Condition (= CONDITIONAL)
  SET_VAR = 22,          // set_var - Définir variable
  INC_VAR = 23,          // inc_var - Incrémenter variable
  DEC_VAR = 24,          // dec_var - Décrémenter variable

  // === AFFICHAGE (25-30) ===
  INVALIDATE = 25,       // invalidate - Forcer redessin
  DEFCURSOR = 26,        // defcursor - Définir curseur par défaut
  ADDBMP = 27,           // addbmp - Ajouter bitmap
  DELBMP = 28,           // delbmp - Supprimer bitmap
  SHOWBMP = 29,          // showbmp - Afficher bitmap
  HIDEBMP = 30,          // hidebmp - Cacher bitmap

  // === PROJET/SYSTÈME (31-35) ===
  RUNPRJ = 31,           // runprj - Charger autre projet
  UPDATE = 32,           // update - Mettre à jour affichage
  RUNDLL = 33,           // rundll - Appeler fonction DLL
  MSGBOX = 34,           // msgbox - Afficher boîte de message
  PLAYCMD = 35,          // playcmd - Exécuter commande

  // === FERMETURE MÉDIA (36-37) ===
  CLOSEWAV = 36,         // closewav - Arrêter WAV
  CLOSEDLL = 37,         // closedll - Fermer DLL

  // === TEXTE (38-41) ===
  PLAYTEXT = 38,         // playtext - Texte avec effet (= HOTSPOT_TEXT)
  FONT = 39,             // font - Définir police
  REM = 40,              // rem - Commentaire (ignoré)
  ADDTEXT = 41,          // addtext - Ajouter texte

  // === OBJETS (42-44) ===
  DELOBJ = 42,           // delobj - Supprimer objet
  SHOWOBJ = 43,          // showobj - Afficher objet
  HIDEOBJ = 44,          // hideobj - Cacher objet

  // === SAUVEGARDE (45-46) ===
  LOAD = 45,             // load - Charger sauvegarde
  SAVE = 46,             // save - Sauvegarder

  // === FERMETURE MÉDIA SUITE (47-48) ===
  CLOSEAVI = 47,         // closeavi - Arrêter vidéo AVI
  CLOSEMID = 48,         // closemid - Arrêter MIDI

  // === TYPES SPÉCIAUX (valeurs hexadécimales pour collision) ===
  RECT_COLLISION = 0x02,      // Rectangle de collision simple (alias de PREFS)
  POLYGON_COLLISION = 0x69,   // Zone de collision polygonale (105)
}

/**
 * Noms des commandes textuelles correspondant aux indices
 * Extrait de europeo.exe @ 0x43f76c
 */
export const VNRecordTypeNames: Record<number, string> = {
  [VNRecordType.QUIT]: 'quit',
  [VNRecordType.ABOUT]: 'about',
  [VNRecordType.PREFS]: 'prefs',
  [VNRecordType.PREV]: 'prev',
  [VNRecordType.NEXT]: 'next',
  [VNRecordType.ZOOM]: 'zoom',
  [VNRecordType.SCENE]: 'scene',
  [VNRecordType.HOTSPOT]: 'hotspot',
  [VNRecordType.TIPTEXT]: 'tiptext',
  [VNRecordType.PLAYAVI]: 'playavi',
  [VNRecordType.PLAYBMP]: 'playbmp',
  [VNRecordType.PLAYWAV]: 'playwav',
  [VNRecordType.PLAYMID]: 'playmid',
  [VNRecordType.PLAYHTML]: 'playhtml',
  [VNRecordType.ZOOMIN]: 'zoomin',
  [VNRecordType.ZOOMOUT]: 'zoomout',
  [VNRecordType.PAUSE]: 'pause',
  [VNRecordType.EXEC]: 'exec',
  [VNRecordType.EXPLORE]: 'explore',
  [VNRecordType.PLAYCDA]: 'playcda',
  [VNRecordType.PLAYSEQ]: 'playseq',
  [VNRecordType.IF]: 'if',
  [VNRecordType.SET_VAR]: 'set_var',
  [VNRecordType.INC_VAR]: 'inc_var',
  [VNRecordType.DEC_VAR]: 'dec_var',
  [VNRecordType.INVALIDATE]: 'invalidate',
  [VNRecordType.DEFCURSOR]: 'defcursor',
  [VNRecordType.ADDBMP]: 'addbmp',
  [VNRecordType.DELBMP]: 'delbmp',
  [VNRecordType.SHOWBMP]: 'showbmp',
  [VNRecordType.HIDEBMP]: 'hidebmp',
  [VNRecordType.RUNPRJ]: 'runprj',
  [VNRecordType.UPDATE]: 'update',
  [VNRecordType.RUNDLL]: 'rundll',
  [VNRecordType.MSGBOX]: 'msgbox',
  [VNRecordType.PLAYCMD]: 'playcmd',
  [VNRecordType.CLOSEWAV]: 'closewav',
  [VNRecordType.CLOSEDLL]: 'closedll',
  [VNRecordType.PLAYTEXT]: 'playtext',
  [VNRecordType.FONT]: 'font',
  [VNRecordType.REM]: 'rem',
  [VNRecordType.ADDTEXT]: 'addtext',
  [VNRecordType.DELOBJ]: 'delobj',
  [VNRecordType.SHOWOBJ]: 'showobj',
  [VNRecordType.HIDEOBJ]: 'hideobj',
  [VNRecordType.LOAD]: 'load',
  [VNRecordType.SAVE]: 'save',
  [VNRecordType.CLOSEAVI]: 'closeavi',
  [VNRecordType.CLOSEMID]: 'closemid',
};

/**
 * Catégories de commandes pour le regroupement logique
 */
export enum VNCommandCategory {
  NAVIGATION = 'navigation',
  MEDIA_VIDEO = 'media_video',
  MEDIA_AUDIO = 'media_audio',
  DISPLAY = 'display',
  LOGIC = 'logic',
  SYSTEM = 'system',
  TEXT = 'text',
  OBJECTS = 'objects',
  SAVE_LOAD = 'save_load',
}

/**
 * Mapping type de record -> catégorie
 */
export const VNRecordCategoryMap: Record<number, VNCommandCategory> = {
  [VNRecordType.QUIT]: VNCommandCategory.NAVIGATION,
  [VNRecordType.ABOUT]: VNCommandCategory.NAVIGATION,
  [VNRecordType.PREFS]: VNCommandCategory.NAVIGATION,
  [VNRecordType.PREV]: VNCommandCategory.NAVIGATION,
  [VNRecordType.NEXT]: VNCommandCategory.NAVIGATION,
  [VNRecordType.ZOOM]: VNCommandCategory.NAVIGATION,
  [VNRecordType.SCENE]: VNCommandCategory.NAVIGATION,
  [VNRecordType.HOTSPOT]: VNCommandCategory.NAVIGATION,
  [VNRecordType.TIPTEXT]: VNCommandCategory.TEXT,
  [VNRecordType.PLAYAVI]: VNCommandCategory.MEDIA_VIDEO,
  [VNRecordType.PLAYBMP]: VNCommandCategory.DISPLAY,
  [VNRecordType.PLAYWAV]: VNCommandCategory.MEDIA_AUDIO,
  [VNRecordType.PLAYMID]: VNCommandCategory.MEDIA_AUDIO,
  [VNRecordType.PLAYHTML]: VNCommandCategory.TEXT,
  [VNRecordType.ZOOMIN]: VNCommandCategory.DISPLAY,
  [VNRecordType.ZOOMOUT]: VNCommandCategory.DISPLAY,
  [VNRecordType.PAUSE]: VNCommandCategory.SYSTEM,
  [VNRecordType.EXEC]: VNCommandCategory.SYSTEM,
  [VNRecordType.EXPLORE]: VNCommandCategory.SYSTEM,
  [VNRecordType.PLAYCDA]: VNCommandCategory.MEDIA_AUDIO,
  [VNRecordType.PLAYSEQ]: VNCommandCategory.MEDIA_VIDEO,
  [VNRecordType.IF]: VNCommandCategory.LOGIC,
  [VNRecordType.SET_VAR]: VNCommandCategory.LOGIC,
  [VNRecordType.INC_VAR]: VNCommandCategory.LOGIC,
  [VNRecordType.DEC_VAR]: VNCommandCategory.LOGIC,
  [VNRecordType.INVALIDATE]: VNCommandCategory.DISPLAY,
  [VNRecordType.DEFCURSOR]: VNCommandCategory.DISPLAY,
  [VNRecordType.ADDBMP]: VNCommandCategory.DISPLAY,
  [VNRecordType.DELBMP]: VNCommandCategory.DISPLAY,
  [VNRecordType.SHOWBMP]: VNCommandCategory.DISPLAY,
  [VNRecordType.HIDEBMP]: VNCommandCategory.DISPLAY,
  [VNRecordType.RUNPRJ]: VNCommandCategory.SYSTEM,
  [VNRecordType.UPDATE]: VNCommandCategory.DISPLAY,
  [VNRecordType.RUNDLL]: VNCommandCategory.SYSTEM,
  [VNRecordType.MSGBOX]: VNCommandCategory.SYSTEM,
  [VNRecordType.PLAYCMD]: VNCommandCategory.SYSTEM,
  [VNRecordType.CLOSEWAV]: VNCommandCategory.MEDIA_AUDIO,
  [VNRecordType.CLOSEDLL]: VNCommandCategory.SYSTEM,
  [VNRecordType.PLAYTEXT]: VNCommandCategory.TEXT,
  [VNRecordType.FONT]: VNCommandCategory.TEXT,
  [VNRecordType.REM]: VNCommandCategory.SYSTEM,
  [VNRecordType.ADDTEXT]: VNCommandCategory.TEXT,
  [VNRecordType.DELOBJ]: VNCommandCategory.OBJECTS,
  [VNRecordType.SHOWOBJ]: VNCommandCategory.OBJECTS,
  [VNRecordType.HIDEOBJ]: VNCommandCategory.OBJECTS,
  [VNRecordType.LOAD]: VNCommandCategory.SAVE_LOAD,
  [VNRecordType.SAVE]: VNCommandCategory.SAVE_LOAD,
  [VNRecordType.CLOSEAVI]: VNCommandCategory.MEDIA_VIDEO,
  [VNRecordType.CLOSEMID]: VNCommandCategory.MEDIA_AUDIO,
};

/**
 * Record de collision rectangulaire (Type 2 / PREFS)
 * Note: Type 2 est utilisé pour les collisions, mais partage l'ID avec PREFS
 */
export interface VNRectCollision {
  type: VNRecordType.RECT_COLLISION;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Record audio WAV (Type 11 / PLAYWAV)
 */
export interface VNAudioWavRecord {
  type: VNRecordType.PLAYWAV;
  filePath: string;
  loop?: boolean;
  volume?: number;
}

/**
 * Record audio MIDI (Type 12 / PLAYMID)
 */
export interface VNAudioMidiRecord {
  type: VNRecordType.PLAYMID;
  filePath: string;
  loop?: boolean;
  volume?: number;
}

/**
 * Record conditionnel (Type 21 / IF)
 * Format: "VARIABLE OPERATEUR VALEUR then COMMANDE"
 */
export interface VNConditionalRecord {
  type: VNRecordType.IF;
  expression: string;
  variable?: string;
  operator?: string;  // =, !=, <, >, <=, >=
  value?: number | string;
  thenCommand?: string;
  elseCommand?: string;
}

/**
 * Record texte avec effet (Type 38 / PLAYTEXT)
 */
export interface VNPlayTextRecord {
  type: VNRecordType.PLAYTEXT;
  objectName: string;
  text: string;
  x: number;
  y: number;
}

/**
 * Record de collision polygonale (Type 105)
 * Utilisé pour les zones cliquables complexes (bâtiments, personnages)
 */
export interface VNPolygonCollision {
  type: VNRecordType.POLYGON_COLLISION;
  pointCount: number;
  points: VNPoint[];
}

/**
 * Record scène (Type 6 / SCENE)
 */
export interface VNSceneRecord {
  type: VNRecordType.SCENE;
  sceneName: string;
  sceneIndex?: number;
}

/**
 * Record variable (Type 22 / SET_VAR)
 */
export interface VNSetVarRecord {
  type: VNRecordType.SET_VAR;
  varName: string;
  value: number | string;
  isRandom?: boolean;
  min?: number;
  max?: number;
}

/**
 * Record bitmap (Type 27 / ADDBMP)
 */
export interface VNAddBmpRecord {
  type: VNRecordType.ADDBMP;
  objectName: string;
  filePath: string;
  x: number;
  y: number;
  transparent?: boolean;
  transparentColor?: number;
}

/**
 * Record exécution (Type 17 / EXEC)
 */
export interface VNExecRecord {
  type: VNRecordType.EXEC;
  program: string;
  arguments?: string;
  waitForCompletion?: boolean;
}

/**
 * Record chargement projet (Type 31 / RUNPRJ)
 */
export interface VNRunPrjRecord {
  type: VNRecordType.RUNPRJ;
  projectFile: string;
  startScene?: string;
}

/**
 * Union de tous les types de records parsés
 */
export type VNRecord =
  | VNRectCollision
  | VNAudioWavRecord
  | VNAudioMidiRecord
  | VNConditionalRecord
  | VNPlayTextRecord
  | VNPolygonCollision
  | VNSceneRecord
  | VNSetVarRecord
  | VNAddBmpRecord
  | VNExecRecord
  | VNRunPrjRecord;

// ============================================================================
// ÉVÉNEMENTS VN - Découverts dans europeo.exe @ 0x43f8cf
// ============================================================================

/**
 * Types d'événements VN
 * Chaque hotspot/scène peut avoir des handlers pour ces événements
 */
export enum VNEventType {
  /** Événement déclenché quand la souris survole un élément */
  EV_ONFOCUS = 0,
  /** Événement déclenché au clic sur un élément */
  EV_ONCLICK = 1,
  /** Événement déclenché à l'initialisation de la scène (avant affichage) */
  EV_ONINIT = 2,
  /** Événement déclenché après l'initialisation (après affichage background) */
  EV_AFTERINIT = 3,
}

/**
 * Noms des événements tels qu'utilisés dans les fichiers VN
 */
export const VNEventNames: Record<VNEventType, string> = {
  [VNEventType.EV_ONFOCUS]: 'EV_ONFOCUS',
  [VNEventType.EV_ONCLICK]: 'EV_ONCLICK',
  [VNEventType.EV_ONINIT]: 'EV_ONINIT',
  [VNEventType.EV_AFTERINIT]: 'EV_AFTERINIT',
};

// ============================================================================
// CLASSES TVN*Parms - Paramètres de commandes découverts dans europeo.exe
// ============================================================================

/**
 * Types de classes TVN*Parms (Borland C++ serialization)
 * Chaque commande VN a une classe de paramètres associée
 * Découvert dans europeo.exe @ 0x40ec00-0x411000
 */
export enum TVNParmsType {
  // === Paramètres projet/scène ===
  PROJECT = 'TVNProjectParms',     // Paramètres globaux du projet
  SCENE = 'TVNSceneParms',         // Paramètres d'une scène
  HOTSPOT = 'TVNHotspotParms',     // Paramètres d'un hotspot

  // === Paramètres média audio ===
  MIDI = 'TVNMidiParms',           // Lecture fichier MIDI
  DIGIT = 'TVNDigitParms',         // Lecture audio numérique (WAV)
  CDA = 'TVNCDAParms',             // Lecture CD Audio

  // === Paramètres média visuel ===
  IMAGE = 'TVNImageParms',         // Affichage image statique
  IMG_OBJ = 'TVNImgObjParms',      // Objet image (sprite)
  IMG_SEQ = 'TVNImgSeqParms',      // Séquence d'images (animation)

  // === Paramètres texte ===
  TEXT = 'TVNTextParms',           // Affichage texte simple
  TEXT_OBJ = 'TVNTextObjParms',    // Objet texte (label)
  FONT = 'TVNFontParms',           // Configuration police
  STRING = 'TVNStringParms',       // Chaîne de caractères
  HTML = 'TVNHtmlParms',           // Contenu HTML

  // === Paramètres variables ===
  SET_VAR = 'TVNSetVarParms',      // Définir variable
  INC_VAR = 'TVNIncVarParms',      // Incrémenter variable
  DEC_VAR = 'TVNDecVarParms',      // Décrémenter variable

  // === Paramètres contrôle de flux ===
  IF = 'TVNIfParms',               // Condition if
  CONDITION = 'TVNConditionParms', // Expression conditionnelle

  // === Paramètres géométrie ===
  RECT = 'TVNRectParms',           // Rectangle (collision/zone)

  // === Paramètres système ===
  EXEC = 'TVNExecParms',           // Exécution programme externe
  FILENAME = 'TVNFileNameParms',   // Référence fichier
  TIME = 'TVNTimeParms',           // Temporisation/délai
  COMMAND = 'TVNCommandParms',     // Commande générique
}

/**
 * Interface de base pour tous les paramètres TVN
 */
export interface TVNBaseParms {
  parmsType: TVNParmsType;
}

/**
 * Paramètres de projet (TVNProjectParms)
 */
export interface TVNProjectParms extends TVNBaseParms {
  parmsType: TVNParmsType.PROJECT;
  name: string;
  displayWidth: number;
  displayHeight: number;
  colorDepth: number;
  dataFilePath?: string;
}

/**
 * Paramètres de scène (TVNSceneParms)
 */
export interface TVNSceneParms extends TVNBaseParms {
  parmsType: TVNParmsType.SCENE;
  name: string;
  backgroundFile: string;
  backgroundColor?: number;
  musicFile?: string;
  musicLoop?: boolean;
}

/**
 * Paramètres de hotspot (TVNHotspotParms)
 */
export interface TVNHotspotParms extends TVNBaseParms {
  parmsType: TVNParmsType.HOTSPOT;
  name: string;
  shapeType: number; // 0 = rect, 1 = polygon
  enabled: boolean;
  cursorFile?: string;
}

/**
 * Paramètres audio MIDI (TVNMidiParms)
 */
export interface TVNMidiParms extends TVNBaseParms {
  parmsType: TVNParmsType.MIDI;
  filename: string;
  loop: boolean;
  volume?: number;
}

/**
 * Paramètres audio numérique/WAV (TVNDigitParms)
 */
export interface TVNDigitParms extends TVNBaseParms {
  parmsType: TVNParmsType.DIGIT;
  filename: string;
  loop: boolean;
  volume?: number;
}

/**
 * Paramètres CD Audio (TVNCDAParms)
 */
export interface TVNCDAParms extends TVNBaseParms {
  parmsType: TVNParmsType.CDA;
  track: number;
  loop: boolean;
}

/**
 * Paramètres image (TVNImageParms)
 */
export interface TVNImageParms extends TVNBaseParms {
  parmsType: TVNParmsType.IMAGE;
  filename: string;
  x: number;
  y: number;
  transparent?: boolean;
  transparentColor?: number;
}

/**
 * Paramètres objet image (TVNImgObjParms)
 */
export interface TVNImgObjParms extends TVNBaseParms {
  parmsType: TVNParmsType.IMG_OBJ;
  objectName: string;
  filename: string;
  x: number;
  y: number;
  visible: boolean;
  transparent?: boolean;
  transparentColor?: number;
}

/**
 * Paramètres séquence d'images (TVNImgSeqParms)
 */
export interface TVNImgSeqParms extends TVNBaseParms {
  parmsType: TVNParmsType.IMG_SEQ;
  filenamePattern: string;
  startFrame: number;
  endFrame: number;
  x: number;
  y: number;
  delay: number;
  loop: boolean;
}

/**
 * Paramètres texte (TVNTextParms)
 */
export interface TVNTextParms extends TVNBaseParms {
  parmsType: TVNParmsType.TEXT;
  text: string;
  x: number;
  y: number;
  color?: number;
}

/**
 * Paramètres objet texte (TVNTextObjParms)
 */
export interface TVNTextObjParms extends TVNBaseParms {
  parmsType: TVNParmsType.TEXT_OBJ;
  objectName: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
  color?: number;
  fontName?: string;
  fontSize?: number;
}

/**
 * Paramètres police (TVNFontParms)
 */
export interface TVNFontParms extends TVNBaseParms {
  parmsType: TVNParmsType.FONT;
  fontName: string;
  fontSize: number;
  fontStyle: number; // 0=normal, 1=bold, 2=italic, 3=bold+italic
  color: number;
}

/**
 * Paramètres chaîne (TVNStringParms)
 */
export interface TVNStringParms extends TVNBaseParms {
  parmsType: TVNParmsType.STRING;
  value: string;
}

/**
 * Paramètres HTML (TVNHtmlParms)
 */
export interface TVNHtmlParms extends TVNBaseParms {
  parmsType: TVNParmsType.HTML;
  objectName: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Paramètres set variable (TVNSetVarParms)
 */
export interface TVNSetVarParms extends TVNBaseParms {
  parmsType: TVNParmsType.SET_VAR;
  varName: string;
  value: number | string;
  random?: boolean;
  min?: number;
  max?: number;
}

/**
 * Paramètres incrémenter variable (TVNIncVarParms)
 */
export interface TVNIncVarParms extends TVNBaseParms {
  parmsType: TVNParmsType.INC_VAR;
  varName: string;
  amount: number;
}

/**
 * Paramètres décrémenter variable (TVNDecVarParms)
 */
export interface TVNDecVarParms extends TVNBaseParms {
  parmsType: TVNParmsType.DEC_VAR;
  varName: string;
  amount: number;
}

/**
 * Paramètres condition if (TVNIfParms)
 */
export interface TVNIfParms extends TVNBaseParms {
  parmsType: TVNParmsType.IF;
  varName: string;
  operator: string; // =, !=, <, >, <=, >=
  compareValue: number | string;
}

/**
 * Paramètres expression conditionnelle (TVNConditionParms)
 */
export interface TVNConditionParms extends TVNBaseParms {
  parmsType: TVNParmsType.CONDITION;
  expression: string;
  variable?: string;
  operator?: string;
  value?: number | string;
}

/**
 * Paramètres rectangle (TVNRectParms)
 */
export interface TVNRectParms extends TVNBaseParms {
  parmsType: TVNParmsType.RECT;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Paramètres exécution (TVNExecParms)
 */
export interface TVNExecParms extends TVNBaseParms {
  parmsType: TVNParmsType.EXEC;
  program: string;
  arguments?: string;
  waitForCompletion?: boolean;
}

/**
 * Paramètres nom de fichier (TVNFileNameParms)
 */
export interface TVNFileNameParms extends TVNBaseParms {
  parmsType: TVNParmsType.FILENAME;
  filename: string;
  path?: string;
}

/**
 * Paramètres temps (TVNTimeParms)
 */
export interface TVNTimeParms extends TVNBaseParms {
  parmsType: TVNParmsType.TIME;
  duration: number; // en millisecondes
}

/**
 * Paramètres commande générique (TVNCommandParms)
 */
export interface TVNCommandParms extends TVNBaseParms {
  parmsType: TVNParmsType.COMMAND;
  commandString: string;
}

/**
 * Union de tous les types de paramètres TVN
 */
export type TVNParms =
  | TVNProjectParms
  | TVNSceneParms
  | TVNHotspotParms
  | TVNMidiParms
  | TVNDigitParms
  | TVNCDAParms
  | TVNImageParms
  | TVNImgObjParms
  | TVNImgSeqParms
  | TVNTextParms
  | TVNTextObjParms
  | TVNFontParms
  | TVNStringParms
  | TVNHtmlParms
  | TVNSetVarParms
  | TVNIncVarParms
  | TVNDecVarParms
  | TVNIfParms
  | TVNConditionParms
  | TVNRectParms
  | TVNExecParms
  | TVNFileNameParms
  | TVNTimeParms
  | TVNCommandParms;

// ============================================================================
// CLASSES STREAMABLES - Classes sérialisables Borland découvertes dans europeo.exe
// ============================================================================

/**
 * Toutes les classes streamables du moteur VN
 * Ces classes héritent de TStreamableBase (Borland) via TVNStreamable
 * Découvert dans europeo.exe @ 0x40ec00-0x411600
 */
export enum TVNStreamableClass {
  // === Classes de base ===
  STREAMABLE_BASE = 'TStreamableBase',
  VN_STREAMABLE = 'TVNStreamable',
  VN_OBJECT = 'TVNObject',
  VN_INDEX_DEPENDANT = 'TVNIndexDependant',

  // === Variables ===
  VN_VARIABLE = 'TVNVariable',
  VN_VARIABLE_ARRAY = 'TVNVariableArray',

  // === Commandes ===
  VN_COMMAND = 'TVNCommand',
  VN_COMMAND_ARRAY = 'TVNCommandArray',
  VN_EVENT_COMMAND = 'TVNEventCommand',
  VN_EVENT_COMMAND_ARRAY = 'TVNEventCommandArray',

  // === Paramètres (mêmes que TVNParmsType mais en tant que classes) ===
  PROJECT_PARMS = 'TVNProjectParms',
  SCENE_PARMS = 'TVNSceneParms',
  HOTSPOT_PARMS = 'TVNHotspotParms',
  MIDI_PARMS = 'TVNMidiParms',
  DIGIT_PARMS = 'TVNDigitParms',
  CDA_PARMS = 'TVNCDAParms',
  IMAGE_PARMS = 'TVNImageParms',
  IMG_OBJ_PARMS = 'TVNImgObjParms',
  IMG_SEQ_PARMS = 'TVNImgSeqParms',
  TEXT_PARMS = 'TVNTextParms',
  TEXT_OBJ_PARMS = 'TVNTextObjParms',
  FONT_PARMS = 'TVNFontParms',
  STRING_PARMS = 'TVNStringParms',
  HTML_PARMS = 'TVNHtmlParms',
  SET_VAR_PARMS = 'TVNSetVarParms',
  INC_VAR_PARMS = 'TVNIncVarParms',
  DEC_VAR_PARMS = 'TVNDecVarParms',
  IF_PARMS = 'TVNIfParms',
  CONDITION_PARMS = 'TVNConditionParms',
  RECT_PARMS = 'TVNRectParms',
  EXEC_PARMS = 'TVNExecParms',
  FILENAME_PARMS = 'TVNFileNameParms',
  TIME_PARMS = 'TVNTimeParms',
  COMMAND_PARMS = 'TVNCommandParms',
}

/**
 * Information de classe streamable pour la sérialisation Borland
 */
export interface TVNStreamableInfo {
  className: TVNStreamableClass;
  version: number;
  delta?: number; // Offset dans le stream
}

/**
 * Mapping nom de classe -> type pour désérialisation
 */
export const StreamableClassMap: Record<string, TVNStreamableClass> = {
  'TStreamableBase': TVNStreamableClass.STREAMABLE_BASE,
  'TVNStreamable': TVNStreamableClass.VN_STREAMABLE,
  'TVNObject': TVNStreamableClass.VN_OBJECT,
  'TVNIndexDependant': TVNStreamableClass.VN_INDEX_DEPENDANT,
  'TVNVariable': TVNStreamableClass.VN_VARIABLE,
  'TVNVariableArray': TVNStreamableClass.VN_VARIABLE_ARRAY,
  'TVNCommand': TVNStreamableClass.VN_COMMAND,
  'TVNCommandArray': TVNStreamableClass.VN_COMMAND_ARRAY,
  'TVNEventCommand': TVNStreamableClass.VN_EVENT_COMMAND,
  'TVNEventCommandArray': TVNStreamableClass.VN_EVENT_COMMAND_ARRAY,
  'TVNProjectParms': TVNStreamableClass.PROJECT_PARMS,
  'TVNSceneParms': TVNStreamableClass.SCENE_PARMS,
  'TVNHotspotParms': TVNStreamableClass.HOTSPOT_PARMS,
  'TVNMidiParms': TVNStreamableClass.MIDI_PARMS,
  'TVNDigitParms': TVNStreamableClass.DIGIT_PARMS,
  'TVNCDAParms': TVNStreamableClass.CDA_PARMS,
  'TVNImageParms': TVNStreamableClass.IMAGE_PARMS,
  'TVNImgObjParms': TVNStreamableClass.IMG_OBJ_PARMS,
  'TVNImgSeqParms': TVNStreamableClass.IMG_SEQ_PARMS,
  'TVNTextParms': TVNStreamableClass.TEXT_PARMS,
  'TVNTextObjParms': TVNStreamableClass.TEXT_OBJ_PARMS,
  'TVNFontParms': TVNStreamableClass.FONT_PARMS,
  'TVNStringParms': TVNStreamableClass.STRING_PARMS,
  'TVNHtmlParms': TVNStreamableClass.HTML_PARMS,
  'TVNSetVarParms': TVNStreamableClass.SET_VAR_PARMS,
  'TVNIncVarParms': TVNStreamableClass.INC_VAR_PARMS,
  'TVNDecVarParms': TVNStreamableClass.DEC_VAR_PARMS,
  'TVNIfParms': TVNStreamableClass.IF_PARMS,
  'TVNConditionParms': TVNStreamableClass.CONDITION_PARMS,
  'TVNRectParms': TVNStreamableClass.RECT_PARMS,
  'TVNExecParms': TVNStreamableClass.EXEC_PARMS,
  'TVNFileNameParms': TVNStreamableClass.FILENAME_PARMS,
  'TVNTimeParms': TVNStreamableClass.TIME_PARMS,
  'TVNCommandParms': TVNStreamableClass.COMMAND_PARMS,
};

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
   * Parse un fichier VND (VNFILE/DATFILE binaire)
   *
   * Structure découverte par rétro-ingénierie de europeo.exe:
   * - 5 bytes: flags/version (3a 01 01 00 00)
   * - Borland string: "VNFILE"
   * - Borland string: version "2.13"
   * - uint32: flags1
   * - Borland strings: projectName, publisher, serial, shortName, regKey
   * - uint32: width, height, colorDepth
   * - Optionnel: 4 uint32 + Borland string (resourcePath)
   * - uint32: variableCount + variables
   * - uint32: sceneCount + scenes
   */
  private parseVNFile(buffer: ArrayBuffer): VNProject {
    const reader = new BinaryReader(buffer);

    // === HEADER (5 bytes) ===
    const headerFlags = reader.readBytes(5);
    console.log(`VND Header flags: ${Array.from(headerFlags).map(b => b.toString(16).padStart(2, '0')).join('')}`);

    // === MAGIC "VNFILE" (Borland string) ===
    const magic = reader.readBorlandString();
    if (magic !== 'VNFILE') {
      throw new VNFileError(`Invalid VND file: expected VNFILE magic, got "${magic}"`, reader.pos);
    }

    // === VERSION (Borland string, e.g., "2.13") ===
    const versionStr = reader.readBorlandString();
    const versionParts = versionStr.split('.');
    const version = {
      major: parseInt(versionParts[0]) || 2,
      minor: parseInt(versionParts[1]) || 0,
    };
    // Version word pour comparaisons: 2.13 -> 0x2000d (2 * 0x1000 + 13)
    const versionWord = (version.major << 12) | version.minor;
    console.log(`VND version: ${versionStr} (word: 0x${versionWord.toString(16)})`);

    // === FLAGS1 (uint32) ===
    const flags1 = reader.readUint32();

    // === PROJECT METADATA (Borland strings) ===
    const projectName = reader.readBorlandString();
    const publisher = reader.readBorlandString();
    const serial = reader.readBorlandString();
    const shortName = reader.readBorlandString();
    const regKey = reader.readBorlandString();

    console.log(`Project: ${projectName} by ${publisher}`);

    // === DISPLAY SETTINGS (uint32) ===
    const displayWidth = reader.readUint32();
    const displayHeight = reader.readUint32();
    const colorDepth = reader.readUint32();

    console.log(`Display: ${displayWidth}x${displayHeight} @ ${colorDepth}bpp`);

    // === OPTIONAL SECTION (before variables) ===
    // 4 unknown uint32 + resource path string
    const unknown0 = reader.readUint32();
    const unknown1 = reader.readUint32();
    const unknown2 = reader.readUint32();
    const unknown3 = reader.readUint32();
    const resourcePath = reader.readBorlandString();
    if (resourcePath) {
      console.log(`Resource path: ${resourcePath}`);
    }

    // === VARIABLES (AVANT les scènes!) ===
    const variableCount = reader.readUint32();
    console.log(`Variables: ${variableCount}`);
    const variables = new Map<string, VNVariable>();

    for (let i = 0; i < variableCount; i++) {
      const varName = reader.readBorlandString().toUpperCase();
      const varValue = reader.readInt32();
      variables.set(varName, { name: varName, value: varValue });
    }

    // === SCENES ===
    const sceneCount = reader.readUint32();
    console.log(`Scenes: ${sceneCount}`);
    const scenes: VNScene[] = [];

    for (let i = 0; i < sceneCount; i++) {
      try {
        scenes.push(this.readSceneVND(reader, i));
      } catch (e) {
        console.error(`Error parsing scene ${i}:`, e);
        break;
      }
    }

    return {
      name: projectName,
      version: versionStr,
      displayWidth,
      displayHeight,
      colorDepth,
      displayMode: VNDisplayModeType.WINDOWED,
      dataFilePath: resourcePath,
      scenes,
      variables,
      startSceneIndex: 0,
    };
  }

  /**
   * Lit une scène au format VND réel
   *
   * Structure:
   * - 50 bytes: nom (fixe, null-padded)
   * - 1 byte: flag
   * - Borland string: resource
   * - 32 bytes: zeros (réservé)
   * - 6 uint32: propriétés (bitmask, delay, autoJump, reserved×3)
   * - uint32: hotspotCount
   * - uint32: commandCount
   * - hotspots et commands
   */
  private readSceneVND(reader: BinaryReader, index: number): VNScene {
    const startPos = reader.pos;

    // Nom de la scène (50 bytes fixe)
    const nameBytes = reader.readBytes(50);
    const name = new TextDecoder('windows-1252').decode(nameBytes).split('\0')[0];

    // Flag (1 byte)
    const sceneFlag = reader.readUint8();

    // Resource (Borland string)
    const backgroundFile = reader.readBorlandString();

    // 32 bytes réservés (généralement zéros)
    reader.skip(32);

    // Propriétés de scène (6 uint32)
    const bitmask = reader.readUint32();
    const timerDelay = reader.readUint32();
    const timerAutoJump = reader.readUint32();
    reader.readUint32(); // reserved1
    reader.readUint32(); // reserved2
    reader.readUint32(); // reserved3

    // Comptes
    const hotspotCount = reader.readUint32();
    const commandCount = reader.readUint32();

    console.log(`  Scene ${index}: "${name}" (bg: ${backgroundFile || 'none'}, hs: ${hotspotCount}, cmd: ${commandCount})`);

    // Parser les hotspots/commands
    const hotspots: VNHotspot[] = [];
    const onEnterCommands: VNCommand[] = [];

    // Les "commands" dans ce contexte sont en fait des blocs combinés hotspot+action
    for (let i = 0; i < commandCount; i++) {
      try {
        const cmd = this.readCommandBlockVND(reader);
        onEnterCommands.push(cmd);
      } catch (e) {
        console.warn(`  Warning: Error parsing command ${i} in scene "${name}":`, e);
        break;
      }
    }

    return {
      index,
      name,
      backgroundFile,
      hotspots,
      onEnterCommands,
      onExitCommands: [],
      properties: {
        bitmask,
        timerEnabled: timerDelay > 0,
        timerDelay,
        timerTargetScene: timerAutoJump > 0 ? `scene_${timerAutoJump}` : '',
        musicFile: '',
        musicLoop: false,
      },
    };
  }

  /**
   * Lit un bloc de commande au format VND
   *
   * Structure:
   * - 6 uint32: header (enabled, x, y, zOrder, reserved×2)
   * - uint32: type
   * - 50 bytes: description
   * - 48 bytes: reserved/padding
   * - Sous-commandes selon le type
   */
  private readCommandBlockVND(reader: BinaryReader): VNCommand {
    // Header (6 uint32 = 24 bytes)
    const enabled = reader.readUint32();
    const x = reader.readInt32();
    const y = reader.readInt32();
    const zOrder = reader.readUint32();
    reader.readUint32(); // reserved1
    reader.readUint32(); // reserved2

    // Type de commande
    const cmdType = reader.readUint32();

    // Description (50 bytes fixe)
    const descBytes = reader.readBytes(50);
    const description = new TextDecoder('windows-1252').decode(descBytes).split('\0')[0];

    // 48 bytes padding
    reader.skip(48);

    // Créer la commande de base
    const command: VNCommand = {
      type: cmdType as VNCommandType,
      params: {
        rawCommand: description,
        enabled: enabled !== 0,
        x,
        y,
        zOrder,
      },
    };

    // Parser les sous-commandes selon le type
    this.parseCommandDataVND(reader, command, cmdType);

    return command;
  }

  /**
   * Parse les données spécifiques selon le type de commande
   */
  private parseCommandDataVND(reader: BinaryReader, command: VNCommand, cmdType: number): void {
    // Structure des sous-commandes: visibility(u32), field1(u32), field2(u32), subType(u32), [data]
    const visibility = reader.readUint32();
    const field1 = reader.readUint32();
    const field2 = reader.readUint32();
    const subType = reader.readUint32();

    command.params.visibility = visibility;
    command.params.subType = subType;

    // Parser selon le sous-type
    switch (subType) {
      case VNRecordType.PLAYAVI: // 9
        command.params.aviPath = reader.readBorlandString();
        break;

      case VNRecordType.PLAYBMP: // 10
        command.params.bmpPath = reader.readBorlandString();
        break;

      case VNRecordType.PLAYWAV: // 11
        command.params.wavPath = reader.readBorlandString();
        break;

      case VNRecordType.SCENE: // 6
        command.params.targetScene = reader.readBorlandString();
        break;

      default:
        // Type inconnu, essayer de lire une chaîne si la longueur semble valide
        const peekLen = reader.peekUint32();
        if (peekLen > 0 && peekLen < 500) {
          command.params.data = reader.readBorlandString();
        }
        break;
    }
  }

  /**
   * Lit la version Borland (ancien format, gardé pour compatibilité)
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
   * Les "suffixes" (d, f, h, i, j, k, l, etc.) sont des OPCODES !
   * Le moteur utilise atol() pour extraire le nombre, puis le caractère
   * suivant est interprété comme opcode par le dispatcher.
   *
   * Table de dispatch complète (43 entrées, formule: index = opcode - 6)
   * Source: sub_43177D @ 0x4317D5
   */
  private static readonly OPCODE_MAP: Record<string, VNOpcodeInfo> = {
    // === Opcodes de navigation (lettres) ===
    d: { code: 4, name: 'DIRECT_JUMP', description: 'Saut direct vers ID scène absolu' },
    f: { code: 6, name: 'SCENE_JUMP', description: 'Changement de scène' },
    h: { code: 8, name: 'TOOLTIP', description: 'Afficher tooltip/texte info' },
    i: { code: 9, name: 'INDEX_IMAGE', description: 'Saut indexé ou chargement image' },
    j: { code: 10, name: 'BITMAP_PALETTE', description: 'Gestion bitmap/palette' },
    k: { code: 11, name: 'PLAY_WAV', description: 'Jouer fichier audio WAV' },
    l: { code: 12, name: 'PLAY_MIDI', description: 'Jouer séquence MIDI' },

    // === Opcodes spéciaux (caractères ASCII 0x20-0x30) ===
    ' ': { code: 26, name: 'SPACE', description: 'Séparateur / espace' },
    '!': { code: 27, name: 'NOT_EXCLAIM', description: 'Opérateur NOT / flag' },
    '"': { code: 28, name: 'QUOTE', description: 'Délimiteur de chaîne' },
    '#': { code: 29, name: 'COLOR', description: 'Couleur hex (#RRGGBB)' },
    $: { code: 30, name: 'VARIABLE_STOP_WAV', description: 'Référence variable / Stop WAV' },
    '%': { code: 31, name: 'FORMAT', description: 'Spécificateur de format' },
    '&': { code: 32, name: 'BITMAP_AND', description: 'Opération bitmap / AND' },
    "'": { code: 33, name: 'APOSTROPHE', description: 'Caractère littéral / flags' },
    '(': { code: 34, name: 'PAREN_OPEN', description: 'Parenthèse ouvrante' },
    ')': { code: 35, name: 'PAREN_CLOSE', description: 'Fin de groupement' },
    '*': { code: 36, name: 'MULTIPLY_WILDCARD', description: 'Multiplication / wildcard' },
    '+': { code: 37, name: 'ADD_REL_PLUS', description: 'Addition / relatif positif' },
    ',': { code: 38, name: 'COMMA', description: 'Séparateur virgule' },
    '-': { code: 39, name: 'SUB_REL_MINUS', description: 'Soustraction / relatif négatif' },
    '.': { code: 40, name: 'DOT_DECIMAL', description: 'Point décimal / extension' },
    '/': { code: 41, name: 'DIVIDE_STOP_MIDI', description: 'Division / path / Stop MIDI' },
    '0': { code: 42, name: 'ZERO_MIDI_CTRL', description: 'Chiffre 0 / contrôle MIDI' },
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

    if (parsed.value !== undefined || parsed.opcode) {
      return {
        index: parsed.value,
        suffix: parsed.opcode?.name?.charAt(0).toLowerCase(),
        opcode: parsed.opcode,
      };
    }

    // Sinon c'est un nom de scène sans index
    return {};
  }

  // ==================== PARSING DES RECORDS BINAIRES ====================

  /**
   * Lit un record binaire et retourne le type approprié
   * Le type est lu comme uint32 LE au début du record
   */
  private readRecord(reader: BinaryReader): VNRecord | null {
    if (reader.remaining < 4) return null;

    const recordType = reader.readUint32();

    switch (recordType) {
      case VNRecordType.RECT_COLLISION:
        return this.readRectCollision(reader);
      case VNRecordType.AUDIO_WAV:
        return this.readAudioWavRecord(reader);
      case VNRecordType.AUDIO_MIDI:
        return this.readAudioMidiRecord(reader);
      case VNRecordType.CONDITIONAL:
        return this.readConditionalRecord(reader);
      case VNRecordType.HOTSPOT_TEXT:
        return this.readHotspotTextRecord(reader);
      case VNRecordType.POLYGON_COLLISION:
        return this.readPolygonCollision(reader);
      default:
        console.warn(`Unknown record type: 0x${recordType.toString(16)}`);
        return null;
    }
  }

  /**
   * Lit un record de collision rectangulaire (Type 2)
   */
  private readRectCollision(reader: BinaryReader): VNRectCollision {
    return {
      type: VNRecordType.RECT_COLLISION,
      x1: reader.readInt32(),
      y1: reader.readInt32(),
      x2: reader.readInt32(),
      y2: reader.readInt32(),
    };
  }

  /**
   * Lit un record audio WAV (Type 11)
   */
  private readAudioWavRecord(reader: BinaryReader): VNAudioWavRecord {
    return {
      type: VNRecordType.AUDIO_WAV,
      filePath: reader.readBorlandString(),
    };
  }

  /**
   * Lit un record audio MIDI (Type 12)
   */
  private readAudioMidiRecord(reader: BinaryReader): VNAudioMidiRecord {
    return {
      type: VNRecordType.AUDIO_MIDI,
      filePath: reader.readBorlandString(),
    };
  }

  /**
   * Lit un record conditionnel (Type 21)
   * Format: "VARIABLE OPERATEUR VALEUR then COMMANDE"
   */
  private readConditionalRecord(reader: BinaryReader): VNConditionalRecord {
    const expression = reader.readBorlandString();

    // Parser l'expression conditionnelle
    const record: VNConditionalRecord = {
      type: VNRecordType.CONDITIONAL,
      expression,
    };

    // Pattern: VARIABLE OPERATOR VALUE then COMMAND
    const match = expression.match(/^(\w+)\s*(=|!=|<|>|<=|>=)\s*(\S+)\s+then\s+(.+)$/i);
    if (match) {
      record.variable = match[1];
      record.operator = match[2];
      record.value = isNaN(Number(match[3])) ? match[3] : Number(match[3]);
      record.thenCommand = match[4];
    }

    return record;
  }

  /**
   * Lit un record texte de hotspot (Type 38)
   */
  private readHotspotTextRecord(reader: BinaryReader): VNHotspotTextRecord {
    return {
      type: VNRecordType.HOTSPOT_TEXT,
      text: reader.readBorlandString(),
      x: reader.readInt32(),
      y: reader.readInt32(),
    };
  }

  /**
   * Lit un record de collision polygonale (Type 105)
   * Structure: [pointCount:uint32] [points: (x:int32, y:int32) * pointCount]
   */
  private readPolygonCollision(reader: BinaryReader): VNPolygonCollision {
    const pointCount = reader.readUint32();

    // Validation: éviter les corruptions de données
    if (pointCount > 1000) {
      throw new VNFileError(`Invalid polygon point count: ${pointCount}`, reader.pos);
    }

    const points: VNPoint[] = [];
    for (let i = 0; i < pointCount; i++) {
      points.push({
        x: reader.readInt32(),
        y: reader.readInt32(),
      });
    }

    return {
      type: VNRecordType.POLYGON_COLLISION,
      pointCount,
      points,
    };
  }

  /**
   * Convertit un VNPolygonCollision en tableau de VNPoint pour les hotspots
   */
  polygonToPoints(polygon: VNPolygonCollision): VNPoint[] {
    return polygon.points;
  }

  /**
   * Vérifie si un point est à l'intérieur d'un polygone (ray casting algorithm)
   */
  isPointInPolygon(point: VNPoint, polygon: VNPoint[]): boolean {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  // ==================== FIN PARSING DES RECORDS ====================

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
