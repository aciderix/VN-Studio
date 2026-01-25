/**
 * VNRenderer - Moteur de rendu graphique
 *
 * Reproduit fidèlement le rendu DirectDraw de Virtual Navigator 2.1:
 * - TVNBitmap: Bitmaps et images
 * - TVNTransparentBmp: Transparence par couleur
 * - TVNScrollFx: Effet de défilement
 * - TVNZoomFx: Effet de zoom
 * - TVNTextObject: Rendu de texte
 *
 * Utilise Canvas 2D API pour le rendu moderne
 */

import {
  VNDisplayObject,
  VNImageObject,
  VNTextObject,
  VNHtmlObject,
  VNHotspot,
  VNScene,
  VNPoint,
  VNRect,
  HotspotShape,
  GdiObjectType,
  ScrollDirection,
} from '../types/vn.types';

// Options de rendu
export interface VNRendererOptions {
  width: number;
  height: number;
  backgroundColor: string;
  smoothZoom: boolean;
  smoothScroll: boolean;
  showHotspots: boolean; // Debug: afficher les zones cliquables
  trueColor: boolean;
}

// État d'un effet
export interface EffectState {
  active: boolean;
  startTime: number;
  duration: number;
  progress: number;
}

// État du scroll
export interface ScrollState extends EffectState {
  direction: ScrollDirection;
  distance: number;
  currentOffset: number;
}

// État du zoom
export interface ZoomState extends EffectState {
  startScale: number;
  endScale: number;
  currentScale: number;
  centerX: number;
  centerY: number;
}

export class VNRenderer {
  // Canvas principal
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Canvas de travail (double buffering)
  private backBuffer: HTMLCanvasElement;
  private backCtx: CanvasRenderingContext2D;

  // Options
  private options: VNRendererOptions;

  // Cache d'images
  private imageCache: Map<string, HTMLImageElement | ImageBitmap> = new Map();
  private loadingImages: Map<string, Promise<HTMLImageElement>> = new Map();

  // Objets affichés (triés par z-order)
  private displayObjects: Map<string, VNDisplayObject> = new Map();

  // Image de fond
  private backgroundImage: HTMLImageElement | null = null;

  // État des effets
  private scrollState: ScrollState | null = null;
  private zoomState: ZoomState | null = null;

  // Animation frame
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;

  // Callbacks
  private onRenderComplete?: () => void;

  // Base URL pour les images
  private baseUrl: string = '';

