import type {
  MediaCacheEntry,
  ProjectState,
  SceneVisualData,
  ThreeModelId,
  Transition,
} from '../types/studio';
import { clamp, easeInOutCubic, easeOutCubic, evalProp } from '../utils/motionMath';
import { threeEngine } from './ThreeStudioEngine';

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function resetShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text || maxWidth <= 10 || ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

function drawCrystalGlassOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pulse = 0
) {
  ctx.save();
  ctx.translate(x, y);
  if (pulse > 0) {
    ctx.strokeStyle = `rgba(147,197,253,${(1 - pulse) * 0.7})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1 + pulse * 0.9), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowColor = 'rgba(2, 8, 24, 0.55)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;

  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.08, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.35, 'rgba(147,197,253,0.58)');
  g.addColorStop(0.75, 'rgba(37,99,235,0.45)');
  g.addColorStop(1, 'rgba(3,10,28,0.84)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  resetShadow(ctx);
  ctx.strokeStyle = 'rgba(191,219,254,0.75)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.28, r * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGlassCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  title: string,
  sub: string,
  val: string,
  accentColor = '#3b82f6'
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(1, 5, 16, 0.58)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = 'rgba(10, 22, 48, 0.94)';
  drawRoundRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.fill();

  resetShadow(ctx);
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.38)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const ribG = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, -h / 2);
  ribG.addColorStop(0, accentColor);
  ribG.addColorStop(1, '#38bdf8');
  ctx.fillStyle = ribG;
  drawRoundRect(ctx, -w / 2 + 12, -h / 2 + 12, w - 24, 8, 4);
  ctx.fill();

  let badgeReserve = 0;
  if (val) {
    ctx.fillStyle = accentColor;
    ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    const valStr = fitText(ctx, val, Math.max(70, w * 0.32));
    badgeReserve = Math.min(w * 0.36, ctx.measureText(valStr).width + 18);
    ctx.fillText(valStr, w / 2 - 22, -h / 2 + 78);
  }

  const maxTextW = Math.max(60, w - 44 - badgeReserve);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 25px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, title, maxTextW), -w / 2 + 22, -h / 2 + 58);

  if (sub) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 19px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(fitText(ctx, sub, maxTextW), -w / 2 + 22, -h / 2 + 92);
  }
  ctx.restore();
}

function draw3DPhoneFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tiltAngle: number,
  drawScreenContent?: (sctx: CanvasRenderingContext2D, sw: number, sh: number) => void
) {
  ctx.save();
  ctx.transform(1, tiltAngle * 0.12, tiltAngle * -0.08, 1, 0, 0);

  ctx.shadowColor = 'rgba(1, 4, 14, 0.65)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetX = tiltAngle * -38;
  ctx.shadowOffsetY = 34;

  const edgeOffset = tiltAngle * -22;
  ctx.fillStyle = '#1e293b';
  drawRoundRect(ctx, -w / 2 + edgeOffset, -h / 2 + 4, w, h, 56);
  ctx.fill();

  resetShadow(ctx);
  const bezelG = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bezelG.addColorStop(0, '#334155');
  bezelG.addColorStop(0.5, '#1e293b');
  bezelG.addColorStop(1, '#0f172a');
  ctx.fillStyle = bezelG;
  drawRoundRect(ctx, -w / 2, -h / 2, w, h, 56);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const pad = 16;
  const sw = w - pad * 2;
  const sh = h - pad * 2;
  ctx.save();
  drawRoundRect(ctx, -sw / 2, -sh / 2, sw, sh, 42);
  ctx.clip();

  const scrG = ctx.createLinearGradient(0, -sh / 2, 0, sh / 2);
  scrG.addColorStop(0, '#07142b');
  scrG.addColorStop(0.45, '#0b1d3d');
  scrG.addColorStop(1, '#040a18');
  ctx.fillStyle = scrG;
  ctx.fillRect(-sw / 2, -sh / 2, sw, sh);

  ctx.fillStyle = '#020612';
  drawRoundRect(ctx, -65, -sh / 2 + 12, 130, 24, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('09:41', -sw / 2 + 26, -sh / 2 + 30);

  if (drawScreenContent) drawScreenContent(ctx, sw, sh);

  const sheen = ctx.createLinearGradient(-sw / 2, -sh / 2, sw / 2, sh / 2);
  sheen.addColorStop(0, 'rgba(147,197,253,0.12)');
  sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(56,189,248,0.05)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  ctx.restore();
}

export function drawSberGlassScene(
  ctx: CanvasRenderingContext2D,
  model: ThreeModelId,
  localT: number,
  durSec: number,
  rotY: number,
  visualData?: SceneVisualData
) {
  const p = clamp(localT / Math.max(0.5, durSec), 0, 1);
  const eOut = easeOutCubic(Math.min(1, localT / 0.7));
  const glyph = visualData?.iconGlyph || '₿';
  const cards = visualData?.cards || [];

  ctx.save();
  if (model === 'glass_icon') {
    const zoomBurst = p > 0.75 ? 1 + easeInOutCubic((p - 0.75) / 0.25) * 0.45 : 0.86 + eOut * 0.14;
    ctx.scale(zoomBurst, zoomBurst);
    const bob = Math.sin(localT * 2.4) * 14;

    [
      { s: 540, c: 'rgba(30, 64, 175, 0.28)' },
      { s: 410, c: 'rgba(37, 99, 235, 0.36)' },
    ].forEach((tile, idx) => {
      ctx.save();
      ctx.translate(0, bob * (idx + 1) * 0.4);
      ctx.fillStyle = tile.c;
      ctx.strokeStyle = 'rgba(147,197,253,0.38)';
      ctx.lineWidth = 3;
      drawRoundRect(ctx, -tile.s / 2, -tile.s / 2, tile.s, tile.s, 72);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.save();
    ctx.translate(0, bob);
    ctx.shadowColor = 'rgba(1, 5, 16, 0.65)';
    ctx.shadowBlur = 45;
    ctx.shadowOffsetY = 20;
    const g = ctx.createLinearGradient(-130, -130, 130, 130);
    g.addColorStop(0, '#0f2247');
    g.addColorStop(1, '#050c1d');
    ctx.fillStyle = g;
    drawRoundRect(ctx, -135, -135, 270, 270, 58);
    ctx.fill();
    resetShadow(ctx);
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const rg = ctx.createLinearGradient(-80, -80, 80, 80);
    rg.addColorStop(0, '#38bdf8');
    rg.addColorStop(0.5, '#2563eb');
    rg.addColorStop(1, '#f5b942');
    ctx.strokeStyle = rg;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(0, 0, 74, -0.35, Math.PI * 1.65);
    ctx.stroke();
    ctx.fillStyle = '#60a5fa';
    ctx.font = '800 76px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 4);
    ctx.restore();
  } else if (model === 'phone_pop') {
    const tilt = -0.32 + Math.sin(localT * 1.1) * 0.08 + rotY * 0.25;
    const popLift = easeOutCubic(clamp((localT - 0.35) / 0.85, 0, 1));
    ctx.translate(0, 35 - eOut * 20);
    const c0 = cards[0] || { title: 'Tarif AS', sub: '14 Mitra', val: '+25%', accent: '#f59e0b' };
    const c1 = cards[1] || { title: 'Indonesia', sub: 'Mitra Dagang', val: 'RI', accent: '#38bdf8' };
    const c2 = cards[2] || { title: 'Trump Kebijakan Tarif', sub: 'Ketidakpastian Global Naik', val: 'LIVE', accent: '#3b82f6' };
    const c3 = cards[3] || { title: 'Pasar Kripto', sub: 'Bitcoin Dalam Sorotan', val: 'BTC', accent: '#f5b942' };
    const pop = visualData?.popCard || {
      title: '14 MITRA DAGANG TERMASUK RI',
      sub: 'Tarif Baru AS Mengguncang Pasar',
      val: 'TARIF',
      accent: '#38bdf8',
    };

    draw3DPhoneFrame(ctx, 500, 920, tilt, (sctx, sw, sh) => {
      sctx.fillStyle = '#93c5fd';
      sctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
      sctx.textAlign = 'left';
      sctx.fillText(fitText(sctx, visualData?.headerSub || 'VOYA Pasar Global', sw - 56), -sw / 2 + 28, -sh / 2 + 88);
      sctx.fillStyle = '#f8fafc';
      sctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
      sctx.fillText(fitText(sctx, visualData?.headerMain || '$87,420 • BTC', sw - 56), -sw / 2 + 28, -sh / 2 + 140);

      drawGlassCard(sctx, -108, -165, 200, 125, 22, c0.title, c0.sub, c0.val, c0.accent || '#f59e0b');
      drawGlassCard(sctx, 108, -165, 200, 125, 22, c1.title, c1.sub, c1.val, c1.accent || '#38bdf8');
      drawGlassCard(sctx, 0, -5, 420, 120, 22, c2.title, c2.sub, c2.val, c2.accent || '#3b82f6');
      drawGlassCard(sctx, 0, 135, 420, 120, 22, c3.title, c3.sub, c3.val, c3.accent || '#f5b942');
    });

    if (popLift > 0.01) {
      ctx.save();
      const scalePop = 0.85 + popLift * 0.28;
      ctx.translate(popLift * 18, 95 - popLift * 55);
      ctx.scale(scalePop, scalePop);
      ctx.rotate(popLift * -0.03);
      drawGlassCard(ctx, 0, 0, 480, 175, 28, pop.title, pop.sub, pop.val, pop.accent || '#38bdf8');
      ctx.restore();
    }
    drawCrystalGlassOrb(ctx, 185, 65 - popLift * 40, 38, (localT % 2) / 2);
  } else if (model === 'phone_orb') {
    const tilt = 0.28 - eOut * 0.08;
    const scrollY = -easeInOutCubic(p) * 180;
    const list = cards.length >= 4 ? cards : [
      { title: 'Investor Hati-Hati', sub: 'Mode Risk-Off Aktif', val: 'ALERT', accent: '#f59e0b' },
      { title: 'Aset Berisiko', sub: 'Tekanan Jual Meningkat', val: '-4.2%', accent: '#ef4444' },
      { title: 'Arus Modal Global', sub: 'Menuju Aset Aman', val: 'USD', accent: '#38bdf8' },
      { title: 'Volatilitas Harian', sub: 'Fluktuasi Tinggi', val: 'HIGH', accent: '#ef4444' },
    ];
    draw3DPhoneFrame(ctx, 500, 920, tilt, (sctx, sw, sh) => {
      sctx.fillStyle = '#f8fafc';
      sctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
      sctx.textAlign = 'left';
      sctx.fillText(fitText(sctx, visualData?.headerMain || 'Sentimen Investor', sw - 56), -sw / 2 + 28, -sh / 2 + 100);
      sctx.save();
      sctx.translate(0, scrollY);
      drawGlassCard(sctx, 0, -140, 420, 115, 22, list[0].title, list[0].sub, list[0].val, list[0].accent || '#f59e0b');
      drawGlassCard(sctx, 0, -5, 420, 115, 22, list[1].title, list[1].sub, list[1].val, list[1].accent || '#ef4444');
      drawGlassCard(sctx, 0, 130, 420, 115, 22, list[2].title, list[2].sub, list[2].val, list[2].accent || '#38bdf8');
      drawGlassCard(sctx, 0, 265, 420, 115, 22, list[3].title, list[3].sub, list[3].val, list[3].accent || '#ef4444');
      sctx.restore();
    });
    const orbY = 170 - easeInOutCubic(p) * 240;
    drawCrystalGlassOrb(ctx, -95 + p * 75, orbY, 44, (localT * 0.8) % 1);
  } else if (model === 'stack_cards') {
    const fan = easeOutCubic(clamp(localT / 0.9, 0, 1));
    const drift = Math.sin(localT * 1.4) * 12;
    const baseCards = cards.length >= 3 ? cards : [
      { title: '01 · SENTIMEN RISIKO', sub: 'Perubahan selera risiko global', val: 'RISK', accent: '#38bdf8' },
      { title: '02 · TEKANAN INFLASI', sub: 'Dampak kenaikan tarif dagang', val: 'CPI ↑', accent: '#60a5fa' },
      { title: '03 · SUKU BUNGA THE FED', sub: 'Ekspektasi kebijakan moneter AS', val: 'FED', accent: '#3b82f6' },
    ];
    const layout = [
      { dx: 65 * fan, dy: -220 * fan, sc: 0.84, rot: -0.06 },
      { dx: 20 * fan, dy: -45 * fan, sc: 0.93, rot: -0.03 },
      { dx: -25 * fan, dy: 145 * fan, sc: 1.04, rot: 0.0 },
    ];
    layout.forEach((pos, idx) => {
      const c = baseCards[idx];
      ctx.save();
      ctx.translate(pos.dx + drift * (idx - 1) * 0.4, pos.dy);
      ctx.scale(pos.sc, pos.sc);
      ctx.rotate(pos.rot);
      drawGlassCard(ctx, 0, 0, 560, 195, 32, c.title, c.sub, c.val, c.accent || '#38bdf8');
      ctx.restore();
    });
    drawCrystalGlassOrb(ctx, 210, -240 + drift, 34, 0);
  } else if (model === 'orb_tap') {
    const tapP = clamp((localT - 0.5) / 0.6, 0, 1);
    const list = cards.length >= 3 ? cards : [
      { title: 'Dolar Menguat & Bunga Tinggi', sub: 'Tekanan bearish berlanjut', val: 'BEAR', accent: '#ef4444' },
      { title: 'Ketegangan Tarif Mereda', sub: 'Likuiditas pasar membaik', val: 'BULL', accent: '#38bdf8' },
      { title: 'Peluang Pemulihan', sub: 'Tetap terbuka bagi investor', val: 'OPEN', accent: '#3b82f6' },
    ];
    draw3DPhoneFrame(ctx, 510, 920, -0.14 + p * 0.28, (sctx, sw, sh) => {
      sctx.fillStyle = '#f8fafc';
      sctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
      sctx.textAlign = 'left';
      sctx.fillText(fitText(sctx, visualData?.headerMain || 'Dua Skenario BTC', sw - 56), -sw / 2 + 28, -sh / 2 + 100);
      drawGlassCard(sctx, 0, -145, 425, 130, 24, list[0].title, list[0].sub, list[0].val, list[0].accent || '#ef4444');
      drawGlassCard(sctx, 0, 20, 425, 130, 24, list[1].title, list[1].sub, list[1].val, list[1].accent || '#38bdf8');
      drawGlassCard(sctx, 0, 185, 425, 130, 24, list[2].title, list[2].sub, list[2].val, list[2].accent || '#3b82f6');
    });
    drawCrystalGlassOrb(ctx, 40, 20 - tapP * 20, 46, tapP);
  } else {
    const spin = (1 - easeOutCubic(clamp(localT / 0.85, 0, 1))) * 0.9;
    const tilt = 0.25 - spin;
    const c0 = cards[0] || { title: 'Bearish atau Recovery?', sub: 'Pantau pasar global real-time', val: 'BTC', accent: '#f5b942' };
    const c1 = cards[1] || { title: 'Update Tarif & The Fed', sub: 'Analisis makro harian', val: 'LIVE', accent: '#38bdf8' };
    const badge = visualData?.popCard || { title: 'VOYA', sub: 'Market Brief', val: glyph, accent: '#38bdf8' };
    ctx.save();
    ctx.scale(0.88 + eOut * 0.14, 0.88 + eOut * 0.14);
    draw3DPhoneFrame(ctx, 480, 880, tilt, (sctx, sw, sh) => {
      sctx.fillStyle = '#f8fafc';
      sctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
      sctx.textAlign = 'left';
      sctx.fillText(fitText(sctx, visualData?.headerMain || 'VOYA NEWS', sw - 56), -sw / 2 + 28, -sh / 2 + 104);
      drawGlassCard(sctx, 0, -110, 410, 145, 24, c0.title, c0.sub, c0.val, c0.accent || '#f5b942');
      drawGlassCard(sctx, 0, 70, 410, 145, 24, c1.title, c1.sub, c1.val, c1.accent || '#38bdf8');
    });
    ctx.save();
    ctx.translate(-210, -255 + Math.sin(localT * 2.2) * 8);
    drawGlassCard(ctx, 0, 0, 200, 96, 20, badge.title, badge.sub, badge.val, badge.accent || '#38bdf8');
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}

export function drawSberStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: number,
  fps: number
) {
  const t = frame / Math.max(1, fps);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#020612');
  bg.addColorStop(0.38, '#071329');
  bg.addColorStop(0.75, '#0b1e42');
  bg.addColorStop(1, '#020510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const g1 = ctx.createRadialGradient(
    w * (0.3 + Math.sin(t * 0.4) * 0.12),
    h * 0.25,
    20,
    w * 0.35,
    h * 0.25,
    w * 0.65
  );
  g1.addColorStop(0, 'rgba(37, 99, 235, 0.28)');
  g1.addColorStop(1, 'rgba(37, 99, 235, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2 = ctx.createRadialGradient(
    w * 0.78,
    h * (0.68 + Math.cos(t * 0.5) * 0.08),
    20,
    w * 0.75,
    h * 0.7,
    w * 0.6
  );
  g2.addColorStop(0, 'rgba(14, 165, 233, 0.20)');
  g2.addColorStop(1, 'rgba(14, 165, 233, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);

  const bot = ctx.createLinearGradient(0, h * 0.62, 0, h);
  bot.addColorStop(0, 'rgba(2, 5, 14, 0)');
  bot.addColorStop(1, 'rgba(1, 3, 10, 0.92)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
}

export interface RenderFrameOptions {
  isExport?: boolean;
  subMode?: string;
  transparentBg?: boolean;
  selectedLayerId?: string | null;
}

const SBER_MODELS: ThreeModelId[] = [
  'glass_icon',
  'phone_pop',
  'phone_orb',
  'stack_cards',
  'orb_tap',
  'phone_hero',
];

export function renderCompositionFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  mediaCache: Map<string, MediaCacheEntry>,
  w: number,
  h: number,
  frame: number,
  opts: RenderFrameOptions = {}
) {
  const comp = project.composition;
  const isExport = !!opts.isExport;
  const hideSubsExport = opts.subMode === 'none';

  ctx.save();
  ctx.clearRect(0, 0, w, h);

  if (!isExport && project.ui.showChecker) {
    const sz = 48;
    for (let yy = 0; yy < h; yy += sz) {
      for (let xx = 0; xx < w; xx += sz) {
        ctx.fillStyle = (xx / sz + yy / sz) % 2 === 0 ? '#1a1d24' : '#12141a';
        ctx.fillRect(xx, yy, sz, sz);
      }
    }
  } else if (!opts.transparentBg) {
    ctx.fillStyle = comp.bgColor || '#020611';
    ctx.fillRect(0, 0, w, h);
  }

  let activeTrans: (Transition & { progress: number }) | null = null;
  for (const tr of project.transitions) {
    if (frame >= tr.startFrame && frame <= tr.endFrame) {
      activeTrans = {
        ...tr,
        progress: (frame - tr.startFrame) / Math.max(1, tr.endFrame - tr.startFrame),
      };
      break;
    }
  }

  const soloVisual = project.layers.some((l) => l.solo && l.kind !== 'audio');
  const renderList = [...project.layers].reverse();

  for (const layer of renderList) {
    if (layer.kind === 'audio' || layer.hidden) continue;
    if (soloVisual && !layer.solo) continue;
    if (frame < layer.startFrame || frame > layer.endFrame) continue;
    if (
      layer.type === 'subtitle' &&
      (!project.ui.showSubtitles || hideSubsExport || project.ui.muteTextOnFrame)
    ) {
      continue;
    }
    if (layer.type === 'text' && project.ui.muteTextOnFrame) continue;

    const x = evalProp(layer, 'x', frame);
    const y = evalProp(layer, 'y', frame);
    const sx = evalProp(layer, 'scaleX', frame) / 100;
    const sy = evalProp(layer, 'scaleY', frame) / 100;
    const rot = (evalProp(layer, 'rotation', frame) * Math.PI) / 180;
    const opacity = clamp(evalProp(layer, 'opacity', frame) / 100, 0, 1);
    const blur = evalProp(layer, 'blur', frame) || 0;
    const glow = evalProp(layer, 'glow', frame) || 0;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    if (blur > 0 || layer.colorAdj) {
      ctx.filter = `blur(${blur}px) brightness(${layer.colorAdj?.brightness ?? 100}%) contrast(${layer.colorAdj?.contrast ?? 100}%) saturate(${layer.colorAdj?.saturation ?? 100}%)`;
    }
    if (glow > 0) {
      ctx.shadowColor = layer.effects?.glowColor || '#2d7ff9';
      ctx.shadowBlur = glow;
    }

    let tx = x;
    const ty = y;
    let tsx = sx;
    let tsy = sy;
    if (activeTrans && layer.type !== 'subtitle') {
      const bell = Math.sin(activeTrans.progress * Math.PI);
      if (activeTrans.kind === 'smooth_zoom' || activeTrans.kind === 'camera_push') {
        const boost = 1 + bell * 0.14 * (activeTrans.intensity || 1);
        tsx *= boost;
        tsy *= boost;
      } else if (activeTrans.kind === 'whip_pan') {
        tx += (activeTrans.progress - 0.5) * 280 * bell;
      }
    }

    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.scale(tsx, tsy);
    const lw = layer.props.width || 600;
    const lh = layer.props.height || 400;

    if (layer.type === 'shape') {
      const st = layer.shape;
      ctx.fillStyle = st?.fill || '#1b2232';
      ctx.strokeStyle = st?.stroke || '#2d7ff9';
      ctx.lineWidth = st?.strokeWidth ?? 2;
      if (st?.kind === 'sber_bg') {
        ctx.translate(-tx, -ty);
        drawSberStudioBackdrop(ctx, w, h, frame, comp.fps);
      } else if (st?.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, lw / 2, 0, Math.PI * 2);
        ctx.fill();
        if (ctx.lineWidth > 0) ctx.stroke();
      } else if (st?.kind === 'gradient_bg') {
        const g = ctx.createRadialGradient(0, -lh * 0.15, 30, 0, 0, Math.max(lw, lh) * 0.7);
        g.addColorStop(0, st.fill || '#121b2e');
        g.addColorStop(1, '#050609');
        ctx.fillStyle = g;
        ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
      } else {
        drawRoundRect(ctx, -lw / 2, -lh / 2, lw, lh, st?.radius ?? 14);
        ctx.fill();
        if (ctx.lineWidth > 0) ctx.stroke();
      }
    } else if (layer.type === 'image' || layer.type === 'video') {
      const m = layer.assetId ? mediaCache.get(layer.assetId) : undefined;
      const mediaEl = m?.video || m?.img;
      if (mediaEl) {
        if (m?.video && m.video.readyState >= 2) {
          const t = clamp((frame - layer.startFrame) / comp.fps, 0, m.video.duration || 10);
          if (Math.abs(m.video.currentTime - t) > 0.08) m.video.currentTime = t;
        }
        ctx.drawImage(mediaEl, -lw / 2, -lh / 2, lw, lh);
      } else {
        ctx.fillStyle = '#191d28';
        ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
        ctx.strokeStyle = '#333b4f';
        ctx.strokeRect(-lw / 2, -lh / 2, lw, lh);
        ctx.fillStyle = '#8b92a0';
        ctx.font = '500 26px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(layer.name, 0, 0);
      }
    } else if (layer.type === '3d') {
      const d3 = layer.three;
      const rotY = evalProp(layer, 'rotY', frame);
      const localT = (frame - layer.startFrame) / comp.fps;
      const durSec = Math.max(1, (layer.endFrame - layer.startFrame + 1) / comp.fps);
      const modelId = d3?.model || 'glass_icon';
      const sceneVisual = layer.sceneId
        ? project.storyboard.find((sc) => sc.id === layer.sceneId)?.visualData
        : undefined;

      if (SBER_MODELS.includes(modelId)) {
        drawSberGlassScene(ctx, modelId, localT, durSec, rotY, sceneVisual);
      } else if (threeEngine.available) {
        const glCanvas = threeEngine.renderObject(
          modelId,
          {
            rotX: evalProp(layer, 'rotX', frame),
            rotY: rotY + localT * 0.45,
            rotZ: evalProp(layer, 'rotZ', frame),
            posY: Math.sin(localT * 1.6) * 0.14,
            posZ: evalProp(layer, 'posZ', frame),
            scale3d: d3?.scale3d ?? 1,
            camZ: evalProp(layer, 'camZ', frame),
            camY: evalProp(layer, 'camY', frame),
            color: d3?.color || '#d9a441',
            metalness: d3?.metalness ?? 0.85,
            roughness: d3?.roughness ?? 0.22,
            blueLight: d3?.blueLight ?? 2.1,
          },
          720,
          720
        );
        if (glCanvas) ctx.drawImage(glCanvas, -lw / 2, -lh / 2, lw, lh);
      } else {
        drawSberGlassScene(ctx, 'glass_icon', localT, durSec, rotY);
      }
    } else if (layer.type === 'text' || layer.type === 'subtitle') {
      const tp = layer.text;
      const content = tp?.content || '';
      const size = tp?.fontSize || (layer.type === 'subtitle' ? 38 : 66);
      ctx.font = `${tp?.fontWeight || (layer.type === 'subtitle' ? '600' : '800')} ${size}px ${tp?.fontFamily || '"Plus Jakarta Sans", system-ui, sans-serif'}`;
      ctx.textAlign = tp?.align || 'center';
      ctx.textBaseline = 'middle';
      const maxW = lw;
      const words = content.split(/\s+/);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);

      const lhPx = size * (tp?.lineHeight || 1.22);
      const totalH = lines.length * lhPx;
      if (tp?.bgColor && tp.bgColor !== 'none') {
        ctx.fillStyle = tp.bgColor;
        drawRoundRect(ctx, -maxW / 2 - 22, -totalH / 2 - 12, maxW + 44, totalH + 24, 14);
        ctx.fill();
      }
      lines.forEach((ln, idx) => {
        const ly = -totalH / 2 + (idx + 0.5) * lhPx;
        if (tp?.shadow) {
          ctx.shadowColor = 'rgba(2, 6, 20, 0.55)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 3;
        } else {
          resetShadow(ctx);
        }
        if (tp && tp.strokeWidth > 0) {
          ctx.strokeStyle = tp.strokeColor || '#000';
          ctx.lineWidth = tp.strokeWidth;
          ctx.strokeText(ln, 0, ly);
        }
        ctx.fillStyle = tp?.color || '#ffffff';
        ctx.fillText(ln, 0, ly);
      });
      resetShadow(ctx);
    } else if (layer.type === 'adjustment') {
      const sweepX = ((frame % 150) / 150) * w * 1.6 - w * 0.3;
      const g = ctx.createLinearGradient(sweepX - 200, 0, sweepX + 200, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(147, 197, 253, 0.14)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    ctx.restore();
  }

  if (activeTrans && activeTrans.kind === 'light_sweep') {
    const p = activeTrans.progress;
    const g = ctx.createLinearGradient(w * (p * 1.6 - 0.5), 0, w * (p * 1.6 - 0.1), h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(191, 219, 254, 0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  if (!isExport) {
    if (project.ui.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      for (let gx = w / 6; gx < w; gx += w / 6) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = h / 8; gy < h; gy += h / 8) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }
    }
    if (project.ui.showSafeArea) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 3;
      ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.72);
      ctx.setLineDash([]);
    }
    if (project.ui.showRulers) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '20px "JetBrains Mono", monospace';
      for (let rx = 0; rx <= w; rx += 270) ctx.fillText(String(rx), rx + 6, 24);
      for (let ry = 240; ry <= h; ry += 240) ctx.fillText(String(ry), 6, ry);
    }
    const sel = project.layers.find((l) => l.id === opts.selectedLayerId);
    if (sel && sel.kind !== 'audio' && frame >= sel.startFrame && frame <= sel.endFrame) {
      const sx = evalProp(sel, 'x', frame);
      const sy = evalProp(sel, 'y', frame);
      const scX = evalProp(sel, 'scaleX', frame) / 100;
      const scY = evalProp(sel, 'scaleY', frame) / 100;
      const rot = (evalProp(sel, 'rotation', frame) * Math.PI) / 180;
      const bw = (sel.props.width || 400) * scX;
      const bh = (sel.props.height || 300) * scY;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(45,127,249,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }
  }
  ctx.restore();
}
