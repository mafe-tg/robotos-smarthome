import React, { useState } from 'react';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { DeviceList } from '../features/security/components/DeviceList';

// Mapea el estado interno del dashboard al formato que espera DeviceList de Santiago.
//
// Regla clave: en DeviceList el estado representa la CONEXIÓN, no el encendido.
//   • 'offline'  → el dispositivo perdió comunicación ('OFFLINE' real: falla simulada o stopDevice).
//   • 'alert'    → el dispositivo responde pero tiene una falla/evento activo (sensor disparado).
//   • 'online'   → el dispositivo responde con normalidad (encendido, apagado, bloqueado, en reposo…).
//   • 'maintenance' → lock en modo desbloqueado (acceso abierto = mantenimiento de seguridad).
//
// Solo se asigna 'offline' cuando status === 'OFFLINE', independientemente del tipo,
// porque ese valor lo produce exclusivamente simulateCommLoss() o stopDevice().
const mapDeviceStatus = (dev) => {
  // Pérdida de comunicación real (cámara desconectada, falla simulada, o detención por admin)
  if (dev.status === 'OFFLINE') return 'offline';

  // Sensor de movimiento disparado → alerta activa
  if (dev.type === 'motion' && dev.status === 'DETECTADO') return 'alert';

  // Cerradura desbloqueada → "maintenance" (acceso abierto, revisión de seguridad)
  if (dev.type === 'lock' && dev.status === 'DESBLOQUEADA') return 'maintenance';

  // Todo lo demás (ON, OFF, EN REPOSO, BLOQUEADA, ONLINE, "22.5 °C"…) = dispositivo conectado
  return 'online';
};

export const DevicesPage = () => {
  const { devices, toggleDevice, stopDevice, addLog } = useSystem();
  const { role, checkPermission, user } = useAuth();

  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  const isGuest = role === 'GUEST';

  // ── Vista Tarjetas: manejo de toggle ─────────────────────────────────────
  const handleDeviceToggle = (device) => {
    if (isGuest && (!device.isCommonArea || device.type === 'lock' || device.type === 'camera')) {
      checkPermission(
        'USER',
        `Operación en periférico de seguridad/restringido "${device.name}" (${device.zone})`,
        addLog
      );
      return;
    }
    toggleDevice(device.id);
  };

  // ── Vista Tabla: callback para "Detener" de DeviceList ───────────────────
  const handleStopDevice = (deviceId) => {
    const target = devices.find((d) => d.id === deviceId);
    if (!target) return;
    if (checkPermission('ADMIN', `Detener dispositivo "${target.name}" (DeviceList)`, addLog)) {
      stopDevice(deviceId);
    }
  };

  // Convierte los dispositivos del dashboard al formato Device de Santiago
  const securityDevices = devices.map((d) => ({
    id:        d.id,
    name:      d.name,
    type:      d.type,
    status:    mapDeviceStatus(d),
    last_seen: new Date().toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">Dispositivos Domóticos</h2>
          <p className="text-xs text-slate-400">
            Control e inspección de actuadores y sensores conectados al bus de RobotOS.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector de vista */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs font-mono">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'cards'
                  ? 'bg-cyan-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              🃏 Tarjetas
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-cyan-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              📋 Tabla
            </button>
          </div>
          <div className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-400">
            Rol activo: <span className="font-bold">{role}</span>
          </div>
        </div>
      </div>

      {/* Aviso de seguridad para Invitados */}
      {isGuest && (
        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 text-xs text-amber-200">
          <strong>Aviso de seguridad para Invitados:</strong> Tienes acceso a interactuar con los
          dispositivos. Los periféricos de seguridad (Cerraduras y Cámaras) o fuera de Salón y Cocina
          están protegidos por políticas RBAC y registrarán cualquier intento de activación.
        </div>
      )}

      {/* ── Vista TARJETAS ─────────────────────────────────────────────────── */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((dev) => {
            const getButtonLabel = () => {
              if (dev.type === 'motion')  return 'Simular movimiento';
              if (dev.type === 'climate') return 'Ajustar °C';
              if (dev.type === 'lock')    return dev.status === 'BLOQUEADA' ? 'Desbloquear' : 'Bloquear';
              if (dev.type === 'camera')  return dev.status === 'ONLINE' ? 'Desconectar' : 'Conectar';
              return dev.status === 'ON' ? 'Apagar' : 'Encender';
            };

            return (
              <div
                key={dev.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-lg transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                        {dev.zone}
                      </span>
                      {dev.isCommonArea && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                          Área común
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white mt-2">{dev.name}</h3>
                    <p className="text-xs text-slate-400 capitalize">Tipo: {dev.type}</p>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    {dev.type === 'light'   && '💡'}
                    {dev.type === 'motion'  && '🚶'}
                    {dev.type === 'camera'  && '📷'}
                    {dev.type === 'lock'    && '🔒'}
                    {dev.type === 'climate' && '🌡️'}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase">Estado Actual</div>
                    <div className="text-sm font-bold font-mono text-white mt-0.5">{dev.status}</div>
                  </div>

                  <button
                    onClick={() => handleDeviceToggle(dev)}
                    className={`text-xs font-mono font-bold px-4 py-2 rounded-xl border transition-all cursor-pointer ${
                      dev.status === 'ON' || dev.status === 'BLOQUEADA' || dev.status === 'ONLINE'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800/80 hover:bg-emerald-900/60 shadow-lg shadow-emerald-950/40'
                        : dev.status === 'DETECTADO'
                        ? 'bg-amber-950 text-amber-400 border-amber-800/80 hover:bg-amber-900/60 animate-pulse'
                        : dev.status === 'OFFLINE'
                        ? 'bg-red-950 text-red-400 border-red-800/80 hover:bg-red-900/60'
                        : dev.type === 'climate'
                        ? 'bg-cyan-950 text-cyan-400 border-cyan-800/80 hover:bg-cyan-900/60'
                        : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={
                      isGuest && (!dev.isCommonArea || dev.type === 'lock')
                        ? 'Acción restringida: requiere autorización'
                        : 'Ejecutar acción'
                    }
                  >
                    {getButtonLabel()}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Vista TABLA (componente DeviceList de Santiago) ────────────────── */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {isGuest && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 font-mono">
              ⚠️ Vista de solo lectura. Las acciones administrativas requieren rol ADMIN.
            </div>
          )}
          <DeviceList
            devices={securityDevices}
            userRole={role}
            currentUser={user}
            onStopDevice={handleStopDevice}
          />
        </div>
      )}
    </div>
  );
};
