/**
 * deadlockModule.js — Módulo de Interbloqueo (Deadlock) y Grafo de Recursos (RAG)
 *
 * Diseñado como un subsistema modular desacoplado, preparado para conectarse
 * directamente con el módulo de sincronización y concurrencia de Sofia.
 *
 * Componentes:
 * 1. Definición de Recursos Compartidos del bus y del kernel.
 * 2. Grafo de Asignación de Recursos (Resource Allocation Graph - RAG).
 * 3. Inyección controlada de espera circular (Circular Wait / Hold & Wait).
 * 4. Algoritmo de detección de ciclos mediante DFS (Tarjan / Cycle Detector).
 * 5. Política de recuperación basada en prioridades del sistema (selección de víctima).
 */

// ─── 1. Recursos Compartidos del Kernel ─────────────────────────────────────
export const SHARED_RESOURCES = [
  {
    id: 'RES_I2C_BUS',
    name: 'Mutex Bus I2C Telemetría',
    type: 'Hardware Bus Mutex',
    description: 'Control de acceso exclusivo a sensores de temperatura y movimiento',
  },
  {
    id: 'RES_GPIO_LOCK',
    name: 'Cerrojo GPIO Biometría',
    type: 'Actuator GPIO Lock',
    description: 'Control de pulso eléctrico del cerrojo de la puerta principal',
  },
  {
    id: 'RES_CAM_BUFFER',
    name: 'Buffer DMA Cámara Frontal',
    type: 'DMA Framebuffer',
    description: 'Región de memoria de alta velocidad para capturas perimetrales',
  },
  {
    id: 'RES_IPC_CHANNEL',
    name: 'Canal IPC Mensajería Kernel',
    type: 'IPC Message Queue',
    description: 'Cola de sincronización entre daemons de sistema y rutinas de usuario',
  },
];

// ─── 2. Estructura inicial del Grafo RAG ─────────────────────────────────────
export function createEmptyRAG() {
  return {
    allocations: {}, // resourceId -> processName (recurso asignado a proceso)
    requests: {},    // processName -> [resourceId] (proceso solicita recurso)
  };
}

// ─── 3. Inyección de Espera Circular (Deadlock) ──────────────────────────────
/**
 * Configura una espera circular clásica entre dos procesos:
 * - Proceso A retiene R1 y solicita R2.
 * - Proceso B retiene R2 y solicita R1.
 *
 * @param {string} procAName - Ej: 'lock_guard'
 * @param {string} procBName - Ej: 'routine_engine'
 * @param {string} res1Id    - Ej: 'RES_GPIO_LOCK'
 * @param {string} res2Id    - Ej: 'RES_I2C_BUS'
 */
export function injectDeadlockRAG(
  procAName = 'lock_guard',
  procBName = 'routine_engine',
  res1Id = 'RES_GPIO_LOCK',
  res2Id = 'RES_I2C_BUS'
) {
  const rag = createEmptyRAG();

  // Asignaciones (Hold)
  rag.allocations[res1Id] = procAName; // A retiene R1
  rag.allocations[res2Id] = procBName; // B retiene R2

  // Peticiones pendientes (Wait)
  rag.requests[procAName] = [res2Id]; // A espera R2 (retenido por B)
  rag.requests[procBName] = [res1Id]; // B espera R1 (retenido por A)

  return {
    rag,
    processes: [procAName, procBName],
    resources: [res1Id, res2Id],
    description: `Espera circular inducida: "${procAName}" retiene ${res1Id} y solicita ${res2Id}; "${procBName}" retiene ${res2Id} y solicita ${res1Id}.`,
  };
}

// ─── 4. Detección de Ciclos en el Grafo (Cycle Detection / DFS) ─────────────
/**
 * Construye el grafo de espera (Wait-For Graph) a partir del RAG y busca ciclos dirigidos.
 *
 * @param {object} rag
 * @returns {object} { hasDeadlock: boolean, cycle: string[] | null, processesInCycle: string[] }
 */
