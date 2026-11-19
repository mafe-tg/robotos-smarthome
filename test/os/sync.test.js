import test from "node:test";
import assert from "node:assert/strict";
import { EventEngine } from "../../src/core/EventEngine.js";
import { ThreadManager } from "../../src/resources/ThreadManager.js";
import { SyncManager } from "../../src/resources/SyncManager.js";

/** Arma un bus de eventos, hilos y sincronización, con una lista de los eventos publicados. */
function entorno() {
  const eventos = [];
  const events = new EventEngine({ onEvent: (e) => eventos.push(e) });
  const threads = new ThreadManager({ eventEngine: events });
  const sync = new SyncManager({ eventEngine: events, threadManager: threads });
  // Crea un hilo y lo deja READY. Devuelve su tid.
  const hilo = (name, priority = 5) => threads.admit(threads.create({ processId: 1, name, priority, burst: 5 }).tid).tid;
  const estado = (tid) => threads.list().find((t) => t.tid === tid).state;
  return { eventos, events, threads, sync, hilo, estado };
}

test("un mutex libre se le asigna al primer hilo que lo pide", () => {
  const { sync, hilo } = entorno();
  const a = hilo("a");
  sync.create({ type: "MUTEX", name: "M" });
  const r = sync.acquire("M", a);
  assert.equal(r.acquired, true);
  assert.equal(sync.getState().resources[0].holder, a);
});

test("el segundo hilo espera en WAITING y al liberar el mutex pasa a ser el dueño y vuelve a READY", () => {
  const { sync, hilo, estado } = entorno();
  const a = hilo("a");
  const b = hilo("b");
  sync.create({ type: "MUTEX", name: "M" });
  sync.acquire("M", a);

  const espera = sync.acquire("M", b);
  assert.deepEqual([espera.acquired, espera.waiting], [false, true]);
  assert.equal(estado(b), "WAITING");

  const liberado = sync.release("M", a);
  assert.equal(liberado.wokeUp, b);
  assert.equal(estado(b), "READY");
  assert.equal(sync.getState().resources[0].holder, b);
  assert.deepEqual(sync.getState().resources[0].waiters, []);
});

test("los hilos esperan en orden FIFO", () => {
  const { sync, hilo } = entorno();
  const [a, b, c] = [hilo("a"), hilo("b"), hilo("c")];
  sync.create({ type: "MUTEX", name: "M" });
  sync.acquire("M", a);
  sync.acquire("M", b);
  sync.acquire("M", c);
  assert.equal(sync.release("M", a).wokeUp, b);
  assert.equal(sync.release("M", b).wokeUp, c);
  assert.equal(sync.release("M", c).wokeUp, null);
  assert.equal(sync.getState().resources[0].holder, null);
});

test("solo el dueño libera el mutex, no se pide dos veces y un hilo en espera no puede pedir recursos", () => {
  const { sync, hilo } = entorno();
  const a = hilo("a");
  const b = hilo("b");
  sync.create({ type: "MUTEX", name: "M" });
  sync.create({ type: "MUTEX", name: "N" });
  sync.acquire("M", a);
  assert.throws(() => sync.release("M", b), /no es el dueño/);
  assert.throws(() => sync.acquire("M", a), /ya tiene el mutex/);
  sync.acquire("M", b); // b queda esperando
  assert.throws(() => sync.acquire("N", b), /WAITING/);
});

test("rechaza hilos, recursos y tipos que no existen", () => {
  const { sync, hilo } = entorno();
  const a = hilo("a");
  sync.create({ type: "MUTEX", name: "M" });
  assert.throws(() => sync.acquire("M", 99), /no encontrado/);
  assert.throws(() => sync.acquire("M", "a"), /entero/);
  assert.throws(() => sync.acquire("X", a), /no existe/);
  assert.throws(() => sync.create({ type: "MUTEX", name: "M" }), /ya existe/);
  assert.throws(() => sync.create({ type: "BARRERA", name: "B" }), /inválido/);
  assert.throws(() => sync.create({ type: "SEMAPHORE", name: "S", count: -1 }), /contador/);
});

