# RobotOS SmartHome — ajustes de interfaz y carga (versión 3)

## Cambios
- La batería ya no salta directamente al 100 %. En la habitación **Base de carga** aparece un control para iniciar o detener la carga.
- Al iniciar la carga, RX-1 queda asignado a la base y la batería aumenta gradualmente 1 % cada 1,5 segundos hasta llegar al 100 %.
- Si RX-1 recibe una nueva ubicación fuera de la base, la carga se detiene.
- El indicador **Sistema CPU** del resumen de la casa tiene un ancho fijo para que no cambie de posición al encender o apagar dispositivos.
- Las aplicaciones vuelven a abrirse en ventanas con su tamaño normal, en lugar de ocupar casi toda la pantalla.
- Se agregaron acentos rosados muy suaves en degradados y bordes, manteniendo el azul y violeta como colores principales.

## Ejecución en macOS
Desde la carpeta que contiene `package.json`:

```bash
npm install
npm run dev
```

## Pruebas
`npm run test:os`: 114 pruebas aprobadas, 0 fallidas.

La compilación de producción no se ejecutó en este entorno porque no están instaladas las dependencias de Vite. Se debe ejecutar en el Mac después de `npm install` si se desea validar también el build.
