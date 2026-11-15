// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import { ENGINES, MATERIALS, TARGET_MISSIONS } from '../data/nasaCatalog';
import {
  FlightPhase,
  MonteCarloSummary,
  MonteCarloTrial,
  PreFlightMetrics,
  TelemetryFrame,
  VehicleConfig,
  WeatherConfig,
} from '../types/simulation';

// Published NASA-TM-X-74335 Constants (SI)
export const USSA76_CONSTANTS = {
  T0: 288.15, // K
  P0: 101325, // Pa
  RHO0: 1.225, // kg/m^3
  G0: 9.80665, // m/s^2
  R_STAR: 8.31432, // J/(mol*K)
  M0: 0.0289644, // kg/mol
  R_AIR: 287.053, // J/(kg*K)
  GAMMA: 1.4, // ratio of specific heats below 86 km
  R_EARTH: 6356766, // m (USSA76 Earth radius)
  MU_EARTH: 3.986004418e14, // m^3/s^2
  J2: 1.0826e-3, // GSFC Orbit Primer
  SIGMA_SB: 5.67e-8, // W/(m^2*K^4) Stefan-Boltzmann
  K_SUTTON_GRAVES: 1.7415e-4, // Earth air SI, NASA TR R-376
};

interface UssaLayer {
  hbM: number; // geopotential base (m)
  lapseKPerM: number; // K/m
  tbK: number; // base temp (K)
  pbPa: number; // base pressure (Pa)
}

const USSA76_LAYERS: UssaLayer[] = [
  { hbM: 0, lapseKPerM: -0.0065, tbK: 288.15, pbPa: 101325 },
  { hbM: 11000, lapseKPerM: 0.0, tbK: 216.65, pbPa: 22632.1 },
  { hbM: 20000, lapseKPerM: 0.001, tbK: 216.65, pbPa: 5474.889 },
  { hbM: 32000, lapseKPerM: 0.0028, tbK: 228.65, pbPa: 868.019 },
  { hbM: 47000, lapseKPerM: 0.0, tbK: 270.65, pbPa: 110.906 },
  { hbM: 51000, lapseKPerM: -0.0028, tbK: 270.65, pbPa: 66.9389 },
  { hbM: 71000, lapseKPerM: -0.002, tbK: 214.65, pbPa: 3.95642 },
];

export interface AtmosphereState {
  geopotentialAltitudeM: number;
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  speedOfSoundMs: number;
  scaleHeightM: number;
}

/**
 * U.S. Standard Atmosphere, 1976 (NASA-TM-X-74335) piecewise model (0-86 km)
 * with smooth exponential thermosphere continuation above 84.852 km geopotential.
 */
export function computeUSSA76(geometricAltitudeM: number): AtmosphereState {
  const z = Math.max(0, geometricAltitudeM);
  const { R_EARTH, G0, M0, R_STAR, R_AIR, GAMMA } = USSA76_CONSTANTS;
  const H = (R_EARTH * z) / (R_EARTH + z);

  if (H >= 84852) {
    // Above 84.852 km geopotential: smooth exospheric continuation
    const tTop = 186.65 + Math.min(813.35, ((H - 84852) / 915148) * 813.35);
    const scaleH = (R_AIR * tTop) / G0;
    const p = 0.3734 * Math.exp(-(H - 84852) / Math.max(5500, scaleH * 1.15));
    const clampedP = z > 350000 ? 0 : p;
    const rho = clampedP > 0 ? clampedP / (R_AIR * tTop) : 0;
    return {
      geopotentialAltitudeM: H,
      temperatureK: tTop,
      pressurePa: clampedP,
      densityKgM3: rho,
      speedOfSoundMs: Math.sqrt(GAMMA * R_AIR * tTop),
      scaleHeightM: scaleH,
    };
  }

  let layer = USSA76_LAYERS[0];
  for (let i = USSA76_LAYERS.length - 1; i >= 0; i--) {
    if (H >= USSA76_LAYERS[i].hbM) {
      layer = USSA76_LAYERS[i];
      break;
    }
  }

  const dh = H - layer.hbM;
  let T = layer.tbK;
  let P = layer.pbPa;

  if (Math.abs(layer.lapseKPerM) > 1e-12) {
    T = layer.tbK + layer.lapseKPerM * dh;
    const exponent = (G0 * M0) / (R_STAR * layer.lapseKPerM);
    P = layer.pbPa * Math.pow(layer.tbK / T, exponent);
  } else {
    P = layer.pbPa * Math.exp((-dh * G0 * M0) / (R_STAR * layer.tbK));
  }

  const rho = (P * M0) / (R_STAR * T);
  const speedOfSound = Math.sqrt(GAMMA * R_AIR * T);
  const scaleHeightM = (R_STAR * T) / (G0 * M0);

  return {
    geopotentialAltitudeM: H,
    temperatureK: T,
    pressurePa: P,
    densityKgM3: rho,
    speedOfSoundMs: speedOfSound,
    scaleHeightM,
  };
}

/**
 * Newtonian gravity with altitude variation (Section 3.5)
 * g(h) = g0 * (Re / (Re + h))^2
 */
export function computeGravityMs2(altitudeM: number): number {
  const { G0, R_EARTH } = USSA76_CONSTANTS;
  const h = Math.max(0, altitudeM);
  const ratio = R_EARTH / (R_EARTH + h);
  return G0 * ratio * ratio;
}

/**
 * Ambient-pressure thrust & Isp linear interpolation between SL and Vac (Section 2.1)
 * F(h) = F_vac - (F_vac - F_SL) * (Pa(h) / P0)
 */
export function interpolateEnginePerformance(
  thrustSL_kN: number,
  thrustVac_kN: number,
  ispSL: number,
  ispVac: number,
  pressurePa: number
): { thrustKN: number; ispS: number } {
  const ratio = Math.max(0, Math.min(1, pressurePa / USSA76_CONSTANTS.P0));
  const thrustKN = thrustVac_kN - (thrustVac_kN - thrustSL_kN) * ratio;
  const ispS = ispVac - (ispVac - ispSL) * ratio;
  return { thrustKN, ispS };
}

/**
 * Tsiolkovsky ideal rocket equation: dv = Isp * g0 * ln(m0 / mf)
 */
export function computeTsiolkovskyDeltaV(ispS: number, m0Kg: number, mfKg: number): number {
  if (m0Kg <= mfKg || mfKg <= 0 || ispS <= 0) return 0;
  return ispS * USSA76_CONSTANTS.G0 * Math.log(m0Kg / mfKg);
}

/**
 * TVC gimbal torque M_gimbal = F_T * L_arm * sin(delta)
 */
export function computeTvcTorqueKNm(thrustKN: number, momentArmM: number, gimbalDeg: number): number {
  const rad = (gimbalDeg * Math.PI) / 180;
  return thrustKN * momentArmM * Math.sin(rad);
}

