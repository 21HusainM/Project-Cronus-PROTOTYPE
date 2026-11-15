// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React from 'react';
import { AlertTriangle, CheckCircle2, Flame, ShieldAlert } from 'lucide-react';
import { MATERIALS } from '../data/nasaCatalog';
import { PreFlightMetrics, TelemetryFrame, VehicleConfig } from '../types/simulation';

interface LiveTelemetryHUDProps {
  config: VehicleConfig;
  preFlight: PreFlightMetrics;
  telemetry: TelemetryFrame;
  monteCarloPct: number | null;
}

export const LiveTelemetryHUD: React.FC<LiveTelemetryHUDProps> = ({
  config,
  preFlight,
  telemetry,
  monteCarloPct,
}) => {
  const tpsMat = MATERIALS[config.tpsMaterialId];
  const wallTempK = telemetry.wallTempK;
  const maxTempK = tpsMat.maxTempK;
  const thermalRatio = Math.min(1.2, wallTempK / maxTempK);
  const thermalPct = Math.min(100, Math.round(thermalRatio * 100));

  const thermalStatus =
    thermalRatio >= 0.95
      ? { label: 'CRITICAL', colorClass: 'text-rose-400', barClass: 'bg-rose-500' }
      : thermalRatio >= 0.72
      ? { label: 'ELEVATED', colorClass: 'text-amber-400', barClass: 'bg-amber-500' }
      : { label: 'NOMINAL', colorClass: 'text-emerald-400', barClass: 'bg-emerald-500' };

  const displayedProb = monteCarloPct !== null ? monteCarloPct : preFlight.successProbabilityPct;
  const probStatus =
    displayedProb >= 75
      ? { label: 'GO', textClass: 'text-emerald-400', barClass: 'bg-emerald-500' }
      : displayedProb >= 50
      ? { label: 'CAUTION', textClass: 'text-amber-400', barClass: 'bg-amber-500' }
      : { label: 'NO-GO RISK', textClass: 'text-rose-400', barClass: 'bg-rose-500' };

  const isMaxQAlert = telemetry.dynamicPressureKpa > 35;

  return (
    <aside
      aria-label="Live Engineering Telemetry and Probability Interface"
      className="flex h-full flex-col justify-between gap-3 overflow-y-auto border-l border-slate-800 bg-[#0B1120] p-4"
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
            Live Engineering Interface
          </h2>
          <span className="font-mono-tabular text-[11px] uppercase text-cyan-400">
            {telemetry.phase.replace('_', ' ')}
          </span>
        </div>

        {/* Mission Success Probability Gauge */}
        <div className="rounded-md border border-slate-800 bg-[#0F172A] p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              {monteCarloPct !== null ? 'Monte Carlo Success Prob.' : 'Mission Success Prob.'}
            </span>
            <span className={`font-mono-tabular text-[11px] font-semibold ${probStatus.textClass}`}>
              {probStatus.label}
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono-tabular text-3xl font-bold text-slate-100">{displayedProb}%</span>
            <span className="font-mono-tabular text-xs text-slate-400">
              TWR {preFlight.liftoffTWR.toFixed(2)} · Δv {Math.round(preFlight.totalDeltaV_ms)} m/s
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-slate-800">
            <div
              className={`h-full transition-all duration-200 ${probStatus.barClass}`}
              style={{ width: `${Math.min(100, Math.max(2, displayedProb))}%` }}
            />
          </div>

          <div className="mt-2.5 grid grid-cols-5 gap-1 text-center font-mono-tabular text-[10px] text-slate-400">
            <div className="rounded bg-slate-900/90 py-1">
              <div className="text-slate-500">TWR</div>
              <div className="text-slate-200">{preFlight.riskBreakdown.twrScore}</div>
            </div>
            <div className="rounded bg-slate-900/90 py-1">
              <div className="text-slate-500">Δv</div>
              <div className="text-slate-200">{preFlight.riskBreakdown.deltaVScore}</div>
            </div>
            <div className="rounded bg-slate-900/90 py-1">
              <div className="text-slate-500">LCC</div>
              <div className="text-slate-200">{preFlight.riskBreakdown.weatherScore}</div>
            </div>
            <div className="rounded bg-slate-900/90 py-1">
              <div className="text-slate-500">STR</div>
              <div className="text-slate-200">{preFlight.riskBreakdown.structuralScore}</div>
            </div>
            <div className="rounded bg-slate-900/90 py-1">
              <div className="text-slate-500">TPS</div>
              <div className="text-slate-200">{preFlight.riskBreakdown.thermalScore}</div>
            </div>
          </div>
        </div>

        {/* Live Atmospheric & Flight Telemetry */}
        <div className="rounded-md border border-slate-800 bg-[#0F172A] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              USSA76 &amp; Flight Kinematics
            </span>
            <span className="font-mono-tabular text-[11px] text-slate-400">
              T+{telemetry.simTimeS.toFixed(1)} s
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-slate-900/80 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Altitude</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100">
                {(telemetry.altitudeM / 1000).toFixed(2)}{' '}
                <span className="text-[11px] font-normal text-slate-400">km</span>
              </div>
            </div>

            <div className="rounded bg-slate-900/80 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Velocity / Mach</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-100">
                {Math.round(telemetry.velocityMs)}{' '}
                <span className="text-[11px] font-normal text-slate-400">m/s</span>
                <span className="ml-1.5 text-xs text-cyan-400">M {telemetry.mach.toFixed(2)}</span>
              </div>
            </div>

            <div className="rounded bg-slate-900/80 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Barometer Pₐ</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {telemetry.pressurePa >= 100
                  ? `${Math.round(telemetry.pressurePa).toLocaleString()} Pa`
                  : `${telemetry.pressurePa.toFixed(2)} Pa`}
              </div>
            </div>

            <div className="rounded bg-slate-900/80 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Air Density ρ</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {telemetry.densityKgM3 >= 0.01
                  ? telemetry.densityKgM3.toFixed(3)
                  : telemetry.densityKgM3.toExponential(2)}{' '}
                <span className="text-[10px] font-normal text-slate-400">kg/m³</span>
              </div>
            </div>

            <div
              className={`rounded px-2.5 py-2 ${
                isMaxQAlert ? 'border border-amber-500/60 bg-amber-950/30' : 'bg-slate-900/80'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                <span>Dynamic q</span>
                {isMaxQAlert && <span className="font-semibold text-amber-400">MAX-Q</span>}
              </div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {telemetry.dynamicPressureKpa.toFixed(1)}{' '}
                <span className="text-[10px] font-normal text-slate-400">kPa</span>
              </div>
            </div>

            <div className="rounded bg-slate-900/80 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">G-Load</div>
              <div className="font-mono-tabular text-sm font-semibold text-slate-100">
                {telemetry.gLoad.toFixed(2)}{' '}
                <span className="text-[10px] font-normal text-slate-400">g</span>
              </div>
            </div>

            <div className="col-span-2 rounded bg-slate-900/80 px-2.5 py-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                <span>Forces (Thrust / Drag / Net)</span>
                <span className="font-mono-tabular text-cyan-400">
                  Gimbal {telemetry.gimbalAngleDeg >= 0 ? '+' : ''}
                  {telemetry.gimbalAngleDeg.toFixed(1)}°
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between font-mono-tabular text-xs font-semibold">
                <span className="text-emerald-400">{Math.round(telemetry.thrustKN)} kN</span>
                <span className="text-rose-400">-{Math.round(telemetry.dragKN)} kN</span>
                <span className="text-slate-100">Net {Math.round(telemetry.netForceKN)} kN</span>
              </div>
            </div>
          </div>
        </div>

        {/* Material & Thermal Monitor */}
        <div className="rounded-md border border-slate-800 bg-[#0F172A] p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-400">
              <Flame className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>TPS Wall Temp</span>
            </span>
            <span className={`font-mono-tabular text-[11px] font-semibold ${thermalStatus.colorClass}`}>
              {thermalStatus.label}
            </span>
          </div>

          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="font-mono-tabular text-lg font-bold text-slate-100">
              {Math.round(wallTempK)} K
            </span>
            <span className="font-mono-tabular text-xs text-slate-400">
              Limit: {maxTempK} K ({tpsMat.shortName})
            </span>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-slate-800">
            <div
              className={`h-full transition-all duration-150 ${thermalStatus.barClass}`}
              style={{ width: `${thermalPct}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between font-mono-tabular text-[11px] text-slate-400">
            <span>Stagnation q̇</span>
            <span className="text-slate-200">
              {telemetry.convHeatFluxWm2 > 1000
                ? `${(telemetry.convHeatFluxWm2 / 1000).toFixed(1)} kW/m²`
                : `${Math.round(telemetry.convHeatFluxWm2)} W/m²`}
            </span>
          </div>
          {telemetry.rfBlackout && (
            <div className="mt-2 flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-950/40 px-2 py-1 text-[11px] font-medium text-rose-300">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Plasma Sheath RF Blackout Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Weather / Budget Quick Status Footer */}
      <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Budget Utilization</span>
          <span className={`font-mono-tabular font-semibold ${preFlight.withinBudget ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${preFlight.totalCostM.toFixed(1)}M / ${config.budgetM}M
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-slate-400">Weather LCC</span>
          <span className={`inline-flex items-center gap-1 font-mono-tabular font-semibold ${preFlight.weatherGo ? 'text-emerald-400' : 'text-rose-400'}`}>
            {preFlight.weatherGo ? (
              <>
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>GO FOR LAUNCH</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <span>HOLD ({preFlight.weatherViolations.length})</span>
              </>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
};
