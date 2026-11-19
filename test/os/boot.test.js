import test from "node:test";
import assert from "node:assert/strict";
import { KernelCore } from "../../src/core/KernelCore.js";
import { BootManager } from "../../src/core/BootManager.js";
import { SYSTEM_STATUS } from "../../src/core/SystemState.js";
import {
  boot as bootSO,
  restart as restartSO,
  shutdown as shutdownSO,
  getState,
  resetKernel,
} from "../../src/features/kernel/index.js";

function crear({ checks = [] } = {}) {
  const eventos = [];
  const kernel = new KernelCore({ onEvent: (evento) => eventos.push(evento) });
  const boot = new BootManager({ kernel, checks });
  return { kernel, boot, eventos };
}

test("reiniciar después de apagar vuelve a ejecutar el arranque", async () => {
  const { kernel, boot } = crear();
  assert.equal((await boot.boot()).success, true);
  kernel.shutdown("prueba");
  assert.equal(kernel.state.status, SYSTEM_STATUS.OFF);

  const reporte = await boot.boot();
  assert.equal(reporte.success, true);
  assert.equal(kernel.state.status, SYSTEM_STATUS.RUNNING);
  assert.equal(boot.bootCount, 2);
});

test("restart() desde RUNNING apaga y luego repite la secuencia de arranque", async () => {
  const { boot, eventos } = crear();
  await boot.boot();
  eventos.length = 0;

  const reporte = await boot.restart("prueba");
  assert.equal(reporte.success, true);
  assert.deepEqual(eventos.map((e) => e.tipo), [
    "boot:restart_requested",
    "kernel:shutdown",
    "boot:started",
    "kernel:initialized",
    "kernel:started",
    "boot:completed",
  ]);
});

test("un arranque fallido deja el kernel en HALTED y se puede reintentar", async () => {
  let intentos = 0;
  const check = { name: "sensor", run: () => ++intentos > 1 };
  const { kernel, boot } = crear({ checks: [check] });

  const primero = await boot.boot();
  assert.equal(primero.success, false);
  assert.equal(kernel.state.status, SYSTEM_STATUS.HALTED);

  const segundo = await boot.boot();
  assert.equal(segundo.success, true);
  assert.equal(kernel.state.status, SYSTEM_STATUS.RUNNING);
});

test("cada evento sale con tipo, origen, detalle y fecha", async () => {
  const { boot, eventos } = crear();
  await boot.boot();
  assert.ok(eventos.length > 0);
  for (const evento of eventos) {
    assert.deepEqual(Object.keys(evento).sort(), ["detalle", "fecha", "origen", "tipo"]);
    assert.equal(typeof evento.tipo, "string");
    assert.equal(typeof evento.origen, "string");
    assert.ok(!Number.isNaN(Date.parse(evento.fecha)));
  }
});

test("si onEvent lanza un error, el kernel sigue funcionando", async () => {
  const kernel = new KernelCore({
    onEvent: () => {
      throw new Error("falla del consumidor");
    },
  });
  const boot = new BootManager({ kernel });
  const reporte = await boot.boot();
  assert.equal(reporte.success, true);
  assert.equal(kernel.state.status, SYSTEM_STATUS.RUNNING);
  assert.ok(kernel.events.sinkFailures > 0);
});

test("la secuencia de arranque sale en orden y registra cada verificación", async () => {
  const checks = [
    { name: "memoria", run: () => true },
    { name: "scheduler", run: async () => true },
  ];
  const { boot, eventos } = crear({ checks });
  await boot.boot();
  assert.deepEqual(eventos.map((e) => e.tipo), [
    "boot:started",
    "kernel:initialized",
    "boot:check_passed",
    "boot:check_passed",
    "kernel:started",
    "boot:completed",
  ]);
  const nombres = eventos.filter((e) => e.tipo === "boot:check_passed").map((e) => e.detalle.name);
  assert.deepEqual(nombres, ["memoria", "scheduler"]);
});

test("las funciones de features/kernel arrancan, reinician y apagan", async () => {
  resetKernel();
  const eventos = [];
  const primero = await bootSO({ onEvent: (evento) => eventos.push(evento) });
  assert.equal(primero.success, true);
  assert.equal(getState().status, "RUNNING");

  const segundo = await restartSO("prueba");
  assert.equal(segundo.success, true);
  assert.equal(getState().status, "RUNNING");

  shutdownSO("fin");
  assert.equal(getState().status, "OFF");
  assert.ok(eventos.some((e) => e.tipo === "kernel:shutdown"));
  resetKernel();
});
