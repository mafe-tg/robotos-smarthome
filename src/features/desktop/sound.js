/**
 * Sonidos cortos de la interfaz (Web Audio, sin archivos).
 * Se activan o desactivan desde la barra superior o Configuración.
 */
let enabled = true;
let ctx = null;

export const setSoundEnabled = (on) => {
  enabled = on;
};

const tone = (freq, duration = 0.06, type = 'square', gain = 0.035, delay = 0) => {
  if (!enabled) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    /* el navegador no permite audio todavía */
  }
};

export const sfx = {
  move: () => tone(880, 0.04),
  open: () => {
    tone(660, 0.06, 'triangle', 0.05);
    tone(990, 0.08, 'triangle', 0.05, 0.06);
  },
  close: () => tone(440, 0.07, 'triangle', 0.04),
  error: () => {
    tone(220, 0.1, 'sawtooth', 0.03);
    tone(180, 0.12, 'sawtooth', 0.03, 0.1);
  },
  boot: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, 'triangle', 0.05, i * 0.09));
  },
};