export function detectDeadlockInRAG(rag) {
  if (!rag || !rag.requests || !rag.allocations) {
    return { hasDeadlock: false, cycle: null, processesInCycle: [] };
  }

  // Grafo de espera entre procesos: procA -> [procB]
  const waitGraph = {};
  const allProcesses = new Set();

  for (const [proc, reqList] of Object.entries(rag.requests)) {
    allProcesses.add(proc);
    waitGraph[proc] = waitGraph[proc] || [];

    for (const resId of reqList) {
      const holder = rag.allocations[resId];
      if (holder && holder !== proc) {
        waitGraph[proc].push(holder);
        allProcesses.add(holder);
      }
    }
  }

  // Detección de ciclo usando DFS y Call Stack
  const visited = {};
  const recStack = {};
  let detectedCycle = null;

  function dfs(node, path) {
    visited[node] = true;
    recStack[node] = true;
    path.push(node);

    const neighbors = waitGraph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited[neighbor]) {
        if (dfs(neighbor, [...path])) return true;
      } else if (recStack[neighbor]) {
        const cycleStartIndex = path.indexOf(neighbor);
        detectedCycle = [...path.slice(cycleStartIndex), neighbor];
        return true;
      }
    }

    recStack[node] = false;
    return false;
  }

  for (const proc of allProcesses) {
    if (!visited[proc]) {
      if (dfs(proc, [])) break;
    }
  }

  if (detectedCycle) {
    const uniqueProcs = Array.from(new Set(detectedCycle));
    return {
      hasDeadlock: true,
      cycle: detectedCycle,
      processesInCycle: uniqueProcs,
      waitGraph,
    };
  }

  return {
    hasDeadlock: false,
    cycle: null,
    processesInCycle: [],
    waitGraph,
  };
}

// ─── 5. Resolución de Deadlock por Prioridad (Victim Selection) ─────────────
/**
 * Resuelve el interbloqueo evaluando las prioridades del sistema:
 * Crítica (1) > Alta (2) > Media (3) > Baja (4).
 *
 * La regla de decisión protege al proceso de mayor urgencia y selecciona
 * como víctima al de menor prioridad (número mayor) para expropiarlo/reiniciarlo.
 *
 * @param {Array} systemProcesses - lista de procesos reales de RobotOS
 * @param {Array} deadlockedProcNames - nombres de los procesos en interbloqueo
 * @param {object} rag
 */
export function resolveDeadlockByPriority(systemProcesses, deadlockedProcNames, rag) {
  const matched = systemProcesses.filter((p) => deadlockedProcNames.includes(p.name));

  // Ordenar por prioridad numérica descendente (el número más alto = menor prioridad = víctima)
  const sorted = [...matched].sort((a, b) => {
    const prioA = a.prioridadNum || 3;
    const prioB = b.prioridadNum || 3;
    return prioB - prioA;
  });

  const victim = sorted[0] || { name: deadlockedProcNames[1] || 'routine_engine', prioridadNum: 3 };
  const survivor = sorted[sorted.length - 1] || { name: deadlockedProcNames[0] || 'lock_guard', prioridadNum: 1 };

  // Recursos a liberar por la víctima
  const freedResources = [];
  const updatedRAG = {
    allocations: { ...rag.allocations },
    requests: { ...rag.requests },
  };

  // Quitar asignaciones y peticiones de la víctima
  for (const [resId, holder] of Object.entries(updatedRAG.allocations)) {
    if (holder === victim.name) {
      freedResources.push(resId);
      delete updatedRAG.allocations[resId];
    }
  }
  delete updatedRAG.requests[victim.name];

  // Conceder el recurso liberado al proceso sobreviviente
  for (const resId of freedResources) {
    const waitingForRes = updatedRAG.requests[survivor.name] || [];
    if (waitingForRes.includes(resId)) {
      updatedRAG.allocations[resId] = survivor.name;
      updatedRAG.requests[survivor.name] = waitingForRes.filter((r) => r !== resId);
    }
  }

  return {
    victim,
    survivor,
    freedResources,
    updatedRAG,
    explanation: `Proceso víctima seleccionado: "${victim.name}" (Prioridad ${victim.prioridadNum || 3}) para proteger a "${survivor.name}" (Prioridad ${survivor.prioridadNum || 1}). Recursos liberados: [${freedResources.join(', ')}].`,
  };
}
