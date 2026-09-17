# Branding y sistema de interfaz

Dos cosas en un documento: la **identidad de marca** (§1–§3, extraída del `Manual
de Identidad TZ — Beige, Edición 2025`) y **cómo está implementada** hoy en la web
app y en la app nativa (§4–§6).

Los tokens de este documento son la fuente; `src/app/globals.css` es donde viven
de verdad, y `apps/mobile/src/theme/theme.ts` es su versión portada a la app
nativa (con piel oscura por defecto, que es la decisión propia de la app).

## 1. Logotipo

El logotipo se compone de:
- **Isotipo**: dos medias lunas (símbolo aislado, ver `public/` para el asset).
- **Logotipo**: "Training" (tipografía Archivo) + "Zone" (tipografía Coolvetica, en negrita/condensada).

Assets en `public/brand/`:
- `tz-logo-black.png` — negro sobre fondo claro (uso por defecto).
- `tz-logo-white.png` — hueso sobre fondo oscuro.

En producto, el logo que se pinta **no es siempre el de Training Zone**: el
NavBar muestra el del centro, si no el de la organización, y si ninguno tiene,
el de **Apta**, la marca de la plataforma (`src/components/org-logo.tsx`,
`src/lib/logo-image.ts`). Cada organización sube el suyo desde **Organización**.

### Construcción y proporción
- El logotipo se construye sobre una retícula modular basada en una unidad `X` (altura del isotipo). Todos los márgenes y espaciados del lockup son múltiplos de `X`. No alterar las proporciones relativas entre isotipo y wordmark.

### Área de seguridad
- Margen mínimo alrededor del logotipo: **2X** (equivalente a la altura del isotipo) libre de otros elementos gráficos o texto.
- **Tamaño mínimo impreso**: 3,8 cm de ancho. En digital, aplicar un mínimo equivalente aproximado de **~110px de ancho** para el lockup completo; por debajo de eso, usar solo el isotipo.

### Versiones del logotipo
| Versión | Uso |
|---|---|
| Principal | Negro (`#1D1D1C`) sobre fondo claro (beige/hueso/blanco) |
| Negativa | Hueso (`#F4F0E8`) sobre fondo oscuro |
| Isotipo aislado | Medias lunas solas, para espacios reducidos (favicon, app icon, spinners, watermarks) |

### Sobre fotografías
- Fondo claro → logo en negro.
- Fondo oscuro → logo en versión negativa (hueso).
- Priorizar siempre el máximo contraste y legibilidad.

### Usos incorrectos (no implementar nunca)
- ❌ No deformar (estirar/comprimir el lockup).
- ❌ No recolorear (aplicar colores fuera de negro/hueso, p. ej. tintados de marca de terceros o gradientes).
- ❌ No rotar.
- ❌ No aplicar sobre fondos de bajo contraste.

## 2. Paleta de colores

### Colores corporativos principales

| Nombre | HEX | RGB | CMYK | Pantone | Uso |
|---|---|---|---|---|---|
| Negro | `#1D1D1C` | 29, 29, 28 | 75, 65, 62, 81 | Neutral Black C | Color del logotipo, texto principal, fondo modo oscuro |
| Arena | `#E7DFD2` | 231, 223, 210 | 0, 3, 9, 9 | Por confirmar | Neutro de firma, fondo principal de marca |

### Neutros cálidos (escala beige, base del sistema)

| Nombre | HEX | RGB | CMYK | Uso sugerido |
|---|---|---|---|---|
| Hueso | `#F4F0E8` | 244, 240, 232 | 0, 2, 5, 4 | Fondo más claro / superficie base (equivalente a "background") |
| Arena | `#E7DFD2` | 231, 223, 210 | 0, 3, 9, 9 | Fondo secundario, cards, secciones alternadas |
| Lino | `#D8CCB8` | 216, 204, 184 | 0, 6, 15, 15 | Bordes, separadores, estados hover sobre superficies claras |

> Las referencias Pantone están pendientes de confirmación para producción impresa; no bloquean la implementación digital.

### Tokens implementados (Tailwind v4 · `src/app/globals.css`)

