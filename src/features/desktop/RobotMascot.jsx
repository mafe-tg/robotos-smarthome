/**
 * RX-1, el robot de la casa. Ilustración original en SVG.
 * mood: 'ok' (ojos cian), 'alert' (ojos rosados), 'sleep' (ojos cerrados), 'low' (batería baja).
 */
import React from 'react';

const EYE = { ok: '#3de0ff', alert: '#ff5c7a', low: '#ffd166', sleep: '#3de0ff' };

export const RobotMascot = ({ mood = 'ok', size = 160, bob = true, className = '' }) => {
  const eye = EYE[mood] || EYE.ok;
  const asleep = mood === 'sleep';
  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={size * 1.1}
      className={`${bob ? 'os-bob' : ''} ${className}`}
      role="img"
      aria-label="RX-1, el robot de la casa"
    >
      <defs>
        <linearGradient id="rx-shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfc6ff" />
        </linearGradient>
        <linearGradient id="rx-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d1260" />
          <stop offset="1" stopColor="#0c0630" />
        </linearGradient>
        <radialGradient id="rx-glow">
          <stop offset="0" stopColor={eye} stopOpacity="0.9" />
          <stop offset="1" stopColor={eye} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sombra */}
      <ellipse cx="100" cy="210" rx="48" ry="7" fill="#08031e" opacity="0.35" />

      {/* antena */}
      <line x1="100" y1="34" x2="100" y2="14" stroke="#cfc6ff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="100" cy="11" r="9" fill="url(#rx-glow)" className="os-antenna" />
      <circle cx="100" cy="11" r="5" fill={eye} className="os-antenna" />

      {/* orejas */}
      <rect x="22" y="62" width="16" height="36" rx="8" fill="#9d8cff" />
      <rect x="162" y="62" width="16" height="36" rx="8" fill="#9d8cff" />

      {/* cabeza */}
      <rect x="34" y="32" width="132" height="98" rx="42" fill="url(#rx-shell)" />
      <rect x="50" y="52" width="100" height="58" rx="29" fill="url(#rx-visor)" />

      {/* ojos */}
      {asleep ? (
        <g stroke={eye} strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M70 83 q10 8 20 0" />
          <path d="M110 83 q10 8 20 0" />
        </g>
      ) : (
        <g className="os-blink">
          <ellipse cx="80" cy="81" rx="11" ry={mood === 'low' ? 6 : 13} fill={eye} />
          <ellipse cx="120" cy="81" rx="11" ry={mood === 'low' ? 6 : 13} fill={eye} />
          <circle cx="84" cy="76" r="3.5" fill="#ffffff" opacity="0.85" />
          <circle cx="124" cy="76" r="3.5" fill="#ffffff" opacity="0.85" />
        </g>
      )}

      {/* cuello y cuerpo */}
      <rect x="86" y="128" width="28" height="10" rx="4" fill="#9d8cff" />
      <rect x="52" y="136" width="96" height="64" rx="30" fill="url(#rx-shell)" />
      <circle cx="100" cy="166" r="13" fill="url(#rx-visor)" />
      <circle cx="100" cy="166" r="6" fill={eye} />

      {/* brazos */}
      <rect x="30" y="146" width="20" height="40" rx="10" fill="#b4a6ff" />
      <rect x="150" y="146" width="20" height="40" rx="10" fill="#b4a6ff" />
    </svg>
  );
};

export default RobotMascot;
