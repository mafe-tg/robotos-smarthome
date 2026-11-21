import test from "node:test";
import assert from "node:assert/strict";
import {
  boot,
  shutdown,
  createProcess,
  createThread,
  listThreads,
  createSyncResource,
  lockResource,
  unlockResource,
  sendMessage,
  receiveMessage,
  detectDeadlock,
  resolveDeadlock,
  getSyncState,
  runRealTime,
  resetKernel,
} from "../../src/features/kernel/index.js";

const proceso = (extra = {}) => ({
  nombre: "proceso-prueba",
  prioridad: 2,
  memoriaRequerida: 4,
  cpuRequerida: 10,
  tiempoTotal: 4,
  ...extra,
});

async function arrancar() {
  resetKernel();
  const eventos = [];
  const reporte = await boot({ onEvent: (e) => eventos.push(e) });
  assert.equal(reporte.success, true);
  return eventos;
}

/** Crea un hilo READY de un proceso y devuelve su tid. */
async function hilo(pid, name, priority = 5) {
  const creado = await createThread({ processId: pid, name, priority, burst: 5 });
  return creado.tid;
}

const estadoDe = async (tid) => (await listThreads()).find((t) => t.tid === tid).state;

const CLASICO = [
  { name: "A", period: 5, computation: 2 },
  { name: "B", period: 7, computation: 4 },
];

test("las funciones de sincronización y tiempo real fallan si el kernel no se ha arrancado", async () => {
  resetKernel();
  await assert.rejects(() => createSyncResource({ type: "MUTEX", name: "M" }), /no se ha arrancado/);
  await assert.rejects(() => lockResource("M", 1), /no se ha arrancado/);
  await assert.rejects(() => runRealTime({ tasks: CLASICO }), /no se ha arrancado/);
  assert.equal(getSyncState(), null);
});

test("mutex por el kernel: el segundo hilo espera en WAITING y al liberar pasa a READY", async () => {
  await arrancar();
  const p = await createProcess(proceso());
  const a = await hilo(p.pid, "a");
  const b = await hilo(p.pid, "b");
  await createSyncResource({ type: "MUTEX", name: "bus-i2c" });

  assert.equal((await lockResource("bus-i2c", a)).acquired, true);
  assert.equal((await lockResource("bus-i2c", b)).waiting, true);
  assert.equal(await estadoDe(b), "WAITING");

  const liberado = await unlockResource("bus-i2c", a);
  assert.equal(liberado.wokeUp, b);
  assert.equal(await estadoDe(b), "READY");
  assert.equal(getSyncState().resources[0].holder, b);
});

test("deadlock por el kernel: se detecta y se resuelve terminando al hilo de menor prioridad", async () => {
  const eventos = await arrancar();
  const p = await createProcess(proceso());
  const importante = await hilo(p.pid, "lock_guard", 1);
  const secundario = await hilo(p.pid, "routine_engine", 4);
  await createSyncResource({ type: "MUTEX", name: "gpio" });
  await createSyncResource({ type: "MUTEX", name: "i2c" });
  await lockResource("gpio", importante);
  await lockResource("i2c", secundario);
  await lockResource("i2c", importante);
  await lockResource("gpio", secundario);

  const deteccion = await detectDeadlock();
  assert.equal(deteccion.hasDeadlock, true);
  assert.equal(getSyncState().deadlock.hasDeadlock, true);

  const r = await resolveDeadlock();
  assert.equal(r.resolved, true);
  assert.equal(r.victim.name, `hilo-${secundario}`);
  assert.equal(await estadoDe(secundario), "TERMINATED");
  assert.equal(await estadoDe(importante), "READY");
  assert.equal((await detectDeadlock()).hasDeadlock, false);
  assert.ok(eventos.some((e) => e.tipo === "sync:deadlock_resolved" && e.origen === "SYNC"));
});

test("IPC por el kernel: receiveMessage espera y sendMessage lo despierta con el mensaje", async () => {
  await arrancar();
  const p = await createProcess(proceso());
  const emisor = await hilo(p.pid, "emisor");
  const receptor = await hilo(p.pid, "receptor");

  assert.equal((await receiveMessage("camara", receptor)).waiting, true);
  assert.equal(await estadoDe(receptor), "WAITING");
  assert.equal((await sendMessage("camara", emisor, { frame: 1 })).delivered, true);
  assert.equal(await estadoDe(receptor), "READY");
  const recibido = await receiveMessage("camara", receptor);
  assert.deepEqual(recibido.message, { frame: 1 });
});

test("runRealTime: EDF cumple el caso clásico, RM pierde un deadline, y los eventos salen con origen REALTIME", async () => {
  const eventos = await arrancar();
  const edf = await runRealTime({ tasks: CLASICO, algorithm: "EDF" });
  const rm = await runRealTime({ tasks: CLASICO, algorithm: "RM" });
  assert.equal(edf.missed, 0);
  assert.equal(rm.missed, 1);

  const realtime = eventos.filter((e) => e.origen === "REALTIME");
  assert.ok(realtime.some((e) => e.tipo === "realtime:started"));
  assert.equal(realtime.filter((e) => e.tipo === "realtime:deadline_missed").length, 1);
  const completado = realtime.filter((e) => e.tipo === "realtime:completed");
  assert.equal(completado.length, 2);
  assert.equal(completado[0].detalle.timeline, undefined, "el evento no incluye la línea de tiempo");
});

test("runRealTime rechaza tareas inválidas", async () => {
  await arrancar();
  await assert.rejects(() => runRealTime({ tasks: [] }), /al menos una tarea/);
  await assert.rejects(() => runRealTime({ tasks: CLASICO, algorithm: "SJF" }), /inválido/);
});

test("apagar y volver a arrancar el kernel deja la sincronización vacía", async () => {
  await arrancar();
  const p = await createProcess(proceso());
  const a = await hilo(p.pid, "a");
  await createSyncResource({ type: "MUTEX", name: "M" });
  await lockResource("M", a);
  await shutdown("prueba");
  await boot();
  const estado = getSyncState();
  assert.deepEqual(estado.resources, []);
  assert.deepEqual(estado.channels, []);
});
