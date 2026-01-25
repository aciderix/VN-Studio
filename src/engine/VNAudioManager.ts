/**
 * VNAudioManager - Gestionnaire audio complet
 *
 * Reproduit fidèlement le système audio de Virtual Navigator 2.1:
 * - TVNWaveMedia: Audio WAV via PlaySound/MCI
 * - TVNMidiMedia: Audio MIDI via MCI sequencer
 * - TVNCDAMedia: Audio CD via MCI cdaudio
 *
 * Utilise Web Audio API pour le rendu moderne
 */

import { VNEventType, VNEvent } from '../types/vn.types';

// Types de média
export enum MediaType {
  WAVE = 'WAVE',
  MIDI = 'MIDI',
  CDA = 'CDA',
}

// État d'un média
export interface MediaState {
  type: MediaType;
  filename: string;
  isPlaying: boolean;
  isLooping: boolean;
  isPaused: boolean;
  volume: number; // 0-100
  currentTime: number;
  duration: number;
}

// Interface pour les callbacks
export interface AudioCallbacks {
  onStart: (type: MediaType, filename: string) => void;
  onEnd: (type: MediaType, filename: string) => void;
  onError: (type: MediaType, error: Error) => void;
}

export class VNAudioManager {
  // Contexte Web Audio
  private audioContext: AudioContext | null = null;

  // Nœuds de gain pour le contrôle du volume
  private waveGainNode: GainNode | null = null;
  private midiGainNode: GainNode | null = null;

  // Sources audio actuelles
  private currentWaveSource: AudioBufferSourceNode | null = null;
  private currentWaveAudio: HTMLAudioElement | null = null;
  private currentMidiAudio: HTMLAudioElement | null = null;
  private currentCdaAudio: HTMLAudioElement | null = null;

  // État des médias
  private waveState: MediaState | null = null;
  private midiState: MediaState | null = null;
  private cdaState: MediaState | null = null;

  // Historique pour replay
  private lastWaveFilename: string | null = null;
  private lastWaveLoop: boolean = false;
  private lastWaveVolume: number = 100;

  // Cache des buffers audio
  private audioBufferCache: Map<string, AudioBuffer> = new Map();

  // Callbacks
  private callbacks: AudioCallbacks | null = null;

  // Options
  private voicesEnabled: boolean = true;
  private musicEnabled: boolean = true;

  // Base URL pour les fichiers audio
  private baseUrl: string = '';

  constructor() {
    this.initAudioContext();
  }

  /**
   * Initialise le contexte Web Audio
   */
  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      // Créer les nœuds de gain
      this.waveGainNode = this.audioContext.createGain();
      this.waveGainNode.connect(this.audioContext.destination);

