import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export const ResourceCharts = ({ cpuUsage, ramUsageMB, ramTotalMB, storageUsageGB, storageTotalGB }) => {
  const cpuHistory = [
    { time: '20:10', cpu: 15, power: 90 },
    { time: '20:11', cpu: 22, power: 105 },
    { time: '20:12', cpu: 35, power: 130 },
    { time: '20:13', cpu: 18, power: 95 },
    { time: '20:14', cpu: 24, power: 110 },
    { time: '20:15', cpu: cpuUsage, power: 115 },
  ];

  const storageFreeGB = +(storageTotalGB - storageUsageGB).toFixed(1);
  const usedPercent = Math.round((storageUsageGB / storageTotalGB) * 100);
  const freePercent = 100 - usedPercent;

  const storageData = [
    { name: 'Espacio Usado', value: storageUsageGB, color: '#06B6D4' },
    { name: 'Espacio Libre', value: storageFreeGB, color: '#1E293B' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Gráfica de CPU y Potencia con DOS EJES Y INDEPENDIENTES */}
      <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Carga de CPU & Potencia Eléctrica</h3>
            <p className="text-xs text-slate-400">Historial reciente con escalas independientes (Eje Izq: %, Eje Der: W)</p>
          </div>
          <div className="flex items-center space-x-4 text-xs font-mono">
            <span className="flex items-center space-x-1.5 text-cyan-400">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <span>CPU (%)</span>
            </span>
            <span className="flex items-center space-x-1.5 text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span>Potencia (W)</span>
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cpuHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              
              <XAxis dataKey="time" stroke="#64748B" fontSize={11} tickLine={false} />
              
              {/* Eje Y Izquierdo: Exclusivo para CPU en % */}
              <YAxis
                yAxisId="leftAxis"
                orientation="left"
                stroke="#06B6D4"
                fontSize={11}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(val) => `${val}%`}
              />
              
              {/* Eje Y Derecho: Exclusivo para Potencia en Watts */}
              <YAxis
                yAxisId="rightAxis"
                orientation="right"
                stroke="#3B82F6"
                fontSize={11}
                tickLine={false}
                domain={[0, 180]}
                tickFormatter={(val) => `${val}W`}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                formatter={(val, name) => [
                  name === 'CPU (%)' ? `${val}%` : `${val} W`,
                  name,
                ]}
              />
              
              <Area
                yAxisId="leftAxis"
                type="monotone"
                dataKey="cpu"
                name="CPU (%)"
                stroke="#06B6D4"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cpuGradient)"
              />
              <Area
                yAxisId="rightAxis"
                type="monotone"
                dataKey="power"
                name="Potencia (W)"
                stroke="#3B82F6"
                strokeWidth={2}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#powerGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Gráfica circular de Almacenamiento SIN SOLAPAMIENTOS */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Almacenamiento VFS</h3>
          <p className="text-xs text-slate-400">Espacio en partición raíz de RobotOS</p>
        </div>

        {/* Contenedor de la Dona limpia */}
        <div className="h-44 w-full flex items-center justify-center relative my-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={storageData}
                innerRadius={52}
                outerRadius={72}
                paddingAngle={4}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {storageData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#0F172A" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderColor: '#334155',
                  borderRadius: '0.5rem',
                  fontSize: '11px',
                }}
                formatter={(val) => [`${val} GB`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Texto central centrado de forma segura en la dona */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black text-white">{usedPercent}%</span>
            <span className="text-[10px] uppercase font-mono text-cyan-400 font-semibold tracking-wider">Ocupado</span>
          </div>
        </div>

        {/* Leyenda y desglose claramente posicionados ABAJO de la gráfica para evitar cualquier solapamiento */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-xl bg-slate-950/80 border border-cyan-900/40">
              <div className="flex items-center space-x-1.5 text-cyan-400 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span>Usado ({usedPercent}%)</span>
              </div>
              <div className="text-sm font-bold text-white mt-0.5">{storageUsageGB} GB</div>
            </div>

            <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center space-x-1.5 text-slate-400 font-mono text-[11px]">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                <span>Libre ({freePercent}%)</span>
              </div>
              <div className="text-sm font-bold text-slate-300 mt-0.5">{storageFreeGB} GB</div>
            </div>
          </div>

          <div className="text-center text-[11px] font-mono text-slate-400">
            Capacidad Total: <strong className="text-slate-300">{storageTotalGB} GB</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
