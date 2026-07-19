# Plan de mejora UX/UI Premium — Training Zone

> Documento de implementación. Ejecutar las fases **en orden**. Cada fase termina con `npm run lint` + `npm run build` en verde y un commit propio.
> Identidad de marca: ver `docs/BRANDING.md` (beige/hueso/negro, Poppins, sin degradados de color, el negro como contraste).

---

## 0. Reglas para el implementador (leer antes de tocar código)

1. **Next.js 16.2.10 con breaking changes**: antes de escribir código, ejecuta `npm install` y lee las guías relevantes en `node_modules/next/dist/docs/` (ver `AGENTS.md`). No asumas convenciones de versiones anteriores.
2. **Tailwind v4**: los tokens viven en `@theme inline` dentro de `src/app/globals.css`. **NO crear `tailwind.config.js`**. Un token `--color-x` se usa como `bg-x`, `text-x`, `border-x`.
3. **No tocar lógica de negocio**: queries (`src/lib/*-queries.ts`), actions, RBAC, Prisma y auth quedan intactos. Solo JSX, `className`, CSS y componentes nuevos en `src/components/`.
4. **Server Components por defecto**: no añadir `"use client"` salvo que el componente use estado/eventos. Las primitivas UI de la Fase 2 deben ser server-compatible (sin hooks) excepto donde se indique.
5. **Estética de marca**: nada de degradados de color, glassmorphism ni azules/violetas genéricos. Premium aquí = beige cálido, negro rotundo, tipografía Poppins con pesos fuertes, mucho aire, sombras suaves y motion sobrio.
6. **Motion**: solo animar `transform`, `opacity`, `box-shadow`, `background-color`, `border-color`. Nunca `width/height/top/left`. Duraciones 150–500 ms. Todo debe respetar `prefers-reduced-motion`.
7. Referenciar siempre los tokens (`text-brand-muted`, `border-brand-border`…), nunca hex sueltos en JSX. Si falta un color, añadirlo como token en `globals.css`.

### Diagnóstico actual (por qué este plan)

- Conviven **dos generaciones de estilo**: `dashboard`, `portal`, `sidebar.tsx`, `header.tsx` y `kpi-card.tsx` ya tienen el look premium (tokens `brand-*`, `tz-fade-up`, hover lift). El resto (`members`, `retention`, `brief`, `agenda`, `billing`, `audit`, `health`, `login`) usa estilos utilitarios planos e inconsistentes.
- No hay primitivas compartidas: botones, inputs, badges y tablas se reescriben en cada página con clases distintas.
- Faltan: estados de foco visibles consistentes, `prefers-reduced-motion`, skeletons (`loading.tsx`), empty states, feedback en acciones, y el calendario (`react-big-calendar`) está casi sin tematizar.
- Varias páginas duplican el título (`<h1>` local) cuando `header.tsx` ya muestra el título de la ruta.

---

## Fase 1 — Tokens y base global (`src/app/globals.css`)

### 1.1 Añadir al bloque `@theme inline`

```css
  /* Radios */
  --radius-card: 16px;
  --radius-control: 10px;
  --radius-pill: 999px;

  /* Sombras (cálidas, basadas en el negro de marca) */
  --shadow-card: 0 1px 2px rgba(29, 29, 28, 0.04), 0 4px 16px -8px rgba(29, 29, 28, 0.08);
  --shadow-hover: 0 10px 28px -12px rgba(29, 29, 28, 0.28);
  --shadow-pop: 0 18px 44px -16px rgba(29, 29, 28, 0.35);

  /* Motion */
  --ease-out-soft: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.4, 1);
```

Con esto Tailwind genera `rounded-card`, `rounded-control`, `shadow-card`, `shadow-hover`, `shadow-pop`, `ease-out-soft`, `ease-spring`.

### 1.2 Añadir tras el bloque `body { … }`

