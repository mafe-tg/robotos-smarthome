/**
 * faultScenarios.js — Gestión de Escenarios Reproducibles de Inyección
 *
 * Permite guardar combinaciones de fallos con su configuración exacta
 * y repetirlos en cualquier momento ("Repetir escenario").
 */

const STORAGE_KEY = 'robotos_fault_scenarios_v1';
const LAST_SCENARIO_KEY = 'robotos_last_executed_scenario';

export const PRESET_SCENARIOS = [
  {
    id: 'scen_telemetry_blackout',
    name: 'Apagón de Telemetría y Enlace',
    description: 'Caída simultánea de sensores de temperatura y enlace Zigbee de la cerradura.',
    mode: 'COMBINED',
    isPreset: true,
    faults: [
      {
        faultId: 'sensor_disconnected',
        target: 'd6',
        intensity: 'Media',
        duration: 8,
      },
      {
        faultId: 'comm_loss',
        target: 'd5',
        intensity: 'Alta',
        duration: 9,
      },
    ],
  },
  {
    id: 'scen_cpu_freeze',
    name: 'Saturación Crítica y Proceso Congelado',
    description: 'Ráfaga de cálculo descontrolado en routine_engine mientras temp_manager pierde heartbeat.',
    mode: 'COMBINED',
    isPreset: true,
    faults: [
      {
        faultId: 'cpu_overload',
        target: 'routine_engine',
        intensity: 'Alta',
        duration: 8,
      },
      {
        faultId: 'process_hang',
        target: 'temp_manager',
        intensity: 'Media',
        duration: 7,
      },
    ],
  },
  {
    id: 'scen_concurrency_ram',
    name: 'Interbloqueo y Corrupción de Memoria',
    description: 'Deadlock circular entre daemons de seguridad con fallo de paridad en RAM de vigilancia.',
    mode: 'COMBINED',
    isPreset: true,
    faults: [
      {
        faultId: 'deadlock',
        target: { processA: 'lock_guard', processB: 'routine_engine' },
        intensity: 'Alta',
        duration: 10,
      },
      {
        faultId: 'memory_corruption',
        target: 'surveillance_proc',
        intensity: 'Alta',
        duration: 8,
      },
    ],
  },
  {
    id: 'scen_progressive_stress',
    name: 'Estrés Progresivo de Núcleo',
    description: 'Aumento paulatino de intensidad en 3 etapas: 30% -> 65% -> 100% de sobrecarga.',
    mode: 'PROGRESSIVE',
    isPreset: true,
    faults: [
      {
        faultId: 'cpu_overload',
        target: 'routine_engine',
        intensity: 'Alta',
        duration: 12,
      },
      {
        faultId: 'sensor_disconnected',
        target: 'd6',
        intensity: 'Alta',
        duration: 10,
      },
    ],
  },
];

/**
 * Obtiene todos los escenarios: predeterminados + personalizados guardados en localStorage
 */
export function getSavedScenarios() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom = raw ? JSON.parse(raw) : [];
    return [...PRESET_SCENARIOS, ...custom];
  } catch {
    return [...PRESET_SCENARIOS];
  }
}

/**
 * Guarda un nuevo escenario personalizado
 */
export function saveCustomScenario({ name, description, mode, faults }) {
  const newScenario = {
    id: `custom_${Date.now()}`,
    name: name.trim() || `Escenario Personalizado ${new Date().toLocaleTimeString()}`,
    description: description.trim() || 'Escenario guardado por el operador.',
    mode: mode || 'ISOLATED',
    isPreset: false,
    createdAt: new Date().toISOString(),
    faults,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom = raw ? JSON.parse(raw) : [];
    const updated = [newScenario, ...custom];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Error al guardar escenario en localStorage:', err);
  }

  return newScenario;
}

/**
 * Elimina un escenario personalizado
 */
export function deleteCustomScenario(scenarioId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom = raw ? JSON.parse(raw) : [];
    const updated = custom.filter((s) => s.id !== scenarioId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda la última ejecución para permitir "Repetir escenario"
 */
export function setLastExecutedScenario(scenarioData) {
  try {
    localStorage.setItem(LAST_SCENARIO_KEY, JSON.stringify(scenarioData));
  } catch {}
}

/**
 * Recupera el último escenario ejecutado
 */
export function getLastExecutedScenario() {
  try {
    const raw = localStorage.getItem(LAST_SCENARIO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
