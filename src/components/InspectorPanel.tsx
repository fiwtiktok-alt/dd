import React, { useState } from 'react';
import type { Layer, ProjectState, QCIssue, ThreeModelId } from '../types/studio';
import { clamp, evalProp } from '../utils/motionMath';
import { runQC } from '../engine/AIDirector';

interface InspectorPanelProps {
  project: ProjectState;
  playhead: number;
  selectedLayer: Layer | null;
  onSelectTab: (tab: 'layer' | 'qc' | 'ai') => void;
  onUpdateLayer: (layerId: string, updater: (layer: Layer) => Layer, pushHistory?: boolean) => void;
  onToggleKeyframe: (layerId: string, prop: string) => void;
  onImportAudio: () => void;
  onApplyNaturalEdit: (prompt: string) => string;
}

const TRANSFORM_FIELDS: Array<{ label: string; prop: string; step: number }> = [
  { label: 'Pos X', prop: 'x', step: 1 },
  { label: 'Pos Y', prop: 'y', step: 1 },
  { label: 'Scale X %', prop: 'scaleX', step: 1 },
  { label: 'Scale Y %', prop: 'scaleY', step: 1 },
  { label: 'Rotation °', prop: 'rotation', step: 1 },
  { label: 'Opacity %', prop: 'opacity', step: 1 },
  { label: 'Blur px', prop: 'blur', step: 1 },
  { label: 'Glow px', prop: 'glow', step: 1 },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  playhead,
  selectedLayer,
  onSelectTab,
  onUpdateLayer,
  onToggleKeyframe,
  onImportAudio,
  onApplyNaturalEdit,
}) => {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [, setQcRefreshTick] = useState(0);

  const tab = project.ui.inspectorTab;
  const qcIssues: QCIssue[] = tab === 'qc' ? runQC(project) : [];

  return (
    <aside className="col-start-5 row-start-2 flex flex-col min-w-0 overflow-hidden bg-[var(--bg-panel)] border-l border-[var(--border)]">
      <div className="h-[26px] flex items-center justify-between px-2 border-b border-[var(--border)] bg-[#171920] shrink-0">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-soft)]">
          Inspector
        </span>
        <div className="flex items-center gap-0.5">
          {(['layer', 'qc', 'ai'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onSelectTab(t)}
              className={`h-[20px] px-1.5 text-[10px] rounded-[3px] border cursor-pointer ${
                tab === t
                  ? 'bg-[var(--bg-elev)] border-[var(--border)] text-[var(--text)]'
                  : 'bg-transparent border-transparent text-[var(--text-soft)]'
              }`}
            >
              {t === 'layer' ? 'Layer' : t === 'qc' ? 'QC' : 'AI Edit'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5">
        {tab === 'qc' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <strong className="text-[11px]">Quality Control</strong>
              <button className="studio-btn" onClick={() => setQcRefreshTick((v) => v + 1)}>
                Re-scan
              </button>
            </div>
            {qcIssues.map((it) => (
              <div
                key={it.id}
                className="border border-[var(--border)] rounded-[3px] mb-1.5 bg-[#171920] p-2"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`text-[9.5px] px-1.5 py-0.5 rounded-[3px] font-semibold ${
                      it.level === 'ok'
                        ? 'bg-emerald-500/20 text-[var(--ok)]'
                        : 'bg-amber-500/20 text-[var(--warn)]'
                    }`}
                  >
                    {it.level.toUpperCase()}
                  </span>
                  <span className="flex-1 text-[10.5px]">{it.msg}</span>
                  {it.fixLabel && it.actionType === 'importAudio' && (
                    <button className="studio-btn primary h-[20px]" onClick={onImportAudio}>
                      {it.fixLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'ai' && (
          <div className="border border-[var(--border)] rounded-[3px] bg-[#171920] p-2">
            <div className="font-semibold mb-1.5">AI Editing Assistant</div>
            <textarea
              className="studio-textarea w-full"
              rows={3}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Hide all subtitles, Mute text, Make 3D smaller, Increase duration"
            />
            <div className="flex gap-1 mt-1.5">
              <button
                className="studio-btn primary flex-1 justify-center"
                onClick={() => setAiReply(onApplyNaturalEdit(aiPrompt))}
              >
                Apply AI Edit
              </button>
            </div>
            {aiReply && <div className="mt-1.5 text-[10.5px] text-[#7cb3ff]">{aiReply}</div>}
          </div>
        )}

        {tab === 'layer' && !selectedLayer && (
          <div className="text-[var(--text-dim)] p-4 text-center">
            Select a layer in the timeline or preview.
          </div>
        )}

        {tab === 'layer' && selectedLayer && (
          <>
            <div className="border border-[var(--border)] rounded-[3px] mb-1.5 bg-[#171920]">
              <div className="px-2 py-1 text-[10.5px] font-semibold text-[var(--text-soft)] border-b border-[var(--border)] flex items-center justify-between gap-1">
                <span className="truncate">Layer: {selectedLayer.name}</span>
                <span className="text-[9.5px] px-1.5 py-0.5 rounded-[3px] bg-[#262b36] uppercase">
                  {selectedLayer.type}
                </span>
              </div>
              <div className="p-1.5 grid grid-cols-[88px_1fr] gap-1.5 items-center">
                <span className="text-[10.5px] text-[var(--text-soft)]">Start / End (f)</span>
                <div className="flex items-center gap-1">
                  <input
                    className="studio-input w-[64px]"
                    type="number"
                    value={selectedLayer.startFrame}
                    onChange={(e) => {
                      const val = clamp(+e.target.value, 0, selectedLayer.endFrame - 1);
                      onUpdateLayer(selectedLayer.id, (l) => ({ ...l, startFrame: val }), true);
                    }}
                  />
                  <span>–</span>
                  <input
                    className="studio-input w-[64px]"
                    type="number"
                    value={selectedLayer.endFrame}
                    onChange={(e) => {
                      const val = clamp(
                        +e.target.value,
                        selectedLayer.startFrame + 1,
                        project.composition.durationFrames - 1
                      );
                      onUpdateLayer(selectedLayer.id, (l) => ({ ...l, endFrame: val }), true);
                    }}
                  />
                </div>
              </div>
            </div>

            {selectedLayer.kind === 'audio' ? (
              <div className="border border-[var(--border)] rounded-[3px] mb-1.5 bg-[#171920]">
                <div className="px-2 py-1 text-[10.5px] font-semibold text-[var(--text-soft)] border-b border-[var(--border)]">
                  Audio Controls
                </div>
                <div className="p-1.5 grid grid-cols-[88px_1fr] gap-1.5 items-center">
                  <span className="text-[10.5px] text-[var(--text-soft)]">Volume (%)</span>
                  <input
                    className="studio-input w-[72px]"
                    type="number"
                    min={0}
                    max={200}
                    value={selectedLayer.audio?.volume ?? 100}
                    onChange={(e) =>
                      onUpdateLayer(
                        selectedLayer.id,
                        (l) => ({
                          ...l,
                          audio: {
                            volume: +e.target.value,
                            fadeIn: l.audio?.fadeIn ?? 0,
                            fadeOut: l.audio?.fadeOut ?? 0,
                            speed: l.audio?.speed ?? 1,
                            trimOffsetSec: l.audio?.trimOffsetSec ?? 0,
                          },
                        }),
                        true
                      )
                    }
                  />
                  <span className="text-[10.5px] text-[var(--text-soft)]">Speed</span>
                  <input
                    className="studio-input w-[72px]"
                    type="number"
                    step={0.1}
                    min={0.5}
                    max={2}
                    value={selectedLayer.audio?.speed ?? 1}
                    onChange={(e) =>
                      onUpdateLayer(
                        selectedLayer.id,
                        (l) => ({
                          ...l,
                          audio: {
                            volume: l.audio?.volume ?? 100,
                            fadeIn: l.audio?.fadeIn ?? 0,
                            fadeOut: l.audio?.fadeOut ?? 0,
                            speed: +e.target.value,
                            trimOffsetSec: l.audio?.trimOffsetSec ?? 0,
                          },
                        }),
                        true
                      )
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="border border-[var(--border)] rounded-[3px] mb-1.5 bg-[#171920]">
                <div className="px-2 py-1 text-[10.5px] font-semibold text-[var(--text-soft)] border-b border-[var(--border)]">
                  Transform (Diamond = Keyframe)
                </div>
                <div className="p-1.5 grid grid-cols-[94px_1fr] gap-1.5 items-center">
                  {TRANSFORM_FIELDS.map(({ label, prop, step }) => {
                    const kfs = selectedLayer.keyframes?.[prop] || [];
                    const atKf = kfs.some((k) => k.frame === playhead);
                    const val = Math.round(evalProp(selectedLayer, prop, playhead) * 100) / 100;
                    return (
                      <React.Fragment key={prop}>
                        <span className="text-[10.5px] text-[var(--text-soft)] flex items-center gap-1.5">
                          <span
                            className={`kf-dot ${kfs.length ? 'has-kf' : ''} ${atKf ? 'at-kf' : ''}`}
                            onClick={() => onToggleKeyframe(selectedLayer.id, prop)}
                            title="Toggle Keyframe"
                          />
                          {label}
                        </span>
                        <input
                          className="studio-input w-[84px]"
                          type="number"
                          step={step}
                          value={val}
                          onChange={(e) => {
                            const v = +e.target.value;
                            onUpdateLayer(
                              selectedLayer.id,
                              (l) => {
                                const list = l.keyframes?.[prop] ? [...l.keyframes[prop]] : [];
                                const kfIdx = list.findIndex((k) => k.frame === playhead);
                                if (kfIdx >= 0) {
                                  list[kfIdx] = { ...list[kfIdx], value: v };
                                  return {
                                    ...l,
                                    keyframes: { ...l.keyframes, [prop]: list },
                                  };
                                }
                                return { ...l, props: { ...l.props, [prop]: v } };
                              },
                              true
                            );
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {(selectedLayer.type === 'text' || selectedLayer.type === 'subtitle') &&
              selectedLayer.text && (
                <div className="border border-[var(--border)] rounded-[3px] mb-1.5 bg-[#171920]">
                  <div className="px-2 py-1 text-[10.5px] font-semibold text-[var(--text-soft)] border-b border-[var(--border)]">
                    {selectedLayer.type === 'subtitle' ? 'Subtitle' : 'Text'} Properties
                  </div>
                  <div className="p-1.5 grid grid-cols-[88px_1fr] gap-1.5 items-center">
                    <span className="text-[10.5px] text-[var(--text-soft)]">Content</span>
                    <textarea
                      className="studio-textarea w-full"
                      rows={2}
                      value={selectedLayer.text.content}
                      onChange={(e) => {
                        const txt = e.target.value;
                        onUpdateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          text: l.text ? { ...l.text, content: txt } : undefined,
                        }));
                      }}
                    />
                    <span className="text-[10.5px] text-[var(--text-soft)]">Font Size</span>
                    <input
                      className="studio-input w-[72px]"
                      type="number"
                      min={12}
                      max={220}
                      value={selectedLayer.text.fontSize}
                      onChange={(e) => {
                        const fs = +e.target.value;
                        onUpdateLayer(
                          selectedLayer.id,
                          (l) => ({
                            ...l,
                            text: l.text ? { ...l.text, fontSize: fs } : undefined,
                          }),
                          true
                        );
                      }}
                    />
                    <span className="text-[10.5px] text-[var(--text-soft)]">Color</span>
                    <input
                      type="color"
                      className="h-[22px] w-[54px] bg-[var(--bg-input)] border border-[var(--border)] rounded-[3px]"
                      value={selectedLayer.text.color}
                      onChange={(e) => {
                        const col = e.target.value;
                        onUpdateLayer(selectedLayer.id, (l) => ({
                          ...l,
                          text: l.text ? { ...l.text, color: col } : undefined,
                        }));
                      }}
                    />
                    <span className="text-[10.5px] text-[var(--text-soft)]">Align</span>
                    <select
                      className="studio-select"
                      value={selectedLayer.text.align || 'center'}
                      onChange={(e) => {
                        const align = e.target.value as CanvasTextAlign;
                        onUpdateLayer(
                          selectedLayer.id,
                          (l) => ({
                            ...l,
                            text: l.text ? { ...l.text, align } : undefined,
                          }),
                          true
                        );
                      }}
                    >
                      <option value="center">Center</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
              )}

            {selectedLayer.type === '3d' && selectedLayer.three && (
              <div className="border border-[var(--border)] rounded-[3px] mb-1.5 bg-[#171920]">
                <div className="px-2 py-1 text-[10.5px] font-semibold text-[var(--text-soft)] border-b border-[var(--border)]">
                  3D Glass UI &amp; Object
                </div>
                <div className="p-1.5 grid grid-cols-[88px_1fr] gap-1.5 items-center">
                  <span className="text-[10.5px] text-[var(--text-soft)]">3D Scene</span>
                  <select
                    className="studio-select"
                    value={selectedLayer.three.model}
                    onChange={(e) => {
                      const model = e.target.value as ThreeModelId;
                      onUpdateLayer(
                        selectedLayer.id,
                        (l) => ({
                          ...l,
                          three: l.three ? { ...l.three, model } : undefined,
                        }),
                        true
                      );
                    }}
                  >
                    <option value="glass_icon">00:00 Glass Icon Burst</option>
                    <option value="phone_pop">00:01-02 Phone + Pop-Out Card</option>
                    <option value="phone_orb">00:03-05 Phone + Glass Orb Swipe</option>
                    <option value="stack_cards">00:06-08 Stacked 3D Parallax Cards</option>
                    <option value="orb_tap">00:09-11 UI List + Orb Tap</option>
                    <option value="phone_hero">00:12 Hero Phone Spin-Land</option>
                    <option value="bitcoin">3D Bitcoin Coin</option>
                    <option value="globe">3D Trade Globe</option>
                    <option value="chart">3D Market Bars</option>
                    <option value="pillars">3D Economic Pillars</option>
                    <option value="scale">3D Balance Scale</option>
                  </select>
                  <span className="text-[10.5px] text-[var(--text-soft)]">Rot Y</span>
                  <input
                    className="studio-input w-[72px]"
                    type="number"
                    step={0.1}
                    value={Math.round(evalProp(selectedLayer, 'rotY', playhead) * 100) / 100}
                    onChange={(e) => {
                      const rotY = +e.target.value;
                      onUpdateLayer(
                        selectedLayer.id,
                        (l) => ({ ...l, props: { ...l.props, rotY } }),
                        true
                      );
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
