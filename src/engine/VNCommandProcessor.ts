/**
 * VNCommandProcessor - Exécution des commandes VND
 *
 * Interprète les VNCommandRaw parsées depuis les fichiers VND
 * et exécute les actions correspondantes.
 */

import {
  VNCommandRaw,
  VNCommandType,
  VNCommandTypeNames,
} from '../types/vn.types';
import { VNVariableStore } from './VNVariableStore';
import { VNSceneManager } from './VNSceneManager';

/**
 * Contexte d'exécution passé à chaque commande
 */
export interface VNExecutionContext {
  variableStore: VNVariableStore;
  sceneManager: VNSceneManager;
  onPlayWav?: (path: string, loop: boolean) => void;
  onPlayBmp?: (name: string, path: string, x: number, y: number, zOrder: number) => void;
  onPlayAvi?: (path: string) => void;
  onPlayText?: (name: string, text: string, x: number, y: number, w: number, h: number) => void;
  onDelBmp?: (name: string) => void;
  onCloseWav?: () => void;
  onPause?: (durationMs: number) => Promise<void>;
  onRunProject?: (projectPath: string, startScene?: string) => void;
  onExec?: (command: string) => void;
  onFont?: (size: number, flags: number, color: number, family: string) => void;
  onInvalidate?: () => void;
  onLog?: (message: string) => void;
}

/**
 * Extrait la valeur d'un string de commande par son type
 */
function getStringByType(cmd: VNCommandRaw, stringType: number): string | undefined {
  const item = cmd.strings.find((s) => s.type === stringType);
  return item?.string;
}

export class VNCommandProcessor {
  private context: VNExecutionContext;

  constructor(context: VNExecutionContext) {
    this.context = context;
  }

  /**
   * Exécute une liste de commandes
   */
  async executeCommands(commands: VNCommandRaw[]): Promise<void> {
    for (const cmd of commands) {
      await this.executeCommand(cmd);
    }
  }

  /**
   * Exécute une commande individuelle
   */
  async executeCommand(cmd: VNCommandRaw): Promise<void> {
    const typeName = VNCommandTypeNames[cmd.commandType] || `CMD_${cmd.commandType}`;
    this.context.onLog?.(`Execute: ${typeName} (${cmd.commandType})`);

    switch (cmd.commandType) {
      case VNCommandType.SCENE:
        this.execScene(cmd);
        break;

      case VNCommandType.SET_VAR:
        this.execSetVar(cmd);
        break;

      case VNCommandType.INC_VAR:
        this.execIncVar(cmd);
        break;

      case VNCommandType.DEC_VAR:
        this.execDecVar(cmd);
        break;

      case VNCommandType.IF:
        await this.execIf(cmd);
        break;

      case VNCommandType.PLAYWAV:
        this.execPlayWav(cmd);
        break;

      case VNCommandType.CLOSEWAV:
        this.context.onCloseWav?.();
        break;

      case VNCommandType.PLAYBMP:
        this.execPlayBmp(cmd);
        break;

      case VNCommandType.DELBMP:
        this.execDelBmp(cmd);
        break;

      case VNCommandType.PLAYAVI:
        this.execPlayAvi(cmd);
        break;

      case VNCommandType.PLAYTEXT:
        this.execPlayText(cmd);
        break;

      case VNCommandType.FONT:
        this.execFont(cmd);
        break;

      case VNCommandType.PAUSE:
        await this.execPause(cmd);
        break;

      case VNCommandType.RUNPRJ:
        this.execRunProject(cmd);
        break;

      case VNCommandType.EXEC:
        this.execExec(cmd);
        break;

      case VNCommandType.INVALIDATE:
        this.context.onInvalidate?.();
        break;

      case VNCommandType.QUIT:
        this.context.onLog?.('QUIT command');
        break;

      case VNCommandType.REM:
        // Commentaire, ne rien faire
        break;

      default:
        this.context.onLog?.(`Unhandled command type: ${typeName} (${cmd.commandType})`);
        break;
    }
  }

  // --- Implémentations des commandes ---

  private execScene(cmd: VNCommandRaw): void {
    // Type 6 dans les strings = nom de scène
    const sceneName = getStringByType(cmd, VNCommandType.SCENE);
    if (sceneName) {
      this.context.sceneManager.goToSceneByName(sceneName);
    }
  }

  private execSetVar(cmd: VNCommandRaw): void {
    // Type 22: "VAR VALUE"
    const str = getStringByType(cmd, VNCommandType.SET_VAR);
    if (str) {
      const parts = str.split(' ');
      if (parts.length >= 2) {
        const varName = parts[0];
        const value = parseInt(parts[1], 10);
        if (!isNaN(value)) {
          this.context.variableStore.set(varName, value);
        }
      }
    }
  }

