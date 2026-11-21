/**
 * Tiempo real (RTOS) para RobotOS: tareas periódicas con deadline, planificadas con
 *
 *  - EDF (Earliest Deadline First): corre el trabajo cuyo deadline absoluto está más cerca.
 *  - RM  (Rate Monotonic): corre el trabajo de la tarea con el período más corto (prioridad fija).
 *
 * Cada tarea es { name, period, computation, deadline }, todo en ticks enteros:
 *  - period: cada cuántos ticks nace un trabajo nuevo (en t = 0, period, 2*period, ...).
 *  - computation: ticks de CPU que necesita cada trabajo.
 *  - deadline: plazo relativo para terminarlo (por defecto igual al período).
 *
 * La simulación es expropiativa y avanza de a un tick. Un trabajo que no terminó cuando llega su
 * deadline se cuenta como PERDIDO y se descarta. Así se mide si los deadlines se cumplen.
 * Es una función pura (no usa eventos): sirve también para el Benchmark.
 */

export const RT_ALGORITHMS = Object.freeze({ EDF: "EDF", RM: "RM" });

const MAX_HORIZON = 5000;

const mcd = (a, b) => (b === 0 ? a : mcd(b, a % b));
const mcm = (a, b) => (a / mcd(a, b)) * b;

function validarTareas(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("Debes indicar al menos una tarea");
  const nombres = new Set();
  return tasks.map((t, i) => {
    const name = typeof t?.name === "string" ? t.name.trim() : "";
    if (!name) throw new Error(`La tarea ${i + 1} necesita un nombre`);
    if (nombres.has(name)) throw new Error(`El nombre de tarea "${name}" está repetido`);
    nombres.add(name);
    const { period, computation } = t;
    const deadline = t.deadline === undefined ? period : t.deadline;
    if (!Number.isInteger(period) || period < 1) throw new Error(`"${name}": el período debe ser un entero mayor o igual a 1`);
    if (!Number.isInteger(computation) || computation < 1) throw new Error(`"${name}": computation debe ser un entero mayor o igual a 1`);
    if (!Number.isInteger(deadline) || deadline < 1 || deadline > period) {
      throw new Error(`"${name}": el deadline debe ser un entero entre 1 y el período (${period})`);
    }
    if (computation > deadline) throw new Error(`"${name}": computation (${computation}) no puede ser mayor que el deadline (${deadline})`);
    return { name, period, computation, deadline };
  });
}

/** Orden de prioridad: devuelve negativo si el trabajo a va antes que b. */
function comparar(algorithm, a, b, enEjecucion) {
  const claves =
    algorithm === RT_ALGORITHMS.EDF
      ? [a.deadlineAt - b.deadlineAt, a.release - b.release, a.taskIndex - b.taskIndex]
      : [a.period - b.period, a.taskIndex - b.taskIndex, a.release - b.release];
  for (const diferencia of claves) if (diferencia !== 0) return diferencia;
  // Empate total: se prefiere el que ya estaba en la CPU para no cambiar de trabajo sin necesidad.
  return (b.id === enEjecucion) - (a.id === enEjecucion);
}

/**
 * Simula las tareas durante `horizon` ticks (por defecto, el hiperperíodo: el mínimo común múltiplo
 * de los períodos) y devuelve las métricas y la línea de tiempo.
 */
