import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';

export const ProcessesPage = () => {
  const {
    processes,
    freeBlocksCount,
    createProcess,
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
  const [memoryBlocksCount, setMemoryBlocksCount] = useState(2);
  const [cpu, setCpu] = useState(10);
  const [formFeedback, setFormFeedback] = useState(null); // { type: 'success' | 'error', message }

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

    // Validación de permisos RBAC
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
    });

    if (res.success) {
      setFormFeedback({
        type: 'success',
        message: `Proceso "${res.process.name}" (PID ${res.process.pid}) creado en estado NEW con ${res.process.memoryBlocks} bloques asignados.`,
      });
      setName('');
      setMemoryBlocksCount(2);
      setCpu(10);
    } else {
      setFormFeedback({
        type: 'error',
        message: 'No hay memoria suficiente para crear el proceso. Revisa la bandeja de alertas.',
      });
    }
  };

  // Ejecutar Proceso (USER o ADMIN)
  const handleExecute = (proc) => {
    if (!checkPermission('USER', `Ejecutar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    executeProcess(proc.id);
  };

  // Pausar Proceso (USER o ADMIN)
  const handlePause = (proc) => {
    if (!checkPermission('USER', `Pausar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    pauseProcess(proc.id);
  };

  // Reanudar Proceso (USER o ADMIN)
  const handleResume = (proc) => {
    if (!checkPermission('USER', `Reanudar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }
    resumeProcess(proc.id);
  };

  // Finalizar Proceso (Exclusivo ADMIN, o denegado si USER intenta proceso crítico)
  const handleTerminate = (proc) => {
    // Si un USER intenta finalizar un proceso crítico del sistema
    if (proc.isSystem && role !== 'ADMIN') {
      checkPermission(
        'ADMIN',
        `Finalizar proceso crítico del sistema "${proc.name}"`,
        (logData) => {
          addLog({
            level: 'ERROR',
            source: 'SECURITY_GUARD',
            message: `[ACCESO DENEGADO] Intento de finalizar "${proc.name}": es un proceso crítico del sistema (requiere rol ADMIN).`,
          });
        }
      );
      return;
    }

    // Para cualquier proceso, solo ADMIN puede finalizar
    if (!checkPermission('ADMIN', `Finalizar proceso "${proc.name}" (PID ${proc.pid})`, addLog)) {
      return;
    }

    terminateProcess(proc.id);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Gestor de Procesos</h2>
          <p className="text-xs text-slate-400">
            Ciclo de vida, asignación de bloques de memoria y control de ejecución en RobotOS.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl self-start sm:self-auto">
          <span>ROL ACTIVO:</span>
          <span className="font-bold text-white uppercase">{role}</span>
        </div>
      </div>

      {/* Barra de métricas y contadores de estados */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-lg font-black text-white">{processes.length}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">Total Procesos</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-blue-900/40 text-center">
          <div className="text-lg font-black text-blue-400">{stateCounts.NEW || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">NEW</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-amber-900/40 text-center">
          <div className="text-lg font-black text-amber-400">{stateCounts.READY || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">READY</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-900/40 text-center">
          <div className="text-lg font-black text-emerald-400">{stateCounts.RUNNING || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">RUNNING</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-orange-900/40 text-center">
          <div className="text-lg font-black text-orange-400">{stateCounts.WAITING || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">WAITING</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
          <div className="text-lg font-black text-slate-500">{stateCounts.TERMINATED || 0}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">TERMINATED</div>
        </div>
      </div>

      {/* 1. FORMULARIO PARA CREAR PROCESOS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span>Crear Nuevo Proceso de RobotOS</span>
            </h3>
            <p className="text-xs text-slate-400">
              Inicia en estado <span className="text-blue-400 font-mono font-bold">NEW</span> y reserva automáticamente bloques de memoria física.
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

        <form onSubmit={handleCreateSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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

          {/* Prioridad */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Prioridad
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-white font-mono"
            >
              <option value="Baja">Baja</option>
              <option value="Media">Media</option>
              <option value="Alta">Alta</option>
              <option value="Crítica">Crítica</option>
            </select>
          </div>

          {/* Memoria Requerida (en Bloques) */}
          <div>
            <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
              Memoria: <span className="text-cyan-400 font-bold">{memoryBlocksCount} blq ({memoryBlocksCount * 16} MB)</span>
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
          <div className="lg:col-span-5 sm:col-span-2 flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs tracking-wide transition-all shadow-lg shadow-cyan-600/20 flex items-center space-x-2"
            >
              <span>+ Crear Proceso</span>
              {role !== 'ADMIN' && <span className="text-[10px] text-cyan-200">(Requiere ADMIN)</span>}
            </button>
          </div>
        </form>
      </div>

      {/* 2. TABLA DE PROCESOS CON ACCIONES DINÁMICAS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Tabla de Procesos del Kernel</h3>
            <p className="text-xs text-slate-400">
              Control individual de transiciones de estados y liberación de recursos.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Total activos: <strong className="text-white">{processes.filter((p) => p.state !== 'TERMINATED').length}</strong>
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
                <th className="py-3 px-3">CPU</th>
                <th className="py-3 px-3">Memoria</th>
                <th className="py-3 px-3 text-center">Acciones de Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {processes.map((proc) => {
                const isTerminated = proc.state === 'TERMINATED';
                const canExecute = proc.state === 'NEW' || proc.state === 'READY';
                const canPause = proc.state === 'RUNNING';
                const canResume = proc.state === 'WAITING';
                const canTerminate = !isTerminated;

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

                    {/* Prioridad */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          proc.priority === 'Crítica'
                            ? 'bg-red-950 text-red-400 border border-red-800/80 animate-pulse'
                            : proc.priority === 'Alta'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                            : proc.priority === 'Media'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {proc.priority}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                          proc.state === 'RUNNING'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                            : proc.state === 'WAITING'
                            ? 'bg-orange-950 text-orange-400 border border-orange-800/80'
                            : proc.state === 'READY'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/80'
                            : proc.state === 'NEW'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/80'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {proc.state}
                      </span>
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

                    {/* Botones de Acción */}
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center space-x-1.5">
                        {/* Ejecutar */}
                        <button
                          onClick={() => handleExecute(proc)}
                          disabled={!canExecute}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canExecute
                              ? 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canExecute ? 'Poner en ejecución (RUNNING)' : 'No aplica al estado actual'}
                        >
                          ▶ Ejecutar
                        </button>

                        {/* Pausar */}
                        <button
                          onClick={() => handlePause(proc)}
                          disabled={!canPause}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canPause
                              ? 'bg-orange-950/80 hover:bg-orange-900 text-orange-300 border border-orange-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canPause ? 'Pausar proceso (WAITING)' : 'No aplica al estado actual'}
                        >
                          ⏸ Pausar
                        </button>

                        {/* Reanudar */}
                        <button
                          onClick={() => handleResume(proc)}
                          disabled={!canResume}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            canResume
                              ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-700/80 shadow-sm cursor-pointer'
                              : 'bg-slate-950 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-40'
                          }`}
                          title={canResume ? 'Reanudar proceso (READY)' : 'No aplica al estado actual'}
                        >
                          🔄 Reanudar
                        </button>

                        {/* Finalizar */}
                        <button
                          onClick={() => handleTerminate(proc)}
                          disabled={!canTerminate}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
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
