// src/cpu.js
// Simula la CPU ejecutando procesos, "tick" a "tick".
// Un tick es una unidad de tiempo de la simulación (no son segundos reales).
//
// Simplificaciones (a propósito, para que sea fácil de explicar):
//  - Hay una sola CPU: solo un proceso se ejecuta por tick.
//  - Todos los procesos están listos desde el tick 0 (no hay llegadas tardías).
//  - El uso de CPU de un tick es el "cpuRequerida" del proceso que se ejecuta.

import { ESTADOS } from "./proceso.js";
import { ALGORITMOS, sacarSiguiente } from "./scheduler.js";

export function simular(procesos, { algoritmo = ALGORITMOS.PRIORIDAD, quantum = 2 } = {}) {
  if (algoritmo === ALGORITMOS.ROUND_ROBIN) {
    if (!Number.isInteger(quantum) || quantum < 1) {
      throw new Error("El quantum debe ser un número entero mayor o igual a 1");
    }
  }

  // 1) Preparar la cola: solo entran procesos NEW (se admiten) o READY.
  //    Los pausados (WAITING) o terminados se dejan fuera.
  const cola = [];
  const ejecutados = [];
  const omitidos = [];
  for (const p of procesos) {
    if (p.estado === ESTADOS.NEW) {
      p.admitir();
      cola.push(p);
      ejecutados.push(p);
    } else if (p.estado === ESTADOS.READY) {
      cola.push(p);
      ejecutados.push(p);
    } else {
      omitidos.push({ pid: p.pid, nombre: p.nombre, estado: p.estado });
    }
  }

  // 2) Ciclo principal: mientras haya procesos en la cola, la CPU trabaja.
  const linea = []; // qué proceso usó la CPU en cada tick
  const finPorPid = new Map(); // en qué tick terminó cada proceso
  let reloj = 0;
  let sumaCpu = 0;

  while (cola.length > 0) {
    const proceso = sacarSiguiente(cola, algoritmo);
    proceso.ejecutar(); // READY -> RUNNING

    // PRIORIDAD: se ejecuta hasta terminar.
    // ROUND_ROBIN: solo un turno corto (quantum).
    const ticks =
      algoritmo === ALGORITMOS.ROUND_ROBIN
        ? Math.min(quantum, proceso.tiempoRestante)
        : proceso.tiempoRestante;

    for (let i = 0; i < ticks; i++) {
      linea.push({ tick: reloj, pid: proceso.pid, nombre: proceso.nombre });
      reloj += 1;
      proceso.tiempoRestante -= 1;
      sumaCpu += proceso.cpuRequerida;
    }

    if (proceso.tiempoRestante === 0) {
      proceso.finalizar(); // RUNNING -> TERMINATED
      finPorPid.set(proceso.pid, reloj);
    } else {
      proceso.expropiar(); // RUNNING -> READY (se acabó su turno)
      cola.push(proceso); // vuelve al final de la fila
    }
  }

  // 3) Métricas para explicar cómo le fue a cada proceso.
  //    retorno = tick en que terminó. espera = retorno - tiempo que usó la CPU.
  const metricas = ejecutados.map((p) => ({
    pid: p.pid,
    nombre: p.nombre,
    prioridad: p.prioridad,
    tiempoTotal: p.tiempoTotal,
    retorno: finPorPid.get(p.pid),
    espera: finPorPid.get(p.pid) - p.tiempoTotal,
  }));

  const usoCpuPromedio = reloj === 0 ? 0 : Math.round((sumaCpu / reloj) * 100) / 100;

  return {
    algoritmo,
    quantum: algoritmo === ALGORITMOS.ROUND_ROBIN ? quantum : null,
    duracionTotal: reloj,
    linea,
    metricas,
    usoCpuPromedio,
    omitidos,
  };
}

// Dibuja la línea de tiempo como texto: una fila por proceso.
// █ = estaba usando la CPU, · = estaba esperando.
export function dibujarLinea(linea) {
  const nombres = new Map();
  for (const t of linea) {
    nombres.set(t.pid, t.nombre);
  }
  const ancho = Math.max(0, ...[...nombres.values()].map((n) => n.length));
  const filas = [];
  for (const [pid, nombre] of nombres) {
    const celdas = linea.map((t) => (t.pid === pid ? "█" : "·")).join("");
    filas.push(`${nombre.padEnd(ancho)} | ${celdas}`);
  }
  return filas.join("\n");
}
