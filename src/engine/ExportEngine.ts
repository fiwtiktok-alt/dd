import type { MediaCacheEntry, ProjectState } from '../types/studio';
import { clamp, frameToSrtTime } from '../utils/motionMath';
import { audioEngine } from './AudioStudioEngine';
import { renderCompositionFrame } from './Compositor';

export function buildSrtString(project: ProjectState): string {
  const fps = project.composition.fps;
  return project.layers
    .filter((l) => l.type === 'subtitle' && !l.hidden)
    .sort((a, b) => a.startFrame - b.startFrame)
    .map(
      (s, i) =>
        `${i + 1}\n${frameToSrtTime(s.startFrame, fps)} --> ${frameToSrtTime(s.endFrame, fps)}\n${
          s.text?.content || ''
        }\n`
    )
    .join('\n');
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  let pos = 0;
  const set16 = (d: number) => {
    view.setUint16(pos, d, true);
    pos += 2;
  };
  const set32 = (d: number) => {
    view.setUint32(pos, d, true);
    pos += 4;
  };
  set32(0x46464952);
  set32(length - 8);
  set32(0x45564157);
  set32(0x20746d66);
  set32(16);
  set16(1);
  set16(numOfChan);
  set32(buffer.sampleRate);
  set32(buffer.sampleRate * 2 * numOfChan);
  set16(numOfChan * 2);
  set16(16);
  set32(0x61746164);
  set32(length - pos - 4);
  const ch: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) ch.push(buffer.getChannelData(i));
  let offset = 0;
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      const s = clamp(ch[i][offset] || 0, -1, 1);
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([out], { type: 'audio/wav' });
}

export interface ExportParams {
  format: 'webm' | 'mp4' | 'png' | 'pngseq' | 'wav' | 'srt';
  scale: number;
  fps: number;
  bitrateMbps: number;
  subMode: 'burn' | 'none' | 'burnAndSrt';
  rangeMode: 'highlight' | 'content' | 'full';
  transparentBg: boolean;
  playhead: number;
}

export interface ExportResult {
  url: string;
  filename: string;
  sizeBytes: number;
  isVideo: boolean;
  summary: string;
}

