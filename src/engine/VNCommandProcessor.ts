/**
 * VNCommandProcessor - Exécuteur de commandes
 *
 * Reproduit fidèlement le système de commandes de Virtual Navigator 2.1
 * Basé sur la rétro-ingénierie de commands.cpp
 *
 * Commandes supportées:
 * - Navigation: GOTO, FORWARD, BACKWARD, LEFT, RIGHT, MAP, INDEX
 * - Variables: SETVAR, INCVAR, DECVAR
 * - Conditions: IF
 * - Audio: WAVE, MIDI, CDA, STOPSOUND, STOPMIDI, STOPALL
 * - Vidéo: AVI
 * - Graphiques: IMAGE, TEXT, HTML, HIDE
 * - Effets: SCROLL, ZOOM
 * - Timers: TIMERSTART, TIMERSTOP
 * - Contrôle: WAIT, CURSOR, ENABLE, DISABLE, EXEC, QUIT, REPLAY
 */

import {
  VNCommand,
  CommandType,
  VNSceneParms,
  VNSetVarParms,
  VNIncVarParms,
  VNDecVarParms,
  VNIfParms,
  VNExecParms,
  VNWaveParms,
  VNMidiParms,
  VNCDAParms,
  VNAviParms,
  VNImageParms,
  VNTextParms,
  VNHtmlParms,
  VNHideParms,
  VNTimerStartParms,
  VNTimerStopParms,
  VNScrollParms,
  VNZoomParms,
  VNWaitParms,
  VNCursorParms,
  VNHotspotControlParms,
  VNEventType,
  VNEvent,
  ConditionOperator,
} from '../types/vn.types';
import { VNVariableStore } from './VNVariableStore';

// Interface pour le contexte d'exécution
export interface VNExecutionContext {
  variableStore: VNVariableStore;
  goToScene: (index: number) => Promise<void>;
  showImage: (params: VNImageParms) => Promise<void>;
  showText: (params: VNTextParms) => Promise<void>;
  showHtml: (params: VNHtmlParms) => Promise<void>;
  hideObject: (objectId: string) => void;
  playWave: (filename: string, loop: boolean, volume: number) => Promise<void>;
  stopWave: () => void;
  playMidi: (filename: string, loop: boolean, volume: number) => Promise<void>;
  stopMidi: () => void;
  playCDA: (track: number, loop: boolean) => Promise<void>;
  stopCDA: () => void;
  playAvi: (params: VNAviParms) => Promise<void>;
  startTimer: (id: string, interval: number, commands: VNCommand[]) => void;
  stopTimer: (id: string) => void;
  startScroll: (params: VNScrollParms) => Promise<void>;
  startZoom: (params: VNZoomParms) => Promise<void>;
  setCursor: (cursorFile: string | null) => void;
  enableHotspot: (id: string) => void;
  disableHotspot: (id: string) => void;
  executeExternal: (program: string, args?: string, wait?: boolean) => Promise<void>;
  navigateForward: () => Promise<void>;
  navigateBackward: () => Promise<void>;
  navigateLeft: () => Promise<void>;
  navigateRight: () => Promise<void>;
  showMap: () => void;
  showIndex: () => void;
  replaySound: () => void;
  quit: () => void;
  emitEvent: (event: VNEvent) => void;
  getCurrentSceneIndex: () => number;
}

export class VNCommandProcessor {
  private context: VNExecutionContext;
  private isExecuting: boolean = false;
  private commandQueue: VNCommand[] = [];
  private abortController: AbortController | null = null;

  constructor(context: VNExecutionContext) {
    this.context = context;
  }

  /**
   * Exécute une liste de commandes séquentiellement
   */
  async executeCommands(commands: VNCommand[]): Promise<void> {
    for (const command of commands) {
      await this.execute(command);
    }
  }

