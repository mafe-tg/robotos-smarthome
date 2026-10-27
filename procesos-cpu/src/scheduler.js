// src/scheduler.js
// El "scheduler" (planificador) decide a QUIÉN le toca usar la CPU.
//
// Analogía: la CPU es un único robot de limpieza que solo puede atender
// una tarea a la vez. El scheduler es la lista de reglas que decide cuál
// tarea atiende primero.
//
// El profesor pide al menos un algoritmo. Aquí hay dos:
//  - PRIORIDAD: siempre se atiende primero lo más urgente.
//  - ROUND_ROBIN: todos reciben turnos cortos y rotan, como repartir
//    cucharadas de sopa entre varios platos.

export const ALGORITMOS = Object.freeze({
  PRIORIDAD: "PRIORIDAD",
  ROUND_ROBIN: "ROUND_ROBIN",
});

// Regla de PRIORIDAD: gana el número de prioridad MÁS BAJO (1 = más urgente).
// Si hay empate, gana el que se creó antes (pid menor).
function elegirPorPrioridad(cola) {
  let elegido = cola[0];
  for (const proceso of cola) {
    const masUrgente = proceso.prioridad < elegido.prioridad;
    const empateYLlegoAntes =
      proceso.prioridad === elegido.prioridad && proceso.pid < elegido.pid;
    if (masUrgente || empateYLlegoAntes) {
      elegido = proceso;
    }
  }
  return elegido;
}

// Saca de la cola (lista de procesos READY) al siguiente proceso a ejecutar.
// Devuelve null si la cola está vacía.
export function sacarSiguiente(cola, algoritmo) {
  if (cola.length === 0) {
    return null;
  }
  if (algoritmo === ALGORITMOS.PRIORIDAD) {
    const elegido = elegirPorPrioridad(cola);
    cola.splice(cola.indexOf(elegido), 1);
    return elegido;
  }
  if (algoritmo === ALGORITMOS.ROUND_ROBIN) {
    return cola.shift(); // el primero de la fila
  }
  throw new Error(`Algoritmo desconocido: ${algoritmo}`);
}