/**
 * 3-segment compressible drag coefficient Cd(M) with transonic wave-drag hump (Section 3.1)
 */
export function computeDragCoefficient(mach: number, cd0 = 0.28): number {
  if (mach < 0.8) {
    // Subsonic Prandtl-Glauert scaling
    return cd0 / Math.sqrt(Math.max(0.36, 1 - mach * mach * 0.55));
  }
  if (mach <= 1.2) {
    // Transonic wave-drag peak (~2.6x subsonic around M = 1.05)
    const peak = cd0 * 2.65;
    const dist = Math.abs(mach - 1.05) / 0.25;
    const factor = Math.max(0, 1 - dist * dist);
    return cd0 * 1.25 + (peak - cd0 * 1.25) * factor;
  }
  // Supersonic gradual decay toward hypersonic blunt-body plateau
  const excess = mach - 1.2;
  return Math.max(cd0 * 0.85, cd0 * 2.2 * Math.exp(-excess * 0.28) + cd0 * 0.85);
}

/**
 * Sutton-Graves stagnation-point convective heating (NASA TR R-376)
 * q_conv = 1.7415e-4 * sqrt(rho / Rn) * v^3  [W/m^2]
 */
export function computeSuttonGravesHeatFluxWm2(
  densityKgM3: number,
  noseRadiusM: number,
  velocityMs: number
): number {
  if (densityKgM3 <= 0 || noseRadiusM <= 0 || velocityMs <= 0) return 0;
  return USSA76_CONSTANTS.K_SUTTON_GRAVES * Math.sqrt(densityKgM3 / noseRadiusM) * Math.pow(velocityMs, 3);
}

/**
 * Radiative equilibrium wall temperature Tw = (q_conv / (epsilon * sigma))^(1/4)
 * Blended smoothly with ambient atmospheric temperature at low heat flux.
 */
export function computeWallTemperatureK(
  convHeatFluxWm2: number,
  emissivity: number,
  ambientTempK: number,
  tpsThicknessMm: number
): number {
  const effectiveEmissivity = Math.max(0.15, Math.min(0.95, emissivity));
  // Thicker TPS adds thermal capacity buffering factor
  const thermalBuffer = 1 - Math.min(0.16, (tpsThicknessMm - 30) * 0.0022);
  const radEqTemp = Math.pow(
    Math.max(0, convHeatFluxWm2 * thermalBuffer) / (effectiveEmissivity * USSA76_CONSTANTS.SIGMA_SB),
    0.25
  );
  // Combine ambient radiation baseline and aerothermal equilibrium
  const baseline = Math.max(220, ambientTempK);
  return Math.pow(Math.pow(baseline, 4) + Math.pow(radEqTemp, 4), 0.25);
}

/**
 * J2 zonal-harmonic nodal regression rate (GSFC Orbit Primer)
 * Omega_dot = -1.5 * J2 * n * (Re / a)^2 * cos(i) / (1 - e^2)^2 [deg/day]
 */
export function computeJ2NodalRegressionDegDay(
  apoapsisKm: number,
  periapsisKm: number,
  inclinationDeg: number
): { nodalRegressionDegDay: number; eccentricity: number; semiMajorAxisM: number } {
  const { R_EARTH, MU_EARTH, J2 } = USSA76_CONSTANTS;
  const ra = R_EARTH + Math.max(0, apoapsisKm) * 1000;
  const rp = R_EARTH + Math.max(-100, periapsisKm) * 1000;
  const a = 0.5 * (ra + rp);
  if (a <= R_EARTH * 0.5 || ra <= 0) {
    return { nodalRegressionDegDay: 0, eccentricity: 0, semiMajorAxisM: R_EARTH };
  }
  const e = Math.min(0.99, Math.max(0, (ra - rp) / (ra + rp)));
  const n = Math.sqrt(MU_EARTH / Math.pow(a, 3)); // rad/s
  const incRad = (inclinationDeg * Math.PI) / 180;
  const denom = Math.pow(1 - e * e, 2);
  const omegaDotRadS =
    -1.5 * J2 * n * Math.pow(R_EARTH / a, 2) * (Math.cos(incRad) / Math.max(0.05, denom));
  const degPerDay = (omegaDotRadS * 180) / Math.PI * 86400;
  return { nodalRegressionDegDay: degPerDay, eccentricity: e, semiMajorAxisM: a };
}

/**
 * Evaluate Cape Canaveral Launch Commit Criteria (NASA-STD-4010A & Falcon 9 / KSC rules)
 */
export function evaluateWeatherLCC(weather: WeatherConfig): {
  go: boolean;
  violations: string[];
  weatherScore: number;
} {
  const violations: string[] = [];
  if (weather.windSpeedMph > 30) {
    violations.push(`162-ft pad wind ${weather.windSpeedMph.toFixed(0)} mph exceeds 30 mph limit`);
  }
  if (Math.abs(weather.electricFieldVm) > 1000) {
    violations.push(`Field mill ${weather.electricFieldVm > 0 ? '+' : ''}${weather.electricFieldVm} V/m exceeds ±1,000 V/m (NASA-STD-4010A)`);
  }
  if (weather.lightningDistanceNmi <= 10) {
    violations.push(`Lightning standoff ${weather.lightningDistanceNmi} nmi violates >10 nmi rule`);
  }
  if (!weather.anvilClear) {
    violations.push('Attached/detached convective anvil cloud within 10 nmi corridor');
  }
  if (weather.cloudTempC <= -20 || (weather.cloudTempC <= 0 && weather.cloudTempC >= -20 && !weather.anvilClear)) {
    violations.push(`Cloud layer ${weather.cloudTempC}°C triggers triboelectrification/thick-cloud rule`);
  }

  // Smooth score 0..100
  const windPenalty = Math.max(0, (weather.windSpeedMph - 12) / 24) * 30;
  const fieldPenalty = (Math.abs(weather.electricFieldVm) / 1000) * 28;
  const lightningPenalty = weather.lightningDistanceNmi < 20 ? ((20 - weather.lightningDistanceNmi) / 20) * 35 : 0;
  const anvilPenalty = weather.anvilClear ? 0 : 40;
  const raw = Math.max(0, Math.min(100, 100 - windPenalty - fieldPenalty - lightningPenalty - anvilPenalty));

  return {
    go: violations.length === 0,
    violations,
    weatherScore: violations.length === 0 ? Math.max(60, raw) : Math.min(35, raw),
  };
}

/**
 * Compute full pre-flight vehicle mass, cost, TWR, Tsiolkovsky dV, and weighted Mission Success Probability (%)
 */