export async function runRealExport(
  project: ProjectState,
  mediaCache: Map<string, MediaCacheEntry>,
  params: ExportParams,
  shouldCancel: () => boolean,
  onProgress: (pct: number, text: string) => void
): Promise<ExportResult> {
  const comp = project.composition;
  const w = Math.round(comp.width * params.scale);
  const h = Math.round(comp.height * params.scale);
  const maxUsedFrame = project.layers.length
    ? Math.max(...project.layers.map((l) => l.endFrame))
    : comp.durationFrames - 1;
  const totalFrames =
    params.rangeMode === 'highlight'
      ? Math.min(comp.durationFrames, params.fps * 12)
      : params.rangeMode === 'content'
      ? maxUsedFrame + 1
      : comp.durationFrames;

  const safeName = (project.name || 'voya_render').replace(/[^a-z0-9_-]/gi, '_');

  const triggerDownload = (url: string, filename: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // manual save link remains available in UI
    }
  };

  if (params.format === 'srt') {
    const srt = buildSrtString(project);
    if (!srt.trim()) throw new Error('No subtitle layers exist.');
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `${safeName}.srt`;
    triggerDownload(url, filename);
    onProgress(100, `Exported SRT (${blob.size} bytes).`);
    return { url, filename, sizeBytes: blob.size, isVideo: false, summary: `Exported ${filename}` };
  }

  if (params.format === 'png') {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    octx.scale(params.scale, params.scale);
    renderCompositionFrame(octx, project, mediaCache, comp.width, comp.height, params.playhead, {
      isExport: true,
      subMode: params.subMode,
      transparentBg: params.transparentBg,
    });
    const blob = await new Promise<Blob | null>((res) => off.toBlob(res, 'image/png'));
    if (!blob || blob.size === 0) throw new Error('PNG encoding failed.');
    const url = URL.createObjectURL(blob);
    const filename = `${safeName}_f${params.playhead}.png`;
    triggerDownload(url, filename);
    onProgress(100, `PNG exported (${Math.round(blob.size / 1024)} KB).`);
    return { url, filename, sizeBytes: blob.size, isVideo: false, summary: `Exported ${filename}` };
  }

  if (params.format === 'wav') {
    const ctx = audioEngine.ensureCtx();
    if (!ctx) throw new Error('Web Audio API unavailable.');
    const durSec = totalFrames / params.fps;
    const offCtx = new OfflineAudioContext(
      1,
      Math.max(1, Math.floor(ctx.sampleRate * durSec)),
      ctx.sampleRate
    );
    for (const l of project.layers) {
      if (l.kind !== 'audio' || l.muted) continue;
      let m = l.assetId ? mediaCache.get(l.assetId) : undefined;
      const ast = project.assets.find((a) => a.id === l.assetId);
      if (!m && ast?.source === 'Synthesized WebAudio') {
        const buf = audioEngine.synthesizeBuiltInBuffer(ast.subkind || 'sfx', ast.duration || 1);
        if (buf) m = { audioBuffer: buf };
      }
      if (!m?.audioBuffer) continue;
      const s = offCtx.createBufferSource();
      s.buffer = m.audioBuffer;
      if (ast?.loop || l.type === 'music') s.loop = true;
      const g = offCtx.createGain();
      g.gain.value = (l.audio?.volume ?? 100) / 100;
      s.connect(g);
      g.connect(offCtx.destination);
      s.start(l.startFrame / params.fps, l.audio?.trimOffsetSec || 0, (l.endFrame - l.startFrame) / params.fps);
    }
    const wav = audioBufferToWavBlob(await offCtx.startRendering());
    const url = URL.createObjectURL(wav);
    const filename = `${safeName}.wav`;
    triggerDownload(url, filename);
    onProgress(100, `WAV exported (${Math.round(wav.size / 1024)} KB).`);
    return { url, filename, sizeBytes: wav.size, isVideo: false, summary: `Exported ${filename}` };
  }

  if (params.format === 'pngseq') {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    const step = Math.max(1, Math.floor(totalFrames / 12));
    let lastBlob: Blob | null = null;
    let lastUrl = '';
    let lastName = `${safeName}_seq.png`;
    let count = 0;

    for (let f = 0; f < totalFrames; f += step) {
      if (shouldCancel()) throw new Error('Export cancelled.');
      octx.setTransform(params.scale, 0, 0, params.scale, 0, 0);
      renderCompositionFrame(octx, project, mediaCache, comp.width, comp.height, f, {
        isExport: true,
        subMode: params.subMode,
        transparentBg: params.transparentBg,
      });
      lastBlob = await new Promise<Blob | null>((res) => off.toBlob(res, 'image/png'));
      if (lastBlob) {
        lastName = `${safeName}_seq_${String(f).padStart(4, '0')}.png`;
        lastUrl = URL.createObjectURL(lastBlob);
        triggerDownload(lastUrl, lastName);
      }
      count++;
      onProgress(
        Math.round((f / totalFrames) * 100),
        `Exporting PNG sequence frame ${f}/${totalFrames}...`
      );
      await new Promise((r) => setTimeout(r, 90));
    }
    onProgress(100, `Exported ${count} PNG frames.`);
    return {
      url: lastUrl,
      filename: lastName,
      sizeBytes: lastBlob?.size || 0,
      isVideo: false,
      summary: `Exported ${count} PNG frames`,
    };
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder API not available in this browser.');
  }

  const mimeCandidates =
    params.format === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
      : [
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8',
          'video/webm',
        ];
  const chosenMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!chosenMime) {
    throw new Error(`Browser MediaRecorder does not support ${params.format.toUpperCase()}. Try WebM.`);
  }

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d')!;
  octx.setTransform(params.scale, 0, 0, params.scale, 0, 0);
  renderCompositionFrame(octx, project, mediaCache, comp.width, comp.height, 0, {
    isExport: true,
    subMode: params.subMode,
    transparentBg: params.transparentBg,
  });

  const vStream = off.captureStream(params.fps);
  const actx = audioEngine.ensureCtx();
  let dest: MediaStreamAudioDestinationNode | null = null;
  let keepOsc: OscillatorNode | null = null;

  if (actx && chosenMime.includes('opus')) {
    dest = actx.createMediaStreamDestination();
    keepOsc = actx.createOscillator();
    const keepGain = actx.createGain();
    keepGain.gain.value = 0.00003;
    keepOsc.connect(keepGain);
    keepGain.connect(dest);
    keepOsc.start();
    dest.stream.getAudioTracks().forEach((t) => vStream.addTrack(t));
  }

  const chunks: BlobPart[] = [];
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(vStream, {
      mimeType: chosenMime,
      videoBitsPerSecond: params.bitrateMbps * 1_000_000,
    });
  } catch {
    const videoOnly = off.captureStream(params.fps);
    rec = new MediaRecorder(videoOnly, { mimeType: 'video/webm' });
  }

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const donePromise = new Promise<void>((resolve, reject) => {
    rec.onstop = () => resolve();
    rec.onerror = (ev) =>
      reject((ev as unknown as { error?: Error }).error || new Error('MediaRecorder error'));
  });

  rec.start(200);
  if (dest) audioEngine.startPlaybackFromFrame(project, mediaCache, 0, dest);

  const startWall = performance.now();
  const frameMs = 1000 / params.fps;
  for (let f = 0; f < totalFrames; f++) {
    if (shouldCancel()) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
      if (keepOsc) {
        try {
          keepOsc.stop();
        } catch {
          // ignore
        }
      }
      audioEngine.stopPlayback();
      throw new Error('Export cancelled.');
    }
    octx.setTransform(params.scale, 0, 0, params.scale, 0, 0);
    renderCompositionFrame(octx, project, mediaCache, comp.width, comp.height, f, {
      isExport: true,
      subMode: params.subMode,
      transparentBg: params.transparentBg,
    });
    const pct = Math.round(((f + 1) / totalFrames) * 100);
    const elapsed = (performance.now() - startWall) / 1000;
    const eta =
      f > 4 ? `${Math.max(0, Math.round((elapsed / (f + 1)) * (totalFrames - f - 1)))}s` : '...';
    onProgress(
      pct,
      `Rendering ${chosenMime.split(';')[0]} — Frame ${f + 1}/${totalFrames} (${pct}%) • ETA ${eta}`
    );
    await new Promise((r) => setTimeout(r, Math.max(4, startWall + (f + 1) * frameMs - performance.now())));
  }

  audioEngine.stopPlayback();
  if (keepOsc) {
    try {
      keepOsc.stop();
    } catch {
      // ignore
    }
  }
  rec.stop();
  await donePromise;

  const outBlob = new Blob(chunks, { type: rec.mimeType || chosenMime });
  if (outBlob.size === 0) {
    throw new Error('Generated video file was 0 bytes. Try Chrome/Edge or lower resolution.');
  }

  const ext = (rec.mimeType || chosenMime).includes('mp4') ? 'mp4' : 'webm';
  const filename = `${safeName}.${ext}`;
  const url = URL.createObjectURL(outBlob);
  triggerDownload(url, filename);

  if (params.subMode === 'burnAndSrt') {
    const srt = buildSrtString(project);
    if (srt.trim()) {
      const sb = new Blob([srt], { type: 'text/plain' });
      triggerDownload(URL.createObjectURL(sb), `${safeName}.srt`);
    }
  }

  const mbText = (outBlob.size / (1024 * 1024)).toFixed(2);
  onProgress(100, `Export completed! Real ${ext.toUpperCase()} (${mbText} MB).`);
  return {
    url,
    filename,
    sizeBytes: outBlob.size,
    isVideo: true,
    summary: `Real ${ext.toUpperCase()} (${mbText} MB)`,
  };
}
