# 07 · Panel de dirección y analítica

Pantallas: `/dashboard`, `/mapa-barrios`, `/billing/contabilidad`. Descripción
funcional en [CRM_Y_MARKETING.md](../CRM_Y_MARKETING.md) §6. La analítica avanzada
va gateada por plan, pero **nunca se ocultan los datos propios del gimnasio ni
su exportación** (`RB-PLAN-003`).

## Cómo se leen las cifras (definiciones vigentes, sin número `RB`)

Son definiciones de negocio aunque no tengan número. Si se quieren cambiar,
se numeran primero.

| Cifra | Definición | Desde |
|---|---|---|
| **Periodos** | Hoy, semana, mes y año (desde el inicio del periodo hasta ahora); 3 y 6 meses (móviles); personalizado. La comparación es contra el tramo anterior con los mismos días transcurridos | E14-06 |
| **Ingresos** | Solo lo **cobrado** en el periodo. El dinero en vuelo (SEPA sin liquidar) se enseña aparte, nunca sumado | E14-03 |
| **Desglose de ingresos** | Alta nueva (primer cobro de una suscripción) · renovación (los siguientes) · **baja**: la cuota mensual que se va con los socios que causaron baja ese mes, en negativo y aparte de la caja | Lote 3 |
| **Plazas vendidas** | Reservas sobre aforo. No es "ocupación": la asistencia real es otra cifra y se enseñan las dos | E14-02 |
| **Objetivo de ocupación** | **75 %**, fijo en código | `src/lib/dashboard-targets.ts` |
| **Permanencia** | Meses medios que se queda un socio, contando a los que siguen (método Kaplan-Meier) | E14-05 |
| **Objetivo de permanencia** | **25 meses**, fijo en código. No se compara mientras el negocio no lleve 25 meses abierto | `src/lib/dashboard-targets.ts` |
| **Frase del día** | No afirma subidas o bajadas de ingresos con menos de una muestra mínima de cobros | E14-04 |

> Los dos objetivos (75 % y 25 meses) son de negocio pero están escritos en el
> código y son iguales para todas las organizaciones. Ver [P-06](./PENDIENTES_DE_DECIDIR.md#p-06).

## Reglas

### RB-BI-001 · Operativos

**Estado:** 🟢 Vigente — ocupación (plazas vendidas y asistencia) y sesiones por semana.

### RB-BI-002 · LTV y ticket medio

**Estado:** 🟢 Vigente — lo que deja un socio y cuánto se queda (con la permanencia de arriba).

### RB-BI-003 · Demografía y nicho

**Estado:** 🟢 Vigente — edad media, ocupaciones más frecuentes, % con hijos, % empresarios.

### RB-BI-004 · Objetivos agregados

**Estado:** 🟢 Vigente — cuántos socios cambiaron su objetivo, se ven estancados o piden más en el último check-in (`RB-IA-006`).

### RB-BI-005 · Sexo

**Estado:** 🟢 Vigente — reparto por sexo. Dato opcional ("prefiero no decirlo"), heredado del lead.

### RB-BI-006 · Edad por franjas

**Estado:** 🟢 Vigente — 18-25, 25-35, 35-45, 45-55, 55-65, 65+.

### RB-BI-007 · Socios por servicio

**Estado:** 🟢 Vigente — socios activos por plan contratado.

### RB-BI-008 · Cómo nos han conocido

**Estado:** 🟢 Vigente — leads **captados en el periodo** por canal, cruzado con cuáles cierran.

### RB-BI-009 · Tasa de cierre

**Estado:** 🟢 Vigente — embudo de leads y % cerrado / no cerrado.

### RB-BI-010 · Servicio más vendido

**Estado:** 🟢 Vigente — ranking por **número de altas** en el periodo (por defecto) y por ingresos.

### RB-BI-011 · Ranking de socios

**Estado:** 🟢 Vigente

Puntuación 0-100: **50 % lo que ha pagado, 30 % adherencia** (asistencias sobre
reservas de los últimos 90 días) **y 20 % antigüedad**. No sigue al selector de
periodo, a propósito: mide la relación entera.

### RB-BI-023 · Exportación contable para la gestoría

**Estado:** 🟢 Vigente · **Decisión:** D-S8

Extracto de cobros descargable, que dice en su cabecera que **no es un libro de
facturas** (`RB-VENTA-006`).

### Mapa de barrios (`RB-LEAD-010`)

**Estado:** 🟢 Vigente — leads y socios por código postal y por ciudad, con el
mismo periodo y estado que el resto del panel, y tabla exportable.
