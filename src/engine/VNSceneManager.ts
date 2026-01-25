/**
 * VNSceneManager - Gestionnaire de scènes
 *
 * Reproduit fidèlement la gestion des scènes de Virtual Navigator 2.1:
 * - TVNScene: Scène individuelle
 * - TVNSceneArray: Collection de scènes
 * - Navigation: forward, backward, left, right
 * - Historique de navigation
 *
 * Basé sur scene.cpp
 */

import {
  VNScene,
  VNHotspot,
  VNCommand,
  VNDisplayObject,
  VNEventType,
  VNEvent,
} from '../types/vn.types';
import { VNCommandProcessor, VNExecutionContext } from './VNCommandProcessor';

// Événements de scène
export type SceneEventType = 'enter' | 'exit' | 'load' | 'unload';

export interface SceneEvent {
  type: SceneEventType;
  sceneIndex: number;
  scene: VNScene;
  previousSceneIndex?: number;
}

export type SceneEventCallback = (event: SceneEvent) => void;

export class VNSceneManager {
  // Liste des scènes
  private scenes: VNScene[] = [];

  // Index de la scène actuelle
  private currentSceneIndex: number = -1;

  // Historique de navigation
  private history: number[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 100;

  // Command processor
  private commandProcessor: VNCommandProcessor | null = null;

  // Callbacks
  private onSceneChange?: SceneEventCallback;
  private onHotspotClick?: (hotspot: VNHotspot) => void;
  private onHotspotEnter?: (hotspot: VNHotspot) => void;
  private onHotspotExit?: (hotspot: VNHotspot) => void;

  // Hotspot actuellement survolé
  private hoveredHotspot: VNHotspot | null = null;

  // Flag pour éviter les transitions multiples
  private isTransitioning: boolean = false;

  constructor() {}

  /**
   * Définit le processeur de commandes
   */
  setCommandProcessor(processor: VNCommandProcessor): void {
    this.commandProcessor = processor;
  }

  /**
   * Charge les scènes depuis un projet
   */
  loadScenes(scenes: VNScene[]): void {
    this.scenes = scenes;
    this.currentSceneIndex = -1;
    this.history = [];
    this.historyIndex = -1;
  }

  /**
   * Retourne le nombre de scènes
   */
  get sceneCount(): number {
    return this.scenes.length;
  }

  /**
   * Retourne l'index de la scène actuelle
   */
  get currentIndex(): number {
    return this.currentSceneIndex;
  }

  /**
   * Retourne la scène actuelle
   */
  get currentScene(): VNScene | null {
    if (this.currentSceneIndex >= 0 && this.currentSceneIndex < this.scenes.length) {
      return this.scenes[this.currentSceneIndex];
    }
    return null;
  }

  /**
   * Retourne une scène par son index
   */
  getScene(index: number): VNScene | null {
    if (index >= 0 && index < this.scenes.length) {
      return this.scenes[index];
    }
    return null;
  }

  /**
   * Retourne une scène par son nom
   */
  getSceneByName(name: string): VNScene | null {
    return this.scenes.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  /**
   * Va à une scène spécifique
   * Reproduit TVNScene navigation
   */
  async goToScene(index: number): Promise<void> {
    // Validation
    if (index < 0 || index >= this.scenes.length) {
      throw new Error(`Invalid scene index: ${index}. Valid range: 0-${this.scenes.length - 1}`);
    }

    // Éviter les transitions multiples
    if (this.isTransitioning) {
      console.warn('Scene transition already in progress');
      return;
    }

    this.isTransitioning = true;

    try {
      const previousIndex = this.currentSceneIndex;
      const previousScene = this.currentScene;
      const newScene = this.scenes[index];

      // Exécuter les commandes de sortie de la scène précédente
      if (previousScene && this.commandProcessor) {
        this.onSceneChange?.({
          type: 'exit',
          sceneIndex: previousIndex,
          scene: previousScene,
        });

        if (previousScene.onExitCommands.length > 0) {
          await this.commandProcessor.executeCommands(previousScene.onExitCommands);
        }
      }

      // Mettre à jour l'index
      this.currentSceneIndex = index;

      // Ajouter à l'historique (sauf si on navigue dans l'historique)
      if (this.historyIndex === -1 || this.history[this.historyIndex] !== index) {
        // Tronquer l'historique si on revient en arrière puis va ailleurs
        if (this.historyIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(index);
        this.historyIndex = this.history.length - 1;

        // Limiter la taille de l'historique
        if (this.history.length > this.maxHistorySize) {
          this.history.shift();
          this.historyIndex--;
        }
      }

      // Notifier le changement
      this.onSceneChange?.({
        type: 'enter',
        sceneIndex: index,
        scene: newScene,
        previousSceneIndex: previousIndex >= 0 ? previousIndex : undefined,
      });

      // Réinitialiser le hotspot survolé
      this.hoveredHotspot = null;

      // Exécuter les commandes d'entrée de la nouvelle scène
      if (this.commandProcessor && newScene.onEnterCommands.length > 0) {
        await this.commandProcessor.executeCommands(newScene.onEnterCommands);
      }
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Navigation: scène suivante (forward)
   * Reproduit la navigation directionnelle VN
   */
  async navigateForward(): Promise<void> {
    const scene = this.currentScene;
    if (scene?.forwardScene !== undefined && scene.forwardScene >= 0) {
      await this.goToScene(scene.forwardScene);
    } else {
      // Par défaut: scène suivante
      if (this.currentSceneIndex < this.scenes.length - 1) {
        await this.goToScene(this.currentSceneIndex + 1);
      }
    }
  }

  /**
   * Navigation: scène précédente (backward)
   */
  async navigateBackward(): Promise<void> {
    const scene = this.currentScene;
    if (scene?.backwardScene !== undefined && scene.backwardScene >= 0) {
      await this.goToScene(scene.backwardScene);
    } else {
      // Par défaut: scène précédente
      if (this.currentSceneIndex > 0) {
        await this.goToScene(this.currentSceneIndex - 1);
      }
    }
  }

  /**
   * Navigation: tourner à gauche
   */
  async navigateLeft(): Promise<void> {
    const scene = this.currentScene;
    if (scene?.leftScene !== undefined && scene.leftScene >= 0) {
      await this.goToScene(scene.leftScene);
    }
  }

  /**
   * Navigation: tourner à droite
   */
  async navigateRight(): Promise<void> {
    const scene = this.currentScene;
    if (scene?.rightScene !== undefined && scene.rightScene >= 0) {
      await this.goToScene(scene.rightScene);
    }
  }

  /**
   * Navigation dans l'historique: précédent
   */
  async historyBack(): Promise<void> {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const targetIndex = this.history[this.historyIndex];
      this.isTransitioning = true;
      try {
        await this.goToSceneInternal(targetIndex);
      } finally {
        this.isTransitioning = false;
      }
    }
  }

  /**
   * Navigation dans l'historique: suivant
   */
  async historyForward(): Promise<void> {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const targetIndex = this.history[this.historyIndex];
      this.isTransitioning = true;
      try {
        await this.goToSceneInternal(targetIndex);
      } finally {
        this.isTransitioning = false;
      }
    }
  }

  /**
   * Navigation interne (sans modifier l'historique)
   */
  private async goToSceneInternal(index: number): Promise<void> {
    const previousIndex = this.currentSceneIndex;
    const previousScene = this.currentScene;
    const newScene = this.scenes[index];

    if (previousScene && this.commandProcessor) {
      this.onSceneChange?.({
        type: 'exit',
        sceneIndex: previousIndex,
        scene: previousScene,
      });

      if (previousScene.onExitCommands.length > 0) {
        await this.commandProcessor.executeCommands(previousScene.onExitCommands);
      }
    }

    this.currentSceneIndex = index;

    this.onSceneChange?.({
      type: 'enter',
      sceneIndex: index,
      scene: newScene,
      previousSceneIndex: previousIndex >= 0 ? previousIndex : undefined,
    });

    this.hoveredHotspot = null;

    if (this.commandProcessor && newScene.onEnterCommands.length > 0) {
      await this.commandProcessor.executeCommands(newScene.onEnterCommands);
    }
  }

  /**
   * Vérifie si on peut revenir en arrière dans l'historique
   */
  canHistoryBack(): boolean {
    return this.historyIndex > 0;
  }

  /**
   * Vérifie si on peut avancer dans l'historique
   */
  canHistoryForward(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  // =========================================================================
  // HOTSPOTS
  // =========================================================================

  /**
   * Retourne les hotspots de la scène actuelle
   */
  getHotspots(): VNHotspot[] {
    return this.currentScene?.hotspots ?? [];
  }

  /**
   * Trouve un hotspot par son ID
   */
  findHotspot(id: string): VNHotspot | null {
    return this.getHotspots().find((h) => h.id === id) ?? null;
  }

  /**
   * Active un hotspot
   */
  enableHotspot(id: string): void {
    const hotspot = this.findHotspot(id);
    if (hotspot) {
      hotspot.enabled = true;
    }
  }

  /**
   * Désactive un hotspot
   */
  disableHotspot(id: string): void {
    const hotspot = this.findHotspot(id);
    if (hotspot) {
      hotspot.enabled = false;
    }
  }

  /**
   * Gère le clic sur un hotspot
   */
  async handleHotspotClick(hotspot: VNHotspot): Promise<void> {
    if (!hotspot.enabled) return;

    this.onHotspotClick?.(hotspot);

    if (this.commandProcessor && hotspot.onClickCommands.length > 0) {
      await this.commandProcessor.executeCommands(hotspot.onClickCommands);
    }
  }

  /**
   * Gère l'entrée dans un hotspot (survol)
   */
  async handleHotspotEnter(hotspot: VNHotspot): Promise<void> {
    if (!hotspot.enabled) return;

    // Éviter les événements dupliqués
    if (this.hoveredHotspot === hotspot) return;

    // Sortir du hotspot précédent
    if (this.hoveredHotspot) {
      await this.handleHotspotExit(this.hoveredHotspot);
    }

    this.hoveredHotspot = hotspot;
    this.onHotspotEnter?.(hotspot);

    if (this.commandProcessor && hotspot.onEnterCommands.length > 0) {
      await this.commandProcessor.executeCommands(hotspot.onEnterCommands);
    }
  }

  /**
   * Gère la sortie d'un hotspot
   */
  async handleHotspotExit(hotspot: VNHotspot): Promise<void> {
    if (this.hoveredHotspot !== hotspot) return;

    this.hoveredHotspot = null;
    this.onHotspotExit?.(hotspot);

    if (this.commandProcessor && hotspot.onExitCommands.length > 0) {
      await this.commandProcessor.executeCommands(hotspot.onExitCommands);
    }
  }

  /**
   * Gère le mouvement de la souris (pour détecter enter/exit)
   */
  async handleMouseMove(
    x: number,
    y: number,
    findHotspotAt: (x: number, y: number, hotspots: VNHotspot[]) => VNHotspot | null
  ): Promise<void> {
    const hotspots = this.getHotspots();
    const hotspot = findHotspotAt(x, y, hotspots);

    if (hotspot !== this.hoveredHotspot) {
      if (this.hoveredHotspot) {
        await this.handleHotspotExit(this.hoveredHotspot);
      }
      if (hotspot) {
        await this.handleHotspotEnter(hotspot);
      }
    }
  }

  /**
   * Retourne le hotspot actuellement survolé
   */
  getHoveredHotspot(): VNHotspot | null {
    return this.hoveredHotspot;
  }

  // =========================================================================
  // OBJETS
  // =========================================================================

  /**
   * Retourne les objets de la scène actuelle
   */
  getObjects(): VNDisplayObject[] {
    return this.currentScene?.objects ?? [];
  }

  // =========================================================================
  // CALLBACKS
  // =========================================================================

  /**
   * Définit le callback de changement de scène
   */
  setOnSceneChange(callback: SceneEventCallback): void {
    this.onSceneChange = callback;
  }

  /**
   * Définit le callback de clic sur hotspot
   */
  setOnHotspotClick(callback: (hotspot: VNHotspot) => void): void {
    this.onHotspotClick = callback;
  }

  /**
   * Définit le callback d'entrée dans hotspot
   */
  setOnHotspotEnter(callback: (hotspot: VNHotspot) => void): void {
    this.onHotspotEnter = callback;
  }

  /**
   * Définit le callback de sortie de hotspot
   */
  setOnHotspotExit(callback: (hotspot: VNHotspot) => void): void {
    this.onHotspotExit = callback;
  }

  // =========================================================================
  // UTILITAIRES
  // =========================================================================

  /**
   * Réinitialise le gestionnaire
   */
  reset(): void {
    this.currentSceneIndex = -1;
    this.history = [];
    this.historyIndex = -1;
    this.hoveredHotspot = null;
    this.isTransitioning = false;
  }

  /**
   * Retourne l'historique de navigation
   */
  getHistory(): number[] {
    return [...this.history];
  }

  /**
   * Retourne l'index actuel dans l'historique
   */
  getHistoryIndex(): number {
    return this.historyIndex;
  }

  /**
   * Exporte l'état (pour sauvegarde)
   */
  exportState(): {
    currentSceneIndex: number;
    history: number[];
    historyIndex: number;
    hotspotStates: { id: string; enabled: boolean }[];
  } {
    const hotspotStates = this.getHotspots().map((h) => ({
      id: h.id,
      enabled: h.enabled,
    }));

    return {
      currentSceneIndex: this.currentSceneIndex,
      history: [...this.history],
      historyIndex: this.historyIndex,
      hotspotStates,
    };
  }

  /**
   * Importe un état (pour chargement)
   */
  async importState(state: {
    currentSceneIndex: number;
    history: number[];
    historyIndex: number;
    hotspotStates?: { id: string; enabled: boolean }[];
  }): Promise<void> {
    this.history = [...state.history];
    this.historyIndex = state.historyIndex;

    // Restaurer les états des hotspots
    if (state.hotspotStates) {
      for (const hs of state.hotspotStates) {
        const hotspot = this.findHotspot(hs.id);
        if (hotspot) {
          hotspot.enabled = hs.enabled;
        }
      }
    }

    // Aller à la scène (sans modifier l'historique)
    await this.goToSceneInternal(state.currentSceneIndex);
  }
}