  private execIncVar(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.INC_VAR);
    if (str) {
      const parts = str.split(' ');
      const varName = parts[0];
      const amount = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
      this.context.variableStore.increment(varName, isNaN(amount) ? 1 : amount);
    }
  }

  private execDecVar(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.DEC_VAR);
    if (str) {
      const parts = str.split(' ');
      const varName = parts[0];
      const amount = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
      this.context.variableStore.decrement(varName, isNaN(amount) ? 1 : amount);
    }
  }

  private async execIf(cmd: VNCommandRaw): Promise<void> {
    // Type 21: "VAR OP VALUE then CMD [else CMD]"
    const str = getStringByType(cmd, VNCommandType.IF);
    if (!str) return;

    const thenIdx = str.indexOf(' then ');
    if (thenIdx === -1) return;

    const condition = str.substring(0, thenIdx).trim();
    const rest = str.substring(thenIdx + 6).trim();

    // Parse condition: "VAR OP VALUE"
    const condParts = condition.split(/\s+/);
    if (condParts.length < 3) return;

    const varName = condParts[0];
    const operator = condParts[1];
    const rightValue = parseInt(condParts[2], 10);
    const leftValue = this.context.variableStore.get(varName);

    const result = this.context.variableStore.compare(leftValue, operator, isNaN(rightValue) ? 0 : rightValue);

    // Parse then/else
    const elseIdx = rest.indexOf(' else ');
    const thenCmd = elseIdx !== -1 ? rest.substring(0, elseIdx).trim() : rest;
    const elseCmd = elseIdx !== -1 ? rest.substring(elseIdx + 6).trim() : null;

    this.context.onLog?.(`IF ${condition} => ${result} -> ${result ? thenCmd : (elseCmd || 'skip')}`);

    // TODO: parse and execute thenCmd/elseCmd as command strings
  }

  private execPlayWav(cmd: VNCommandRaw): void {
    // Type 11: "path [loop]"
    const str = getStringByType(cmd, VNCommandType.PLAYWAV);
    if (str) {
      const parts = str.split(' ');
      const wavPath = parts[0];
      const loop = parts.length > 1 && parts[1].toLowerCase() === 'loop';
      this.context.onPlayWav?.(wavPath, loop);
    }
  }

  private execPlayBmp(cmd: VNCommandRaw): void {
    // Type 10: "path x y [zOrder]"
    const str = getStringByType(cmd, VNCommandType.PLAYBMP);
    if (str) {
      const parts = str.split(' ');
      const bmpPath = parts[0];
      const x = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      const y = parts.length > 2 ? parseInt(parts[2], 10) : 0;
      const zOrder = parts.length > 3 ? parseInt(parts[3], 10) : 0;
      this.context.onPlayBmp?.(bmpPath, bmpPath, isNaN(x) ? 0 : x, isNaN(y) ? 0 : y, isNaN(zOrder) ? 0 : zOrder);
    }
  }

  private execDelBmp(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.DELBMP);
    if (str) {
      this.context.onDelBmp?.(str);
    }
  }

  private execPlayAvi(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.PLAYAVI);
    if (str) {
      const parts = str.split(' ');
      this.context.onPlayAvi?.(parts[0]);
    }
  }

  private execPlayText(cmd: VNCommandRaw): void {
    // Type 38: "x y w h flags text"
    const str = getStringByType(cmd, VNCommandType.PLAYTEXT);
    if (str) {
      const parts = str.split(' ');
      if (parts.length >= 6) {
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        const w = parseInt(parts[2], 10);
        const h = parseInt(parts[3], 10);
        const text = parts.slice(5).join(' ');
        this.context.onPlayText?.('text', text, x, y, w, h);
      }
    }
  }

  private execFont(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.FONT);
    if (str) {
      const parts = str.split(' ');
      const size = parseInt(parts[0], 10);
      const flags = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      const color = parts.length > 2 ? parseInt(parts[2], 10) : 0;
      const family = parts.length > 3 ? parts.slice(3).join(' ') : 'Arial';
      this.context.onFont?.(isNaN(size) ? 12 : size, isNaN(flags) ? 0 : flags, isNaN(color) ? 0 : color, family);
    }
  }

  private async execPause(cmd: VNCommandRaw): Promise<void> {
    const str = getStringByType(cmd, VNCommandType.PAUSE);
    if (str) {
      const durationMs = parseInt(str, 10);
      if (!isNaN(durationMs) && this.context.onPause) {
        await this.context.onPause(durationMs);
      }
    }
  }

  private execRunProject(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.RUNPRJ);
    if (str) {
      const parts = str.split(' ');
      this.context.onRunProject?.(parts[0], parts.length > 1 ? parts[1] : undefined);
    }
  }

  private execExec(cmd: VNCommandRaw): void {
    const str = getStringByType(cmd, VNCommandType.EXEC);
    if (str) {
      this.context.onExec?.(str);
    }
  }
}
