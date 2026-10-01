# Reglas de negocio · catálogo `RB-*`

Este es **el sitio donde negocio escribe cómo debe comportarse el producto**.
Cada regla tiene un código (`RB-<DOMINIO>-<NNN>`), un enunciado en lenguaje de
negocio y un estado que dice si el código la cumple hoy. El código fuente cita
las reglas por su código, así que una regla bien numerada es la forma de que
una decisión de negocio llegue a producción sin perderse por el camino.

> **Punto de partida (01-10-2026).** Este catálogo sustituye a
> `docs/CRM_REGLAS_NEGOCIO.md`, que solo recogía 58 de las ~110 reglas que el
> código cita y describía varias de forma ya obsoleta. Se ha reconstruido
> leyendo el código de la rama `release`: lo que dice el estado de cada regla
> es lo que hace la aplicación hoy, no lo que se pidió en su día. Cuando
> código y regla no coinciden y hace falta que negocio decida, está en
> [PENDIENTES_DE_DECIDIR.md](./PENDIENTES_DE_DECIDIR.md).

## Ficheros

| Fichero | Dominio | Prefijos |
|---|---|---|
| [01-leads-y-captacion.md](./01-leads-y-captacion.md) | Embudo comercial, leads, referidos | `RB-LEAD` |
| [02-socios.md](./02-socios.md) | Ficha del socio, servicios, objetivos, listado | `RB-PERFIL`, `RB-VISTA` |
| [03-agenda-y-reservas.md](./03-agenda-y-reservas.md) | Agenda, EP y grupos, reservas, cancelación, no-show, recordatorios | `RB-AGENDA`, `RB-RES` |
| [04-cobros-y-bonos.md](./04-cobros-y-bonos.md) | Cobro a socios, cuotas, bonos, Stripe Connect, catálogo de productos | `RB-PAGO`, `RB-VENTA`, `RB-CONNECT` |
| [05-salud-ia-y-seguimiento.md](./05-salud-ia-y-seguimiento.md) | Salud y aptitud, IA, mesociclos, autovaloraciones, feedback | `RB-SALUD`, `RB-IA`, `RB-MESO`, `RB-FB` |
| [06-equipo-y-tareas.md](./06-equipo-y-tareas.md) | Personal, ventas por trabajador, alertas al entrenador, tareas | `RB-RRHH`, `RB-TASK` |
| [07-panel-y-analitica.md](./07-panel-y-analitica.md) | Panel de dirección e indicadores | `RB-BI` |
| [08-comunicacion.md](./08-comunicacion.md) | Chat, anuncios, correo, marca del remitente | `RB-CHAT`, `RB-ANUN`, `RB-MARCA`, `RB-SMTP` |
| [09-plataforma-y-acceso.md](./09-plataforma-y-acceso.md) | Licencia de Apta, planes, alta de un gimnasio, identidad, seguridad, datos | `RB-PLAT`, `RB-PLAN`, `RB-ALTA`, `RB-ID`, `RB-SEG`, `RB-DATOS` |
| [PENDIENTES_DE_DECIDIR.md](./PENDIENTES_DE_DECIDIR.md) | Contradicciones entre regla y código, y preguntas abiertas | — |
| [PLANTILLA_REGLA.md](./PLANTILLA_REGLA.md) | Plantilla para escribir una regla nueva | — |

El procedimiento para trabajar estas reglas con Claude Code está en
[COMO_TRABAJAR_LAS_REGLAS.md](./COMO_TRABAJAR_LAS_REGLAS.md).

## Estados

