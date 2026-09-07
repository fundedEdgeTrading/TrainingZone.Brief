<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Invariantes del trimestre (septiembre 2026)

Reglas que valen para **todas** las sesiones que trabajen el lote de historias de
`docs/hu/`. No las redescubras leyendo código y no las cambies sin pasar por el
integrador: hay nueve pistas trabajando en paralelo sobre este repositorio.

- **Ámbito de centro**: toda lectura y toda escritura con `centerId` pasa por
  `isCenterInScope` / `requireApiCenterScope`. Sin excepciones, y en la API móvil
  igual que en la web — el patrón "espejo móvil" es el fallo que más se repite.
- **Datos de salud**: todo acceso pasa por `health-access.ts` y deja `AuditLog`.
  Los roles sin autorización reciben `null`, nunca un error que revele si el dato existe.
- **Bonos**: ninguna operación mueve `sessionsRemaining` sin escribir en `SessionLedger`.
- **Estados de reserva**: usa `assertBookingTransition`. `CANCELLED` y `WAITLISTED`
  nunca pasan a `ATTENDED`, en ninguno de los cuatro puntos de escritura.
- **Gateo por plan**: `FEATURE_BY_ROUTE` es declarativo y se hereda a las rutas hijas.
  Una ruta nueva sin gate declarado debe fallar en test, no en producción.
- **Ventana de cancelación**: la del centro, leída del servidor. Cero literales de horas
  en el cliente, ni en la web ni en la app.
- **Stripe**: nunca borres un `Price`; archívalo. Toda creación lleva clave de idempotencia.
- **Rótulos y permisos**: fuente única compartida entre web y app. No copies una tabla
  de permisos "como espejo": ese duplicado ya provocó un fallo documentado.
- **Cookies**: hoy solo hay técnicas (sesión de Auth.js y `tz`), inventariadas en
  `/cookies` (E10-22) — sin banner, porque ninguna lo exige. Cualquier cambio que
  añada analítica, publicidad o cualquier cookie no estrictamente técnica debe
  traer en el mismo cambio un CMP con "rechazar todo" al mismo nivel visual que
  "aceptar todo", y actualizar el inventario de `/cookies`.

**Ficheros congelados** durante el trimestre: `prisma/schema.prisma` y `src/lib/rbac.ts`.
Si necesitas tocarlos, para y pídelo — no los edites en tu rama.

**Pruebas**: ejecuta `npm run lint`, `npx tsc --noEmit` y `npm run test:unit`, más los
specs de Playwright de tu pista. **Nunca la suite completa de Playwright**: muta la base
de datos de demo y contamina al resto de sesiones.
