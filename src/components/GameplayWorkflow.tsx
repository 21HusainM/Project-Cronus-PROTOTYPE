// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gauge,
  Orbit,
  Play,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { ENGINES, HISTORICAL_MISSIONS, MATERIALS } from '../data/nasaCatalog';
import {
  ActiveAnomaly,
  HistoricalMissionId,
  MaterialId,
  PreFlightMetrics,
  TelemetryFrame,
  VehicleConfig,
} from '../types/simulation';

interface GameplayWorkflowProps {
  step: number;
  onStepChange: (step: number) => void;
  missionId: HistoricalMissionId;
  onSelectMission: (id: HistoricalMissionId) => void;
  selectedWindowId: string;
  onSelectWindow: (windowId: string) => void;
  config: VehicleConfig;
  onConfigChange: (patch: Partial<VehicleConfig>) => void;
  preFlight: PreFlightMetrics;
  telemetry: TelemetryFrame;
  isRunning: boolean;
  manualThrottle: number;
  onManualThrottleChange: (val: number) => void;
  manualPitchBias: number;
  onManualPitchBiasChange: (val: number) => void;
  activeAnomaly: ActiveAnomaly | null;
  onResolveAnomaly: (optionId: string) => void;
  onLaunch: () => void;
  onResetPad: () => void;
  onTriggerDeorbit: () => void;
}

const GAMEPLAY_STEPS = [
  '1. Mission',
  '2. Ship Config',
  '3. Weather',
  '4. Angle',
  '5. Thrust & Flight',
  '6. Orbit & EDL',
];

