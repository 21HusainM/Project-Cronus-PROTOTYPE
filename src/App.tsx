// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Home } from 'lucide-react';
import { CitationsModal } from './components/CitationsModal';
import { GameplayWorkflow } from './components/GameplayWorkflow';
import { LiveTelemetryHUD } from './components/LiveTelemetryHUD';
import { MissionDebriefModal } from './components/MissionDebriefModal';
import { OpeningScreen } from './components/OpeningScreen';
import { SandboxWorkflow } from './components/SandboxWorkflow';
import { SpacecraftCanvas } from './components/SpacecraftCanvas';
import { HISTORICAL_MISSIONS, MATERIALS } from './data/nasaCatalog';
import {
  createInitialTelemetry,
  evaluatePreFlightMetrics,
  runMonteCarloSimulations,
  stepFlightSimulation,
} from './physics/nasaPhysics';
import {
  ActiveAnomaly,
  AppMode,
  HistoricalMissionId,
  MissionDebrief,
  MonteCarloSummary,
  TelemetryFrame,
  VehicleConfig,
  WeatherConfig,
} from './types/simulation';

const DEFAULT_SANDBOX_CONFIG: VehicleConfig = {
  budgetM: 280,
  targetMissionId: 'leo_iss',
  stage1EngineId: 'rs25',
  stage1EngineCount: 3,
  stage1PropellantKg: 720000,
  boosterEngineId: 'sls_srb',
  boosterCount: 2,
  boosterPropellantKg: 900000,
  stage2EngineId: 'rl10b2',
  stage2EngineCount: 2,
  stage2PropellantKg: 42000,
  structuralMaterialId: 'al_li_2195',
  tpsMaterialId: 'pica_x',
  tpsThicknessMm: 58,
  payloadMassKg: 12000,
  launchAngleDeg: 7.5,
  tvcEnabled: true,
  tvcGimbalLimitDeg: 11,
  maxQThrottleBucket: true,
  stageSepVelocityRatio: 0.72,
  noseRadiusM: 1.5,
  referenceAreaM2: 60,
};

const DEFAULT_WEATHER: WeatherConfig = {
  windSpeedMph: 12,
  electricFieldVm: 180,
  lightningDistanceNmi: 35,
  cloudTempC: 10,
  anvilClear: true,
};

