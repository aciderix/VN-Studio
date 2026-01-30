/**
 * VNRenderer - Moteur de rendu Canvas 2D
 *
 * Gère l'affichage des scènes: background, objets bitmap,
 * texte, et zones interactives (polygones).
 */

import { VNCommandRaw, VNParamPair } from '../types/vn.types';

// =============================================================================
// OPTIONS
// =============================================================================

export interface VNRendererOptions {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  debug?: boolean;
}

export interface ScrollState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
}

export interface ZoomState {
  scale: number;
  targetScale: number;
  centerX: number;
  centerY: number;
}

export interface EffectState {
  scroll: ScrollState;
  zoom: ZoomState;
}

// =============================================================================
// OBJETS AFFICHÉS
// =============================================================================

interface DisplayObject {
  name: string;
  image: HTMLImageElement | null;
  x: number;
  y: number;
  zOrder: number;
  visible: boolean;
}

// =============================================================================
// RENDERER
// =============================================================================

export class VNRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private debug: boolean;

  // Objets affichés
  private objects: Map<string, DisplayObject> = new Map();

  // Image de fond
  private background: HTMLImageElement | null = null;

  // État des effets
  private effects: EffectState = {
    scroll: { x: 0, y: 0, targetX: 0, targetY: 0, speed: 0 },
    zoom: { scale: 1, targetScale: 1, centerX: 320, centerY: 240 },
  };

  constructor(options: VNRendererOptions) {
    this.canvas = options.canvas;
    this.width = options.width || 640;
    this.height = options.height || 480;
    this.debug = options.debug || false;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2D context');
    this.ctx = ctx;

    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  /**
   * Efface le canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Affiche le fond
   */
  setBackground(image: HTMLImageElement): void {
    this.background = image;
  }

  /**
   * Ajoute un objet bitmap
   */
  addObject(name: string, image: HTMLImageElement, x: number, y: number, zOrder: number = 0): void {
    this.objects.set(name, { name, image, x, y, zOrder, visible: true });
  }

  /**
   * Supprime un objet
   */
  removeObject(name: string): void {
    this.objects.delete(name);
  }

  /**
   * Affiche/masque un objet
   */
  setObjectVisible(name: string, visible: boolean): void {
    const obj = this.objects.get(name);
    if (obj) obj.visible = visible;
  }

  /**
   * Rendu complet d'une frame
   */
  render(): void {
    this.clear();

    // Fond
    if (this.background) {
      this.ctx.drawImage(this.background, 0, 0, this.width, this.height);
    }

    // Objets triés par zOrder
    const sorted = Array.from(this.objects.values())
      .filter((o) => o.visible && o.image)
      .sort((a, b) => a.zOrder - b.zOrder);

    for (const obj of sorted) {
      if (obj.image) {
        this.ctx.drawImage(obj.image, obj.x, obj.y);
      }
    }
  }

  /**
   * Dessine les zones de polygones (debug)
   */
  renderPolygons(commands: VNCommandRaw[]): void {
    if (!this.debug) return;

    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    this.ctx.lineWidth = 2;

    for (const cmd of commands) {
      if (cmd.paramPairs.length >= 2) {
        this.ctx.beginPath();
        this.ctx.moveTo(cmd.paramPairs[0].a, cmd.paramPairs[0].b);
        for (let i = 1; i < cmd.paramPairs.length; i++) {
          this.ctx.lineTo(cmd.paramPairs[i].a, cmd.paramPairs[i].b);
        }
        this.ctx.closePath();
        this.ctx.stroke();
      }
    }
  }

  /**
   * Test si un point est dans un polygone (ray casting)
   */
  isPointInPolygon(x: number, y: number, pairs: VNParamPair[]): boolean {
    if (pairs.length < 3) return false;

    let inside = false;
    for (let i = 0, j = pairs.length - 1; i < pairs.length; j = i++) {
      const xi = pairs[i].a, yi = pairs[i].b;
      const xj = pairs[j].a, yj = pairs[j].b;

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Trouve la commande dont le polygone contient le point (x, y)
   */
  findCommandAtPoint(x: number, y: number, commands: VNCommandRaw[]): VNCommandRaw | null {
    for (const cmd of commands) {
      if (cmd.paramPairs.length >= 3 && this.isPointInPolygon(x, y, cmd.paramPairs)) {
        return cmd;
      }
    }
    return null;
  }

  /**
   * Réinitialise le renderer
   */
  reset(): void {
    this.objects.clear();
    this.background = null;
    this.clear();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getEffects(): EffectState {
    return this.effects;
  }
}
