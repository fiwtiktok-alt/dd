import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
} from 'lucide-react';
import type {
  EasingType,
  Layer,
  MediaCacheEntry,
  ProjectState,
  SelectedKeyframeRef,
} from '../types/studio';
import { clamp, evalProp, frameToTimecode } from '../utils/motionMath';

interface TimelinePanelProps {
  project: ProjectState;
  playhead: number;
  isPlaying: boolean;
  selectedLayerId: string | null;
  selectedKeyframe: SelectedKeyframeRef | null;
  mediaCache: Map<string, MediaCacheEntry>;
  onSeek: (frame: number) => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onSelectLayer: (id: string) => void;
  onSelectKeyframe: (ref: SelectedKeyframeRef, jumpFrame: number) => void;
  onUpdateLayer: (layerId: string, updater: (l: Layer) => Layer, pushHistory?: boolean) => void;
  onSplitSelected: () => void;
  onDupSelected: () => void;
  onDeleteSelected: () => void;
  onToggleSnap: () => void;
  onToggleGraph: () => void;
  onSetGraphProp: (prop: string) => void;
  onChangeKeyframeEasing: (easing: EasingType) => void;
  onCopyKeyframe: () => void;
  onPasteKeyframe: () => void;
  onDeleteKeyframe: () => void;
  onNotify: (msg: string) => void;
}