  /**
   * Exécute une commande unique
   * Reproduit le switch/case de TVNCommand::Execute()
   */
  async execute(command: VNCommand): Promise<void> {
    this.isExecuting = true;

    // Émettre l'événement d'exécution
    this.context.emitEvent({
      type: VNEventType.COMMAND_EXECUTE,
      timestamp: Date.now(),
      data: { command },
    });

    try {
      switch (command.type) {
        // =================================================================
        // NAVIGATION
        // =================================================================

        case CommandType.GOTO_SCENE: {
          const params = command as VNSceneParms;
          await this.context.goToScene(params.sceneIndex);
          break;
        }

        case CommandType.FORWARD:
          await this.context.navigateForward();
          break;

        case CommandType.BACKWARD:
          await this.context.navigateBackward();
          break;

        case CommandType.LEFT:
          await this.context.navigateLeft();
          break;

        case CommandType.RIGHT:
          await this.context.navigateRight();
          break;

        case CommandType.MAP:
          this.context.showMap();
          break;

        case CommandType.INDEX:
          this.context.showIndex();
          break;

        // =================================================================
        // VARIABLES
        // =================================================================

        case CommandType.SET_VAR: {
          const params = command as VNSetVarParms;
          this.context.variableStore.set(params.varName, params.value);

          this.context.emitEvent({
            type: VNEventType.VARIABLE_CHANGE,
            timestamp: Date.now(),
            data: { name: params.varName, value: params.value },
          });
          break;
        }

        case CommandType.INC_VAR: {
          const params = command as VNIncVarParms;
          const amount = params.amount ?? 1;
          const newValue = this.context.variableStore.increment(params.varName, amount);

          this.context.emitEvent({
            type: VNEventType.VARIABLE_CHANGE,
            timestamp: Date.now(),
            data: { name: params.varName, value: newValue },
          });
          break;
        }

        case CommandType.DEC_VAR: {
          const params = command as VNDecVarParms;
          const amount = params.amount ?? 1;
          const newValue = this.context.variableStore.decrement(params.varName, amount);

          this.context.emitEvent({
            type: VNEventType.VARIABLE_CHANGE,
            timestamp: Date.now(),
            data: { name: params.varName, value: newValue },
          });
          break;
        }

        // =================================================================
        // CONDITIONS
        // =================================================================

        case CommandType.IF: {
          const params = command as VNIfParms;
          const conditionResult = this.evaluateCondition(params);

          if (conditionResult) {
            await this.executeCommands(params.thenCommands);
          } else if (params.elseCommands && params.elseCommands.length > 0) {
            await this.executeCommands(params.elseCommands);
          }
          break;
        }

        // =================================================================
        // AUDIO
        // =================================================================

        case CommandType.PLAY_WAVE: {
          const params = command as VNWaveParms;
          await this.context.playWave(
            params.filename,
            params.loop ?? false,
            params.volume ?? 100
          );

          this.context.emitEvent({
            type: VNEventType.MEDIA_START,
            timestamp: Date.now(),
            data: { type: 'wave', filename: params.filename },
          });
          break;
        }

        case CommandType.PLAY_MIDI: {
          const params = command as VNMidiParms;
          await this.context.playMidi(
            params.filename,
            params.loop ?? false,
            params.volume ?? 100
          );

          this.context.emitEvent({
            type: VNEventType.MEDIA_START,
            timestamp: Date.now(),
            data: { type: 'midi', filename: params.filename },
          });
          break;
        }

        case CommandType.PLAY_CDA: {
          const params = command as VNCDAParms;
          await this.context.playCDA(params.track, params.loop ?? false);

          this.context.emitEvent({
            type: VNEventType.MEDIA_START,
            timestamp: Date.now(),
            data: { type: 'cda', track: params.track },
          });
          break;
        }

        case CommandType.STOP_SOUND:
          this.context.stopWave();
          break;

        case CommandType.STOP_MIDI:
          this.context.stopMidi();
          break;

        case CommandType.STOP_ALL:
          this.context.stopWave();
          this.context.stopMidi();
          this.context.stopCDA();
          break;

        case CommandType.REPLAY:
          this.context.replaySound();
          break;

        // =================================================================
        // VIDÉO
        // =================================================================

        case CommandType.PLAY_AVI: {
          const params = command as VNAviParms;
          await this.context.playAvi(params);

          this.context.emitEvent({
            type: VNEventType.MEDIA_START,
            timestamp: Date.now(),
            data: { type: 'avi', filename: params.filename },
          });
          break;
        }

        // =================================================================
        // GRAPHIQUES
        // =================================================================

        case CommandType.SHOW_IMAGE: {
          const params = command as VNImageParms;
          await this.context.showImage(params);
          break;
        }

        case CommandType.SHOW_TEXT: {
          const params = command as VNTextParms;
          await this.context.showText(params);
          break;
        }

        case CommandType.SHOW_HTML: {
          const params = command as VNHtmlParms;
          await this.context.showHtml(params);
          break;
        }

        case CommandType.HIDE_OBJECT: {
          const params = command as VNHideParms;
          this.context.hideObject(params.objectId);
          break;
        }

        // =================================================================
        // EFFETS
        // =================================================================

        case CommandType.SCROLL: {
          const params = command as VNScrollParms;
          await this.context.startScroll(params);
          break;
        }

        case CommandType.ZOOM: {
          const params = command as VNZoomParms;
          await this.context.startZoom(params);
          break;
        }

        // =================================================================
        // TIMERS
        // =================================================================

        case CommandType.TIMER_START: {
          const params = command as VNTimerStartParms;
          this.context.startTimer(
            params.timerId,
            params.interval ?? 1000,
            params.commands ?? []
          );
          break;
        }

        case CommandType.TIMER_STOP: {
          const params = command as VNTimerStopParms;
          this.context.stopTimer(params.timerId);
          break;
        }

        // =================================================================
        // CONTRÔLE
        // =================================================================

        case CommandType.WAIT: {
          const params = command as VNWaitParms;
          await this.wait(params.duration);
          break;
        }

        case CommandType.CURSOR: {
          const params = command as VNCursorParms;
          this.context.setCursor(params.cursorFile ?? null);
          break;
        }

        case CommandType.ENABLE_HOTSPOT: {
          const params = command as VNHotspotControlParms;
          this.context.enableHotspot(params.hotspotId);
          break;
        }

        case CommandType.DISABLE_HOTSPOT: {
          const params = command as VNHotspotControlParms;
          this.context.disableHotspot(params.hotspotId);
          break;
        }

        case CommandType.EXEC: {
          const params = command as VNExecParms;
          await this.context.executeExternal(
            params.program,
            params.arguments,
            params.waitForExit
          );
          break;
        }

        case CommandType.QUIT:
          this.context.quit();
          break;

        default:
          console.warn(`Unknown command type: ${(command as { type: string }).type}`);
          this.context.emitEvent({
            type: VNEventType.ERROR,
            timestamp: Date.now(),
            data: { message: `Unknown command: ${(command as { type: string }).type}` },
          });
      }
    } catch (error) {
      this.context.emitEvent({
        type: VNEventType.ERROR,
        timestamp: Date.now(),
        data: { error, command },
      });
      throw error;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Évalue une condition IF
   * Reproduit le comportement de EvaluateCondition dans l'original
   */
  private evaluateCondition(params: VNIfParms): boolean {
    const { condition } = params;

    // Récupérer la valeur de la variable gauche
    const leftValue = this.context.variableStore.get(condition.varName);

    // Récupérer la valeur droite (variable ou constante)
    let rightValue: number;
    if (condition.valueIsVar && typeof condition.value === 'string') {
      rightValue = this.context.variableStore.get(condition.value);
    } else {
      rightValue = typeof condition.value === 'number' ? condition.value : parseInt(condition.value, 10);
    }

    // Comparer selon l'opérateur
    return this.context.variableStore.compare(leftValue, condition.operator, rightValue);
  }

  /**
   * Attend un certain temps
   */
  private wait(duration: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, duration);
    });
  }

  /**
   * Annule l'exécution en cours
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Vérifie si une exécution est en cours
   */
  get executing(): boolean {
    return this.isExecuting;
  }

  /**
   * Parse une commande depuis une chaîne de texte
   * Format: COMMAND param1 param2 ...
   */
  static parseCommand(line: string): VNCommand | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      return null; // Commentaire ou ligne vide
    }

    const parts = trimmed.split(/\s+/);
    const cmdType = parts[0].toUpperCase();

    switch (cmdType) {
      case 'GOTO':
        return {
          type: CommandType.GOTO_SCENE,
          sceneIndex: parseInt(parts[1], 10),
          sceneName: parts[2],
        } as VNSceneParms;

      case 'SETVAR':
        return {
          type: CommandType.SET_VAR,
          varName: parts[1],
          value: parseInt(parts[2], 10),
        } as VNSetVarParms;

      case 'INCVAR':
        return {
          type: CommandType.INC_VAR,
          varName: parts[1],
          amount: parts[2] ? parseInt(parts[2], 10) : 1,
        } as VNIncVarParms;

      case 'DECVAR':
        return {
          type: CommandType.DEC_VAR,
          varName: parts[1],
          amount: parts[2] ? parseInt(parts[2], 10) : 1,
        } as VNDecVarParms;

      case 'WAVE':
        return {
          type: CommandType.PLAY_WAVE,
          filename: parts[1],
          loop: parts[2] === 'LOOP',
          volume: parts[3] ? parseInt(parts[3], 10) : 100,
        } as VNWaveParms;

      case 'MIDI':
        return {
          type: CommandType.PLAY_MIDI,
          filename: parts[1],
          loop: parts[2] === 'LOOP',
          volume: parts[3] ? parseInt(parts[3], 10) : 100,
        } as VNMidiParms;

      case 'AVI':
        return {
          type: CommandType.PLAY_AVI,
          filename: parts[1],
          fullscreen: parts.includes('FULLSCREEN'),
        } as VNAviParms;

      case 'IMAGE':
        return {
          type: CommandType.SHOW_IMAGE,
          objectId: parts[1],
          filename: parts[2],
          x: parseInt(parts[3], 10),
          y: parseInt(parts[4], 10),
          transparent: parts.includes('TRANSPARENT'),
        } as VNImageParms;

      case 'TEXT':
        // TEXT id "text content" x y [font] [size] [color]
        // Parsing plus complexe pour le texte avec guillemets
        const textMatch = trimmed.match(/TEXT\s+(\S+)\s+"([^"]+)"\s+(\d+)\s+(\d+)/i);
        if (textMatch) {
          return {
            type: CommandType.SHOW_TEXT,
            objectId: textMatch[1],
            text: textMatch[2],
            x: parseInt(textMatch[3], 10),
            y: parseInt(textMatch[4], 10),
          } as VNTextParms;
        }
        break;

      case 'HIDE':
        return {
          type: CommandType.HIDE_OBJECT,
          objectId: parts[1],
        } as VNHideParms;

      case 'WAIT':
        return {
          type: CommandType.WAIT,
          duration: parseInt(parts[1], 10),
        } as VNWaitParms;

      case 'STOPSOUND':
        return { type: CommandType.STOP_SOUND };

      case 'STOPMIDI':
        return { type: CommandType.STOP_MIDI };

      case 'STOPALL':
        return { type: CommandType.STOP_ALL };

      case 'FORWARD':
        return { type: CommandType.FORWARD };

      case 'BACKWARD':
        return { type: CommandType.BACKWARD };

      case 'LEFT':
        return { type: CommandType.LEFT };

      case 'RIGHT':
        return { type: CommandType.RIGHT };

      case 'MAP':
        return { type: CommandType.MAP };

      case 'INDEX':
        return { type: CommandType.INDEX };

      case 'REPLAY':
        return { type: CommandType.REPLAY };

      case 'QUIT':
        return { type: CommandType.QUIT };

      case 'CURSOR':
        return {
          type: CommandType.CURSOR,
          cursorFile: parts[1] === 'DEFAULT' ? undefined : parts[1],
        } as VNCursorParms;

      case 'ENABLE':
        return {
          type: CommandType.ENABLE_HOTSPOT,
          hotspotId: parts[1],
        } as VNHotspotControlParms;

      case 'DISABLE':
        return {
          type: CommandType.DISABLE_HOTSPOT,
          hotspotId: parts[1],
        } as VNHotspotControlParms;

      case 'SCROLL':
        return {
          type: CommandType.SCROLL,
          direction: ['UP', 'DOWN', 'LEFT', 'RIGHT'].indexOf(parts[1].toUpperCase()),
          duration: parseInt(parts[2], 10),
          distance: parts[3] ? parseInt(parts[3], 10) : undefined,
        } as VNScrollParms;

      case 'ZOOM':
        return {
          type: CommandType.ZOOM,
          startScale: parseFloat(parts[1]),
          endScale: parseFloat(parts[2]),
          centerX: parseInt(parts[3], 10),
          centerY: parseInt(parts[4], 10),
          duration: parseInt(parts[5], 10),
        } as VNZoomParms;

      case 'TIMERSTART':
        return {
          type: CommandType.TIMER_START,
          timerId: parts[1],
          interval: parseInt(parts[2], 10),
          commands: [], // Les commandes sont définies ailleurs
        } as VNTimerStartParms;

      case 'TIMERSTOP':
        return {
          type: CommandType.TIMER_STOP,
          timerId: parts[1],
        } as VNTimerStopParms;

      case 'EXEC':
        return {
          type: CommandType.EXEC,
          program: parts[1],
          arguments: parts.slice(2).join(' '),
          waitForExit: false,
        } as VNExecParms;

      default:
        console.warn(`Unknown command: ${cmdType}`);
        return null;
    }

    return null;
  }

  /**
   * Parse un script complet (plusieurs lignes)
   */
  static parseScript(script: string): VNCommand[] {
    const lines = script.split('\n');
    const commands: VNCommand[] = [];

    for (const line of lines) {
      const cmd = VNCommandProcessor.parseCommand(line);
      if (cmd) {
        commands.push(cmd);
      }
    }

    return commands;
  }
}