export const GameplayWorkflow: React.FC<GameplayWorkflowProps> = ({
  step,
  onStepChange,
  missionId,
  onSelectMission,
  selectedWindowId,
  onSelectWindow,
  config,
  onConfigChange,
  preFlight,
  telemetry,
  isRunning,
  manualThrottle,
  onManualThrottleChange,
  manualPitchBias,
  onManualPitchBiasChange,
  activeAnomaly,
  onResolveAnomaly,
  onLaunch,
  onResetPad,
  onTriggerDeorbit,
}) => {
  const missions = Object.values(HISTORICAL_MISSIONS);
  const currentMission = HISTORICAL_MISSIONS[missionId];
  const s1Eng = ENGINES[config.stage1EngineId];

  return (
    <aside
      aria-label="Historical Mission Gameplay Pipeline"
      className="flex h-full flex-col justify-between border-r border-slate-800 bg-[#0B1120]"
    >
      {/* Step Header */}
      <div className="border-b border-slate-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs font-semibold uppercase tracking-wider text-amber-400">
            Historical Mission Command
          </span>
          <span className="font-mono-tabular text-[11px] text-slate-400">Step {step} / 6</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {GAMEPLAY_STEPS.map((label, idx) => {
            const stepNum = idx + 1;
            const active = step === stepNum;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onStepChange(stepNum)}
                className={`truncate rounded px-2 py-1.5 text-left text-[10px] font-medium transition-colors ${
                  active
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {step === 1 && (
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 1: Past Mission Selection (Locked Era Budgets)
            </h3>
            {missions.map((m) => {
              const selected = m.id === missionId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMission(m.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selected
                      ? 'border-amber-500 bg-amber-950/30'
                      : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-slate-100">{m.title}</span>
                    <span className="font-mono-tabular text-[11px] text-amber-300">
                      ${m.lockedBudgetM}M Cap
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono-tabular text-[10px] text-cyan-400">
                    {m.eraLabel} · Target {m.targetOrbitKm.toLocaleString()} km @ {m.inclinationDeg}°
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.brief}</p>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">
                Step 2: Era Ship Configuration
              </h3>
              <span className="font-mono-tabular text-xs text-amber-300">
                Budget Cap: ${currentMission.lockedBudgetM}M
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="gp-payload" className="text-slate-300">
                  Mission Payload Mass
                </label>
                <span className="font-mono-tabular text-cyan-300">
                  {(config.payloadMassKg / 1000).toFixed(1)} t
                </span>
              </div>
              <input
                id="gp-payload"
                type="range"
                min={10000}
                max={50000}
                step={1000}
                value={config.payloadMassKg}
                onChange={(e) => onConfigChange({ payloadMassKg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="gp-s1-prop" className="text-slate-300">
                  Stage 1 Propellant Load
                </label>
                <span className="font-mono-tabular text-cyan-300">
                  {(config.stage1PropellantKg / 1000).toFixed(0)} t
                </span>
              </div>
              <input
                id="gp-s1-prop"
                type="range"
                min={500000}
                max={2200000}
                step={25000}
                value={config.stage1PropellantKg}
                onChange={(e) => onConfigChange({ stage1PropellantKg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1.5">
                Era-Authorized TPS Material
              </span>
              <div className="space-y-1.5">
                {currentMission.allowedMaterials.map((matId) => {
                  const mat = MATERIALS[matId];
                  const selected = config.tpsMaterialId === matId;
                  return (
                    <button
                      key={matId}
                      type="button"
                      onClick={() => onConfigChange({ tpsMaterialId: matId as MaterialId })}
                      className={`w-full rounded border p-2 text-left text-xs ${
                        selected
                          ? 'border-amber-500 bg-amber-950/30 text-slate-100'
                          : 'border-slate-800 bg-slate-900/70 text-slate-400'
                      }`}
                    >
                      <div className="flex justify-between">
                        <span className="font-semibold">{mat.name}</span>
                        <span className="font-mono-tabular text-cyan-300">{mat.maxTempK} K</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="gp-tps-mm" className="text-slate-300">
                  Thermal Shield Thickness
                </label>
                <span className="font-mono-tabular text-cyan-300">{config.tpsThicknessMm} mm</span>
              </div>
              <input
                id="gp-tps-mm"
                type="range"
                min={30}
                max={100}
                step={2}
                value={config.tpsThicknessMm}
                onChange={(e) => onConfigChange({ tpsThicknessMm: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <div className="rounded border border-slate-800 bg-slate-900/70 p-2.5 text-xs font-mono-tabular">
              <div className="flex justify-between">
                <span className="text-slate-400">Configured Cost</span>
                <span className={preFlight.withinBudget ? 'text-emerald-400' : 'text-rose-400'}>
                  ${preFlight.totalCostM.toFixed(1)}M / ${currentMission.lockedBudgetM}M
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 3: Launch Window Weather &amp; Success Probability
            </h3>
            <div className="space-y-2">
              {currentMission.windows.map((win) => {
                const selected = win.id === selectedWindowId;
                return (
                  <button
                    key={win.id}
                    type="button"
                    onClick={() => onSelectWindow(win.id)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      selected
                        ? 'border-amber-500 bg-amber-950/30'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="font-display text-xs font-semibold text-slate-100">{win.label}</div>
                    <p className="mt-1 text-[11px] text-slate-400">{win.summary}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-900/80 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">Pre-Launch Success Probability</span>
                <span className="font-mono-tabular text-xl font-bold text-cyan-300">
                  {preFlight.successProbabilityPct}%
                </span>
              </div>
              {preFlight.weatherViolations.length > 0 ? (
                <div className="text-[11px] text-rose-300 space-y-1">
                  {preFlight.weatherViolations.map((v) => (
                    <div key={v} className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-400" aria-hidden="true" />
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>All NASA-STD-4010A Weather Commit Criteria Satisfied</span>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 4: Launch Angle &amp; Inclination Alignment
            </h3>
            <p className="text-xs leading-relaxed text-slate-400">
              Target orbit inclination for {currentMission.title} is{' '}
              <span className="font-mono-tabular text-cyan-300">{currentMission.inclinationDeg}°</span>. Adjust the
              initial gravity-turn pitch kick to balance aerodynamic Max-Q against gravity losses.
            </p>
            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="gp-angle" className="text-slate-300">
                  Launch Pitch-Over Angle
                </label>
                <span className="font-mono-tabular text-cyan-300">{config.launchAngleDeg.toFixed(1)}°</span>
              </div>
              <input
                id="gp-angle"
                type="range"
                min={3}
                max={14}
                step={0.5}
                value={config.launchAngleDeg}
                onChange={(e) => onConfigChange({ launchAngleDeg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>
          </div>
        )}

        {(step === 5 || step === 6) && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              {step === 5 ? 'Step 5: Live Thrust Control & Flight Problems' : 'Step 6: Orbit & Reentry Control'}
            </h3>

            {telemetry.phase === 'prelaunch' ? (
              <button
                type="button"
                onClick={onLaunch}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>Commit &amp; Launch Mission</span>
              </button>
            ) : (
              <div className="space-y-3">
                {/* Active Throttle & Pitch/TVC Controls */}
                <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-cyan-300">
                      <Gauge className="h-4 w-4" aria-hidden="true" />
                      <span>Manual Flight Controls</span>
                    </span>
                    <button
                      type="button"
                      onClick={onResetPad}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Abort / Reset</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="gp-throttle" className="text-slate-300">
                        Main Engine Throttle
                      </label>
                      <span className="font-mono-tabular text-emerald-300">
                        {Math.round(manualThrottle * 100)}%
                      </span>
                    </div>
                    <input
                      id="gp-throttle"
                      type="range"
                      min={Math.round(s1Eng.minThrottle * 100)}
                      max={Math.round(s1Eng.maxThrottle * 100)}
                      value={Math.round(manualThrottle * 100)}
                      onChange={(e) => onManualThrottleChange(Number(e.target.value) / 100)}
                      className="mt-1 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <label htmlFor="gp-pitch" className="text-slate-300">
                        Manual Pitch / TVC Trim
                      </label>
                      <span className="font-mono-tabular text-cyan-300">
                        {manualPitchBias > 0 ? '+' : ''}
                        {manualPitchBias.toFixed(1)}°
                      </span>
                    </div>
                    <input
                      id="gp-pitch"
                      type="range"
                      min={-6}
                      max={6}
                      step={0.5}
                      value={manualPitchBias}
                      onChange={(e) => onManualPitchBiasChange(Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </div>
                </div>

                {/* Active Mid-Flight Problem / Anomaly Alert */}
                {activeAnomaly && !activeAnomaly.resolved && (
                  <div className="rounded-md border border-rose-500/70 bg-rose-950/40 p-3 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
                      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>FLIGHT ANOMALY: {activeAnomaly.title}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-100">{activeAnomaly.description}</p>
                    <div className="space-y-1.5">
                      {activeAnomaly.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onResolveAnomaly(opt.id)}
                          className="w-full rounded border border-rose-400/50 bg-slate-900/90 px-3 py-2 text-left text-xs transition-colors hover:bg-rose-900/40"
                        >
                          <div className="font-semibold text-white">{opt.label}</div>
                          <div className="text-[10px] text-slate-300">{opt.effectDescription}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Orbit Control Action */}
                {telemetry.phase === 'orbit' && (
                  <div className="rounded-md border border-cyan-500/40 bg-cyan-950/25 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                      <Orbit className="h-4 w-4" aria-hidden="true" />
                      <span>Orbital Insertion Confirmed</span>
                    </div>
                    <p className="font-mono-tabular text-[11px] text-slate-300">
                      Orbit {Math.round(telemetry.apoapsisKm)} × {Math.round(telemetry.periapsisKm)} km · J2 Ω̇{' '}
                      {telemetry.j2NodalRegressionDegDay.toFixed(2)}°/day
                    </p>
                    <button
                      type="button"
                      onClick={onTriggerDeorbit}
                      className="inline-flex w-full items-center justify-center gap-2 rounded bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                    >
                      <Flame className="h-4 w-4" aria-hidden="true" />
                      <span>Execute Deorbit Burn &amp; Reentry</span>
                    </button>
                  </div>
                )}

                {/* Live Barometer & Force Summary */}
                <div className="rounded border border-slate-800 bg-slate-900/60 p-2.5 font-mono-tabular text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Barometer</span>
                    <span className="text-slate-100">{Math.round(telemetry.pressurePa).toLocaleString()} Pa</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Thrust / Drag</span>
                    <span className="text-slate-100">
                      {Math.round(telemetry.thrustKN)} kN / {Math.round(telemetry.dragKN)} kN
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Flight Status</span>
                    <span className="text-cyan-300">{isRunning ? 'ACTIVE TELEMETRY' : 'PAUSED'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Step Navigation */}
      <div className="flex items-center justify-between border-t border-slate-800 bg-[#0B1120] px-4 py-3">
        <button
          type="button"
          disabled={step <= 1}
          onClick={() => onStepChange(Math.max(1, step - 1))}
          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 disabled:opacity-40 hover:bg-slate-800"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back</span>
        </button>

        {step < 6 ? (
          <button
            type="button"
            onClick={() => onStepChange(Math.min(6, step + 1))}
            className="inline-flex items-center gap-1 rounded bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
          >
            <span>Next Step</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="font-mono-tabular text-[11px] text-amber-300">Command Active</span>
        )}
      </div>
    </aside>
  );
};
