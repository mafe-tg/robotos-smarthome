// Datos iniciales de simulación para RobotOS SmartHome

export const INITIAL_PROCESSES = [
  {
    id: 'p1',
    pid: 101,
    name: 'lighting_daemon',
    state: 'RUNNING', // NEW, READY, RUNNING, WAITING, TERMINATED
    priority: 'Alta',
    cpu: 8,
    memoryBlocks: 6, // 6 bloques de 16MB = 96MB
    memory: 96,
    color: '#10B981',
    isSystem: true,
    description: 'Control y temporización de iluminación en todo el hogar',
  },
  {
    id: 'p2',
    pid: 102,
    name: 'temp_manager',
    state: 'READY',
    priority: 'Media',
    cpu: 3,
    memoryBlocks: 4, // 64MB
    memory: 64,
    color: '#F59E0B',
    isSystem: true,
    description: 'Monitoreo de termostatos y control HVAC',
  },
  {
    id: 'p3',
    pid: 103,
    name: 'surveillance_proc',
    state: 'READY',
    priority: 'Media',
    cpu: 18,
    memoryBlocks: 8, // 128MB
    memory: 128,
    color: '#3B82F6',
    isSystem: true,
    description: 'Detección perimetral y procesamiento de capturas',
  },
  {
    id: 'p4',
    pid: 104,
    name: 'routine_engine',
    state: 'RUNNING',
    priority: 'Media',
    cpu: 6,
    memoryBlocks: 3, // 48MB
    memory: 48,
    color: '#06B6D4',
    isSystem: true,
    description: 'Ejecutor de reglas y automatizaciones cronometradas',
  },
  {
    id: 'p5',
    pid: 105,
    name: 'energy_monitor',
    state: 'READY',
    priority: 'Baja',
    cpu: 2,
    memoryBlocks: 2, // 32MB
    memory: 32,
    color: '#8B5CF6',
    isSystem: true,
    description: 'Telemetría de consumo eléctrico y nivel de batería',
  },
  {
    id: 'p6',
    pid: 106,
    name: 'lock_guard',
    state: 'WAITING',
    priority: 'Crítica',
    cpu: 1,
    memoryBlocks: 2, // 32MB
    memory: 32,
    color: '#EC4899',
    isSystem: true,
    description: 'Validación de seguros biométricos y cerrojos',
  },
];

export const INITIAL_MEMORY_BLOCKS = Array.from({ length: 64 }, (_, index) => {
  // Bloques 0-7: Kernel
  if (index < 8) {
    return { id: index, state: 'KERNEL', processName: 'Kernel_Core', color: '#6366F1' };
  }
  // Bloques 8-15: surveillance_proc (8 bloques)
  if (index >= 8 && index < 16) {
    return { id: index, state: 'ALLOCATED', processName: 'surveillance_proc', color: '#3B82F6' };
  }
  // Bloques 16-21: lighting_daemon (6 bloques)
  if (index >= 16 && index < 22) {
    return { id: index, state: 'ALLOCATED', processName: 'lighting_daemon', color: '#10B981' };
  }
  // Bloques 22-25: temp_manager (4 bloques)
  if (index >= 22 && index < 26) {
    return { id: index, state: 'ALLOCATED', processName: 'temp_manager', color: '#F59E0B' };
  }
  // Bloques 26-28: routine_engine (3 bloques)
  if (index >= 26 && index < 29) {
    return { id: index, state: 'ALLOCATED', processName: 'routine_engine', color: '#06B6D4' };
  }
  // Bloques 29-30: energy_monitor (2 bloques)
  if (index >= 29 && index < 31) {
    return { id: index, state: 'ALLOCATED', processName: 'energy_monitor', color: '#8B5CF6' };
  }
  // Bloques 31-32: lock_guard (2 bloques)
  if (index >= 31 && index < 33) {
    return { id: index, state: 'ALLOCATED', processName: 'lock_guard', color: '#EC4899' };
  }
  // Bloques 33-63: Libres (31 bloques)
  return { id: index, state: 'FREE', processName: null, color: '#1E293B' };
});

