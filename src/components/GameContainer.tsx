/**
 * GameContainer - Composant React principal du jeu VN
 *
 * Affiche le canvas du moteur et gère les interactions utilisateur.
 */

import React from 'react';
import { useVNEngine } from '../hooks/useVNEngine';

export interface GameContainerProps {
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  debug?: boolean;
  basePath?: string;
  autoStart?: boolean;
}

export function GameContainer({
  width = 640,
  height = 480,
  className,
  style,
  debug = false,
  basePath,
  autoStart = true,
}: GameContainerProps): React.JSX.Element {
  const {
    canvasRef,
    state,
    isLoading,
    error,
    currentScene,
    currentSceneIndex,
  } = useVNEngine({
    basePath,
    autoStart,
    debug,
  });

  return React.createElement('div', {
    className: className || 'vn-game-container',
    style: { width, height, position: 'relative' as const, ...style },
  },
    React.createElement('canvas', {
      ref: canvasRef,
      width,
      height,
      style: { display: 'block' },
    }),
    isLoading && React.createElement('div', {
      className: 'vn-loading',
      style: {
        position: 'absolute' as const, top: 0, left: 0,
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', color: 'white',
      },
    }, 'Chargement...'),
    error && React.createElement('div', {
      className: 'vn-error',
      style: {
        position: 'absolute' as const, bottom: 0, left: 0,
        width: '100%', padding: '8px',
        background: 'rgba(255,0,0,0.8)', color: 'white',
      },
    }, `Erreur: ${error.message}`),
    debug && currentScene && React.createElement('div', {
      className: 'vn-debug',
      style: {
        position: 'absolute' as const, top: 0, right: 0,
        padding: '4px 8px', background: 'rgba(0,0,0,0.7)',
        color: '#0f0', fontFamily: 'monospace', fontSize: '11px',
      },
    }, `Scene ${currentSceneIndex}: "${currentScene.name}" [${state}]`),
  );
}
