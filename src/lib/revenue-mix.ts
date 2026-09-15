/**
 * M4 · Ingresos separados por concepto.
 *
 * ESTE FICHERO LO DEJA PUESTO S2 Y LO LLENA M4.
 *
 * `Payment` NO TIENE CAMPO DE CONCEPTO Y NO SE LE VA A AÑADIR: sí tiene
 * `subscriptionId`, y de ahí se deriva todo.
 *
 *   ALTA NUEVA   — primer cobro de una suscripción.
 *   RENOVACIÓN   — los siguientes de la misma suscripción.
 *   SIN SUSCRIPCIÓN — los cobros con `subscriptionId` null (bonos sueltos,
 *                  drop-in, venta de mostrador). Son una CUARTA categoría, no
 *                  un hueco. Míralos: son más de los que parece.
 *   BAJA         — y esta no es caja.
 *
 * «BAJA» ES INGRESO PERDIDO, decisión 3 del plan y cerrada: la cuota mensual
 * que se va con los socios que causaron baja en la ventana, EN NEGATIVO. No es
 * caja, no está en Stripe y nadie la debe sumar a los ingresos. Se pinta APARTE
 * y rotulada como lo que es. Es lo que contesta si el mes se sostiene.
 *
 * Respeta `DashboardOpts` entero, ámbito de centro incluido, y usa las MISMAS
 * definiciones que `dashboard-queries.ts` para lo que ya existe: qué cuenta
 * como cobrado y cómo se acota la ventana. Si el total no cuadra con la card de
 * ingresos del panel, uno de los dos está mal y hay que decirlo, no taparlo con
 * un redondeo.
 *
 * La card se entrega en `src/app/(app)/dashboard/revenue-mix-card.tsx`. M1 la
 * monta en `panels.tsx`: M4 no toca ese fichero.
 *
 * ---------------------------------------------------------------------------
 * LO QUE FALTA POR ESCRIBIR, con la forma acordada
 * ---------------------------------------------------------------------------
 *
 *   classifyPayment(payment, earlierPaymentsOfSubscription): RevenueConcept
 *     Aritmética pura: se prueba SIN base de datos, con los casos raros dentro
 *     (dos suscripciones a la vez del mismo socio, socio que se va y vuelve,
 *     socio importado sin histórico de cobros).
 *
 *   getRevenueMix(opts: DashboardOpts): Promise<RevenueMix>
 *     Las cuatro líneas de arriba más la baja, con su total y su comparativa.
 */

export {};
