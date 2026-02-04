/**
 * VNEngine - Moteur principal
 *
 * Orchestre le chargement VND, la gestion des scènes,
 * l'exécution des commandes et le rendu.
 */

import {
  VNDFile,
  VNSceneRaw,
  VNEventType,
  VNEvent,
  VNEventCallback,
} from '../types/vn.types';
import { VNFileLoader } from './VNFileLoader';
import { VNSceneManager } from './VNSceneManager';
import { VNCommandProcessor, VNExecutionContext } from './VNCommandProcessor';
import { VNVariableStore, getGlobalVariableStore } from './VNVariableStore';
import { VNRenderer } from './VNRenderer';
import { VNAudioManager, getGlobalAudioManager } from './VNAudioManager';

export enum EngineState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

export interface VNEngineOptions {
  canvas?: HTMLCanvasElement;
  basePath?: string;
  autoStart?: boolean;
  debug?: boolean;
}

export interface VNEngineCallbacks {
  onStateChange?: (state: EngineState) => void;
  onSceneChange?: (scene: VNSceneRaw, index: number) => void;
  onError?: (error: Error) => void;
  onEvent?: VNEventCallback;
}

export class VNEngine {
  private state: EngineState = EngineState.IDLE;
  private project: VNDFile | null = null;
  private fileLoader: VNFileLoader;
  private sceneManager: VNSceneManager;
  private commandProcessor: VNCommandProcessor | null = null;
  private variableStore: VNVariableStore;
  private renderer: VNRenderer | null = null;
  private audioManager: VNAudioManager;
  private options: VNEngineOptions;
  private callbacks: VNEngineCallbacks;

  constructor(options: VNEngineOptions = {}, callbacks: VNEngineCallbacks = {}) {
    this.options = options;
    this.callbacks = callbacks;
    this.fileLoader = new VNFileLoader();
    this.sceneManager = new VNSceneManager();
    this.variableStore = getGlobalVariableStore();
    this.audioManager = getGlobalAudioManager();

    // Setup scene change callback
    this.sceneManager.setOnSceneChange((event) => {
      if (event.type === 'enter') {
        this.callbacks.onSceneChange?.(event.scene, event.sceneIndex);
        this.emitEvent(VNEventType.SCENE_ENTER, { scene: event.scene, index: event.sceneIndex });
      }
    });

    // Setup renderer if canvas provided
    if (options.canvas) {
      this.renderer = new VNRenderer({ canvas: options.canvas });
    }
  }

  /**
   * Charge un fichier VND depuis un ArrayBuffer
   */
  async loadVND(buffer: ArrayBuffer, fileName?: string): Promise<VNDFile> {
    this.setState(EngineState.LOADING);

    try {
      const project = this.fileLoader.parseVND(buffer, fileName);

      if (project.errors.length > 0) {
        console.warn('VND parse warnings:', project.errors);
      }

      this.project = project;

      // Charger les variables
      this.variableStore.clear();
      for (const v of project.variables) {
        this.variableStore.set(v.name, v.value);
      }

      // Charger les scènes
      this.sceneManager.loadScenes(project.scenes);

      // Configurer le command processor
      const context: VNExecutionContext = {
        variableStore: this.variableStore,
        sceneManager: this.sceneManager,
        onPlayWav: (path, loop) => this.audioManager.playWave(path, loop),
        onCloseWav: () => this.audioManager.stopWave(),
        onLog: this.options.debug ? (msg) => console.log(`[VN] ${msg}`) : undefined,
      };
      this.commandProcessor = new VNCommandProcessor(context);

      this.setState(EngineState.RUNNING);

      // Auto-start: aller à la première scène
      if (this.options.autoStart && project.scenes.length > 0) {
        this.sceneManager.goToScene(0);
      }

      return project;
    } catch (e) {
      this.setState(EngineState.ERROR);
      const error = e instanceof Error ? e : new Error(String(e));
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  // --- Accesseurs ---

  getState(): EngineState {
    return this.state;
  }

  getProject(): VNDFile | null {
    return this.project;
  }

  getSceneManager(): VNSceneManager {
    return this.sceneManager;
  }

  getVariableStore(): VNVariableStore {
    return this.variableStore;
  }

  getRenderer(): VNRenderer | null {
    return this.renderer;
  }

  getCurrentScene(): VNSceneRaw | null {
    return this.sceneManager.currentScene;
  }

  getCurrentSceneIndex(): number {
    return this.sceneManager.currentIndex;
  }

  // --- Navigation ---

  goToScene(index: number): void {
    this.sceneManager.goToScene(index);
  }

  goToSceneByName(name: string): void {
    this.sceneManager.goToSceneByName(name);
  }

  // --- Exécution ---

  async executeSceneCommands(): Promise<void> {
    if (!this.commandProcessor) return;
    const commands = this.sceneManager.getCurrentCommands();
    await this.commandProcessor.executeCommands(commands);
  }

  // --- État ---

  pause(): void {
    if (this.state === EngineState.RUNNING) {
      this.setState(EngineState.PAUSED);
    }
  }

  resume(): void {
    if (this.state === EngineState.PAUSED) {
      this.setState(EngineState.RUNNING);
    }
  }

  reset(): void {
    this.sceneManager.reset();
    this.variableStore.clear();
    this.audioManager.stopAll();
    this.project = null;
    this.commandProcessor = null;
    this.setState(EngineState.IDLE);
  }

  // --- Interne ---

  private setState(state: EngineState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private emitEvent(type: VNEventType, data?: unknown): void {
    const event: VNEvent = { type, timestamp: Date.now(), data };
    this.callbacks.onEvent?.(event);
  }
}

export function createVNEngine(options?: VNEngineOptions, callbacks?: VNEngineCallbacks): VNEngine {
  return new VNEngine(options, callbacks);
}