```css
/* Foco visible consistente en toda la app */
:focus-visible {
  outline: 2px solid var(--color-tz-black);
  outline-offset: 2px;
  border-radius: 4px;
}
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: none; /* estos usan ring propio en las primitivas */
}

/* Scrollbar sobrio */
* { scrollbar-width: thin; scrollbar-color: var(--color-tz-linen) transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-thumb { background: var(--color-tz-linen); border-radius: 999px; }
*::-webkit-scrollbar-thumb:hover { background: var(--color-brand-border-hover); }

/* Cifras alineadas en KPIs y tablas */
.tz-nums { font-variant-numeric: tabular-nums; }

/* Skeleton shimmer */
@keyframes tzShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.tz-skeleton {
  border-radius: 8px;
  background: linear-gradient(90deg, var(--color-tz-sand) 25%, var(--color-tz-bone) 50%, var(--color-tz-sand) 75%);
  background-size: 200% 100%;
  animation: tzShimmer 1.6s ease-in-out infinite;
}

/* Entrada genérica de página (aplicar al wrapper raíz de cada page) */
.tz-page { animation: tzFadeUp 0.45s var(--ease-out-soft) both; }

/* Accesibilidad: desactivar todo el motion si el usuario lo pide */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 1.3 Fuente con `next/font`

En `src/app/layout.tsx`, sustituir los `<link>` de Google Fonts por `next/font/google` (Poppins 400/500/600/700, `variable: "--font-poppins"`, `display: "swap"`; snippet en `docs/BRANDING.md` §3). Aplicar la variable en `<html className={poppins.variable}>` y en `globals.css` cambiar `--font-sans` / `--font-display` a `var(--font-poppins), system-ui, sans-serif`. Elimina el comentario de eslint-disable del layout. Verificar en la guía de fuentes de `node_modules/next/dist/docs/` la API exacta de esta versión.

---

## Fase 2 — Primitivas UI (`src/components/ui/`)

Crear estos archivos. Son la base de todas las pantallas: **a partir de aquí, ninguna página define botones/inputs/badges ad-hoc**.

### 2.1 `src/components/ui/button.tsx` (server-compatible, sin hooks)

```tsx
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-tz-black text-tz-bone hover:bg-brand-ink-soft shadow-card hover:shadow-hover",
  secondary:
    "bg-white text-brand-text border border-brand-border hover:border-brand-ink hover:bg-tz-bone",
  ghost: "bg-transparent text-brand-text-2 hover:bg-tz-linen/40",
  danger: "bg-critical text-white hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-control",
  lg: "px-6 py-3 text-[15px] rounded-control",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,border-color,box-shadow,transform,opacity] duration-200 ease-out-soft active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...props}
    />
  );
}
```

Añadir también en el mismo archivo `ButtonSpinner` (un `<span>` de 14px con `border-2 border-current border-t-transparent rounded-full animate-spin`) para estados `loading` — el llamador lo mete como child cuando `pending`.

### 2.2 `src/components/ui/badge.tsx`

Pills tonales (fondo suave + texto oscuro del mismo tono, **nunca** fondo sólido con texto blanco pequeño):

```tsx
import clsx from "clsx";

export type BadgeTone =
  | "good" | "warning" | "critical" | "trial" | "prospect" | "neutral";

const TONE: Record<BadgeTone, string> = {
  good: "bg-good-bg text-good",
  warning: "bg-warning-bg text-warning-text",
  critical: "bg-critical-bg text-critical",
  trial: "bg-trial-bg text-trial",
  prospect: "bg-prospect-bg text-prospect",
  neutral: "bg-neutral-bg text-neutral",
};

