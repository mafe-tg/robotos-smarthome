/**
 * Hardware virtual del robot RX-1: sensores, actuadores y drivers.
 *
 * - Cada sensor y actuador pertenece a un driver. Si el driver no está ACTIVO,
 *   el sensor no entrega lecturas y el actuador no acepta órdenes
 *   (error DRIVER_NOT_READY), como en un sistema operativo real.
 * - tick() simula un ciclo del bus de hardware: los motores consumen batería y
 *   se calientan, el LiDAR mide distancias y el watchdog recupera drivers caídos.
 * - Todos los cambios salen como eventos { tipo, origen, detalle, fecha } por
 *   el EventEngine del kernel (si se pasa uno), para guardarlos en Supabase.
 *
 * Autora: María Fernanda Tuta Gómez
 */

export const DRIVER_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  STOPPED: 'STOPPED',
  FAILED: 'FAILED',
  RECOVERING: 'RECOVERING',
});

const DRIVERS = [
  { id: 'drv_motores', name: 'Driver de motores', version: '2.1.0', bus: 'PWM' },
  { id: 'drv_brazo', name: 'Driver del brazo articulado', version: '1.4.2', bus: 'I2C' },
  { id: 'drv_sensores', name: 'Driver de sensores de navegación', version: '3.0.1', bus: 'SPI' },
  { id: 'drv_camara', name: 'Driver de la cámara del robot', version: '1.2.0', bus: 'USB' },
  { id: 'drv_bms', name: 'Driver de batería (BMS)', version: '1.0.5', bus: 'CAN' },
];

const SENSORS = [
  { id: 'bateria', name: 'Batería', unit: '%', driver: 'drv_bms', min: 0, max: 100, warnAbove: null, warnBelow: 25 },
  { id: 'temp_motores', name: 'Temperatura de motores', unit: '°C', driver: 'drv_sensores', min: 20, max: 95, warnAbove: 70, warnBelow: null },
  { id: 'lidar', name: 'Distancia al obstáculo (LiDAR)', unit: 'cm', driver: 'drv_sensores', min: 5, max: 400, warnAbove: null, warnBelow: 20 },
  { id: 'imu', name: 'Inclinación (IMU)', unit: '°', driver: 'drv_sensores', min: -30, max: 30, warnAbove: 15, warnBelow: null },
  { id: 'camara', name: 'Cámara del robot', unit: 'fps', driver: 'drv_camara', min: 0, max: 30, warnAbove: null, warnBelow: 10 },
];

const ACTUATORS = [
  { id: 'rueda_izq', name: 'Motor rueda izquierda', unit: '%', driver: 'drv_motores', min: 0, max: 100 },
  { id: 'rueda_der', name: 'Motor rueda derecha', unit: '%', driver: 'drv_motores', min: 0, max: 100 },
  { id: 'brazo', name: 'Brazo articulado', unit: '°', driver: 'drv_brazo', min: 0, max: 180 },
  { id: 'aspiradora', name: 'Módulo de limpieza', unit: '%', driver: 'drv_motores', min: 0, max: 100 },
];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;

export class HardwareError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export class HardwareManager {
  constructor({ eventEngine = null, random = Math.random, recoveryTicks = 3 } = {}) {
    this.events = eventEngine;
    this.random = random;
    this.recoveryTicks = recoveryTicks;
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.drivers = new Map(
      DRIVERS.map((d) => [d.id, { ...d, status: DRIVER_STATUS.ACTIVE, failures: 0, restarts: 0, failedAt: null, recoverIn: 0 }])
    );
    this.sensors = new Map(SENSORS.map((s) => [s.id, { ...s, value: null }]));
    this.actuators = new Map(ACTUATORS.map((a) => [a.id, { ...a, value: a.id === 'brazo' ? 90 : 0 }]));
    this.sensors.get('bateria').value = 84;
    this.sensors.get('temp_motores').value = 32;
    this.sensors.get('lidar').value = 180;
    this.sensors.get('imu').value = 0;
    this.sensors.get('camara').value = 30;
    this.ticks = 0;
    this.moveTicks = 0;
  }