export function evaluatePreFlightMetrics(config: VehicleConfig, weather: WeatherConfig): PreFlightMetrics {
  const s1Eng = ENGINES[config.stage1EngineId];
  const s2Eng = ENGINES[config.stage2EngineId];
  const bEng = config.boosterEngineId !== 'none' ? ENGINES[config.boosterEngineId] : null;
  const structMat = MATERIALS[config.structuralMaterialId];
  const tpsMat = MATERIALS[config.tpsMaterialId];
  const targetMission = TARGET_MISSIONS[config.targetMissionId];

  // Structural dry tank fractions (~5.5% of propellant mass scaled by material factor)
  const s1TankDry = config.stage1PropellantKg * 0.055 * structMat.structuralMassFactor;
  const s2TankDry = config.stage2PropellantKg * 0.065 * structMat.structuralMassFactor;
  const boosterTankDry =
    bEng && config.boosterCount > 0 ? config.boosterPropellantKg * 0.075 * structMat.structuralMassFactor : 0;

  const s1EngDry = s1Eng.dryMassKg * config.stage1EngineCount;
  const s2EngDry = s2Eng.dryMassKg * config.stage2EngineCount;
  const bEngDry = bEng && config.boosterCount > 0 ? (bEng.isSolid ? 0 : bEng.dryMassKg * config.boosterCount) : 0;
  const srbCaseDry = bEng && bEng.isSolid && config.boosterCount > 0 ? bEng.dryMassKg * config.boosterCount : 0;
  const boosterDryTotal = boosterTankDry + bEngDry + srbCaseDry;

  const tpsMassKg =
    config.referenceAreaM2 * (config.tpsThicknessMm / 1000) * (tpsMat.densityGcm3 * 1000) * 1.4;

  const dryMassKg = s1TankDry + s1EngDry + s2TankDry + s2EngDry + boosterDryTotal + tpsMassKg;
  const propellantMassKg =
    config.stage1PropellantKg + config.stage2PropellantKg + (bEng && config.boosterCount > 0 ? config.boosterPropellantKg : 0);
  const liftoffMassKg = dryMassKg + propellantMassKg + config.payloadMassKg;

  // Liftoff Thrust
  const s1ThrustSL = s1Eng.thrustSL_kN * config.stage1EngineCount;
  const boosterThrustSL = bEng && config.boosterCount > 0 ? bEng.thrustSL_kN * config.boosterCount : 0;
  const liftoffThrustKN = s1ThrustSL + boosterThrustSL;

  const liftoffWeightKN = (liftoffMassKg * USSA76_CONSTANTS.G0) / 1000;
  const liftoffTWR = liftoffWeightKN > 0 ? liftoffThrustKN / liftoffWeightKN : 0;

  // Two-stage (plus booster jettison) Tsiolkovsky delta-V estimate
  const stage2InitialMass = s2TankDry + s2EngDry + tpsMassKg + config.payloadMassKg + config.stage2PropellantKg;
  const stage2FinalMass = stage2InitialMass - config.stage2PropellantKg;
  const stage2DeltaV_ms = computeTsiolkovskyDeltaV(s2Eng.ispVac, stage2InitialMass, stage2FinalMass);

  let stage1DeltaV_ms = 0;
  if (bEng && config.boosterCount > 0 && config.boosterPropellantKg > 0) {
    // Phase 1a: Parallel burn of boosters + 32% of core propellant, then booster jettison
    const s1MidIsp = 0.4 * s1Eng.ispSL + 0.6 * s1Eng.ispVac;
    const bMidIsp = 0.5 * bEng.ispSL + 0.5 * bEng.ispVac;
    const totalS1Thrust = s1ThrustSL + boosterThrustSL;
    const parallelIsp =
      totalS1Thrust > 0 ? (s1ThrustSL * s1MidIsp + boosterThrustSL * bMidIsp) / totalS1Thrust : s1MidIsp;
    const parallelCoreProp = config.stage1PropellantKg * 0.32;
    const phase1aFinalMass = liftoffMassKg - config.boosterPropellantKg - parallelCoreProp;
    const dv1a = computeTsiolkovskyDeltaV(parallelIsp, liftoffMassKg, phase1aFinalMass);

    // Phase 1b: Core continues alone in near-vacuum after dropping booster dry mass
    const phase1bInitialMass = phase1aFinalMass - boosterDryTotal;
    const phase1bFinalMass = phase1bInitialMass - (config.stage1PropellantKg - parallelCoreProp);
    const dv1b = computeTsiolkovskyDeltaV(s1Eng.ispVac * 0.96, phase1bInitialMass, phase1bFinalMass);
    stage1DeltaV_ms = dv1a + dv1b;
  } else {
    const s1EffectiveIsp = 0.25 * s1Eng.ispSL + 0.75 * s1Eng.ispVac;
    const stage1FinalMass = liftoffMassKg - config.stage1PropellantKg;
    stage1DeltaV_ms = computeTsiolkovskyDeltaV(s1EffectiveIsp, liftoffMassKg, stage1FinalMass);
  }

  const totalDeltaV_ms = stage1DeltaV_ms + stage2DeltaV_ms;
  const deltaVMargin_ms = totalDeltaV_ms - targetMission.requiredDeltaV_ms;

  // Cost calculation ($M)
  const engineCost =
    s1Eng.unitCostM * config.stage1EngineCount +
    s2Eng.unitCostM * config.stage2EngineCount +
    (bEng && config.boosterCount > 0 ? bEng.unitCostM * config.boosterCount : 0);
  const tankCost = ((s1TankDry + s2TankDry + boosterTankDry) / 1000) * structMat.costPerTonM;
  const tpsCost = (tpsMassKg / 1000) * tpsMat.costPerTonM + 8;
  const propellantCost = (propellantMassKg / 1000) * 0.012;
  const totalCostM = Math.round((engineCost + tankCost + tpsCost + propellantCost) * 10) / 10;
  const withinBudget = totalCostM <= config.budgetM;

  const structuralMassFraction = liftoffMassKg > 0 ? dryMassKg / liftoffMassKg : 0;

  // Weather LCC
  const lcc = evaluateWeatherLCC(weather);

  // Weighted risk scores (0..100 each)
  const twrScore = liftoffTWR >= 1.25 ? 100 : liftoffTWR >= 1.15 ? 78 : Math.max(0, (liftoffTWR / 1.15) * 60);
  const deltaVScore =
    deltaVMargin_ms >= 300
      ? 100
      : deltaVMargin_ms >= 0
      ? 80 + (deltaVMargin_ms / 300) * 20
      : Math.max(0, 75 + deltaVMargin_ms / 45);
  const structuralScore =
    (config.maxQThrottleBucket ? 95 : 74) - (liftoffTWR > 2.2 ? 12 : 0) + (config.tvcEnabled ? 5 : -25);
  const clampedStructuralScore = Math.max(0, Math.min(100, structuralScore));

  // Thermal score based on target mission reentry velocity vs TPS limit
  const approxEntryV = config.targetMissionId === 'lunar_transfer' ? 10800 : config.targetMissionId === 'gto' ? 9200 : 7700;
  const approxPeakQ = computeSuttonGravesHeatFluxWm2(0.00028, config.noseRadiusM, approxEntryV * 0.85);
  const approxPeakTemp = computeWallTemperatureK(approxPeakQ, tpsMat.emissivity, 240, config.tpsThicknessMm);
  const thermalMargin = tpsMat.maxTempK - approxPeakTemp;
  const thermalScore =
    thermalMargin >= 250 ? 100 : thermalMargin >= 0 ? 68 + (thermalMargin / 250) * 32 : Math.max(5, 65 + thermalMargin / 12);

  let weightedProb =
    0.24 * twrScore +
    0.30 * deltaVScore +
    0.18 * lcc.weatherScore +
    0.14 * clampedStructuralScore +
    0.14 * thermalScore;

  if (!withinBudget) weightedProb *= 0.82;
  if (liftoffTWR < 1.02) weightedProb = Math.min(weightedProb, 8);
  if (!lcc.go) weightedProb = Math.min(weightedProb, 42);

  const successProbabilityPct = Math.round(Math.max(1, Math.min(99, weightedProb)));

  return {
    totalCostM,
    withinBudget,
    liftoffMassKg,
    dryMassKg,
    propellantMassKg,
    liftoffThrustKN,
    liftoffTWR,
    stage1DeltaV_ms,
    stage2DeltaV_ms,
    totalDeltaV_ms,
    requiredDeltaV_ms: targetMission.requiredDeltaV_ms,
    deltaVMargin_ms,
    structuralMassFraction,
    weatherGo: lcc.go,
    weatherViolations: lcc.violations,
    successProbabilityPct,
    riskBreakdown: {
      twrScore: Math.round(twrScore),
      deltaVScore: Math.round(deltaVScore),
      weatherScore: Math.round(lcc.weatherScore),
      structuralScore: Math.round(clampedStructuralScore),
      thermalScore: Math.round(thermalScore),
    },
  };
}

