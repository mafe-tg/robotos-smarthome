/**
 * Pantallas de energía: arranque, elección de perfil, apagado y sistema apagado.
 * El arranque ejecuta el BootManager real del kernel de Sofia.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Power, ShieldCheck, Home, UserRound } from 'lucide-react';
import { RobotMascot } from './RobotMascot';
import { useSystem } from '../../context/SystemContext';
import { bootKernel } from '../terminal/kernelBridge';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const Logo = ({ size = 'lg', mood = 'ok' }) => (
  <div className={`flex items-center ${size === 'lg' ? 'gap-5' : 'gap-3'}`}>
    <RobotMascot size={size === 'lg' ? 96 : 56} mood={mood} />
    <div>
      <p className={`os-wordmark on-dark ${size === 'lg' ? 'text-6xl' : 'text-3xl'}`}>RobotOS</p>
      <p className="mt-3 text-sm text-[var(--os-mute)]">El sistema operativo de RX-1, el robot de tu casa</p>
    </div>
  </div>
);

export const BootScreen = ({ onDone }) => {
  const { memoryStats, vfsStats, devices } = useSystem();
  const [lines, setLines] = useState([]);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(null);
  const started = useRef(false);

  const run = async () => {
    setFailed(null);
    setLines([]);
    setProgress(0);
    const push = (text, type = 'out') => setLines((prev) => [...prev, { text, type }]);

    push('Firmware RobotOS 2.4, placa doméstica RX-1');
    await sleep(180);
    push(`Memoria principal: ${memoryStats.totalKb} KB detectados`);
    await sleep(150);
    push(`Disco virtual: ${(vfsStats.capacityBytes / 1_000_000).toFixed(0)} MB`);
    await sleep(150);
    push(`Bus de la casa: ${devices.length} dispositivos conectados`);
    setProgress(20);
    await sleep(200);
    push('Iniciando el kernel...', 'dim');

    const steps = [];
    const report = await bootKernel((s) => steps.push(s));
    const total = Math.max(steps.length, 1);
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.step === 'KERNEL_INITIALIZED') push('Kernel inicializado: estado, eventos, errores y llamadas al sistema');
      if (s.step === 'CHECK_PASSED') push(`[ OK ] ${s.name}`, 'ok');
      if (s.step === 'BOOT_COMPLETED') push('Kernel en ejecución (RUNNING)', 'ok');
      setProgress(20 + Math.round(((i + 1) / total) * 75));
      await sleep(210);
    }

    if (report.alreadyRunning) {
      push('El kernel ya estaba en ejecución', 'ok');
    }
    if (!report.success) {
      push(`Falló el arranque: ${report.error}`, 'err');
      setFailed(report.error || 'Error desconocido');
      return;
    }
    setProgress(100);
    await sleep(420);
    onDone();
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = { out: 'text-[var(--os-ink)]', dim: 'text-[var(--os-mute)]', ok: 'text-[var(--os-ok)]', err: 'text-[var(--os-alert)]' };

  return (
    <div className="absolute inset-0 os-grid flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-8">
        <Logo />
        <div className="os-mono text-[13px] leading-6 min-h-[220px]" aria-live="polite">
          {lines.map((l, i) => (
            <p key={i} className={`os-boot-line ${colors[l.type]}`}>{l.text}</p>
          ))}
        </div>
        <div className="h-1 rounded-full bg-[var(--os-line)] overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full os-progress ${failed ? 'bg-[var(--os-alert)]' : 'bg-[var(--os-signal)]'}`} style={{ width: `${progress}%` }} />
        </div>
        {failed && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--os-mute)]">
              Revisa que al menos un dispositivo esté conectado y que la memoria esté disponible, y vuelve a intentarlo.
            </p>
            <button onClick={run} className="os-focus px-4 py-2 rounded-full bg-[var(--os-signal)] text-[var(--os-on-signal)] text-sm font-semibold">
              Reintentar el arranque
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const PROFILES = [
  {
    role: 'ADMIN',
    name: 'Administrador',
    icon: ShieldCheck,
    detail: 'Todo el sistema, incluida la inyección de fallos y finalizar procesos del sistema.',
  },
  {
    role: 'USER',
    name: 'Residente',
    icon: Home,
    detail: 'Uso diario de la casa y herramientas del sistema: archivos, terminal y monitor.',
  },
  {
    role: 'GUEST',
    name: 'Invitado',
    icon: UserRound,
    detail: 'Solo la casa: centro de control, dispositivos y gemelo digital.',
  },
];

export const WelcomeScreen = ({ lastRole, onPick }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 os-light os-light-bg overflow-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-6 sm:gap-10 p-5 sm:p-6">
        <div className="text-center flex flex-col items-center">
          <RobotMascot size={88} />
          <p className="mt-4 text-5xl sm:text-6xl font-light tracking-tight tabular-nums">
            {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-2 text-[var(--os-mute)]">
            {(() => {
              const d = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
              return d.charAt(0).toUpperCase() + d.slice(1);
            })()}
          </p>
        </div>

        <div className="w-full max-w-3xl">
          <h1 className="os-display text-2xl font-bold italic mb-5 text-center">¿Quién usa el robot?</h1>
          <div className="grid gap-3 sm:grid-cols-3">
            {PROFILES.map((p) => {
              const Icon = p.icon;
              const last = p.role === lastRole;
              return (
                <button
                  key={p.role}
                  onClick={() => onPick(p.role)}
                  autoFocus={last}
                  className={`os-focus flex flex-row sm:flex-col items-center sm:items-start gap-4 sm:gap-0 text-left p-4 sm:p-6 rounded-[28px] border transition-all hover:-translate-y-1 bg-white hover:bg-[var(--os-panel-2)] shadow-[0_12px_30px_rgba(60,40,160,0.08)] ${
                    last ? 'border-[var(--os-signal)]' : 'border-[var(--os-line)]'
                  }`}
                >
                  <span className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full grid place-items-center bg-gradient-to-br from-[var(--os-blue)] to-[var(--os-violet)] shadow-lg">
                    <Icon className="w-6 h-6 text-white" />
                  </span>
                  <span className="block">
                    <span className="block sm:mt-4 os-display text-xl font-bold italic">{p.name}</span>
                    <span className="block mt-1 text-sm text-[var(--os-mute)] leading-relaxed">{p.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-5 text-center text-xs text-[var(--os-mute)]">
            Sin contraseña. Puedes cambiar de perfil cuando quieras desde el menú del robot.
          </p>
        </div>
      </div>
    </div>
  );
};

export const ShutdownScreen = ({ steps }) => (
  <div className="absolute inset-0 os-grid flex items-center justify-center p-6">
    <div className="w-full max-w-md space-y-6">
      <Logo size="sm" />
      <div className="os-mono text-[13px] leading-6">
        {steps.map((s, i) => (
          <p key={i} className="os-boot-line">{s}</p>
        ))}
      </div>
    </div>
  </div>
);

export const OffScreen = ({ reason, onPowerOn }) => (
  <div className="absolute inset-0 bg-[#0a0524] flex items-center justify-center p-6">
    <div className="text-center space-y-6 flex flex-col items-center">
      <RobotMascot size={120} mood="sleep" />
      <p className="text-[var(--os-mute)]">RobotOS está apagado. RX-1 está descansando.</p>
      {reason && <p className="text-xs text-[var(--os-mute)] os-mono">Motivo: {reason}</p>}
      <button
        onClick={onPowerOn}
        className="os-focus mx-auto w-20 h-20 rounded-full grid place-items-center border-2 border-[var(--os-signal)] text-[var(--os-signal)] hover:bg-[var(--os-signal)] hover:text-[var(--os-on-signal)] transition-colors"
        aria-label="Encender RobotOS"
      >
        <Power className="w-8 h-8" />
      </button>
      <p className="text-sm">Encender</p>
    </div>
  </div>
);
