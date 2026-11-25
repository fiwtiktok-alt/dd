import React, { useEffect, useRef } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { MediaCacheEntry, ProjectState } from '../types/studio';
import { clamp, evalProp } from '../utils/motionMath';
import { renderCompositionFrame } from '../engine/Compositor';

interface PreviewCanvasProps {
  project: ProjectState;
  playhead: number;
  selectedLayerId: string | null;
  mediaCache: Map<string, MediaCacheEntry>;
  onSelectLayer: (id: string) => void;
  onMoveLayer: (layerId: string, x: number, y: number, pushHistory: boolean) => void;
  onZoomChange: (mode: 'fit' | 'fitW' | 'fitH' | 'manual', level?: number) => void;
  onToggleOverlay: (key: 'showSafeArea' | 'showGrid' | 'showRulers' | 'showChecker') => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  project,
  playhead,
  selectedLayerId,
  mediaCache,
  onSelectLayer,
  onMoveLayer,
  onZoomChange,
  onToggleOverlay,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const comp = project.composition;
    if (canvas.width !== comp.width || canvas.height !== comp.height) {
      canvas.width = comp.width;
      canvas.height = comp.height;
    }

    const sw = Math.max(120, stage.clientWidth - 18);
    const sh = Math.max(120, stage.clientHeight - 18);
    let scale = project.ui.zoomLevel;
    if (project.ui.zoomMode === 'fit') scale = Math.min(sw / comp.width, sh / comp.height);
    else if (project.ui.zoomMode === 'fitW') scale = sw / comp.width;
    else if (project.ui.zoomMode === 'fitH') scale = sh / comp.height;
    scale = clamp(scale, 0.08, 2.0);

    canvas.style.width = `${Math.round(comp.width * scale)}px`;
    canvas.style.height = `${Math.round(comp.height * scale)}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderCompositionFrame(ctx, project, mediaCache, comp.width, comp.height, playhead, {
        isExport: false,
        selectedLayerId,
      });
    }
  };

  useEffect(() => {
    drawPreview();
  });

  useEffect(() => {
    const handleResize = () => drawPreview();
    window.addEventListener('resize', handleResize);
    const observer = new ResizeObserver(() => drawPreview());
    if (stageRef.current) observer.observe(stageRef.current);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * project.composition.width;
    const cy = ((e.clientY - rect.top) / rect.height) * project.composition.height;

    const hit = project.layers.find((l) => {
      if (
        l.kind === 'audio' ||
        l.hidden ||
        l.locked ||
        playhead < l.startFrame ||
        playhead > l.endFrame
      ) {
        return false;
      }
      const lx = evalProp(l, 'x', playhead);
      const ly = evalProp(l, 'y', playhead);
      const w = (l.props.width || 400) * (evalProp(l, 'scaleX', playhead) / 100);
      const h = (l.props.height || 300) * (evalProp(l, 'scaleY', playhead) / 100);
      return Math.abs(cx - lx) <= w / 2 && Math.abs(cy - ly) <= h / 2;
    });

    if (!hit) return;
    onSelectLayer(hit.id);

    const startX = evalProp(hit, 'x', playhead);
    const startY = evalProp(hit, 'y', playhead);
    const originClientX = e.clientX;
    const originClientY = e.clientY;
    let pushed = false;

    const onMove = (mv: MouseEvent) => {
      const dx = ((mv.clientX - originClientX) / rect.width) * project.composition.width;
      const dy = ((mv.clientY - originClientY) / rect.height) * project.composition.height;
      const shouldPush = !pushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1);
      if (shouldPush) pushed = true;
      onMoveLayer(hit.id, Math.round(startX + dx), Math.round(startY + dy), shouldPush);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const selectVal =
    project.ui.zoomMode === 'manual' ? String(project.ui.zoomLevel) : project.ui.zoomMode;
  const comp = project.composition;

  return (
    <main className="col-start-3 row-start-2 flex flex-col min-w-0 overflow-hidden bg-[#0a0b0e]">
      <div className="h-[26px] bg-[var(--bg-panel)] border-b border-[var(--border)] flex items-center justify-between px-2 gap-1.5 shrink-0">
        <div className="flex items-center gap-1">
          <select
            className="studio-select"
            value={selectVal}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'fit' || v === 'fitW' || v === 'fitH') onZoomChange(v);
              else onZoomChange('manual', parseFloat(v));
            }}
            title="Preview Zoom"
          >
            <option value="fit">Fit Comp</option>
            <option value="fitW">Fit Width</option>
            <option value="fitH">Fit Height</option>
            <option value="0.25">25%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
          </select>
          <button
            className="studio-btn icon-btn"
            onClick={() =>
              onZoomChange('manual', clamp(project.ui.zoomLevel / 1.2, 0.1, 2))
            }
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            className="studio-btn icon-btn"
            onClick={() =>
              onZoomChange('manual', clamp(project.ui.zoomLevel * 1.2, 0.1, 2))
            }
            title="Zoom In"
            aria-label="Zoom In"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            className="studio-btn"
            onClick={() => onZoomChange('fit')}
            title="Center Composition"
          >
            Center
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            className={`studio-btn ${project.ui.showSafeArea ? 'active' : ''}`}
            onClick={() => onToggleOverlay('showSafeArea')}
            title="Social 9:16 Safe Area"
          >
            Safe
          </button>
          <button
            className={`studio-btn ${project.ui.showGrid ? 'active' : ''}`}
            onClick={() => onToggleOverlay('showGrid')}
            title="Composition Grid"
          >
            Grid
          </button>
          <button
            className={`studio-btn ${project.ui.showRulers ? 'active' : ''}`}
            onClick={() => onToggleOverlay('showRulers')}
            title="Rulers"
          >
            Rulers
          </button>
          <button
            className={`studio-btn ${project.ui.showChecker ? 'active' : ''}`}
            onClick={() => onToggleOverlay('showChecker')}
            title="Transparency Checkerboard"
          >
            Alpha
          </button>
          <button
            className="studio-btn icon-btn"
            onClick={() => stageRef.current?.requestFullscreen?.()}
            title="Fullscreen Preview"
            aria-label="Fullscreen Preview"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#090a0d]"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          className="shadow-[0_0_0_1px_#2f3542,0_8px_28px_rgba(0,0,0,0.65)] cursor-default"
        />
      </div>

      <div className="h-[22px] bg-[var(--bg-panel)] border-t border-[var(--border)] flex items-center justify-between px-2 text-[10px] text-[var(--text-soft)] shrink-0 tabular-nums">
        <span>
          {comp.name} · {comp.width}×{comp.height} · {comp.fps} fps ·{' '}
          {(comp.durationFrames / comp.fps).toFixed(1)}s
        </span>
        <span>3D Glassmorphism UI Compositor</span>
      </div>
    </main>
  );
};
