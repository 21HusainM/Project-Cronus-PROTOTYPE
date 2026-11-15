// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

export type AppMode = 'opening' | 'sandbox' | 'gameplay';

export type EngineId =
  | 'rs25'
  | 'merlin1d'
  | 'f1'
  | 'j2'
  | 'rl10b2'
  | 'aj10_190'
  | 'sls_srb';

export type MaterialId = 'al_li_2195' | 'stainless_304l' | 'rcc' | 'pica_x';

export type TargetMissionId = 'leo_iss' | 'gto' | 'lunar_transfer';

export type HistoricalMissionId = 'apollo_lunar' | 'shuttle_sts' | 'artemis_cislunar';

export type FlightPhase =
  | 'prelaunch'
  | 'ascent_stage1'
  | 'ascent_stage2'
  | 'orbit'
  | 'deorbit'
  | 'edl_entry'
  | 'edl_chute'
  | 'landed'
  | 'failed';

export interface EngineSpec {
  id: EngineId;
  name: string;
  propellant: string;
  cycle: string;
  thrustSL_kN: number;
  thrustVac_kN: number;
  ispSL: number;
  ispVac: number;
  dryMassKg: number;
  unitCostM: number;
  maxGimbalDeg: number;
  minThrottle: number; // 0.4 - 1.0
  maxThrottle: number; // 1.0 - 1.09
  isSolid?: boolean;
  burnTimeS?: number;
  eraTags: HistoricalMissionId[];
  citation: string;
}

export interface MaterialSpec {
  id: MaterialId;
  name: string;
  shortName: string;
  densityGcm3: number;
  maxTempK: number;
  emissivity: number;
  structuralMassFactor: number;
  costPerTonM: number;
  description: string;
  citation: string;
}

export interface TargetMissionSpec {
  id: TargetMissionId;
  name: string;
  targetOrbitKm: number;
  inclinationDeg: number;
  requiredDeltaV_ms: number;
  payloadMassKg: number;
  description: string;
}

export interface WeatherConfig {
  windSpeedMph: number; // 162-ft pad wind (<= 30 mph limit)
  electricFieldVm: number; // field mill (-2000 to +2000 V/m, limit +-1000 V/m)
  lightningDistanceNmi: number; // > 10 nmi required
  cloudTempC: number; // thick cloud / triboelectrification check
  anvilClear: boolean;
}

export interface VehicleConfig {
  budgetM: number;
  targetMissionId: TargetMissionId;
  stage1EngineId: EngineId;
  stage1EngineCount: number;
  stage1PropellantKg: number;
  boosterEngineId: EngineId | 'none';
  boosterCount: number;
  boosterPropellantKg: number;
  stage2EngineId: EngineId;
  stage2EngineCount: number;
  stage2PropellantKg: number;
  structuralMaterialId: MaterialId;
  tpsMaterialId: MaterialId;
  tpsThicknessMm: number;
  payloadMassKg: number;
  launchAngleDeg: number; // initial pitch-over / target gravity-turn kick (deg from vertical)
  tvcEnabled: boolean;
  tvcGimbalLimitDeg: number;
  maxQThrottleBucket: boolean;
  stageSepVelocityRatio: number; // 0.35 - 0.85 fraction of orbital target or fuel depletion
  noseRadiusM: number;
  referenceAreaM2: number;
}

export interface HistoricalMissionSpec {
  id: HistoricalMissionId;
  title: string;
  eraLabel: string;
  lockedBudgetM: number;
  targetOrbitKm: number;
  inclinationDeg: number;
  requiredDeltaV_ms: number;
  allowedEngines: EngineId[];
  allowedMaterials: MaterialId[];
  defaultConfig: VehicleConfig;
  brief: string;
  windows: {
    id: string;
    label: string;
    summary: string;
    weather: WeatherConfig;
  }[];
}

export interface ActiveAnomaly {
  id: string;
  phase: 'ascent' | 'orbit' | 'edl';
  title: string;
  description: string;
  severity: 'caution' | 'warning';
  options: {
    id: string;
    label: string;
    effectDescription: string;
    action: 'throttle_down' | 'tvc_compensate' | 'rcs_avoid' | 'boost_power' | 'pitch_up_edl' | 'accept_risk';
  }[];
  resolved: boolean;
  chosenOptionLabel?: string;
}

export interface TelemetryFrame {
  simTimeS: number;
  phase: FlightPhase;
  altitudeM: number;
  downrangeM: number;
  velocityMs: number;
  vxMs: number;
  vyMs: number;
  flightPathAngleDeg: number;
  pitchAngleDeg: number;
  gimbalAngleDeg: number;
  mach: number;
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  dynamicPressureKpa: number;
  thrustKN: number;
  dragKN: number;
  liftKN: number;
  gravityKN: number;
  netForceKN: number;
  gLoad: number;
  massKg: number;
  stage1FuelFrac: number;
  boosterFuelFrac: number;
  stage2FuelFrac: number;
  wallTempK: number;
  convHeatFluxWm2: number;
  integratedHeatLoadJm2: number;
  apoapsisKm: number;
  periapsisKm: number;
  eccentricity: number;
  j2NodalRegressionDegDay: number;
  rfBlackout: boolean;
  chuteState: 'stowed' | 'drogue' | 'main';
  throttle: number;
  maxQReachedKpa: number;
  peakWallTempK: number;
  eventsLog: string[];
}

export interface PreFlightMetrics {
  totalCostM: number;
  withinBudget: boolean;
  liftoffMassKg: number;
  dryMassKg: number;
  propellantMassKg: number;
  liftoffThrustKN: number;
  liftoffTWR: number;
  stage1DeltaV_ms: number;
  stage2DeltaV_ms: number;
  totalDeltaV_ms: number;
  requiredDeltaV_ms: number;
  deltaVMargin_ms: number;
  structuralMassFraction: number;
  weatherGo: boolean;
  weatherViolations: string[];
  successProbabilityPct: number;
  riskBreakdown: {
    twrScore: number;
    deltaVScore: number;
    weatherScore: number;
    structuralScore: number;
    thermalScore: number;
  };
}

export interface MonteCarloTrial {
  trialIndex: number;
  success: boolean;
  maxQKpa: number;
  peakWallTempK: number;
  finalApoapsisKm: number;
  points: { downrangeKm: number; altitudeKm: number }[];
}

export interface MonteCarloSummary {
  trialsCount: number;
  successCount: number;
  empiricalSuccessPct: number;
  meanMaxQKpa: number;
  p95MaxQKpa: number;
  meanPeakTempK: number;
  trials: MonteCarloTrial[];
}

export interface MissionDebrief {
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  outcomeTitle: string;
  summary: string;
  achievedApoapsisKm: number;
  achievedPeriapsisKm: number;
  maxQKpa: number;
  peakWallTempK: number;
  touchdownSpeedMs: number;
  anomaliesHandled: number;
  anomaliesTotal: number;
}
