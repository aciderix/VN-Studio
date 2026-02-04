/**
 * VNTimerManager - Gestionnaire de timers
 *
 * Reproduit fidèlement le système de timers de Virtual Navigator 2.1:
 * - TVNTimer: Timer de base
 * - TVNTimerRes: Résolution du timer
 * - VNTIMER_DATA: Structure de données timer
 *
 * Basé sur timernfx.cpp
 */

import { VNCommandRaw } from '../types/vn.types';
import { VNCommandProcessor } from './VNCommandProcessor';

// État d'un timer
export interface TimerState {
  id: string;
  interval: number;        // Intervalle en millisecondes
  commands: VNCommandRaw[];   // Commandes à exécuter
  isRunning: boolean;
  isPaused: boolean;
  startTime: number;       // Timestamp de démarrage
  lastTickTime: number;    // Dernier tick
  tickCount: number;       // Nombre de ticks
  timerId: number | ReturnType<typeof setTimeout> | null;  // ID du timer JS
}

// Callbacks
export interface TimerCallbacks {
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onTick: (id: string, tickCount: number) => void;
  onError: (id: string, error: Error) => void;
}

export class VNTimerManager {
  // Timers actifs
  private timers: Map<string, TimerState> = new Map();

  // Command processor
  private commandProcessor: VNCommandProcessor | null = null;

  // Callbacks
  private callbacks: TimerCallbacks | null = null;

  // Résolution par défaut (reproduit VNTIMER_DATA)
  private defaultResolution: number = 16; // ~60 FPS

  // Flag pour pause globale
  private globalPause: boolean = false;

  constructor() {}

  /**
   * Définit le processeur de commandes
   */
  setCommandProcessor(processor: VNCommandProcessor): void {
    this.commandProcessor = processor;
  }

