// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Orbit,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import { ENGINES, MATERIALS, TARGET_MISSIONS } from '../data/nasaCatalog';
import {
  EngineId,
  MaterialId,
  MonteCarloSummary,
  PreFlightMetrics,
  TargetMissionId,
  TelemetryFrame,
  VehicleConfig,
  WeatherConfig,
} from '../types/simulation';

interface SandboxWorkflowProps {
  step: number;
  onStepChange: (step: number) => void;
  config: VehicleConfig;
  onConfigChange: (patch: Partial<VehicleConfig>) => void;
  weather: WeatherConfig;
  onWeatherChange: (patch: Partial<WeatherConfig>) => void;
  preFlight: PreFlightMetrics;
  telemetry: TelemetryFrame;
  isRunning: boolean;
  timeScale: number;
  onTimeScaleChange: (scale: number) => void;
  monteCarloSummary: MonteCarloSummary | null;
  onRunMonteCarlo: () => void;
  onLaunch: () => void;
  onPauseToggle: () => void;
  onResetPad: () => void;
  onTriggerDeorbit: () => void;
  onOrbitalAvoidanceBurn: () => void;
  orbitalEventActive: string | null;
}

const SANDBOX_STEPS = [
  '1. Budget',
  '2. Engines',
  '3. Materials',
  '4. Stages',
  '5. Weather',
  '6. Monte C.',
  '7. Angle/TVC',
  '8. Flight',
];