const CLIP_COLOR_MAP: Record<string, string> = {
  '3d': '#1d4ed8',
  text: '#51377d',
  subtitle: '#1e3a5f',
  shape: '#31394a',
  image: '#6d4c2f',
  video: '#6d4c2f',
  voiceover: '#2f6f44',
  music: '#26543a',
  sfx: '#495a2b',
  adjustment: '#554422',
};

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  project,
  playhead,
  isPlaying,
  selectedLayerId,
  selectedKeyframe,
  mediaCache,
  onSeek,
  onTogglePlay,
  onStop,
  onSelectLayer,
  onSelectKeyframe,
  onUpdateLayer,
  onSplitSelected,
  onDupSelected,
  onDeleteSelected,
  onToggleSnap,
  onToggleGraph,
  onSetGraphProp,
  onChangeKeyframeEasing,
  onCopyKeyframe,
  onPasteKeyframe,
  onDeleteKeyframe,
  onNotify,
}) => {
  const [pps, setPps] = useState(44);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rulerRef = useRef<HTMLCanvasElement>(null);
  const rulerWrapRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const leftRowsRef = useRef<HTMLDivElement>(null);
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);

  const comp = project.composition;
  const totalW = Math.max(900, Math.ceil((comp.durationFrames / comp.fps) * pps) + 120);

  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    ruler.width = totalW;
    ruler.height = 24;
    const rctx = ruler.getContext('2d');
    if (!rctx) return;
    rctx.fillStyle = '#121419';
    rctx.fillRect(0, 0, totalW, 24);
    rctx.strokeStyle = '#2d3340';
    rctx.fillStyle = '#8b92a0';
    rctx.font = '10px "JetBrains Mono", monospace';
    const maxSec = Math.ceil(comp.durationFrames / comp.fps);
    for (let s = 0; s <= maxSec; s++) {
      const x = s * pps;
      rctx.beginPath();
      rctx.moveTo(x, 12);
      rctx.lineTo(x, 24);
      rctx.stroke();
      if (pps >= 30 || s % 2 === 0) rctx.fillText(`${s}s`, x + 3, 10);
    }
  }, [totalW, comp.durationFrames, comp.fps, pps]);

  useEffect(() => {
    if (!project.ui.graphOpen) return;
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth || 700;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const layer = project.layers.find((l) => l.id === selectedLayerId);
    const prop = project.ui.graphProp || 'x';
    if (!layer) return;
    const kfs = layer.keyframes?.[prop] || [];
    if (!kfs.length) {
      ctx.fillStyle = '#666d7c';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('No keyframes on this property.', 12, 50);
      return;
    }

    const minF = 0;
    const maxF = Math.max(1, comp.durationFrames);
    const vals = kfs.map((k) => k.value);
    const minV = Math.min(...vals) - 10;
    const maxV = Math.max(...vals) + 10;
    const toX = (f: number) => 16 + ((f - minF) / (maxF - minF)) * (canvas.width - 32);
    const toY = (v: number) =>
      canvas.height - 14 - ((v - minV) / Math.max(1e-4, maxV - minV)) * (canvas.height - 28);

    ctx.strokeStyle = '#2d7ff9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 16; px <= canvas.width - 16; px += 6) {
      const f = minF + ((px - 16) / (canvas.width - 32)) * (maxF - minF);
      const y = toY(evalProp(layer, prop, f));
      if (px === 16) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    kfs.forEach((k) => {
      ctx.fillStyle = selectedKeyframe?.kfId === k.id ? '#fff' : '#f5b942';
      ctx.beginPath();
      ctx.arc(toX(k.frame), toY(k.value), 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [project, selectedLayerId, selectedKeyframe, comp.durationFrames]);

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const scrub = (ev: { clientX: number }) => {
      const rect = ruler.getBoundingClientRect();
      const scroll = tracksScrollRef.current?.scrollLeft || 0;
      const frame = clamp(
        Math.round((Math.max(0, ev.clientX - rect.left + scroll) / pps) * comp.fps),
        0,
        comp.durationFrames - 1
      );
      onSeek(frame);
    };
    scrub(e);
    const up = () => {
      window.removeEventListener('mousemove', scrub);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', scrub);
    window.addEventListener('mouseup', up);
  };

  const handleClipMouseDown = (
    ev: React.MouseEvent<HTMLDivElement>,
    layer: Layer,
    mode: 'move' | 'trimL' | 'trimR'
  ) => {
    ev.stopPropagation();
    onSelectLayer(layer.id);
    if (layer.locked) {
      onNotify('Layer is locked');
      return;
    }

    const startX = ev.clientX;
    const origS = layer.startFrame;
    const origE = layer.endFrame;
    let moved = false;

    const onMove = (mv: MouseEvent) => {
      const df = Math.round(((mv.clientX - startX) / pps) * comp.fps);
      const shouldPush = df !== 0 && !moved;
      if (shouldPush) moved = true;

      onUpdateLayer(
        layer.id,
        (l) => {
          if (mode === 'move') {
            const len = origE - origS;
            let ns = clamp(origS + df, 0, comp.durationFrames - 1 - len);
            if (project.ui.snapping && Math.abs(ns - playhead) <= 4) ns = playhead;
            return { ...l, startFrame: ns, endFrame: ns + len };
          }
          if (mode === 'trimL') {
            return { ...l, startFrame: clamp(origS + df, 0, origE - 2) };
          }
          return { ...l, endFrame: clamp(origE + df, origS + 2, comp.durationFrames - 1) };
        },
        shouldPush
      );
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <section className="col-span-full row-start-4 bg-[var(--bg-panel)] border-t border-[var(--border)] flex flex-col min-h-0 overflow-hidden">
      <div className="h-[28px] bg-[#171920] border-b border-[var(--border)] flex items-center justify-between px-2 gap-1.5 shrink-0">
        <div className="flex items-center gap-1">
          <button className="studio-btn icon-btn" onClick={() => onSeek(0)} title="Go to Beginning (Home)">
            <SkipBack className="w-3 h-3" />
          </button>
          <button
            className="studio-btn icon-btn"
            onClick={() => onSeek(Math.max(0, playhead - 1))}
            title="Previous Frame (Left)"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            className="studio-btn icon-btn primary"
            onClick={onTogglePlay}
            title="Play/Pause (Space)"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <button className="studio-btn icon-btn" onClick={onStop} title="Stop">
            <Square className="w-3 h-3" />
          </button>
          <button
            className="studio-btn icon-btn"
            onClick={() => onSeek(Math.min(comp.durationFrames - 1, playhead + 1))}
            title="Next Frame (Right)"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            className="studio-btn icon-btn"
            onClick={() => onSeek(comp.durationFrames - 1)}
            title="Go to End (End)"
          >
            <SkipForward className="w-3 h-3" />
          </button>
          <span className="font-mono tabular-nums text-[12px] text-[#7cb3ff] bg-[var(--bg-input)] border border-[var(--border)] px-2 py-0.5 rounded-[3px]">
            {frameToTimecode(playhead, comp.fps)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button className="studio-btn" onClick={onSplitSelected} title="Split Selected Layer at Playhead">
            <Scissors className="w-3 h-3" />
            Split
          </button>
          <button className="studio-btn" onClick={onDupSelected} title="Duplicate Layer (Ctrl+D)">
            <Copy className="w-3 h-3" />
            Dup
          </button>
          {confirmDelete && selectedLayer ? (
            <div className="flex items-center gap-1">
              <button
                className="studio-btn danger-btn"
                onClick={() => {
                  onDeleteSelected();
                  setConfirmDelete(false);
                }}
              >
                Confirm Del
              </button>
              <button className="studio-btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="studio-btn danger-btn"
              onClick={() => {
                if (!selectedLayer) return;
                if (selectedLayer.locked) {
                  onNotify('Unlock layer before deleting');
                  return;
                }
                setConfirmDelete(true);
              }}
              title="Delete Layer (Delete)"
            >
              <Trash2 className="w-3 h-3" />
              Del
            </button>
          )}
          <button
            className={`studio-btn ${project.ui.snapping ? 'active' : ''}`}
            onClick={onToggleSnap}
            title="Snapping Toggle"
          >
            Snap
          </button>
          <button
            className={`studio-btn ${project.ui.graphOpen ? 'active' : ''}`}
            onClick={onToggleGraph}
            title="Toggle Keyframe Graph Editor"
          >
            Graph
          </button>
          <span className="text-[var(--text-dim)] text-[10px] pl-1">Zoom</span>
          <input
            type="range"
            min={15}
            max={140}
            value={pps}
            onChange={(e) => setPps(parseInt(e.target.value, 10))}
            className="w-[72px]"
          />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[245px_1fr] min-h-0 overflow-hidden">
        <div className="border-r border-[var(--border)] flex flex-col min-h-0">
          <div className="h-[24px] border-b border-[var(--border)] px-1.5 flex items-center justify-between text-[10px] text-[var(--text-dim)] shrink-0">
            <span>LAYERS / TRACKS</span>
            <span className="tabular-nums">{project.layers.length} layers</span>
          </div>
          <div
            ref={leftRowsRef}
            onScroll={(e) => {
              if (tracksScrollRef.current) {
                tracksScrollRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {project.layers.map((layer) => {
              const isSel = layer.id === selectedLayerId;
              return (
                <div
                  key={layer.id}
                  onClick={() => {
                    onSelectLayer(layer.id);
                    setConfirmDelete(false);
                  }}
                  onDoubleClick={() => {
                    setRenamingId(layer.id);
                    setRenameText(layer.name);
                  }}
                  className={`h-[var(--track-h)] border-b border-[#1f232c] px-1.5 flex items-center gap-1 cursor-pointer ${
                    isSel ? 'bg-[#1e2636]' : 'bg-[var(--bg-panel)]'
                  }`}
                >
                  <button
                    className={`w-[16px] h-[16px] text-[9px] rounded-[2px] flex items-center justify-center border-0 cursor-pointer ${
                      !layer.hidden
                        ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'text-[var(--text-dim)] bg-transparent'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateLayer(layer.id, (l) => ({ ...l, hidden: !l.hidden }), true);
                    }}
                    title="Visibility"
                  >
                    {layer.hidden ? '○' : '●'}
                  </button>
                  <button
                    className={`w-[16px] h-[16px] text-[9px] rounded-[2px] flex items-center justify-center border-0 cursor-pointer ${
                      layer.locked
                        ? 'text-[var(--warn)] bg-amber-500/15'
                        : 'text-[var(--text-dim)] bg-transparent'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateLayer(layer.id, (l) => ({ ...l, locked: !l.locked }), true);
                    }}
                    title="Lock"
                  >
                    {layer.locked ? 'L' : 'U'}
                  </button>
                  <button
                    className={`w-[16px] h-[16px] text-[9px] rounded-[2px] flex items-center justify-center border-0 cursor-pointer ${
                      layer.solo
                        ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'text-[var(--text-dim)] bg-transparent'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateLayer(layer.id, (l) => ({ ...l, solo: !l.solo }), true);
                    }}
                    title="Solo"
                  >
                    S
                  </button>
                  <button
                    className={`w-[16px] h-[16px] text-[9px] rounded-[2px] flex items-center justify-center border-0 cursor-pointer ${
                      layer.muted
                        ? 'text-[var(--warn)] bg-amber-500/15'
                        : 'text-[var(--text-dim)] bg-transparent'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateLayer(layer.id, (l) => ({ ...l, muted: !l.muted }), true);
                    }}
                    title="Mute"
                  >
                    M
                  </button>

                  {renamingId === layer.id ? (
                    <input
                      className="studio-input flex-1 min-w-0 h-[19px]"
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => {
                        if (renameText.trim()) {
                          onUpdateLayer(layer.id, (l) => ({ ...l, name: renameText.trim() }), true);
                        }
                        setRenamingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (renameText.trim()) {
                            onUpdateLayer(layer.id, (l) => ({ ...l, name: renameText.trim() }), true);
                          }
                          setRenamingId(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 text-[11px] truncate" title={layer.name}>
                      {layer.name}
                    </span>
                  )}

                  <span className="text-[8.5px] px-1 py-0.5 rounded-[2px] bg-[#232733] text-[var(--text-soft)] uppercase">
                    {layer.type.slice(0, 4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col min-w-0 min-h-0 relative">
          <div
            ref={rulerWrapRef}
            className="h-[24px] border-b border-[var(--border)] overflow-hidden relative bg-[#121419] shrink-0"
          >
            <canvas
              ref={rulerRef}
              height={24}
              onMouseDown={handleRulerMouseDown}
              className="block cursor-pointer"
            />
          </div>
          <div
            ref={tracksScrollRef}
            onScroll={(e) => {
              if (rulerWrapRef.current) rulerWrapRef.current.scrollLeft = e.currentTarget.scrollLeft;
              if (leftRowsRef.current) leftRowsRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            className="flex-1 overflow-auto relative bg-[#101216]"
          >
            <div style={{ width: `${totalW}px` }} className="relative min-h-full">
              {project.layers.map((layer) => {
                const isSel = layer.id === selectedLayerId;
                const leftPx = (layer.startFrame / comp.fps) * pps;
                const widthPx = Math.max(
                  10,
                  ((layer.endFrame - layer.startFrame + 1) / comp.fps) * pps
                );
                const media = layer.assetId ? mediaCache.get(layer.assetId) : undefined;
                const peaks =
                  media?.peaks ||
                  Array.from({ length: 36 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45)));

                return (
                  <div
                    key={layer.id}
                    className={`h-[var(--track-h)] border-b border-[#1b1f27] relative ${
                      isSel ? 'bg-[rgba(45,127,249,0.05)]' : ''
                    }`}
                  >
                    <div
                      onMouseDown={(ev) => handleClipMouseDown(ev, layer, 'move')}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                        background: CLIP_COLOR_MAP[layer.type] || '#343b4a',
                      }}
                      className={`absolute top-[3px] h-[20px] rounded-[3px] border border-white/15 overflow-hidden flex items-center px-1.5 text-[10px] ${
                        isSel ? 'border-white shadow-[0_0_0_1px_var(--accent)]' : ''
                      } ${layer.locked ? 'opacity-70 cursor-not-allowed' : 'cursor-grab'}`}
                    >
                      <div
                        onMouseDown={(ev) => handleClipMouseDown(ev, layer, 'trimL')}
                        className="absolute top-0 bottom-0 left-0 w-[6px] cursor-ew-resize bg-white/15"
                      />
                      {layer.kind === 'audio' && layer.assetId && (
                        <div className="absolute inset-0 flex items-center gap-[1px] opacity-40 pointer-events-none px-1">
                          {peaks.slice(0, Math.max(8, Math.floor(widthPx / 4))).map((pk, i) => (
                            <div
                              key={i}
                              className="flex-1 bg-emerald-200 rounded-xs"
                              style={{ height: `${Math.max(12, pk * 90)}%` }}
                            />
                          ))}
                        </div>
                      )}
                      <span className="relative z-10 pointer-events-none truncate">
                        {layer.name}
                      </span>
                      <div
                        onMouseDown={(ev) => handleClipMouseDown(ev, layer, 'trimR')}
                        className="absolute top-0 bottom-0 right-0 w-[6px] cursor-ew-resize bg-white/15"
                      />
                    </div>

                    {Object.entries(layer.keyframes || {}).map(([prop, list]) =>
                      list.map((kf) => (
                        <div
                          key={kf.id}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onSelectKeyframe(
                              { layerId: layer.id, prop, kfId: kf.id },
                              kf.frame
                            );
                          }}
                          style={{ left: `${(kf.frame / comp.fps) * pps}px` }}
                          className={`absolute top-1/2 w-[8px] h-[8px] -mt-[4px] -ml-[4px] border border-[#111] rotate-45 cursor-pointer z-20 ${
                            selectedKeyframe?.kfId === kf.id
                              ? 'bg-white border-[var(--accent)]'
                              : 'bg-[#f5b942]'
                          }`}
                        />
                      ))
                    )}
                  </div>
                );
              })}

              <div
                style={{ left: `${(playhead / comp.fps) * pps}px` }}
                className="absolute top-0 bottom-0 w-[1.5px] bg-[var(--accent)] pointer-events-none z-30"
              />
            </div>
          </div>
        </div>
      </div>

      {project.ui.graphOpen && (
        <div className="h-[120px] border-t border-[var(--border)] bg-[#0e1014] flex flex-col shrink-0">
          <div className="h-[22px] flex items-center justify-between px-2 border-b border-[var(--border)] text-[10px]">
            <span>
              {selectedLayer
                ? `Graph: ${selectedLayer.name} -> ${project.ui.graphProp}`
                : 'Graph Editor — Select a layer & property'}
            </span>
            <div className="flex items-center gap-1">
              <select
                className="studio-select"
                value={project.ui.graphProp}
                onChange={(e) => onSetGraphProp(e.target.value)}
              >
                <option value="x">Position X</option>
                <option value="y">Position Y</option>
                <option value="scaleX">Scale X</option>
                <option value="rotation">Rotation</option>
                <option value="opacity">Opacity</option>
                <option value="rotY">3D Rot Y</option>
                <option value="camZ">Camera Z</option>
              </select>
              <select
                className="studio-select"
                onChange={(e) => onChangeKeyframeEasing(e.target.value as EasingType)}
                defaultValue="easeInOut"
              >
                <option value="easeInOut">Ease In Out</option>
                <option value="easeIn">Ease In</option>
                <option value="easeOut">Ease Out</option>
                <option value="linear">Linear</option>
                <option value="bezier">Custom Bezier</option>
                <option value="hold">Hold</option>
              </select>
              <button className="studio-btn" onClick={onCopyKeyframe}>
                Copy KF
              </button>
              <button className="studio-btn" onClick={onPasteKeyframe}>
                Paste KF
              </button>
              <button className="studio-btn danger-btn" onClick={onDeleteKeyframe}>
                Del KF
              </button>
            </div>
          </div>
          <canvas ref={graphCanvasRef} className="w-full h-[96px] block cursor-crosshair" />
        </div>
      )}
    </section>
  );
};