  /**
   * Définit les callbacks
   */
  setCallbacks(callbacks: TimerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Définit la résolution par défaut
   */
  setDefaultResolution(resolution: number): void {
    this.defaultResolution = Math.max(1, resolution);
  }

  /**
   * Démarre un timer
   * Reproduit TIMERSTART command
   */
  startTimer(id: string, interval: number, commands: VNCommandRaw[]): void {
    // Arrêter le timer existant avec le même ID
    if (this.timers.has(id)) {
      this.stopTimer(id);
    }

    // Créer le nouvel état du timer
    const state: TimerState = {
      id,
      interval: Math.max(this.defaultResolution, interval),
      commands,
      isRunning: true,
      isPaused: false,
      startTime: performance.now(),
      lastTickTime: performance.now(),
      tickCount: 0,
      timerId: null,
    };

    // Démarrer le timer
    state.timerId = setInterval(() => {
      this.tick(id);
    }, state.interval);

    this.timers.set(id, state);
    this.callbacks?.onStart(id);
  }

  /**
   * Arrête un timer
   * Reproduit TIMERSTOP command
   */
  stopTimer(id: string): void {
    const state = this.timers.get(id);
    if (!state) return;

    // Arrêter le timer JS
    if (state.timerId !== null) {
      clearInterval(state.timerId as ReturnType<typeof setTimeout>);
    }

    state.isRunning = false;
    state.timerId = null;

    this.timers.delete(id);
    this.callbacks?.onStop(id);
  }

  /**
   * Met en pause un timer
   */
  pauseTimer(id: string): void {
    const state = this.timers.get(id);
    if (!state || !state.isRunning || state.isPaused) return;

    // Arrêter le timer JS temporairement
    if (state.timerId !== null) {
      clearInterval(state.timerId as ReturnType<typeof setTimeout>);
      state.timerId = null;
    }

    state.isPaused = true;
  }

  /**
   * Reprend un timer
   */
  resumeTimer(id: string): void {
    const state = this.timers.get(id);
    if (!state || !state.isRunning || !state.isPaused) return;

    // Redémarrer le timer JS
    state.timerId = setInterval(() => {
      this.tick(id);
    }, state.interval);

    state.isPaused = false;
    state.lastTickTime = performance.now();
  }

  /**
   * Tick d'un timer
   */
  private async tick(id: string): Promise<void> {
    const state = this.timers.get(id);
    if (!state || !state.isRunning || state.isPaused || this.globalPause) return;

    const now = performance.now();
    state.lastTickTime = now;
    state.tickCount++;

    this.callbacks?.onTick(id, state.tickCount);

    // Exécuter les commandes
    if (this.commandProcessor && state.commands.length > 0) {
      try {
        await this.commandProcessor.executeCommands(state.commands);
      } catch (error) {
        this.callbacks?.onError(id, error as Error);
      }
    }
  }

  /**
   * Vérifie si un timer existe
   */
  hasTimer(id: string): boolean {
    return this.timers.has(id);
  }

  /**
   * Vérifie si un timer est en cours d'exécution
   */
  isTimerRunning(id: string): boolean {
    const state = this.timers.get(id);
    return state?.isRunning ?? false;
  }

  /**
   * Retourne l'état d'un timer
   */
  getTimerState(id: string): TimerState | null {
    return this.timers.get(id) ?? null;
  }

  /**
   * Retourne tous les timers actifs
   */
  getActiveTimers(): TimerState[] {
    return Array.from(this.timers.values()).filter((t) => t.isRunning);
  }

  /**
   * Arrête tous les timers
   */
  stopAllTimers(): void {
    for (const id of this.timers.keys()) {
      this.stopTimer(id);
    }
  }

  /**
   * Met en pause tous les timers
   */
  pauseAllTimers(): void {
    this.globalPause = true;
    for (const state of this.timers.values()) {
      if (state.isRunning && !state.isPaused) {
        this.pauseTimer(state.id);
      }
    }
  }

  /**
   * Reprend tous les timers
   */
  resumeAllTimers(): void {
    this.globalPause = false;
    for (const state of this.timers.values()) {
      if (state.isRunning && state.isPaused) {
        this.resumeTimer(state.id);
      }
    }
  }

  /**
   * Retourne le nombre de timers actifs
   */
  get activeCount(): number {
    return this.getActiveTimers().length;
  }

  /**
   * Exporte l'état (pour sauvegarde)
   */
  exportState(): Array<{
    id: string;
    interval: number;
    commands: VNCommandRaw[];
    tickCount: number;
  }> {
    return Array.from(this.timers.values())
      .filter((t) => t.isRunning)
      .map((t) => ({
        id: t.id,
        interval: t.interval,
        commands: t.commands,
        tickCount: t.tickCount,
      }));
  }

  /**
   * Importe un état (pour chargement)
   */
  importState(
    states: Array<{
      id: string;
      interval: number;
      commands: VNCommandRaw[];
      tickCount: number;
    }>
  ): void {
    // Arrêter tous les timers existants
    this.stopAllTimers();

    // Recréer les timers
    for (const state of states) {
      this.startTimer(state.id, state.interval, state.commands);

      // Restaurer le tick count
      const timerState = this.timers.get(state.id);
      if (timerState) {
        timerState.tickCount = state.tickCount;
      }
    }
  }

  /**
   * Libère les ressources
   */
  dispose(): void {
    this.stopAllTimers();
    this.commandProcessor = null;
    this.callbacks = null;
  }
}

// ============================================================================
// TIMER UNIQUE (pour animations et effets)
// ============================================================================

export class VNAnimationTimer {
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  private lastTime: number = 0;
  private callbacks: Array<(deltaTime: number) => void> = [];

  /**
   * Démarre le timer d'animation
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      const deltaTime = currentTime - this.lastTime;
      this.lastTime = currentTime;

      // Appeler tous les callbacks
      for (const callback of this.callbacks) {
        callback(deltaTime);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Arrête le timer d'animation
   */
  stop(): void {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Ajoute un callback
   */
  addCallback(callback: (deltaTime: number) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Supprime un callback
   */
  removeCallback(callback: (deltaTime: number) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Supprime tous les callbacks
   */
  clearCallbacks(): void {
    this.callbacks = [];
  }

  /**
   * Vérifie si le timer est en cours d'exécution
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Libère les ressources
   */
  dispose(): void {
    this.stop();
    this.clearCallbacks();
  }
}

// Singleton global
let globalTimerManager: VNTimerManager | null = null;
let globalAnimationTimer: VNAnimationTimer | null = null;

export function getGlobalTimerManager(): VNTimerManager {
  if (!globalTimerManager) {
    globalTimerManager = new VNTimerManager();
  }
  return globalTimerManager;
}

export function getGlobalAnimationTimer(): VNAnimationTimer {
  if (!globalAnimationTimer) {
    globalAnimationTimer = new VNAnimationTimer();
  }
  return globalAnimationTimer;
}

export function resetGlobalTimerManager(): void {
  if (globalTimerManager) {
    globalTimerManager.dispose();
  }
  globalTimerManager = new VNTimerManager();
}

export function resetGlobalAnimationTimer(): void {
  if (globalAnimationTimer) {
    globalAnimationTimer.dispose();
  }
  globalAnimationTimer = new VNAnimationTimer();
}