test("un semáforo con 2 permisos deja pasar a 2 hilos y el tercero espera hasta un signal", () => {
  const { sync, hilo, estado } = entorno();
  const [a, b, c] = [hilo("a"), hilo("b"), hilo("c")];
  sync.create({ type: "SEMAPHORE", name: "S", count: 2 });
  assert.equal(sync.acquire("S", a).acquired, true);
  assert.equal(sync.acquire("S", b).acquired, true);
  assert.equal(sync.getState().resources[0].count, 0);

  assert.equal(sync.acquire("S", c).waiting, true);
  assert.equal(estado(c), "WAITING");

  const r = sync.release("S", a);
  assert.equal(r.wokeUp, c);
  assert.equal(estado(c), "READY");
  assert.equal(sync.getState().resources[0].count, 0, "el permiso pasa directo a c");

  sync.release("S", b);
  assert.equal(sync.getState().resources[0].count, 1, "sin nadie esperando el contador sube");
});

test("IPC: receive sobre un canal vacío deja al hilo esperando y send lo despierta con el mensaje", () => {
  const { sync, hilo, estado } = entorno();
  const emisor = hilo("emisor");
  const receptor = hilo("receptor");

  const espera = sync.receive("sensores", receptor);
  assert.equal(espera.waiting, true);
  assert.equal(estado(receptor), "WAITING");

  const envio = sync.send("sensores", emisor, { temp: 21 });
  assert.equal(envio.delivered, true);
  assert.equal(estado(receptor), "READY");

  const recibido = sync.receive("sensores", receptor);
  assert.equal(recibido.received, true);
  assert.deepEqual(recibido.message, { temp: 21 });
  assert.equal(recibido.from, emisor);
});

test("IPC: los mensajes enviados sin receptor se guardan y salen en orden FIFO", () => {
  const { sync, hilo } = entorno();
  const emisor = hilo("emisor");
  const receptor = hilo("receptor");
  sync.send("c", emisor, "uno");
  sync.send("c", emisor, "dos");
  assert.equal(sync.getState().channels[0].queued, 2);
  assert.equal(sync.receive("c", receptor).message, "uno");
  assert.equal(sync.receive("c", receptor).message, "dos");
  assert.equal(sync.getState().channels[0].queued, 0);
});

test("IPC: un canal lleno rechaza más mensajes y no acepta mensajes undefined", () => {
  const events = new EventEngine();
  const threads = new ThreadManager({ eventEngine: events });
  const sync = new SyncManager({ eventEngine: events, threadManager: threads, channelCapacity: 2 });
  const a = threads.admit(threads.create({ processId: 1, name: "a" }).tid).tid;
  sync.send("c", a, 1);
  sync.send("c", a, 2);
  assert.throws(() => sync.send("c", a, 3), /lleno/);
  assert.throws(() => sync.send("otro", a, undefined), /undefined/);
});

test("detecta un deadlock cuando dos hilos se esperan en ciclo (usa el módulo de María Fernanda)", () => {
  const { sync, hilo } = entorno();
  const a = hilo("a");
  const b = hilo("b");
  sync.create({ type: "MUTEX", name: "M1" });
  sync.create({ type: "MUTEX", name: "M2" });
  sync.acquire("M1", a);
  sync.acquire("M2", b);
  assert.equal(sync.detectDeadlock().hasDeadlock, false);
  sync.acquire("M2", a); // a espera a b
  assert.equal(sync.detectDeadlock().hasDeadlock, false, "una espera sin ciclo no es deadlock");
  sync.acquire("M1", b); // b espera a a: ciclo

  const d = sync.detectDeadlock();
  assert.equal(d.hasDeadlock, true);
  assert.deepEqual([...d.processesInCycle].sort(), [`hilo-${a}`, `hilo-${b}`].sort());
  assert.equal(sync.getState().deadlock.hasDeadlock, true);
});

