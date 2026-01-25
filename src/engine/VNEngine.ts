/**
 * VNEngine - Moteur principal
 *
 * Reproduit fidèlement l'architecture de Virtual Navigator 2.1:
 * - TVNApplication: Application principale
 * - TVNFrame: Fenêtre principale
 * - Orchestration de tous les sous-systèmes
 *
 * C'est le point d'entrée principal du moteur VN.
 */

import {
  VNProjectInfo,
  VNScene,
  VNHotspot,
  VNCommand,
  VNDisplayObject,
  VNEvent,
  VNEventType,
  VNImageParms,
  VNTextParms,
  VNHtmlParms,
  VNScrollParms,
  VNZoomParms,
  VNAviParms,
  CommandType,
  ScrollDirection,
} from '../types/vn.types';
import { VNVariableStore, getGlobalVariableStore, resetGlobalVariableStore } from './VNVariableStore';
import { VNCommandProcessor, VNExecutionContext } from './VNCommandProcessor';
import { VNAudioManager, getGlobalAudioManager, resetGlobalAudioManager, MediaType } from './VNAudioManager';
import { VNRenderer } from './VNRenderer';
import { VNSceneManager, SceneEvent } from './VNSceneManager';
import { VNTimerManager, getGlobalTimerManager, resetGlobalTimerManager } from './VNTimerManager';

// État du moteur
export enum EngineState {
  UNINITIALIZED = 'UNINITIALIZED',
  LOADING = 'LOADING',
  READY = 'READY',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  ERROR = 'ERROR',
}

// Options du moteur
export interface VNEngineOptions {
  canvas: HTMLCanvasElement;
  baseUrl?: string;
  width?: number;
  height?: number;
  showHotspots?: boolean;
  smoothZoom?: boolean;
  smoothScroll?: boolean;
  voicesEnabled?: boolean;
  musicEnabled?: boolean;
  videosEnabled?: boolean;
}

// Callbacks du moteur
export interface VNEngineCallbacks {
  onStateChange?: (state: EngineState) => void;
  onSceneChange?: (event: SceneEvent) => void;
  onEvent?: (event: VNEvent) => void;
  onError?: (error: Error) => void;
  onHotspotEnter?: (hotspot: VNHotspot) => void;
  onHotspotExit?: (hotspot: VNHotspot) => void;
  onHotspotClick?: (hotspot: VNHotspot) => void;
  onCursorChange?: (cursor: string) => void;
}

export class VNEngine implements VNExecutionContext {
  // État
  private state: EngineState = EngineState.UNINITIALIZED;

  // Projet chargé
  private project: VNProjectInfo | null = null;

  // Sous-systèmes
  public readonly variableStore: VNVariableStore;
  private readonly audioManager: VNAudioManager;
  private readonly renderer: VNRenderer;
  private readonly sceneManager: VNSceneManager;
  private readonly timerManager: VNTimerManager;
  private readonly commandProcessor: VNCommandProcessor;

  // Options
  private options: VNEngineOptions;

  // Callbacks
  private callbacks: VNEngineCallbacks = {};

  // État interne
  private currentCursor: string = 'default';
  private lastWaveFile: string | null = null;

