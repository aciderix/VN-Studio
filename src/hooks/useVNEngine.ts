/**
 * useVNEngine - Hook React pour le moteur VN
 *
 * Fournit une interface React pour le moteur Virtual Navigator
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  VNEngine,
  createVNEngine,
  VNEngineOptions,
  VNEngineCallbacks,
  EngineState,
  VNProjectInfo,
  VNScene,
  VNHotspot,
  VNEvent,
} from '../engine';
import { SceneEvent } from '../engine/VNSceneManager';

export interface UseVNEngineOptions extends Omit<VNEngineOptions, 'canvas'> {
  autoStart?: boolean;
}

export interface UseVNEngineResult {
  // Référence du canvas
  canvasRef: React.RefObject<HTMLCanvasElement>;

  // État
  state: EngineState;
  isLoading: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  error: Error | null;

  // Projet et scène
  project: VNProjectInfo | null;
  currentScene: VNScene | null;
  currentSceneIndex: number;

  // Hotspot
  hoveredHotspot: VNHotspot | null;

  // Curseur
  cursor: string;

  // Variables
  getVariable: (name: string) => number;
  setVariable: (name: string, value: number) => void;

  // Contrôles
  loadProject: (project: VNProjectInfo) => Promise<void>;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;

  // Navigation
  goToScene: (index: number) => Promise<void>;
  navigateForward: () => Promise<void>;
  navigateBackward: () => Promise<void>;
  navigateLeft: () => Promise<void>;
  navigateRight: () => Promise<void>;

  // Sauvegarde
  saveState: () => object;
  loadState: (state: object) => Promise<void>;

  // Accès direct au moteur
  engine: VNEngine | null;
}

export function useVNEngine(options: UseVNEngineOptions = {}): UseVNEngineResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VNEngine | null>(null);

  // État
  const [state, setState] = useState<EngineState>(EngineState.UNINITIALIZED);
  const [error, setError] = useState<Error | null>(null);
  const [project, setProject] = useState<VNProjectInfo | null>(null);
  const [currentScene, setCurrentScene] = useState<VNScene | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(-1);
  const [hoveredHotspot, setHoveredHotspot] = useState<VNHotspot | null>(null);
  const [cursor, setCursor] = useState<string>('default');

  // Initialisation du moteur
  useEffect(() => {
    if (!canvasRef.current) return;

    // Créer le moteur
    const engine = createVNEngine({
      canvas: canvasRef.current,
      baseUrl: options.baseUrl,
      width: options.width ?? 800,
      height: options.height ?? 600,
      showHotspots: options.showHotspots,
      smoothZoom: options.smoothZoom,
      smoothScroll: options.smoothScroll,
      voicesEnabled: options.voicesEnabled,
      musicEnabled: options.musicEnabled,
      videosEnabled: options.videosEnabled,
    });

    // Configurer les callbacks
    engine.setCallbacks({
      onStateChange: (newState) => {
        setState(newState);
      },
      onSceneChange: (event) => {
        if (event.type === 'enter') {
          setCurrentScene(event.scene);
          setCurrentSceneIndex(event.sceneIndex);
        }
      },
      onError: (err) => {
        setError(err);
      },
      onHotspotEnter: (hotspot) => {
        setHoveredHotspot(hotspot);
      },
      onHotspotExit: () => {
        setHoveredHotspot(null);
      },
      onCursorChange: (newCursor) => {
        setCursor(newCursor);
      },
    });

    engineRef.current = engine;
    setState(EngineState.READY);

    // Nettoyage
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Gestionnaires d'événements du canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      engine.handleClick(x, y);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      engine.handleMouseMove(x, y);
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Appliquer le curseur
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = cursor;
    }
  }, [cursor]);

  // Fonctions de contrôle
  const loadProject = useCallback(async (proj: VNProjectInfo) => {
    const engine = engineRef.current;
    if (!engine) throw new Error('Engine not initialized');

    setError(null);
    await engine.loadProject(proj);
    setProject(proj);

    if (options.autoStart) {
      await engine.start();
    }
  }, [options.autoStart]);

  const start = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) throw new Error('Engine not initialized');
    await engine.start();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setCurrentScene(null);
    setCurrentSceneIndex(-1);
  }, []);

  // Navigation
  const goToScene = useCallback(async (index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.goToScene(index);
  }, []);

  const navigateForward = useCallback(async () => {
    await engineRef.current?.navigateForward();
  }, []);

  const navigateBackward = useCallback(async () => {
    await engineRef.current?.navigateBackward();
  }, []);

  const navigateLeft = useCallback(async () => {
    await engineRef.current?.navigateLeft();
  }, []);

  const navigateRight = useCallback(async () => {
    await engineRef.current?.navigateRight();
  }, []);

  // Variables
  const getVariable = useCallback((name: string): number => {
    return engineRef.current?.variableStore.get(name) ?? 0;
  }, []);

  const setVariable = useCallback((name: string, value: number) => {
    engineRef.current?.variableStore.set(name, value);
  }, []);

  // Sauvegarde
  const saveState = useCallback(() => {
    return engineRef.current?.exportState() ?? {};
  }, []);

  const loadState = useCallback(async (savedState: object) => {
    await engineRef.current?.importState(savedState as Parameters<VNEngine['importState']>[0]);
  }, []);

  return {
    canvasRef,
    state,
    isLoading: state === EngineState.LOADING,
    isPlaying: state === EngineState.PLAYING,
    isPaused: state === EngineState.PAUSED,
    error,
    project,
    currentScene,
    currentSceneIndex,
    hoveredHotspot,
    cursor,
    getVariable,
    setVariable,
    loadProject,
    start,
    pause,
    resume,
    stop,
    goToScene,
    navigateForward,
    navigateBackward,
    navigateLeft,
    navigateRight,
    saveState,
    loadState,
    engine: engineRef.current,
  };
}