test("resolveDeadlock termina al hilo de menor prioridad y el otro recibe el recurso que esperaba", () => {
  const { sync, hilo, estado, eventos } = entorno();
  const importante = hilo("importante", 1);
  const secundario = hilo("secundario", 4);
  sync.create({ type: "MUTEX", name: "M1" });
  sync.create({ type: "MUTEX", name: "M2" });
  sync.acquire("M1", importante);
  sync.acquire("M2", secundario);
  sync.acquire("M2", importante);
  sync.acquire("M1", secundario);

  const r = sync.resolveDeadlock();
  assert.equal(r.resolved, true);
  assert.equal(r.victim.name, `hilo-${secundario}`);
  assert.equal(r.survivor.name, `hilo-${importante}`);
  assert.deepEqual(r.freedResources, ["M2"]);
  assert.equal(r.stillDeadlocked, false);

  assert.equal(estado(secundario), "TERMINATED");
  assert.equal(estado(importante), "READY");
  const mutexM2 = sync.getState().resources.find((x) => x.name === "M2");
  assert.equal(mutexM2.holder, importante);
  assert.equal(sync.detectDeadlock().hasDeadlock, false);
  assert.ok(eventos.some((e) => e.tipo === "sync:deadlock_resolved" && e.origen === "SYNC"));
});

test("resolveDeadlock sin deadlock no cambia nada", () => {
  const { sync, hilo, estado } = entorno();
  const a = hilo("a");
  sync.create({ type: "MUTEX", name: "M" });
  sync.acquire("M", a);
  assert.deepEqual(sync.resolveDeadlock(), { resolved: false, hasDeadlock: false });
  assert.equal(estado(a), "READY");
});

test("si un hilo termina, libera sus mutex y sale de las colas de espera", () => {
  const { sync, hilo, threads, estado } = entorno();
  const a = hilo("a");
  const b = hilo("b");
  sync.create({ type: "MUTEX", name: "M" });
  sync.acquire("M", a);
  sync.acquire("M", b);
  assert.equal(estado(b), "WAITING");

  threads.terminate(a);
  assert.equal(sync.getState().resources[0].holder, b);
  assert.equal(estado(b), "READY");
});

test("un hilo terminado que estaba esperando sale de la cola", () => {
  const { sync, hilo, threads } = entorno();
  const a = hilo("a");
  const b = hilo("b");
  sync.create({ type: "MUTEX", name: "M" });
  sync.acquire("M", a);
  sync.acquire("M", b);
  threads.terminate(b);
  assert.deepEqual(sync.getState().resources[0].waiters, []);
  assert.equal(sync.release("M", a).wokeUp, null);
});

test("reset deja todo vacío", () => {
  const { sync, hilo } = entorno();
  const a = hilo("a");
  sync.create({ type: "MUTEX", name: "M" });
  sync.send("c", a, 1);
  sync.reset();
  const estado = sync.getState();
  assert.deepEqual(estado.resources, []);
  assert.deepEqual(estado.channels, []);
});

test("los eventos salen en el formato común con origen SYNC o IPC", () => {
  const { sync, hilo, eventos } = entorno();
  const a = hilo("a");
  const b = hilo("b");
  sync.create({ type: "MUTEX", name: "M" });
  sync.acquire("M", a);
  sync.acquire("M", b);
  sync.send("c", a, "hola");
  const espera = eventos.find((e) => e.tipo === "sync:mutex_wait");
  assert.equal(espera.origen, "SYNC");
  assert.deepEqual(Object.keys(espera).sort(), ["detalle", "fecha", "origen", "tipo"]);
  assert.equal(espera.detalle.holder, a);
  assert.equal(eventos.find((e) => e.tipo === "ipc:message_sent").origen, "IPC");
});

test("sin ThreadManager también funciona (modo aislado)", () => {
  const sync = new SyncManager();
  sync.create({ type: "MUTEX", name: "M" });
  assert.equal(sync.acquire("M", 1).acquired, true);
  assert.equal(sync.acquire("M", 2).waiting, true);
  assert.equal(sync.release("M", 1).wokeUp, 2);
  assert.throws(() => sync.acquire("M", 0), /entero/);
});
