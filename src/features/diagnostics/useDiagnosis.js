import { useMemo } from 'react';
import { useSystem } from '../../context/SystemContext';
import { useAuth } from '../../context/AuthContext';
import { getKernel } from '../terminal/kernelBridge';
import { useHardware } from '../hardware/useHardware';
import { useDesktop } from '../desktop/DesktopContext';
import { diagnose } from './diagnose';

/** Diagnóstico en vivo del sistema y la función que ejecuta cada acción sugerida. */
export function useDiagnosis() {
  const system = useSystem();
  const { checkPermission } = useAuth();
  const desktop = useDesktop();
  const { kernel } = getKernel();
  const { snap: hardware } = useHardware();

  const result = useMemo(
    () =>
      diagnose({
        kernelStatus: kernel.state.status,
        processes: system.processes,
        memoryStats: system.memoryStats,
        memoryBlocks: system.memoryBlocks,
        cpuUsage: system.metrics.cpuUsage,
        batteryPercent: system.metrics.batteryPercent,
        devices: system.devices,
        alerts: system.alerts,
        logs: system.logs,
        hardware,
        hour: new Date().getHours(),
      }),
    // kernel.state.status cambia con eventos que también cambian el contexto o el hardware
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [system.processes, system.memoryStats, system.memoryBlocks, system.metrics.cpuUsage, system.metrics.batteryPercent, system.devices, system.alerts, system.logs, hardware, kernel.state.status]
  );

  const run = async (action) => {
    if (!action) return;
    const { addLog } = system;
    try {
      switch (action.type) {
        case 'compact':
          if (checkPermission('ADMIN', 'Compactar la memoria desde el diagnóstico', addLog)) {
            const r = system.compactMemory();
            desktop.notify?.('Memoria compactada', r?.message || '', 'ok');
          }
          break;
        case 'reboot':
          desktop.restart?.();
          break;
        case 'open_app':
          desktop.openApp?.(action.payload);
          break;
        case 'toggle_device':
          if (checkPermission('USER', 'Cambiar un dispositivo desde el diagnóstico', addLog)) system.toggleDevice(action.payload);
          break;
        case 'restart_driver':
          if (checkPermission('USER', 'Reiniciar un driver desde el diagnóstico', addLog)) {
            await kernel.syscalls.invoke('sys_driver', 'restart', action.payload);
            desktop.notify?.('Driver reiniciado', action.payload, 'ok');
          }
          break;
        case 'stop_motors':
          await kernel.syscalls.invoke('sys_motors_stop');
          desktop.notify?.('Motores detenidos', '', 'ok');
          break;
        default:
          break;
      }
      addLog({ level: 'INFO', source: 'DIAGNOSTICO', message: `Acción del asistente de diagnóstico: ${action.label}.` });
    } catch (e) {
      desktop.notify?.('No se pudo aplicar la acción', e.message, 'error');
    }
  };

  return { result, run };
}
