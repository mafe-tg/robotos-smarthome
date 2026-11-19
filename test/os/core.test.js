import { test } from "node:test";
import assert from "node:assert/strict";
import { KernelCore } from "../../src/core/KernelCore.js";
import { BootManager } from "../../src/core/BootManager.js";
import { SYSTEM_STATUS } from "../../src/core/SystemState.js";
import { RobotOSError } from "../../src/core/ErrorManager.js";

test("BootManager ejecuta verificaciones e inicia el kernel", async () => {
  const kernel = new KernelCore();
  const boot = new BootManager({ kernel, checks: [{ name: "memoria", run: () => true }] });
  const report = await boot.boot();
  assert.equal(report.success, true);
  assert.equal(kernel.state.status, SYSTEM_STATUS.RUNNING);
});

test("BootManager registra y reporta una verificación fallida", async () => {
  const kernel = new KernelCore();
  const boot = new BootManager({ kernel, checks: [{ name: "disco", run: () => { throw new Error("sin espacio"); } }] });
  const report = await boot.boot();
  assert.equal(report.success, false);
  assert.equal(kernel.errors.getRecent()[0].code, "BOOT_FAILED");
});

test("System Calls solo se ejecutan con kernel operativo", async () => {
  const kernel = new KernelCore();
  kernel.syscalls.register("sumar", (a, b) => a + b);
  await assert.rejects(kernel.syscalls.invoke("sumar", 2, 3), RobotOSError);
  kernel.start();
  assert.equal(await kernel.syscalls.invoke("sumar", 2, 3), 5);
});

test("EventEngine entrega eventos y permite desuscribirse", () => {
  const kernel = new KernelCore();
  let received = 0;
  const unsubscribe = kernel.events.on("sensor:read", () => received++);
  kernel.events.emit("sensor:read", { value: 22 });
  unsubscribe();
  kernel.events.emit("sensor:read", { value: 23 });
  assert.equal(received, 1);
});

test("un error crítico degrada el estado del kernel", () => {
  const kernel = new KernelCore();
  kernel.start();
  kernel.reportError(new RobotOSError("Fallo crítico", { level: "CRITICAL", code: "CPU_FAILURE" }));
  assert.equal(kernel.state.status, SYSTEM_STATUS.DEGRADED);
});
