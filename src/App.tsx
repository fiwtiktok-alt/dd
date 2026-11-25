import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AssetsPanel } from './components/AssetsPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { AIModal, CompModal, ExportModal } from './components/Modals';
import { PreviewCanvas } from './components/PreviewCanvas';
import { TimelinePanel } from './components/TimelinePanel';
import { TopBar } from './components/TopBar';
import {
  DEFAULT_SCRIPT,
  analyzeScript,
  buildAssembledTimeline,
  createDefaultProject,
  researchVisuals,
} from './engine/AIDirector';
import { audioEngine } from './engine/AudioStudioEngine';
import { runRealExport, type ExportParams, type ExportResult } from './engine/ExportEngine';
import type {
  CompositionConfig,
  EasingType,
  Layer,
  MediaCacheEntry,
  ProjectState,
  SelectedKeyframeRef,
  StudioAsset,
} from './types/studio';
import { clamp, deepClone, evalProp, uid } from './utils/motionMath';

const STORAGE_KEY = 'voya_motion_studio_project_v5';
const LAYOUT_KEY = 'voya_motion_studio_layout_v4';

interface ToastItem {
  id: string;
  msg: string;
}

function initInitialProject(): ProjectState {
  try {
    const savedRaw = localStorage.getItem(STORAGE_KEY);
    if (savedRaw) {
      const parsed = JSON.parse(savedRaw) as ProjectState;
      if (parsed?.composition && parsed?.layers?.length) return parsed;
    }
  } catch {
    // ignore storage errors
  }

  const base = createDefaultProject();
  base.storyboard = analyzeScript(base, DEFAULT_SCRIPT, 130, 'sber3d');
  const assembled = buildAssembledTimeline(base);
  base.layers = assembled.layers;
  base.transitions = assembled.transitions;
  base.composition.durationFrames = assembled.durationFrames;
  base.status = 'Saved';
  return base;
}