/**
 * Create initial TelemetryFrame on launchpad
 */
export function createInitialTelemetry(config: VehicleConfig): TelemetryFrame {
  const pre = evaluatePreFlightMetrics(config, {
    windSpeedMph: 10,
    electricFieldVm: 100,
    lightningDistanceNmi: 40,
    cloudTempC: 15,
    anvilClear: true,
  });
  const atm = computeUSSA76(0);
  return {
    simTimeS: 0,
    phase: 'prelaunch',
    altitudeM: 0,
    downrangeM: 0,
    velocityMs: 0,
    vxMs: 0,
    vyMs: 0,
    flightPathAngleDeg: 90,
    pitchAngleDeg: 90,
    gimbalAngleDeg: 0,
    mach: 0,
    temperatureK: atm.temperatureK,
    pressurePa: atm.pressurePa,
    densityKgM3: atm.densityKgM3,
    dynamicPressureKpa: 0,
    thrustKN: 0,
    dragKN: 0,
    liftKN: 0,
    gravityKN: (pre.liftoffMassKg * USSA76_CONSTANTS.G0) / 1000,
    netForceKN: 0,
    gLoad: 1.0,
    massKg: pre.liftoffMassKg,
    stage1FuelFrac: 1,
    boosterFuelFrac: config.boosterEngineId !== 'none' && config.boosterCount > 0 ? 1 : 0,
    stage2FuelFrac: 1,
    wallTempK: atm.temperatureK,
    convHeatFluxWm2: 0,
    integratedHeatLoadJm2: 0,
    apoapsisKm: 0,
    periapsisKm: -USSA76_CONSTANTS.R_EARTH / 1000,
    eccentricity: 1,
    j2NodalRegressionDegDay: 0,
    rfBlackout: false,
    chuteState: 'stowed',
    throttle: 1.0,
    maxQReachedKpa: 0,
    peakWallTempK: atm.temperatureK,
    eventsLog: ['Vehicle armed on pad. Pre-launch systems nominal.'],
  };
}

export interface StepInput {
  dtS: number;
  config: VehicleConfig;
  weather: WeatherConfig;
  manualThrottleOverride: number | null;
  manualPitchBiasDeg: number;
  ispDispersionFactor?: number;
  densityDispersionFactor?: number;
  windDispersionFactor?: number;
}

/**
 * Deterministic 2D equations-of-motion stepper implementing:
 * - m dv/dt = F_T cos(delta) - D - m g(h) sin(gamma)
 * - m v dgamma/dt = F_T sin(delta) + L - m g(h) cos(gamma)
 * - dm/dt = -F_T / (Isp * g0)
 * Plus seamless Ascent -> Orbit -> EDL transitions.
 */
