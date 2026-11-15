// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React, { useEffect, useRef } from 'react';
import { BookOpen, Compass, Rocket, User } from 'lucide-react';

interface OpeningScreenProps {
  callsign: string;
  onCallsignChange: (value: string) => void;
  onSelectSandbox: () => void;
  onSelectGameplay: () => void;
  onOpenCitations: () => void;
}

export const OpeningScreen: React.FC<OpeningScreenProps> = ({
  callsign,
  onCallsignChange,
  onSelectSandbox,
  onSelectGameplay,
  onOpenCitations,
}) => {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    let rafId = 0;
    let t = 0;
    let lastDraw = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      lastDraw = 0;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      rafId = requestAnimationFrame(draw);
      if (lastDraw !== 0 && now - lastDraw < 42) return;
      lastDraw = now;
      t += 0.016;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#070B14';
      ctx.fillRect(0, 0, w, h);

      // Coordinate Grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Earth Limb & Orbital Trajectories
      const cx = w * 0.5;
      const cy = h * 1.18;
      const earthR = Math.min(w, h) * 0.68;

      const limbGrad = ctx.createRadialGradient(cx, cy, earthR - 25, cx, cy, earthR + 40);
      limbGrad.addColorStop(0, '#091529');
      limbGrad.addColorStop(0.65, '#0F294A');
      limbGrad.addColorStop(0.85, 'rgba(6, 182, 212, 0.26)');
      limbGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = limbGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, earthR + 40, Math.PI, 2 * Math.PI);
      ctx.fill();

      // Three concentric/inclined orbital arcs
      const orbits = [
        { rx: earthR * 1.25, ry: earthR * 0.92, rot: -0.14, color: 'rgba(6, 182, 212, 0.28)', speed: 0.38 },
        { rx: earthR * 1.46, ry: earthR * 1.05, rot: 0.08, color: 'rgba(56, 189, 248, 0.18)', speed: 0.24 },
        { rx: earthR * 1.65, ry: earthR * 1.16, rot: -0.05, color: 'rgba(245, 158, 11, 0.16)', speed: 0.16 },
      ];

      orbits.forEach((orb, idx) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(orb.rot);
        ctx.strokeStyle = orb.color;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, orb.rx, orb.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Orbiting spacecraft marker
        const theta = Math.PI * 1.32 + t * orb.speed + idx * 1.1;
        const sx = orb.rx * Math.cos(theta);
        const sy = orb.ry * Math.sin(theta);
        ctx.fillStyle = idx === 2 ? '#F59E0B' : '#22D3EE';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.restore();
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden bg-[#070B14] text-slate-100">
      <canvas
        ref={bgCanvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 h-full w-full"
      />

      {/* Top utility strip */}
      <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 bg-[#070B14]/80 px-6 py-3">
        <div className="font-display text-sm font-semibold tracking-wide text-slate-200">
          Orbital Dynamics &amp; Entry Engineering Simulator
        </div>
        <button
          type="button"
          onClick={onOpenCitations}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/60 hover:text-cyan-300"
        >
          <BookOpen className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span>Engineering Equations &amp; Citations</span>
        </button>
      </div>

      {/* Main Centered Mission Control Selector */}
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-10">
        <div className="max-w-2xl text-center">
          <p className="font-mono-tabular text-xs uppercase tracking-widest text-cyan-400">
            2026 Space Apps Engineering Workspace · USSA76 · Sutton–Graves · J2 Orbital
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl text-balance">
            Mission Control &amp; Flight Simulation Console
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
            Design multi-stage launch vehicles, evaluate Cape Canaveral launch commit weather rules, execute 100-trial
            Monte Carlo dispersion tests, and fly real-time orbital insertion and atmospheric entry.
          </p>
        </div>

        {/* Optional Engineering Callsign Input */}
        <div className="mt-6 flex w-full max-w-sm items-center gap-2 rounded-md border border-slate-800 bg-[#0B1120]/95 px-3 py-2">
          <User className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <label htmlFor="callsign-input" className="sr-only">
            Engineering Callsign (optional)
          </label>
          <input
            id="callsign-input"
            type="text"
            value={callsign}
            onChange={(e) => onCallsignChange(e.target.value)}
            placeholder="Engineering Callsign (optional, saved locally)"
            maxLength={28}
            className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Two Prominent Mode Cards Branching from Center (per UI Map) */}
        <div className="mt-8 grid w-full grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left Branch: Sandbox / Custom Mission Testing */}
          <section className="flex flex-col justify-between rounded-lg border border-slate-700/90 bg-[#0B1120]/95 p-6 transition-colors hover:border-cyan-500/70">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono-tabular text-xs uppercase tracking-wider text-cyan-400">
                  Left Branch · 8-Step Engineering Pipeline
                </span>
                <Rocket className="h-5 w-5 text-cyan-400" aria-hidden="true" />
              </div>
              <h2 className="mt-2 font-display text-xl font-bold text-white">
                Sandbox / Custom Mission Testing
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Design from scratch with custom budgets, materials, staging, TVC, and Monte Carlo probability testing.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-slate-400 font-mono-tabular">
                <li>1. Budget ($20M–$500M) &amp; Target Orbit (LEO / GTO / TLI)</li>
                <li>2. Verified Engines, Structural &amp; TPS Material Selection</li>
                <li>3. Stage Propellant Sizing &amp; Weather LCC Verification</li>
                <li>4. 100-Trial Monte Carlo, TVC (±11°), Orbit &amp; EDL</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onSelectSandbox}
              data-start="true"
              className="mt-6 w-full rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              Launch Custom Mission Testing
            </button>
          </section>

          {/* Right Branch: Historical Mission Gameplay */}
          <section className="flex flex-col justify-between rounded-lg border border-slate-700/90 bg-[#0B1120]/95 p-6 transition-colors hover:border-amber-500/70">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono-tabular text-xs uppercase tracking-wider text-amber-400">
                  Right Branch · 6-Step Flight Command
                </span>
                <Compass className="h-5 w-5 text-amber-400" aria-hidden="true" />
              </div>
              <h2 className="mt-2 font-display text-xl font-bold text-white">
                Historical Mission Gameplay
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Command classic missions using era-authentic budgets, historical spacecraft components, and live flight
                anomalies.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-slate-400 font-mono-tabular">
                <li>1. Apollo Lunar Orbit · STS Deployment · Artemis Cislunar</li>
                <li>2. Era-Locked Budgets &amp; Authentic Component Pools</li>
                <li>3. Launch Window Selection &amp; Success Probability Preview</li>
                <li>4. Manual Throttle/Pitch, Live Barometer &amp; Anomaly Control</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onSelectGameplay}
              className="mt-6 w-full rounded-md border border-amber-500/70 bg-amber-600/20 px-4 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-600/35 focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              Start Historical Mission Gameplay
            </button>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-slate-800/80 bg-[#070B14]/80 px-6 py-2.5 text-center text-[11px] text-slate-400">
        SI-assisted simulation grounded in NASA-TM-X-74335 (USSA76), NASA TR R-376 (Sutton–Graves), NASA-STD-4010A, and GSFC Orbit Primer.
      </footer>
    </div>
  );
};