export const INITIAL_FILE_SYSTEM = {
  '/system': [
    { id: 'f1', name: 'kernel.sys', size: '2.4 MB', modified: '2026-10-18 04:00', permissions: 'rwx------' },
    { id: 'f2', name: 'scheduler.bin', size: '512 KB', modified: '2026-10-18 04:00', permissions: 'rwx------' },
    { id: 'f3', name: 'mem_manager.sys', size: '380 KB', modified: '2026-10-18 04:00', permissions: 'rwx------' },
  ],
  '/apps': [
    { id: 'f4', name: 'lighting.app', size: '1.2 MB', modified: '2026-10-19 12:10', permissions: 'rwxr-xr-x' },
    { id: 'f5', name: 'climate.app', size: '980 KB', modified: '2026-10-19 14:22', permissions: 'rwxr-xr-x' },
    { id: 'f6', name: 'security.app', size: '3.1 MB', modified: '2026-10-19 18:30', permissions: 'rwxr-xr-x' },
  ],
  '/users': [
    { id: 'f7', name: 'admin.profile', size: '12 KB', modified: '2026-10-19 19:00', permissions: 'rw-------' },
    { id: 'f8', name: 'resident.profile', size: '8 KB', modified: '2026-10-19 19:15', permissions: 'rw-r--r--' },
    { id: 'f9', name: 'guest.profile', size: '4 KB', modified: '2026-10-19 20:00', permissions: 'r--r--r--' },
  ],
  '/drivers': [
    { id: 'f10', name: 'zigbee_mesh.ko', size: '240 KB', modified: '2026-10-17 11:00', permissions: 'rw-r--r--' },
    { id: 'f11', name: 'i2c_sensors.ko', size: '180 KB', modified: '2026-10-17 11:00', permissions: 'rw-r--r--' },
    { id: 'f12', name: 'smartlock_gpio.ko', size: '115 KB', modified: '2026-10-17 11:00', permissions: 'rw-r--r--' },
  ],
  '/config': [
    { id: 'f13', name: 'robotos.conf', size: '16 KB', modified: '2026-10-19 08:00', permissions: 'rw-r--r--' },
    { id: 'f14', name: 'network.json', size: '8 KB', modified: '2026-10-19 08:30', permissions: 'rw-r--r--' },
    { id: 'f15', name: 'automations.yaml', size: '24 KB', modified: '2026-10-19 15:45', permissions: 'rw-r--r--' },
  ],
  '/logs': [
    { id: 'f16', name: 'kernel.log', size: '4.8 MB', modified: '2026-10-19 20:10', permissions: 'rw-r--r--' },
    { id: 'f17', name: 'audit.log', size: '1.9 MB', modified: '2026-10-19 20:12', permissions: 'rw-------' },
    { id: 'f18', name: 'devices_events.log', size: '3.2 MB', modified: '2026-10-19 20:14', permissions: 'rw-r--r--' },
  ],
};

export const INITIAL_DEVICES = [
  {
    id: 'd1',
    name: 'Luces Salón Principal',
    type: 'light',
    zone: 'Salón',
    status: 'ON',
    isCommonArea: true,
  },
  {
    id: 'd2',
    name: 'Luces Cocina',
    type: 'light',
    zone: 'Cocina',
    status: 'OFF',
    isCommonArea: true,
  },
  {
    id: 'd3',
    name: 'Sensor Movimiento Entrada',
    type: 'motion',
    zone: 'Entrada',
    status: 'EN REPOSO',
    isCommonArea: false,
  },
  {
    id: 'd4',
    name: 'Cámara Frontal',
    type: 'camera',
    zone: 'Exterior',
    status: 'ONLINE',
    isCommonArea: false,
  },
  {
    id: 'd5',
    name: 'Cerradura Puerta Principal',
    type: 'lock',
    zone: 'Entrada',
    status: 'BLOQUEADA',
    isCommonArea: false,
  },
  {
    id: 'd6',
    name: 'Termostato Salón',
    type: 'climate',
    zone: 'Salón',
    status: '22.5 °C',
    temperature: 22.5,
    isCommonArea: true,
  },
];

export const INITIAL_LOGS = [
  { id: 'l1', timestamp: '20:00:15', level: 'INFO', source: 'KERNEL', message: 'RobotOS v2.4 iniciado en modo seguro con éxito.' },
  { id: 'l2', timestamp: '20:02:30', level: 'INFO', source: 'LIGHTING', message: 'Rutina nocturna programada para las 22:00.' },
  { id: 'l3', timestamp: '20:05:44', level: 'WARN', source: 'ENERGY', message: 'Consumo pico detectado en Climatización (+2.1 kW).' },
  { id: 'l4', timestamp: '20:08:12', level: 'INFO', source: 'SECURITY', message: 'Cerraduras verificadas. Estado: 100% asegurado.' },
];

export const INITIAL_ALERTS = [
  {
    id: 'a1',
    timestamp: '20:05:44',
    title: 'Consumo Eléctrico Elevado',
    details: 'Pico de consumo en el subsistema de climatización.',
    severity: 'warning',
    state: 'Resuelta',
  },
];
