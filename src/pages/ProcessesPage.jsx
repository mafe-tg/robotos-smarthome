import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { PRIORITY_MAP, PRIORITY_LABEL } from '../data/mockData';

// Importación directa de la lógica oficial de la integrante 1 (sin copiar ni modificar sus archivos)
import { ESTADOS, TRANSICIONES_PERMITIDAS, Proceso } from '../../procesos-cpu/src/proceso.js';
import { ALGORITMOS } from '../../procesos-cpu/src/scheduler.js';
import { simular } from '../../procesos-cpu/src/cpu.js';

export const ProcessesPage = () => {
  const {
    processes,
    freeBlocksCount,
    createProcess,
    admitProcess,
    executeProcess,
    pauseProcess,
    resumeProcess,
    terminateProcess,
    addLog,
  } = useSystem();

  const { role, checkPermission } = useAuth();

  // Estado del formulario de creación
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('Media');
  const [tiempoTotal, setTiempoTotal] = useState(4); // Duración en ticks requerida por la clase Proceso
  const [memoryBlocksCount, setMemoryBlocksCount] = useState(2);
  const [cpu, setCpu] = useState(10);
  const [formFeedback, setFormFeedback] = useState(null);

  // Estado del planificador / Scheduler y Simulación
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(ALGORITMOS.PRIORIDAD);
  const [quantum, setQuantum] = useState(2);
  const [simulationResult, setSimulationResult] = useState(null);

  // Estados contados
  const stateCounts = processes.reduce((acc, p) => {
    acc[p.state] = (acc[p.state] || 0) + 1;
    return acc;
  }, {});

  // ==========================================
  // MANEJADORES DE ACCIONES CON PERMISOS
  // ==========================================

  // Crear Proceso (Exclusivo ADMIN)
  const handleCreateSubmit = (e) => {
    e.preventDefault();
    setFormFeedback(null);

    if (!checkPermission('ADMIN', 'Crear nuevo proceso en RobotOS', addLog)) {
      return;
    }

    if (!name.trim()) {
      setFormFeedback({ type: 'error', message: 'El nombre del proceso no puede estar vacío.' });
      return;
    }

    const res = createProcess({
      name,
      priority,
      memoryBlocksCount: Number(memoryBlocksCount),
      cpu: Number(cpu),
      tiempoTotal: Number(tiempoTotal) || 4,
    });

    if (res.success) {
      setFormFeedback({
        type: 'success',
        message: `Proceso "${res.process.name}" (PID ${res.process.pid}) creado en estado NEW con duración de ${res.process.tiempoTotal} ticks y ${res.process.memoryBlocks} bloques de memoria.`,
      });
      setName('');
      setTiempoTotal(4);
      setMemoryBlocksCount(2);
      setCpu(10);
    } else {
      setFormFeedback({
        type: 'error',
        message: 'No hay memoria suficiente para crear el proceso. Revisa la bandeja de alertas.',
      });
    }
  };

  // Admitir Proceso: NEW -> READY (Permitido para ADMIN y USER)
  const handleAdmit = (proc) => {
    if (!checkPermission('USER', `Admitir proceso "${proc.name}" (PID ${proc.pid}) al sistema`, addLog)) {
      return;
    }
    admitProcess(proc.id);
  };

  // Ejecutar Proceso: READY -> RUNNING (Permitido para ADMIN y USER)
  const handleExecute = (proc) => {
    if (!checkPermission('USER', `Ejecutar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    executeProcess(proc.id);
  };

  // Pausar Proceso: RUNNING o READY -> WAITING (Permitido para ADMIN y USER)
  const handlePause = (proc) => {
    if (!checkPermission('USER', `Pausar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    pauseProcess(proc.id);
  };

  // Reanudar Proceso: WAITING -> READY (Permitido para ADMIN y USER)
  const handleResume = (proc) => {
    if (!checkPermission('USER', `Reanudar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    resumeProcess(proc.id);
  };

  // Finalizar Proceso: Cualquier estado -> TERMINATED (Exclusivo ADMIN)
  const handleTerminate = (proc) => {
    if (proc.isSystem && role !== 'ADMIN') {
      checkPermission(
        'ADMIN',
        `Finalizar proceso crítico del sistema "${proc.name}"`,
        () => {
          addLog({
            level: 'ERROR',
            source: 'SECURITY_GUARD',
            message: `[ACCESO DENEGADO] Intento de finalizar "${proc.name}": es un proceso crítico del sistema (requiere rol ADMIN).`,
          });
        }
      );
      return;
    }

    if (!checkPermission('ADMIN', `Finalizar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }

    terminateProcess(proc.id);
  };

  // ==========================================
  // EJECUTAR SIMULACIÓN DE PLANIFICACIÓN (GANTT)
  // ==========================================
  const handleRunSimulation = () => {
    if (!checkPermission('USER', 'Ejecutar simulación del planificador de CPU (Scheduler)', addLog)) {
      return;
    }

    // Tomar los procesos que no están terminados
    const activeProcesses = processes.filter((p) => p.state !== ESTADOS.TERMINATED);

    if (activeProcesses.length === 0) {
      setSimulationResult(null);
      alert('No hay procesos activos en el sistema para planificar.');
      return;
    }

    // Instanciar objetos de la clase Proceso de la compañera para no alterar el estado vivo del dashboard
    const clonedInstances = activeProcesses.map((p) => {
      const numPriority = PRIORITY_MAP[p.priority] || p.prioridadNum || 3;
      const memReq = p.memory || (p.memoryBlocks * 16) || 32;
      const dur = p.tiempoTotal || 4;

      const procObj = new Proceso({
        nombre: p.name,
        prioridad: numPriority,
        memoriaRequerida: memReq,
        cpuRequerida: p.cpu,
        tiempoTotal: dur,
      });

      // Conservar el PID visual del dashboard
      procObj.pid = p.pid;

      // Sincronizar el estado según la máquina de estados de Proceso
      if (p.state === ESTADOS.READY || p.state === ESTADOS.RUNNING) {
        procObj.admitir();
      } else if (p.state === ESTADOS.WAITING) {
        procObj.admitir();
        procObj.pausar();
      }

      return procObj;
    });

    // Ejecutar la simulación con la función simular() de cpu.js
    const result = simular(clonedInstances, {
      algoritmo: selectedAlgorithm,
      quantum: Number(quantum) || 2,
    });

    setSimulationResult(result);

    // Cálculo del uso de CPU como tiempo ocupado sobre tiempo total
    const ticksOcupados = result.linea.length;
    const usoCpuOcupacion = result.duracionTotal > 0
      ? Math.round((ticksOcupados / result.duracionTotal) * 100)
      : 0;

    addLog({
      level: 'INFO',
      source: 'SCHEDULER',
      message: `[SIMULACIÓN GANTT] Planificación ejecutada con éxito. Algoritmo: ${selectedAlgorithm}${
        selectedAlgorithm === ALGORITMOS.ROUND_ROBIN ? ` (Quantum: ${quantum})` : ''
      }. Procesos evaluados: ${clonedInstances.length}, Duración total: ${result.duracionTotal} ticks, Uso CPU (Ocupación): ${usoCpuOcupacion}% (${ticksOcupados}/${result.duracionTotal} ticks), CPU Requerida Promedio: ${result.usoCpuPromedio}%.`,
    });
  };

  // Paleta de colores para el Gantt según el PID
  const getProcessColor = (pid) => {
    const original = processes.find((p) => p.pid === pid);
    if (original?.color) return original.color;
    const colors = ['#06B6D4', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];
    return colors[pid % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Gestor de Procesos & Planificador CPU</h2>
          <p className="text-xs text-slate-400">
            Máquina de estados estricta (proceso.js), planificador (scheduler.js) y simulación Gantt (cpu.js).
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
          <span>ROL ACTIVO:</span>
          <span className="font-bold text-white uppercase">{role}</span>
        </div>
      </div>

      {/* Contadores de estados */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-lg font-black text-white">{processes.length}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">Total Procesos</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-blue-900/40 text-center">
          <div className="text-lg font-black text-blue-400">{stateCounts[ESTADOS.NEW] || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">NEW</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-900/40 text-center">
          <div className="text-lg font-black text-amber-400">{stateCounts[ESTADOS.READY] || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">READY</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-900/40 text-center">
          <div className="text-lg font-black text-emerald-400">{stateCounts[ESTADOS.RUNNING] || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">RUNNING</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-orange-900/40 text-center">
          <div className="text-lg font-black text-orange-400">{stateCounts[ESTADOS.WAITING] || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">WAITING</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-lg font-black text-slate-500">{stateCounts[ESTADOS.TERMINATED] || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">TERMINATED</div>
        </div>
      </div>

      {/* 1. SECCIÓN DE SIMULACIÓN DEL SCHEDULER & DIAGRAMA DE GANTT */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-cyan-800/40 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>Simulación de Planificación de CPU (Scheduler)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Ejecuta el algoritmo sobre los procesos activos y genera el diagrama de Gantt en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de Algoritmo */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <label className="text-[11px] font-mono text-slate-400">Algoritmo:</label>
              <select
                value={selectedAlgorithm}
                onChange={(e) => setSelectedAlgorithm(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-cyan-400 focus:outline-none cursor-pointer"
              >
                <option value={ALGORITMOS.PRIORIDAD} className="bg-slate-900 text-white">
                  Prioridad (1 = Crítica)
                </option>
                <option value={ALGORITMOS.ROUND_ROBIN} className="bg-slate-900 text-white">
                  Round Robin (Turnos rotativos)
                </option>
              </select>
            </div>

            {/* Quantum si es Round Robin */}
            {selectedAlgorithm === ALGORITMOS.ROUND_ROBIN && (
              <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                <label className="text-[11px] font-mono text-slate-400">Quantum (ticks):</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quantum}
                  onChange={(e) => setQuantum(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 bg-transparent text-xs font-mono font-bold text-cyan-400 focus:outline-none text-center"
                />
              </div>
            )}

            {/* Botón de Simulación */}
            <button
              onClick={handleRunSimulation}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-cyan-600/30 transition-all flex items-center space-x-2 cursor-pointer"
            >
              <span>⚡ Simular planificación</span>
            </button>
          </div>
        </div>

        {/* RESULTADO DE LA SIMULACIÓN */}
        {simulationResult ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Métricas Globales */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-500">Algoritmo Ejecutado</div>
                <div className="text-sm font-bold text-cyan-400 mt-0.5">
                  {simulationResult.algoritmo} {simulationResult.quantum ? `(Q=${simulationResult.quantum})` : ''}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-500">Duración Total</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {simulationResult.duracionTotal} ticks
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-500">Uso de CPU (Ocupación)</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                  {simulationResult.duracionTotal > 0
                    ? Math.round((simulationResult.linea.length / simulationResult.duracionTotal) * 100)
                    : 0}%
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {simulationResult.linea.length} de {simulationResult.duracionTotal} ticks ocupados
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-500">CPU Requerida Promedio</div>
                <div className="text-sm font-bold text-amber-400 mt-0.5">
                  {simulationResult.usoCpuPromedio}%
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Carga media por proceso
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono uppercase text-slate-500">Procesos Atendidos</div>
                <div className="text-sm font-bold text-purple-400 mt-0.5">
                  {simulationResult.metricas.length} en cola
                </div>
              </div>
            </div>

            {/* DIAGRAMA DE GANTT (HTML + CSS) */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                    Diagrama de Gantt de la CPU
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Ocupación temporal de la CPU por cada proceso tick a tick
                  </p>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Total: {simulationResult.duracionTotal} ticks
                </span>
              </div>

              {/* 1. Secuencia Unificada de Ejecución (Timeline Bar) */}
              <div className="space-y-1">
                <div className="text-[10px] font-mono text-slate-400">Secuencia en CPU:</div>
                <div className="flex overflow-x-auto pb-2 border border-slate-800 rounded-lg p-1 bg-slate-900/60">
                  {simulationResult.linea.map((item, idx) => {
                    const procColor = getProcessColor(item.pid);
                    return (
                      <div
                        key={idx}
                        className="h-10 min-w-[42px] flex flex-col items-center justify-center text-[10px] font-mono font-bold border-r border-slate-950/60 transition-transform hover:scale-105"
                        style={{ backgroundColor: procColor, color: '#FFFFFF' }}
                        title={`Tick ${item.tick}: PID ${item.pid} (${item.nombre})`}
                      >
                        <span className="text-[9px] opacity-80">t{item.tick}</span>
                        <span>#{item.pid}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Filas de Gantt por Proceso */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="text-[10px] font-mono text-slate-400">Asignación por Proceso:</div>
                <div className="space-y-1.5 overflow-x-auto">
                  {simulationResult.metricas.map((m) => {
                    const procColor = getProcessColor(m.pid);
                    return (
                      <div key={m.pid} className="flex items-center space-x-2 text-xs font-mono min-w-[500px]">
                        <div className="w-48 shrink-0 truncate flex items-center justify-between pr-2">
                          <span className="font-bold text-slate-200">PID {m.pid}: {m.nombre}</span>
                          <span className="text-[10px] text-slate-400">
                            {PRIORITY_LABEL[m.prioridad] || `Nivel ${m.prioridad}`}
                          </span>
                        </div>

                        {/* Celdas de tiempo */}
                        <div className="flex items-center space-x-1 flex-1 bg-slate-900 p-1 rounded-md">
                          {Array.from({ length: simulationResult.duracionTotal }).map((_, tickIdx) => {
                            const isRunning = simulationResult.linea[tickIdx]?.pid === m.pid;
                            const isWaiting = tickIdx < m.retorno && !isRunning;

                            return (
                              <div
                                key={tickIdx}
                                className={`h-6 flex-1 min-w-[20px] rounded text-[9px] flex items-center justify-center font-bold transition-all ${
                                  isRunning
                                    ? 'shadow-sm text-white'
                                    : isWaiting
                                    ? 'bg-slate-800/60 text-slate-500 border border-dashed border-slate-700'
                                    : 'bg-transparent text-slate-700'
                                }`}
                                style={isRunning ? { backgroundColor: procColor } : {}}
                                title={`Tick ${tickIdx}: ${isRunning ? 'EJECUTANDO' : isWaiting ? 'ESPERANDO' : 'FINALIZADO'}`}
                              >
                                {isRunning ? '⚡' : isWaiting ? '·' : ''}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* TABLA DE MÉTRICAS DETALLADAS (Espera y Retorno) */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                Métricas Calculadas por el Planificador
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2 px-3">PID</th>
                      <th className="py-2 px-3">Proceso</th>
                      <th className="py-2 px-3">Prioridad</th>
                      <th className="py-2 px-3">Duración (Ráfaga)</th>
                      <th className="py-2 px-3">Tiempo de Espera</th>
                      <th className="py-2 px-3">Tiempo de Retorno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {simulationResult.metricas.map((m) => (
                      <tr key={m.pid} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 font-bold text-slate-300">#{m.pid}</td>
                        <td className="py-2 px-3 text-white font-medium">{m.nombre}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {PRIORITY_LABEL[m.prioridad] || `Nivel ${m.prioridad}`} (Valor: {m.prioridad})
                          </span>
                        </td>
                        <td className="py-2 px-3 text-cyan-400 font-bold">{m.tiempoTotal} ticks</td>
                        <td className="py-2 px-3 text-amber-400 font-bold">{m.espera} ticks</td>
                        <td className="py-2 px-3 text-emerald-400 font-bold">{m.retorno} ticks</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Aviso de Procesos Omitidos si los hay */}
            {simulationResult.omitidos && simulationResult.omitidos.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/40 text-xs text-amber-200 font-mono">
                <strong>Aviso del Scheduler:</strong> Los siguientes procesos fueron omitidos de la planificación porque se encuentran en estado WAITING o TERMINATED:{' '}
                {simulationResult.omitidos.map((o) => `[PID ${o.pid}: ${o.nombre} (${o.estado})]`).join(', ')}
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-2">
            <div className="text-2xl">📊</div>
            <div className="text-sm font-semibold text-slate-300">Planificador listo para simular</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Presiona el botón <strong>"Simular planificación"</strong> arriba para calcular las ráfagas con la lógica de <code>cpu.js</code> y desplegar el Diagrama de Gantt.
            </p>
          </div>
        )}
      </div>

      {/* 2. FORMULARIO PARA CREAR PROCESOS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Crear Nuevo Proceso de RobotOS</span>
            </h3>
            <p className="text-xs text-slate-400">
              Inicia en estado <span className="text-blue-400 font-mono font-bold">NEW</span> y debe ser admitido antes de ejecutarse.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-500">Memoria libre:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              freeBlocksCount > 5
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                : 'bg-red-950/60 text-red-400 border border-red-800/60'
            }`}>
              {freeBlocksCount} bloques ({freeBlocksCount * 16} MB)
            </span>
          </div>
        </div>

        {formFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-mono font-medium ${
              formFeedback.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border border-red-800 text-red-300'
            }`}
          >
            {formFeedback.message}
          </div>
        )}

        <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          {/* Nombre */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Nombre del Proceso
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. vacuum_planner, garden_irrigation"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* Prioridad con equivalencia oficial */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Prioridad
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            >
              <option value="Crítica">Crítica (1)</option>
              <option value="Alta">Alta (2)</option>
              <option value="Media">Media (3)</option>
              <option value="Baja">Baja (4)</option>
            </select>
          </div>

          {/* Duración (tiempoTotal en ticks) */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Duración: <span className="text-cyan-400 font-bold">{tiempoTotal} ticks</span>
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={tiempoTotal}
              onChange={(e) => setTiempoTotal(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* Memoria Requerida (en Bloques) */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Memoria: <span className="text-cyan-400 font-bold">{memoryBlocksCount} blq</span>
            </label>
            <input
              type="number"
              min={1}
              max={64}
              value={memoryBlocksCount}
              onChange={(e) => setMemoryBlocksCount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* CPU Requerida (%) */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              CPU: <span className="text-cyan-400 font-bold">{cpu}%</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={cpu}
              onChange={(e) => setCpu(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            />
          </div>

          {/* Botón de Envío */}
          <div className="lg:col-span-6 sm:col-span-2 flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-cyan-600/20 flex items-center space-x-2 cursor-pointer"
            >
              <span>+ Crear Proceso</span>
              {role !== 'ADMIN' && <span className="text-[10px] text-cyan-200">(Requiere ADMIN)</span>}
            </button>
          </div>
        </form>
      </div>

      {/* 3. TABLA DE PROCESOS CON TRANSICIONES OFICIALES */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Tabla de Procesos del Kernel</h3>
            <p className="text-xs text-slate-400">
              Control de transiciones según la máquina de estados oficial (TRANSICIONES_PERMITIDAS).
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Total activos: <strong className="text-white">{processes.filter((p) => p.state !== ESTADOS.TERMINATED).length}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">PID</th>
                <th className="py-3 px-3">Nombre</th>
                <th className="py-3 px-3">Prioridad</th>
                <th className="py-3 px-3">Estado</th>
                <th className="py-3 px-3">Duración</th>
                <th className="py-3 px-3">CPU</th>
                <th className="py-3 px-3">Memoria</th>
                <th className="py-3 px-3 text-center">Acciones de Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {processes.map((proc) => {
                const isTerminated = proc.state === ESTADOS.TERMINATED;

                // Validación de botones según TRANSICIONES_PERMITIDAS de proceso.js
                // NEW: ["READY", "TERMINATED"] -> Admitir o Finalizar
                // READY: ["RUNNING", "WAITING", "TERMINATED"] -> Ejecutar, Pausar o Finalizar
                // RUNNING: ["READY", "WAITING", "TERMINATED"] -> Pausar o Finalizar
                // WAITING: ["READY", "TERMINATED"] -> Reanudar o Finalizar
                const canAdmit = proc.state === ESTADOS.NEW;
                const canExecute = proc.state === ESTADOS.READY;
                const canPause = proc.state === ESTADOS.RUNNING || proc.state === ESTADOS.READY;
                const canResume = proc.state === ESTADOS.WAITING;
                const canTerminate = !isTerminated;

                const prioNum = PRIORITY_MAP[proc.priority] || proc.prioridadNum || 3;
                const prioLabel = PRIORITY_LABEL[prioNum] || proc.priority;

                return (
                  <tr key={proc.id} className="hover:bg-slate-950/40 transition-colors">
                    {/* PID */}
                    <td className="py-3 px-3 font-bold text-slate-300">
                      #{proc.pid}
                    </td>

                    {/* Nombre y Tag de Sistema */}
                    <td className="py-3 px-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white">{proc.name}</span>
                        {proc.isSystem && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            Sistema
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">{proc.description}</div>
                    </td>

                    {/* Prioridad con equivalencia numérica */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          prioNum === 1
                            ? 'bg-red-950 text-red-400 border border-red-800/80 animate-pulse'
                            : prioNum === 2
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                            : prioNum === 3
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {prioLabel} ({prioNum})
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                          proc.state === ESTADOS.RUNNING
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                            : proc.state === ESTADOS.WAITING
                            ? 'bg-orange-950 text-orange-400 border border-orange-800/80'
                            : proc.state === ESTADOS.READY
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/80'
                            : proc.state === ESTADOS.NEW
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/80'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {proc.state}
                      </span>
                    </td>

                    {/* Duración (ticks) */}
                    <td className="py-3 px-3 text-cyan-400 font-bold">
                      {proc.tiempoTotal || 4} ticks
                    </td>

                    {/* CPU */}
                    <td className="py-3 px-3 text-slate-300">
                      {isTerminated ? '0%' : `${proc.cpu}%`}
                    </td>

                    {/* Memoria */}
                    <td className="py-3 px-3">
                      {isTerminated ? (
                        <span className="text-slate-500">Liberada</span>
                      ) : (
                        <div className="text-slate-300">
                          <span className="text-cyan-400 font-bold">{proc.memoryBlocks || 1} blq</span>
                          <span className="text-slate-500 text-[10px] ml-1">({proc.memory || (proc.memoryBlocks * 16)} MB)</span>
                        </div>
                      )}
                    </td>

                    {/* Botones de Acción con "Admitir" integrado */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center space-x-1.5">
                        {/* Admitir: NEW -> READY */}
                        <button
                          onClick={() => handleAdmit(proc)}
                          disabled={!canAdmit}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canAdmit
                              ? 'bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canAdmit ? 'Admitir proceso al sistema (NEW -> READY)' : 'Solo aplicable a procesos NEW'}
                        >
                          📥 Admitir
                        </button>

                        {/* Ejecutar: READY -> RUNNING */}
                        <button
                          onClick={() => handleExecute(proc)}
                          disabled={!canExecute}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canExecute
                              ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={
                            canExecute
                              ? 'Poner en ejecución (READY -> RUNNING)'
                              : proc.state === ESTADOS.NEW
                              ? 'Un proceso NEW debe ser admitido primero'
                              : 'No aplica al estado actual'
                          }
                        >
                          ▶ Ejecutar
                        </button>

                        {/* Pausar: RUNNING o READY -> WAITING */}
                        <button
                          onClick={() => handlePause(proc)}
                          disabled={!canPause}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canPause
                              ? 'bg-orange-950/80 hover:bg-orange-900 text-orange-300 border border-orange-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canPause ? 'Pausar proceso (WAITING)' : 'No aplica al estado actual'}
                        >
                          ⏸ Pausar
                        </button>

                        {/* Reanudar: WAITING -> READY */}
                        <button
                          onClick={() => handleResume(proc)}
                          disabled={!canResume}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canResume
                              ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canResume ? 'Reanudar proceso (READY)' : 'No aplica al estado actual'}
                        >
                          🔄 Reanudar
                        </button>

                        {/* Finalizar: Cualquier estado activo -> TERMINATED */}
                        <button
                          onClick={() => handleTerminate(proc)}
                          disabled={!canTerminate}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canTerminate
                              ? 'bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={
                            !canTerminate
                              ? 'El proceso ya está finalizado'
                              : proc.isSystem && role !== 'ADMIN'
                              ? 'Proceso crítico: requiere ADMIN'
                              : 'Finalizar y liberar memoria'
                          }
                        >
                          ⏹ Finalizar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
