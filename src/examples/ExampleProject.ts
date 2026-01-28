/**
 * Exemple de projet VN
 *
 * Montre comment créer un projet compatible avec le moteur VN-Studio
 */

import {
  VNProjectInfo,
  VNScene,
  VNHotspot,
  VNCommand,
  CommandType,
  HotspotShape,
  ScrollDirection,
  ConditionOperator,
} from '../types/vn.types';

/**
 * Crée un projet de démonstration
 */
export function createExampleProject(): VNProjectInfo {
  // Scène 1: Entrée
  const scene1: VNScene = {
    index: 0,
    name: 'Entrance',
    properties: {
      title: 'Welcome',
      backgroundColor: 0x000000,
      musicFile: 'music/intro.mid',
      musicLoop: true,
    },
    backgroundImage: 'images/entrance.bmp',
    hotspots: [
      {
        id: 'door',
        name: 'Door',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 300, top: 200, right: 500, bottom: 450 },
        cursorFile: 'cursors/hand.cur',
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.PLAY_WAVE, filename: 'sounds/door.wav', loop: false, volume: 100 },
          { type: CommandType.GOTO_SCENE, sceneIndex: 1 },
        ],
        onEnterCommands: [
          { type: CommandType.SHOW_TEXT, objectId: 'hint', text: 'Click to enter', x: 350, y: 180 },
        ],
        onExitCommands: [
          { type: CommandType.HIDE_OBJECT, objectId: 'hint' },
        ],
      },
      {
        id: 'sign',
        name: 'Sign',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 100, top: 100, right: 200, bottom: 150 },
        enabled: true,
        visible: false,
        onClickCommands: [
          {
            type: CommandType.IF,
            condition: {
              varName: 'SIGN_READ',
              operator: ConditionOperator.EQUAL,
              value: 0,
            },
            thenCommands: [
              { type: CommandType.SHOW_TEXT, objectId: 'signText', text: 'Welcome to VN-Studio Demo!', x: 100, y: 160, fontColor: 0xFFFFFF },
              { type: CommandType.SET_VAR, varName: 'SIGN_READ', value: 1 },
            ],
            elseCommands: [
              { type: CommandType.HIDE_OBJECT, objectId: 'signText' },
              { type: CommandType.SET_VAR, varName: 'SIGN_READ', value: 0 },
            ],
          },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
    ],
    objects: [],
    onEnterCommands: [
      { type: CommandType.SET_VAR, varName: 'CURRENT_ROOM', value: 0 },
    ],
    onExitCommands: [],
    forwardScene: 1,
  };

  // Scène 2: Hall
  const scene2: VNScene = {
    index: 1,
    name: 'Hall',
    properties: {
      title: 'Main Hall',
      backgroundColor: 0x222222,
    },
    backgroundImage: 'images/hall.bmp',
    hotspots: [
      {
        id: 'left_door',
        name: 'Left Door',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 50, top: 200, right: 150, bottom: 400 },
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.GOTO_SCENE, sceneIndex: 2 },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
      {
        id: 'right_door',
        name: 'Right Door',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 650, top: 200, right: 750, bottom: 400 },
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.GOTO_SCENE, sceneIndex: 3 },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
      {
        id: 'back_exit',
        name: 'Exit',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 350, top: 500, right: 450, bottom: 550 },
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.GOTO_SCENE, sceneIndex: 0 },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
    ],
    objects: [],
    onEnterCommands: [
      { type: CommandType.SET_VAR, varName: 'CURRENT_ROOM', value: 1 },
      { type: CommandType.INC_VAR, varName: 'VISIT_COUNT' },
    ],
    onExitCommands: [],
    backwardScene: 0,
    leftScene: 2,
    rightScene: 3,
  };

  // Scène 3: Salle gauche
  const scene3: VNScene = {
    index: 2,
    name: 'Left Room',
    properties: {
      title: 'Library',
      backgroundColor: 0x332211,
    },
    backgroundImage: 'images/library.bmp',
    hotspots: [
      {
        id: 'book',
        name: 'Book',
        shape: HotspotShape.POLYGON,
        points: [
          { x: 200, y: 300 },
          { x: 250, y: 280 },
          { x: 270, y: 350 },
          { x: 220, y: 370 },
        ],
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.PLAY_WAVE, filename: 'sounds/page.wav', loop: false, volume: 80 },
          {
            type: CommandType.SHOW_TEXT,
            objectId: 'bookContent',
            text: 'This is an ancient book of secrets...',
            x: 200,
            y: 200,
            width: 400,
            height: 100,
            fontName: 'Times New Roman',
            fontSize: 16,
            fontColor: 0x000000,
            backgroundColor: 0xFFFFF0,
          },
          { type: CommandType.SET_VAR, varName: 'BOOK_READ', value: 1 },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
      {
        id: 'exit',
        name: 'Exit',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 700, top: 250, right: 800, bottom: 400 },
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.HIDE_OBJECT, objectId: 'bookContent' },
          { type: CommandType.GOTO_SCENE, sceneIndex: 1 },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
    ],
    objects: [],
    onEnterCommands: [
      { type: CommandType.SET_VAR, varName: 'CURRENT_ROOM', value: 2 },
    ],
    onExitCommands: [],
    rightScene: 1,
  };

  // Scène 4: Salle droite
  const scene4: VNScene = {
    index: 3,
    name: 'Right Room',
    properties: {
      title: 'Gallery',
      backgroundColor: 0x112233,
    },
    backgroundImage: 'images/gallery.bmp',
    hotspots: [
      {
        id: 'painting',
        name: 'Painting',
        shape: HotspotShape.ELLIPSE,
        rect: { left: 300, top: 150, right: 500, bottom: 350 },
        enabled: true,
        visible: false,
        onClickCommands: [
          {
            type: CommandType.ZOOM,
            startScale: 1.0,
            endScale: 2.0,
            centerX: 400,
            centerY: 250,
            duration: 1000,
          },
          { type: CommandType.WAIT, duration: 2000 },
          {
            type: CommandType.ZOOM,
            startScale: 2.0,
            endScale: 1.0,
            centerX: 400,
            centerY: 250,
            duration: 1000,
          },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
      {
        id: 'exit',
        name: 'Exit',
        shape: HotspotShape.RECTANGLE,
        rect: { left: 0, top: 250, right: 100, bottom: 400 },
        enabled: true,
        visible: false,
        onClickCommands: [
          { type: CommandType.GOTO_SCENE, sceneIndex: 1 },
        ],
        onEnterCommands: [],
        onExitCommands: [],
      },
    ],
    objects: [],
    onEnterCommands: [
      { type: CommandType.SET_VAR, varName: 'CURRENT_ROOM', value: 3 },
    ],
    onExitCommands: [],
    leftScene: 1,
  };

  // Projet complet
  const project: VNProjectInfo = {
    title: 'VN-Studio Demo',
    version: '1.0.0',
    author: 'VN-Studio',
    copyright: '2024',
    description: 'A demonstration project for VN-Studio engine',
    startScene: 0,
    displayMode: {
      width: 800,
      height: 600,
      colorDepth: 32,
      fullscreen: false,
    },
    toolbar: {
      visible: true,
      alwaysVisible: false,
      position: 'bottom',
      buttons: [
        {
          id: 'back',
          tooltip: 'Go Back',
          command: { type: CommandType.BACKWARD },
          enabled: true,
          visible: true,
        },
        {
          id: 'forward',
          tooltip: 'Go Forward',
          command: { type: CommandType.FORWARD },
          enabled: true,
          visible: true,
        },
        {
          id: 'map',
          tooltip: 'Show Map',
          command: { type: CommandType.MAP },
          enabled: true,
          visible: true,
        },
      ],
    },
    timer: {
      resolution: 16,
    },
    scenes: [scene1, scene2, scene3, scene4],
    smoothZoom: true,
    smoothScroll: true,
    texturedBackground: false,
    trueColor: true,
    voicesEnabled: true,
    musicEnabled: true,
    videosEnabled: true,
  };

  return project;
}

export default createExampleProject;
