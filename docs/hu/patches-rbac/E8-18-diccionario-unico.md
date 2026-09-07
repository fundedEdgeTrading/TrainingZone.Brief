# E8-18 · Diccionario único de rótulos y matriz única de permisos

`rbac.ts` está congelado este trimestre. Lo que sigue es lo que esta historia
haría allí si pudiera tocarlo — para pedirlo en la ventana de merge — y lo que
ya se ha resuelto sin tocarlo.

## Ya resuelto sin tocar `rbac.ts`

- **Rótulos**: `apps/mobile/src/app/(tabs)/perfil.tsx` tenía su propio
  `ROLE_LABEL` con textos distintos a los de `rbac.ts` para el mismo rol
  (`OWNER`: "Dirección" vs "Dirección de organización"; `PLATFORM_ADMIN`:
  "Administración" vs "Admin plataforma"). Se ha igualado el texto de la app
  al de `rbac.ts` y `src/lib/role-label-parity.test.ts` protege que no vuelvan
  a divergir — importa el `ROLE_LABEL` real de `rbac.ts` y lo compara contra
  una extracción por regex del fichero de la app.
- **Nombre de sección**: la app llamaba "Equipo" a la sección que la web llama
  "Organización" (`_layout.tsx`, pestaña `organizacion`, y el título de
  `apps/mobile/src/app/(tabs)/organizacion/index.tsx`). Ambos renombrados a
  "Organización".
- **Iconos**: los cuatro pares con equivalencia 1:1 clara (Agenda↔calendar,
  Cobros↔wallet, Organización↔building, Actividad↔activity, y Socios↔users)
  ahora comparten la misma geometría de trazo (`d` de cada `<path>`) en
  `src/components/nav-icons.tsx`, copiada literalmente de
  `apps/mobile/src/components/Icon.tsx` — que es la que se conserva, como pide
  el Gherkin. El resto de iconos de `nav-icons.tsx` no tiene equivalente
  reconocible en el catálogo de la app (Leads, Anuncios, Reglas de aptitud,
  Rangos, RRHH, Puesta en marcha, Auditoría, Brief, Reservar, Evolución,
  Membresía, Tareas, Descargar) y se han dejado tal cual: renombrar a la fuerza
  un glifo sin un par real habría sido inventar una equivalencia, no
  documentar una que ya existe.
- **Paridad de capacidades** (parcial): `role-label-parity.test.ts` verifica
  que las seis entradas de menú de `TRAINER` (Mi panel, Agenda, Tareas,
  Session Brief, Socios, Leads) y las cuatro de `MEMBER` (Mi actividad,
  Reservar clase, Mi evolución, Mi membresía) tienen su pestaña en la app. Son
  los dos roles que la app conserva de forma estable hoy — `OWNER`,
  `CENTER_DIRECTOR`, `HR_MANAGER`, `RECEPTION`, `PLATFORM_ADMIN` y
  `TRAINER_ADMIN` no entran en esta comprobación porque su recorte a 2 roles
  (`MEMBER`/`TRAINER`) es objeto de **E13-01**, que no es esta pista: repetir
  aquí ese trabajo antes de que E13-01 decida qué pestañas sobreviven habría
  sido construir sobre un suelo que otra pista va a mover.

## Pendiente de la ventana de merge (toca `rbac.ts`)

1. **Un solo módulo de verdad para `ROLE_LABEL`.** Hoy la "fuente única" es de
   facto (rbac.ts + un test que protege una copia paralela en la app), no
   literal — los dos toolchains no pueden importar el mismo fichero TS. Para
   que sea literal habría que:
   - Añadir a `rbac.ts` un export `ROLE_LABEL_JSON = ROLE_LABEL` (o generar en
     build un `role-labels.generated.json` a partir de `rbac.ts`) que un
     script de `apps/mobile` consuma en su propio build step, en vez de una
     copia a mano.
   - Alternativa más simple si no se quiere tooling de build cruzado: dejar la
     copia paralela + test (lo que ya hay) y aceptar que es la fuente única
     "protegida", no "literal". Documentado aquí para que quien decida en la
     ventana de merge elija con el coste delante.

2. **Matriz de permisos única, protegida por el test de paridad de E7-09.**
   El Gherkin de esta historia remite explícitamente a E7-09 ("la matriz es
   única y el test de paridad la protege"). A fecha de este commit no existe
   ningún fichero ni test con `E7-09` en el repo — esa historia, de otra
   pista, todavía no se ha implementado. El escenario "permisos" de E8-18
   queda **bloqueado por esa dependencia**, no por `rbac.ts` estar congelado:
   en cuanto E7-09 exista, su test de paridad es el que debe proteger la
   matriz única; esta pista no debe construir un segundo mecanismo paralelo
   para lo mismo.
