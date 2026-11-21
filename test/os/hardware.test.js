import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HardwareManager, DRIVER_STATUS } from '../../src/features/hardware/HardwareManager.js';

const fixed = () => 0.5;

test('arranca con los 5 drivers activos y lecturas en todos los sensores', () => {
  const hw = new HardwareManager({ random: fixed });
  const snap = hw.tick();
  assert.equal(snap.drivers.length, 5);
  assert.ok(snap.drivers.every((d) => d.status === DRIVER_STATUS.ACTIVE));
  assert.ok(snap.sensors.every((s) => s.value !== null));
});

test('un actuador no acepta órdenes si su driver no está activo', () => {
  const hw = new HardwareManager({ random: fixed });
  hw.unloadDriver('drv_motores');
  assert.throws(() => hw.setActuator('rueda_izq', 50), { code: 'DRIVER_NOT_READY' });
  hw.loadDriver('drv_motores');
  assert.equal(hw.setActuator('rueda_izq', 50).value, 50);
});

test('los valores de los actuadores se limitan a su rango', () => {
  const hw = new HardwareManager({ random: fixed });
  assert.equal(hw.setActuator('brazo', 500).value, 180);
  assert.equal(hw.setActuator('aspiradora', -10).value, 0);
});

test('un sensor sin driver no entrega lectura', () => {
  const hw = new HardwareManager({ random: fixed });
  hw.unloadDriver('drv_camara');
  const cam = hw.tick().sensors.find((s) => s.id === 'camara');
  assert.equal(cam.value, null);
  assert.equal(cam.status, 'SIN_DRIVER');
});

test('el watchdog recupera un driver caído después de unos ciclos', () => {
  const hw = new HardwareManager({ random: fixed, recoveryTicks: 2 });
  const events = [];
  hw.subscribe((e) => events.push(e.tipo));
  hw.failDriver('drv_sensores');
  assert.equal(hw.tick().drivers.find((d) => d.id === 'drv_sensores').status, DRIVER_STATUS.FAILED);
  assert.equal(hw.tick().drivers.find((d) => d.id === 'drv_sensores').status, DRIVER_STATUS.ACTIVE);
  assert.ok(events.includes('DRIVER_FAILED'));
  assert.ok(events.includes('DRIVER_RECOVERED'));
});

test('al fallar el driver de motores las ruedas se detienen', () => {
  const hw = new HardwareManager({ random: fixed });
  hw.move(70, 5);
  hw.failDriver('drv_motores');
  const snap = hw.snapshot();
  assert.equal(snap.moving, false);
  assert.throws(() => hw.move(), { code: 'DRIVER_NOT_READY' });
});

test('moverse calienta los motores y descarga la batería', () => {
  const hw = new HardwareManager({ random: fixed });
  const before = hw.snapshot();
  hw.move(100, 10);
  let snap;
  for (let i = 0; i < 5; i++) snap = hw.tick();
  const t0 = before.sensors.find((s) => s.id === 'temp_motores').value;
  const t1 = snap.sensors.find((s) => s.id === 'temp_motores').value;
  const b0 = before.sensors.find((s) => s.id === 'bateria').value;
  const b1 = snap.sensors.find((s) => s.id === 'bateria').value;
  assert.ok(t1 > t0, `la temperatura debía subir (${t0} -> ${t1})`);
  assert.ok(b1 < b0, `la batería debía bajar (${b0} -> ${b1})`);
});

test('las ruedas se detienen solas al terminar el desplazamiento', () => {
  const hw = new HardwareManager({ random: fixed });
  hw.move(60, 2);
  hw.tick();
  assert.equal(hw.snapshot().moving, true);
  hw.tick();
  assert.equal(hw.snapshot().moving, false);
});

test('los eventos salen por el EventEngine del kernel con el formato común', () => {
  const emitted = [];
  const hw = new HardwareManager({ random: fixed, eventEngine: { emit: (name, ev) => emitted.push([name, ev]) } });
  hw.setActuator('brazo', 45);
  const [name, ev] = emitted[0];
  assert.equal(name, 'hardware:actuator_set');
  assert.deepEqual(Object.keys(ev).sort(), ['detalle', 'fecha', 'origen', 'tipo']);
  assert.equal(ev.origen, 'HARDWARE_MGR');
});