export const SandboxWorkflow: React.FC<SandboxWorkflowProps> = ({
  step,
  onStepChange,
  config,
  onConfigChange,
  weather,
  onWeatherChange,
  preFlight,
  telemetry,
  isRunning,
  timeScale,
  onTimeScaleChange,
  monteCarloSummary,
  onRunMonteCarlo,
  onLaunch,
  onPauseToggle,
  onResetPad,
  onTriggerDeorbit,
  onOrbitalAvoidanceBurn,
  orbitalEventActive,
}) => {
  const engineList = Object.values(ENGINES);
  const materialList = Object.values(MATERIALS);
  const targetList = Object.values(TARGET_MISSIONS);
  const s1Eng = ENGINES[config.stage1EngineId];
  const s2Eng = ENGINES[config.stage2EngineId];
  const bEng = config.boosterEngineId !== 'none' ? ENGINES[config.boosterEngineId] : null;

  return (
    <aside
      aria-label="Custom Mission Testing Pipeline"
      className="flex h-full flex-col justify-between border-r border-slate-800 bg-[#0B1120]"
    >
      {/* Step Navigation Pills / Tabs */}
      <div className="border-b border-slate-800 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Custom Mission Pipeline
          </span>
          <span className="font-mono-tabular text-[11px] text-slate-400">Step {step} / 8</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {SANDBOX_STEPS.map((label, idx) => {
            const stepNum = idx + 1;
            const active = step === stepNum;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onStepChange(stepNum)}
                className={`truncate rounded px-1.5 py-1.5 text-left text-[10px] font-medium transition-colors ${
                  active
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 1: Custom Budget &amp; Target Mission
            </h3>
            <div>
              <div className="flex items-center justify-between text-xs gap-2">
                <label htmlFor="sb-budget" className="text-slate-300">
                  Program Budget Ceiling ($M)
                </label>
                <div className="flex items-center gap-1">
                  <span className="font-mono-tabular text-xs text-slate-400">$</span>
                  <input
                    aria-label="Program Budget Numeric Input ($M)"
                    type="number"
                    min={20}
                    max={500}
                    step={5}
                    value={config.budgetM}
                    onChange={(e) => {
                      const val = Math.max(20, Math.min(500, Number(e.target.value) || 20));
                      onConfigChange({ budgetM: val });
                    }}
                    className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-right font-mono-tabular text-xs font-semibold text-cyan-300"
                  />
                  <span className="font-mono-tabular text-xs text-slate-400">M</span>
                </div>
              </div>
              <input
                id="sb-budget"
                type="range"
                min={20}
                max={500}
                step={5}
                value={config.budgetM}
                onChange={(e) => onConfigChange({ budgetM: Number(e.target.value) })}
                className="mt-2 w-full"
              />
              <div className="mt-1 flex justify-between font-mono-tabular text-[10px] text-slate-500">
                <span>$20M</span>
                <span>$250M</span>
                <span>$500M</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Target Mission Profile</span>
              {targetList.map((tm) => {
                const selected = config.targetMissionId === tm.id;
                return (
                  <button
                    key={tm.id}
                    type="button"
                    onClick={() =>
                      onConfigChange({
                        targetMissionId: tm.id as TargetMissionId,
                        payloadMassKg: tm.payloadMassKg,
                      })
                    }
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      selected
                        ? 'border-cyan-500 bg-cyan-950/35'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-semibold text-slate-100">{tm.name}</span>
                      <span className="font-mono-tabular text-[11px] text-cyan-300">
                        ~{tm.requiredDeltaV_ms.toLocaleString()} m/s
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{tm.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 2: Propulsion Component Selection
            </h3>

            <div>
              <label htmlFor="sb-s1-eng" className="block text-xs font-medium text-slate-300 mb-1">
                Stage 1 Core Engine
              </label>
              <select
                id="sb-s1-eng"
                value={config.stage1EngineId}
                onChange={(e) => onConfigChange({ stage1EngineId: e.target.value as EngineId })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
              >
                {engineList
                  .filter((e) => e.id !== 'aj10_190')
                  .map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name} ({eng.thrustSL_kN} kN SL · Isp {eng.ispSL}/{eng.ispVac}s)
                    </option>
                  ))}
              </select>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <label htmlFor="sb-s1-count" className="text-slate-400">
                  Stage 1 Engine Count
                </label>
                <span className="font-mono-tabular text-cyan-300">{config.stage1EngineCount}×</span>
              </div>
              <input
                id="sb-s1-count"
                type="range"
                min={1}
                max={9}
                value={config.stage1EngineCount}
                onChange={(e) => onConfigChange({ stage1EngineCount: Number(e.target.value) })}
                className="mt-1 w-full"
              />
              <p className="mt-1 text-[11px] text-slate-400 font-mono-tabular">
                {s1Eng.propellant} · {s1Eng.cycle} · ${s1Eng.unitCostM}M ea
              </p>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <label htmlFor="sb-booster-eng" className="block text-xs font-medium text-slate-300 mb-1">
                Side Boosters (Optional)
              </label>
              <select
                id="sb-booster-eng"
                value={config.boosterEngineId}
                onChange={(e) => {
                  const val = e.target.value as EngineId | 'none';
                  onConfigChange({
                    boosterEngineId: val,
                    boosterCount: val === 'none' ? 0 : Math.max(2, config.boosterCount),
                    boosterPropellantKg: val === 'none' ? 0 : Math.max(400000, config.boosterPropellantKg),
                  });
                }}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
              >
                <option value="none">No Side Boosters</option>
                <option value="sls_srb">SLS 5-Segment SRB (14,679 kN SL · Solid)</option>
                <option value="merlin1d">Merlin 1D Side Core (654 kN SL · LOX/RP-1)</option>
              </select>
              {config.boosterEngineId !== 'none' && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Booster Count</span>
                  <div className="flex gap-1.5">
                    {[2, 4].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => onConfigChange({ boosterCount: cnt })}
                        className={`rounded px-2.5 py-1 font-mono-tabular text-xs ${
                          config.boosterCount === cnt
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-900 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {cnt}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {bEng && (
                <p className="mt-1 text-[11px] text-slate-400 font-mono-tabular">
                  {bEng.citation} · ${bEng.unitCostM}M ea
                </p>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3">
              <label htmlFor="sb-s2-eng" className="block text-xs font-medium text-slate-300 mb-1">
                Stage 2 Upper Engine
              </label>
              <select
                id="sb-s2-eng"
                value={config.stage2EngineId}
                onChange={(e) => onConfigChange({ stage2EngineId: e.target.value as EngineId })}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
              >
                {engineList
                  .filter((e) => !e.isSolid)
                  .map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name} ({eng.thrustVac_kN} kN Vac · Isp {eng.ispVac}s)
                    </option>
                  ))}
              </select>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <label htmlFor="sb-s2-count" className="text-slate-400">
                  Stage 2 Engine Count
                </label>
                <span className="font-mono-tabular text-cyan-300">{config.stage2EngineCount}×</span>
              </div>
              <input
                id="sb-s2-count"
                type="range"
                min={1}
                max={6}
                value={config.stage2EngineCount}
                onChange={(e) => onConfigChange({ stage2EngineCount: Number(e.target.value) })}
                className="mt-1 w-full"
              />
              <p className="mt-1 text-[11px] text-slate-400 font-mono-tabular">
                {s2Eng.propellant} · {s2Eng.citation}
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 3: Structural &amp; TPS Material Selection
            </h3>

            <div>
              <span className="block text-xs font-medium text-slate-300 mb-2">
                Cryogenic Tank / Structural Alloy
              </span>
              <div className="space-y-2">
                {materialList.slice(0, 2).map((mat) => {
                  const selected = config.structuralMaterialId === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => onConfigChange({ structuralMaterialId: mat.id as MaterialId })}
                      className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                        selected
                          ? 'border-cyan-500 bg-cyan-950/35'
                          : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-100">{mat.name}</span>
                        <span className="font-mono-tabular text-[11px] text-amber-300">
                          Max {mat.maxTempK} K
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{mat.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <span className="block text-xs font-medium text-slate-300 mb-2">
                Thermal Protection System (TPS)
              </span>
              <div className="space-y-2">
                {materialList.map((mat) => {
                  const selected = config.tpsMaterialId === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => onConfigChange({ tpsMaterialId: mat.id as MaterialId })}
                      className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                        selected
                          ? 'border-cyan-500 bg-cyan-950/35'
                          : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-100">{mat.name}</span>
                        <span className="font-mono-tabular text-[11px] text-cyan-300">
                          Limit {mat.maxTempK} K · ε={mat.emissivity}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="sb-tps-mm" className="text-slate-300">
                    TPS Heat Shield Thickness
                  </label>
                  <span className="font-mono-tabular text-cyan-300">{config.tpsThicknessMm} mm</span>
                </div>
                <input
                  id="sb-tps-mm"
                  type="range"
                  min={20}
                  max={110}
                  step={2}
                  value={config.tpsThicknessMm}
                  onChange={(e) => onConfigChange({ tpsThicknessMm: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="sb-nose-r" className="text-slate-300">
                    Nose Bluntness Radius Rₙ (Sutton–Graves)
                  </label>
                  <span className="font-mono-tabular text-cyan-300">{config.noseRadiusM.toFixed(1)} m</span>
                </div>
                <input
                  id="sb-nose-r"
                  type="range"
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  value={config.noseRadiusM}
                  onChange={(e) => onConfigChange({ noseRadiusM: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 4: Fuel Sizing &amp; Launch Stage Creation
            </h3>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="sb-s1-prop" className="text-slate-300">
                  Stage 1 Propellant Mass
                </label>
                <span className="font-mono-tabular text-cyan-300">
                  {(config.stage1PropellantKg / 1000).toFixed(0)} t
                </span>
              </div>
              <input
                id="sb-s1-prop"
                type="range"
                min={80000}
                max={2200000}
                step={20000}
                value={config.stage1PropellantKg}
                onChange={(e) => onConfigChange({ stage1PropellantKg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            {config.boosterEngineId !== 'none' && config.boosterCount > 0 && (
              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="sb-b-prop" className="text-slate-300">
                    Boosters Total Propellant
                  </label>
                  <span className="font-mono-tabular text-amber-300">
                    {(config.boosterPropellantKg / 1000).toFixed(0)} t
                  </span>
                </div>
                <input
                  id="sb-b-prop"
                  type="range"
                  min={150000}
                  max={1600000}
                  step={25000}
                  value={config.boosterPropellantKg}
                  onChange={(e) => onConfigChange({ boosterPropellantKg: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="sb-s2-prop" className="text-slate-300">
                  Stage 2 Propellant Mass
                </label>
                <span className="font-mono-tabular text-emerald-300">
                  {(config.stage2PropellantKg / 1000).toFixed(0)} t
                </span>
              </div>
              <input
                id="sb-s2-prop"
                type="range"
                min={15000}
                max={600000}
                step={5000}
                value={config.stage2PropellantKg}
                onChange={(e) => onConfigChange({ stage2PropellantKg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="sb-payload" className="text-slate-300">
                  Payload Mass
                </label>
                <span className="font-mono-tabular text-slate-200">
                  {(config.payloadMassKg / 1000).toFixed(1)} t
                </span>
              </div>
              <input
                id="sb-payload"
                type="range"
                min={1000}
                max={55000}
                step={500}
                value={config.payloadMassKg}
                onChange={(e) => onConfigChange({ payloadMassKg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 font-mono-tabular text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Stage 1 Δv</span>
                <span className="text-slate-100">{Math.round(preFlight.stage1DeltaV_ms)} m/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Stage 2 Δv</span>
                <span className="text-slate-100">{Math.round(preFlight.stage2DeltaV_ms)} m/s</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1">
                <span className="text-cyan-300">Total Tsiolkovsky Δv</span>
                <span className="font-semibold text-cyan-300">{Math.round(preFlight.totalDeltaV_ms)} m/s</span>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 5: Launch Conditions &amp; Component Testing
            </h3>

            {/* Structural & Mass Checks */}
            <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Liftoff TWR (&gt; 1.15)</span>
                <span className={`font-mono-tabular font-semibold ${preFlight.liftoffTWR >= 1.15 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {preFlight.liftoffTWR.toFixed(2)} {preFlight.liftoffTWR >= 1.15 ? 'PASS' : 'LOW'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Δv vs Mission Target</span>
                <span className={`font-mono-tabular font-semibold ${preFlight.deltaVMargin_ms >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {preFlight.deltaVMargin_ms >= 0 ? '+' : ''}
                  {Math.round(preFlight.deltaVMargin_ms)} m/s
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Structural Mass Fraction</span>
                <span className="font-mono-tabular text-slate-200">
                  {(preFlight.structuralMassFraction * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Cape Canaveral Weather Sliders (NASA-STD-4010A) */}
            <div className="space-y-3 border-t border-slate-800 pt-3">
              <div className="text-xs font-medium text-slate-300">
                Cape Canaveral Weather Rules (NASA-STD-4010A)
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="sb-wind" className="text-slate-400">
                    162-ft Pad Wind (≤ 30 mph)
                  </label>
                  <span className={`font-mono-tabular ${weather.windSpeedMph <= 30 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {weather.windSpeedMph} mph
                  </span>
                </div>
                <input
                  id="sb-wind"
                  type="range"
                  min={2}
                  max={45}
                  value={weather.windSpeedMph}
                  onChange={(e) => onWeatherChange({ windSpeedMph: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="sb-efield" className="text-slate-400">
                    Electric Field Mill (±1,000 V/m)
                  </label>
                  <span className={`font-mono-tabular ${Math.abs(weather.electricFieldVm) <= 1000 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {weather.electricFieldVm > 0 ? '+' : ''}
                    {weather.electricFieldVm} V/m
                  </span>
                </div>
                <input
                  id="sb-efield"
                  type="range"
                  min={-1600}
                  max={1600}
                  step={50}
                  value={weather.electricFieldVm}
                  onChange={(e) => onWeatherChange({ electricFieldVm: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <label htmlFor="sb-lightning" className="text-slate-400">
                    Lightning Standoff (&gt; 10 nmi)
                  </label>
                  <span className={`font-mono-tabular ${weather.lightningDistanceNmi > 10 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {weather.lightningDistanceNmi} nmi
                  </span>
                </div>
                <input
                  id="sb-lightning"
                  type="range"
                  min={2}
                  max={50}
                  value={weather.lightningDistanceNmi}
                  onChange={(e) => onWeatherChange({ lightningDistanceNmi: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={weather.anvilClear}
                  onChange={(e) => onWeatherChange({ anvilClear: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                />
                <span>Anvil &amp; Disturbed Weather Corridor Clear</span>
              </label>

              {preFlight.weatherViolations.length > 0 && (
                <div className="rounded border border-rose-500/40 bg-rose-950/40 p-2.5 text-[11px] text-rose-200 space-y-1">
                  {preFlight.weatherViolations.map((v) => (
                    <div key={v} className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-400" aria-hidden="true" />
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 6: 100-Trial Monte Carlo Probability Simulation
            </h3>
            <p className="text-xs leading-relaxed text-slate-400">
              Executes 100 randomized ascent trajectories varying wind shear (±25%), USSA76 atmospheric density (±8%),
              and engine Isp (±1.5%) to compute empirical flight probability and plot the dispersion fan.
            </p>
            <button
              type="button"
              onClick={onRunMonteCarlo}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              <Activity className="h-4 w-4" aria-hidden="true" />
              <span>Run 100-Trial Monte Carlo Sim</span>
            </button>

            {monteCarloSummary ? (
              <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3 space-y-2 text-xs font-mono-tabular">
                <div className="flex justify-between">
                  <span className="text-slate-400">Empirical Success Rate</span>
                  <span className="font-bold text-emerald-400">
                    {monteCarloSummary.empiricalSuccessPct}% ({monteCarloSummary.successCount}/100)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mean Max-Q</span>
                  <span className="text-slate-100">{monteCarloSummary.meanMaxQKpa} kPa</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">95th Percentile Max-Q</span>
                  <span className={monteCarloSummary.p95MaxQKpa > 38 ? 'text-amber-400' : 'text-slate-100'}>
                    {monteCarloSummary.p95MaxQKpa} kPa
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mean Peak Wall Temp</span>
                  <span className="text-slate-100">{monteCarloSummary.meanPeakTempK} K</span>
                </div>
              </div>
            ) : (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
                No Monte Carlo batch executed yet. Click above to generate the 100-trial dispersion fan on the canvas.
              </div>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 7: Launch Angle &amp; Thrust Vector Control (TVC)
            </h3>
            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="sb-angle" className="text-slate-300">
                  Gravity Turn Pitch-Over Kick Angle
                </label>
                <span className="font-mono-tabular text-cyan-300">{config.launchAngleDeg.toFixed(1)}°</span>
              </div>
              <input
                id="sb-angle"
                type="range"
                min={2}
                max={16}
                step={0.5}
                value={config.launchAngleDeg}
                onChange={(e) => onConfigChange({ launchAngleDeg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.tvcEnabled}
                onChange={(e) => onConfigChange({ tvcEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              <span>Enable Active Thrust Vector Control (TVC)</span>
            </label>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="sb-gimbal" className="text-slate-300">
                  TVC Gimbal Limit (RS-25 Spec ±11°)
                </label>
                <span className="font-mono-tabular text-cyan-300">±{config.tvcGimbalLimitDeg}°</span>
              </div>
              <input
                id="sb-gimbal"
                type="range"
                min={1}
                max={11}
                step={1}
                disabled={!config.tvcEnabled}
                value={config.tvcGimbalLimitDeg}
                onChange={(e) => onConfigChange({ tvcGimbalLimitDeg: Number(e.target.value) })}
                className="mt-1 w-full"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.maxQThrottleBucket}
                onChange={(e) => onConfigChange({ maxQThrottleBucket: e.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              />
              <span>Auto Max-Q Throttle Bucket (72% through q &gt; 22 kPa)</span>
            </label>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-4">
            <h3 className="font-display text-sm font-semibold text-white">
              Step 8: Flight Execution · Orbit · EDL
            </h3>

            {/* Flight Phase Controls */}
            <div className="flex flex-wrap gap-2">
              {telemetry.phase === 'prelaunch' ? (
                <button
                  type="button"
                  onClick={onLaunch}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-500"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>Ignite &amp; Launch</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onPauseToggle}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isRunning ? 'Pause Sim' : 'Resume Sim'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResetPad}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                </>
              )}
            </div>

            {/* Time Warp Selector */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Simulation Time Warp</span>
              <div className="flex gap-1">
                {[1, 2, 5, 10].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => onTimeScaleChange(spd)}
                    className={`rounded px-2 py-1 font-mono-tabular text-[11px] ${
                      timeScale === spd
                        ? 'bg-cyan-600 text-white'
                        : 'border border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>

            {/* Orbital Phase Card */}
            {telemetry.phase === 'orbit' && (
              <div className="rounded-md border border-cyan-500/40 bg-cyan-950/25 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                  <Orbit className="h-4 w-4" aria-hidden="true" />
                  <span>Orbit Operations &amp; J2 Propagation</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono-tabular text-[11px]">
                  <div>
                    <div className="text-slate-400">Apoapsis / Periapsis</div>
                    <div className="text-slate-100">
                      {Math.round(telemetry.apoapsisKm)} × {Math.round(telemetry.periapsisKm)} km
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">J2 Nodal Regression Ω̇</div>
                    <div className="text-slate-100">{telemetry.j2NodalRegressionDegDay.toFixed(2)}°/day</div>
                  </div>
                </div>

                {orbitalEventActive && (
                  <div className="rounded border border-amber-500/50 bg-amber-950/40 p-2.5 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      <span>Orbital Contingency Alert</span>
                    </div>
                    <p className="text-[11px] text-amber-100">{orbitalEventActive}</p>
                    <button
                      type="button"
                      onClick={onOrbitalAvoidanceBurn}
                      className="w-full rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
                    >
                      Execute Avoidance / Shield Burn
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onTriggerDeorbit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500"
                >
                  <Flame className="h-4 w-4" aria-hidden="true" />
                  <span>Trigger Deorbit Burn &amp; Begin EDL</span>
                </button>
              </div>
            )}

            {/* EDL Status Card */}
            {(telemetry.phase === 'deorbit' ||
              telemetry.phase === 'edl_entry' ||
              telemetry.phase === 'edl_chute') && (
              <div className="rounded-md border border-amber-500/40 bg-amber-950/25 p-3 space-y-1.5 font-mono-tabular text-xs">
                <div className="font-display font-semibold text-amber-300">
                  Atmospheric Entry, Descent &amp; Landing
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sutton–Graves q̇</span>
                  <span className="text-slate-100">{(telemetry.convHeatFluxWm2 / 1000).toFixed(1)} kW/m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Parachute System</span>
                  <span className="uppercase text-cyan-300">{telemetry.chuteState}</span>
                </div>
              </div>
            )}

            {/* Flight Event Log */}
            <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Flight Event Log
              </div>
              <ul className="space-y-1 font-mono-tabular text-[11px] text-slate-300 max-h-36 overflow-y-auto">
                {telemetry.eventsLog.map((ev, i) => (
                  <li key={`${i}-${ev.slice(0, 12)}`} className="flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-cyan-500" aria-hidden="true" />
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Step Navigation Footer */}
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

        {step < 8 ? (
          <button
            type="button"
            onClick={() => onStepChange(Math.min(8, step + 1))}
            className="inline-flex items-center gap-1 rounded bg-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            <span>Next Step</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="font-mono-tabular text-[11px] text-emerald-400">Flight Console Active</span>
        )}
      </div>
    </aside>
  );
};
