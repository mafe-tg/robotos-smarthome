// web/app.js
// Conecta la página con la lógica del módulo (la misma que prueban los tests).
// Aquí NO se decide nada de procesos: solo se leen datos del formulario, se
// llama a src/proceso.js y src/cpu.js, y se dibuja el resultado.
//
// Todos los textos se insertan con textContent (nunca como HTML) para que un
// nombre de proceso raro no pueda romper la página.

import { Proceso, ESTADOS, reiniciarContadorPid } from "/src/proceso.js";
import { simular } from "/src/cpu.js";
import { ALGORITMOS } from "/src/scheduler.js";

// La lista de procesos vive solo en memoria. Al recargar la página se pierde.
let procesos = [];

const $ = (id) => document.getElementById(id);

// Crea un elemento con texto y clase en una sola línea.
function crear(etiqueta, texto = "", clase = "") {
  const el = document.createElement(etiqueta);
  if (texto !== "") el.textContent = texto;
  if (clase !== "") el.className = clase;
  return el;
}

function mostrarMensaje(texto, esError = false) {
  const el = $("mensaje");
  el.textContent = esError ? `Error: ${texto}` : texto;
  el.className = esError ? "mensaje mensaje-error" : "mensaje";
}

// Acciones que el usuario puede hacer sobre un proceso.
// "desde" indica en qué estados tiene sentido mostrar el botón.
// La regla real la sigue imponiendo src/proceso.js: si algo no se permite, falla.
const ACCIONES = [
  { texto: "Admitir", metodo: "admitir", desde: [ESTADOS.NEW] },
  { texto: "Ejecutar", metodo: "ejecutar", desde: [ESTADOS.READY] },
  { texto: "Devolver a la cola", metodo: "expropiar", desde: [ESTADOS.RUNNING] },
  { texto: "Pausar", metodo: "pausar", desde: [ESTADOS.READY, ESTADOS.RUNNING] },
  { texto: "Reanudar", metodo: "reanudar", desde: [ESTADOS.WAITING] },
  {
    texto: "Finalizar",
    metodo: "finalizar",
    desde: [ESTADOS.NEW, ESTADOS.READY, ESTADOS.RUNNING, ESTADOS.WAITING],
  },
];

function aplicarAccion(proceso, accion) {
  try {
    if (accion.metodo === "ejecutar") {
      // Hay una sola CPU: no pueden existir dos procesos en RUNNING a la vez.
      const otro = procesos.find((p) => p.estado === ESTADOS.RUNNING && p !== proceso);
      if (otro) {
        throw new Error(
          `La CPU atiende un proceso a la vez y "${otro.nombre}" ya está en RUNNING. Pausa ese proceso o devuélvelo a la cola, y vuelve a intentarlo.`
        );
      }
    }
    proceso[accion.metodo]();
    mostrarMensaje(`"${proceso.nombre}" ahora está en ${proceso.estado}.`);
  } catch (error) {
    mostrarMensaje(error.message, true);
  }
  dibujarTodo();
}

function etiquetaEstado(estado) {
  const el = crear("span", estado, `estado estado-${estado}`);
  return el;
}

function dibujarTabla() {
  const cuerpo = $("tabla-cuerpo");
  cuerpo.replaceChildren();
  $("vacio").hidden = procesos.length > 0;
  $("contenedor-tabla").hidden = procesos.length === 0;

  for (const p of procesos) {
    const fila = crear("tr");
    fila.append(
      crear("td", String(p.pid), "num"),
      crear("td", p.nombre),
      crear("td", String(p.prioridad), "num"),
      crear("td", `${p.memoriaRequerida} MB`, "num"),
      crear("td", `${p.cpuRequerida}%`, "num"),
      crear("td", `${p.tiempoRestante} de ${p.tiempoTotal}`, "num")
    );

    const celdaEstado = crear("td");
    celdaEstado.append(etiquetaEstado(p.estado));
    fila.append(celdaEstado);

    const celdaAcciones = crear("td");
    const grupo = crear("div", "", "acciones");
    for (const accion of ACCIONES) {
      if (!accion.desde.includes(p.estado)) continue;
      const boton = crear("button", accion.texto, "boton boton-chico");
      boton.type = "button";
      boton.setAttribute("aria-label", `${accion.texto}: ${p.nombre}`);
      boton.addEventListener("click", () => aplicarAccion(p, accion));
      grupo.append(boton);
    }
    if (grupo.children.length === 0) {
      grupo.append(crear("span", "Sin acciones", "ayuda"));
    }
    celdaAcciones.append(grupo);
    fila.append(celdaAcciones);

    cuerpo.append(fila);
  }
}