  /** Avisar a la interfaz de cualquier cambio. Devuelve la función para dejar de escuchar. */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(tipo, detalle) {
    const event = { tipo, origen: 'HARDWARE_MGR', detalle, fecha: new Date().toISOString() };
    if (this.events?.emit) this.events.emit(`hardware:${tipo.toLowerCase()}`, event);
    this.listeners.forEach((fn) => fn(event));
    return event;
  }

  driverReady(id) {
    return this.drivers.get(id)?.status === DRIVER_STATUS.ACTIVE;
  }

  // ── Drivers ──
  getDriver(id) {
    const d = this.drivers.get(id);
    if (!d) throw new HardwareError('DRIVER_NOT_FOUND', `No existe el driver ${id}`);
    return d;
  }

  loadDriver(id) {
    const d = this.getDriver(id);
    if (d.status === DRIVER_STATUS.ACTIVE) return { ...d };
    d.status = DRIVER_STATUS.ACTIVE;
    d.recoverIn = 0;
    this.emit('DRIVER_LOADED', { driver: id, name: d.name });
    return { ...d };
  }

  unloadDriver(id) {
    const d = this.getDriver(id);
    d.status = DRIVER_STATUS.STOPPED;
    // Sin driver, sus actuadores se detienen por seguridad
    for (const a of this.actuators.values()) {
      if (a.driver === id && a.id !== 'brazo') a.value = 0;
    }
    this.emit('DRIVER_UNLOADED', { driver: id, name: d.name });
    return { ...d };
  }

  restartDriver(id) {
    const d = this.getDriver(id);
    d.restarts += 1;
    d.status = DRIVER_STATUS.ACTIVE;
    d.recoverIn = 0;
    d.failedAt = null;
    this.emit('DRIVER_RESTARTED', { driver: id, name: d.name, restarts: d.restarts });
    return { ...d };
  }

  /** Simula la caída de un driver. El watchdog lo recupera en `recoveryTicks` ciclos. */
  failDriver(id, reason = 'Sin respuesta del dispositivo') {
    const d = this.getDriver(id);
    d.status = DRIVER_STATUS.FAILED;
    d.failures += 1;
    d.failedAt = new Date().toISOString();
    d.recoverIn = this.recoveryTicks;
    for (const a of this.actuators.values()) {
      if (a.driver === id && a.id !== 'brazo') a.value = 0;
    }
    this.emit('DRIVER_FAILED', { driver: id, name: d.name, reason });
    return { ...d };
  }

  // ── Actuadores ──
  setActuator(id, value) {
    const a = this.actuators.get(id);
    if (!a) throw new HardwareError('ACTUATOR_NOT_FOUND', `No existe el actuador ${id}`);
    if (!this.driverReady(a.driver)) {
      throw new HardwareError('DRIVER_NOT_READY', `${a.name}: el driver ${a.driver} no está activo`);
    }
    const n = Number(value);
    if (!Number.isFinite(n)) throw new HardwareError('INVALID_VALUE', `Valor no válido para ${a.name}`);
    const prev = a.value;
    a.value = clamp(Math.round(n), a.min, a.max);
    this.emit('ACTUATOR_SET', { actuator: id, name: a.name, from: prev, to: a.value, unit: a.unit });
    return { ...a };
  }

  /** El robot se desplaza: las dos ruedas se activan durante unos ciclos. */
  move(power = 60, ticks = 3) {
    if (!this.driverReady('drv_motores')) {
      throw new HardwareError('DRIVER_NOT_READY', 'El robot no puede moverse: el driver de motores no está activo');
    }
    this.actuators.get('rueda_izq').value = power;
    this.actuators.get('rueda_der').value = power;
    this.moveTicks = ticks;
    this.emit('ROBOT_MOVING', { power, ticks });
  }

  stopAll() {
    for (const a of this.actuators.values()) if (a.id !== 'brazo') a.value = 0;
    this.moveTicks = 0;
    this.emit('ACTUATORS_STOPPED', {});
  }