export function stepFlightSimulation(prev: TelemetryFrame, input: StepInput): TelemetryFrame {
  const { dtS, config, weather } = input;
  if (prev.phase === 'landed' || prev.phase === 'failed' || prev.phase === 'prelaunch') {
    return prev;
  }

  const ispDisp = input.ispDispersionFactor ?? 1;
  const rhoDisp = input.densityDispersionFactor ?? 1;
  const windDisp = input.windDispersionFactor ?? 1;

  const s1Eng = ENGINES[config.stage1EngineId];
  const s2Eng = ENGINES[config.stage2EngineId];
  const bEng = config.boosterEngineId !== 'none' ? ENGINES[config.boosterEngineId] : null;
  const structMat = MATERIALS[config.structuralMaterialId];
  const tpsMat = MATERIALS[config.tpsMaterialId];
  const targetMission = TARGET_MISSIONS[config.targetMissionId];

  const atm = computeUSSA76(prev.altitudeM);
  const density = atm.densityKgM3 * rhoDisp;
  const gLocal = computeGravityMs2(prev.altitudeM);

  const s1TankDry = config.stage1PropellantKg * 0.068 * structMat.structuralMassFactor;
  const s2TankDry = config.stage2PropellantKg * 0.075 * structMat.structuralMassFactor;
  const boosterTankDry =
    bEng && config.boosterCount > 0 ? config.boosterPropellantKg * 0.145 * structMat.structuralMassFactor : 0;
  const s1EngDry = s1Eng.dryMassKg * config.stage1EngineCount;
  const s2EngDry = s2Eng.dryMassKg * config.stage2EngineCount;
  const bEngDry = bEng && config.boosterCount > 0 ? (bEng.isSolid ? 0 : bEng.dryMassKg * config.boosterCount) : 0;
  const srbCaseDry = bEng && bEng.isSolid && config.boosterCount > 0 ? bEng.dryMassKg * config.boosterCount : 0;
  const tpsMassKg =
    config.referenceAreaM2 * (config.tpsThicknessMm / 1000) * (tpsMat.densityGcm3 * 1000) * 1.4;

  let stage1FuelFrac = prev.stage1FuelFrac;
  let boosterFuelFrac = prev.boosterFuelFrac;
  let stage2FuelFrac = prev.stage2FuelFrac;
  let phase: FlightPhase = prev.phase;
  const eventsLog = [...prev.eventsLog];

  // Dynamic mass computation based on current phase
  const s1PropRem = phase === 'ascent_stage1' ? stage1FuelFrac * config.stage1PropellantKg : 0;
  const bPropRem =
    phase === 'ascent_stage1' && bEng && config.boosterCount > 0
      ? boosterFuelFrac * config.boosterPropellantKg
      : 0;
  const s2PropRem = stage2FuelFrac * config.stage2PropellantKg;

  const stage1AttachedMass = phase === 'ascent_stage1' ? s1TankDry + s1EngDry : 0;
  const boostersAttachedMass =
    phase === 'ascent_stage1' && boosterFuelFrac > 0.01 ? boosterTankDry + bEngDry + srbCaseDry : 0;

  let massKg =
    stage1AttachedMass +
    boostersAttachedMass +
    s1PropRem +
    bPropRem +
    s2TankDry +
    s2EngDry +
    tpsMassKg +
    config.payloadMassKg +
    s2PropRem;

  // Relative airspeed including boundary-layer power-law wind shear (Section 1.3)
  const zRef = 49.4; // 162-ft pad height in meters
  const padWindMs = weather.windSpeedMph * 0.44704 * windDisp;
  const windShearMs =
    prev.altitudeM < 18000
      ? padWindMs * Math.pow(Math.max(1, prev.altitudeM) / zRef, 0.14) * Math.exp(-prev.altitudeM / 14000)
      : 0;
  const vRelAir = Math.max(0.1, Math.hypot(prev.vxMs - windShearMs * 0.4, prev.vyMs));
  const mach = atm.speedOfSoundMs > 0 ? vRelAir / atm.speedOfSoundMs : 0;
  const dynamicPressurePa = 0.5 * density * vRelAir * vRelAir;
  const dynamicPressureKpa = dynamicPressurePa / 1000;

  // Orbit propagation phase
  if (phase === 'orbit') {
    const targetAltM = Math.min(480000, targetMission.targetOrbitKm * 1000);
    const orbitV = Math.sqrt(USSA76_CONSTANTS.MU_EARTH / (USSA76_CONSTANTS.R_EARTH + prev.altitudeM));
    const newDownrange = prev.downrangeM + orbitV * dtS;
    const j2 = computeJ2NodalRegressionDegDay(
      prev.apoapsisKm,
      Math.max(160, prev.periapsisKm),
      targetMission.inclinationDeg
    );

    const solarTemp = 265 + 32 * Math.sin(prev.simTimeS * 0.15);
    return {
      ...prev,
      simTimeS: prev.simTimeS + dtS,
      downrangeM: newDownrange,
      velocityMs: orbitV,
      vxMs: orbitV,
      vyMs: 0,
      flightPathAngleDeg: 0,
      pitchAngleDeg: 0,
      gimbalAngleDeg: 0,
      mach: orbitV / Math.max(270, atm.speedOfSoundMs),
      temperatureK: atm.temperatureK,
      pressurePa: atm.pressurePa,
      densityKgM3: atm.densityKgM3,
      dynamicPressureKpa: 0,
      thrustKN: 0,
      dragKN: 0,
      liftKN: 0,
      gravityKN: (massKg * gLocal) / 1000,
      netForceKN: 0,
      gLoad: 0,
      massKg,
      wallTempK: solarTemp,
      convHeatFluxWm2: 0,
      apoapsisKm: Math.max(prev.apoapsisKm, targetAltM / 1000),
      periapsisKm: Math.max(185, prev.periapsisKm),
      eccentricity: j2.eccentricity,
      j2NodalRegressionDegDay: j2.nodalRegressionDegDay,
      rfBlackout: false,
      throttle: 0,
    };
  }

  // Deorbit burn transition -> EDL entry
  if (phase === 'deorbit') {
    const retroPerf = interpolateEnginePerformance(
      s2Eng.thrustSL_kN,
      s2Eng.thrustVac_kN,
      s2Eng.ispSL,
      s2Eng.ispVac,
      atm.pressurePa
    );
    const thrustKN = retroPerf.thrustKN * Math.max(1, config.stage2EngineCount) * 0.45;
    const accelRetro = (thrustKN * 1000) / massKg;
    const newVx = Math.max(3200, prev.vxMs - accelRetro * dtS * 8);
    const newVy = prev.vyMs - 14 * dtS;
    const newAlt = Math.max(118000, prev.altitudeM + newVy * dtS * 4);
    const newVel = Math.hypot(newVx, newVy);

    let nextPhase: FlightPhase = 'deorbit';
    if (newAlt <= 120000) {
      nextPhase = 'edl_entry';
      eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: Entry Interface (120 km) reached. Sutton–Graves heating active.`);
    }

    return {
      ...prev,
      simTimeS: prev.simTimeS + dtS,
      phase: nextPhase,
      altitudeM: newAlt,
      downrangeM: prev.downrangeM + newVx * dtS,
      velocityMs: newVel,
      vxMs: newVx,
      vyMs: newVy,
      flightPathAngleDeg: (Math.atan2(newVy, newVx) * 180) / Math.PI,
      pitchAngleDeg: 180,
      gimbalAngleDeg: 0,
      thrustKN,
      dragKN: 0,
      liftKN: 0,
      gravityKN: (massKg * gLocal) / 1000,
      netForceKN: thrustKN,
      gLoad: accelRetro / USSA76_CONSTANTS.G0,
      massKg,
      throttle: 0.45,
      eventsLog: eventsLog.slice(0, 12),
    };
  }

  // EDL Atmospheric Reentry & Parachute Descent
  if (phase === 'edl_entry' || phase === 'edl_chute') {
    const v = Math.max(1, prev.velocityMs);
    const gammaRad = Math.atan2(prev.vyMs, Math.max(1, prev.vxMs));
    const cd = phase === 'edl_chute' ? 1.45 : computeDragCoefficient(mach, 1.15);
    const area = prev.chuteState === 'main' ? 420 : prev.chuteState === 'drogue' ? 58 : config.referenceAreaM2 * 0.65;
    const cl = phase === 'edl_entry' ? 0.28 + config.launchAngleDeg * 0.01 + input.manualPitchBiasDeg * 0.015 : 0;

    const dragN = dynamicPressurePa * cd * area;
    const liftN = dynamicPressurePa * cl * config.referenceAreaM2 * 0.5;

    // Sutton-Graves stagnation heating & radiative equilibrium wall temp
    const qConv = computeSuttonGravesHeatFluxWm2(density, config.noseRadiusM, v);
    const wallTempTarget = computeWallTemperatureK(qConv, tpsMat.emissivity, atm.temperatureK, config.tpsThicknessMm);
    const wallTempK = prev.wallTempK + (wallTempTarget - prev.wallTempK) * Math.min(1, dtS * 1.4);
    const peakWallTempK = Math.max(prev.peakWallTempK, wallTempK);
    const integratedHeatLoadJm2 = prev.integratedHeatLoadJm2 + qConv * dtS;

    // 2D Equations of motion during entry
    const dvDt = -dragN / massKg - gLocal * Math.sin(gammaRad);
    const dGammaDt = (liftN / massKg - gLocal * Math.cos(gammaRad)) / Math.max(25, v);
    // Slight curvature centrifugal relief
    const centrifugal = (v * Math.cos(gammaRad)) / (USSA76_CONSTANTS.R_EARTH + prev.altitudeM);

    const newV = Math.max(2, v + dvDt * dtS);
    const newGamma = Math.max(-Math.PI * 0.495, Math.min(0.1, gammaRad + (dGammaDt + centrifugal) * dtS));
    const newVx = newV * Math.cos(newGamma);
    const newVy = newV * Math.sin(newGamma);
    const newAlt = Math.max(0, prev.altitudeM + newVy * dtS);
    const newDownrange = prev.downrangeM + newVx * dtS;

    let chuteState = prev.chuteState;
    let nextPhase: FlightPhase = phase;
    if (newAlt <= 9500 && newV < 480 && chuteState === 'stowed') {
      chuteState = 'drogue';
      nextPhase = 'edl_chute';
      eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: Drogue chute deployed at ${(newAlt / 1000).toFixed(1)} km.`);
    } else if (newAlt <= 3200 && chuteState === 'drogue') {
      chuteState = 'main';
      eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: Main canopy deployed at ${(newAlt / 1000).toFixed(1)} km.`);
    }

    const rfBlackout = qConv > 180000 && newAlt > 28000 && newAlt < 86000;
    const totalDecelMs2 = Math.hypot(dragN / massKg, liftN / massKg);
    const gLoad = totalDecelMs2 / USSA76_CONSTANTS.G0;

    if (wallTempK > tpsMat.maxTempK * 1.12) {
      nextPhase = 'failed';
      eventsLog.unshift(`CRITICAL: TPS exceeded ${tpsMat.shortName} thermal limit (${Math.round(wallTempK)} K > ${tpsMat.maxTempK} K).`);
    } else if (newAlt <= 0) {
      nextPhase = 'landed';
      eventsLog.unshift(`Touchdown confirmed at ${newV.toFixed(1)} m/s vertical/total sink rate.`);
    }

    return {
      ...prev,
      simTimeS: prev.simTimeS + dtS,
      phase: nextPhase,
      altitudeM: newAlt,
      downrangeM: newDownrange,
      velocityMs: newV,
      vxMs: newVx,
      vyMs: newVy,
      flightPathAngleDeg: (newGamma * 180) / Math.PI,
      pitchAngleDeg: (newGamma * 180) / Math.PI + 180,
      gimbalAngleDeg: 0,
      mach,
      temperatureK: atm.temperatureK,
      pressurePa: atm.pressurePa,
      densityKgM3: density,
      dynamicPressureKpa,
      thrustKN: 0,
      dragKN: dragN / 1000,
      liftKN: liftN / 1000,
      gravityKN: (massKg * gLocal) / 1000,
      netForceKN: (dragN - massKg * gLocal * Math.sin(newGamma)) / 1000,
      gLoad,
      massKg,
      wallTempK,
      convHeatFluxWm2: qConv,
      integratedHeatLoadJm2,
      rfBlackout,
      chuteState,
      throttle: 0,
      maxQReachedKpa: Math.max(prev.maxQReachedKpa, dynamicPressureKpa),
      peakWallTempK,
      eventsLog: eventsLog.slice(0, 12),
    };
  }

  // ASCENT (Stage 1 + Boosters, or Stage 2)
  let throttle = input.manualThrottleOverride ?? 1.0;
  // Max-Q throttle bucket per RS-25 / Shuttle rule
  if (input.manualThrottleOverride === null && config.maxQThrottleBucket && dynamicPressureKpa > 22 && prev.altitudeM < 25000) {
    throttle = Math.max(s1Eng.minThrottle, 0.72);
  }

  let thrustKN = 0;
  let effectiveIsp = 300;
  let mdotS1 = 0;
  let mdotBooster = 0;
  let mdotS2 = 0;

  if (phase === 'ascent_stage1') {
    const s1Perf = interpolateEnginePerformance(
      s1Eng.thrustSL_kN,
      s1Eng.thrustVac_kN,
      s1Eng.ispSL,
      s1Eng.ispVac,
      atm.pressurePa
    );
    const s1Thrust = s1Perf.thrustKN * config.stage1EngineCount * throttle;
    const s1Isp = s1Perf.ispS * ispDisp;
    mdotS1 = (s1Thrust * 1000) / (s1Isp * USSA76_CONSTANTS.G0);
    thrustKN += s1Thrust;
    effectiveIsp = s1Isp;

    if (bEng && config.boosterCount > 0 && boosterFuelFrac > 0) {
      const bPerf = interpolateEnginePerformance(
        bEng.thrustSL_kN,
        bEng.thrustVac_kN,
        bEng.ispSL,
        bEng.ispVac,
        atm.pressurePa
      );
      // Shaped SRB grain throttling near Max-Q (~38-55s)
      const srbBucket = prev.simTimeS > 35 && prev.simTimeS < 62 ? 0.84 : 1.0;
      const bThrust = bPerf.thrustKN * config.boosterCount * srbBucket;
      const bIsp = bPerf.ispS * ispDisp;
      mdotBooster = (bThrust * 1000) / (bIsp * USSA76_CONSTANTS.G0);
      thrustKN += bThrust;
      effectiveIsp = (s1Thrust * s1Isp + bThrust * bIsp) / Math.max(1, thrustKN);
    }
  } else if (phase === 'ascent_stage2' && stage2FuelFrac > 0) {
    const s2Perf = interpolateEnginePerformance(
      s2Eng.thrustSL_kN,
      s2Eng.thrustVac_kN,
      s2Eng.ispSL,
      s2Eng.ispVac,
      atm.pressurePa
    );
    const s2Thrust = s2Perf.thrustKN * config.stage2EngineCount * throttle;
    const s2Isp = s2Perf.ispS * ispDisp;
    mdotS2 = (s2Thrust * 1000) / (s2Isp * USSA76_CONSTANTS.G0);
    thrustKN = s2Thrust;
    effectiveIsp = s2Isp;
  }

  // Gravity turn & TVC gimbal angle calculation
  const gammaRad =
    prev.velocityMs < 15 ? Math.PI / 2 : Math.atan2(prev.vyMs, Math.max(0.1, prev.vxMs));
  const targetKickRad = ((90 - config.launchAngleDeg) * Math.PI) / 180;
  let desiredPitchRad = Math.PI / 2;

  if (prev.altitudeM < 500) {
    desiredPitchRad = Math.PI / 2;
  } else if (prev.altitudeM < 4000) {
    const blend = (prev.altitudeM - 500) / 3500;
    desiredPitchRad = Math.PI / 2 - blend * (Math.PI / 2 - targetKickRad);
  } else {
    // Smooth aerospace gravity turn: stays steep through dense troposphere/stratosphere, pitches over above 45 km
    const altFrac = Math.min(1, Math.max(0, (prev.altitudeM - 4000) / 145000));
    desiredPitchRad = targetKickRad * (1 - Math.pow(altFrac, 0.78));
    // Floor pitch above 22 deg below 55 km so heavy boosters clear dense atmosphere cleanly
    if (prev.altitudeM < 55000) {
      const minPitchRad = ((22 + (1 - prev.altitudeM / 55000) * 35) * Math.PI) / 180;
      desiredPitchRad = Math.max(desiredPitchRad, minPitchRad);
    }
  }
  desiredPitchRad += (input.manualPitchBiasDeg * Math.PI) / 180;
  desiredPitchRad = Math.max(-0.15, Math.min(Math.PI / 2, desiredPitchRad));

  // TVC gimbal deflects up to +-maxGimbal to steer vehicle attitude toward desiredPitchRad
  const attitudeErrorDeg = ((desiredPitchRad - gammaRad) * 180) / Math.PI;
  const maxGimbal = config.tvcEnabled
    ? Math.min(config.tvcGimbalLimitDeg, phase === 'ascent_stage1' ? s1Eng.maxGimbalDeg : s2Eng.maxGimbalDeg)
    : 0;
  const gimbalAngleDeg = Math.max(-maxGimbal, Math.min(maxGimbal, attitudeErrorDeg * 0.55));
  // Effective thrust steering angle relative to velocity vector (alpha = pitch - gamma)
  const alphaRad = config.tvcEnabled
    ? Math.max(-0.45, Math.min(0.45, desiredPitchRad - gammaRad))
    : 0;

  // Aerodynamics & heating during ascent
  const cd = computeDragCoefficient(mach, 0.28);
  const dragN = dynamicPressurePa * cd * config.referenceAreaM2;
  const liftN = dynamicPressurePa * 0.14 * Math.sin(alphaRad) * config.referenceAreaM2;

  const qConv = computeSuttonGravesHeatFluxWm2(density, config.noseRadiusM, prev.velocityMs);
  const wallTempTarget = computeWallTemperatureK(qConv, tpsMat.emissivity, atm.temperatureK, config.tpsThicknessMm);
  const wallTempK = prev.wallTempK + (wallTempTarget - prev.wallTempK) * Math.min(1, dtS * 1.1);
  const peakWallTempK = Math.max(prev.peakWallTempK, wallTempK);

  const thrustN = thrustKN * 1000;
  const v = Math.max(0.1, prev.velocityMs);

  // 2D Equations of motion (Section 2.1): thrust vector at alpha relative to flight path
  const dvDt = (thrustN * Math.cos(alphaRad) - dragN) / massKg - gLocal * Math.sin(gammaRad);
  const dGammaDt =
    prev.altitudeM < 150
      ? 0
      : ((thrustN * Math.sin(alphaRad) + liftN) / massKg - gLocal * Math.cos(gammaRad)) / Math.max(25, v);
  const centrifugal = (v * Math.cos(gammaRad)) / (USSA76_CONSTANTS.R_EARTH + prev.altitudeM);

  const newV = Math.max(0, prev.velocityMs + dvDt * dtS);
  const newGamma = Math.max(-0.2, Math.min(Math.PI / 2, gammaRad + (dGammaDt + centrifugal) * dtS));
  const newVx = newV * Math.cos(newGamma);
  const newVy = newV * Math.sin(newGamma);

  const newAlt = Math.max(0, prev.altitudeM + newVy * dtS);
  const newDownrange = prev.downrangeM + newVx * dtS;

  // Propellant consumption dm/dt = -F_T / (Isp * g0)
  if (phase === 'ascent_stage1') {
    if (config.stage1PropellantKg > 0) {
      stage1FuelFrac = Math.max(0, stage1FuelFrac - (mdotS1 * dtS) / config.stage1PropellantKg);
    }
    if (bEng && config.boosterCount > 0 && config.boosterPropellantKg > 0) {
      const prevB = boosterFuelFrac;
      boosterFuelFrac = Math.max(0, boosterFuelFrac - (mdotBooster * dtS) / config.boosterPropellantKg);
      if (prevB > 0 && boosterFuelFrac <= 0.005) {
        boosterFuelFrac = 0;
        eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: Side booster burnout & jettison.`);
      }
    }
    if (stage1FuelFrac <= 0.002) {
      stage1FuelFrac = 0;
      phase = 'ascent_stage2';
      eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: MECO & Stage 1 separation. Stage 2 ignition (${s2Eng.name}).`);
    }
  } else if (phase === 'ascent_stage2') {
    if (config.stage2PropellantKg > 0) {
      stage2FuelFrac = Math.max(0, stage2FuelFrac - (mdotS2 * dtS) / config.stage2PropellantKg);
    }
  }

  // Max-Q alert
  const maxQReachedKpa = Math.max(prev.maxQReachedKpa, dynamicPressureKpa);
  if (dynamicPressureKpa > 35 && prev.dynamicPressureKpa <= 35) {
    eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: Max-Q envelope alert (q = ${dynamicPressureKpa.toFixed(1)} kPa).`);
  }

  // Estimate instantaneous orbital apoapsis/periapsis
  const rCurrent = USSA76_CONSTANTS.R_EARTH + newAlt;
  const specificEnergy = (newV * newV) / 2 - USSA76_CONSTANTS.MU_EARTH / rCurrent;
  let apoapsisKm = newAlt / 1000;
  let periapsisKm = -USSA76_CONSTANTS.R_EARTH / 1000;
  let eccentricity = 1;
  let j2NodalRegressionDegDay = 0;

  if (specificEnergy < -1000) {
    const a = -USSA76_CONSTANTS.MU_EARTH / (2 * specificEnergy);
    const hAng = rCurrent * newV * Math.cos(newGamma);
    const eSq = Math.max(0, 1 + (2 * specificEnergy * hAng * hAng) / Math.pow(USSA76_CONSTANTS.MU_EARTH, 2));
    eccentricity = Math.sqrt(eSq);
    apoapsisKm = (a * (1 + eccentricity) - USSA76_CONSTANTS.R_EARTH) / 1000;
    periapsisKm = (a * (1 - eccentricity) - USSA76_CONSTANTS.R_EARTH) / 1000;
    j2NodalRegressionDegDay = computeJ2NodalRegressionDegDay(
      apoapsisKm,
      periapsisKm,
      targetMission.inclinationDeg
    ).nodalRegressionDegDay;
  }

  // Check orbital insertion achievement
  const targetOrbitalV = Math.sqrt(USSA76_CONSTANTS.MU_EARTH / (USSA76_CONSTANTS.R_EARTH + Math.max(160000, newAlt)));
  if (phase === 'ascent_stage2' && newAlt >= 125000 && newV >= targetOrbitalV * 0.94) {
    phase = 'orbit';
    apoapsisKm = Math.max(apoapsisKm, Math.min(480, targetMission.targetOrbitKm));
    periapsisKm = Math.max(185, newAlt / 1000);
    eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: SECO & Orbital Insertion achieved (${Math.round(apoapsisKm)} × ${Math.round(periapsisKm)} km).`);
  } else if (phase === 'ascent_stage2' && stage2FuelFrac <= 0.001 && newV < targetOrbitalV * 0.72) {
    if (newVy < 0 && newAlt < 65000) {
      phase = 'edl_entry';
      eventsLog.unshift(`T+${Math.round(prev.simTimeS)}s: Suborbital trajectory — entering atmospheric recovery.`);
    }
  }

  const netForceKN = (thrustN - dragN - massKg * gLocal * Math.sin(newGamma)) / 1000;
  const gLoad = Math.abs(thrustN - dragN) / Math.max(1, massKg * USSA76_CONSTANTS.G0);

  return {
    ...prev,
    simTimeS: prev.simTimeS + dtS,
    phase,
    altitudeM: newAlt,
    downrangeM: newDownrange,
    velocityMs: newV,
    vxMs: newVx,
    vyMs: newVy,
    flightPathAngleDeg: (newGamma * 180) / Math.PI,
    pitchAngleDeg: (desiredPitchRad * 180) / Math.PI,
    gimbalAngleDeg,
    mach,
    temperatureK: atm.temperatureK,
    pressurePa: atm.pressurePa,
    densityKgM3: density,
    dynamicPressureKpa,
    thrustKN,
    dragKN: dragN / 1000,
    liftKN: liftN / 1000,
    gravityKN: (massKg * gLocal) / 1000,
    netForceKN,
    gLoad,
    massKg,
    stage1FuelFrac,
    boosterFuelFrac,
    stage2FuelFrac,
    wallTempK,
    convHeatFluxWm2: qConv,
    integratedHeatLoadJm2: prev.integratedHeatLoadJm2 + qConv * dtS,
    apoapsisKm,
    periapsisKm,
    eccentricity,
    j2NodalRegressionDegDay,
    rfBlackout: false,
    chuteState: 'stowed',
    throttle,
    maxQReachedKpa,
    peakWallTempK,
    eventsLog: eventsLog.slice(0, 12),
  };
}

/**
 * Deterministic PRNG for reproducible 100-trial Monte Carlo dispersion testing
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run 100-trial Monte Carlo ascent dispersion simulation (varying wind shear, atmospheric density, and Isp)
 */
export function runMonteCarloSimulations(
  config: VehicleConfig,
  weather: WeatherConfig,
  trialsCount = 100
): MonteCarloSummary {
  const rand = mulberry32(20261115);
  const lcc = evaluateWeatherLCC(weather);
  const tpsMat = MATERIALS[config.tpsMaterialId];
  const trials: MonteCarloTrial[] = [];
  let successCount = 0;
  let sumMaxQ = 0;
  let sumPeakTemp = 0;
  const maxQList: number[] = [];

  for (let i = 0; i < trialsCount; i++) {
    // Gaussian-like perturbations
    const u1 = (rand() + rand() + rand()) / 3 - 0.5;
    const u2 = (rand() + rand() + rand()) / 3 - 0.5;
    const u3 = (rand() + rand() + rand()) / 3 - 0.5;

    const ispFactor = 1 + u1 * 0.03; // ±1.5%
    const rhoFactor = 1 + u2 * 0.16; // ±8%
    const windFactor = 1 + u3 * 0.5; // ±25%

    let frame = createInitialTelemetry(config);
    frame.phase = 'ascent_stage1';

    const points: { downrangeKm: number; altitudeKm: number }[] = [{ downrangeKm: 0, altitudeKm: 0 }];
    let step = 0;
    while (
      (frame.phase === 'ascent_stage1' || frame.phase === 'ascent_stage2') &&
      step < 420
    ) {
      frame = stepFlightSimulation(frame, {
        dtS: 2.0,
        config,
        weather,
        manualThrottleOverride: null,
        manualPitchBiasDeg: 0,
        ispDispersionFactor: ispFactor,
        densityDispersionFactor: rhoFactor,
        windDispersionFactor: windFactor,
      });
      if (step % 8 === 0) {
        points.push({
          downrangeKm: Math.round((frame.downrangeM / 1000) * 10) / 10,
          altitudeKm: Math.round((frame.altitudeM / 1000) * 10) / 10,
        });
      }
      step++;
    }

    const structOk = frame.maxQReachedKpa < 48;
    const orbitOk = frame.phase === 'orbit' || frame.apoapsisKm >= 150 || frame.altitudeM >= 120000;
    const thermalOk = frame.peakWallTempK < tpsMat.maxTempK * 1.05;
    const weatherOk = lcc.go || rand() > 0.68;
    const success = structOk && orbitOk && thermalOk && weatherOk;

    if (success) successCount++;
    sumMaxQ += frame.maxQReachedKpa;
    sumPeakTemp += frame.peakWallTempK;
    maxQList.push(frame.maxQReachedKpa);

    trials.push({
      trialIndex: i,
      success,
      maxQKpa: frame.maxQReachedKpa,
      peakWallTempK: frame.peakWallTempK,
      finalApoapsisKm: Math.max(0, frame.apoapsisKm),
      points,
    });
  }

  maxQList.sort((a, b) => a - b);
  const p95Index = Math.min(maxQList.length - 1, Math.floor(maxQList.length * 0.95));

  return {
    trialsCount,
    successCount,
    empiricalSuccessPct: Math.round((successCount / trialsCount) * 100),
    meanMaxQKpa: Math.round((sumMaxQ / trialsCount) * 10) / 10,
    p95MaxQKpa: Math.round((maxQList[p95Index] ?? 0) * 10) / 10,
    meanPeakTempK: Math.round(sumPeakTemp / trialsCount),
    trials,
  };
}