function dibujarCpu() {
  const enCpu = procesos.find((p) => p.estado === ESTADOS.RUNNING);
  const uso = enCpu ? enCpu.cpuRequerida : 0;

  $("cpu-relleno").style.width = `${uso}%`;
  $("cpu-barra").setAttribute("aria-valuenow", String(uso));
  $("cpu-texto").textContent = enCpu
    ? `${uso}% en uso. Ejecutando: ${enCpu.nombre}.`
    : "La CPU está libre.";

  const lista = $("conteos");
  lista.replaceChildren();
  for (const estado of Object.values(ESTADOS)) {
    const cantidad = procesos.filter((p) => p.estado === estado).length;
    const item = crear("li");
    item.append(etiquetaEstado(estado), crear("span", String(cantidad), "conteo-numero"));
    lista.append(item);
  }
}

function dibujarTodo() {
  dibujarTabla();
  dibujarCpu();
  // Indicadores visuales del dashboard: se calculan desde el estado real del prototipo.
  const enCpu = procesos.find((p) => p.estado === ESTADOS.RUNNING);
  const uso = enCpu ? enCpu.cpuRequerida : 0;
  const memoria = procesos.reduce((total, p) => total + p.memoriaRequerida, 0);
  const ejecutando = procesos.filter((p) => p.estado === ESTADOS.RUNNING).length;
  const porcentajeMemoria = Math.min(100, (memoria / 1024) * 100);
  const porcentajeProcesos = Math.min(100, procesos.length * 10);
  const indicadores = {
    "kpi-cpu": `${uso}%`,
    "kpi-cpu-label": `${uso}%`,
    "kpi-processes": String(procesos.length),
    "kpi-running": String(ejecutando),
    "kpi-memory": `${memoria} MB`,
    "top-cpu": `${uso}%`,
  };
  for (const [id, valor] of Object.entries(indicadores)) {
    const elemento = $(id);
    if (elemento) elemento.textContent = valor;
  }
  const barras = {
    "kpi-cpu-bar": uso,
    "kpi-process-bar": porcentajeProcesos,
    "kpi-memory-bar": porcentajeMemoria,
  };
  for (const [id, porcentaje] of Object.entries(barras)) {
    const elemento = $(id);
    if (elemento) elemento.style.width = `${porcentaje}%`;
  }
}

// ---- Simulación ----------------------------------------------------------

const NOMBRES_ALGORITMO = {
  [ALGORITMOS.PRIORIDAD]: "Prioridad",
  [ALGORITMOS.ROUND_ROBIN]: "Round Robin",
};

function dibujarLineaDeTiempo(linea) {
  const contenedor = $("contenedor-linea");
  contenedor.replaceChildren();

  // Una fila por proceso, en el orden en que aparece por primera vez en la CPU.
  const filas = [];
  for (const t of linea) {
    if (!filas.some((f) => f.pid === t.pid)) filas.push({ pid: t.pid, nombre: t.nombre });
  }

  const tabla = crear("table", "", "linea");
  const cabecera = crear("thead");
  const filaCabecera = crear("tr");
  const esquina = crear("th", "Proceso");
  esquina.scope = "col";
  filaCabecera.append(esquina);
  linea.forEach((_, i) => {
    const th = crear("th", String(i + 1), "tick");
    th.scope = "col";
    filaCabecera.append(th);
  });
  cabecera.append(filaCabecera);
  tabla.append(cabecera);

  const cuerpo = crear("tbody");
  filas.forEach((fila, indice) => {
    const tr = crear("tr");
    const nombre = crear("th", fila.nombre, "linea-nombre");
    nombre.scope = "row";
    tr.append(nombre);
    for (const t of linea) {
      const td = crear("td", "", t.pid === fila.pid ? "casilla casilla-activa" : "casilla");
      if (t.pid === fila.pid) {
        td.style.setProperty("--serie", `var(--serie-${indice % 6})`);
        td.title = `${fila.nombre} usa la CPU en el tick ${t.tick + 1}`;
        td.append(crear("span", "usa la CPU", "solo-lectores"));
      }
      tr.append(td);
    }
    cuerpo.append(tr);
  });
  tabla.append(cuerpo);
  contenedor.append(tabla);
}

function dibujarMetricas(metricas) {
  const tabla = $("tabla-metricas");
  tabla.replaceChildren();
  tabla.className = "tabla";

  const encabezados = [
    ["Proceso", ""],
    ["Prioridad", "num"],
    ["Tiempo total", "num"],
    ["Retorno", "num"],
    ["Espera", "num"],
  ];
  const cabecera = crear("thead");
  const fila = crear("tr");
  for (const [texto, clase] of encabezados) {
    const th = crear("th", texto, clase);
    th.scope = "col";
    fila.append(th);
  }
  cabecera.append(fila);
  tabla.append(cabecera);

  const cuerpo = crear("tbody");
  for (const m of metricas) {
    const tr = crear("tr");
    tr.append(
      crear("td", m.nombre),
      crear("td", String(m.prioridad), "num"),
      crear("td", String(m.tiempoTotal), "num"),
      crear("td", String(m.retorno), "num"),
      crear("td", String(m.espera), "num")
    );
    cuerpo.append(tr);
  }
  tabla.append(cuerpo);
}