  // ── Ciclo del bus ──
  /**
   * @param {{ cpu?: number, battery?: number }} ctx  battery: si viene, el sensor la usa
   * (así la batería coincide con la del resto del sistema).
   */
  tick(ctx = {}) {
    this.ticks += 1;
    const r = this.random;
    const left = this.actuators.get('rueda_izq').value;
    const right = this.actuators.get('rueda_der').value;
    const clean = this.actuators.get('aspiradora').value;
    const load = (left + right) / 2;

    // Watchdog: recupera drivers caídos
    for (const d of this.drivers.values()) {
      if (d.status === DRIVER_STATUS.FAILED && d.recoverIn > 0) {
        d.recoverIn -= 1;
        if (d.recoverIn === 0) {
          d.status = DRIVER_STATUS.ACTIVE;
          d.restarts += 1;
          this.emit('DRIVER_RECOVERED', { driver: d.id, name: d.name, by: 'watchdog' });
        }
      }
    }

    // Batería
    const bat = this.sensors.get('bateria');
    if (this.driverReady('drv_bms')) {
      if (typeof ctx.battery === 'number') bat.value = ctx.battery;
      else bat.value = round1(clamp(bat.value - 0.02 - load * 0.002 - clean * 0.001 - (ctx.cpu || 0) * 0.0005, 0, 100));
    } else bat.value = null;

    // Sensores de navegación
    const temp = this.sensors.get('temp_motores');
    const lidar = this.sensors.get('lidar');
    const imu = this.sensors.get('imu');
    if (this.driverReady('drv_sensores')) {
      const base = temp.value ?? 32;
      const target = 30 + load * 0.55 + clean * 0.15;
      temp.value = round1(base + (target - base) * 0.25);
      const lidarBase = lidar.value ?? 180;
      lidar.value = Math.round(clamp(lidarBase + (load > 0 ? -25 : 10) + (r() - 0.5) * 40, 5, 400));
      imu.value = round1(clamp((load > 0 ? (r() - 0.5) * 8 : (r() - 0.5) * 1.2), -30, 30));
    } else {
      temp.value = null;
      lidar.value = null;
      imu.value = null;
    }

    // Cámara
    const cam = this.sensors.get('camara');
    cam.value = this.driverReady('drv_camara') ? Math.round(clamp(30 - load * 0.08 - r() * 2, 0, 30)) : null;

    // Fin del desplazamiento
    if (this.moveTicks > 0) {
      this.moveTicks -= 1;
      if (this.moveTicks === 0) {
        this.actuators.get('rueda_izq').value = 0;
        this.actuators.get('rueda_der').value = 0;
        this.emit('ROBOT_STOPPED', {});
      }
    }

    // Seguridad: obstáculo muy cerca o motores calientes detienen el desplazamiento automático
    if (lidar.value !== null && lidar.value < 20 && load > 0) {
      this.moveTicks = 0;
      this.emit('OBSTACLE_STOP', { distance: lidar.value });
    }
    if (temp.value !== null && temp.value > 85) {
      this.moveTicks = 0;
      this.emit('THERMAL_STOP', { temperature: temp.value });
    }

    this.listeners.forEach((fn) => fn({ tipo: 'TICK' }));
    return this.snapshot();
  }

  // ── Lectura ──
  snapshot() {
    const sensors = [...this.sensors.values()].map((s) => {
      const ready = this.driverReady(s.driver);
      const warn =
        s.value !== null &&
        ((s.warnAbove !== null && s.value > s.warnAbove) || (s.warnBelow !== null && s.value < s.warnBelow));
      return { ...s, ready, status: !ready ? 'SIN_DRIVER' : warn ? 'ALERTA' : 'OK' };
    });
    const actuators = [...this.actuators.values()].map((a) => ({ ...a, ready: this.driverReady(a.driver) }));
    const drivers = [...this.drivers.values()].map((d) => ({
      ...d,
      devices: [...sensors, ...actuators].filter((x) => x.driver === d.id).map((x) => x.name),
    }));
    return {
      sensors,
      actuators,
      drivers,
      moving: actuators.some((a) => (a.id === 'rueda_izq' || a.id === 'rueda_der') && a.value > 0),
      ticks: this.ticks,
    };
  }
}
