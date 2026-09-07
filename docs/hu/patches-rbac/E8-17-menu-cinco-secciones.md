# E8-17 · Menú a cinco secciones — cambio propuesto para `src/lib/rbac.ts`

`src/lib/rbac.ts` está congelado este trimestre (AGENTS.md). Esta historia
necesita tocarlo, así que el cambio se deja diseñado y listo para pegar, para
que el integrador lo aplique en la ventana de merge.

## Qué cambia y qué no

- **Solo se reasignan etiquetas de sección** (`NavItem.section`) sobre las
  rutas que YA existen. Ningún handoff de página, ningún `href` nuevo.
- **`/aforo` deja de estar en el menú de `CENTER_DIRECTOR`**: su edición de
  aforo por defecto ya vive en Organización → Centros
  (`src/app/(app)/organization/page.tsx:227-249`, `ActionForm` con
  `updateCenterCapacity`) — MODULOS_APARCADOS.md ya lo daba por hecho y el
  código ya lo cumple. La página `src/app/(app)/aforo/page.tsx` **se
  mantiene** (no se borra): sigue siendo la única vía de `TRAINER_ADMIN`, que
  no tiene acceso a `/organization`. Solo desaparece del menú de
  `CENTER_DIRECTOR`, que ya tiene el mismo control embebido en Organización.
- `TRAINER`, `TRAINER_ADMIN`, `RECEPTION`, `MEMBER`, `HR_MANAGER` y
  `PLATFORM_ADMIN` **no cambian**: ya caben en una o dos secciones (el
  problema de los "15 items en 4 secciones" es de `OWNER`/`CENTER_DIRECTOR`).
  Cambiarlos ahora sin necesidad multiplica el riesgo de conflicto con las
  otras ocho pistas que tocan este fichero.
- Los módulos apagados (rutina de IA del portal — E12-01 — y fichajes —
  E10-21) no tenían entrada propia en el menú de dirección: nada que quitar
  aquí. Chat, tareas, anuncios y biblioteca online siguen sin tocarse (D-P6).

## `NavSection`

```ts
export type NavSection =
  | "Hoy"
  | "Socios"
  | "Dinero"
  | "Crecer"
  | "Ajustes"
  // Navegación del socio (sin cambios: fuera del alcance de esta historia).
  | "Entrenar"
  | "Membresía";
```

Sustituye a `"Vista general" | "Día a día" | "Crecimiento" | "Salud y
aptitud" | "Administración"`. `NAV_SECTION_ORDER` pasa a:

```ts
export const NAV_SECTION_ORDER: NavSection[] = ["Hoy", "Socios", "Dinero", "Crecer", "Ajustes", "Entrenar", "Membresía"];
```

`NAV_SECTIONS_COLLAPSED_BY_DEFAULT` pasa de `["Administración"]` a
`["Ajustes"]` (mismo criterio: estructura y control, se mira de tarde en
tarde).

## `NAV_BY_ROLE.OWNER` (16 → 16 items, 4 secciones → 5)

```ts
OWNER: [
  { href: "/dashboard", label: "Panel de control", section: "Hoy", icon: "panel" },
  { href: "/feedback", label: "Feedback", section: "Hoy", icon: "feedback" },
  { href: "/trainer", label: "Panel del equipo", section: "Hoy", icon: "panel" },
  { href: "/agenda", label: "Agenda", section: "Hoy", icon: "agenda" },
  { href: "/tareas", label: "Tareas", section: "Hoy", icon: "tareas" },

  { href: "/members", label: "Socios", section: "Socios", icon: "socios" },

  { href: "/billing", label: "Cobros", section: "Dinero", icon: "cobros" },

  { href: "/leads", label: "Leads", section: "Crecer", icon: "leads" },
  { href: "/anuncios", label: "Anuncios", section: "Crecer", icon: "anuncios" },

  { href: "/health/aptitude-rules", label: "Reglas de aptitud", section: "Ajustes", icon: "reglas" },
  { href: "/health/reference-ranges", label: "Rangos de composición", section: "Ajustes", icon: "rangos" },
  { href: "/organization/valoraciones", label: "Valoraciones", section: "Ajustes", icon: "evolucion" },
  { href: "/organization", label: "Organización", section: "Ajustes", icon: "organizacion" },
  { href: "/rrhh", label: "RRHH", section: "Ajustes", icon: "rrhh" },
  { href: "/puesta-en-marcha", label: "Puesta en marcha", section: "Ajustes", icon: "puestaEnMarcha" },
  { href: "/audit", label: "Auditoría", section: "Ajustes", icon: "auditoria" },
],
```

