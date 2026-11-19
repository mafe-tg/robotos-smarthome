import test from "node:test";
import assert from "node:assert/strict";
import { EventEngine } from "../../src/core/EventEngine.js";
import { ProcessManager } from "../../src/resources/ProcessManager.js";
import { ThreadManager, THREAD_STATES } from "../../src/resources/ThreadManager.js";
import {
  boot,
  restart,
  shutdown,
  createProcess,
  createThread,
  listProcesses,
  listThreads,
  setScheduler,
  runScheduler,
  resetKernel,
} from "../../src/features/kernel/index.js";

const datos = (nombre = "Vigilancia", extra = {}) => ({
  nombre, prioridad: 1, memoriaRequerida: 64, cpuRequerida: 30, tiempoTotal: 3, ...extra,
});

/** Arranca un kernel nuevo y devuelve la lista donde se acumulan los eventos. */
async function arrancar(opciones = {}) {
  resetKernel();
  const eventos = [];
  const reporte = await boot({ onEvent: (evento) => eventos.push(evento), ...opciones });
  assert.equal(reporte.success, true);
  return eventos;
}

test("100 procesos creados tienen 100 PID distintos", () => {
  const manager = new ProcessManager();
  const pids = new Set();
  for (let i = 0; i < 100; i++) pids.add(manager.create(datos(`p${i}`)).pid);
  assert.equal(pids.size, 100);
  assert.equal(manager.list().length, 100);
});

test("el proceso se identifica solo por pid (ya no existe managerId ni id)", () => {
  const manager = new ProcessManager();
  const proceso = manager.create(datos());
  assert.equal(proceso.managerId, undefined);
  assert.equal(manager.get(proceso.pid), proceso);
  assert.equal("id" in manager.toJSON(proceso), false);
});

test("después de reiniciar, procesos e hilos quedan vacíos y el PID no se repite", async () => {
  await arrancar();
  const antes = await createProcess(datos());
  await createThread({ processId: antes.pid, name: "sensor", burst: 2 });
  assert.equal((await listProcesses()).length, 1);
  assert.equal((await listThreads()).length, 1);

  const reporte = await restart("prueba");
  assert.equal(reporte.success, true);
  assert.deepEqual(await listProcesses(), []);
  assert.deepEqual(await listThreads(), []);

  const despues = await createProcess(datos());
  assert.ok(despues.pid > antes.pid, "el contador de PID no se reinicia");
  resetKernel();
});

test("no se puede crear un hilo para un proceso que no existe ni para uno terminado", async () => {
  await arrancar();
  await assert.rejects(createThread({ processId: 999, name: "huerfano" }), /no encontrado/);

  const eventEngine = new EventEngine();
  const procesos = new ProcessManager({ eventEngine });
  const hilos = new ThreadManager({ eventEngine, processManager: procesos });
  const proceso = procesos.create(datos());
  procesos.transition(proceso.pid, "terminate");
  assert.throws(() => hilos.create({ processId: proceso.pid, name: "tarde" }), /ya terminó/);
  resetKernel();
});

test("al terminar un proceso, sus hilos terminan y los de otros procesos siguen", () => {
  const eventEngine = new EventEngine();
  const procesos = new ProcessManager({ eventEngine });
  const hilos = new ThreadManager({ eventEngine, processManager: procesos });
  const a = procesos.create(datos("A"));
  const b = procesos.create(datos("B"));
  const hiloA1 = hilos.create({ processId: a.pid, name: "a1", burst: 3 });
  const hiloA2 = hilos.create({ processId: a.pid, name: "a2", burst: 3 });
  const hiloB = hilos.create({ processId: b.pid, name: "b1", burst: 3 });
  hilos.admit(hiloA1.tid);
  hilos.admit(hiloB.tid);

  procesos.transition(a.pid, "terminate");

  const estado = (tid) => hilos.list().find((h) => h.tid === tid).state;
  assert.equal(estado(hiloA1.tid), THREAD_STATES.TERMINATED);
  assert.equal(estado(hiloA2.tid), THREAD_STATES.TERMINATED);
  assert.equal(estado(hiloB.tid), THREAD_STATES.READY);
});

test("createProcess falla si el kernel no está RUNNING", async () => {
  resetKernel();
  await assert.rejects(createProcess(datos()), /usa boot\(\) primero/);

  await arrancar();
  shutdown("prueba");
  await assert.rejects(createProcess(datos()), (error) => error.code === "KERNEL_NOT_READY");
  await assert.rejects(runScheduler(), (error) => error.code === "KERNEL_NOT_READY");
  resetKernel();
});