      this.midiGainNode = this.audioContext.createGain();
      this.midiGainNode.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Web Audio API not supported:', error);
    }
  }

  /**
   * Définit l'URL de base pour les fichiers
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url.endsWith('/') ? url : url + '/';
  }

  /**
   * Définit les callbacks
   */
  setCallbacks(callbacks: AudioCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Active/désactive les voix et sons
   */
  setVoicesEnabled(enabled: boolean): void {
    this.voicesEnabled = enabled;
    if (!enabled && this.currentWaveAudio) {
      this.stopWave();
    }
  }

  /**
   * Active/désactive la musique
   */
  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopMidi();
      this.stopCDA();
    }
  }

  /**
   * Résout le chemin d'un fichier audio
   */
  private resolvePath(filename: string): string {
    // Convertir les chemins Windows en chemins web
    let path = filename.replace(/\\/g, '/');

    // Supprimer le préfixe de lecteur si présent (C:, D:, etc.)
    path = path.replace(/^[A-Za-z]:/, '');

    // Si le chemin ne commence pas par /, ajouter la base URL
    if (!path.startsWith('/') && !path.startsWith('http')) {
      path = this.baseUrl + path;
    }

    return path;
  }

  // =========================================================================
  // WAVE (Sons et voix)
  // =========================================================================

  /**
   * Joue un fichier WAV
   * Reproduit TVNWaveMedia::Play()
   */
  async playWave(filename: string, loop: boolean = false, volume: number = 100): Promise<void> {
    if (!this.voicesEnabled) {
      return;
    }

    // Arrêter le son précédent
    this.stopWave();

    // Sauvegarder pour replay
    this.lastWaveFilename = filename;
    this.lastWaveLoop = loop;
    this.lastWaveVolume = volume;

    const path = this.resolvePath(filename);

    try {
      // Créer un élément audio HTML5 (plus compatible)
      this.currentWaveAudio = new Audio(path);
      this.currentWaveAudio.loop = loop;
      this.currentWaveAudio.volume = volume / 100;

      // État
      this.waveState = {
        type: MediaType.WAVE,
        filename,
        isPlaying: true,
        isLooping: loop,
        isPaused: false,
        volume,
        currentTime: 0,
        duration: 0,
      };

      // Événements
      this.currentWaveAudio.onended = () => {
        if (this.waveState) {
          this.waveState.isPlaying = false;
        }
        this.callbacks?.onEnd(MediaType.WAVE, filename);
      };

      this.currentWaveAudio.onloadedmetadata = () => {
        if (this.waveState && this.currentWaveAudio) {
          this.waveState.duration = this.currentWaveAudio.duration * 1000;
        }
      };

      this.currentWaveAudio.onerror = () => {
        const error = new Error(`Failed to load audio: ${path}`);
        this.callbacks?.onError(MediaType.WAVE, error);
      };

      // Lecture
      await this.currentWaveAudio.play();
      this.callbacks?.onStart(MediaType.WAVE, filename);
    } catch (error) {
      console.error('Error playing wave:', error);
      this.callbacks?.onError(MediaType.WAVE, error as Error);
      throw error;
    }
  }

  /**
   * Arrête le son WAV en cours
   * Reproduit TVNWaveMedia::Stop()
   */
  stopWave(): void {
    if (this.currentWaveAudio) {
      this.currentWaveAudio.pause();
      this.currentWaveAudio.currentTime = 0;
      this.currentWaveAudio = null;
    }

    if (this.currentWaveSource) {
      try {
        this.currentWaveSource.stop();
      } catch {
        // Ignore - peut déjà être arrêté
      }
      this.currentWaveSource = null;
    }

    if (this.waveState) {
      this.waveState.isPlaying = false;
    }
  }

  /**
   * Met en pause le son WAV
   */
  pauseWave(): void {
    if (this.currentWaveAudio && this.waveState?.isPlaying) {
      this.currentWaveAudio.pause();
      if (this.waveState) {
        this.waveState.isPaused = true;
      }
    }
  }

  /**
   * Reprend le son WAV
   */
  resumeWave(): void {
    if (this.currentWaveAudio && this.waveState?.isPaused) {
      this.currentWaveAudio.play();
      if (this.waveState) {
        this.waveState.isPaused = false;
      }
    }
  }

  /**
   * Définit le volume WAV
   */
  setWaveVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    if (this.currentWaveAudio) {
      this.currentWaveAudio.volume = clampedVolume / 100;
    }
    if (this.waveState) {
      this.waveState.volume = clampedVolume;
    }
  }

  // =========================================================================
  // MIDI (Musique)
  // =========================================================================

  /**
   * Joue un fichier MIDI
   * Reproduit TVNMidiMedia::Play()
   *
   * Note: Les navigateurs ne supportent pas nativement le MIDI.
   * On utilise une conversion MP3/OGG ou un synthétiseur logiciel.
   */
  async playMidi(filename: string, loop: boolean = false, volume: number = 100): Promise<void> {
    if (!this.musicEnabled) {
      return;
    }

    // Arrêter la musique précédente
    this.stopMidi();

    // Essayer de trouver une version convertie (MP3/OGG)
    let path = this.resolvePath(filename);

    // Remplacer l'extension .mid par .mp3 ou .ogg
    const basePath = path.replace(/\.mid$/i, '');
    const possiblePaths = [
      basePath + '.mp3',
      basePath + '.ogg',
      basePath + '.wav',
      path, // Essayer l'original en dernier
    ];

    try {
      this.currentMidiAudio = new Audio();
      this.currentMidiAudio.loop = loop;
      this.currentMidiAudio.volume = volume / 100;

      // Essayer chaque format
      let loaded = false;
      for (const testPath of possiblePaths) {
        try {
          this.currentMidiAudio.src = testPath;
          await new Promise<void>((resolve, reject) => {
            if (!this.currentMidiAudio) {
              reject(new Error('Audio element destroyed'));
              return;
            }
            this.currentMidiAudio.oncanplaythrough = () => resolve();
            this.currentMidiAudio.onerror = () => reject(new Error('Cannot load'));
            // Timeout après 2 secondes
            setTimeout(() => reject(new Error('Timeout')), 2000);
          });
          loaded = true;
          path = testPath;
          break;
        } catch {
          continue;
        }
      }

      if (!loaded) {
        throw new Error(`Cannot find playable audio for: ${filename}`);
      }

      // État
      this.midiState = {
        type: MediaType.MIDI,
        filename,
        isPlaying: true,
        isLooping: loop,
        isPaused: false,
        volume,
        currentTime: 0,
        duration: 0,
      };

      // Événements
      this.currentMidiAudio.onended = () => {
        if (this.midiState) {
          this.midiState.isPlaying = false;
        }
        this.callbacks?.onEnd(MediaType.MIDI, filename);
      };

      this.currentMidiAudio.onloadedmetadata = () => {
        if (this.midiState && this.currentMidiAudio) {
          this.midiState.duration = this.currentMidiAudio.duration * 1000;
        }
      };

      // Lecture
      await this.currentMidiAudio.play();
      this.callbacks?.onStart(MediaType.MIDI, filename);
    } catch (error) {
      console.error('Error playing MIDI:', error);
      this.callbacks?.onError(MediaType.MIDI, error as Error);
      throw error;
    }
  }

  /**
   * Arrête la musique MIDI
   * Reproduit TVNMidiMedia::Stop()
   */
  stopMidi(): void {
    if (this.currentMidiAudio) {
      this.currentMidiAudio.pause();
      this.currentMidiAudio.currentTime = 0;
      this.currentMidiAudio = null;
    }

    if (this.midiState) {
      this.midiState.isPlaying = false;
    }
  }

  /**
   * Met en pause la musique MIDI
   */
  pauseMidi(): void {
    if (this.currentMidiAudio && this.midiState?.isPlaying) {
      this.currentMidiAudio.pause();
      if (this.midiState) {
        this.midiState.isPaused = true;
      }
    }
  }

  /**
   * Reprend la musique MIDI
   */
  resumeMidi(): void {
    if (this.currentMidiAudio && this.midiState?.isPaused) {
      this.currentMidiAudio.play();
      if (this.midiState) {
        this.midiState.isPaused = false;
      }
    }
  }

  /**
   * Définit le volume MIDI
   */
  setMidiVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    if (this.currentMidiAudio) {
      this.currentMidiAudio.volume = clampedVolume / 100;
    }
    if (this.midiState) {
      this.midiState.volume = clampedVolume;
    }
  }

  // =========================================================================
  // CDA (CD Audio)
  // =========================================================================

  /**
   * Joue une piste CD Audio
   * Reproduit TVNCDAMedia::Play()
   *
   * Note: Simulé via des fichiers audio numérotés (track01.mp3, etc.)
   */
  async playCDA(track: number, loop: boolean = false): Promise<void> {
    if (!this.musicEnabled) {
      return;
    }

    this.stopCDA();

    // Construire le nom de fichier de la piste
    const trackNum = track.toString().padStart(2, '0');
    const possibleNames = [
      `track${trackNum}.mp3`,
      `track${trackNum}.ogg`,
      `track${trackNum}.wav`,
      `Track${trackNum}.mp3`,
      `TRACK${trackNum}.MP3`,
    ];

    try {
      this.currentCdaAudio = new Audio();
      this.currentCdaAudio.loop = loop;
      this.currentCdaAudio.volume = 1.0;

      let loaded = false;
      let loadedPath = '';

      for (const name of possibleNames) {
        try {
          const path = this.resolvePath(name);
          this.currentCdaAudio.src = path;
          await new Promise<void>((resolve, reject) => {
            if (!this.currentCdaAudio) {
              reject(new Error('Audio element destroyed'));
              return;
            }
            this.currentCdaAudio.oncanplaythrough = () => resolve();
            this.currentCdaAudio.onerror = () => reject(new Error('Cannot load'));
            setTimeout(() => reject(new Error('Timeout')), 2000);
          });
          loaded = true;
          loadedPath = path;
          break;
        } catch {
          continue;
        }
      }

      if (!loaded) {
        throw new Error(`Cannot find CD track: ${track}`);
      }

      // État
      this.cdaState = {
        type: MediaType.CDA,
        filename: `track${trackNum}`,
        isPlaying: true,
        isLooping: loop,
        isPaused: false,
        volume: 100,
        currentTime: 0,
        duration: 0,
      };

      // Événements
      this.currentCdaAudio.onended = () => {
        if (this.cdaState) {
          this.cdaState.isPlaying = false;
        }
        this.callbacks?.onEnd(MediaType.CDA, `track${trackNum}`);
      };

      // Lecture
      await this.currentCdaAudio.play();
      this.callbacks?.onStart(MediaType.CDA, `track${trackNum}`);
    } catch (error) {
      console.error('Error playing CDA:', error);
      this.callbacks?.onError(MediaType.CDA, error as Error);
      throw error;
    }
  }

  /**
   * Arrête le CD Audio
   */
  stopCDA(): void {
    if (this.currentCdaAudio) {
      this.currentCdaAudio.pause();
      this.currentCdaAudio.currentTime = 0;
      this.currentCdaAudio = null;
    }

    if (this.cdaState) {
      this.cdaState.isPlaying = false;
    }
  }

  // =========================================================================
  // CONTRÔLE GLOBAL
  // =========================================================================

  /**
   * Arrête tous les médias audio
   * Reproduit STOPALL command
   */
  stopAll(): void {
    this.stopWave();
    this.stopMidi();
    this.stopCDA();
  }

  /**
   * Met en pause tous les médias
   */
  pauseAll(): void {
    this.pauseWave();
    this.pauseMidi();
    if (this.currentCdaAudio) {
      this.currentCdaAudio.pause();
      if (this.cdaState) {
        this.cdaState.isPaused = true;
      }
    }
  }

  /**
   * Reprend tous les médias
   */
  resumeAll(): void {
    this.resumeWave();
    this.resumeMidi();
    if (this.currentCdaAudio && this.cdaState?.isPaused) {
      this.currentCdaAudio.play();
      if (this.cdaState) {
        this.cdaState.isPaused = false;
      }
    }
  }

  /**
   * Rejoue le dernier son
   * Reproduit REPLAY command
   */
  async replay(): Promise<void> {
    if (this.lastWaveFilename) {
      await this.playWave(this.lastWaveFilename, this.lastWaveLoop, this.lastWaveVolume);
    }
  }

  /**
   * Retourne l'état de tous les médias
   */
  getState(): { wave: MediaState | null; midi: MediaState | null; cda: MediaState | null } {
    return {
      wave: this.waveState,
      midi: this.midiState,
      cda: this.cdaState,
    };
  }

  /**
   * Vérifie si un son est en cours de lecture
   */
  isWavePlaying(): boolean {
    return this.waveState?.isPlaying ?? false;
  }

  /**
   * Vérifie si la musique est en cours de lecture
   */
  isMidiPlaying(): boolean {
    return this.midiState?.isPlaying ?? false;
  }

  /**
   * Libère les ressources
   */
  dispose(): void {
    this.stopAll();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioBufferCache.clear();
  }

  /**
   * Précharge un fichier audio
   */
  async preload(filename: string): Promise<void> {
    const path = this.resolvePath(filename);

    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();

      if (this.audioContext) {
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.audioBufferCache.set(filename, audioBuffer);
      }
    } catch (error) {
      console.warn(`Failed to preload audio: ${filename}`, error);
    }
  }

  /**
   * Précharge une liste de fichiers audio
   */
  async preloadAll(filenames: string[]): Promise<void> {
    await Promise.all(filenames.map((f) => this.preload(f)));
  }
}

// Singleton global
let globalAudioManager: VNAudioManager | null = null;

export function getGlobalAudioManager(): VNAudioManager {
  if (!globalAudioManager) {
    globalAudioManager = new VNAudioManager();
  }
  return globalAudioManager;
}

export function resetGlobalAudioManager(): void {
  if (globalAudioManager) {
    globalAudioManager.dispose();
  }
  globalAudioManager = new VNAudioManager();
}
