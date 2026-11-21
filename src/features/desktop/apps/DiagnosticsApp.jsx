/**
 * Asistente de diagnóstico: RX-1 revisa el sistema y propone cómo arreglar
 * cada problema con un botón.
 */
import React, { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2, RefreshCw } from 'lucide-react';
import { emitSystemEvent } from '../../../lib/persistence';
import { useDiagnosis } from '../../diagnostics/useDiagnosis';
import { RobotMascot } from '../RobotMascot';

const SEV = {
  critical: { icon: AlertOctagon, cls: 'text-[var(--os-alert)]', label: 'Crítico' },
  warning: { icon: AlertTriangle, cls: 'text-[#ffd166]', label: 'Advertencia' },
  info: { icon: Info, cls: 'text-[var(--os-signal)]', label: 'Aviso' },
};

const ScoreRing = ({ score, level }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = level === 'critical' ? '#ff5c7a' : level === 'warning' ? '#ffd166' : '#5fe3a1';
  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32" role="img" aria-label={`Salud del sistema: ${score} de 100`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#e4dffa" strokeWidth="12" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 64 64)"
        style={{ transition: 'stroke-dasharray 400ms ease-out' }}
      />
      <text x="64" y="62" textAnchor="middle" fill="#1d1260" fontSize="32" fontWeight="700" fontFamily="Sora, sans-serif">{score}</text>
      <text x="64" y="82" textAnchor="middle" fill="#6f68a0" fontSize="11" fontFamily="Sora, sans-serif">de 100</text>
    </svg>
  );
};

export const DiagnosticsApp = () => {
  const { result, run } = useDiagnosis();
  const [scanning, setScanning] = useState(false);

  const scan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 900);
    emitSystemEvent({
      event_type: 'DIAGNOSTIC_RUN',
      source: 'DIAGNOSTICO',
      severity: result.level === 'critical' ? 'ERROR' : result.level === 'warning' ? 'WARNING' : 'INFO',
      description: `Diagnóstico: salud ${result.score}/100, ${result.findings.length} hallazgo(s)`,
      details: { score: result.score, findings: result.findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title })) },
    });
  };

  // Un diagnóstico al abrir la app
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mood = result.level === 'critical' ? 'alert' : 'ok';

  return (
    <div className="h-full overflow-y-auto os-light os-applight bg-[#f7f6ff] text-[var(--os-ink)] p-5 space-y-5">
      <section className="flex flex-wrap items-center gap-5 p-5 rounded-3xl bg-gradient-to-r from-[var(--os-blue)]/30 to-[var(--os-violet)]/30 border border-white/10">
        <RobotMascot size={84} mood={mood} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-[13px] font-semibold text-[var(--os-signal)]">RX-1</p>
          <p className="os-display text-2xl font-bold italic leading-tight">
            {scanning ? 'Revisando el sistema...' : result.summary}
          </p>
          <p className="mt-1 text-sm text-[var(--os-mute)]">Revisé: {result.checked.join(', ')}.</p>
          <button onClick={scan} disabled={scanning} className="os-focus mt-3 h-9 px-4 rounded-full bg-white text-[#2a17a8] text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} /> Volver a revisar
          </button>
        </div>
        <ScoreRing score={result.score} level={result.level} />
      </section>

      {result.findings.length === 0 ? (
        <p className="flex items-center gap-2 p-4 rounded-2xl bg-[var(--os-ok)]/10 text-[var(--os-ok)]">
          <CheckCircle2 className="w-5 h-5" /> Sin problemas. El kernel, la memoria, los dispositivos y el hardware están bien.
        </p>
      ) : (
        <ul className="space-y-2.5" aria-live="polite">
          {result.findings.map((f) => {
            const sev = SEV[f.severity];
            const Icon = sev.icon;
            return (
              <li key={f.id} className="p-4 rounded-2xl bg-[var(--os-night)] border border-white/10 flex flex-wrap items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${sev.cls}`} aria-label={sev.label} />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-sm text-[var(--os-mute)] mt-0.5">{f.detail}</p>
                  <p className="text-xs text-[var(--os-mute)] mt-1">{f.area}, {sev.label.toLowerCase()}</p>
                </div>
                {f.action && (
                  <button
                    onClick={() => run(f.action)}
                    className="os-focus h-9 px-4 rounded-full bg-[var(--os-signal)] text-[var(--os-on-signal)] text-sm font-semibold"
                  >
                    {f.action.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default DiagnosticsApp;
