import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CompositionConfig, StoryboardScene } from '../types/studio';
import type { ExportParams, ExportResult } from '../engine/ExportEngine';
import { clamp } from '../utils/motionMath';

/* -------------------- AI SCRIPT TO MOTION MODAL -------------------- */
interface AIModalProps {
  open: boolean;
  scriptText: string;
  storyboard: StoryboardScene[];
  statusLog: string;
  canAssemble: boolean;
  onChangeScript: (val: string) => void;
  onAnalyze: (wpm: number, style: 'sber3d' | 'apple3d') => void;
  onResearch: (wpm: number, style: 'sber3d' | 'apple3d') => void;
  onAssemble: () => void;
  onQuickVisualize: (wpm: number, style: 'sber3d' | 'apple3d') => void;
  onDownloadTemplate: () => void;
  onToggleApprove: (sceneId: string) => void;
  onExtendDuration: (sceneId: string) => void;
  onClose: () => void;
}

export const AIModal: React.FC<AIModalProps> = ({
  open,
  scriptText,
  storyboard,
  statusLog,
  canAssemble,
  onChangeScript,
  onAnalyze,
  onResearch,
  onAssemble,
  onQuickVisualize,
  onDownloadTemplate,
  onToggleApprove,
  onExtendDuration,
  onClose,
}) => {
  const [style, setStyle] = useState<'sber3d' | 'apple3d'>('sber3d');
  const [wpm, setWpm] = useState(130);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3.5">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-[5px] w-[min(980px,96vw)] max-h-[90vh] flex flex-col shadow-2xl">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between font-semibold">
          <span>AI MOTION GRAPHICS DIRECTOR — SCRIPT TO CINEMATIC VISUAL</span>
          <button className="studio-btn icon-btn" onClick={onClose} aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_270px] gap-2.5 items-start">
            <div>
              <label className="text-[10.5px] text-[var(--text-soft)] block mb-1">
                Paste Complete Narration Script
              </label>
              <textarea
                className="studio-textarea w-full p-2 leading-relaxed resize-y"
                rows={7}
                value={scriptText}
                onChange={(e) => onChangeScript(e.target.value)}
              />
            </div>

            <div className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-[4px] p-2 flex flex-col gap-1.5">
              <div className="font-semibold text-[11px]">Production Pipeline</div>
              <label className="text-[10.5px] text-[var(--text-soft)]">
                Visual Animation Style
                <select
                  className="studio-select w-full mt-0.5"
                  value={style}
                  onChange={(e) => setStyle(e.target.value as 'sber3d' | 'apple3d')}
                >
                  <option value="sber3d">3D Glass UI &amp; Pop-Out Cards (Sber Style)</option>
                  <option value="apple3d">Dark Studio 3D Objects (Apple Style)</option>
                </select>
              </label>
              <label className="text-[10.5px] text-[var(--text-soft)]">
                Narration Pace (WPM)
                <input
                  className="studio-input w-full mt-0.5"
                  type="number"
                  min={90}
                  max={200}
                  value={wpm}
                  onChange={(e) => setWpm(clamp(+e.target.value || 130, 90, 200))}
                />
              </label>
              <button
                className="studio-btn primary justify-center font-semibold"
                onClick={() => onQuickVisualize(wpm, style)}
              >
                1-Click Visualize Narration
              </button>
              <button className="studio-btn justify-center" onClick={() => onAnalyze(wpm, style)}>
                1. Analyze Script &amp; Storyboard
              </button>
              <button className="studio-btn justify-center" onClick={() => onResearch(wpm, style)}>
                2. Research Real Visual Assets
              </button>
              <button
                className="studio-btn justify-center"
                disabled={!canAssemble}
                onClick={onAssemble}
              >
                3. Assemble 10-Track Timeline
              </button>
              <button className="studio-btn justify-center" onClick={onDownloadTemplate}>
                Save Template (.json)
              </button>
              <div className="text-[10px] text-[var(--text-soft)] leading-snug">{statusLog}</div>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2 mt-2.5">
            {storyboard.map((sc, idx) => (
              <div
                key={sc.id}
                className={`bg-[var(--bg-elev)] border rounded-[4px] p-2 flex flex-col gap-1 ${
                  sc.approved ? 'border-[var(--ok)]' : 'border-[var(--border)]'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="tabular-nums">
                    Scene {idx + 1} · {sc.durationSec}s
                  </span>
                  <span
                    className={`text-[9.5px] px-1.5 py-0.5 rounded-[3px] ${
                      sc.approved
                        ? 'bg-emerald-500/20 text-[var(--ok)]'
                        : 'bg-[#262b36] text-[var(--text-soft)]'
                    }`}
                  >
                    {sc.approved ? 'LOCKED' : sc.model.toUpperCase()}
                  </span>
                </div>
                <div className="text-[10.5px]">"{sc.narration}"</div>
                <div className="text-[10px] text-[var(--text-soft)]">
                  <strong>Choreography:</strong> {sc.note}
                </div>
                <div className="text-[10px] text-[var(--text-dim)]">{sc.retrievalStatus}</div>
                <div className="flex gap-1 mt-1">
                  <button
                    className={`studio-btn ${sc.approved ? 'active' : 'primary'}`}
                    onClick={() => onToggleApprove(sc.id)}
                  >
                    {sc.approved ? 'Unlock' : 'Approve'}
                  </button>
                  <button className="studio-btn" onClick={() => onExtendDuration(sc.id)}>
                    +1s
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-3 py-2 border-t border-[var(--border)] flex justify-end">
          <button className="studio-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------- COMPOSITION SETTINGS MODAL -------------------- */
interface CompModalProps {
  open: boolean;
  composition: CompositionConfig;
  onApply: (
    next: CompositionConfig,
    adaptPolicy: 'keep' | 'scaleFit' | 'cropFill' | 'manual'
  ) => void;
  onClose: () => void;
}

export const CompModal: React.FC<CompModalProps> = ({ open, composition, onApply, onClose }) => {
  const [name, setName] = useState(composition.name);
  const [preset, setPreset] = useState(composition.preset || 'custom');
  const [w, setW] = useState(composition.width);
  const [h, setH] = useState(composition.height);
  const [fps, setFps] = useState(composition.fps);
  const [durSec, setDurSec] = useState(Math.round(composition.durationFrames / composition.fps));
  const [bgColor, setBgColor] = useState(composition.bgColor);
  const [adapt, setAdapt] = useState<'keep' | 'scaleFit' | 'cropFill' | 'manual'>('keep');

  useEffect(() => {
    if (open) {
      setName(composition.name);
      setPreset(composition.preset || 'custom');
      setW(composition.width);
      setH(composition.height);
      setFps(composition.fps);
      setDurSec(Math.round(composition.durationFrames / composition.fps));
      setBgColor(composition.bgColor);
    }
  }, [open, composition]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3.5">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-[5px] w-[min(560px,95vw)] flex flex-col shadow-2xl">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between font-semibold">
          <span>Composition Settings</span>
          <button className="studio-btn icon-btn" onClick={onClose} aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 grid grid-cols-[110px_1fr] gap-2 items-center">
          <span className="text-[10.5px] text-[var(--text-soft)]">Comp Name</span>
          <input className="studio-input" value={name} onChange={(e) => setName(e.target.value)} />

          <span className="text-[10.5px] text-[var(--text-soft)]">Preset</span>
          <select
            className="studio-select"
            value={preset}
            onChange={(e) => {
              const v = e.target.value;
              setPreset(v);
              if (v !== 'custom') {
                const [pw, ph] = v.split('x').map(Number);
                setW(pw);
                setH(ph);
              }
            }}
          >
            <option value="1080x1920">Portrait 1080×1920 (TikTok / Reels / Shorts)</option>
            <option value="1440x2560">Portrait 1440×2560 (2K 9:16)</option>
            <option value="2160x3840">Portrait 2160×3840 (4K 9:16)</option>
            <option value="1920x1080">Landscape 1920×1080 (YouTube HD)</option>
            <option value="2560x1440">Landscape 2560×1440 (2K 16:9)</option>
            <option value="3840x2160">Landscape 3840×2160 (4K 16:9)</option>
            <option value="1080x1080">Square 1080×1080 (Instagram Feed)</option>
            <option value="custom">Custom Resolution</option>
          </select>

          <span className="text-[10.5px] text-[var(--text-soft)]">Width × Height</span>
          <div className="flex items-center gap-1.5">
            <input
              className="studio-input w-[72px]"
              type="number"
              min={120}
              max={3840}
              value={w}
              onChange={(e) => setW(+e.target.value)}
            />
            <span>×</span>
            <input
              className="studio-input w-[72px]"
              type="number"
              min={120}
              max={3840}
              value={h}
              onChange={(e) => setH(+e.target.value)}
            />
          </div>

          <span className="text-[10.5px] text-[var(--text-soft)]">FPS</span>
          <input
            className="studio-input w-[72px]"
            type="number"
            min={12}
            max={120}
            value={fps}
            onChange={(e) => setFps(+e.target.value)}
          />

          <span className="text-[10.5px] text-[var(--text-soft)]">Duration (sec)</span>
          <input
            className="studio-input w-[72px]"
            type="number"
            min={1}
            max={600}
            value={durSec}
            onChange={(e) => setDurSec(+e.target.value)}
          />

          <span className="text-[10.5px] text-[var(--text-soft)]">Background</span>
          <input
            type="color"
            className="h-[22px] w-[54px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[3px]"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
          />

          <span className="text-[10.5px] text-[var(--text-soft)]">Resize Policy</span>
          <select
            className="studio-select"
            value={adapt}
            onChange={(e) =>
              setAdapt(e.target.value as 'keep' | 'scaleFit' | 'cropFill' | 'manual')
            }
          >
            <option value="keep">Keep original layout (no stretch)</option>
            <option value="scaleFit">Scale proportionally to fit</option>
            <option value="cropFill">Scale proportionally to fill</option>
            <option value="manual">Reposition manually later</option>
          </select>
        </div>

        <div className="px-3 py-2 border-t border-[var(--border)] flex justify-end gap-1.5">
          <button className="studio-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="studio-btn primary"
            onClick={() => {
              const nw = clamp(w, 120, 3840);
              const nh = clamp(h, 120, 3840);
              const nfps = clamp(fps, 12, 120);
              const ndur = clamp(durSec, 1, 600);
              onApply(
                {
                  name,
                  preset,
                  width: nw,
                  height: nh,
                  fps: nfps,
                  durationFrames: Math.round(ndur * nfps),
                  bgColor,
                },
                adapt
              );
            }}
          >
            Apply Composition
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------- EXPORT & SAVE VIDEO MODAL -------------------- */
interface ExportModalProps {
  open: boolean;
  exporting: boolean;
  progressPct: number;
  progressText: string;
  result: ExportResult | null;
  playhead: number;
  onStartExport: (params: ExportParams) => void;
  onCancelOrClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  exporting,
  progressPct,
  progressText,
  result,
  playhead,
  onStartExport,
  onCancelOrClose,
}) => {
  const [format, setFormat] = useState<ExportParams['format']>('webm');
  const [scale, setScale] = useState(0.6667);
  const [fps, setFps] = useState(30);
  const [bitrateMbps, setBitrateMbps] = useState(6);
  const [subMode, setSubMode] = useState<ExportParams['subMode']>('burn');
  const [rangeMode, setRangeMode] = useState<ExportParams['rangeMode']>('highlight');
  const [transparentBg, setTransparentBg] = useState(false);

  if (!open) return null;

  const mp4Ok =
    typeof MediaRecorder !== 'undefined' &&
    (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2') ||
      MediaRecorder.isTypeSupported('video/mp4'));

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3.5">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-[5px] w-[min(560px,95vw)] max-h-[90vh] flex flex-col shadow-2xl">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between font-semibold">
          <span>Render &amp; Save Video</span>
          <button className="studio-btn icon-btn" onClick={onCancelOrClose} aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-[110px_1fr] gap-2 items-center">
            <span className="text-[10.5px] text-[var(--text-soft)]">Format</span>
            <select
              className="studio-select"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportParams['format'])}
            >
              <option value="webm">WebM Video (Universal Browser Video + Audio)</option>
              <option value="mp4">MP4 Video (If Browser H.264 Supported)</option>
              <option value="png">PNG Current Frame</option>
              <option value="pngseq">PNG Image Sequence</option>
              <option value="wav">Audio-Only Mixdown (.WAV)</option>
              <option value="srt">Subtitles Only (.SRT)</option>
            </select>

            <span className="text-[10.5px] text-[var(--text-soft)]">Resolution</span>
            <select
              className="studio-select"
              value={String(scale)}
              onChange={(e) => setScale(parseFloat(e.target.value))}
            >
              <option value="0.6667">720p Portrait (720×1280 — Smooth &amp; Fast)</option>
              <option value="1">1080p Native (1080×1920)</option>
              <option value="1.3333">1440p Scaled</option>
              <option value="2">4K / 2× Scaled</option>
            </select>

            <span className="text-[10.5px] text-[var(--text-soft)]">Frame Rate</span>
            <select
              className="studio-select"
              value={String(fps)}
              onChange={(e) => setFps(parseInt(e.target.value, 10))}
            >
              <option value="30">30 FPS</option>
              <option value="24">24 FPS</option>
              <option value="25">25 FPS</option>
              <option value="60">60 FPS</option>
            </select>

            <span className="text-[10.5px] text-[var(--text-soft)]">Bitrate (Mbps)</span>
            <input
              className="studio-input w-[72px]"
              type="number"
              min={1}
              max={35}
              value={bitrateMbps}
              onChange={(e) => setBitrateMbps(parseInt(e.target.value, 10) || 6)}
            />

            <span className="text-[10.5px] text-[var(--text-soft)]">Subtitles</span>
            <select
              className="studio-select"
              value={subMode}
              onChange={(e) => setSubMode(e.target.value as ExportParams['subMode'])}
            >
              <option value="burn">Burn Subtitles into Video</option>
              <option value="none">Export Video Without Subtitles</option>
              <option value="burnAndSrt">Burn + Download .SRT Separately</option>
            </select>

            <span className="text-[10.5px] text-[var(--text-soft)]">Render Range</span>
            <select
              className="studio-select"
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value as ExportParams['rangeMode'])}
            >
              <option value="highlight">Fast Highlight (First 12 Seconds — Quick Test)</option>
              <option value="content">Full Used Timeline (All 6 Scenes)</option>
              <option value="full">Full Composition Duration</option>
            </select>

            <span className="text-[10.5px] text-[var(--text-soft)]">Alpha</span>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={(e) => setTransparentBg(e.target.checked)}
              />
              Transparent BG (PNG/WebM)
            </label>
          </div>

          <div className="text-[10px] text-[var(--text-soft)] mt-2.5 p-1.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-[3px]">
            {mp4Ok
              ? 'Browser check: WebM and MP4 MediaRecorder supported. Video preview & direct Save link will appear below after render.'
              : 'Browser check: WebM (VP8/VP9) supported natively for video export. Video preview & direct Save link will appear below after render.'}
          </div>

          <div className="mt-2.5">
            <div className="h-[8px] bg-[#0c0d10] border border-[var(--border)] rounded-[4px] overflow-hidden">
              <div
                style={{ width: `${progressPct}%` }}
                className="h-full bg-[var(--accent)] transition-[width] duration-100"
              />
            </div>
            <div className="text-[10.5px] text-[var(--text-soft)] mt-1 tabular-nums">
              {progressText}
            </div>
          </div>

          {result && (
            <div className="mt-2.5 p-2 bg-[#10141c] border border-[var(--ok)] rounded-[4px]">
              <div className="font-semibold text-[var(--ok)] mb-1.5">
                Render Ready — Preview &amp; Save:
              </div>
              {result.isVideo && (
                <video
                  src={result.url}
                  controls
                  playsInline
                  className="w-full max-h-[220px] bg-black rounded-[3px] mb-2"
                />
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <a className="studio-btn ok-btn" href={result.url} download={result.filename}>
                  Save {result.filename} (
                  {result.sizeBytes / (1024 * 1024) >= 0.1
                    ? `${(result.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                    : `${Math.round(result.sizeBytes / 1024)} KB`}
                  )
                </a>
                <span className="text-[10px] text-[var(--text-soft)]">
                  If sandbox blocks auto-download, right-click the video above and choose Save video as.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-t border-[var(--border)] flex justify-end gap-1.5">
          <button className="studio-btn" onClick={onCancelOrClose}>
            Close / Cancel
          </button>
          <button
            className="studio-btn primary"
            disabled={exporting}
            onClick={() =>
              onStartExport({
                format,
                scale,
                fps,
                bitrateMbps,
                subMode,
                rangeMode,
                transparentBg,
                playhead,
              })
            }
          >
            Start Real Render
          </button>
        </div>
      </div>
    </div>
  );
};
