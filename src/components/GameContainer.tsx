/**
 * GameContainer - Composant principal du jeu VN
 *
 * Reproduit TVNFrame de Virtual Navigator 2.1
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useVNEngine, UseVNEngineOptions } from '../hooks/useVNEngine';
import { VNProjectInfo, VNHotspot, EngineState } from '../engine';

// Props du composant
export interface GameContainerProps extends UseVNEngineOptions {
  // Projet à charger
  project?: VNProjectInfo;

  // Dimensions
  width?: number;
  height?: number;

  // Style
  className?: string;
  style?: React.CSSProperties;

  // Callbacks
  onSceneChange?: (sceneIndex: number, sceneName: string) => void;
  onHotspotClick?: (hotspot: VNHotspot) => void;
  onHotspotHover?: (hotspot: VNHotspot | null) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: EngineState) => void;

  // Affichage
  showToolbar?: boolean;
  showLoadingScreen?: boolean;
  showDebugInfo?: boolean;

  // Contrôles clavier
  enableKeyboardControls?: boolean;
}

export const GameContainer: React.FC<GameContainerProps> = ({
  project,
  width = 800,
  height = 600,
  className,
  style,
  onSceneChange,
  onHotspotClick,
  onHotspotHover,
  onError,
  onStateChange,
  showToolbar = true,
  showLoadingScreen = true,
  showDebugInfo = false,
  enableKeyboardControls = true,
  ...engineOptions
}) => {
  // Hook du moteur
  const {
    canvasRef,
    state,
    isLoading,
    isPlaying,
    isPaused,
    error,
    currentScene,
    currentSceneIndex,
    hoveredHotspot,
    cursor,
    loadProject,
    start,
    pause,
    resume,
    stop,
    navigateForward,
    navigateBackward,
    navigateLeft,
    navigateRight,
    engine,
  } = useVNEngine({
    ...engineOptions,
    width,
    height,
  });

  // Charger le projet quand il change
  useEffect(() => {
    if (project) {
      loadProject(project).catch((err) => {
        onError?.(err);
      });
    }
  }, [project, loadProject, onError]);

  // Notifier les changements d'état
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Notifier les changements de scène
  useEffect(() => {
    if (currentScene) {
      onSceneChange?.(currentSceneIndex, currentScene.name);
    }
  }, [currentScene, currentSceneIndex, onSceneChange]);

  // Notifier les changements de hotspot survolé
  useEffect(() => {
    onHotspotHover?.(hoveredHotspot);
  }, [hoveredHotspot, onHotspotHover]);

  // Notifier les erreurs
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Contrôles clavier
  useEffect(() => {
    if (!enableKeyboardControls) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          navigateForward();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          navigateBackward();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          navigateLeft();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          navigateRight();
          break;
        case ' ':
          if (isPlaying) {
            pause();
          } else if (isPaused) {
            resume();
          }
          break;
        case 'Escape':
          stop();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enableKeyboardControls,
    isPlaying,
    isPaused,
    navigateForward,
    navigateBackward,
    navigateLeft,
    navigateRight,
    pause,
    resume,
    stop,
  ]);

  // Toolbar handlers
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      start();
    }
  }, [isPlaying, isPaused, pause, resume, start]);

  // Styles
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    backgroundColor: '#000',
    overflow: 'hidden',
    ...style,
  };

  const canvasStyle: React.CSSProperties = {
    display: 'block',
    cursor: cursor,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    fontSize: '18px',
  };

  const toolbarStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '0 10px',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '5px 15px',
    backgroundColor: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  };

  const debugStyle: React.CSSProperties = {
    position: 'absolute',
    top: '10px',
    left: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#0f0',
    padding: '10px',
    fontFamily: 'monospace',
    fontSize: '12px',
    borderRadius: '4px',
  };

  return (
    <div className={className} style={containerStyle}>
      {/* Canvas principal */}
      <canvas
        ref={canvasRef}
        width={width}
        height={showToolbar ? height - 40 : height}
        style={canvasStyle}
      />

      {/* Écran de chargement */}
      {showLoadingScreen && isLoading && (
        <div style={overlayStyle}>
          <div>
            <div style={{ marginBottom: '10px' }}>Loading...</div>
            <div
              style={{
                width: '200px',
                height: '4px',
                backgroundColor: '#333',
                borderRadius: '2px',
              }}
            >
              <div
                style={{
                  width: '50%',
                  height: '100%',
                  backgroundColor: '#0af',
                  borderRadius: '2px',
                  animation: 'loading 1s infinite',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div style={{ ...overlayStyle, backgroundColor: 'rgba(200, 0, 0, 0.8)' }}>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Error</div>
            <div>{error.message}</div>
          </div>
        </div>
      )}

      {/* Écran de pause */}
      {isPaused && (
        <div style={overlayStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>PAUSED</div>
            <div style={{ fontSize: '14px' }}>Press SPACE to continue</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {showToolbar && (
        <div style={toolbarStyle}>
          <button
            style={buttonStyle}
            onClick={() => navigateBackward()}
            title="Backward (S/Down)"
          >
            ◀ Back
          </button>
          <button
            style={buttonStyle}
            onClick={() => navigateLeft()}
            title="Turn Left (A/Left)"
          >
            ↰ Left
          </button>
          <button
            style={buttonStyle}
            onClick={handlePlayPause}
            title="Play/Pause (Space)"
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            style={buttonStyle}
            onClick={() => navigateRight()}
            title="Turn Right (D/Right)"
          >
            ↱ Right
          </button>
          <button
            style={buttonStyle}
            onClick={() => navigateForward()}
            title="Forward (W/Up)"
          >
            Forward ▶
          </button>
          <button
            style={buttonStyle}
            onClick={() => stop()}
            title="Stop (Esc)"
          >
            ⏹ Stop
          </button>
        </div>
      )}

      {/* Informations de debug */}
      {showDebugInfo && (
        <div style={debugStyle}>
          <div>State: {state}</div>
          <div>Scene: {currentSceneIndex} - {currentScene?.name ?? 'N/A'}</div>
          <div>Hotspot: {hoveredHotspot?.name ?? 'None'}</div>
          <div>Cursor: {cursor}</div>
        </div>
      )}
    </div>
  );
};

export default GameContainer;