```css
@import "tailwindcss";

:root {
  /* Marca */
  --color-tz-black: #1D1D1C;
  --color-tz-bone: #F4F0E8;
  --color-tz-sand: #E7DFD2;
  --color-tz-linen: #D8CCB8;

  /* Semánticos (modo claro) */
  --background: var(--color-tz-bone);
  --foreground: var(--color-tz-black);
  --surface: var(--color-tz-sand);
  --border: var(--color-tz-linen);
}

@theme inline {
  --color-tz-black: var(--color-tz-black);
  --color-tz-bone: var(--color-tz-bone);
  --color-tz-sand: var(--color-tz-sand);
  --color-tz-linen: var(--color-tz-linen);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-border: var(--border);
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

Sobre esos cuatro, `globals.css` define la familia `brand-*` que es la que usa
el producto (`brand-bg`, `brand-card`, `brand-border`, `brand-text`,
`brand-muted`…) más los tonos de estado —`good`, `warning`, `critical`, `trial`,
`prospect`, `neutral`, `gold`, `info`— cada uno con su pareja `-bg`. **Un estado
nunca se pinta con un `style` en línea**: se usa su tono.

Reglas de Tailwind v4 que no se negocian: los tokens viven en `@theme inline`
dentro de `globals.css` y **no existe `tailwind.config.js`**. Un token
`--color-x` se usa como `bg-x`, `text-x`, `border-x`.

Los colores de gráfica salen de `src/lib/chart-colors.ts`, no se eligen por
pantalla.

## 3. Tipografía

| Tipografía | Peso | Uso |
|---|---|---|
| **Archivo** | Regular | Parte "Training" del logotipo |
| **Coolvetica** | Regular | Parte "Zone" del logotipo (uso exclusivo del lockup, no como tipografía de UI) |
| **Poppins** | Regular / Medium / SemiBold / Bold | Tipografía secundaria: todo el texto de interfaz, títulos, cuerpo, aplicaciones |

**Poppins es la tipografía de producto** (UI, dashboard, formularios, etc.). Archivo y Coolvetica se reservan al lockup del logotipo — no deben usarse como fuente de interfaz.

> ⚠️ **Coolvetica no es una fuente open source/gratuita** (es de uso comercial vía Fontfabric u otros distribuidores). No está disponible en Google Fonts. Si el logotipo se implementa como texto real (no SVG), habrá que licenciar el archivo `.woff2` y auto-hospedarlo; de lo contrario, usar siempre el logotipo como SVG/imagen. Archivo y Poppins sí están disponibles en Google Fonts y se pueden cargar con `next/font/google`.

### Implementación

`src/app/layout.tsx` carga **solo Poppins** con `next/font/google`: Archivo y
Coolvetica pertenecen al lockup del logotipo, que se sirve como imagen, así que
no hay motivo para descargarlas en cada visita.

```ts
// src/app/layout.tsx
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
```

```css
/* globals.css */
body {
  font-family: var(--font-poppins), -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
```

## 4. Estilo visual / layout (observado en el manual)

- **Fondos**: superficies planas en tonos beige (`hueso`/`arena`), sin degradados. El negro se reserva para texto, el logotipo y bloques de contraste (modo oscuro, tarjetas destacadas).
- **Cards/paneles**: esquinas redondeadas generosas (`rounded-2xl`/`rounded-3xl`), sin sombras marcadas, separación por color de fondo más que por bordes.
- **Etiquetas/pills**: pequeñas cápsulas (`rounded-full`) con fondo hueso/negro semitransparente para overlays sobre fotografía (p. ej. "Fondo claro → logo negro").
- **Jerarquía tipográfica**: kicker en mayúsculas con tracking amplio (p. ej. "04 — COLORES CORPORATIVOS") en tamaño pequeño, seguido de un título grande en negrita (Poppins Bold/SemiBold), y texto de cuerpo en gris cálido/negro con peso regular.
- **Fotografía**: imágenes reales del espacio (gimnasio), siempre con el logotipo superpuesto en una esquina inferior, respetando el área de seguridad.

## 5. Sistema de interfaz

### 5.1 Primitivas

Todo lo compartido vive en `src/components/ui/`. Antes de maquetar una pantalla
nueva se mira si ya existe: `button`, `badge`, `field`, `data-table`,
`page-header`, `empty-state`, `skeleton`, `drawer`, `toast`, `confirm-dialog`,
`dropzone`, `filter-toolbar` / `filter-menu` / `filter-rail` / `column-filter`,
`route-progress`, `brand-loader`, `count-up`, `celebrate`, `critical-error`,
`action-form` y `whatsapp-button`.

Cada pantalla tiene su `loading.tsx` con esqueletos: la navegación nunca se
queda en blanco.

### 5.2 Motion

| Caso | Receta |
|---|---|
| Entrada de página | `tz-page` (0,45 s) |
| Stagger de tarjetas o filas | `tz-fade-up` + retardos de 0,04 s, **máximo 6 elementos**; el resto sin retardo |
| Hover en tarjetas | `-translate-y-[3px]` + `shadow-hover`, 200 ms `ease-out-soft` |
| Botones | `active:scale-[0.97]`, 200 ms |
| Hover en filas de tabla | solo `background-color`, 150 ms — sin desplazamiento |
| Desplegables y paneles | `tz-fade-up` a 0,2 s |
| Gráficas | `animationDuration={700}`, `animationEasing="ease-out"`, tooltip con el borde y la sombra de la tarjeta |
| Feedback de acción | pendiente → spinner · éxito → check en tono `good` 1,5 s · error → banner tonal |

**Prohibido:** parallax, animaciones en bucle infinito (salvo spinner y
esqueleto), retardos de más de 0,5 s y animar el layout.

### 5.3 Accesibilidad

Es criterio de aceptación, no un repaso final:

1. **Contraste AA** en todos los pares de badge (texto ≥ 4,5:1 sobre su `-bg`).
   Los tonos actuales cumplen: no se aclaran.
2. **Foco visible** en todo lo interactivo.
3. **`aria-label` obligatorio** en botones de solo icono (semáforo del brief,
   cerrar…).
4. **Objetivo táctil mínimo de 40×40 px** en el portal: los socios lo usan en el
   móvil.
5. **`prefers-reduced-motion`**: con la preferencia activada la aplicación queda
   estática pero plenamente funcional.
6. Sin `<h1>` duplicados y sin emojis haciendo de semáforo.

Hay tests que fijan parte de esto: `data-table-a11y`, `field-a11y`,
`drawer-focus` y `select-required` en `src/components/ui/`.

---

## 6. Resumen rápido de tokens

```
Negro          #1D1D1C
Hueso          #F4F0E8
Arena          #E7DFD2  (color de firma)
Lino           #D8CCB8

Tipografía UI  Poppins
Tipografía logo Archivo ("Training") + Coolvetica ("Zone")

Área seguridad logo: 2X
Tamaño mínimo impreso: 3,8 cm (~110px digital)
```

---
*Identidad: Manual de Identidad TZ — Beige, Edición 2025. Implementación:
`src/app/globals.css`, `src/components/ui/` y `apps/mobile/src/theme/`.*
