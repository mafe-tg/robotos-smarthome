import React from 'react';

export const MetricCard = ({ title, value, subValue, percentage, status, color = 'cyan', icon }) => {
  const colorMap = {
    cyan: {
      border: 'border-cyan-500/30',
      badge: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60',
      bar: 'bg-cyan-500',
      iconBg: 'bg-cyan-500/10 text-cyan-400',
    },
    emerald: {
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
      bar: 'bg-emerald-500',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
    },
    amber: {
      border: 'border-amber-500/30',
      badge: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
      bar: 'bg-amber-500',
      iconBg: 'bg-amber-500/10 text-amber-400',
    },
    purple: {
      border: 'border-purple-500/30',
      badge: 'bg-purple-950/60 text-purple-400 border-purple-800/60',
      bar: 'bg-purple-500',
      iconBg: 'bg-purple-500/10 text-purple-400',
    },
  };

  const currentTheme = colorMap[color] || colorMap.cyan;

  return (
    <div className={`p-5 rounded-2xl bg-slate-900 border ${currentTheme.border} shadow-lg relative overflow-hidden`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400">{title}</p>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
            {subValue && <span className="text-xs font-mono text-slate-400">{subValue}</span>}
          </div>
        </div>

        <div className={`p-2.5 rounded-xl ${currentTheme.iconBg}`}>
          {icon}
        </div>
      </div>

      {percentage !== undefined && (
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>Uso de capacidad</span>
            <span>{percentage}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${currentTheme.bar} rounded-full transition-all duration-500`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      {status && (
        <div className="mt-4 flex items-center justify-between">
          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${currentTheme.badge}`}>
            {status}
          </span>
        </div>
      )}
    </div>
  );
};
