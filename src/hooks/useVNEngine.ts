/**
 * useVNEngine - Hook React pour le moteur VN
 *
 * Fournit une interface React pour le moteur Virtual Navigator
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  VNEngine,
  createVNEngine,
  EngineState,
} from '../engine';
import type { VNEngineOptions } from '../engine/VNEngine';
import type { VNDFile, VNSceneRaw } from '../types/vn.types';

export interface UseVNEngineOptions {
  basePath?: string;
  autoStart?: boolean;
  debug?: boolean;
}

export interface UseVNEngineResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  state: EngineState;
  isLoading: boolean;
  isRunning: boolean;
  isPaused: boolean;
  error: Error | null;
  project: VNDFile | null;
  currentScene: VNSceneRaw | null;
  currentSceneIndex: number;
  loadVND: (buffer: ArrayBuffer, fileName?: string) => Promise<VNDFile>;
  goToScene: (index: number) => void;
  goToSceneByName: (name: string) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  getVariable: (name: string) => number;
  setVariable: (name: string, value: number) => void;
  engine: VNEngine | null;
}

export function useVNEngine(options: UseVNEngineOptions = {}): UseVNEngineResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<VNEngine | null>(null);

  const [state, setState] = useState<EngineState>(EngineState.IDLE);
  const [error, setError] = useState<Error | null>(null);
  const [project, setProject] = useState<VNDFile | null>(null);
  const [currentScene, setCurrentScene] = useState<VNSceneRaw | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number>(-1);

  // Initialisation du moteur
  useEffect(() => {
    const engineOptions: VNEngineOptions = {
      canvas: canvasRef.current ?? undefined,
      basePath: options.basePath,
      autoStart: options.autoStart,
      debug: options.debug,
    };

    const engine = createVNEngine(engineOptions, {
      onStateChange: (newState) => setState(newState),
      onSceneChange: (scene, index) => {
        setCurrentScene(scene);
        setCurrentSceneIndex(index);
      },
      onError: (err) => setError(err),
    });

    engineRef.current = engine;

    return () => {
      engine.reset();
      engineRef.current = null;
    };
  }, []);

  const loadVND = useCallback(async (buffer: ArrayBuffer, fileName?: string) => {
    const engine = engineRef.current;
    if (!engine) throw new Error('Engine not initialized');
    setError(null);
    const result = await engine.loadVND(buffer, fileName);
    setProject(result);
    return result;
  }, []);

  const goToScene = useCallback((index: number) => {
    engineRef.current?.goToScene(index);
  }, []);

  const goToSceneByName = useCallback((name: string) => {
    engineRef.current?.goToSceneByName(name);
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    setCurrentScene(null);
    setCurrentSceneIndex(-1);
    setProject(null);
  }, []);

  const getVariable = useCallback((name: string): number => {
    return engineRef.current?.getVariableStore().get(name) ?? 0;
  }, []);

  const setVariable = useCallback((name: string, value: number) => {
    engineRef.current?.getVariableStore().set(name, value);
  }, []);

  return {
    canvasRef,
    state,
    isLoading: state === EngineState.LOADING,
    isRunning: state === EngineState.RUNNING,
    isPaused: state === EngineState.PAUSED,
    error,
    project,
    currentScene,
    currentSceneIndex,
    loadVND,
    goToScene,
    goToSceneByName,
    pause,
    resume,
    reset,
    getVariable,
    setVariable,
    engine: engineRef.current,
  };
}
