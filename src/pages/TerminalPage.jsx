/**
 * Terminal de RobotOS.
 * Interfaz de línea de comandos conectada al kernel de Sofia: los comandos
 * se ejecutan como system calls y requieren que el kernel haya arrancado.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { runCommand, COMMAND_NAMES } from '../features/terminal/commands';
import { getKernel, setTerminalContext } from '../features/terminal/kernelBridge';

const LINE_COLORS = {
  out: 'text-slate-200',
  ok: 'text-emerald-400',
  err: 'text-red-400',
  warn: 'text-amber-300',
  info: 'text-cyan-300',
  dim: 'text-slate-500',
  cmd: 'text-white',
};

const STATUS_STYLES = {
  RUNNING: 'bg-emerald-950/60 text-emerald-300 border-emerald-700',
  DEGRADED: 'bg-amber-950/60 text-amber-300 border-amber-700',
  BOOTING: 'bg-cyan-950/60 text-cyan-300 border-cyan-700',
  OFF: 'bg-slate-900 text-slate-400 border-slate-700',
  SHUTTING_DOWN: 'bg-amber-950/60 text-amber-300 border-amber-700',
  HALTED: 'bg-red-950/60 text-red-300 border-red-700',
};

const QUICK_COMMANDS = [
  { cmd: 'boot', label: 'Arrancar kernel' },
  { cmd: 'status', label: 'Estado del kernel' },
  { cmd: 'ps', label: 'Procesos' },
  { cmd: 'mem', label: 'Memoria' },
  { cmd: 'threads', label: 'Hilos' },
  { cmd: 'devices', label: 'Dispositivos' },
  { cmd: 'ls /system', label: 'Archivos de /system' },
  { cmd: 'help', label: 'Ayuda' },
];

// El historial de la pantalla se conserva al cambiar de módulo
let savedScreen = null;
let savedHistory = [];

const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
};

export const TerminalPage = () => {
  const system = useSystem();
  const { user, role, checkPermission } = useAuth();
  const { kernel, threads } = getKernel();

  const [screen, setScreen] = useState(
    () =>
      savedScreen || [
        { text: 'RobotOS SmartHome · Terminal del sistema', type: 'info' },
        { text: 'Los comandos usan system calls del kernel. Si el kernel está apagado, ejecuta "boot".', type: 'dim' },
        { text: 'Escribe "help" para ver los comandos disponibles.', type: 'dim' },
      ]
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [, setTick] = useState(0);
  const outputRef = useRef(null);
  const inputRef = useRef(null);

  // Mantener actualizado el contexto que leen las system calls
  setTerminalContext(system);

  // Refrescar el panel cuando cambie el kernel o pase el tiempo
  useEffect(() => {
    const names = [
      'kernel:initialized', 'kernel:started', 'kernel:shutdown', 'kernel:error',
      'thread:created', 'thread:admitted', 'thread:blocked', 'thread:unblocked',
      'thread:terminated', 'thread:scheduled',
    ];
    const unsubscribers = names.map((n) => kernel.events.on(n, () => setTick((t) => t + 1)));
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      unsubscribers.forEach((u) => u());
      clearInterval(timer);
    };
  }, [kernel]);

  useEffect(() => {
    savedScreen = screen;
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [screen]);

  const prompt = `${(user?.name || 'invitado').split(' ')[0].toLowerCase()}@robotos:~$`;

  const execute = async (rawInput) => {
    const command = rawInput.trim();
    if (!command || busy) return;
    savedHistory = [command, ...savedHistory.filter((c) => c !== command)].slice(0, 50);
    setHistoryIndex(-1);
    setInput('');
    setScreen((prev) => [...prev, { text: `${prompt} ${command}`, type: 'cmd' }]);
    setBusy(true);
    try {
      const result = await runCommand(command, {
        role,
        user,
        checkPermission,
        addLog: system.addLog,
        onLine: (l) => setScreen((prev) => [...prev, l]),
      });
      if (result.clear) setScreen([]);
      else setScreen((prev) => [...prev, ...result.lines]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      execute(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, savedHistory.length - 1);
      if (savedHistory[next] !== undefined) {
        setHistoryIndex(next);
        setInput(savedHistory[next]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(Math.max(next, -1));
      setInput(next >= 0 ? savedHistory[next] : '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const matches = COMMAND_NAMES.filter((c) => c.startsWith(input.trim().toLowerCase()));
      if (matches.length === 1) setInput(`${matches[0]} `);
      else if (matches.length > 1) setScreen((prev) => [...prev, { text: matches.join('  '), type: 'dim' }]);
    }
  };

  const snapshot = kernel.state.snapshot();
  const threadList = threads.list();
  const threadCounts = useMemo(
    () =>
      threadList.reduce((acc, t) => {
        acc[t.state] = (acc[t.state] || 0) + 1;
        return acc;
      }, {}),
    [threadList]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Terminal del Sistema</h1>
          <p className="text-sm text-slate-400 mt-1">
            Línea de comandos conectada al kernel: arranque, system calls, procesos, hilos, memoria, archivos y dispositivos.
          </p>
        </div>
        <span className={`self-start md:self-auto px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${STATUS_STYLES[snapshot.status] || STATUS_STYLES.OFF}`}>
          KERNEL: {snapshot.status}
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Terminal */}
        <div
          className="os-noskin xl:col-span-3 rounded-2xl bg-black border border-slate-800 shadow-xl overflow-hidden flex flex-col"
          onClick={() => inputRef.current?.focus()}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-950 border-b border-slate-800">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-amber-400/80" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="ml-3 text-xs font-mono text-slate-500">robotos-shell · {role}</span>
          </div>

          <div ref={outputRef} className="h-[520px] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
            {screen.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${LINE_COLORS[l.type] || LINE_COLORS.out}`}>
                {l.text || ' '}
              </div>
            ))}

            <div className="flex items-center gap-2 mt-1">
              <span className="text-emerald-400 font-mono text-[13px] shrink-0">{prompt}</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={busy}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                aria-label="Comando de la terminal"
                className="flex-1 bg-transparent outline-none text-white font-mono text-[13px] caret-cyan-400 disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Panel lateral */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold">Kernel</h2>
            <dl className="space-y-2 text-xs font-mono">
              <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd className="text-white">{snapshot.status}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Tiempo activo</dt><dd className="text-white">{formatUptime(snapshot.uptimeMs)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">System calls</dt><dd className="text-white">{kernel.syscalls.list().length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Transiciones</dt><dd className="text-white">{snapshot.history.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Errores</dt><dd className="text-white">{kernel.errors.getRecent(200).length}</dd></div>
            </dl>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold">Hilos</h2>
            {threadList.length === 0 ? (
              <p className="text-xs text-slate-500 font-mono">Sin hilos. Prueba: thread add 101 tarea_luces 4</p>
            ) : (
              <dl className="space-y-1.5 text-xs font-mono">
                {Object.entries(threadCounts).map(([state, count]) => (
                  <div key={state} className="flex justify-between">
                    <dt className="text-slate-500">{state}</dt>
                    <dd className="text-white">{count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold">Comandos rápidos</h2>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_COMMANDS.map((q) => (
                <button
                  key={q.cmd}
                  onClick={() => execute(q.cmd)}
                  disabled={busy}
                  className="text-left px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-300 transition-colors disabled:opacity-50"
                >
                  <span className="text-cyan-400">$</span> {q.cmd}
                  <span className="text-slate-500"> · {q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalPage;