| Estado | Significa | Quién lo pone |
|---|---|---|
| 📝 **Propuesta** | Negocio la ha escrito; nadie la ha aprobado ni construido | Negocio |
| ✅ **Aprobada** | Dirección la ha aprobado; falta construirla o cambiar el código | Negocio (dirección) |
| 🟢 **Vigente** | El código la cumple. Es la descripción de lo que hace la aplicación | Desarrollo, al mezclar el cambio |
| 🟡 **Parcial** | El código cumple una parte; la nota dice cuál falta | Desarrollo |
| ⚠️ **En conflicto** | Código y regla dicen cosas distintas. Tiene entrada en `PENDIENTES_DE_DECIDIR.md` | Quien lo detecta |
| ⏸️ **Apagada** | Decidida y en su día construida, pero la funcionalidad está apagada a propósito | Negocio |
| 🗑️ **Retirada** | Ya no aplica. Se conserva tachada como registro; su número no se reutiliza | Negocio |

Una regla **nunca pasa a 🟢 Vigente en el mismo cambio en que negocio la
escribe**: pasa cuando el código que la cumple está mezclado en `release`.

## Formato de una regla

```markdown
### RB-AGENDA-011 · Título corto que se entienda sin leer el resto

**Estado:** 📝 Propuesta · **Decisión:** dirección, 01-10-2026 · **Sustituye a:** —

Enunciado en lenguaje de negocio: quién, qué, cuándo y qué pasa si no se cumple.
Con números concretos (horas, días, umbrales), nunca "un tiempo razonable".

- **Excepciones:** …
- **Ejemplo:** …

**Dónde vive:** `src/...` (lo rellena desarrollo)
```

Reglas de redacción:

1. **Una regla, una decisión.** Si el enunciado lleva un "y además", son dos.
2. **Números, no adjetivos.** "24 horas", "4 sesiones", "7 días configurables por centro".
3. **Di si es configurable y por quién** (organización, centro, servicio) y cuál es el valor por defecto.
4. **No se reutilizan números.** Una regla retirada se tacha y se deja; la nueva coge el siguiente libre.
5. **No se duplica el enunciado.** El resto de documentos y el código citan el código `RB-*`; no copian el texto.
6. **Cambiar una regla vigente** se hace editando su enunciado y poniéndola en ✅ Aprobada (o 📝 Propuesta), con una línea `**Antes:**` que diga qué decía. El historial de git guarda el resto.

## Siguiente número libre por prefijo

Compruébalo siempre con `grep -rhoE "RB-AGENDA-[0-9]+" docs src | sort -u | tail -1`
(cambiando el prefijo): el código también cita reglas. A 01-10-2026:

| Prefijo | Último usado | Prefijo | Último usado |
|---|---|---|---|
| `RB-LEAD` | 011 | `RB-RRHH` | 014 |
| `RB-PERFIL` | 004 | `RB-TASK` | 003 |
| `RB-VISTA` | 001 | `RB-BI` | 023 |
| `RB-AGENDA` | 010 | `RB-CHAT` | 001 |
| `RB-RES` | 013 | `RB-ANUN` | 003 |
| `RB-PAGO` | 028 | `RB-MARCA` | 001 |
| `RB-VENTA` | 008 | `RB-SMTP` | 001 |
| `RB-CONNECT` | 004 | `RB-PLAT` | 009 |
| `RB-SALUD` | 014 | `RB-PLAN` | 003 |
| `RB-IA` | 007 | `RB-ALTA` | 003 |
| `RB-MESO` | 005 | `RB-ID` | 005 |
| `RB-FB` | 104 | `RB-SEG` | 006 |
| | | `RB-DATOS` | 001 |

## Lo que este catálogo NO es

- **No son las historias de usuario.** `docs/hu/` es material de trabajo de
  desarrollo (cómo y en qué orden se construye). Una historia *implementa* una
  o varias reglas; la regla es el *qué*.
- **No es la descripción de pantallas.** Eso está en `docs/PRODUCTO_*.md`, que
  citan estas reglas.
- **No es la metodología de entrenamiento.** Esa vive en
  `src/lib/ai/methodology/*.md` porque la IA la lee en tiempo de ejecución:
  cambiarla cambia el comportamiento de la aplicación al instante y pasa por
  revisión de desarrollo igual que el código.