  constructor(options: VNEngineOptions) {
    this.options = options;

    // Initialiser les sous-systèmes
    this.variableStore = getGlobalVariableStore();

    this.audioManager = getGlobalAudioManager();
    if (options.baseUrl) {
      this.audioManager.setBaseUrl(options.baseUrl);
    }
    this.audioManager.setVoicesEnabled(options.voicesEnabled ?? true);
    this.audioManager.setMusicEnabled(options.musicEnabled ?? true);

    this.renderer = new VNRenderer(options.canvas, {
      width: options.width ?? 800,
      height: options.height ?? 600,
      showHotspots: options.showHotspots ?? false,
      smoothZoom: options.smoothZoom ?? true,
      smoothScroll: options.smoothScroll ?? true,
    });
    if (options.baseUrl) {
      this.renderer.setBaseUrl(options.baseUrl);
    }

    this.sceneManager = new VNSceneManager();

    this.timerManager = getGlobalTimerManager();

    // Créer le command processor avec le contexte
    this.commandProcessor = new VNCommandProcessor(this);

    // Configurer les liens entre sous-systèmes
    this.sceneManager.setCommandProcessor(this.commandProcessor);
    this.timerManager.setCommandProcessor(this.commandProcessor);

    // Configurer les callbacks audio
    this.audioManager.setCallbacks({
      onStart: (type, filename) => {
        if (type === MediaType.WAVE) {
          this.lastWaveFile = filename;
        }
        this.emitEvent({
          type: VNEventType.MEDIA_START,
          timestamp: Date.now(),
          data: { mediaType: type, filename },
        });
      },
      onEnd: (type, filename) => {
        this.emitEvent({
          type: VNEventType.MEDIA_END,
          timestamp: Date.now(),
          data: { mediaType: type, filename },
        });
      },
      onError: (type, error) => {
        this.emitEvent({
          type: VNEventType.ERROR,
          timestamp: Date.now(),
          data: { mediaType: type, error: error.message },
        });
      },
    });

    // Configurer les callbacks de scène
    this.sceneManager.setOnSceneChange((event) => {
      this.handleSceneChange(event);
    });

    this.sceneManager.setOnHotspotClick((hotspot) => {
      this.callbacks.onHotspotClick?.(hotspot);
    });

    this.sceneManager.setOnHotspotEnter((hotspot) => {
      // Changer le curseur
      if (hotspot.cursorFile) {
        this.setCursor(hotspot.cursorFile);
      } else {
        this.setCursor('pointer');
      }
      this.callbacks.onHotspotEnter?.(hotspot);
    });

    this.sceneManager.setOnHotspotExit((hotspot) => {
      this.setCursor('default');
      this.callbacks.onHotspotExit?.(hotspot);
    });

    // État prêt
    this.setState(EngineState.READY);
  }

  // =========================================================================
  // ÉTAT
  // =========================================================================