export default function App() {
  const [project, setProject] = useState<ProjectState>(initInitialProject);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    () => project.layers.find((l) => l.type === '3d')?.id || project.layers[0]?.id || null
  );
  const [selectedKeyframe, setSelectedKeyframe] = useState<SelectedKeyframeRef | null>(null);
  const [copiedKeyframe, setCopiedKeyframe] = useState<{
    prop: string;
    value: number;
    easing: EasingType;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [aiOpen, setAiOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const [scriptText, setScriptText] = useState(() => {
    const joined = project.storyboard.map((s) => s.narration).filter(Boolean).join('\n\n');
    return joined || DEFAULT_SCRIPT;
  });
  const [aiStatusLog, setAiStatusLog] = useState('Ready.');
  const [canAssemble, setCanAssemble] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportText, setExportText] = useState(
    'Idle — Click "Start Real Render" to generate video.'
  );
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  const undoStackRef = useRef<ProjectState[]>([]);
  const redoStackRef = useRef<ProjectState[]>([]);
  const mediaCacheRef = useRef<Map<string, MediaCacheEntry>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportCancelRef = useRef(false);
  const lastTickRef = useRef(0);
  const projectRef = useRef(project);
  projectRef.current = project;

  const notify = useCallback((msg: string) => {
    const id = uid('toast');
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const pushHistory = useCallback((snap?: ProjectState) => {
    const source = snap || projectRef.current;
    undoStackRef.current.push(deepClone(source));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const mutateProject = useCallback(
    (updater: (prev: ProjectState) => ProjectState, recordUndo = true) => {
      setProject((prev) => {
        if (recordUndo) pushHistory(prev);
        const next = updater(prev);
        return recordUndo ? { ...next, status: 'Unsaved changes' } : next;
      });
    },
    [pushHistory]
  );

  const saveProject = useCallback(
    (manual = true) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projectRef.current));
        setProject((prev) => ({ ...prev, status: 'Saved' }));
        if (manual) notify('Project saved');
      } catch {
        setProject((prev) => ({ ...prev, status: 'Unsaved changes' }));
        if (manual) notify('Storage unavailable; use Export');
      }
    },
    [notify]
  );

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    redoStackRef.current.push(deepClone(projectRef.current));
    const prev = undoStackRef.current.pop()!;
    setProject(prev);
    notify('Undo');
  }, [notify]);

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    undoStackRef.current.push(deepClone(projectRef.current));
    const next = redoStackRef.current.pop()!;
    setProject(next);
    notify('Redo');
  }, [notify]);

  // Restore saved panel splitter layout
  useEffect(() => {
    try {
      const lay = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      if (lay) {
        const root = document.documentElement;
        if (lay.left) root.style.setProperty('--left-w', lay.left);
        if (lay.right) root.style.setProperty('--right-w', lay.right);
        if (lay.bottom) root.style.setProperty('--timeline-h', lay.bottom);
      }
    } catch {
      // ignore
    }
  }, []);

  // Periodic autosave
  useEffect(() => {
    const id = setInterval(() => {
      if (projectRef.current.status === 'Unsaved changes') {
        saveProject(false);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [saveProject]);

  // Playback loop
  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        const startFrame =
          playhead >= projectRef.current.composition.durationFrames - 1 ? 0 : playhead;
        if (startFrame !== playhead) setPlayhead(startFrame);
        lastTickRef.current = performance.now();
        audioEngine.startPlaybackFromFrame(projectRef.current, mediaCacheRef.current, startFrame);
      } else {
        audioEngine.stopPlayback();
      }
      return next;
    });
  }, [playhead]);

  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    const step = (now: number) => {
      const fps = projectRef.current.composition.fps;
      const elapsedFrames = Math.floor(((now - lastTickRef.current) / 1000) * fps);
      if (elapsedFrames >= 1) {
        lastTickRef.current = now;
        setPlayhead((prev) => {
          const next = prev + elapsedFrames;
          if (next >= projectRef.current.composition.durationFrames) {
            audioEngine.startPlaybackFromFrame(projectRef.current, mediaCacheRef.current, 0);
            return 0;
          }
          return next;
        });
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const addTextLayer = useCallback(
    (preset?: { name?: string; size?: number; weight?: string; bg?: string }) => {
      const c = projectRef.current.composition;
      const l: Layer = {
        id: uid('lyr'),
        name: preset?.name || 'Text Layer',
        type: 'text',
        kind: 'visual',
        startFrame: playhead,
        endFrame: Math.min(c.durationFrames - 1, playhead + c.fps * 5),
        locked: false,
        hidden: false,
        solo: false,
        muted: false,
        text: {
          content: 'VOYA MOTION',
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          fontSize: preset?.size || 70,
          fontWeight: preset?.weight || '800',
          color: '#ffffff',
          align: 'center',
          lineHeight: 1.15,
          shadow: true,
          bgColor: preset?.bg || 'none',
          strokeWidth: 0,
        },
        props: {
          x: c.width / 2,
          y: c.height * 0.77,
          width: c.width * 0.84,
          height: 120,
          scaleX: 100,
          scaleY: 100,
          rotation: 0,
          opacity: 100,
          blur: 0,
          glow: 0,
        },
        keyframes: {},
      };
      mutateProject((p) => ({ ...p, layers: [l, ...p.layers] }));
      setSelectedLayerId(l.id);
    },
    [mutateProject, playhead]
  );

  const addSubtitleLayer = useCallback(
    (text = 'New subtitle line') => {
      const c = projectRef.current.composition;
      const l: Layer = {
        id: uid('lyr'),
        name: 'Subtitle',
        type: 'subtitle',
        kind: 'visual',
        startFrame: playhead,
        endFrame: Math.min(c.durationFrames - 1, playhead + c.fps * 4),
        locked: false,
        hidden: false,
        solo: false,
        muted: false,
        text: {
          content: text,
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          fontSize: 32,
          fontWeight: '500',
          color: '#e2e8f0',
          align: 'center',
          lineHeight: 1.3,
          shadow: true,
          bgColor: 'rgba(4, 10, 26, 0.72)',
          strokeWidth: 0,
        },
        props: {
          x: c.width / 2,
          y: c.height * 0.88,
          width: c.width * 0.84,
          height: 110,
          scaleX: 100,
          scaleY: 100,
          rotation: 0,
          opacity: 100,
          blur: 0,
          glow: 0,
        },
        keyframes: {},
      };
      mutateProject((p) => ({ ...p, layers: [l, ...p.layers] }));
      setSelectedLayerId(l.id);
    },
    [mutateProject, playhead]
  );

  const addShapeLayer = useCallback(
    (kind: 'sber_bg' | 'rect' | 'circle' = 'rect', name = 'Shape Layer') => {
      const c = projectRef.current.composition;
      const l: Layer = {
        id: uid('lyr'),
        name,
        type: 'shape',
        kind: 'visual',
        startFrame: playhead,
        endFrame: Math.min(c.durationFrames - 1, playhead + c.fps * 5),
        locked: false,
        hidden: false,
        solo: false,
        muted: false,
        shape: {
          kind,
          fill: kind === 'sber_bg' ? '#071329' : '#0f172a',
          stroke: '#2d7ff9',
          strokeWidth: kind === 'sber_bg' ? 0 : 3,
          radius: 24,
        },
        props: {
          x: c.width / 2,
          y: c.height / 2,
          width: kind === 'sber_bg' ? c.width : 520,
          height: kind === 'sber_bg' ? c.height : 260,
          scaleX: 100,
          scaleY: 100,
          rotation: 0,
          opacity: 100,
          blur: 0,
          glow: 0,
        },
        keyframes: {},
      };
      mutateProject((p) => ({
        ...p,
        layers: kind === 'sber_bg' ? [...p.layers, l] : [l, ...p.layers],
      }));
      setSelectedLayerId(l.id);
    },
    [mutateProject, playhead]
  );

  const add3DLayer = useCallback(
    (model: NonNullable<StudioAsset['model']> = 'phone_pop', name = '3D Phone + Pop-Out Card') => {
      const c = projectRef.current.composition;
      const l: Layer = {
        id: uid('lyr'),
        name,
        type: '3d',
        kind: 'visual',
        startFrame: playhead,
        endFrame: Math.min(c.durationFrames - 1, playhead + c.fps * 6),
        locked: false,
        hidden: false,
        solo: false,
        muted: false,
        three: {
          model,
          preset: 'Floating Product',
          color: '#3b82f6',
          metalness: 0.85,
          roughness: 0.22,
          transparency: 0,
          scale3d: 1,
          blueLight: 2.1,
        },
        props: {
          x: c.width / 2,
          y: c.height * 0.43,
          width: 920,
          height: 1120,
          scaleX: 100,
          scaleY: 100,
          rotation: 0,
          opacity: 100,
          blur: 0,
          glow: 0,
          posZ: 0,
          rotX: 0.15,
          rotY: 0,
          rotZ: 0,
          camZ: 6.2,
          camY: 0.3,
        },
        keyframes: {},
      };
      mutateProject((p) => ({ ...p, layers: [l, ...p.layers] }));
      setSelectedLayerId(l.id);
    },
    [mutateProject, playhead]
  );

  const addLayerFromAsset = useCallback(
    (asset: StudioAsset) => {
      if (asset.kind === '3d') {
        add3DLayer(asset.model || 'phone_pop', asset.name);
        return;
      }
      const c = projectRef.current.composition;
      const durFrames = Math.min(
        c.durationFrames - playhead,
        Math.round((asset.duration || 6) * c.fps)
      );
      const isAudio = asset.kind === 'audio';
      const layerType: Layer['type'] = isAudio
        ? asset.subkind === 'music'
          ? 'music'
          : asset.subkind === 'sfx'
          ? 'sfx'
          : 'voiceover'
        : asset.kind === 'video'
        ? 'video'
        : 'image';
      const l: Layer = {
        id: uid('lyr'),
        name: asset.name,
        type: layerType,
        kind: isAudio ? 'audio' : 'visual',
        assetId: asset.id,
        startFrame: playhead,
        endFrame: Math.max(playhead + 15, playhead + durFrames - 1),
        locked: false,
        hidden: false,
        solo: false,
        muted: false,
        audio: isAudio
          ? { volume: 100, fadeIn: 0, fadeOut: 0, speed: 1, trimOffsetSec: 0 }
          : undefined,
        colorAdj: !isAudio
          ? { brightness: 100, contrast: 100, saturation: 100 }
          : undefined,
        props: {
          x: c.width / 2,
          y: c.height / 2,
          width: asset.width ? Math.min(c.width * 0.9, asset.width) : 720,
          height: asset.height ? Math.min(c.height * 0.7, asset.height) : 720,
          scaleX: 100,
          scaleY: 100,
          rotation: 0,
          opacity: 100,
          blur: 0,
          glow: 0,
        },
        keyframes: {},
      };
      mutateProject((p) => ({ ...p, layers: [l, ...p.layers] }));
      setSelectedLayerId(l.id);
    },
    [add3DLayer, mutateProject, playhead]
  );

  const splitSelected = useCallback(() => {
    const l = projectRef.current.layers.find((x) => x.id === selectedLayerId);
    if (!l || l.locked) {
      notify('Select an unlocked layer');
      return;
    }
    if (playhead <= l.startFrame + 1 || playhead >= l.endFrame - 1) {
      notify('Move playhead inside layer bounds');
      return;
    }
    const copy = deepClone(l);
    copy.id = uid('lyr');
    copy.name = `${l.name} (Part 2)`;
    copy.startFrame = playhead;
    mutateProject((p) => ({
      ...p,
      layers: [
        copy,
        ...p.layers.map((x) => (x.id === l.id ? { ...x, endFrame: playhead - 1 } : x)),
      ],
    }));
  }, [mutateProject, notify, playhead, selectedLayerId]);

  const dupSelected = useCallback(() => {
    const l = projectRef.current.layers.find((x) => x.id === selectedLayerId);
    if (!l) return;
    const copy = deepClone(l);
    copy.id = uid('lyr');
    copy.name = `${l.name} Copy`;
    mutateProject((p) => ({ ...p, layers: [copy, ...p.layers] }));
    setSelectedLayerId(copy.id);
  }, [mutateProject, selectedLayerId]);

  const deleteSelected = useCallback(() => {
    const l = projectRef.current.layers.find((x) => x.id === selectedLayerId);
    if (!l) return;
    if (l.locked) {
      notify('Unlock layer before deleting');
      return;
    }
    mutateProject((p) => {
      const layers = p.layers.filter((x) => x.id !== l.id);
      return { ...p, layers };
    });
    const remaining = projectRef.current.layers.filter((x) => x.id !== l.id);
    setSelectedLayerId(remaining[0]?.id || null);
  }, [mutateProject, notify, selectedLayerId]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        dupSelected();
      } else if (e.key === 'Delete') {
        deleteSelected();
      } else if (e.key === 'Home') {
        setPlayhead(0);
      } else if (e.key === 'End') {
        setPlayhead(projectRef.current.composition.durationFrames - 1);
      } else if (e.key === 'ArrowLeft') {
        setPlayhead((p) => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight') {
        setPlayhead((p) => Math.min(projectRef.current.composition.durationFrames - 1, p + 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, dupSelected, redo, saveProject, togglePlay, undo]);

  // Resizable panel splitters
  const startSplitterDrag = (
    e: React.MouseEvent,
    axis: 'x' | 'y',
    cssVar: '--left-w' | '--right-w' | '--timeline-h',
    invert = false
  ) => {
    const start = axis === 'x' ? e.clientX : e.clientY;
    const root = document.documentElement;
    const cur = parseInt(getComputedStyle(root).getPropertyValue(cssVar), 10) || 250;

    const onMove = (mv: MouseEvent) => {
      const delta = (axis === 'x' ? mv.clientX : mv.clientY) - start;
      const next = clamp(cur + (invert ? -delta : delta), 140, 560);
      root.style.setProperty(cssVar, `${next}px`);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem(
          LAYOUT_KEY,
          JSON.stringify({
            left: root.style.getPropertyValue('--left-w'),
            right: root.style.getPropertyValue('--right-w'),
            bottom: root.style.getPropertyValue('--timeline-h'),
          })
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // File Import handler
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const f of files) {
      if (f.name.toLowerCase().endsWith('.json')) {
        try {
          const parsed = JSON.parse(await f.text()) as ProjectState;
          if (parsed?.composition && Array.isArray(parsed?.layers)) {
            mutateProject(() => ({ ...parsed, status: 'Saved' }));
            setSelectedLayerId(
              parsed.layers.find((l) => l.type === '3d')?.id || parsed.layers[0]?.id || null
            );
            const joined = (parsed.storyboard || [])
              .map((s) => s.narration)
              .filter(Boolean)
              .join('\n\n');
            if (joined) setScriptText(joined);
            setPlayhead(0);
            notify(`Loaded template: ${parsed.name}`);
          } else {
            notify('Invalid template JSON file');
          }
        } catch {
          notify('Could not parse JSON template');
        }
        continue;
      }
      if (f.name.toLowerCase().endsWith('.srt')) {
        const blocks = (await f.text()).trim().split(/\n\s*\n/);
        const newSubs: Layer[] = [];
        blocks.forEach((b, i) => {
          const txt = b.split('\n').slice(2).join(' ').trim();
          if (txt) {
            newSubs.push({
              id: uid('lyr'),
              name: `SRT #${i + 1}`,
              type: 'subtitle',
              kind: 'visual',
              startFrame: i * 90,
              endFrame: i * 90 + 85,
              locked: false,
              hidden: false,
              solo: false,
              muted: false,
              text: {
                content: txt,
                fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
                fontSize: 32,
                fontWeight: '500',
                color: '#e2e8f0',
                align: 'center',
                lineHeight: 1.3,
                shadow: true,
                bgColor: 'rgba(4, 10, 26, 0.72)',
                strokeWidth: 0,
              },
              props: {
                x: projectRef.current.composition.width / 2,
                y: projectRef.current.composition.height * 0.88,
                width: projectRef.current.composition.width * 0.84,
                height: 110,
                scaleX: 100,
                scaleY: 100,
                rotation: 0,
                opacity: 100,
                blur: 0,
                glow: 0,
              },
              keyframes: {},
            });
          }
        });
        mutateProject((p) => ({ ...p, layers: [...newSubs, ...p.layers] }));
        notify(`Imported ${newSubs.length} SRT entries`);
        continue;
      }

      const id = uid('ast');
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('image/')) {
        const img = new Image();
        await new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
          img.src = url;
        });
        mediaCacheRef.current.set(id, { img, url });
        const asset: StudioAsset = {
          id,
          name: f.name,
          kind: 'image',
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
          source: 'Local File',
        };
        mutateProject((p) => ({ ...p, assets: [...p.assets, asset] }));
        addLayerFromAsset(asset);
      } else if (f.type.startsWith('video/')) {
        const vid = document.createElement('video');
        vid.muted = true;
        vid.playsInline = true;
        vid.src = url;
        await new Promise<void>((res) => {
          vid.onloadedmetadata = () => res();
          vid.onerror = () => res();
        });
        mediaCacheRef.current.set(id, { video: vid, url });
        const asset: StudioAsset = {
          id,
          name: f.name,
          kind: 'video',
          url,
          width: vid.videoWidth,
          height: vid.videoHeight,
          duration: vid.duration || 6,
          source: 'Local File',
        };
        mutateProject((p) => ({ ...p, assets: [...p.assets, asset] }));
        addLayerFromAsset(asset);
      } else if (f.type.startsWith('audio/')) {
        const ctx = audioEngine.ensureCtx();
        if (ctx) {
          const decoded = await ctx.decodeAudioData(await f.arrayBuffer());
          mediaCacheRef.current.set(id, {
            audioBuffer: decoded,
            peaks: audioEngine.computePeaks(decoded),
            url,
          });
          const asset: StudioAsset = {
            id,
            name: f.name,
            kind: 'audio',
            subkind: 'voiceover',
            duration: decoded.duration,
            source: 'Local File',
          };
          mutateProject((p) => ({ ...p, assets: [...p.assets, asset] }));
          addLayerFromAsset(asset);
        }
      }
    }
    e.target.value = '';
  };

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <div className="studio-grid">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.srt,.json"
        hidden
        onChange={handleFileImport}
      />

      <TopBar
        projectName={project.name}
        status={project.status}
        showSubtitles={project.ui.showSubtitles}
        muteTextOnFrame={project.ui.muteTextOnFrame}
        isPlaying={isPlaying}
        canUndo={undoStackRef.current.length > 0}
        canRedo={redoStackRef.current.length > 0}
        onChangeName={(name) => mutateProject((p) => ({ ...p, name }))}
        onSave={() => saveProject(true)}
        onUndo={undo}
        onRedo={redo}
        onOpenAI={() => setAiOpen(true)}
        onImportClick={() => fileInputRef.current?.click()}
        onOpenComp={() => setCompOpen(true)}
        onAddText={() => addTextLayer()}
        onAddShape={() => addShapeLayer()}
        onAdd3D={() => add3DLayer()}
        onAddSub={() => addSubtitleLayer()}
        onToggleSubs={() =>
          mutateProject((p) => ({
            ...p,
            ui: { ...p.ui, showSubtitles: !p.ui.showSubtitles },
          }))
        }
        onToggleMuteText={() =>
          mutateProject((p) => ({
            ...p,
            ui: { ...p.ui, muteTextOnFrame: !p.ui.muteTextOnFrame },
          }))
        }
        onTogglePlay={togglePlay}
        onOpenExport={() => setExportOpen(true)}
        onResetLayout={() => {
          const r = document.documentElement;
          r.style.setProperty('--left-w', '248px');
          r.style.setProperty('--right-w', '290px');
          r.style.setProperty('--timeline-h', '215px');
          try {
            localStorage.removeItem(LAYOUT_KEY);
          } catch {
            // ignore
          }
          notify('Restored default layout');
        }}
      />

      <AssetsPanel
        activeTab={project.ui.activeAssetTab}
        assets={project.assets}
        folders={project.folders}
        selectedLayerId={selectedLayerId}
        onSelectTab={(tab) =>
          mutateProject((p) => ({ ...p, ui: { ...p.ui, activeAssetTab: tab } }), false)
        }
        onAddFolder={(name) =>
          mutateProject((p) => ({
            ...p,
            folders: [...p.folders, { id: uid('f'), name }],
            ui: { ...p.ui, activeAssetTab: 'Project' },
          }))
        }
        onCleanUnused={() => {
          const used = new Set(projectRef.current.layers.map((l) => l.assetId).filter(Boolean));
          mutateProject((p) => ({
            ...p,
            assets: p.assets.filter(
              (a) => a.kind === '3d' || a.source === 'Synthesized WebAudio' || used.has(a.id)
            ),
          }));
          notify('Cleaned unused assets');
        }}
        onAddFromAsset={addLayerFromAsset}
        onRenameAsset={(assetId, newName) =>
          mutateProject((p) => ({
            ...p,
            assets: p.assets.map((a) => (a.id === assetId ? { ...a, name: newName } : a)),
          }))
        }
        onReplaceSelectedLayerAsset={(asset) => {
          if (!selectedLayerId) return;
          mutateProject((p) => ({
            ...p,
            layers: p.layers.map((l) =>
              l.id === selectedLayerId ? { ...l, assetId: asset.id, name: asset.name } : l
            ),
          }));
        }}
        onAddTextPreset={(preset) => addTextLayer(preset)}
        onAddShapePreset={(kind, name) => addShapeLayer(kind, name)}
        onApplyEffect={(effectName) => {
          if (!selectedLayerId) {
            notify('Select a visual layer first');
            return;
          }
          if (effectName.includes('Light Sweep')) {
            const sel = projectRef.current.layers.find((l) => l.id === selectedLayerId);
            if (!sel) return;
            const c = projectRef.current.composition;
            const adj: Layer = {
              id: uid('lyr'),
              name: 'Adjustment Light Sweep',
              type: 'adjustment',
              kind: 'visual',
              startFrame: sel.startFrame,
              endFrame: sel.endFrame,
              locked: false,
              hidden: false,
              solo: false,
              muted: false,
              props: {
                x: c.width / 2,
                y: c.height / 2,
                width: c.width,
                height: c.height,
                scaleX: 100,
                scaleY: 100,
                rotation: 0,
                opacity: 100,
                blur: 0,
                glow: 0,
              },
              keyframes: {},
            };
            mutateProject((p) => ({ ...p, layers: [adj, ...p.layers] }));
            return;
          }
          mutateProject((p) => ({
            ...p,
            layers: p.layers.map((l) => {
              if (l.id !== selectedLayerId) return l;
              if (effectName.includes('Blur')) return { ...l, props: { ...l.props, blur: 8 } };
              if (effectName.includes('Glow')) return { ...l, props: { ...l.props, glow: 24 } };
              return {
                ...l,
                colorAdj: {
                  brightness: l.colorAdj?.brightness ?? 100,
                  saturation: l.colorAdj?.saturation ?? 100,
                  contrast: 125,
                },
              };
            }),
          }));
        }}
        onAddTransition={(tr) => {
          mutateProject((p) => ({
            ...p,
            transitions: [
              ...p.transitions,
              {
                id: uid('tr'),
                name: tr.name,
                kind: tr.kind,
                startFrame: Math.max(0, playhead - 10),
                endFrame: Math.min(p.composition.durationFrames - 1, playhead + 10),
                intensity: 1,
              },
            ],
          }));
          notify(`Added ${tr.name} transition`);
        }}
      />

      <div
        onMouseDown={(e) => startSplitterDrag(e, 'x', '--left-w')}
        className="splitter col-start-2 row-start-2 cursor-col-resize bg-[var(--bg-app)]"
      />

      <PreviewCanvas
        project={project}
        playhead={playhead}
        selectedLayerId={selectedLayerId}
        mediaCache={mediaCacheRef.current}
        onSelectLayer={setSelectedLayerId}
        onMoveLayer={(layerId, x, y, pushHist) => {
          mutateProject(
            (p) => ({
              ...p,
              layers: p.layers.map((l) => {
                if (l.id !== layerId) return l;
                const kfx = l.keyframes?.x ? [...l.keyframes.x] : [];
                const kfy = l.keyframes?.y ? [...l.keyframes.y] : [];
                const ix = kfx.findIndex((k) => k.frame === playhead);
                const iy = kfy.findIndex((k) => k.frame === playhead);
                if (ix >= 0) kfx[ix] = { ...kfx[ix], value: x };
                if (iy >= 0) kfy[iy] = { ...kfy[iy], value: y };
                return {
                  ...l,
                  props: {
                    ...l.props,
                    ...(ix < 0 ? { x } : {}),
                    ...(iy < 0 ? { y } : {}),
                  },
                  keyframes: {
                    ...l.keyframes,
                    ...(ix >= 0 ? { x: kfx } : {}),
                    ...(iy >= 0 ? { y: kfy } : {}),
                  },
                };
              }),
            }),
            pushHist
          );
        }}
        onZoomChange={(mode, level) =>
          mutateProject(
            (p) => ({
              ...p,
              ui: {
                ...p.ui,
                zoomMode: mode,
                zoomLevel: level !== undefined ? level : p.ui.zoomLevel,
              },
            }),
            false
          )
        }
        onToggleOverlay={(key) =>
          mutateProject(
            (p) => ({ ...p, ui: { ...p.ui, [key]: !p.ui[key] } }),
            false
          )
        }
      />

      <div
        onMouseDown={(e) => startSplitterDrag(e, 'x', '--right-w', true)}
        className="splitter col-start-4 row-start-2 cursor-col-resize bg-[var(--bg-app)]"
      />

      <InspectorPanel
        project={project}
        playhead={playhead}
        selectedLayer={selectedLayer}
        onSelectTab={(tab) =>
          mutateProject((p) => ({ ...p, ui: { ...p.ui, inspectorTab: tab } }), false)
        }
        onUpdateLayer={(layerId, updater, pushHist = false) =>
          mutateProject(
            (p) => ({
              ...p,
              layers: p.layers.map((l) => (l.id === layerId ? updater(l) : l)),
            }),
            pushHist
          )
        }
        onToggleKeyframe={(layerId, prop) => {
          mutateProject((p) => ({
            ...p,
            layers: p.layers.map((l) => {
              if (l.id !== layerId) return l;
              const list = [...(l.keyframes?.[prop] || [])];
              const idx = list.findIndex((k) => k.frame === playhead);
              if (idx >= 0) list.splice(idx, 1);
              else {
                list.push({
                  id: uid('kf'),
                  frame: playhead,
                  value: evalProp(l, prop, playhead),
                  easing: 'easeInOut',
                  cp1: [0.42, 0],
                  cp2: [0.58, 1],
                });
                list.sort((a, b) => a.frame - b.frame);
              }
              return { ...l, keyframes: { ...l.keyframes, [prop]: list } };
            }),
          }));
        }}
        onImportAudio={() => fileInputRef.current?.click()}
        onApplyNaturalEdit={(promptText) => {
          const q = promptText.toLowerCase().trim();
          if (!q) return 'Enter an editing instruction.';
          if (q.includes('hide all subtitles') || q.includes('sembunyikan subtitle')) {
            mutateProject((p) => ({ ...p, ui: { ...p.ui, showSubtitles: false } }));
            return 'Subtitles hidden cleanly.';
          }
          if (q.includes('mute text') || q.includes('bisukan teks')) {
            mutateProject((p) => ({ ...p, ui: { ...p.ui, muteTextOnFrame: true } }));
            return 'Mute Text on Frame enabled.';
          }
          if (
            selectedLayer &&
            !selectedLayer.locked &&
            selectedLayer.type === '3d' &&
            (q.includes('smaller') || q.includes('perkecil'))
          ) {
            mutateProject((p) => ({
              ...p,
              layers: p.layers.map((l) =>
                l.id === selectedLayer.id
                  ? {
                      ...l,
                      props: {
                        ...l.props,
                        scaleX: (l.props.scaleX ?? 100) * 0.85,
                        scaleY: (l.props.scaleY ?? 100) * 0.85,
                      },
                    }
                  : l
              ),
            }));
            return 'Scaled 3D UI down by 15%.';
          }
          if (
            selectedLayer &&
            !selectedLayer.locked &&
            (q.includes('duration') || q.includes('durasi'))
          ) {
            mutateProject((p) => ({
              ...p,
              layers: p.layers.map((l) =>
                l.id === selectedLayer.id ? { ...l, endFrame: l.endFrame + 30 } : l
              ),
            }));
            return 'Extended selected layer by +1.0s.';
          }
          return 'Try: "Hide all subtitles", "Mute text", "Make 3D smaller", or "Increase duration".';
        }}
      />

      <div
        onMouseDown={(e) => startSplitterDrag(e, 'y', '--timeline-h', true)}
        className="splitter col-span-full row-start-3 cursor-row-resize bg-[var(--bg-app)] border-t border-[var(--border)]"
      />

      <TimelinePanel
        project={project}
        playhead={playhead}
        isPlaying={isPlaying}
        selectedLayerId={selectedLayerId}
        selectedKeyframe={selectedKeyframe}
        mediaCache={mediaCacheRef.current}
        onSeek={(f) => setPlayhead(f)}
        onTogglePlay={togglePlay}
        onStop={() => {
          if (isPlaying) togglePlay();
          setPlayhead(0);
        }}
        onSelectLayer={setSelectedLayerId}
        onSelectKeyframe={(ref, jumpFrame) => {
          setSelectedLayerId(ref.layerId);
          setSelectedKeyframe(ref);
          setPlayhead(jumpFrame);
        }}
        onUpdateLayer={(layerId, updater, pushHist = false) =>
          mutateProject(
            (p) => ({
              ...p,
              layers: p.layers.map((l) => (l.id === layerId ? updater(l) : l)),
            }),
            pushHist
          )
        }
        onSplitSelected={splitSelected}
        onDupSelected={dupSelected}
        onDeleteSelected={deleteSelected}
        onToggleSnap={() =>
          mutateProject((p) => ({ ...p, ui: { ...p.ui, snapping: !p.ui.snapping } }), false)
        }
        onToggleGraph={() =>
          mutateProject((p) => ({ ...p, ui: { ...p.ui, graphOpen: !p.ui.graphOpen } }), false)
        }
        onSetGraphProp={(prop) =>
          mutateProject((p) => ({ ...p, ui: { ...p.ui, graphProp: prop } }), false)
        }
        onChangeKeyframeEasing={(easing) => {
          if (!selectedKeyframe) return;
          mutateProject((p) => ({
            ...p,
            layers: p.layers.map((l) => {
              if (l.id !== selectedKeyframe.layerId) return l;
              const list = (l.keyframes?.[selectedKeyframe.prop] || []).map((k) =>
                k.id === selectedKeyframe.kfId ? { ...k, easing } : k
              );
              return { ...l, keyframes: { ...l.keyframes, [selectedKeyframe.prop]: list } };
            }),
          }));
        }}
        onCopyKeyframe={() => {
          if (!selectedKeyframe) {
            notify('Select a keyframe diamond first');
            return;
          }
          const l = project.layers.find((x) => x.id === selectedKeyframe.layerId);
          const kf = l?.keyframes?.[selectedKeyframe.prop]?.find(
            (k) => k.id === selectedKeyframe.kfId
          );
          if (kf) {
            setCopiedKeyframe({ prop: selectedKeyframe.prop, value: kf.value, easing: kf.easing });
            notify('Keyframe copied');
          }
        }}
        onPasteKeyframe={() => {
          if (!copiedKeyframe) {
            notify('No copied keyframe');
            return;
          }
          if (!selectedLayerId) return;
          mutateProject((p) => ({
            ...p,
            layers: p.layers.map((l) => {
              if (l.id !== selectedLayerId) return l;
              const list = [...(l.keyframes?.[copiedKeyframe.prop] || [])];
              list.push({
                id: uid('kf'),
                frame: playhead,
                value: copiedKeyframe.value,
                easing: copiedKeyframe.easing,
              });
              list.sort((a, b) => a.frame - b.frame);
              return { ...l, keyframes: { ...l.keyframes, [copiedKeyframe.prop]: list } };
            }),
          }));
        }}
        onDeleteKeyframe={() => {
          if (!selectedKeyframe) return;
          mutateProject((p) => ({
            ...p,
            layers: p.layers.map((l) => {
              if (l.id !== selectedKeyframe.layerId) return l;
              return {
                ...l,
                keyframes: {
                  ...l.keyframes,
                  [selectedKeyframe.prop]: (l.keyframes?.[selectedKeyframe.prop] || []).filter(
                    (k) => k.id !== selectedKeyframe.kfId
                  ),
                },
              };
            }),
          }));
          setSelectedKeyframe(null);
        }}
        onNotify={notify}
      />

      <AIModal
        open={aiOpen}
        scriptText={scriptText}
        storyboard={project.storyboard}
        statusLog={aiStatusLog}
        canAssemble={canAssemble}
        onChangeScript={setScriptText}
        onAnalyze={(wpm, style) => {
          if (!scriptText.trim()) {
            notify('Paste a narration script first');
            return;
          }
          const scenes = analyzeScript(projectRef.current, scriptText, wpm, style);
          mutateProject((p) => ({ ...p, storyboard: scenes }));
          setCanAssemble(true);
          setAiStatusLog(`Analyzed ${scenes.length} scenes.`);
        }}
        onResearch={async (wpm, style) => {
          let scenes = projectRef.current.storyboard;
          if (!scenes.length) {
            scenes = analyzeScript(projectRef.current, scriptText, wpm, style);
          }
          setAiStatusLog('Searching Wikimedia Commons...');
          await researchVisuals(
            projectRef.current,
            scenes,
            mediaCacheRef.current,
            (updatedScenes, updatedAssets) => {
              setProject((p) => ({
                ...p,
                storyboard: updatedScenes,
                assets: updatedAssets,
              }));
            }
          );
          setCanAssemble(true);
          setAiStatusLog('Visual research finished.');
        }}
        onAssemble={() => {
          const assembled = buildAssembledTimeline(projectRef.current);
          mutateProject((p) => ({
            ...p,
            layers: assembled.layers,
            transitions: assembled.transitions,
            composition: { ...p.composition, durationFrames: assembled.durationFrames },
          }));
          setSelectedLayerId(assembled.selectedLayerId);
          setPlayhead(0);
          setAiOpen(false);
          notify(`Assembled 3D Glass UI across ${assembled.layers.length} layers!`);
        }}
        onQuickVisualize={(wpm, style) => {
          if (!scriptText.trim()) {
            notify('Tempelkan teks narasi terlebih dahulu');
            return;
          }
          const scenes = analyzeScript(projectRef.current, scriptText, wpm, style);
          const draftProject: ProjectState = {
            ...projectRef.current,
            storyboard: scenes,
          };
          const assembled = buildAssembledTimeline(draftProject);
          mutateProject((p) => ({
            ...p,
            storyboard: scenes,
            layers: assembled.layers,
            transitions: assembled.transitions,
            composition: { ...p.composition, durationFrames: assembled.durationFrames },
          }));
          setCanAssemble(true);
          setSelectedLayerId(assembled.selectedLayerId);
          setPlayhead(0);
          setAiStatusLog(`Visualized ${scenes.length} scenes.`);
          setAiOpen(false);
          notify(`Visualisasi ${scenes.length} scene selesai!`);
        }}
        onDownloadTemplate={() => {
          const blob = new Blob([JSON.stringify(projectRef.current, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${projectRef.current.name || 'voya_template'}.voya.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          notify('Template .json downloaded');
        }}
        onToggleApprove={(sceneId) => {
          mutateProject(
            (p) => ({
              ...p,
              storyboard: p.storyboard.map((sc) =>
                sc.id === sceneId ? { ...sc, approved: !sc.approved } : sc
              ),
            }),
            false
          );
        }}
        onExtendDuration={(sceneId) => {
          mutateProject(
            (p) => ({
              ...p,
              storyboard: p.storyboard.map((sc) =>
                sc.id === sceneId && !sc.approved
                  ? {
                      ...sc,
                      durationSec: sc.durationSec + 1,
                      endFrame: sc.endFrame + p.composition.fps,
                    }
                  : sc
              ),
            }),
            false
          );
        }}
        onClose={() => setAiOpen(false)}
      />

      <CompModal
        open={compOpen}
        composition={project.composition}
        onApply={(nextComp: CompositionConfig, adapt) => {
          const ow = projectRef.current.composition.width;
          const oh = projectRef.current.composition.height;
          const nw = nextComp.width;
          const nh = nextComp.height;
          mutateProject((p) => {
            let layers = p.layers;
            if (ow !== nw || oh !== nh) {
              const rx = nw / ow;
              const ry = nh / oh;
              const uniform =
                adapt === 'scaleFit'
                  ? Math.min(rx, ry)
                  : adapt === 'cropFill'
                  ? Math.max(rx, ry)
                  : 1;
              layers = p.layers.map((l) => {
                if (l.kind === 'audio' || adapt === 'manual') return l;
                return {
                  ...l,
                  props: {
                    ...l.props,
                    x: Math.round(((l.props.x ?? ow / 2) / ow) * nw),
                    y: Math.round(((l.props.y ?? oh / 2) / oh) * nh),
                    ...(uniform !== 1
                      ? {
                          scaleX: Math.round((l.props.scaleX ?? 100) * uniform),
                          scaleY: Math.round((l.props.scaleY ?? 100) * uniform),
                        }
                      : {}),
                  },
                };
              });
            }
            return { ...p, composition: nextComp, layers };
          });
          setCompOpen(false);
          notify(`Composition updated: ${nw}×${nh} @ ${nextComp.fps}fps`);
        }}
        onClose={() => setCompOpen(false)}
      />

      <ExportModal
        open={exportOpen}
        exporting={exporting}
        progressPct={exportPct}
        progressText={exportText}
        result={exportResult}
        playhead={playhead}
        onStartExport={async (params: ExportParams) => {
          if (exporting) return;
          if (exportResult?.url) {
            try {
              URL.revokeObjectURL(exportResult.url);
            } catch {
              // ignore
            }
          }
          setExportResult(null);
          setExporting(true);
          exportCancelRef.current = false;
          setExportPct(0);
          setProject((p) => ({ ...p, status: 'Exporting' }));

          try {
            const res = await runRealExport(
              projectRef.current,
              mediaCacheRef.current,
              params,
              () => exportCancelRef.current,
              (pct, text) => {
                setExportPct(pct);
                setExportText(text);
              }
            );
            setExportResult(res);
            setProject((p) => ({ ...p, status: 'Export completed' }));
            notify('Video render ready to save!');
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Export failed';
            setExportText(`Export failed: ${msg}`);
            setProject((p) => ({ ...p, status: 'Export failed' }));
            notify(msg);
          } finally {
            setExporting(false);
          }
        }}
        onCancelOrClose={() => {
          if (exporting) {
            exportCancelRef.current = true;
            notify('Cancelling export...');
          } else {
            setExportOpen(false);
          }
        }}
      />

      <div className="fixed right-3.5 bottom-3.5 z-[2000] flex flex-col gap-1.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-[#1d212b] border border-[var(--border-strong)] text-[var(--text)] px-2.5 py-1.5 rounded-[4px] text-[11px] shadow-lg"
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