Nota sobre "Dinero" y `MODULOS_APARCADOS.md`: la historia describe Dinero
como "cobros, morosidad, productos y planes, y MRR". Morosidad y MRR ya
viven DENTRO de `/billing` y `/dashboard` respectivamente (no son rutas
propias); "productos y planes" hoy vive embebido en `/organization`
(`products-section.tsx`), no en `/billing`. Moverlo a una ruta propia bajo
Dinero es un cambio de página, no de etiqueta, y se deja fuera de esta
propuesta para no mezclar el regrupado del menú (que es lo que pide E8-17)
con una migración de página (que sería una historia aparte). Con esta
propuesta, "productos y planes" se sigue gestionando desde Organización →
Ajustes, un clic más lejos de Dinero de lo que describe la historia; si el
integrador prefiere cerrarlo del todo, hace falta separar `products-section`
a una ruta bajo `/billing` o `/dinero/productos` antes de mover su `section`.

## `NAV_BY_ROLE.CENTER_DIRECTOR` (11 → 10 items: sale `/aforo`)

```ts
CENTER_DIRECTOR: [
  { href: "/dashboard", label: "Panel de control", section: "Hoy", icon: "panel" },
  { href: "/feedback", label: "Feedback", section: "Hoy", icon: "feedback" },
  { href: "/trainer", label: "Panel del equipo", section: "Hoy", icon: "panel" },
  { href: "/agenda", label: "Agenda", section: "Hoy", icon: "agenda" },
  { href: "/tareas", label: "Tareas", section: "Hoy", icon: "tareas" },

  { href: "/members", label: "Socios", section: "Socios", icon: "socios" },

  { href: "/billing", label: "Cobros", section: "Dinero", icon: "cobros" },

  { href: "/leads", label: "Leads", section: "Crecer", icon: "leads" },
  { href: "/anuncios", label: "Anuncios", section: "Crecer", icon: "anuncios" },

  { href: "/health/aptitude-rules", label: "Reglas de aptitud", section: "Ajustes", icon: "reglas" },
  { href: "/health/reference-ranges", label: "Rangos de composición", section: "Ajustes", icon: "rangos" },
  { href: "/organization", label: "Organización", section: "Ajustes", icon: "organizacion" },
  { href: "/rrhh", label: "RRHH", section: "Ajustes", icon: "rrhh" },
],
```

(`/aforo` retirado; el resto, mismo criterio que `OWNER`. `CENTER_DIRECTOR`
no tenía `/organization/valoraciones`, `/puesta-en-marcha` ni `/audit` antes
de este cambio — se mantiene así, no se le añaden módulos nuevos.)

## Resto de roles

Sin cambios de contenido. Solo hay que revisar que ningún `NavItem` de
`TRAINER`, `TRAINER_ADMIN`, `RECEPTION`, `HR_MANAGER` o `PLATFORM_ADMIN`
siga usando `"Vista general"` / `"Día a día"` / `"Administración"` como
`section` literal después del cambio de tipo — hoy todos ellos usan
`"Vista general"` o `"Día a día"`, así que hay que decidir su encaje:

- `TRAINER` / `TRAINER_ADMIN`: su comentario en el código ya dice que caben
  en una sola sección ("por debajo de 7 items las cabeceras cuestan más de
  lo que ordenan"). Se sugiere `"Hoy"` para todo su bloque actual —
  literalmente el mismo criterio, solo con el nombre nuevo.
- `RECEPTION`: iguales cinco items, hoy en `"Día a día"` → pasan a `"Hoy"`.
- `HR_MANAGER`: `tareas` → `"Hoy"`; `organization`/`rrhh` → `"Ajustes"`.
- `PLATFORM_ADMIN`: todo en `"Vista general"` hoy → se sugiere `"Ajustes"`
  para `organization`/`audit` y `"Hoy"` para `dashboard`/`anuncios`, pero al
  no ser el problema que resuelve esta historia, el integrador puede dejarlo
  en una sección nueva `"Plataforma"` si prefiere no forzar la nomenclatura
  de dirección de centro sobre el rol de soporte. Se deja como decisión de
  quien aplique el patch.

## Pruebas que hay que revisar tras aplicar

- `src/lib/rbac-gating.test.ts` y `src/lib/mobile-feature-routes.test.ts`
  no dependen del nombre de `NavSection`, pero conviene ejecutar
  `npm run test:unit` completo tras el merge.
- Cualquier test o e2e que seleccione un item de menú por el texto de la
  cabecera de sección (`"Vista general"`, `"Día a día"`, `"Administración"`)
  se queda huérfano: `grep -rn "Vista general\|Día a día\|Administración" e2e/`
  antes de dar el cambio por cerrado.
- Ya localizado: `e2e/planes-gateo.spec.ts:44` hace
  `sidebar.getByRole("button", { name: "Administración" }).click()` para
  desplegar la sección plegada antes de llegar a Auditoría. Con este cambio
  pasa a ser `"Ajustes"` (la sección que hereda el plegado por defecto).
