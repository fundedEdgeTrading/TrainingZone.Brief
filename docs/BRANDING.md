# Branding — Training Zone

Especificaciones de identidad visual extraídas de `Manual de Identidad TZ — Beige (Edición 2025)`, listas para implementar como tokens de estilo en la aplicación.

## 1. Logotipo

El logotipo se compone de:
- **Isotipo**: dos medias lunas (símbolo aislado, ver `public/` para el asset).
- **Logotipo**: "Training" (tipografía Archivo) + "Zone" (tipografía Coolvetica, en negrita/condensada).

Assets a preparar en `public/brand/`:
- `logo-principal.svg` — negro sobre fondo claro (uso por defecto).
- `logo-negativo.svg` — hueso (`#F4F0E8`) sobre fondo oscuro.
- `isotipo.svg` — solo las medias lunas, para favicon, avatares, loaders, etc.

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

### Tokens CSS sugeridos (Tailwind v4 / `globals.css`)

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

Con esto, en Tailwind se puede usar `bg-tz-sand`, `text-tz-black`, `bg-surface`, `border-border`, etc.

## 3. Tipografía

| Tipografía | Peso | Uso |
|---|---|---|
| **Archivo** | Regular | Parte "Training" del logotipo |
| **Coolvetica** | Regular | Parte "Zone" del logotipo (uso exclusivo del lockup, no como tipografía de UI) |
| **Poppins** | Regular / Medium / SemiBold / Bold | Tipografía secundaria: todo el texto de interfaz, títulos, cuerpo, aplicaciones |

**Poppins es la tipografía de producto** (UI, dashboard, formularios, etc.). Archivo y Coolvetica se reservan al lockup del logotipo — no deben usarse como fuente de interfaz.

> ⚠️ **Coolvetica no es una fuente open source/gratuita** (es de uso comercial vía Fontfabric u otros distribuidores). No está disponible en Google Fonts. Si el logotipo se implementa como texto real (no SVG), habrá que licenciar el archivo `.woff2` y auto-hospedarlo; de lo contrario, usar siempre el logotipo como SVG/imagen. Archivo y Poppins sí están disponibles en Google Fonts y se pueden cargar con `next/font/google`.

### Implementación con `next/font` (sugerido)

```ts
// src/app/layout.tsx
import { Archivo, Poppins } from "next/font/google";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

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

## 5. Resumen rápido de tokens

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
*Fuente: Manual de Identidad TZ — Beige, Edición 2025.*
