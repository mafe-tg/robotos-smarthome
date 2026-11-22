/**
 * Monitor del sistema: los procesos del kernel (incluidas las ventanas abiertas)
 * y el rendimiento en vivo de CPU y RAM.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { Pause, Play, XCircle, AppWindow } from 'lucide-react';
import { useSystem } from '../../../context/SystemContext';
import { useAuth } from '../../../context/AuthContext';
import { getKernel } from '../../terminal/kernelBridge';
import { appFromProcessName } from '../apps';
import { useDesktop } from '../DesktopContext';

const STATE_STYLE = {
  RUNNING: { label: 'En ejecución', dot: 'bg-[var(--os-ok)]' },
  READY: { label: 'Lista', dot: 'bg-sky-400' },
  WAITING: { label: 'En espera', dot: 'bg-[var(--os-signal)]' },
  NEW: { label: 'Nueva', dot: 'bg-slate-400' },
  TERMINATED: { label: 'Finalizada', dot: 'bg-slate-600' },
};

const formatUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min ${s % 60} s`;
};

const tab = (active) =>
  `os-focus h-9 px-4 text-sm border-b-2 ${active ? 'border-[var(--os-signal)] text-[var(--os-ink)] font-semibold' : 'border-transparent text-[var(--os-mute)] hover:text-white'}`;
const btn = 'os-focus h-8 px-3 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed';

const ProcessesTab = () => {
  const { processes, pauseProcess, resumeProcess, executeProcess, terminateProcess, addLog } = useSystem();
  const { checkPermission } = useAuth();
  const { notify, closeApp } = useDesktop();
  const [showEnded, setShowEnded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const rows = useMemo(
    () =>
      processes
        .filter((p) => showEnded || p.state !== 'TERMINATED')
        .map((p) => {
          const app = appFromProcessName(p.name);
          return { ...p, app, kind: app ? 'Ventana' : p.isSystem ? 'Sistema' : 'Usuario' };
        })
        .sort((a, b) => a.pid - b.pid),
    [processes, showEnded]
  );
  const sel = rows.find((r) => r.id === selectedId) || null;
  const running = processes.filter((p) => p.state === 'RUNNING').length;
  const alive = processes.filter((p) => p.state !== 'TERMINATED').length;
  const windows = rows.filter((r) => r.app && r.state !== 'TERMINATED').length;

  const endTask = () => {
    if (!sel) return;
    const needed = sel.app ? 'USER' : 'ADMIN';
    if (!checkPermission(needed, `Finalizar el proceso ${sel.name} (PID ${sel.pid})`, addLog)) return;
    if (sel.app) closeApp(sel.app.id);
    else terminateProcess(sel.id);
    notify('Tarea finalizada', `${sel.app ? sel.app.name : sel.name} (PID ${sel.pid}) liberó ${sel.memoryKb} KB de memoria.`, 'ok');
    setSelectedId(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="px-4 py-3 text-sm text-[var(--os-mute)]">
        {alive} procesos activos, {running} en ejecución. {windows} {windows === 1 ? 'es una ventana abierta' : 'son ventanas abiertas'}: cerrar una ventana finaliza su proceso.
      </p>
      <div className="flex-1 min-h-0 overflow-auto px-4">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--os-panel)] text-left text-xs text-[var(--os-mute)]">
            <tr>
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">PID</th>
              <th className="py-2 pr-3 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
              <th className="py-2 pr-3 font-medium">Prioridad</th>
              <th className="py-2 pr-3 font-medium text-right">CPU</th>
              <th className="py-2 font-medium text-right">Memoria</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const st = STATE_STYLE[p.state] || STATE_STYLE.NEW;
              const isSel = p.id === selectedId;
              return (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`cursor-default border-t border-[var(--os-line)]/60 ${isSel ? 'bg-[var(--os-signal)]/15' : 'hover:bg-white/5'} ${p.state === 'TERMINATED' ? 'text-[var(--os-mute)]' : ''}`}
                >
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      {p.app && <AppWindow className="w-3.5 h-3.5 text-[var(--os-signal)] shrink-0" />}
                      <span className="truncate">{p.app ? p.app.name : p.name}</span>
                    </span>
                  </td>
                  <td className="py-2 pr-3 os-mono text-[13px]">{p.pid}</td>
                  <td className="py-2 pr-3 text-[var(--os-mute)]">{p.kind}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{p.priority}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.state === 'RUNNING' ? `${p.cpu}%` : '0%'}</td>
                  <td className="py-2 text-right tabular-nums">{p.state === 'TERMINATED' ? '0 KB' : `${p.memoryKb ?? p.memory ?? 0} KB`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="shrink-0 px-4 py-2 border-t border-[var(--os-line)] flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--os-mute)] flex items-center gap-2 mr-auto">
          <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} className="accent-[var(--os-signal)]" />
          Mostrar finalizados
        </label>
        <button
          disabled={!sel || !['RUNNING', 'READY'].includes(sel.state)}
          onClick={() => checkPermission('USER', `Pausar PID ${sel.pid}`, addLog) && pauseProcess(sel.id)}
          className={`${btn} hover:bg-white/5`}
        >
          <Pause className="w-4 h-4" /> Pausar
        </button>
        <button
          disabled={!sel || (sel.state !== 'WAITING' && sel.state !== 'READY')}
          onClick={() => {
            if (!checkPermission('USER', `${sel.state === 'READY' ? 'Ejecutar' : 'Reanudar'} PID ${sel.pid}`, addLog)) return;
            if (sel.state === 'WAITING') resumeProcess(sel.id);
            else if (sel.state === 'READY') executeProcess(sel.id);
          }}
          className={`${btn} hover:bg-white/5`}
        >
          <Play className="w-4 h-4" /> {sel?.state === 'READY' ? 'Ejecutar' : 'Reanudar'}
        </button>
        <button
          disabled={!sel || sel.state === 'TERMINATED'}
          onClick={endTask}
          title="Las ventanas las puede cerrar el residente; los procesos del sistema, solo el administrador"
          className={`${btn} bg-[var(--os-alert)]/90 text-white hover:bg-[var(--os-alert)]`}
        >
          <XCircle className="w-4 h-4" /> Finalizar tarea
        </button>
      </footer>
    </div>
  );
};

const Chart = ({ data, dataKey, color, label, value }) => (
  <div className="p-4 rounded-2xl bg-[var(--os-night)] border border-[var(--os-line)]">
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-semibold">{label}</h3>
      <span className="text-2xl font-light tabular-nums">{value}</span>
    </div>
    <div className="h-28 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis domain={[0, 100]} hide />
          <XAxis dataKey="t" hide />
          <Tooltip
            contentStyle={{ background: '#162533', border: '1px solid #2c4458', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(t) => `hace ${data.length - 1 - t} s`}
            formatter={(v) => [`${v}%`, label]}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <p className="mt-1 text-[11px] text-[var(--os-mute)]">Últimos 60 segundos</p>
  </div>
);

const PerformanceTab = () => {
  const { metrics, memoryStats, memoryBlocks, compactMemory, addLog, processes, telemetryHistory } = useSystem();
  const { checkPermission } = useAuth();
  const { notify } = useDesktop();
  const { kernel } = getKernel();

  const snap = kernel.state.snapshot();
  const ramPct = memoryStats.totalKb ? Math.round((memoryStats.usedKb / memoryStats.totalKb) * 100) : 0;
  // Huecos libres entre bloques asignados (fragmentación)
  const holes = useMemo(() => {
    const sorted = [...memoryBlocks].sort((a, b) => a.start - b.start);
    let cursor = 0;
    let count = 0;
    for (const b of sorted) {
      if (b.start > cursor) count += 1;
      cursor = Math.max(cursor, b.start + b.size);
    }
    if (cursor < memoryStats.totalKb) count += 1;
    return count;
  }, [memoryBlocks, memoryStats.totalKb]);

  const compact = () => {
    if (!checkPermission('ADMIN', 'Compactar la memoria RAM', addLog)) return;
    const r = compactMemory();
    notify(r?.alreadyCompact ? 'La memoria ya estaba compacta' : 'Memoria compactada', r?.message || '', r?.alreadyCompact ? 'info' : 'ok');
  };

  return (
    <div className="p-4 space-y-4 overflow-auto h-full">
      <div className="grid md:grid-cols-2 gap-4">
        <Chart data={telemetryHistory || []} dataKey="cpu" color="#f4b740" label="CPU" value={`${metrics.cpuUsage}%`} />
        <Chart data={telemetryHistory || []} dataKey="ram" color="#6ccb8e" label="Memoria RAM" value={`${ramPct}%`} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="p-4 rounded-2xl bg-[var(--os-night)] border border-[var(--os-line)]">
          <h3 className="text-sm font-semibold mb-3">Kernel</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-[var(--os-mute)]">Estado</dt><dd className="os-mono">{snap.status}</dd>
            <dt className="text-[var(--os-mute)]">Tiempo activo</dt><dd>{formatUptime(snap.uptimeMs)}</dd>
            <dt className="text-[var(--os-mute)]">Llamadas al sistema</dt><dd>{kernel.syscalls.list().length} registradas</dd>
            <dt className="text-[var(--os-mute)]">Procesos en ejecución</dt><dd>{processes.filter((p) => p.state === 'RUNNING').length}</dd>
            <dt className="text-[var(--os-mute)]">Errores registrados</dt><dd>{kernel.errors.getRecent(200).length}</dd>
          </dl>
        </section>
        <section className="p-4 rounded-2xl bg-[var(--os-night)] border border-[var(--os-line)]">
          <h3 className="text-sm font-semibold mb-3">Memoria</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-[var(--os-mute)]">En uso</dt><dd>{memoryStats.usedKb} KB de {memoryStats.totalKb} KB</dd>
            <dt className="text-[var(--os-mute)]">Libre</dt><dd>{memoryStats.freeKb} KB</dd>
            <dt className="text-[var(--os-mute)]">Huecos libres</dt><dd>{holes}</dd>
          </dl>
          <button onClick={compact} className={`${btn} mt-4 bg-white/5 hover:bg-white/10`} title="Solo el administrador">
            Compactar memoria
          </button>
        </section>
      </div>
    </div>
  );
};

export const SystemMonitorApp = () => {
  const [view, setView] = useState('procesos');
  return (
    <div className="h-full flex flex-col os-light os-applight bg-[#f7f6ff] text-[var(--os-ink)]" style={{ fontFamily: 'var(--os-font)' }}>
      <div className="shrink-0 px-2 flex border-b border-[var(--os-line)]" role="tablist">
        <button role="tab" aria-selected={view === 'procesos'} onClick={() => setView('procesos')} className={tab(view === 'procesos')}>
          Procesos
        </button>
        <button role="tab" aria-selected={view === 'rendimiento'} onClick={() => setView('rendimiento')} className={tab(view === 'rendimiento')}>
          Rendimiento
        </button>
      </div>
      <div className="flex-1 min-h-0">{view === 'procesos' ? <ProcessesTab /> : <PerformanceTab />}</div>
    </div>
  );
};

export default SystemMonitorApp;