function ejecutarSimulacion() {
  const hayListos = procesos.some(
    (p) => p.estado === ESTADOS.NEW || p.estado === ESTADOS.READY
  );
  if (!hayListos) {
    $("resultado").hidden = true;
    mostrarMensaje(
      "No hay procesos en NEW o READY para simular. Crea un proceso nuevo o reanuda uno pausado.",
      true
    );
    return;
  }

  // Copias: la simulación termina todos los procesos y no debe tocar los de la tabla.
  const copias = procesos.map((p) => Object.assign(Object.create(Proceso.prototype), p));
  const algoritmo = $("algoritmo").value;
  const quantum = Number($("quantum").value);

  try {
    const resultado = simular(copias, { algoritmo, quantum });

    const partes = [
      `Algoritmo: ${NOMBRES_ALGORITMO[algoritmo]}.`,
      resultado.quantum !== null ? `Quantum: ${resultado.quantum}.` : "",
      `Duración total: ${resultado.duracionTotal} ticks.`,
      `Uso de CPU promedio: ${resultado.usoCpuPromedio}%.`,
    ].filter((texto) => texto !== "");
    $("resumen").textContent = partes.join(" ");

    dibujarLineaDeTiempo(resultado.linea);
    dibujarMetricas(resultado.metricas);

    const omitidos = $("omitidos");
    if (resultado.omitidos.length > 0) {
      const lista = resultado.omitidos.map((o) => `${o.nombre} (${o.estado})`).join(", ");
      omitidos.textContent = `No entraron a la simulación porque no estaban listos: ${lista}.`;
      omitidos.hidden = false;
    } else {
      omitidos.hidden = true;
    }

    $("resultado").hidden = false;
    mostrarMensaje("Simulación terminada. Tus procesos de la tabla no cambiaron.");
  } catch (error) {
    $("resultado").hidden = true;
    mostrarMensaje(error.message, true);
  }
}

// ---- Eventos -------------------------------------------------------------

$("formulario").addEventListener("submit", (evento) => {
  evento.preventDefault();
  try {
    const proceso = new Proceso({
      nombre: $("nombre").value,
      prioridad: Number($("prioridad").value),
      memoriaRequerida: Number($("memoria").value),
      cpuRequerida: Number($("cpu").value),
      tiempoTotal: Number($("tiempo").value),
    });
    procesos.push(proceso);
    $("nombre").value = "";
    mostrarMensaje(`Proceso "${proceso.nombre}" creado con PID ${proceso.pid}. Está en NEW: admítelo para que pase a READY.`);
    dibujarTodo();
    $("nombre").focus();
  } catch (error) {
    mostrarMensaje(error.message, true);
  }
});

// Procesos de ejemplo tomados de la descripción de RobotOS SmartHome.
// Los números (prioridad, memoria, CPU, tiempo) son ejemplos inventados.
function cargarEjemplo() {
  if (procesos.length > 0 && !window.confirm("Esto reemplaza los procesos actuales. ¿Continuar?")) {
    return;
  }
  reiniciarContadorPid();
  procesos = [
    new Proceso({ nombre: "Control de iluminación", prioridad: 3, memoriaRequerida: 64, cpuRequerida: 10, tiempoTotal: 3 }),
    new Proceso({ nombre: "Gestión de temperatura", prioridad: 2, memoriaRequerida: 96, cpuRequerida: 20, tiempoTotal: 4 }),
    new Proceso({ nombre: "Vigilancia", prioridad: 1, memoriaRequerida: 256, cpuRequerida: 45, tiempoTotal: 5 }),
    new Proceso({ nombre: "Automatización de rutinas", prioridad: 3, memoriaRequerida: 48, cpuRequerida: 15, tiempoTotal: 2 }),
    new Proceso({ nombre: "Monitoreo de consumo energético", prioridad: 4, memoriaRequerida: 32, cpuRequerida: 8, tiempoTotal: 3 }),
  ];
  $("resultado").hidden = true;
  mostrarMensaje("Cargué 5 procesos de ejemplo en estado NEW. Admítelos uno por uno o simula la CPU.");
  dibujarTodo();
}

function vaciarTodo() {
  if (procesos.length > 0 && !window.confirm("Esto borra todos los procesos. ¿Continuar?")) {
    return;
  }
  reiniciarContadorPid();
  procesos = [];
  $("resultado").hidden = true;
  mostrarMensaje("Se borraron todos los procesos.");
  dibujarTodo();
}

$("btn-ejemplo").addEventListener("click", cargarEjemplo);
$("btn-vaciar").addEventListener("click", vaciarTodo);
$("btn-simular").addEventListener("click", ejecutarSimulacion);

// El quantum solo se usa en Round Robin.
$("algoritmo").addEventListener("change", () => {
  $("quantum").disabled = $("algoritmo").value !== ALGORITMOS.ROUND_ROBIN;
});

dibujarTodo();
