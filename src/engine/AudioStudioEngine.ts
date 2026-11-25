import type { MediaCacheEntry, ProjectState } from '../types/studio';
import { clamp } from '../utils/motionMath';

export class StudioAudioEngine {
  public ctx: AudioContext | null = null;
  private activeSources: AudioBufferSourceNode[] = [];

  public ensureCtx(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public synthesizeBuiltInBuffer(subkind: string, durationSec = 1.0): AudioBuffer | null {
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    const safeDur = Math.min(durationSec, 2.0);
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * safeDur));
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (subkind === 'sfx') {
        const env = Math.sin(Math.PI * Math.min(1, t / safeDur));
        data[i] =
          ((Math.random() * 2 - 1) * 0.2 +
            Math.sin(2 * Math.PI * (140 + 280 * (1 - t / safeDur)) * t) * 0.28) *
          env *
          0.4;
      } else {
        data[i] =
          (Math.sin(2 * Math.PI * 110 * t) +
            Math.sin(2 * Math.PI * 165 * t) * 0.5 +
            Math.sin(2 * Math.PI * 220 * t) * 0.25) *
          0.05;
      }
    }
    return buf;
  }

  public computePeaks(audioBuffer: AudioBuffer, bins = 80): number[] {
    const ch = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / bins));
    const peaks: number[] = [];
    const innerStep = Math.max(1, Math.floor(step / 8));
    for (let i = 0; i < bins; i++) {
      let max = 0;
      const start = i * step;
      for (let j = 0; j < step && start + j < ch.length; j += innerStep) {
        const v = Math.abs(ch[start + j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    return peaks;
  }

  public stopPlayback() {
    this.activeSources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // ignore
      }
    });
    this.activeSources = [];
  }

  public startPlaybackFromFrame(
    project: ProjectState,
    mediaCache: Map<string, MediaCacheEntry>,
    startFrame: number,
    destNode: AudioNode | null = null
  ) {
    this.stopPlayback();
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const fps = project.composition.fps;
    const currentTimeSec = startFrame / fps;
    const soloExists = project.layers.some((l) => l.solo && l.kind === 'audio');
    const hasVOAtFrame = project.layers.some(
      (l) =>
        l.type === 'voiceover' &&
        !l.muted &&
        startFrame >= l.startFrame &&
        startFrame <= l.endFrame
    );

    for (const layer of project.layers) {
      if (layer.kind !== 'audio' || layer.muted) continue;
      if (soloExists && !layer.solo) continue;
      if (layer.endFrame <= startFrame) continue;

      let media = layer.assetId ? mediaCache.get(layer.assetId) : undefined;
      const asset = project.assets.find((a) => a.id === layer.assetId);
      if (!media && asset && asset.source === 'Synthesized WebAudio') {
        const buf = this.synthesizeBuiltInBuffer(asset.subkind || 'sfx', asset.duration || 1);
        if (buf) {
          media = { audioBuffer: buf, peaks: this.computePeaks(buf) };
          mediaCache.set(asset.id, media);
        }
      }
      if (!media || !media.audioBuffer) continue;

      const src = ctx.createBufferSource();
      src.buffer = media.audioBuffer;
      src.playbackRate.value = layer.audio?.speed || 1;
      if (asset?.loop || layer.type === 'music') src.loop = true;

      const gain = ctx.createGain();
      let vol = (layer.audio?.volume ?? 100) / 100;
      if (layer.type === 'music' && hasVOAtFrame) vol *= 0.35;
      gain.gain.value = clamp(vol, 0, 2);
      src.connect(gain);
      gain.connect(destNode || ctx.destination);

      const layerStartSec = layer.startFrame / fps;
      const delay = Math.max(0, layerStartSec - currentTimeSec);
      const rawOffset =
        Math.max(0, currentTimeSec - layerStartSec) + (layer.audio?.trimOffsetSec || 0);
      const offset = src.loop ? rawOffset % media.audioBuffer.duration : rawOffset;
      const dur = Math.max(
        0.05,
        (layer.endFrame - Math.max(startFrame, layer.startFrame)) / fps
      );

      if (src.loop || offset < media.audioBuffer.duration) {
        src.start(
          ctx.currentTime + delay,
          offset,
          src.loop ? dur : Math.min(dur, media.audioBuffer.duration - offset)
        );
        this.activeSources.push(src);
      }
    }
  }
}

export const audioEngine = new StudioAudioEngine();
