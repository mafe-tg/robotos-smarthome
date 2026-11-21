import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, countMemoryHoles } from '../../src/features/diagnostics/diagnose.js';
import { HardwareManager } from '../../src/features/hardware/HardwareManager.js';

const healthy = () => ({
  kernelStatus: 'RUNNING',
  processes: [{ id: 'p1', pid: 101, name: 'lighting_daemon', state: 'RUNNING', cpu: 8 }],
  memoryStats: { totalKb: 1024, usedKb: 400, freeKb: 624 },
  memoryBlocks: [{ start: 0, size: 400, owner: 'lighting_daemon' }],
  cpuUsage: 28,
  batteryPercent: 84,
  devices: [{ id: 'd5', name: 'Cerradura', type: 'lock', status: 'BLOQUEADA' }],
  alerts: [],
  logs: [],
  hour: 14,
});

test('un sistema sano obtiene 100 puntos y ningún hallazgo', () => {
  const r = diagnose(healthy());
  assert.equal(r.score, 100);
  assert.equal(r.level, 'ok');
  assert.equal(r.findings.length, 0);
});

test('kernel apagado es crítico y propone reiniciar', () => {
  const r = diagnose({ ...healthy(), kernelStatus: 'OFF' });
  assert.equal(r.level, 'critical');
  assert.equal(r.findings[0].action.type, 'reboot');
});

test('detecta fragmentación y propone compactar', () => {
  const blocks = [
    { start: 0, size: 16, owner: 'a' },
    { start: 64, size: 16, owner: 'b' },
    { start: 160, size: 16, owner: 'c' },
  ];
  assert.equal(countMemoryHoles(blocks, 1024), 3);
  const r = diagnose({ ...healthy(), memoryBlocks: blocks });
  const f = r.findings.find((x) => x.id === 'fragmentation');
  assert.ok(f);
  assert.equal(f.action.type, 'compact');
});

test('un driver caído aparece como crítico con la acción de reiniciarlo', () => {
  const hw = new HardwareManager({ random: () => 0.5 });
  hw.failDriver('drv_motores');
  const r = diagnose({ ...healthy(), hardware: hw.snapshot() });
  const f = r.findings.find((x) => x.id === 'driver-drv_motores');
  assert.equal(f.severity, 'critical');
  assert.deepEqual(f.action, { type: 'restart_driver', label: 'Reiniciar driver', payload: 'drv_motores' });
});

test('puerta abierta de noche genera advertencia, de día no', () => {
  const open = [{ id: 'd5', name: 'Cerradura', type: 'lock', status: 'DESBLOQUEADA' }];
  assert.ok(diagnose({ ...healthy(), devices: open, hour: 23 }).findings.some((f) => f.id === 'door'));
  assert.ok(!diagnose({ ...healthy(), devices: open, hour: 11 }).findings.some((f) => f.id === 'door'));
});

test('los hallazgos críticos van primero y bajan el puntaje', () => {
  const r = diagnose({ ...healthy(), kernelStatus: 'HALTED', batteryPercent: 20, cpuUsage: 90 });
  assert.equal(r.findings[0].severity, 'critical');
  assert.ok(r.score < 60);
});
