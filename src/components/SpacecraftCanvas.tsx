// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React, { useEffect, useRef } from 'react';
import { ENGINES, MATERIALS } from '../data/nasaCatalog';
import { MonteCarloSummary, TelemetryFrame, VehicleConfig } from '../types/simulation';

interface SpacecraftCanvasProps {
  config: VehicleConfig;
  telemetry: TelemetryFrame;
  showVectors: boolean;
  onToggleVectors: () => void;
  showMonteCarlo: boolean;
  monteCarloSummary: MonteCarloSummary | null;
  onToggleMonteCarlo?: () => void;
  isRunning: boolean;
}

interface DriftingStage {
  xOffset: number;
  yOffset: number;
  rot: number;
  rotSpeed: number;
  type: 'booster' | 'stage1';
  life: number;
}

export const SpacecraftCanvas: React.FC<SpacecraftCanvasProps> = ({
  config,
  telemetry,
  showVectors,
  onToggleVectors,
  showMonteCarlo,
  monteCarloSummary,
  onToggleMonteCarlo,
  isRunning,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store latest props in refs so the 60fps canvas animation loop never tears down
  const stateRef = useRef({
    config,
    telemetry,
    showVectors,
    showMonteCarlo,
    monteCarloSummary,
    isRunning,
  });
  stateRef.current = {
    config,
    telemetry,
    showVectors,
    showMonteCarlo,
    monteCarloSummary,
    isRunning,
  };

  const animRef = useRef<{
    time: number;
    prevPhase: string;
    prevBoosterFrac: number;
    driftingStages: DriftingStage[];
    stars: { x: number; y: number; r: number; a: number }[];
  }>({
    time: 0,
    prevPhase: telemetry.phase,
    prevBoosterFrac: telemetry.boosterFuelFrac,
    driftingStages: [],
    stars: Array.from({ length: 120 }, (_, i) => ({
      x: ((i * 197 + 31) % 1000) / 1000,
      y: ((i * 353 + 79) % 1000) / 1000,
      r: (i % 3 === 0 ? 1.6 : 1.0),
      a: 0.35 + ((i * 47) % 60) / 100,
    })),
  });

  const redrawTriggerRef = useRef<() => void>(() => {});
  const animTickRef = useRef<() => void>(() => {});

  useEffect(() => {
    redrawTriggerRef.current();
  }, [config, telemetry, showVectors, showMonteCarlo, monteCarloSummary, isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let lastTs = performance.now();
    let lastPaintTs = 0;
    let paintFnRef: ((now: number, force?: boolean) => void) | null = null;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(280, Math.floor(rect.height * dpr));
      paintFnRef?.(performance.now(), true);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    redrawTriggerRef.current = () => {
      paintFnRef?.(performance.now(), true);
    };
    animTickRef.current = () => {
      paintFnRef?.(performance.now(), false);
    };

    const getMaterialPalette = (matId: string) => {
      switch (matId) {
        case 'stainless_304l':
          return { dark: '#475569', mid: '#94A3B8', light: '#E2E8F0', stroke: '#CBD5E1', band: '#334155' };
        case 'rcc':
          return { dark: '#1E293B', mid: '#334155', light: '#64748B', stroke: '#475569', band: '#0F172A' };
        case 'pica_x':
          return { dark: '#1C1917', mid: '#292524', light: '#57534E', stroke: '#44403C', band: '#78350F' };
        case 'al_li_2195':
        default:
          return { dark: '#8A5A36', mid: '#C28A5B', light: '#E7C4A0', stroke: '#F1D9BE', band: '#6B3F22' };
      }
    };

    const drawNozzle = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      gimbalRad: number,
      thrustFrac: number,
      pressureRatio: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(gimbalRad);

      // Exhaust Plume if firing
      if (thrustFrac > 0.02) {
        const vacuumExpand = 1 + (1 - pressureRatio) * 2.6;
        const plumeLen = (58 + thrustFrac * 68) * (1 + (1 - pressureRatio) * 0.45);
        const plumeW = w * 0.72 * vacuumExpand;

        const grad = ctx.createLinearGradient(0, h, 0, h + plumeLen);
        if (pressureRatio > 0.25) {
          // Dense atmosphere: bright yellow-white core + amber sheath
          grad.addColorStop(0, 'rgba(255, 255, 240, 0.96)');
          grad.addColorStop(0.28, 'rgba(253, 224, 71, 0.85)');
          grad.addColorStop(0.65, 'rgba(249, 115, 22, 0.45)');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        } else {
          // High altitude / vacuum: wide translucent violet-cyan plasma plume
          grad.addColorStop(0, 'rgba(224, 242, 254, 0.92)');
          grad.addColorStop(0.32, 'rgba(139, 92, 246, 0.48)');
          grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.16)');
          grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        }

        const flicker = 0.94 + Math.sin(animRef.current.time * 42 + x) * 0.06;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-w * 0.42, h);
        ctx.quadraticCurveTo(-plumeW * 0.85, h + plumeLen * 0.45, 0, h + plumeLen * flicker);
        ctx.quadraticCurveTo(plumeW * 0.85, h + plumeLen * 0.45, w * 0.42, h);
        ctx.closePath();
        ctx.fill();

        // Mach shock diamonds at sea-level / lower atmosphere
        if (pressureRatio > 0.18) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          for (let d = 1; d <= 3; d++) {
            const dy = h + d * (plumeLen * 0.19);
            const dw = w * (0.28 - d * 0.05);
            const dh = 7;
            ctx.beginPath();
            ctx.moveTo(0, dy - dh);
            ctx.lineTo(dw, dy);
            ctx.lineTo(0, dy + dh);
            ctx.lineTo(-dw, dy);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Parabolic metallic nozzle bell
      const nozGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      nozGrad.addColorStop(0, '#1E293B');
      nozGrad.addColorStop(0.45, '#64748B');
      nozGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = nozGrad;
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-w * 0.28, 0);
      ctx.lineTo(w * 0.28, 0);
      ctx.quadraticCurveTo(w * 0.48, h * 0.55, w * 0.5, h);
      ctx.lineTo(-w * 0.5, h);
      ctx.quadraticCurveTo(-w * 0.48, h * 0.55, -w * 0.28, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cooling channels ribbing on bell
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
      ctx.lineWidth = 0.6;
      for (let r = 0.35; r <= 0.75; r += 0.2) {
        const rw = w * (0.28 + r * 0.21);
        ctx.beginPath();
        ctx.moveTo(-rw, h * r);
        ctx.lineTo(rw, h * r);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawVectorArrow = (
      ctx: CanvasRenderingContext2D,
      ox: number,
      oy: number,
      vx: number,
      vy: number,
      color: string,
      label: string
    ) => {
      const len = Math.hypot(vx, vy);
      if (len < 6) return;
      const angle = Math.atan2(vy, vx);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + vx, oy + vy);
      ctx.stroke();

      // Arrowhead
      const head = 8;
      ctx.beginPath();
      ctx.moveTo(ox + vx, oy + vy);
      ctx.lineTo(ox + vx - head * Math.cos(angle - Math.PI / 6), oy + vy - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(ox + vx - head * Math.cos(angle + Math.PI / 6), oy + vy - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      // Label with crisp dark readability backing
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      const lx = ox + vx + (vx < -5 ? -ctx.measureText(label).width - 8 : 8);
      const ly = oy + vy + 4;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(7, 11, 20, 0.84)';
      ctx.fillRect(lx - 4, ly - 10, tw + 8, 14);
      ctx.fillStyle = color;
      ctx.fillText(label, lx, ly);
      ctx.restore();
    };

    const drawMonteCarloOverlay = (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      mc: MonteCarloSummary
    ) => {
      ctx.save();
      ctx.fillStyle = '#070B14';
      ctx.fillRect(0, 0, w, h);

      const padL = 68;
      const padR = 32;
      const padT = 68;
      const padB = 56;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      let maxDownrange = 250;
      let maxAlt = 180;
      for (const tr of mc.trials) {
        for (const pt of tr.points) {
          if (pt.downrangeKm > maxDownrange) maxDownrange = pt.downrangeKm;
          if (pt.altitudeKm > maxAlt) maxAlt = pt.altitudeKm;
        }
      }
      maxDownrange = Math.ceil(maxDownrange / 50) * 50;
      maxAlt = Math.ceil(maxAlt / 25) * 25;

      // Grid lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1;
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#94A3B8';

      for (let i = 0; i <= 5; i++) {
        const y = padT + (plotH * i) / 5;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
        const altLabel = Math.round(maxAlt * (1 - i / 5));
        ctx.fillText(`${altLabel} km`, 12, y + 4);
      }

      for (let i = 0; i <= 5; i++) {
        const x = padL + (plotW * i) / 5;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        const drLabel = Math.round((maxDownrange * i) / 5);
        ctx.fillText(`${drLabel} km`, x - 18, padT + plotH + 20);
      }

      // 100 Trial trajectories
      for (const tr of mc.trials) {
        ctx.strokeStyle = tr.success
          ? 'rgba(16, 185, 129, 0.22)'
          : 'rgba(244, 63, 94, 0.34)';
        ctx.lineWidth = tr.success ? 1.2 : 1.4;
        ctx.beginPath();
        tr.points.forEach((pt, idx) => {
          const px = padL + (pt.downrangeKm / maxDownrange) * plotW;
          const py = padT + plotH - (pt.altitudeKm / maxAlt) * plotH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      // Header annotation
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 13px "Chakra Petch", sans-serif';
      ctx.fillText(
        `100-TRIAL MONTE CARLO ASCENT DISPERSION · SUCCESS: ${mc.empiricalSuccessPct}%`,
        padL,
        32
      );

      ctx.fillStyle = '#10B981';
      ctx.fillRect(padL, h - 22, 12, 3);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      ctx.fillText(`Nominal (${mc.successCount})`, padL + 18, h - 17);

      ctx.fillStyle = '#F43F5E';
      ctx.fillRect(padL + 145, h - 22, 12, 3);
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText(`Off-Nominal (${mc.trialsCount - mc.successCount})`, padL + 163, h - 17);

      ctx.restore();
    };

    const drawFrame = (now: number, force = false) => {
      if (!force && lastPaintTs !== 0 && now - lastPaintTs < 33) {
        return;
      }
      lastPaintTs = now;

      const {
        config: cfg,
        telemetry: tel,
        showVectors: vecs,
        showMonteCarlo: showMC,
        monteCarloSummary: mc,
      } = stateRef.current;

      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      animRef.current.time += dt;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.scale(dpr, dpr);

      if (showMC && mc) {
        drawMonteCarloOverlay(ctx, w, h, mc);
        ctx.restore();
        return;
      }

      // Detect stage/booster separation events to spawn drifting silhouettes
      if (animRef.current.prevPhase === 'ascent_stage1' && tel.phase === 'ascent_stage2') {
        animRef.current.driftingStages.push({
          xOffset: 0,
          yOffset: 42,
          rot: 0,
          rotSpeed: 0.45,
          type: 'stage1',
          life: 4.5,
        });
      }
      if (animRef.current.prevBoosterFrac > 0.01 && tel.boosterFuelFrac <= 0.005 && tel.phase === 'ascent_stage1') {
        animRef.current.driftingStages.push(
          { xOffset: -24, yOffset: 15, rot: -0.1, rotSpeed: -0.65, type: 'booster', life: 4.0 },
          { xOffset: 24, yOffset: 15, rot: 0.1, rotSpeed: 0.65, type: 'booster', life: 4.0 }
        );
      }
      animRef.current.prevPhase = tel.phase;
      animRef.current.prevBoosterFrac = tel.boosterFuelFrac;

      // Update drifting stages
      animRef.current.driftingStages = animRef.current.driftingStages
        .map((s) => ({
          ...s,
          yOffset: s.yOffset + dt * 52,
          xOffset: s.xOffset + (s.xOffset < 0 ? -dt * 18 : s.xOffset > 0 ? dt * 18 : 0),
          rot: s.rot + s.rotSpeed * dt,
          life: s.life - dt,
        }))
        .filter((s) => s.life > 0);

      // 1. Sky / Space Background Gradient based on altitude
      const altKm = tel.altitudeM / 1000;
      const spaceBlend = Math.min(1, altKm / 85);
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      if (spaceBlend < 0.2) {
        skyGrad.addColorStop(0, '#0B1E3D');
        skyGrad.addColorStop(0.55, '#13315C');
        skyGrad.addColorStop(1, '#1E4878');
      } else if (spaceBlend < 0.75) {
        skyGrad.addColorStop(0, '#040711');
        skyGrad.addColorStop(0.65, '#0B162C');
        skyGrad.addColorStop(1, '#16355E');
      } else {
        skyGrad.addColorStop(0, '#03060C');
        skyGrad.addColorStop(0.75, '#070D19');
        skyGrad.addColorStop(1, '#0B182E');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Stars fade in above 18 km
      const starAlpha = Math.max(0.1, Math.min(1, (altKm - 10) / 45));
      for (const st of animRef.current.stars) {
        ctx.fillStyle = `rgba(226, 232, 240, ${st.a * starAlpha})`;
        ctx.beginPath();
        ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle engineering coordinate grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 40; gx < w; gx += 60) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 40; gy < h; gy += 60) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // 2. Curved Atmospheric Earth Horizon for Orbit / EDL / High-Altitude
      if (altKm > 15 || tel.phase === 'orbit' || tel.phase === 'deorbit' || tel.phase === 'edl_entry') {
        const horizonR = Math.max(w * 1.4, 900);
        const horizonY = h + horizonR - (tel.phase === 'orbit' ? 95 : Math.max(30, 120 - altKm * 0.6));
        const limbGrad = ctx.createRadialGradient(w / 2, horizonY, horizonR - 26, w / 2, horizonY, horizonR + 28);
        limbGrad.addColorStop(0, '#0F294A');
        limbGrad.addColorStop(0.5, '#1D4ED8');
        limbGrad.addColorStop(0.78, 'rgba(56, 189, 248, 0.45)');
        limbGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = limbGrad;
        ctx.beginPath();
        ctx.arc(w / 2, horizonY, horizonR + 28, Math.PI, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#091B36';
        ctx.beginPath();
        ctx.arc(w / 2, horizonY, horizonR - 4, Math.PI, 2 * Math.PI);
        ctx.fill();
      }

      // Launch Pad & Flame Trench when near ground
      if (tel.phase === 'prelaunch' || (altKm < 0.25 && tel.phase === 'ascent_stage1')) {
        const groundY = h - 46 - altKm * 180;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, groundY, w, h - groundY + 100);
        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(w, groundY);
        ctx.stroke();

        // Umbilical Launch Tower
        const towerX = w / 2 - 96;
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.strokeRect(towerX, groundY - 220, 28, 220);
        for (let ty = groundY - 200; ty < groundY; ty += 24) {
          ctx.beginPath();
          ctx.moveTo(towerX, ty);
          ctx.lineTo(towerX + 28, ty + 24);
          ctx.moveTo(towerX + 28, ty);
          ctx.lineTo(towerX, ty + 24);
          ctx.stroke();
        }
        // Swing arms
        ctx.fillStyle = '#64748B';
        ctx.fillRect(towerX + 28, groundY - 178, 50, 5);
        ctx.fillRect(towerX + 28, groundY - 118, 46, 5);

        // Pad concrete deck
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(w / 2 - 75, groundY - 14, 150, 14);
      }

      // Landing / Recovery Zone for EDL Chute & Landed
      if (tel.phase === 'edl_chute' || tel.phase === 'landed') {
        const groundY = tel.phase === 'landed' ? h - 56 : h - 56 + Math.min(240, tel.altitudeM * 0.08);
        if (groundY < h + 40) {
          ctx.fillStyle = '#0F1E2E';
          ctx.fillRect(0, groundY, w, h - groundY + 60);
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(w / 2 - 120, groundY);
          ctx.lineTo(w / 2 + 120, groundY);
          ctx.stroke();
        }
      }

      // 3. Draw Orbit View Overlay if in orbit phase
      if (tel.phase === 'orbit') {
        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(w / 2, h + 180, w * 0.45, 290, 0, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#22D3EE';
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillText(
          `APOAPSIS ${Math.round(tel.apoapsisKm)} km  ·  PERIAPSIS ${Math.round(tel.periapsisKm)} km  ·  J2 Ω̇ ${tel.j2NodalRegressionDegDay.toFixed(2)}°/day`,
          20,
          30
        );
        ctx.restore();
      }

      // 4. Vehicle Transform & Drawing
      const centerX = w / 2;
      const centerY =
        tel.phase === 'prelaunch'
          ? h - 62
          : tel.phase === 'landed'
          ? h - 68
          : h * 0.54;

      const structPal = getMaterialPalette(cfg.structuralMaterialId);
      const tpsPal = getMaterialPalette(cfg.tpsMaterialId);
      const pressureRatio = Math.max(0, Math.min(1, tel.pressurePa / 101325));
      const gimbalRad = (tel.gimbalAngleDeg * Math.PI) / 180;

      // Drifting separated stages behind rocket
      for (const ds of animRef.current.driftingStages) {
        ctx.save();
        ctx.translate(centerX + ds.xOffset, centerY + ds.yOffset);
        ctx.rotate(ds.rot);
        ctx.globalAlpha = Math.min(1, ds.life / 2);
        ctx.fillStyle = ds.type === 'booster' ? '#CBD5E1' : structPal.mid;
        const dw = ds.type === 'booster' ? 14 : 28;
        const dh = ds.type === 'booster' ? 92 : 96;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }

      // Vehicle Orientation: vertical on pad, tilted by pitch during flight
      let visualTiltRad = 0;
      if (tel.phase !== 'prelaunch' && tel.phase !== 'landed') {
        if (tel.phase === 'edl_entry') {
          // Blunt heat-shield forward into velocity vector
          visualTiltRad = ((90 - tel.flightPathAngleDeg) * Math.PI) / 180 + Math.PI;
        } else if (tel.phase === 'edl_chute') {
          visualTiltRad = Math.sin(animRef.current.time * 1.6) * 0.08;
        } else {
          visualTiltRad = ((90 - tel.pitchAngleDeg) * Math.PI) / 180;
          // Clamp visual tilt so rocket remains readable on 2D stage
          visualTiltRad = Math.max(-1.25, Math.min(1.25, visualTiltRad));
        }
      }

      ctx.save();
      ctx.translate(centerX, centerY);

      // Parachutes in EDL Chute / Landed phase (drawn in world vertical above capsule)
      if (tel.phase === 'edl_chute' && tel.chuteState !== 'stowed') {
        const canopyW = tel.chuteState === 'main' ? 130 : 62;
        const canopyY = -125;
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(-canopyW * 0.45, canopyY);
        ctx.moveTo(0, -18);
        ctx.lineTo(canopyW * 0.45, canopyY);
        ctx.moveTo(0, -18);
        ctx.lineTo(0, canopyY - 10);
        ctx.stroke();

        // Ring-sail canopy
        ctx.fillStyle = tel.chuteState === 'main' ? '#EA580C' : '#F59E0B';
        ctx.beginPath();
        ctx.arc(0, canopyY, canopyW * 0.5, Math.PI, 2 * Math.PI);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.arc(0, canopyY, canopyW * 0.28, Math.PI, 2 * Math.PI);
        ctx.closePath();
        ctx.fill();
      }

      ctx.rotate(visualTiltRad);

      // Draw Entry Capsule for Orbit / Deorbit / EDL / Landed, OR Full Stack for Prelaunch & Ascent
      const isCapsuleOnly =
        tel.phase === 'edl_entry' ||
        tel.phase === 'edl_chute' ||
        tel.phase === 'landed' ||
        tel.phase === 'deorbit' ||
        tel.phase === 'orbit';

      if (isCapsuleOnly) {
        // Reentry Bow-Shock Plasma Sheath (scales with Sutton-Graves q_conv)
        if (tel.phase === 'edl_entry' && tel.convHeatFluxWm2 > 25000) {
          const plasmaNorm = Math.min(1, tel.convHeatFluxWm2 / 1400000);
          const glowGrad = ctx.createRadialGradient(0, -16, 12, 0, -16, 52 + plasmaNorm * 46);
          glowGrad.addColorStop(0, `rgba(255, 255, 240, ${0.75 * plasmaNorm})`);
          glowGrad.addColorStop(0.35, `rgba(251, 146, 60, ${0.65 * plasmaNorm})`);
          glowGrad.addColorStop(0.7, `rgba(239, 68, 68, ${0.32 * plasmaNorm})`);
          glowGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, -8, 54 + plasmaNorm * 42, Math.PI * 0.9, Math.PI * 2.1);
          ctx.fill();
        }

        // Blunt Capsule + Heat Shield
        ctx.fillStyle = tpsPal.mid;
        ctx.strokeStyle = tpsPal.stroke;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-26, 6);
        ctx.quadraticCurveTo(0, -14 - cfg.noseRadiusM * 2, 26, 6);
        ctx.lineTo(15, -24);
        ctx.lineTo(-15, -24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Heat shield bottom arc
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-26, 6);
        ctx.quadraticCurveTo(0, 16, 26, 6);
        ctx.stroke();

        // Service module in orbit/deorbit
        if (tel.phase === 'orbit' || tel.phase === 'deorbit') {
          ctx.fillStyle = '#475569';
          ctx.fillRect(-15, 10, 30, 26);
          // Solar wings
          ctx.fillStyle = '#1D4ED8';
          ctx.strokeStyle = '#60A5FA';
          ctx.lineWidth = 1;
          ctx.fillRect(-62, 16, 44, 12);
          ctx.strokeRect(-62, 16, 44, 12);
          ctx.fillRect(18, 16, 44, 12);
          ctx.strokeRect(18, 16, 44, 12);
          if (tel.phase === 'deorbit') {
            drawNozzle(ctx, 0, 36, 12, 12, 0, 0.5, 0);
          }
        }
      } else {
        // MULTI-STAGE LAUNCH VEHICLE ASSEMBLY STACK
        const baseBottom = tel.phase === 'prelaunch' ? -14 : 88;
        const showStage1 = tel.phase === 'prelaunch' || tel.phase === 'ascent_stage1';
        const showBoosters =
          cfg.boosterEngineId !== 'none' &&
          cfg.boosterCount > 0 &&
          (tel.phase === 'prelaunch' || (tel.phase === 'ascent_stage1' && tel.boosterFuelFrac > 0.005));

        const s1H = 104;
        const s2H = 56;
        const fairingH = 44;

        const coreW = 32;
        const s1Bottom = baseBottom;
        const s1Top = s1Bottom - s1H;
        const s2Bottom = showStage1 ? s1Top - 10 : baseBottom - 10;
        const s2Top = s2Bottom - s2H;
        const fairingTop = s2Top - fairingH;

        // 1. Side Boosters (if attached)
        if (showBoosters) {
          const bW = 15;
          const bH = 98;
          const bTop = s1Bottom - bH + 4;
          const offsets = cfg.boosterCount >= 4 ? [-30, -21, 21, 30] : [-25, 25];
          for (const bx of offsets) {
            // Attachment struts
            ctx.strokeStyle = '#94A3B8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(bx < 0 ? bx + bW / 2 : bx - bW / 2, bTop + 20);
            ctx.lineTo(bx < 0 ? -coreW / 2 : coreW / 2, bTop + 20);
            ctx.moveTo(bx < 0 ? bx + bW / 2 : bx - bW / 2, s1Bottom - 16);
            ctx.lineTo(bx < 0 ? -coreW / 2 : coreW / 2, s1Bottom - 16);
            ctx.stroke();

            // Booster tank body
            const bGrad = ctx.createLinearGradient(bx - bW / 2, 0, bx + bW / 2, 0);
            bGrad.addColorStop(0, '#94A3B8');
            bGrad.addColorStop(0.45, '#F1F5F9');
            bGrad.addColorStop(1, '#475569');
            ctx.fillStyle = bGrad;
            ctx.fillRect(bx - bW / 2, bTop, bW, bH);

            // Booster nose cone
            ctx.beginPath();
            ctx.moveTo(bx - bW / 2, bTop);
            ctx.lineTo(bx, bTop - 20);
            ctx.lineTo(bx + bW / 2, bTop);
            ctx.closePath();
            ctx.fill();

            // Booster segment stripes
            ctx.fillStyle = '#1E293B';
            for (let sy = bTop + 18; sy < s1Bottom - 8; sy += 20) {
              ctx.fillRect(bx - bW / 2, sy, bW, 2.5);
            }

            // Booster nozzle + plume
            const bThrust = tel.phase === 'ascent_stage1' ? 0.95 : 0;
            drawNozzle(ctx, bx, s1Bottom + 4, 14, 14, gimbalRad * 0.5, bThrust, pressureRatio);
          }
        }

        // 2. Stage 1 Core Tank
        if (showStage1) {
          const s1Grad = ctx.createLinearGradient(-coreW / 2, 0, coreW / 2, 0);
          s1Grad.addColorStop(0, structPal.dark);
          s1Grad.addColorStop(0.38, structPal.light);
          s1Grad.addColorStop(0.7, structPal.mid);
          s1Grad.addColorStop(1, structPal.dark);
          ctx.fillStyle = s1Grad;
          ctx.strokeStyle = structPal.stroke;
          ctx.lineWidth = 0.8;
          ctx.fillRect(-coreW / 2, s1Top, coreW, s1H);
          ctx.strokeRect(-coreW / 2, s1Top, coreW, s1H);

          // Corrugated tank ribs & intertank band
          ctx.fillStyle = structPal.band;
          ctx.fillRect(-coreW / 2, s1Top + 36, coreW, 12);
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
          for (let ry = s1Top + 8; ry < s1Bottom - 6; ry += 10) {
            ctx.beginPath();
            ctx.moveTo(-coreW / 2, ry);
            ctx.lineTo(coreW / 2, ry);
            ctx.stroke();
          }

          // Interstage adapter
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(-coreW / 2, s2Bottom, coreW, 10);

          // Stage 1 Nozzles
          const s1EngineVis = Math.min(3, cfg.stage1EngineCount);
          const s1Thrust = tel.phase === 'ascent_stage1' ? tel.throttle : 0;
          for (let e = 0; e < s1EngineVis; e++) {
            const ex = s1EngineVis === 1 ? 0 : (e - (s1EngineVis - 1) / 2) * 10;
            drawNozzle(ctx, ex, s1Bottom, 11, 13, gimbalRad, s1Thrust, pressureRatio);
          }
        }

        // 3. Stage 2 Tank
        const s2W = 28;
        const s2Grad = ctx.createLinearGradient(-s2W / 2, 0, s2W / 2, 0);
        s2Grad.addColorStop(0, '#64748B');
        s2Grad.addColorStop(0.4, '#F8FAFC');
        s2Grad.addColorStop(1, '#334155');
        ctx.fillStyle = s2Grad;
        ctx.fillRect(-s2W / 2, s2Top, s2W, s2H);

        // Stage 2 nozzle when active
        if (!showStage1) {
          const s2Thrust = tel.phase === 'ascent_stage2' ? tel.throttle : 0;
          drawNozzle(ctx, 0, s2Bottom, 14, 15, gimbalRad, s2Thrust, pressureRatio);
        }

        // 4. Tapered Nose Fairing / TPS Cap
        const fGrad = ctx.createLinearGradient(-s2W / 2, 0, s2W / 2, 0);
        fGrad.addColorStop(0, tpsPal.dark);
        fGrad.addColorStop(0.45, tpsPal.light);
        fGrad.addColorStop(1, tpsPal.dark);
        ctx.fillStyle = fGrad;
        ctx.strokeStyle = tpsPal.stroke;
        ctx.lineWidth = 1;
        const noseBluntness = Math.min(8, cfg.noseRadiusM * 2.5);
        ctx.beginPath();
        ctx.moveTo(-s2W / 2, s2Top);
        ctx.quadraticCurveTo(-s2W / 2, s2Top - fairingH * 0.65, -noseBluntness, fairingTop);
        ctx.quadraticCurveTo(0, fairingTop - 4, noseBluntness, fairingTop);
        ctx.quadraticCurveTo(s2W / 2, s2Top - fairingH * 0.65, s2W / 2, s2Top);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Transonic Prandtl-Glauert Vapor / Shock Cone (Mach 0.85 - 1.15 or Max-Q)
        if ((tel.mach >= 0.85 && tel.mach <= 1.18) || tel.dynamicPressureKpa > 28) {
          const coneAlpha = tel.mach >= 0.85 && tel.mach <= 1.18 ? 0.34 : 0.16;
          ctx.strokeStyle = `rgba(224, 242, 254, ${coneAlpha + 0.15})`;
          ctx.fillStyle = `rgba(224, 242, 254, ${coneAlpha})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, fairingTop - 6);
          ctx.lineTo(-56, s2Top + 26);
          ctx.quadraticCurveTo(0, s2Top + 14, 56, s2Top + 26);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();

      // 5. Force & Telemetry Vectors Overlay (Thrust, Drag, Lift, Velocity)
      if (vecs && tel.phase !== 'prelaunch' && tel.phase !== 'landed') {
        const refX = centerX;
        const refY = centerY;
        const pitchWorld = ((90 - tel.pitchAngleDeg) * Math.PI) / 180;
        const gammaWorld = ((90 - tel.flightPathAngleDeg) * Math.PI) / 180;

        // Thrust vector (green, offset slightly right for legibility)
        if (tel.thrustKN > 1) {
          const tLen = Math.min(125, 36 + Math.log10(tel.thrustKN + 1) * 22);
          drawVectorArrow(
            ctx,
            refX + 18,
            refY - 12,
            Math.sin(pitchWorld) * tLen,
            -Math.cos(pitchWorld) * tLen,
            '#10B981',
            `T ${Math.round(tel.thrustKN)} kN`
          );
        }
        // Drag vector (red, opposite velocity, offset left)
        if (tel.dragKN > 0.5) {
          const dLen = Math.min(95, 22 + Math.log10(tel.dragKN + 1) * 20);
          drawVectorArrow(
            ctx,
            refX - 24,
            refY + 8,
            -Math.sin(gammaWorld) * dLen,
            Math.cos(gammaWorld) * dLen,
            '#F43F5E',
            `D ${Math.round(tel.dragKN)} kN`
          );
        }
        // Lift vector (cyan, perpendicular to velocity)
        if (tel.liftKN > 0.2) {
          const lLen = Math.min(70, 18 + Math.log10(tel.liftKN + 1) * 16);
          drawVectorArrow(
            ctx,
            refX - 18,
            refY - 12,
            -Math.cos(gammaWorld) * lLen,
            -Math.sin(gammaWorld) * lLen,
            '#22D3EE',
            `L ${tel.liftKN.toFixed(1)} kN`
          );
        }
        // Velocity vector (yellow, offset slightly right-lower)
        if (tel.velocityMs > 5) {
          const vLen = Math.min(100, 26 + Math.log10(tel.velocityMs + 1) * 18);
          drawVectorArrow(
            ctx,
            refX + 26,
            refY + 14,
            Math.sin(gammaWorld) * vLen,
            -Math.cos(gammaWorld) * vLen,
            '#FACC15',
            `V ${Math.round(tel.velocityMs)} m/s`
          );
        }
      }

      ctx.restore();
    };

    paintFnRef = drawFrame;
    drawFrame(performance.now(), true);

    return () => {
      paintFnRef = null;
      redrawTriggerRef.current = () => {};
      animTickRef.current = () => {};
      observer.disconnect();
    };
  }, []);

  // Only drive continuous 30fps canvas animation loop during active, unpaused flight phases
  const isStaticCanvas =
    !isRunning ||
    telemetry.phase === 'prelaunch' ||
    telemetry.phase === 'landed' ||
    telemetry.phase === 'failed' ||
    Boolean(showMonteCarlo && monteCarloSummary);

  useEffect(() => {
    if (isStaticCanvas) return;
    let rafId = 0;
    const loop = () => {
      animTickRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isStaticCanvas]);

  const s1Eng = ENGINES[config.stage1EngineId];
  const s2Eng = ENGINES[config.stage2EngineId];
  const structMat = MATERIALS[config.structuralMaterialId];
  const tpsMat = MATERIALS[config.tpsMaterialId];

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-[#070B14]"
      data-testid="simulation-canvas-container"
    >
      <canvas ref={canvasRef} className="block h-full w-full cursor-crosshair" />

      {/* Top-left compact vehicle/stage readout (hidden during Monte Carlo plot) */}
      {!showMonteCarlo && (
        <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1 rounded border border-slate-800/90 bg-[#0B1120]/90 px-3 py-2 text-[11px]">
          <div className="font-display font-semibold text-slate-200">
            {config.stage1EngineCount}× {s1Eng.name} · {config.stage2EngineCount}× {s2Eng.name}
          </div>
          <div className="font-mono-tabular text-slate-400">
            Tank: {structMat.shortName} · TPS: {tpsMat.shortName} ({config.tpsThicknessMm} mm)
          </div>
        </div>
      )}

      {/* Top-right Canvas Overlay Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {monteCarloSummary && onToggleMonteCarlo && (
          <button
            type="button"
            onClick={onToggleMonteCarlo}
            className={`rounded border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              showMonteCarlo
                ? 'border-emerald-500 bg-emerald-950/70 text-emerald-300'
                : 'border-slate-700 bg-[#0B1120]/90 text-slate-300 hover:border-slate-500'
            }`}
          >
            {showMonteCarlo ? 'Vehicle View' : 'Monte Carlo Fan'}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleVectors}
          aria-pressed={showVectors}
          className={`rounded border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            showVectors
              ? 'border-cyan-500 bg-cyan-950/70 text-cyan-300'
              : 'border-slate-700 bg-[#0B1120]/90 text-slate-300 hover:border-slate-500'
          }`}
        >
          {showVectors ? 'Force Vectors: ON' : 'Force Vectors: OFF'}
        </button>
      </div>

      {/* Bottom Stage Fuel Bars when in flight */}
      {telemetry.phase !== 'prelaunch' && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800/90 bg-[#0B1120]/90 px-3 py-2 font-mono-tabular text-[11px]">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-400">S1 FUEL </span>
              <span className="text-cyan-300">{Math.round(telemetry.stage1FuelFrac * 100)}%</span>
            </div>
            {config.boosterEngineId !== 'none' && config.boosterCount > 0 && (
              <div>
                <span className="text-slate-400">SRB </span>
                <span className="text-amber-300">{Math.round(telemetry.boosterFuelFrac * 100)}%</span>
              </div>
            )}
            <div>
              <span className="text-slate-400">S2 FUEL </span>
              <span className="text-emerald-300">{Math.round(telemetry.stage2FuelFrac * 100)}%</span>
            </div>
          </div>
          <div className="text-slate-300 truncate max-w-md">
            {telemetry.eventsLog[0] ?? 'Telemetry nominal.'}
          </div>
        </div>
      )}
    </div>
  );
};
