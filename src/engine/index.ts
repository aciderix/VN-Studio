/**
 * VN Engine - Exports
 *
 * Moteur de Visual Novel - Port React de Virtual Navigator 2.1
 */

// Types
export * from '../types/vn.types';

// Moteur principal
export { VNEngine, createVNEngine, EngineState } from './VNEngine';
export type { VNEngineOptions, VNEngineCallbacks } from './VNEngine';

// Système de variables
export {
  VNVariableStore,
  getGlobalVariableStore,
  resetGlobalVariableStore,
} from './VNVariableStore';

// Processeur de commandes
export { VNCommandProcessor } from './VNCommandProcessor';
export type { VNExecutionContext } from './VNCommandProcessor';

// Gestionnaire audio
export {
  VNAudioManager,
  getGlobalAudioManager,
  resetGlobalAudioManager,
  MediaType,
} from './VNAudioManager';
export type { MediaState, AudioCallbacks } from './VNAudioManager';

// Rendu
export { VNRenderer } from './VNRenderer';
export type { VNRendererOptions, ScrollState, ZoomState, EffectState } from './VNRenderer';

// Gestionnaire de scènes
export { VNSceneManager } from './VNSceneManager';
export type { SceneEvent, SceneEventCallback, SceneEventType } from './VNSceneManager';

// Gestionnaire de timers
export {
  VNTimerManager,
  VNAnimationTimer,
  getGlobalTimerManager,
  getGlobalAnimationTimer,
  resetGlobalTimerManager,
  resetGlobalAnimationTimer,
} from './VNTimerManager';
export type { TimerState, TimerCallbacks } from './VNTimerManager';