export function Badge({
  tone = "neutral",
  dot = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em]",
        TONE[tone],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
```

Añadir en `src/lib/chart-colors.ts` un mapa `MEMBER_STATE_TONE: Record<MemberState, BadgeTone>` (`ACTIVE→good`, `DELINQUENT→critical`, `FROZEN→warning`, `TRIAL→trial`, `PROSPECT→prospect`, `CANCELLED→neutral`) y usarlo en todas las páginas que hoy pintan el estado con `style={{ backgroundColor: … }}`.

### 2.3 `src/components/ui/field.tsx`

`Field` (label + children + hint/error opcional), `Input` y `Select` con estilo unificado:

```tsx
const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";
```

Label: `block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5`.

### 2.4 `src/components/ui/table.tsx`

`TableShell` (wrapper `bg-brand-card border border-brand-border rounded-card overflow-hidden shadow-card`), `THead` (`bg-tz-bone/60 text-brand-muted text-[11px] font-bold uppercase tracking-[0.08em]`, celdas `px-5 py-3 text-left`), y `TRow` (`border-t border-tz-sand transition-colors duration-150 hover:bg-tz-bone/70`). Celdas de datos: `px-5 py-3.5`.

### 2.5 `src/components/ui/empty-state.tsx`

Bloque centrado: icono/isotipo en círculo `bg-tz-sand`, título `font-display font-bold text-brand-text`, descripción `text-sm text-brand-muted`, acción opcional (`Button`). Padding `py-16`. Usar en toda lista/tabla que pueda quedar vacía.

### 2.6 `src/components/ui/skeleton.tsx`

`<Skeleton className="h-4 w-32" />` → `<div className={clsx("tz-skeleton", className)} />`. Además `SkeletonCard` (card con 3 líneas) y `SkeletonTable` (cabecera + 6 filas) para los `loading.tsx`.

### 2.7 `src/components/ui/page-header.tsx`

Para subtítulos/intros dentro de una página (el título principal ya lo pone `header.tsx`): kicker uppercase pequeño con tracking amplio + descripción `text-sm text-brand-muted max-w-2xl` + slot `actions` a la derecha. **Regla**: eliminar los `<h1>` locales que repiten el título de la ruta (p. ej. `members/page.tsx`, `retention/page.tsx`) y sustituirlos por `PageHeader` solo cuando aporte contexto (contador de resultados, descripción, CTA).

---

## Fase 3 — Refactor por pantalla

Aplicar en cada página: wrapper raíz con `tz-page`, primitivas de Fase 2, `tz-nums` en columnas numéricas, empty states, y stagger de entrada solo en los primeros 6 elementos (delays 0.04–0.34 s como ya hace `dashboard`).

### 3.1 `src/app/(app)/members/page.tsx`
- Quitar el `<h1>Socios</h1>`; usar `PageHeader` con contador de resultados y descripción corta.
- Formulario de filtros → `Toolbar`: card `bg-brand-card border border-brand-border rounded-card p-3 shadow-card` con `Input` (búsqueda), `Select` (estado) y `Button` de Fase 2. Bonus: los filtros de estado como fila de chips clicables (links con `?state=X`) usando `Badge` — el activo con `ring-1 ring-current`.
- Tabla → `TableShell/THead/TRow`. Columna Socio con avatar de iniciales (`w-9 h-9 rounded-full bg-tz-sand text-brand-text-2 font-display font-bold text-xs flex items-center justify-center`). Estado con `Badge` + `MEMBER_STATE_TONE` (eliminar el `style backgroundColor`). Fecha y plan con `tz-nums`.
- Fila completa clicable (envolver contenido o `relative` + link overlay), con `group` y flecha `→` que aparece al hover (`opacity-0 group-hover:opacity-100 transition-opacity`).
- `EmptyState` si `members.length === 0` ("Sin resultados con estos filtros").

### 3.2 `src/app/(app)/members/[id]/page.tsx` + `tabs.tsx`
- Cabecera del socio como "hero" claro: card `rounded-card` con avatar grande, nombre en `font-display font-extrabold text-2xl uppercase`, `Badge` de estado y metadatos (centro, alta) en fila de `text-sm text-brand-muted`.
- Tabs: contenedor `inline-flex gap-1 bg-tz-sand rounded-pill p-1`; cada tab `rounded-pill px-4 py-2 text-sm font-semibold transition-colors duration-200`; activa `bg-tz-black text-tz-bone shadow-card`, inactiva `text-text-2 hover:bg-tz-linen/50`. Al cambiar de tab, animar el contenido con `tz-fade-up` (re-montar con `key={activeTab}`).

### 3.3 `src/app/(app)/retention/page.tsx` + `alert-actions.tsx`
- Quitar `<h1>`; `PageHeader` con la descripción del ROI.
- Tarjetas de alerta: mantener fondo tonal por riesgo pero elevarlas: `rounded-card border p-5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-hover`; borde tonal (`border-critical/20` etc. — añadir tokens si hace falta). Nivel de riesgo con `Badge` (`HIGH→critical`, `MEDIUM→warning`, `LOW→neutral`) en lugar de texto plano.
- Métricas de frecuencia (línea base vs. reciente) como mini-comparativa visual: dos cifras `tz-nums font-display font-bold` con flecha y el `%` de caída en `Badge critical`.
- Botones de `alert-actions.tsx` → `Button` (`secondary` y `ghost`), con `ButtonSpinner` durante `useTransition` pending y micro-confirmación al completar (texto "✓ Guardado" 1.5 s).

### 3.4 `src/app/(app)/brief/…` (`page.tsx`, `[id]/page.tsx`, `brief-card.tsx`)
- Sustituir los emojis 🔴🟡⚪🟢 del semáforo por un indicador propio: `<span>` circular de 12px con el color semántico (`bg-critical` / `bg-warning` / `bg-good` / `bg-neutral`) dentro de un botón `rounded-full border border-brand-border p-2 hover:bg-tz-bone transition-colors` con `aria-label={style.label}`.
- Card del roster: `rounded-card`, `shadow-card`, hover lift sutil. El panel expandible de salud debe animarse: usar grid-rows trick (`grid transition-[grid-template-rows] duration-300 ease-out-soft` + `grid-rows-[0fr]`→`grid-rows-[1fr]` con inner `overflow-hidden`).
- Botones de debrief (sensaciones) como segmented control: fila de `rounded-pill` que al seleccionarse pasa a `bg-tz-black text-tz-bone` con `transition-colors` + `active:scale-95`; mostrar `ButtonSpinner` mientras `pending`.
- Badges "Nuevo"/"Moroso" → `Badge` (`trial` y `critical`).

### 3.5 Agenda (`agenda/page.tsx`, `calendar-view.tsx`, `calendar.css`, `center-switcher.tsx`, `session/[id]/…`)
- Reescribir `calendar.css` para tematizar `react-big-calendar` por completo con los tokens (usar `var(--color-…)`):
  - `.rbc-calendar` fondo transparente, `font-family` heredada; `.rbc-header` uppercase 11px `letter-spacing .08em` color muted, `padding 10px`, sin borde inferior duro (`border-color: var(--color-tz-sand)`).
  - Todos los bordes internos (`.rbc-time-content`, `.rbc-day-bg`, `.rbc-month-view`, `.rbc-time-view`, `.rbc-timeslot-group`) → `var(--color-tz-sand)`; contenedor exterior sin borde (lo pone el card wrapper).
  - `.rbc-today` → `var(--color-trial-bg)`; indicador de hora actual `.rbc-current-time-indicator` → `var(--color-critical)`, 2px.
  - `.rbc-event`: `background: var(--color-tz-black); color: var(--color-tz-bone); border: none; border-radius: 8px; padding: 4px 8px; font-size: 12px; font-weight: 600; box-shadow: var(--shadow-card); transition: transform .15s, box-shadow .15s;` y `.rbc-event:hover { transform: translateY(-1px); box-shadow: var(--shadow-hover); }`. `.rbc-event.rbc-selected` → `outline: 2px solid var(--color-brand-border-hover)`.
  - `.rbc-toolbar`: botones = estilo `Button secondary` (replicar clases en CSS), activo = negro; separación `margin-bottom: 16px`; label del mes `font-weight: 700; text-transform: uppercase; letter-spacing: .02em`.
- Envolver el calendario en un card (`bg-brand-card border border-brand-border rounded-card p-4 shadow-card tz-fade-up`).
- `center-switcher.tsx` → `Select` de Fase 2 o pills segmentadas como las tabs de 3.2.
- `session/[id]`: roster con cards de Fase 2; `checkin-button.tsx` → `Button` con pending spinner y estado final "✓ Asistió" en tono `good` (no revertir al hacer hover).

### 3.6 `src/app/(app)/billing/page.tsx` + `payment-form.tsx`
- Tabla de recibos → `TableShell`; importes `tz-nums text-right font-semibold`; estado del pago con `Badge` (`PAID→good`, `FAILED→critical`, `PENDING→warning`, `REFUNDED→neutral`).
- `payment-form.tsx` → `Field/Input/Select/Button`; feedback de éxito/error inline con `tz-fade-up` (banner tonal `rounded-control` `bg-good-bg text-good` / `bg-critical-bg text-critical`).

### 3.7 `src/app/(app)/audit/page.tsx`
- `TableShell`; tipo de evento con `Badge neutral`; timestamps `tz-nums text-brand-muted text-xs`; `EmptyState` sin registros. Considerar agrupación visual por día (fila separadora `bg-tz-bone/60 text-[11px] uppercase tracking-wide text-brand-muted`).

### 3.8 `src/app/(app)/health/aptitude-rules/…`
- Lista de reglas como cards o `TableShell`; semáforo de la regla con el indicador de punto de 3.4; `delete-button.tsx` → `Button variant="danger" size="sm"` con confirmación (dos pasos: "Eliminar" → "¿Seguro? Confirmar" con timeout de 3 s, en vez de `window.confirm` si lo hubiera).

### 3.9 `src/app/login/…` (`page.tsx`, `login-form.tsx`)
La primera impresión — máxima prioridad visual:
- Layout split: panel izquierdo `bg-tz-black` (desktop) con logo negativo (`/brand/`, versión hueso), un claim corto en `font-display font-extrabold text-4xl uppercase text-tz-bone` y las dos medias lunas del isotipo como forma decorativa grande semirrecortada (círculos `bg-brand-ink-soft`, como el hero del portal). Panel derecho: formulario centrado `max-w-sm` sobre `bg-tz-bone`, entrada con `tz-fade-up`.
- Formulario: `Field/Input/Button` de Fase 2; botón submit `size="lg"` full-width con spinner en pending; error con shake sutil (keyframe `tzShake`: translateX ±4px, 300 ms) + banner `bg-critical-bg text-critical rounded-control px-3 py-2`.
- Demo users: cards con stagger `tzNavIn` (delays incrementales), hover `hover:border-brand-ink hover:-translate-y-0.5 hover:shadow-card`, e iniciales de avatar a la izquierda.
- Botón Microsoft deshabilitado: mantener, con `opacity-60` y tooltip nativo actual.

### 3.10 Portal (`portal/page.tsx`, `portal/agenda/…`) — ya es la referencia
- Retoques: `booking-button.tsx` → `Button` con pending/success; lista de clases reservables como cards con hover lift; hero existente: añadir un segundo círculo decorativo más pequeño (`bg-brand-border-dark/40`) para profundidad.

### 3.11 Skeletons de ruta (`loading.tsx`)
Crear `loading.tsx` junto a cada `page.tsx` de: `dashboard`, `members`, `agenda`, `retention`, `billing`, `brief`, `portal`. Cada uno replica el layout de su página con `SkeletonCard`/`SkeletonTable` (p. ej. dashboard: fila de 6 cards + 2 bloques grandes). Verificar la convención exacta de `loading.tsx` en `node_modules/next/dist/docs/` antes de crearlos.

---

## Fase 4 — Sistema de motion (especificación transversal)

| Caso | Receta |
|---|---|
| Entrada de página | wrapper con `tz-page` (0.45 s) |
| Stagger de cards/filas | `tz-fade-up` + delays 0.04 s incrementales, **máx. 6 elementos**; el resto sin delay |
| Hover en cards | `hover:-translate-y-0.5` a `-translate-y-[3px]` + `hover:shadow-hover`, 200 ms `ease-out-soft` |
| Botones | `active:scale-[0.97]`, transición 200 ms |
| Hover filas de tabla | solo `background-color`, 150 ms (sin translate) |
| Dropdowns/paneles | `tz-fade-up` a 0.2 s o grid-rows trick (3.4) |
| Charts (recharts) | `animationDuration={700}` `animationEasing="ease-out"`; tooltips con `wrapperStyle` acorde a card (`border-radius: 12px`, `border: 1px solid var(--color-brand-border)`, `box-shadow: var(--shadow-hover)`) |
| Feedback de acción | pending → spinner; éxito → check + tono `good` 1.5 s; error → banner tonal + shake |

Prohibido: parallax, animaciones en loop infinito (salvo spinner/skeleton), delays > 0.5 s, animar layout.

---

## Fase 5 — Accesibilidad y QA final

1. **Contraste**: verificar AA en todos los pares badge (texto ≥ 4.5:1 sobre su `-bg`). Los tokens actuales cumplen; no aclarar los tonos.
2. **Foco**: recorrer con Tab cada pantalla; todo interactivo debe mostrar el outline de Fase 1 o un ring propio.
3. **Botones icono** (semáforo de brief, cerrar, etc.): `aria-label` obligatorio.
4. **Targets táctiles**: mínimo 40×40 px en botones del portal (los socios lo usan en móvil).
5. **Reduced motion**: activar la preferencia del SO y comprobar que la app queda estática pero funcional.
6. **QA visual por rol**: entrar con los 5 usuarios demo (`login-form.tsx`) y revisar cada ruta de su navegación. Comprobar: sin `<h1>` duplicados, sin emojis de semáforo, sin `style backgroundColor` para estados, tablas y formularios usando primitivas, `loading.tsx` visible al navegar.
7. `npm run lint` y `npm run build` en verde.

---

## Orden de commits sugerido

1. `feat(ui): design tokens, motion base y focus/reduced-motion global` (Fase 1)
2. `feat(ui): primitivas Button, Badge, Field, Table, EmptyState, Skeleton, PageHeader` (Fase 2)
3. `refactor(ui): members + retention con primitivas premium` (3.1–3.3)
4. `refactor(ui): brief + agenda (tema react-big-calendar)` (3.4–3.5)
5. `refactor(ui): billing, audit, health` (3.6–3.8)
6. `refactor(ui): login premium + retoques portal` (3.9–3.10)
7. `feat(ui): skeletons de ruta (loading.tsx)` (3.11)
8. `polish(ui): motion transversal + fixes de accesibilidad` (Fases 4–5)
