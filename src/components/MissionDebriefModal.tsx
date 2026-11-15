// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React from 'react';
import { Award, AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { MissionDebrief } from '../types/simulation';

interface MissionDebriefModalProps {
  debrief: MissionDebrief | null;
  onRetry: () => void;
  onReturnOpening: () => void;
}

export const MissionDebriefModal: React.FC<MissionDebriefModalProps> = ({
  debrief,
  onRetry,
  onReturnOpening,
}) => {
  if (!debrief) return null;

  const isPass = debrief.grade !== 'F';
  const gradeColor =
    debrief.grade === 'S'
      ? 'text-cyan-300 border-cyan-500/50 bg-cyan-950/50'
      : debrief.grade === 'A'
      ? 'text-emerald-300 border-emerald-500/50 bg-emerald-950/50'
      : debrief.grade === 'B' || debrief.grade === 'C'
      ? 'text-amber-300 border-amber-500/50 bg-amber-950/50'
      : 'text-rose-300 border-rose-500/50 bg-rose-950/50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debrief-modal-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-[#0B1120] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isPass ? (
              <Award className="h-6 w-6 text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Post-Flight Engineering Debrief
              </p>
              <h2 id="debrief-modal-title" className="font-display text-xl font-bold text-slate-100">
                {debrief.outcomeTitle}
              </h2>
            </div>
          </div>

          <div
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md border ${gradeColor}`}
          >
            <span className="text-[10px] uppercase tracking-wider opacity-80">Grade</span>
            <span className="font-display text-2xl font-bold leading-none">{debrief.grade}</span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">{debrief.summary}</p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Orbit Achieved</div>
            <div className="mt-1 font-mono-tabular text-sm font-semibold text-slate-100">
              {Math.round(debrief.achievedApoapsisKm)} × {Math.max(0, Math.round(debrief.achievedPeriapsisKm))} km
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Max-Q Load</div>
            <div className="mt-1 font-mono-tabular text-sm font-semibold text-slate-100">
              {debrief.maxQKpa.toFixed(1)} kPa
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Peak Wall Temp</div>
            <div className="mt-1 font-mono-tabular text-sm font-semibold text-slate-100">
              {Math.round(debrief.peakWallTempK)} K
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Touchdown Speed</div>
            <div className="mt-1 font-mono-tabular text-sm font-semibold text-slate-100">
              {debrief.touchdownSpeedMs.toFixed(1)} m/s
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 col-span-2 sm:col-span-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Anomalies Resolved</div>
            <div className="mt-1 font-mono-tabular text-sm font-semibold text-slate-100">
              {debrief.anomaliesHandled} / {debrief.anomaliesTotal} Events
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onReturnOpening}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
          >
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mission Select</span>
          </button>
          <button
            type="button"
            onClick={onRetry}
            data-start="true"
            className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Fly Again</span>
          </button>
        </div>
      </div>
    </div>
  );
};