  private setState(state: EngineState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  getState(): EngineState {
    return this.state;
  }

  // =========================================================================
  // CHARGEMENT DE PROJET
  // =========================================================================

  /**
   * Charge un projet VN
   */
  async loadProject(project: VNProjectInfo): Promise<void> {
    this.setState(EngineState.LOADING);

    try {
      this.project = project;

      // Réinitialiser les variables
      this.variableStore.clear();

      // Charger les scènes
      this.sceneManager.loadScenes(project.scenes);

      // Appliquer les options du projet
      this.audioManager.setVoicesEnabled(project.voicesEnabled);
      this.audioManager.setMusicEnabled(project.musicEnabled);

      // Précharger les images de la première scène
      if (project.startScene >= 0 && project.startScene < project.scenes.length) {
        const startScene = project.scenes[project.startScene];
        if (startScene.backgroundImage) {
          await this.renderer.loadImage(startScene.backgroundImage);
        }
      }

      this.setState(EngineState.READY);
    } catch (error) {
      this.setState(EngineState.ERROR);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Démarre le projet
   */
  async start(): Promise<void> {
    if (!this.project) {
      throw new Error('No project loaded');
    }

    if (this.state !== EngineState.READY && this.state !== EngineState.PAUSED) {
      throw new Error(`Cannot start from state: ${this.state}`);
    }

    this.setState(EngineState.PLAYING);

    // Aller à la scène de départ
    await this.sceneManager.goToScene(this.project.startScene);
  }

  /**
   * Met en pause le moteur
   */
  pause(): void {
    if (this.state !== EngineState.PLAYING) return;

    this.setState(EngineState.PAUSED);
    this.audioManager.pauseAll();
    this.timerManager.pauseAllTimers();
  }

  /**
   * Reprend le moteur
   */
  resume(): void {
    if (this.state !== EngineState.PAUSED) return;

    this.setState(EngineState.PLAYING);
    this.audioManager.resumeAll();
    this.timerManager.resumeAllTimers();
  }

  /**
   * Arrête le moteur
   */
  stop(): void {
    this.setState(EngineState.READY);
    this.audioManager.stopAll();
    this.timerManager.stopAllTimers();
    this.sceneManager.reset();
  }

  // =========================================================================
  // GESTION DES SCÈNES
  // =========================================================================

  private async handleSceneChange(event: SceneEvent): Promise<void> {
    if (event.type === 'enter') {
      // Charger l'arrière-plan
      if (event.scene.backgroundImage) {
        await this.renderer.setBackground(event.scene.backgroundImage);
      } else {
        this.renderer.clearBackground();
      }

      // Effacer les objets de la scène précédente
      this.renderer.clearObjects();

      // Ajouter les objets de la nouvelle scène
      for (const obj of event.scene.objects) {
        if (obj.type === 'IMAGE') {
          const imgObj = obj as VNDisplayObject & { filename: string };
          await this.renderer.addImageObject(
            obj.id,
            imgObj.filename,
            obj.x,
            obj.y,
            { zOrder: obj.zOrder, visible: obj.visible }
          );
        } else if (obj.type === 'TEXT') {
          const textObj = obj as VNDisplayObject & { text: string };
          this.renderer.addTextObject(
            obj.id,
            textObj.text,
            obj.x,
            obj.y,
            { zOrder: obj.zOrder, visible: obj.visible }
          );
        }
      }

      // Jouer la musique de la scène
      if (event.scene.properties.musicFile) {
        await this.audioManager.playMidi(
          event.scene.properties.musicFile,
          event.scene.properties.musicLoop ?? true
        );
      }

      // Dessiner les hotspots (debug)
      if (this.options.showHotspots) {
        this.renderer.renderHotspots(event.scene.hotspots);
      }
    }

    this.callbacks.onSceneChange?.(event);
  }

  // =========================================================================
  // IMPLEMENTATION DE VNExecutionContext
  // =========================================================================

  async goToScene(index: number): Promise<void> {
    await this.sceneManager.goToScene(index);
  }

  async showImage(params: VNImageParms): Promise<void> {
    await this.renderer.addImageObject(
      params.objectId,
      params.filename,
      params.x,
      params.y,
      {
        transparent: params.transparent,
        transparentColor: params.transparentColor,
        zOrder: params.zOrder,
      }
    );
  }

  async showText(params: VNTextParms): Promise<void> {
    this.renderer.addTextObject(params.objectId, params.text, params.x, params.y, {
      fontName: params.fontName,
      fontSize: params.fontSize,
      fontColor: params.fontColor,
      fontBold: params.fontBold,
      fontItalic: params.fontItalic,
      backgroundColor: params.backgroundColor,
      width: params.width,
      height: params.height,
      alignment: params.alignment,
    });
  }

  async showHtml(params: VNHtmlParms): Promise<void> {
    this.renderer.addHtmlObject(
      params.objectId,
      params.content,
      params.x,
      params.y,
      params.width,
      params.height
    );
  }

  hideObject(objectId: string): void {
    this.renderer.hideObject(objectId);
  }

  async playWave(filename: string, loop: boolean, volume: number): Promise<void> {
    await this.audioManager.playWave(filename, loop, volume);
  }

  stopWave(): void {
    this.audioManager.stopWave();
  }

  async playMidi(filename: string, loop: boolean, volume: number): Promise<void> {
    await this.audioManager.playMidi(filename, loop, volume);
  }

  stopMidi(): void {
    this.audioManager.stopMidi();
  }

  async playCDA(track: number, loop: boolean): Promise<void> {
    await this.audioManager.playCDA(track, loop);
  }

  stopCDA(): void {
    this.audioManager.stopCDA();
  }

  async playAvi(params: VNAviParms): Promise<void> {
    // Note: La lecture vidéo nécessite un élément <video> HTML
    // Cette implémentation est un placeholder
    console.log('Playing AVI:', params.filename);

    this.emitEvent({
      type: VNEventType.MEDIA_START,
      timestamp: Date.now(),
      data: { type: 'avi', filename: params.filename },
    });

    // TODO: Implémenter la lecture vidéo réelle
    // Créer un élément video, le positionner, et le lire
  }

  startTimer(id: string, interval: number, commands: VNCommand[]): void {
    this.timerManager.startTimer(id, interval, commands);
  }

  stopTimer(id: string): void {
    this.timerManager.stopTimer(id);
  }

  async startScroll(params: VNScrollParms): Promise<void> {
    await this.renderer.startScroll(params.direction, params.duration, params.distance);
  }

  async startZoom(params: VNZoomParms): Promise<void> {
    await this.renderer.startZoom(
      params.startScale,
      params.endScale,
      params.centerX,
      params.centerY,
      params.duration
    );
  }

  setCursor(cursorFile: string | null): void {
    if (cursorFile === null) {
      this.currentCursor = 'default';
    } else if (cursorFile.startsWith('url(')) {
      this.currentCursor = cursorFile;
    } else {
      // C'est un fichier curseur - le convertir en URL
      const path = this.options.baseUrl
        ? this.options.baseUrl + cursorFile.replace(/\\/g, '/')
        : cursorFile;
      this.currentCursor = `url(${path}), auto`;
    }

    this.callbacks.onCursorChange?.(this.currentCursor);
  }

  enableHotspot(id: string): void {
    this.sceneManager.enableHotspot(id);
  }

  disableHotspot(id: string): void {
    this.sceneManager.disableHotspot(id);
  }

  async executeExternal(program: string, args?: string, wait?: boolean): Promise<void> {
    // Note: L'exécution de programmes externes n'est pas possible dans le navigateur
    console.warn('External program execution not supported in browser:', program, args);

    this.emitEvent({
      type: VNEventType.ERROR,
      timestamp: Date.now(),
      data: { message: `Cannot execute external program: ${program}` },
    });
  }

  async navigateForward(): Promise<void> {
    await this.sceneManager.navigateForward();
  }

  async navigateBackward(): Promise<void> {
    await this.sceneManager.navigateBackward();
  }

  async navigateLeft(): Promise<void> {
    await this.sceneManager.navigateLeft();
  }

  async navigateRight(): Promise<void> {
    await this.sceneManager.navigateRight();
  }

  showMap(): void {
    // TODO: Implémenter l'affichage de la carte
    console.log('Show map requested');
  }

  showIndex(): void {
    // TODO: Implémenter l'affichage de l'index
    console.log('Show index requested');
  }

  replaySound(): void {
    this.audioManager.replay();
  }

  quit(): void {
    this.stop();
    this.emitEvent({
      type: VNEventType.COMMAND_EXECUTE,
      timestamp: Date.now(),
      data: { type: 'QUIT' },
    });
  }

  emitEvent(event: VNEvent): void {
    this.callbacks.onEvent?.(event);
  }

  getCurrentSceneIndex(): number {
    return this.sceneManager.currentIndex;
  }

  // =========================================================================
  // INTERACTION UTILISATEUR
  // =========================================================================

  /**
   * Gère un clic à une position
   */
  async handleClick(x: number, y: number): Promise<void> {
    const hotspot = this.renderer.findHotspotAt(x, y, this.sceneManager.getHotspots());
    if (hotspot) {
      await this.sceneManager.handleHotspotClick(hotspot);
    }
  }

  /**
   * Gère le mouvement de la souris
   */
  async handleMouseMove(x: number, y: number): Promise<void> {
    await this.sceneManager.handleMouseMove(x, y, (mx, my, hotspots) =>
      this.renderer.findHotspotAt(mx, my, hotspots)
    );
  }

  // =========================================================================
  // CALLBACKS
  // =========================================================================

  /**
   * Définit les callbacks
   */
  setCallbacks(callbacks: VNEngineCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // =========================================================================
  // ACCESSEURS
  // =========================================================================

  getProject(): VNProjectInfo | null {
    return this.project;
  }

  getCurrentScene(): VNScene | null {
    return this.sceneManager.currentScene;
  }

  getRenderer(): VNRenderer {
    return this.renderer;
  }

  getAudioManager(): VNAudioManager {
    return this.audioManager;
  }

  getSceneManager(): VNSceneManager {
    return this.sceneManager;
  }

  getTimerManager(): VNTimerManager {
    return this.timerManager;
  }

  getCommandProcessor(): VNCommandProcessor {
    return this.commandProcessor;
  }

  // =========================================================================
  // SAUVEGARDE / CHARGEMENT
  // =========================================================================

  /**
   * Exporte l'état complet du jeu
   */
  exportState(): {
    variables: Record<string, number>;
    sceneState: ReturnType<VNSceneManager['exportState']>;
    timerState: ReturnType<VNTimerManager['exportState']>;
  } {
    return {
      variables: this.variableStore.export(),
      sceneState: this.sceneManager.exportState(),
      timerState: this.timerManager.exportState(),
    };
  }

  /**
   * Importe un état de jeu
   */
  async importState(state: {
    variables: Record<string, number>;
    sceneState: Parameters<VNSceneManager['importState']>[0];
    timerState: Parameters<VNTimerManager['importState']>[0];
  }): Promise<void> {
    this.variableStore.import(state.variables);
    await this.sceneManager.importState(state.sceneState);
    this.timerManager.importState(state.timerState);
  }

  // =========================================================================
  // NETTOYAGE
  // =========================================================================

  /**
   * Libère toutes les ressources
   */
  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.audioManager.dispose();
    this.timerManager.dispose();
    resetGlobalVariableStore();
    resetGlobalAudioManager();
    resetGlobalTimerManager();
  }
}

// Factory function
export function createVNEngine(options: VNEngineOptions): VNEngine {
  return new VNEngine(options);
}