test("createProcess respeta el límite de memoria en MB", async () => {
  await arrancar({ memoryLimitMb: 100 });
  await createProcess(datos("uno"));
  await assert.rejects(createProcess(datos("dos")), /Memoria insuficiente/);
  resetKernel();
});

test("createThread deja el hilo listo (READY) y respeta admit: false", async () => {
  await arrancar();
  const proceso = await createProcess(datos());
  const listo = await createThread({ processId: proceso.pid, name: "a" });
  const nuevo = await createThread({ processId: proceso.pid, name: "b", admit: false });
  assert.equal(listo.state, "READY");
  assert.equal(nuevo.state, "NEW");
  assert.equal((await listThreads({ processId: proceso.pid })).length, 2);
  resetKernel();
});

test("Prioridad atiende primero lo más urgente y Round Robin rota por turnos", async () => {
  await arrancar();
  const a = await createProcess(datos("A", { prioridad: 2, tiempoTotal: 2 }));
  const b = await createProcess(datos("B", { prioridad: 1, tiempoTotal: 3 }));
  const c = await createProcess(datos("C", { prioridad: 3, tiempoTotal: 1 }));

  const config = await setScheduler({ algorithm: "PRIORIDAD" });
  assert.equal(config.algorithm, "PRIORIDAD");
  const resultado = await runScheduler();
  assert.equal(resultado.algoritmo, "PRIORIDAD");
  const orden = [...new Set(resultado.linea.map((t) => t.pid))];
  assert.deepEqual(orden, [b.pid, a.pid, c.pid]);

  // Round Robin con procesos nuevos: la tabla anterior ya terminó.
  const d = await createProcess(datos("D", { prioridad: 1, tiempoTotal: 3 }));
  const e = await createProcess(datos("E", { prioridad: 1, tiempoTotal: 1 }));
  await setScheduler({ algorithm: "ROUND_ROBIN", quantum: 2 });
  const rr = await runScheduler();
  assert.equal(rr.quantum, 2);
  assert.deepEqual(rr.linea.map((t) => t.pid), [d.pid, d.pid, e.pid, d.pid]);
  resetKernel();
});

test("setScheduler rechaza algoritmos y quantum inválidos", async () => {
  await arrancar();
  await assert.rejects(setScheduler({ algorithm: "SJF" }), /desconocido/);
  await assert.rejects(setScheduler({ algorithm: "ROUND_ROBIN", quantum: 0 }), /quantum/);
  resetKernel();
});

test("runScheduler termina los procesos, libera su memoria y termina sus hilos", async () => {
  await arrancar({ memoryLimitMb: 100 });
  const proceso = await createProcess(datos("Vigilancia", { tiempoTotal: 2 }));
  await createThread({ processId: proceso.pid, name: "camara", burst: 5 });

  await runScheduler();

  const [estadoProceso] = await listProcesses({ state: "TERMINATED" });
  assert.equal(estadoProceso.pid, proceso.pid);
  const [hilo] = await listThreads({ processId: proceso.pid });
  assert.equal(hilo.state, "TERMINATED");
  // La memoria se liberó: cabe otro proceso de 64 MB.
  await createProcess(datos("Otro"));
  resetKernel();
});

test("runScheduler emite eventos en el formato común { tipo, origen, detalle, fecha }", async () => {
  const eventos = await arrancar();
  await createProcess(datos("A", { tiempoTotal: 2 }));
  await createProcess(datos("B", { tiempoTotal: 1 }));
  eventos.length = 0;

  await runScheduler();

  const delScheduler = eventos.filter((e) => e.origen === "SCHEDULER");
  assert.deepEqual(
    delScheduler.map((e) => e.tipo),
    ["scheduler:started", "scheduler:turn", "scheduler:turn", "scheduler:completed"],
  );
  for (const evento of eventos) {
    assert.deepEqual(Object.keys(evento).sort(), ["detalle", "fecha", "origen", "tipo"]);
    assert.ok(!Number.isNaN(Date.parse(evento.fecha)));
  }
  const completado = delScheduler.at(-1).detalle;
  assert.equal(completado.metricas.length, 2);
  assert.equal(typeof completado.duracionTotal, "number");
  assert.ok(eventos.some((e) => e.origen === "PROCESS" && e.tipo === "process:terminate"));
  resetKernel();
});

test("las system calls se registran una sola vez aunque el kernel se reinicie", async () => {
  await arrancar();
  await restart("uno");
  await restart("dos");
  const proceso = await createProcess(datos());
  assert.ok(proceso.pid >= 1);
  resetKernel();
});
