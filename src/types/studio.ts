export type EasingType = 'easeInOut' | 'easeIn' | 'easeOut' | 'linear' | 'bezier' | 'hold';

export interface Keyframe {
  id: string;
  frame: number;
  value: number;
  easing: EasingType;
  cp1?: [number, number];
  cp2?: [number, number];
}

export type LayerType =
  | '3d'
  | 'text'
  | 'subtitle'
  | 'shape'
  | 'image'
  | 'video'
  | 'voiceover'
  | 'music'
  | 'sfx'
  | 'adjustment';

export type LayerKind = 'visual' | 'audio';

export type ThreeModelId =
  | 'glass_icon'
  | 'phone_pop'
  | 'phone_orb'
  | 'stack_cards'
  | 'orb_tap'
  | 'phone_hero'
  | 'bitcoin'
  | 'globe'
  | 'chart'
  | 'pillars'
  | 'scale';

export interface LayerProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  blur?: number;
  glow?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  camZ?: number;
  camY?: number;
  [key: string]: number | undefined;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  kind: LayerKind;
  assetId?: string | null;
  sceneId?: string;
  startFrame: number;
  endFrame: number;
  locked: boolean;
  hidden: boolean;
  solo: boolean;
  muted: boolean;
  blendMode?: GlobalCompositeOperation;
  props: LayerProps;
  keyframes: Record<string, Keyframe[]>;
  text?: {
    content: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    color: string;
    align: CanvasTextAlign;
    lineHeight: number;
    shadow: boolean;
    bgColor: string;
    strokeWidth: number;
    strokeColor?: string;
  };
  shape?: {
    kind: 'sber_bg' | 'rect' | 'circle' | 'gradient_bg';
    fill: string;
    stroke: string;
    strokeWidth: number;
    radius: number;
  };
  three?: {
    model: ThreeModelId;
    preset: string;
    color: string;
    metalness: number;
    roughness: number;
    transparency: number;
    scale3d: number;
    blueLight: number;
  };
  audio?: {
    volume: number;
    fadeIn: number;
    fadeOut: number;
    speed: number;
    trimOffsetSec: number;
  };
  colorAdj?: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
  effects?: {
    glowColor?: string;
  };
}

export interface StudioAsset {
  id: string;
  name: string;
  kind: '3d' | 'audio' | 'image' | 'video';
  subkind?: 'sfx' | 'music' | 'voiceover';
  model?: ThreeModelId;
  folderId?: string;
  source?: string;
  license?: string;
  duration?: number;
  loop?: boolean;
  url?: string;
  width?: number;
  height?: number;
  resolution?: string;
  sceneIndex?: number;
}

export interface StudioFolder {
  id: string;
  name: string;
}

export interface Transition {
  id: string;
  name: string;
  kind: 'smooth_zoom' | 'camera_push' | 'whip_pan' | 'light_sweep';
  startFrame: number;
  endFrame: number;
  intensity: number;
}

export interface SceneCardData {
  title: string;
  sub: string;
  val: string;
  accent?: string;
}

export interface SceneVisualData {
  headerSub?: string;
  headerMain: string;
  iconGlyph: string;
  cards: SceneCardData[];
  popCard?: SceneCardData;
}

export interface StoryboardScene {
  id: string;
  index: number;
  narration: string;
  durationSec: number;
  startFrame: number;
  endFrame: number;
  model: ThreeModelId;
  title: string;
  preset: string;
  camera: string;
  transition: Transition['kind'];
  query: string;
  sfx: string;
  color: string;
  note: string;
  approved: boolean;
  retrievedPhoto: string | null;
  retrievalStatus: string;
  visualData?: SceneVisualData;
}

export interface QCIssue {
  id: string;
  level: 'ok' | 'warn' | 'error';
  msg: string;
  fixLabel?: string;
  actionType?: 'importAudio';
}

export interface CompositionConfig {
  name: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  bgColor: string;
  preset: string;
}

export interface UIState {
  showSubtitles: boolean;
  muteTextOnFrame: boolean;
  snapping: boolean;
  zoomMode: 'fit' | 'fitW' | 'fitH' | 'manual';
  zoomLevel: number;
  showSafeArea: boolean;
  showGrid: boolean;
  showRulers: boolean;
  showChecker: boolean;
  activeAssetTab: string;
  inspectorTab: 'layer' | 'qc' | 'ai';
  graphOpen: boolean;
  graphProp: string;
}

export interface ProjectState {
  id: string;
  name: string;
  status: string;
  composition: CompositionConfig;
  ui: UIState;
  folders: StudioFolder[];
  assets: StudioAsset[];
  layers: Layer[];
  transitions: Transition[];
  storyboard: StoryboardScene[];
  qcIssues: QCIssue[];
}

export interface MediaCacheEntry {
  img?: HTMLImageElement;
  video?: HTMLVideoElement;
  audioBuffer?: AudioBuffer;
  peaks?: number[];
  url?: string;
}

export interface SelectedKeyframeRef {
  layerId: string;
  prop: string;
  kfId: string;
}