  constructor(canvas: HTMLCanvasElement, options?: Partial<VNRendererOptions>) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Cannot get 2D context from canvas');
    }
    this.ctx = context;

    // Options par défaut
    this.options = {
      width: options?.width ?? 800,
      height: options?.height ?? 600,
      backgroundColor: options?.backgroundColor ?? '#000000',
      smoothZoom: options?.smoothZoom ?? true,
      smoothScroll: options?.smoothScroll ?? true,
      showHotspots: options?.showHotspots ?? false,
      trueColor: options?.trueColor ?? true,
    };

    // Configurer le canvas
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;

    // Créer le back buffer
    this.backBuffer = document.createElement('canvas');
    this.backBuffer.width = this.options.width;
    this.backBuffer.height = this.options.height;
    const backContext = this.backBuffer.getContext('2d');
    if (!backContext) {
      throw new Error('Cannot create back buffer');
    }
    this.backCtx = backContext;

    // Configurer le lissage
    this.setImageSmoothing(this.options.smoothZoom);
  }

  /**
   * Définit l'URL de base pour les images
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url.endsWith('/') ? url : url + '/';
  }

  /**
   * Configure le lissage des images
   */
  private setImageSmoothing(enabled: boolean): void {
    this.ctx.imageSmoothingEnabled = enabled;
    this.backCtx.imageSmoothingEnabled = enabled;
    if (enabled) {
      this.ctx.imageSmoothingQuality = 'high';
      this.backCtx.imageSmoothingQuality = 'high';
    }
  }

  /**
   * Résout le chemin d'une image
   */
  private resolvePath(filename: string): string {
    let path = filename.replace(/\\/g, '/');
    path = path.replace(/^[A-Za-z]:/, '');

    if (!path.startsWith('/') && !path.startsWith('http')) {
      path = this.baseUrl + path;
    }

    return path;
  }

  // =========================================================================
  // CHARGEMENT D'IMAGES
  // =========================================================================

  /**
   * Charge une image
   * Reproduit TVNBitmap::Load()
   */
  async loadImage(filename: string): Promise<HTMLImageElement> {
    // Vérifier le cache
    const cached = this.imageCache.get(filename);
    if (cached && cached instanceof HTMLImageElement) {
      return cached;
    }

    // Vérifier si déjà en cours de chargement
    const loading = this.loadingImages.get(filename);
    if (loading) {
      return loading;
    }

    // Charger l'image
    const path = this.resolvePath(filename);
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.imageCache.set(filename, img);
        this.loadingImages.delete(filename);
        resolve(img);
      };

      img.onerror = () => {
        this.loadingImages.delete(filename);
        reject(new Error(`Failed to load image: ${path}`));
      };

      img.src = path;
    });

    this.loadingImages.set(filename, promise);
    return promise;
  }

  /**
   * Précharge une liste d'images
   */
  async preloadImages(filenames: string[]): Promise<void> {
    await Promise.all(filenames.map((f) => this.loadImage(f).catch(() => null)));
  }

  /**
   * Définit l'image de fond
   */
  async setBackground(filename: string): Promise<void> {
    this.backgroundImage = await this.loadImage(filename);
    this.render();
  }

  /**
   * Efface l'image de fond
   */
  clearBackground(): void {
    this.backgroundImage = null;
    this.render();
  }

  // =========================================================================
  // OBJETS D'AFFICHAGE
  // =========================================================================

  /**
   * Ajoute un objet image
   * Reproduit TVNImageObject
   */
  async addImageObject(
    id: string,
    filename: string,
    x: number,
    y: number,
    options?: {
      transparent?: boolean;
      transparentColor?: number;
      zOrder?: number;
      visible?: boolean;
    }
  ): Promise<void> {
    const img = await this.loadImage(filename);

    const obj: VNImageObject = {
      id,
      type: GdiObjectType.IMAGE,
      x,
      y,
      width: img.width,
      height: img.height,
      zOrder: options?.zOrder ?? 0,
      visible: options?.visible ?? true,
      imageData: img,
      filename,
      transparent: options?.transparent ?? false,
      transparentColor: options?.transparentColor,
    };

    this.displayObjects.set(id, obj);
    this.render();
  }

  /**
   * Ajoute un objet texte
   * Reproduit TVNTextObject
   */
  addTextObject(
    id: string,
    text: string,
    x: number,
    y: number,
    options?: {
      fontName?: string;
      fontSize?: number;
      fontColor?: number;
      fontBold?: boolean;
      fontItalic?: boolean;
      backgroundColor?: number;
      width?: number;
      height?: number;
      alignment?: 'left' | 'center' | 'right';
      zOrder?: number;
      visible?: boolean;
    }
  ): void {
    // Mesurer le texte pour calculer la taille
    const fontStyle = `${options?.fontBold ? 'bold ' : ''}${options?.fontItalic ? 'italic ' : ''}${options?.fontSize ?? 14}px ${options?.fontName ?? 'Arial'}`;
    this.ctx.font = fontStyle;
    const metrics = this.ctx.measureText(text);

    const obj: VNTextObject = {
      id,
      type: GdiObjectType.TEXT,
      x,
      y,
      width: options?.width ?? metrics.width,
      height: options?.height ?? (options?.fontSize ?? 14) * 1.2,
      zOrder: options?.zOrder ?? 0,
      visible: options?.visible ?? true,
      text,
      fontName: options?.fontName ?? 'Arial',
      fontSize: options?.fontSize ?? 14,
      fontColor: options?.fontColor ?? 0x000000,
      fontBold: options?.fontBold ?? false,
      fontItalic: options?.fontItalic ?? false,
      backgroundColor: options?.backgroundColor,
      alignment: options?.alignment ?? 'left',
    };

    this.displayObjects.set(id, obj);
    this.render();
  }

  /**
   * Ajoute un objet HTML
   * Reproduit TVNHtmlText
   */
  addHtmlObject(
    id: string,
    content: string,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: {
      zOrder?: number;
      visible?: boolean;
    }
  ): void {
    const obj: VNHtmlObject = {
      id,
      type: GdiObjectType.HTML,
      x,
      y,
      width,
      height,
      zOrder: options?.zOrder ?? 0,
      visible: options?.visible ?? true,
      content,
    };

    this.displayObjects.set(id, obj);
    this.render();
  }

  /**
   * Supprime un objet
   */
  removeObject(id: string): void {
    this.displayObjects.delete(id);
    this.render();
  }

  /**
   * Cache un objet
   * Reproduit HIDE command
   */
  hideObject(id: string): void {
    const obj = this.displayObjects.get(id);
    if (obj) {
      obj.visible = false;
      this.render();
    }
  }

  /**
   * Affiche un objet
   */
  showObject(id: string): void {
    const obj = this.displayObjects.get(id);
    if (obj) {
      obj.visible = true;
      this.render();
    }
  }

  /**
   * Efface tous les objets
   */
  clearObjects(): void {
    this.displayObjects.clear();
    this.render();
  }

  // =========================================================================
  // RENDU
  // =========================================================================

  /**
   * Rendu principal
   */
  render(): void {
    // Effacer le back buffer
    this.backCtx.fillStyle = this.options.backgroundColor;
    this.backCtx.fillRect(0, 0, this.options.width, this.options.height);

    // Calculer les transformations d'effet
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;
    let scaleOriginX = this.options.width / 2;
    let scaleOriginY = this.options.height / 2;

    // Appliquer le scroll
    if (this.scrollState?.active) {
      switch (this.scrollState.direction) {
        case ScrollDirection.UP:
          offsetY = -this.scrollState.currentOffset;
          break;
        case ScrollDirection.DOWN:
          offsetY = this.scrollState.currentOffset;
          break;
        case ScrollDirection.LEFT:
          offsetX = -this.scrollState.currentOffset;
          break;
        case ScrollDirection.RIGHT:
          offsetX = this.scrollState.currentOffset;
          break;
      }
    }

    // Appliquer le zoom
    if (this.zoomState?.active) {
      scale = this.zoomState.currentScale;
      scaleOriginX = this.zoomState.centerX;
      scaleOriginY = this.zoomState.centerY;
    }

    // Sauvegarder l'état
    this.backCtx.save();

    // Appliquer les transformations
    if (scale !== 1) {
      this.backCtx.translate(scaleOriginX, scaleOriginY);
      this.backCtx.scale(scale, scale);
      this.backCtx.translate(-scaleOriginX, -scaleOriginY);
    }

    this.backCtx.translate(offsetX, offsetY);

    // Dessiner l'arrière-plan
    if (this.backgroundImage) {
      this.backCtx.drawImage(
        this.backgroundImage,
        0,
        0,
        this.options.width,
        this.options.height
      );
    }

    // Trier les objets par z-order
    const sortedObjects = Array.from(this.displayObjects.values())
      .filter((obj) => obj.visible)
      .sort((a, b) => a.zOrder - b.zOrder);

    // Dessiner chaque objet
    for (const obj of sortedObjects) {
      this.renderObject(obj);
    }

    // Restaurer l'état
    this.backCtx.restore();

    // Copier le back buffer vers le canvas principal
    this.ctx.drawImage(this.backBuffer, 0, 0);

    // Callback
    this.onRenderComplete?.();
  }

  /**
   * Rendu d'un objet
   */
  private renderObject(obj: VNDisplayObject): void {
    switch (obj.type) {
      case GdiObjectType.IMAGE:
        this.renderImageObject(obj as VNImageObject);
        break;
      case GdiObjectType.TEXT:
        this.renderTextObject(obj as VNTextObject);
        break;
      case GdiObjectType.HTML:
        this.renderHtmlObject(obj as VNHtmlObject);
        break;
    }
  }

  /**
   * Rendu d'une image
   * Reproduit TVNImageObject::Draw()
   */
  private renderImageObject(obj: VNImageObject): void {
    if (!obj.imageData) return;

    const img = obj.imageData as HTMLImageElement;

    if (obj.transparent && obj.transparentColor !== undefined) {
      // Transparence par couleur (comme dans l'original)
      this.renderTransparentImage(img, obj.x, obj.y, obj.transparentColor);
    } else {
      // Rendu normal
      this.backCtx.drawImage(img, obj.x, obj.y);
    }
  }

  /**
   * Rendu d'une image avec transparence par couleur
   * Reproduit TVNTransparentBmp::Draw()
   */
  private renderTransparentImage(
    img: HTMLImageElement,
    x: number,
    y: number,
    transparentColor: number
  ): void {
    // Créer un canvas temporaire
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Dessiner l'image
    tempCtx.drawImage(img, 0, 0);

    // Obtenir les données de pixels
    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    // Couleur transparente (RGB)
    const transR = (transparentColor >> 16) & 0xff;
    const transG = (transparentColor >> 8) & 0xff;
    const transB = transparentColor & 0xff;

    // Rendre les pixels transparents
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === transR && data[i + 1] === transG && data[i + 2] === transB) {
        data[i + 3] = 0; // Alpha = 0
      }
    }

    // Remettre les données
    tempCtx.putImageData(imageData, 0, 0);

    // Dessiner sur le back buffer
    this.backCtx.drawImage(tempCanvas, x, y);
  }

  /**
   * Rendu de texte
   * Reproduit TVNTextObject::Draw()
   */
  private renderTextObject(obj: VNTextObject): void {
    // Fond (si défini)
    if (obj.backgroundColor !== undefined) {
      this.backCtx.fillStyle = this.colorToHex(obj.backgroundColor);
      this.backCtx.fillRect(obj.x, obj.y, obj.width, obj.height);
    }

    // Style de police
    const fontStyle = `${obj.fontBold ? 'bold ' : ''}${obj.fontItalic ? 'italic ' : ''}${obj.fontSize}px ${obj.fontName}`;
    this.backCtx.font = fontStyle;
    this.backCtx.fillStyle = this.colorToHex(obj.fontColor);

    // Alignement
    let textX = obj.x;
    if (obj.alignment === 'center') {
      this.backCtx.textAlign = 'center';
      textX = obj.x + obj.width / 2;
    } else if (obj.alignment === 'right') {
      this.backCtx.textAlign = 'right';
      textX = obj.x + obj.width;
    } else {
      this.backCtx.textAlign = 'left';
    }

    this.backCtx.textBaseline = 'top';

    // Dessiner le texte
    this.backCtx.fillText(obj.text, textX, obj.y);
  }

  /**
   * Rendu HTML (simplifié - le HTML réel nécessite un iframe)
   */
  private renderHtmlObject(obj: VNHtmlObject): void {
    // Fond blanc
    this.backCtx.fillStyle = '#ffffff';
    this.backCtx.fillRect(obj.x, obj.y, obj.width, obj.height);

    // Bordure
    this.backCtx.strokeStyle = '#000000';
    this.backCtx.strokeRect(obj.x, obj.y, obj.width, obj.height);

    // Texte (version simplifiée - le vrai rendu HTML nécessite foreignObject)
    this.backCtx.fillStyle = '#000000';
    this.backCtx.font = '12px Arial';
    this.backCtx.textBaseline = 'top';

    // Extraire le texte du HTML
    const text = obj.content.replace(/<[^>]+>/g, ' ').trim();
    this.backCtx.fillText(text, obj.x + 5, obj.y + 5, obj.width - 10);
  }

  /**
   * Dessine les hotspots (mode debug)
   */
  renderHotspots(hotspots: VNHotspot[]): void {
    if (!this.options.showHotspots) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
    this.ctx.lineWidth = 2;

    for (const hotspot of hotspots) {
      if (!hotspot.enabled) continue;

      this.ctx.beginPath();

      if (hotspot.shape === HotspotShape.RECTANGLE && hotspot.rect) {
        const { left, top, right, bottom } = hotspot.rect;
        this.ctx.rect(left, top, right - left, bottom - top);
      } else if (hotspot.shape === HotspotShape.POLYGON && hotspot.points) {
        const points = hotspot.points;
        if (points.length > 0) {
          this.ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
          }
          this.ctx.closePath();
        }
      } else if (hotspot.shape === HotspotShape.ELLIPSE && hotspot.rect) {
        const { left, top, right, bottom } = hotspot.rect;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        const rx = (right - left) / 2;
        const ry = (bottom - top) / 2;
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      }

      this.ctx.fill();
      this.ctx.stroke();

      // Nom du hotspot
      if (hotspot.rect) {
        this.ctx.fillStyle = 'red';
        this.ctx.font = '10px Arial';
        this.ctx.fillText(hotspot.name, hotspot.rect.left, hotspot.rect.top - 2);
      }
    }

    this.ctx.restore();
  }

  // =========================================================================
  // EFFETS
  // =========================================================================

  /**
   * Démarre un effet de scroll
   * Reproduit TVNScrollFx
   */
  startScroll(
    direction: ScrollDirection,
    duration: number,
    distance?: number
  ): Promise<void> {
    return new Promise((resolve) => {
      // Distance par défaut = taille de l'écran dans la direction
      const defaultDistance =
        direction === ScrollDirection.UP || direction === ScrollDirection.DOWN
          ? this.options.height
          : this.options.width;

      this.scrollState = {
        active: true,
        startTime: performance.now(),
        duration,
        progress: 0,
        direction,
        distance: distance ?? defaultDistance,
        currentOffset: 0,
      };

      // Démarrer l'animation
      this.animateEffect(() => {
        this.scrollState = null;
        resolve();
      });
    });
  }

  /**
   * Démarre un effet de zoom
   * Reproduit TVNZoomFx
   */
  startZoom(
    startScale: number,
    endScale: number,
    centerX: number,
    centerY: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      this.zoomState = {
        active: true,
        startTime: performance.now(),
        duration,
        progress: 0,
        startScale,
        endScale,
        currentScale: startScale,
        centerX,
        centerY,
      };

      // Démarrer l'animation
      this.animateEffect(() => {
        this.zoomState = null;
        resolve();
      });
    });
  }

  /**
   * Boucle d'animation des effets
   */
  private animateEffect(onComplete: () => void): void {
    const animate = (currentTime: number) => {
      let effectActive = false;

      // Mettre à jour le scroll
      if (this.scrollState?.active) {
        const elapsed = currentTime - this.scrollState.startTime;
        this.scrollState.progress = Math.min(elapsed / this.scrollState.duration, 1);

        // Easing (optionnel pour smooth scroll)
        const easedProgress = this.options.smoothScroll
          ? this.easeInOutQuad(this.scrollState.progress)
          : this.scrollState.progress;

        this.scrollState.currentOffset = easedProgress * this.scrollState.distance;

        if (this.scrollState.progress < 1) {
          effectActive = true;
        } else {
          this.scrollState.active = false;
        }
      }

      // Mettre à jour le zoom
      if (this.zoomState?.active) {
        const elapsed = currentTime - this.zoomState.startTime;
        this.zoomState.progress = Math.min(elapsed / this.zoomState.duration, 1);

        // Easing (optionnel pour smooth zoom)
        const easedProgress = this.options.smoothZoom
          ? this.easeInOutQuad(this.zoomState.progress)
          : this.zoomState.progress;

        this.zoomState.currentScale =
          this.zoomState.startScale +
          (this.zoomState.endScale - this.zoomState.startScale) * easedProgress;

        if (this.zoomState.progress < 1) {
          effectActive = true;
        } else {
          this.zoomState.active = false;
        }
      }

      // Rendu
      this.render();

      // Continuer ou terminer
      if (effectActive) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
        onComplete();
      }
    };

    // Démarrer
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Fonction d'easing quad
   */
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Arrête tous les effets
   */
  stopEffects(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.scrollState = null;
    this.zoomState = null;
    this.render();
  }

  // =========================================================================
  // UTILITAIRES
  // =========================================================================

  /**
   * Convertit un nombre RGB en chaîne hexadécimale
   */
  private colorToHex(color: number): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Teste si un point est dans un hotspot
   */
  hitTestHotspot(x: number, y: number, hotspot: VNHotspot): boolean {
    if (!hotspot.enabled) return false;

    switch (hotspot.shape) {
      case HotspotShape.RECTANGLE:
        if (hotspot.rect) {
          return (
            x >= hotspot.rect.left &&
            x <= hotspot.rect.right &&
            y >= hotspot.rect.top &&
            y <= hotspot.rect.bottom
          );
        }
        break;

      case HotspotShape.POLYGON:
        if (hotspot.points && hotspot.points.length >= 3) {
          return this.pointInPolygon(x, y, hotspot.points);
        }
        break;

      case HotspotShape.ELLIPSE:
        if (hotspot.rect) {
          return this.pointInEllipse(x, y, hotspot.rect);
        }
        break;
    }

    return false;
  }

  /**
   * Test point dans polygone (algorithme ray casting)
   */
  private pointInPolygon(x: number, y: number, points: VNPoint[]): boolean {
    let inside = false;
    const n = points.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = points[i].x;
      const yi = points[i].y;
      const xj = points[j].x;
      const yj = points[j].y;

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Test point dans ellipse
   */
  private pointInEllipse(x: number, y: number, rect: VNRect): boolean {
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const rx = (rect.right - rect.left) / 2;
    const ry = (rect.bottom - rect.top) / 2;

    if (rx === 0 || ry === 0) return false;

    return Math.pow(x - cx, 2) / Math.pow(rx, 2) + Math.pow(y - cy, 2) / Math.pow(ry, 2) <= 1;
  }

  /**
   * Trouve le hotspot sous le curseur
   */
  findHotspotAt(x: number, y: number, hotspots: VNHotspot[]): VNHotspot | null {
    // Parcourir en ordre inverse (les derniers sont au-dessus)
    for (let i = hotspots.length - 1; i >= 0; i--) {
      if (this.hitTestHotspot(x, y, hotspots[i])) {
        return hotspots[i];
      }
    }
    return null;
  }

  /**
   * Retourne les dimensions du canvas
   */
  getSize(): { width: number; height: number } {
    return { width: this.options.width, height: this.options.height };
  }

  /**
   * Redimensionne le canvas
   */
  resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.backBuffer.width = width;
    this.backBuffer.height = height;
    this.render();
  }

  /**
   * Définit le callback de rendu
   */
  setOnRenderComplete(callback: () => void): void {
    this.onRenderComplete = callback;
  }

  /**
   * Efface le cache d'images
   */
  clearCache(): void {
    this.imageCache.clear();
  }

  /**
   * Libère les ressources
   */
  dispose(): void {
    this.stopEffects();
    this.clearCache();
    this.displayObjects.clear();
  }
}
