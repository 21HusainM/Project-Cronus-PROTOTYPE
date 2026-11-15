// SI-assisted code implementing published NASA equations from NASA-TM-X-74335, NASA TR R-376, NASA-STD-4010A, and NASA GSFC Orbit Primer.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeUSSA76,
  computeGravityMs2,
  interpolateEnginePerformance,
  computeTsiolkovskyDeltaV,
  computeTvcTorqueKNm,
  computeDragCoefficient,
  computeSuttonGravesHeatFluxWm2,
  computeWallTemperatureK,
  computeJ2NodalRegressionDegDay,
  evaluateWeatherLCC,
  evaluatePreFlightMetrics,
  createInitialTelemetry,
  stepFlightSimulation,
  runMonteCarloSimulations,
} from './nasaPhysics';
import { HISTORICAL_MISSIONS } from '../data/nasaCatalog';

test('USSA76 sea-level and tropopause values match NASA-TM-X-74335', () => {
  const sl = computeUSSA76(0);
  assert.ok(Math.abs(sl.temperatureK - 288.15) < 1e-4);
  assert.ok(Math.abs(sl.pressurePa - 101325) < 1);
  assert.ok(Math.abs(sl.densityKgM3 - 1.225) < 1e-3);
  assert.ok(Math.abs(sl.speedOfSoundMs - 340.29) < 0.2);

  // At ~11,019 m geometric (11,000 m geopotential), temperature is 216.65 K and pressure ~22,632.1 Pa
  const tropo = computeUSSA76(11019);
  assert.ok(Math.abs(tropo.temperatureK - 216.65) < 0.1);
  assert.ok(Math.abs(tropo.pressurePa - 22632.1) < 30);
});

test('Gravity decreases with altitude per inverse-square law', () => {
  const g0 = computeGravityMs2(0);
  const g400 = computeGravityMs2(400000);
  assert.ok(Math.abs(g0 - 9.80665) < 1e-5);
  assert.ok(g400 > 8.6 && g400 < 8.8);
});

test('Ambient thrust interpolation matches Merlin 1D SL to Vac spec', () => {
  const atSL = interpolateEnginePerformance(654, 716, 282, 311, 101325);
  assert.ok(Math.abs(atSL.thrustKN - 654) < 0.01);
  assert.ok(Math.abs(atSL.ispS - 282) < 0.01);

  const atVac = interpolateEnginePerformance(654, 716, 282, 311, 0);
  assert.ok(Math.abs(atVac.thrustKN - 716) < 0.01);
  assert.ok(Math.abs(atVac.ispS - 311) < 0.01);
});

test('Tsiolkovsky deltaV and TVC gimbal torque compute exact SI values', () => {
  const dv = computeTsiolkovskyDeltaV(452.3, 100000, 20000);
  const expected = 452.3 * 9.80665 * Math.log(5);
  assert.ok(Math.abs(dv - expected) < 0.1);

  const torque = computeTvcTorqueKNm(2000, 12, 11);
  assert.ok(torque > 4500 && torque < 4650);
});

test('3-segment Cd(M) shows transonic wave-drag peak around Mach 1.05', () => {
  const sub = computeDragCoefficient(0.5);
  const transonic = computeDragCoefficient(1.05);
  const sup = computeDragCoefficient(3.0);
  assert.ok(transonic > sub * 2.0);
  assert.ok(transonic > sup);
});

test('Sutton-Graves heating and radiative wall temperature scale physically', () => {
  const q = computeSuttonGravesHeatFluxWm2(0.0005, 1.5, 7500);
  assert.ok(q > 1e6);
  const tw = computeWallTemperatureK(q, 0.9, 240, 60);
  assert.ok(tw > 1400 && tw < 2500);
});

test('GSFC J2 nodal regression is negative for prograde LEO inclination', () => {
  const j2 = computeJ2NodalRegressionDegDay(400, 400, 51.6);
  assert.ok(j2.nodalRegressionDegDay < -4.0 && j2.nodalRegressionDegDay > -6.5);
  assert.ok(j2.eccentricity < 0.001);
});

test('NASA-STD-4010A weather LCC flags wind, field mill, and lightning violations', () => {
  const go = evaluateWeatherLCC({
    windSpeedMph: 14,
    electricFieldVm: 250,
    lightningDistanceNmi: 25,
    cloudTempC: 12,
    anvilClear: true,
  });
  assert.equal(go.go, true);
  assert.equal(go.violations.length, 0);

  const noGo = evaluateWeatherLCC({
    windSpeedMph: 34,
    electricFieldVm: -1200,
    lightningDistanceNmi: 6,
    cloudTempC: -22,
    anvilClear: false,
  });
  assert.equal(noGo.go, false);
  assert.ok(noGo.violations.length >= 4);
});

test('Historical Artemis config achieves positive orbital ascent and Monte Carlo runs 100 trials', () => {
  const artemis = HISTORICAL_MISSIONS.artemis_cislunar;
  const pre = evaluatePreFlightMetrics(artemis.defaultConfig, artemis.windows[0].weather);
  assert.ok(pre.liftoffTWR > 1.3);
  assert.ok(pre.totalDeltaV_ms > 9000);
  assert.ok(pre.successProbabilityPct >= 60);

  const mc = runMonteCarloSimulations(artemis.defaultConfig, artemis.windows[0].weather, 100);
  assert.equal(mc.trialsCount, 100);
  assert.equal(mc.trials.length, 100);
  assert.ok(mc.empiricalSuccessPct >= 50);

  let frame = createInitialTelemetry(artemis.defaultConfig);
  frame.phase = 'ascent_stage1';
  for (let i = 0; i < 90; i++) {
    frame = stepFlightSimulation(frame, {
      dtS: 1,
      config: artemis.defaultConfig,
      weather: artemis.windows[0].weather,
      manualThrottleOverride: null,
      manualPitchBiasDeg: 0,
    });
  }
  assert.ok(frame.altitudeM > 15000);
  assert.ok(frame.velocityMs > 500);
});
