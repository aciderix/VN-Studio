/**
 * VNSceneManager - Gestionnaire de scènes
 *
 * Gère la navigation entre scènes, l'historique,
 * et l'exécution des commandes de scène.
 */

import { VNSceneRaw, VNCommandRaw } from '../types/vn.types';

// Événements de scène
export type SceneEventType = 'enter' | 'exit' | 'load' | 'unload';

export interface SceneEvent {
  type: SceneEventType;
  sceneIndex: number;
  scene: VNSceneRaw;
  previousSceneIndex?: number;
}

export type SceneEventCallback = (event: SceneEvent) => void;

export class VNSceneManager {
  private scenes: VNSceneRaw[] = [];
  private currentSceneIndex: number = -1;
  private history: number[] = [];
  private historyIndex: number = -1;
  private maxHistorySize: number = 100;
  private isTransitioning: boolean = false;

  // Callbacks
  private onSceneChange?: SceneEventCallback;

  /**
   * Charge les scènes depuis un VNDFile parsé
   */
  loadScenes(scenes: VNSceneRaw[]): void {
    this.scenes = scenes;
    this.currentSceneIndex = -1;
    this.history = [];
    this.historyIndex = -1;
  }

  get sceneCount(): number {
    return this.scenes.length;
  }

  get currentIndex(): number {
    return this.currentSceneIndex;
  }

  get currentScene(): VNSceneRaw | null {
    if (this.currentSceneIndex >= 0 && this.currentSceneIndex < this.scenes.length) {
      return this.scenes[this.currentSceneIndex];
    }
    return null;
  }

  getScene(index: number): VNSceneRaw | null {
    if (index >= 0 && index < this.scenes.length) {
      return this.scenes[index];
    }
    return null;
  }

  /**
   * Recherche une scène par nom (insensible à la casse)
   */
  getSceneByName(name: string): VNSceneRaw | null {
    return this.scenes.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
  }

  /**
   * Retourne l'index d'une scène par nom
   */
  getSceneIndexByName(name: string): number {
    return this.scenes.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Va à une scène par index
   */
  goToScene(index: number): void {
    if (index < 0 || index >= this.scenes.length) {
      throw new Error(`Invalid scene index: ${index}. Valid range: 0-${this.scenes.length - 1}`);
    }

    if (this.isTransitioning) {
      console.warn('Scene transition already in progress');
      return;
    }

    this.isTransitioning = true;

    try {
      const previousIndex = this.currentSceneIndex;
      const previousScene = this.currentScene;

      // Notifier sortie de la scène précédente
      if (previousScene) {
        this.onSceneChange?.({
          type: 'exit',
          sceneIndex: previousIndex,
          scene: previousScene,
        });
      }

      // Mettre à jour l'index
      this.currentSceneIndex = index;

      // Ajouter à l'historique
      if (this.historyIndex === -1 || this.history[this.historyIndex] !== index) {
        if (this.historyIndex < this.history.length - 1) {
          this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(index);
        this.historyIndex = this.history.length - 1;
        if (this.history.length > this.maxHistorySize) {
          this.history.shift();
          this.historyIndex--;
        }
      }

      // Notifier entrée dans la nouvelle scène
      this.onSceneChange?.({
        type: 'enter',
        sceneIndex: index,
        scene: this.scenes[index],
        previousSceneIndex: previousIndex >= 0 ? previousIndex : undefined,
      });
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Va à une scène par nom
   */
  goToSceneByName(name: string): void {
    const index = this.getSceneIndexByName(name);
    if (index < 0) {
      throw new Error(`Scene not found: "${name}"`);
    }
    this.goToScene(index);
  }

  /**
   * Retourne les commandes de la scène actuelle
   */
  getCurrentCommands(): VNCommandRaw[] {
    return this.currentScene?.commands ?? [];
  }

  /**
   * Navigation dans l'historique: précédent
   */
  historyBack(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const targetIndex = this.history[this.historyIndex];
      this.currentSceneIndex = targetIndex;
      this.onSceneChange?.({
        type: 'enter',
        sceneIndex: targetIndex,
        scene: this.scenes[targetIndex],
      });
    }
  }

  /**
   * Navigation dans l'historique: suivant
   */
  historyForward(): void {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const targetIndex = this.history[this.historyIndex];
      this.currentSceneIndex = targetIndex;
      this.onSceneChange?.({
        type: 'enter',
        sceneIndex: targetIndex,
        scene: this.scenes[targetIndex],
      });
    }
  }

  canHistoryBack(): boolean {
    return this.historyIndex > 0;
  }

  canHistoryForward(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  setOnSceneChange(callback: SceneEventCallback): void {
    this.onSceneChange = callback;
  }

  reset(): void {
    this.currentSceneIndex = -1;
    this.history = [];
    this.historyIndex = -1;
    this.isTransitioning = false;
  }

  getHistory(): number[] {
    return [...this.history];
  }

  getHistoryIndex(): number {
    return this.historyIndex;
  }

  exportState(): { currentSceneIndex: number; history: number[]; historyIndex: number } {
    return {
      currentSceneIndex: this.currentSceneIndex,
      history: [...this.history],
      historyIndex: this.historyIndex,
    };
  }

  importState(state: { currentSceneIndex: number; history: number[]; historyIndex: number }): void {
    this.history = [...state.history];
    this.historyIndex = state.historyIndex;
    this.currentSceneIndex = state.currentSceneIndex;
    if (this.currentScene) {
      this.onSceneChange?.({
        type: 'enter',
        sceneIndex: this.currentSceneIndex,
        scene: this.currentScene,
      });
    }
  }
}
