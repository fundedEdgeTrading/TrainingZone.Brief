# P2 → P1 · cambios pedidos en `src/lib/member-billing.ts`

> **Para la ventana de merge.** `src/lib/member-billing.ts` es de la pista P1.
> P2 no lo ha tocado. **HU-ST-20** (reembolsos reales, decisión D-S7) abre un
> camino que ese módulo todavía no contempla —un `Payment` puede estar
> DEVUELTO— y hay un punto en el que eso se pierde. Está escrito aquí para que
> se aplique mecánicamente, sin reconstruir el razonamiento.
>
> Todo lo demás de HU-ST-20 —emisión del refund, nota de crédito, prorrateo,
> permisos, ámbito de centro, conciliación de `charge.refunded` y
> `credit_note.*`, pantalla— está hecho y vive en `src/lib/stripe-refunds.ts` y
> en `src/app/(app)/billing/reembolsos/`. Este es el único punto que cae fuera.

---

## 1 · `reconcileMemberInvoicePaid` resucita un cobro ya devuelto

**Es el único cambio imprescindible.**

Estado actual (`member-billing.ts`, dentro de `reconcileMemberInvoicePaid`):

```ts
const already = await prisma.payment.findUnique({
  where: { stripeInvoiceId: invoice.id },
  select: { id: true, status: true },
});
// …
if (already?.status === "PAID") return { ok: true };
```

y más abajo, cuando `already` existe pero no estaba en PAID:

```ts
await prisma.payment.update({
  where: { id: already.id },
  data: {
    status: "PAID",
    amountCents: invoice.amount_paid,
    date: new Date(),
    notes: "Factura recurrente Stripe (cobrada tras un intento fallido)",
  },
});
```

La salida temprana solo reconoce `PAID`, y hace bien mientras los estados
posibles sean PAID / PENDING / FAILED: una fila en FAILED es el dunning de
Stripe reintentando LA MISMA factura, y ese `invoice.paid` es el cobro que por
fin entra.

Desde HU-ST-20 hay un cuarto estado en juego. Con una devolución emitida, la
fila queda en **REFUNDED**, y `REFUNDED !== "PAID"`, así que la función sigue
adelante y **vuelve a marcar el cobro como PAID**. La devolución desaparece del
estado: el importe devuelto y el motivo siguen en sus columnas, pero el cobro
figura cobrado, el socio aparece al corriente y el panel vuelve a contar un
ingreso que ya no está.

Ocurre de verdad, con dos entregas reales de Stripe:

1. Una reentrega de `invoice.paid` (Stripe reintenta lo que no responde 200 a la
   primera, y también reenvía eventos antiguos desde el Dashboard).
2. El orden de llegada: `charge.refunded` puede adelantar a `invoice.paid`
   cuando la devolución se emite el mismo día del cobro (baja inmediata, cobro
   duplicado corregido en el momento).

### Cambio

Tratar REFUNDED como lo que es —un estado terminal, no un intento fallido— en la
salida temprana:

```ts
const already = await prisma.payment.findUnique({
  where: { stripeInvoiceId: invoice.id },
  select: { id: true, status: true },
});
// HU-ST-20: PAID es una reentrega del mismo evento; REFUNDED es un cobro que YA
// se devolvió (desde `/billing/reembolsos` o desde el Dashboard de Stripe) y que
// este `invoice.paid` tardío no puede resucitar. Solo FAILED/PENDING significan
// "el dunning reintentó y por fin entró".
if (already?.status === "PAID" || already?.status === "REFUNDED") return { ok: true };
```

Es una sola condición y no cambia nada de lo que hoy funciona: con los tres
estados anteriores el comportamiento es idéntico.

### Cómo comprobar que quedó bien

En el fichero de pruebas de P1, con la factura ya conciliada:

1. `Payment` en REFUNDED con `refundedAmountCents` puesto → un `invoice.paid`
   de la misma factura lo deja en REFUNDED, con su `refundedAmountCents` y su
   `refundReason` intactos.
2. `Payment` en FAILED → un `invoice.paid` lo sigue pasando a PAID y reactivando
   la suscripción (el caso que la salida temprana protege hoy).

---

## 2 · Opcional · el socio de un cobro devuelto no debería quedar ACTIVE por inercia

No bloquea a HU-ST-20 y **no hace falta para cerrarla**; se apunta porque se ve
desde aquí y es de P1.

`reconcileMemberInvoicePaid` devuelve al socio a ACTIVE si estaba DELINQUENT.
Con el cambio de arriba, un `invoice.paid` tardío sobre un cobro devuelto ya no
llega a esa línea, que es lo correcto. Lo que queda fuera del alcance de P2 es la
pregunta inversa: **devolver la cuota de un socio activo no cambia hoy su estado
ni su suscripción**. Puede ser lo que se quiere (una devolución parcial por una
clase perdida no da de baja a nadie), pero para una devolución TOTAL de la última
cuota probablemente no lo sea.

P2 no lo decide ni lo implementa: es política de altas y bajas, y vive en P1.

---

## Anexo · dos ficheros de `/billing` que P2 sí ha tocado, y por qué

No son de ninguna pista declarada y los cambios son mínimos. Se listan para que
quien integre los vea venir:

- **`src/app/(app)/billing/subscription-actions.ts`** (`refundPayments`): el
  bloqueo `"Devolución Stripe no disponible: pendiente de credenciales del
  cliente — PAGO-2b"` ya no era cierto. Sigue bloqueando —ese camino es el
  registro local de una devolución de caja y no sabe emitir un refund contra la
  cuenta conectada— pero ahora dice dónde se hace, y cubre también el cobro de
  factura recurrente (`stripeInvoiceId`), que antes se colaba por el flujo local
  y dejaba el recibo diciendo que se devolvió con el dinero aún en Stripe.
- **`src/app/(app)/billing/page.tsx`**: dos enlaces en la cabecera hacia
  `/billing/reembolsos` y `/billing/disputas`, con el mismo `canExport` que ya
  gatea "Exportar cobros" (dirección). Su sitio natural es el menú, pero
  `src/lib/rbac.ts` está congelado este trimestre: cuando se abra, las dos
  pantallas pasan a `NAV_BY_ROLE` y estos enlaces se pueden quitar.
- **`src/lib/stripe-idempotency.ts`**: dos claves nuevas (`refundKey`,
  `creditNoteKey`) y sus filas en el registro, como pide el propio módulo.
  Aditivo, al final del fichero.
- **`src/lib/stripe-webhook-dispatch.test.ts`** (costura de S1): sus objetos de
  prueba daban por hecho que los módulos eran esqueletos. Con
  `stripe-refunds.ts` y `stripe-disputes.ts` ya implementados, un evento cuyo
  `Payment` no existe localmente responde `retry` (500) —que es el contrato que
  el propio S1 documentó— en vez de 200. El `before` siembra ahora un socio y
  dos cobros, los objetos de P2 apuntan a ellos, y los casos llevan
  `implementado: true` para saltar la aserción del log `[<modulo>]`, que era el
  contrato del esqueleto. **Las demás pistas necesitarán lo mismo**: el
  andamiaje ya está puesto.