export default function App() {
  const initialAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [mode, setMode] = useState<AppMode>(initialAutostart ? 'sandbox' : 'opening');
  const [callsign, setCallsign] = useState<string>(() => {
    try {
      return localStorage.getItem('ode_callsign') || '';
    } catch {
      return '';
    }
  });

  const [citationsOpen, setCitationsOpen] = useState(false);

  // Sandbox state
  const [sandboxStep, setSandboxStep] = useState(1);
  const [sandboxConfig, setSandboxConfig] = useState<VehicleConfig>(DEFAULT_SANDBOX_CONFIG);
  const [sandboxWeather, setSandboxWeather] = useState<WeatherConfig>(DEFAULT_WEATHER);
  const [monteCarloSummary, setMonteCarloSummary] = useState<MonteCarloSummary | null>(null);
  const [showMonteCarloCanvas, setShowMonteCarloCanvas] = useState(false);

  // Gameplay state
  const [gameplayStep, setGameplayStep] = useState(1);
  const [historicalMissionId, setHistoricalMissionId] = useState<HistoricalMissionId>('artemis_cislunar');
  const [gameplayConfig, setGameplayConfig] = useState<VehicleConfig>(
    HISTORICAL_MISSIONS.artemis_cislunar.defaultConfig
  );
  const [selectedWindowId, setSelectedWindowId] = useState<string>(
    HISTORICAL_MISSIONS.artemis_cislunar.windows[0].id
  );
  const [manualThrottle, setManualThrottle] = useState(1.0);
  const [manualPitchBias, setManualPitchBias] = useState(0);
  const [activeAnomaly, setActiveAnomaly] = useState<ActiveAnomaly | null>(null);
  const [anomaliesTriggered, setAnomaliesTriggered] = useState<string[]>([]);
  const [anomaliesResolvedCount, setAnomaliesResolvedCount] = useState(0);

  // Shared active simulation state
  const activeConfig = mode === 'gameplay' ? gameplayConfig : sandboxConfig;
  const activeWeather = useMemo(() => {
    if (mode !== 'gameplay') return sandboxWeather;
    const mission = HISTORICAL_MISSIONS[historicalMissionId];
    return (
      mission.windows.find((w) => w.id === selectedWindowId)?.weather ?? mission.windows[0].weather
    );
  }, [mode, sandboxWeather, historicalMissionId, selectedWindowId]);

  const preFlight = useMemo(
    () => evaluatePreFlightMetrics(activeConfig, activeWeather),
    [activeConfig, activeWeather]
  );

  const [telemetry, setTelemetry] = useState<TelemetryFrame>(() =>
    createInitialTelemetry(DEFAULT_SANDBOX_CONFIG)
  );
  const telemetryRef = useRef<TelemetryFrame>(telemetry);
  const [isRunning, setIsRunning] = useState(false);
  const [timeScale, setTimeScale] = useState(2);
  const [showVectors, setShowVectors] = useState(true);
  const [orbitalEventActive, setOrbitalEventActive] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<MissionDebrief | null>(null);

  // Sync body dataset state for testability and shell coherence
  useEffect(() => {
    if (mode === 'opening') {
      document.body.dataset.state = 'title';
    } else if (debrief) {
      document.body.dataset.state = 'gameover';
    } else if (isRunning) {
      document.body.dataset.state = 'playing';
    } else {
      document.body.dataset.state = mode;
    }
  }, [mode, debrief, isRunning]);

  const handleCallsignChange = useCallback((val: string) => {
    setCallsign(val);
    try {
      localStorage.setItem('ode_callsign', val);
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const resetSimulationToPad = useCallback(
    (cfg: VehicleConfig) => {
      const fresh = createInitialTelemetry(cfg);
      telemetryRef.current = fresh;
      setTelemetry(fresh);
      setIsRunning(false);
      setDebrief(null);
      setOrbitalEventActive(null);
      setActiveAnomaly(null);
      setAnomaliesTriggered([]);
      setAnomaliesResolvedCount(0);
      setManualThrottle(1.0);
      setManualPitchBias(0);
    },
    []
  );

  // Switch modes cleanly
  const enterSandbox = useCallback(() => {
    setMode('sandbox');
    setShowMonteCarloCanvas(false);
    resetSimulationToPad(sandboxConfig);
  }, [resetSimulationToPad, sandboxConfig]);

  const enterGameplay = useCallback(() => {
    setMode('gameplay');
    setShowMonteCarloCanvas(false);
    resetSimulationToPad(gameplayConfig);
  }, [resetSimulationToPad, gameplayConfig]);

  const handleSelectHistoricalMission = useCallback(
    (id: HistoricalMissionId) => {
      const m = HISTORICAL_MISSIONS[id];
      setHistoricalMissionId(id);
      setGameplayConfig(m.defaultConfig);
      setSelectedWindowId(m.windows[0].id);
      resetSimulationToPad(m.defaultConfig);
    },
    [resetSimulationToPad]
  );

  // Update telemetry prelaunch mass when editing config on pad
  useEffect(() => {
    if (telemetryRef.current.phase === 'prelaunch') {
      const fresh = createInitialTelemetry(activeConfig);
      telemetryRef.current = fresh;
      setTelemetry(fresh);
    }
  }, [activeConfig]);

  const handleLaunch = useCallback(() => {
    setShowMonteCarloCanvas(false);
    const initial = createInitialTelemetry(activeConfig);
    initial.phase = 'ascent_stage1';
    initial.eventsLog = [`T+0s: Liftoff! Main engines at full thrust (TWR ${preFlight.liftoffTWR.toFixed(2)}).`];
    telemetryRef.current = initial;
    setTelemetry(initial);
    setDebrief(null);
    setIsRunning(true);
    if (mode === 'sandbox') setSandboxStep(8);
    if (mode === 'gameplay' && gameplayStep < 5) setGameplayStep(5);
  }, [activeConfig, preFlight.liftoffTWR, mode, gameplayStep]);

  const handleTriggerDeorbit = useCallback(() => {
    const cur = telemetryRef.current;
    if (cur.phase !== 'orbit') return;
    const next: TelemetryFrame = {
      ...cur,
      phase: 'deorbit',
      eventsLog: [`T+${Math.round(cur.simTimeS)}s: Deorbit burn initiated.`, ...cur.eventsLog].slice(0, 12),
    };
    telemetryRef.current = next;
    setTelemetry(next);
    setOrbitalEventActive(null);
    setIsRunning(true);
    if (mode === 'gameplay') setGameplayStep(6);
  }, [mode]);

  const handleRunMonteCarlo = useCallback(() => {
    const summary = runMonteCarloSimulations(sandboxConfig, sandboxWeather, 100);
    setMonteCarloSummary(summary);
    setShowMonteCarloCanvas(true);
  }, [sandboxConfig, sandboxWeather]);

  const handleOrbitalAvoidanceBurn = useCallback(() => {
    const cur = telemetryRef.current;
    const next: TelemetryFrame = {
      ...cur,
      apoapsisKm: cur.apoapsisKm + 14,
      periapsisKm: cur.periapsisKm + 8,
      eventsLog: [
        `T+${Math.round(cur.simTimeS)}s: RCS conjunction avoidance maneuver executed (Pc reduced < 10⁻⁷).`,
        ...cur.eventsLog,
      ].slice(0, 12),
    };
    telemetryRef.current = next;
    setTelemetry(next);
    setOrbitalEventActive(null);
  }, []);

  const handleResolveAnomaly = useCallback(
    (optionId: string) => {
      if (!activeAnomaly) return;
      const opt = activeAnomaly.options.find((o) => o.id === optionId);
      if (!opt) return;

      if (opt.action === 'throttle_down') {
        setManualThrottle(0.72);
      } else if (opt.action === 'tvc_compensate') {
        setManualPitchBias(1.5);
      } else if (opt.action === 'pitch_up_edl') {
        setManualPitchBias(3.5);
      }

      const cur = telemetryRef.current;
      const next: TelemetryFrame = {
        ...cur,
        eventsLog: [
          `T+${Math.round(cur.simTimeS)}s: Anomaly resolved — ${opt.label}.`,
          ...cur.eventsLog,
        ].slice(0, 12),
      };
      telemetryRef.current = next;
      setTelemetry(next);
      setActiveAnomaly({ ...activeAnomaly, resolved: true, chosenOptionLabel: opt.label });
      setAnomaliesResolvedCount((c) => c + 1);
    },
    [activeAnomaly]
  );

  // Refs for latest loop parameters
  const loopParamsRef = useRef({
    isRunning,
    timeScale,
    activeConfig,
    activeWeather,
    mode,
    manualThrottle,
    manualPitchBias,
    anomaliesTriggered,
    anomaliesResolvedCount,
    orbitalEventActive,
  });
  loopParamsRef.current = {
    isRunning,
    timeScale,
    activeConfig,
    activeWeather,
    mode,
    manualThrottle,
    manualPitchBias,
    anomaliesTriggered,
    anomaliesResolvedCount,
    orbitalEventActive,
  };

  const lastSyncedPhaseRef = useRef(telemetry.phase);

  // 60Hz Flight Integration Loop with throttled React HUD updates (~15Hz), active only while running
  useEffect(() => {
    if (!isRunning) return;
    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;

    const tick = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const p = loopParamsRef.current;
      if (p.isRunning) {
        const simDt = rawDt * (p.mode === 'gameplay' ? Math.max(2, p.timeScale) : Math.max(2.5, p.timeScale * 2));
        const subSteps = Math.max(1, Math.min(8, Math.ceil(simDt / 0.25)));
        const subDt = simDt / subSteps;

        let frame = telemetryRef.current;
        for (let s = 0; s < subSteps; s++) {
          frame = stepFlightSimulation(frame, {
            dtS: subDt,
            config: p.activeConfig,
            weather: p.activeWeather,
            manualThrottleOverride: p.mode === 'gameplay' ? p.manualThrottle : null,
            manualPitchBiasDeg: p.mode === 'gameplay' ? p.manualPitchBias : 0,
          });
          if (frame.phase === 'landed' || frame.phase === 'failed') break;
        }
        telemetryRef.current = frame;

        // Check mid-flight anomaly triggers in Gameplay mode
        if (p.mode === 'gameplay') {
          if (
            frame.phase === 'ascent_stage1' &&
            frame.dynamicPressureKpa > 24 &&
            !p.anomaliesTriggered.includes('maxq_spike')
          ) {
            setAnomaliesTriggered((prev) => [...prev, 'maxq_spike']);
            setActiveAnomaly({
              id: 'maxq_spike',
              phase: 'ascent',
              title: 'Max-Q Dynamic Load Surge',
              description:
                'Transonic wind shear raised dynamic pressure above nominal envelope. Throttle back engines or adjust TVC trim.',
              severity: 'warning',
              resolved: false,
              options: [
                {
                  id: 'opt_throttle',
                  label: 'Throttle Back to 72%',
                  effectDescription: 'Reduces aerodynamic load through Max-Q bucket.',
                  action: 'throttle_down',
                },
                {
                  id: 'opt_tvc',
                  label: 'Engage TVC Pitch Compensation (+1.5°)',
                  effectDescription: 'Reduces angle-of-attack crosswind shear.',
                  action: 'tvc_compensate',
                },
              ],
            });
          } else if (
            frame.phase === 'orbit' &&
            !p.anomaliesTriggered.includes('orbit_cme')
          ) {
            setAnomaliesTriggered((prev) => [...prev, 'orbit_cme']);
            setActiveAnomaly({
              id: 'orbit_cme',
              phase: 'orbit',
              title: 'DONKI Solar CME & Conjunction Alert',
              description:
                'Debris fragment conjunction Pc = 2.4×10⁻⁴ (> 10⁻⁴ CARA threshold) and elevated solar flux detected.',
              severity: 'caution',
              resolved: false,
              options: [
                {
                  id: 'opt_avoid',
                  label: 'Fire RCS Avoidance & Orient Arrays',
                  effectDescription: 'Clears conjunction corridor and stabilizes thermal balance.',
                  action: 'rcs_avoid',
                },
              ],
            });
          } else if (
            frame.phase === 'edl_entry' &&
            frame.convHeatFluxWm2 > 320000 &&
            !p.anomaliesTriggered.includes('edl_heat')
          ) {
            setAnomaliesTriggered((prev) => [...prev, 'edl_heat']);
            setActiveAnomaly({
              id: 'edl_heat',
              phase: 'edl',
              title: 'Peak Stagnation Heating Spike',
              description:
                'Sutton–Graves convective flux climbing rapidly. Increase lift-bank pitch trim to loft trajectory.',
              severity: 'warning',
              resolved: false,
              options: [
                {
                  id: 'opt_loft',
                  label: 'Command Lifting Entry Trim (+3.5°)',
                  effectDescription: 'Increases aerodynamic lift to reduce peak heating rate.',
                  action: 'pitch_up_edl',
                },
              ],
            });
          }
        }

        // Sandbox orbital contingency prompt
        if (
          p.mode === 'sandbox' &&
          frame.phase === 'orbit' &&
          !p.orbitalEventActive &&
          !p.anomaliesTriggered.includes('sb_orbit')
        ) {
          setAnomaliesTriggered((prev) => [...prev, 'sb_orbit']);
          setOrbitalEventActive(
            'ORDEM 3.2 / CARA Conjunction Advisory (Pc = 1.8×10⁻⁴) + Solar Particle Event detected in LEO band.'
          );
        }

        // End-of-flight Debrief evaluation
        if (frame.phase === 'landed' || frame.phase === 'failed') {
          setIsRunning(false);
          setTelemetry(frame);

          const tpsMat = MATERIALS[p.activeConfig.tpsMaterialId];
          const thermalSafe = frame.peakWallTempK <= tpsMat.maxTempK;
          const softLanding = frame.phase === 'landed' && frame.velocityMs < 14;
          const orbitAchieved = frame.apoapsisKm >= 150;

          let grade: MissionDebrief['grade'] = 'F';
          let outcomeTitle = 'Mission Failure — Thermal / Structural Loss';
          let summary = `Vehicle exceeded ${tpsMat.shortName} thermal limit (${Math.round(frame.peakWallTempK)} K > ${tpsMat.maxTempK} K).`;

          if (frame.phase === 'landed') {
            if (softLanding && thermalSafe && orbitAchieved && frame.maxQReachedKpa < 42) {
              grade = 'S';
              outcomeTitle = 'Nominal Orbital Flight & Precision Touchdown';
              summary =
                'All USSA76 ascent, J2 orbital insertion, Sutton–Graves entry thermal margins, and parachute touchdown targets achieved cleanly.';
            } else if (softLanding && thermalSafe) {
              grade = 'A';
              outcomeTitle = 'Mission Accomplished — Safe Recovery';
              summary =
                'Spacecraft completed atmospheric entry and safe canopy touchdown within structural and thermal tolerances.';
            } else if (frame.velocityMs < 24) {
              grade = 'B';
              outcomeTitle = 'Hard Landing — Crew & Payload Survived';
              summary = `Touchdown at ${frame.velocityMs.toFixed(1)} m/s with minor off-nominal Max-Q or thermal excursion.`;
            } else {
              grade = 'C';
              outcomeTitle = 'Off-Nominal Recovery';
              summary = `Vehicle recovered at ${frame.velocityMs.toFixed(1)} m/s after exceeding design envelope margins.`;
            }
          }

          setDebrief({
            grade,
            outcomeTitle,
            summary,
            achievedApoapsisKm: Math.max(0, frame.apoapsisKm),
            achievedPeriapsisKm: Math.max(0, frame.periapsisKm),
            maxQKpa: frame.maxQReachedKpa,
            peakWallTempK: frame.peakWallTempK,
            touchdownSpeedMs: frame.velocityMs,
            anomaliesHandled: p.anomaliesResolvedCount,
            anomaliesTotal: p.anomaliesTriggered.length,
          });
        }

        hudSyncAccum += rawDt;
        if (hudSyncAccum >= 0.066 || frame.phase !== lastSyncedPhaseRef.current) {
          hudSyncAccum = 0;
          lastSyncedPhaseRef.current = frame.phase;
          setTelemetry({ ...frame });
        }
      }

      if (loopParamsRef.current.isRunning) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning]);

  if (mode === 'opening') {
    return (
      <>
        <OpeningScreen
          callsign={callsign}
          onCallsignChange={handleCallsignChange}
          onSelectSandbox={enterSandbox}
          onSelectGameplay={enterGameplay}
          onOpenCitations={() => setCitationsOpen(true)}
        />
        <CitationsModal isOpen={citationsOpen} onClose={() => setCitationsOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#070B14] text-slate-100">
      {/* Compact Workspace Ribbon */}
      <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-[#0B1120] px-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => {
              setIsRunning(false);
              setMode('opening');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap shrink-0"
          >
            <Home className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
            <span>Mission Control</span>
          </button>

          <span className="text-slate-700" aria-hidden="true">
            |
          </span>

          <div className="flex items-center gap-1 rounded bg-slate-900 p-0.5">
            <button
              type="button"
              onClick={enterSandbox}
              className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                mode === 'sandbox' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Custom Mission Testing
            </button>
            <button
              type="button"
              onClick={enterGameplay}
              className={`rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                mode === 'gameplay' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Historical Gameplay
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {callsign.trim() && (
            <span className="hidden sm:inline font-mono-tabular text-[11px] text-slate-400">
              ENG: {callsign.trim()}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCitationsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-500/60 hover:text-cyan-300 whitespace-nowrap"
          >
            <BookOpen className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
            <span>Equations &amp; Citations</span>
          </button>
        </div>
      </header>

      {/* Main 3-Zone Split Console: Left Workflow Stepper | Center 2D Canvas | Right Persistent Live Telemetry HUD */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr_320px]">
        <div className="min-h-0 overflow-hidden">
          {mode === 'sandbox' ? (
            <SandboxWorkflow
              step={sandboxStep}
              onStepChange={(s) => {
                setSandboxStep(s);
                if (s !== 6) setShowMonteCarloCanvas(false);
              }}
              config={sandboxConfig}
              onConfigChange={(patch) => setSandboxConfig((prev) => ({ ...prev, ...patch }))}
              weather={sandboxWeather}
              onWeatherChange={(patch) => setSandboxWeather((prev) => ({ ...prev, ...patch }))}
              preFlight={preFlight}
              telemetry={telemetry}
              isRunning={isRunning}
              timeScale={timeScale}
              onTimeScaleChange={setTimeScale}
              monteCarloSummary={monteCarloSummary}
              onRunMonteCarlo={handleRunMonteCarlo}
              onLaunch={handleLaunch}
              onPauseToggle={() => setIsRunning((r) => !r)}
              onResetPad={() => resetSimulationToPad(sandboxConfig)}
              onTriggerDeorbit={handleTriggerDeorbit}
              onOrbitalAvoidanceBurn={handleOrbitalAvoidanceBurn}
              orbitalEventActive={orbitalEventActive}
            />
          ) : (
            <GameplayWorkflow
              step={gameplayStep}
              onStepChange={setGameplayStep}
              missionId={historicalMissionId}
              onSelectMission={handleSelectHistoricalMission}
              selectedWindowId={selectedWindowId}
              onSelectWindow={setSelectedWindowId}
              config={gameplayConfig}
              onConfigChange={(patch) => setGameplayConfig((prev) => ({ ...prev, ...patch }))}
              preFlight={preFlight}
              telemetry={telemetry}
              isRunning={isRunning}
              manualThrottle={manualThrottle}
              onManualThrottleChange={setManualThrottle}
              manualPitchBias={manualPitchBias}
              onManualPitchBiasChange={setManualPitchBias}
              activeAnomaly={activeAnomaly}
              onResolveAnomaly={handleResolveAnomaly}
              onLaunch={handleLaunch}
              onResetPad={() => resetSimulationToPad(gameplayConfig)}
              onTriggerDeorbit={handleTriggerDeorbit}
            />
          )}
        </div>

        <main className="relative min-h-[340px] min-w-0 overflow-hidden">
          <SpacecraftCanvas
            config={activeConfig}
            telemetry={telemetry}
            showVectors={showVectors}
            onToggleVectors={() => setShowVectors((v) => !v)}
            showMonteCarlo={mode === 'sandbox' && showMonteCarloCanvas}
            monteCarloSummary={mode === 'sandbox' ? monteCarloSummary : null}
            onToggleMonteCarlo={
              mode === 'sandbox' && monteCarloSummary
                ? () => setShowMonteCarloCanvas((m) => !m)
                : undefined
            }
            isRunning={isRunning}
          />
        </main>

        <div className="min-h-0 overflow-hidden">
          <LiveTelemetryHUD
            config={activeConfig}
            preFlight={preFlight}
            telemetry={telemetry}
            monteCarloPct={
              mode === 'sandbox' && monteCarloSummary ? monteCarloSummary.empiricalSuccessPct : null
            }
          />
        </div>
      </div>

      <CitationsModal isOpen={citationsOpen} onClose={() => setCitationsOpen(false)} />
      <MissionDebriefModal
        debrief={debrief}
        onRetry={() => resetSimulationToPad(activeConfig)}
        onReturnOpening={() => {
          setDebrief(null);
          setIsRunning(false);
          setMode('opening');
        }}
      />
    </div>
  );
}