export function simulateRealTime(tasks, algorithm = RT_ALGORITHMS.EDF, horizon) {
  if (!Object.values(RT_ALGORITHMS).includes(algorithm)) {
    throw new Error(`Algoritmo de tiempo real inválido: ${algorithm}. Usa EDF o RM`);
  }
  const tareas = validarTareas(tasks);

  const hiperperiodo = tareas.reduce((acc, t) => mcm(acc, t.period), 1);
  const limite = horizon === undefined ? hiperperiodo : horizon;
  if (!Number.isInteger(limite) || limite < 1) throw new Error("El horizonte debe ser un entero mayor o igual a 1");
  if (limite > MAX_HORIZON) {
    throw new Error(`El horizonte (${limite}) supera el máximo de ${MAX_HORIZON} ticks; indica un horizonte menor`);
  }

  const porTarea = tareas.map((t) => ({
    name: t.name, period: t.period, computation: t.computation, deadline: t.deadline,
    released: 0, completed: 0, missed: 0, sumResponse: 0, maxResponse: 0,
  }));
  const listos = []; // trabajos pendientes
  const perdidos = [];
  const segmentos = [];
  const respuestas = [];
  let contador = 0;
  let ocupados = 0;
  let cambios = 0;
  let expropiaciones = 0;
  let anterior = null; // trabajo que corrió en el tick anterior (null si no corrió ninguno)
  let ultimoId = null; // último trabajo que tuvo la CPU, aunque después haya habido ticks ociosos

  const marcarTick = (t, job) => {
    const tarea = job ? job.name : null;
    const numero = job ? job.number : null;
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.task === tarea && ultimo.job === numero) ultimo.end = t + 1;
    else segmentos.push({ task: tarea, job: numero, start: t, end: t + 1 });
  };

  for (let t = 0; t <= limite; t += 1) {
    // 1. Los trabajos que llegaron a su deadline sin terminar se pierden.
    for (const job of [...listos]) {
      if (t >= job.deadlineAt) {
        listos.splice(listos.indexOf(job), 1);
        porTarea[job.taskIndex].missed += 1;
        perdidos.push({ task: job.name, job: job.number, release: job.release, deadline: job.deadlineAt });
        if (anterior && anterior.id === job.id) anterior = null;
      }
    }
    if (t === limite) break;

    // 2. Nacen los trabajos nuevos.
    tareas.forEach((tarea, indice) => {
      if (t % tarea.period !== 0) return;
      porTarea[indice].released += 1;
      listos.push({
        id: (contador += 1), taskIndex: indice, name: tarea.name, period: tarea.period,
        number: porTarea[indice].released, release: t, deadlineAt: t + tarea.deadline, remaining: tarea.computation,
      });
    });

    // 3. Se elige el trabajo que corre este tick.
    const enEjecucion = anterior ? anterior.id : null;
    const elegido = [...listos].sort((a, b) => comparar(algorithm, a, b, enEjecucion))[0] ?? null;
    marcarTick(t, elegido);
    if (!elegido) {
      anterior = null;
      continue;
    }
    ocupados += 1;
    // Cambio de contexto: la CPU pasa a un trabajo distinto del último que la usó (el primer despacho no cuenta).
    if (ultimoId !== null && ultimoId !== elegido.id) cambios += 1;
    // Expropiación: el trabajo del tick anterior no había terminado y otro le quitó la CPU.
    if (anterior && anterior.id !== elegido.id && listos.includes(anterior)) expropiaciones += 1;
    ultimoId = elegido.id;

    // 4. Corre un tick.
    elegido.remaining -= 1;
    if (elegido.remaining === 0) {
      listos.splice(listos.indexOf(elegido), 1);
      const respuesta = t + 1 - elegido.release;
      const stats = porTarea[elegido.taskIndex];
      stats.completed += 1;
      stats.sumResponse += respuesta;
      stats.maxResponse = Math.max(stats.maxResponse, respuesta);
      respuestas.push(respuesta);
    }
    anterior = elegido;
  }

  const completed = porTarea.reduce((s, x) => s + x.completed, 0);
  const missed = porTarea.reduce((s, x) => s + x.missed, 0);
  const released = porTarea.reduce((s, x) => s + x.released, 0);
  const utilization = tareas.reduce((s, x) => s + x.computation / x.period, 0);

  return {
    algorithm,
    horizon: limite,
    utilization,
    rmBound: tareas.length * (2 ** (1 / tareas.length) - 1),
    cpuBusyTicks: ocupados,
    cpuUsage: ocupados / limite,
    released,
    completed,
    missed,
    pending: released - completed - missed,
    deadlinesMet: completed,
    missRate: completed + missed === 0 ? 0 : missed / (completed + missed),
    avgResponse: respuestas.length ? respuestas.reduce((s, x) => s + x, 0) / respuestas.length : 0,
    maxResponse: respuestas.length ? Math.max(...respuestas) : 0,
    contextSwitches: cambios,
    preemptions: expropiaciones,
    schedulable: missed === 0,
    tasks: porTarea.map(({ sumResponse, ...x }) => ({
      ...x, avgResponse: x.completed ? sumResponse / x.completed : 0,
    })),
    misses: perdidos,
    timeline: segmentos,
  };
}
