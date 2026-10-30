import React, { useState } from 'react';
import type { Device, AppRole, User } from '../types';

export interface DeviceListProps {
  devices: Device[];
  userRole?: AppRole;
  currentUser?: User;
  onStopDevice?: (deviceId: string) => void | Promise<void>;
  isLoading?: boolean;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  devices,
  userRole,
  currentUser,
  onStopDevice,
  isLoading = false,
}) => {
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  // Determinar si el usuario tiene privilegios de ADMIN
  const effectiveRole = userRole ?? currentUser?.role;
  const isAdmin = effectiveRole === 'ADMIN';

  const handleStop = async (deviceId: string) => {
    if (!onStopDevice) return;
    try {
      setStoppingId(deviceId);
      await onStopDevice(deviceId);
    } finally {
      setStoppingId(null);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'activo':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'offline':
      case 'inactivo':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      case 'alert':
      case 'alerta':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'maintenance':
      case 'mantenimiento':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      default:
        return 'bg-sky-100 text-sky-800 border-sky-300';
    }
  };

  const formatLastSeen = (timestamp: string | null) => {
    if (!timestamp) return 'Nunca';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-500">
        <span className="text-sm font-medium">Cargando dispositivos...</span>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        <p className="text-sm">No hay dispositivos registrados en el sistema.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Dispositivos del Sistema
          </h3>
          <p className="text-xs text-slate-500">
            Monitoreo y control de dispositivos inteligentes RobotOS
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          Total: {devices.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th scope="col" className="px-6 py-3">Nombre</th>
              <th scope="col" className="px-6 py-3">Tipo</th>
              <th scope="col" className="px-6 py-3">Estado</th>
              <th scope="col" className="px-6 py-3">Última Conexión</th>
              {isAdmin && (
                <th scope="col" className="px-6 py-3 text-right">
                  Acciones (Admin)
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {devices.map((device) => {
              const isStopping = stoppingId === device.id;
              const isOffline = device.status.toLowerCase() === 'offline';

              return (
                <tr key={device.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                    {device.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                    <span className="capitalize">{device.type}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusBadgeClass(
                        device.status
                      )}`}
                    >
                      <span
                        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                          device.status.toLowerCase() === 'online'
                            ? 'bg-emerald-500'
                            : device.status.toLowerCase() === 'alert'
                            ? 'bg-rose-500'
                            : 'bg-slate-400'
                        }`}
                      />
                      {device.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
                    {formatLastSeen(device.last_seen)}
                  </td>
                  {isAdmin && (
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleStop(device.id)}
                        disabled={isStopping || isOffline}
                        className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                          isOffline
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            : 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 disabled:opacity-50'
                        }`}
                        title={
                          isOffline
                            ? 'El dispositivo ya está detenido'
                            : 'Detener dispositivo'
                        }
                      >
                        {isStopping ? (
                          <>
                            <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Deteniendo...
                          </>
                        ) : (
                          'Detener'
                        )}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeviceList;
