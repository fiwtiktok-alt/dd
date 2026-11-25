import type { Keyframe, Layer } from '../types/studio';

export const uid = (p = 'id'): string => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const deepClone = <T>(obj: T): T => structuredClone(obj);

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export const easeInOutCubic = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export function frameToTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const f = Math.max(0, Math.round(frame));
  const ff = f % safeFps;
  const totalSec = Math.floor(f / safeFps);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export function frameToSrtTime(frame: number, fps: number): string {
  const msTotal = Math.round((frame / Math.max(1, fps)) * 1000);
  const ms = msTotal % 1000;
  const sec = Math.floor(msTotal / 1000) % 60;
  const min = Math.floor(msTotal / 60000) % 60;
  const hr = Math.floor(msTotal / 3600000);
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function cubicBezierY(t: number, cp1: [number, number], cp2: [number, number]): number {
  const cx = (u: number) =>
    3 * (1 - u) * (1 - u) * u * cp1[0] + 3 * (1 - u) * u * u * cp2[0] + u * u * u;
  const cy = (u: number) =>
    3 * (1 - u) * (1 - u) * u * cp1[1] + 3 * (1 - u) * u * u * cp2[1] + u * u * u;
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 14; i++) {
    u = (lo + hi) * 0.5;
    const x = cx(u);
    if (Math.abs(x - t) < 1e-4) break;
    if (x < t) lo = u;
    else hi = u;
  }
  return cy(u);
}

export function applyEasing(t: number, kf: Keyframe): number {
  const e = kf.easing || 'easeInOut';
  if (e === 'hold') return 0;
  if (e === 'linear') return t;
  if (e === 'easeIn') return cubicBezierY(t, [0.42, 0], [1, 1]);
  if (e === 'easeOut') return cubicBezierY(t, [0, 0], [0.58, 1]);
  if (e === 'easeInOut') return cubicBezierY(t, [0.42, 0], [0.58, 1]);
  if (e === 'bezier') return cubicBezierY(t, kf.cp1 || [0.42, 0], kf.cp2 || [0.58, 1]);
  return t;
}

export function evalProp(layer: Layer, prop: string, frame: number): number {
  const base = layer.props[prop] ?? 0;
  const kfs = layer.keyframes && layer.keyframes[prop];
  if (!kfs || kfs.length === 0) return base;
  if (frame <= kfs[0].frame) return kfs[0].value;
  if (frame >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      if (a.easing === 'hold' || b.frame === a.frame) return a.value;
      const t = clamp((frame - a.frame) / (b.frame - a.frame), 0, 1);
      return lerp(a.value, b.value, applyEasing(t, a));
    }
  }
  return base;
}
