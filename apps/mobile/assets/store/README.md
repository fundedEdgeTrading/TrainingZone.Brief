# Capturas de la ficha de tienda — E9-16

**Este paso es manual y queda pendiente.** Ninguna sesión de agente puede
generar capturas reales: hace falta un simulador/emulador arrancado, la app
corriendo contra datos de demo y a alguien pulsando el atajo de captura. Lo
que sí queda listo aquí es el guion exacto y las carpetas donde caen.

## Guion, en orden

Mismo contenido que `src/lib/app-screenshots.ts` (la fuente que usa la página
`/app` mientras no hay capturas reales) — se repite aquí a mano porque
`apps/mobile` y la app web son dos paquetes npm independientes y no se
importan entre sí.

| # | Pantalla | Datos de demo | Cuenta a usar |
|---|---|---|---|
| 1 | Agenda del socio | Semana con 3-4 clases visibles, una ya reservada en verde y una plaza libre resaltada. | `socio@trainingzone.es` |
| 2 | Detalle de reserva | Clase de grupo reducido con entrenador, hora, plazas restantes y botón de reservar. | `socio@trainingzone.es` |
| 3 | Bono y progreso | Bono de 10 sesiones con 6 restantes y fecha de caducidad, más la última valoración. | `socio@trainingzone.es` |
| 4 | Seguimiento visual | Comparativa de dos fotos de progreso con dos meses de diferencia. | `socio@trainingzone.es` |
| 5 | Agenda del entrenador | Día con 5 sesiones, una con el semáforo de aptitud en ámbar visible en la tarjeta. | `entrenador@trainingzone.es` |
| 6 | Ficha de socio (entrenador) | Datos de contacto, bono activo y notas de la última sesión del socio demo. | `entrenador@trainingzone.es` |

Seis pantallas cubre el mínimo que pide la historia (6 a 8). Si se añaden una
o dos más antes de publicar, buenas candidatas son "onboarding / primer
acceso" y "feedback tras una sesión" — no se incluyen aquí porque no aportan
un ángulo nuevo del producto sobre las seis de arriba.

Antes de disparar cada captura:

1. Iniciar sesión con la cuenta de la tabla (contraseña `demo1234` tras
   `npm run db:seed` en la raíz del monorepo).
2. Comprobar que el estado de la pantalla coincide con la columna "datos de
   demo" — si el bono real ya no tiene 6 sesiones restantes, ajustar los
   datos de la organización demo antes de capturar, no describir un estado
   que no se ve.
3. Desactivar cualquier notificación/reloj con hora real visible en la barra
   de estado si el simulador no lo hace por defecto (Xcode sí; Android
   Studio necesita "Show battery/clock" desactivado en la configuración del
   AVD).

## Tamaños obligatorios y dónde caen

Los tamaños de pantalla exigidos por cada tienda cambian con cada generación
de dispositivo — **confirmar las medidas exactas en App Store Connect y en
Play Console en el momento de subir**, no dar las de abajo por definitivas.
Con esa salvedad, hoy son:

```
apps/mobile/assets/store/
├── ios/
│   ├── 6.9-iphone-1320x2868/    ← obligatorio (iPhone de pantalla más grande)
│   └── 5.5-iphone-1242x2208/    ← obligatorio si se declara soporte de dispositivos antiguos
└── android/
    ├── phone-1080x1920/         ← mínimo 2, hasta 8 — aquí van las 6 del guion
    └── feature-graphic-1024x500/ ← 1 imagen, no es una captura de pantalla:
                                     es el banner de cabecera de la ficha de Play
```

No hay carpeta de iPad: `app.json` no declara `ios.supportsTablet`, así que
la app es solo de teléfono y App Store Connect no pide capturas de iPad para
una ficha así declarada. Si eso cambia, añadir `ios/13-ipad/` con el tamaño
que exija entonces la consola.

Cada captura se nombra `<orden>-<pantalla-en-kebab-case>.png`, por ejemplo
`01-agenda-del-socio.png`, para que el orden de subida a la tienda coincida
con el de esta tabla sin tener que reordenar nada a mano.
