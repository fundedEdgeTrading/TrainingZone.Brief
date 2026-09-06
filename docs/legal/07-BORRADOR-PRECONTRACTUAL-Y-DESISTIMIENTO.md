# 07 · Borrador de información precontractual, condiciones y desistimiento

**TRLGDCU (RDL 1/2007), arts. 97, 98 y 102-108** · Para `hazte-socio/[orgSlug]/[centerSlug]`, que hoy es un contrato a distancia con consumidor al que le falta todo esto (§7 CN-07).

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.**

> ### El riesgo aquí es mayor que la multa
>
> **Si no se informa del derecho de desistimiento, el plazo se amplía de 14 días a 12 meses** (art. 105 TRLGDCU). Cualquier socio dado de alta hoy puede deshacer el contrato durante un año y reclamar lo pagado.

## Lo que falta hoy en la página

| Falta | Norma | Historia |
|---|---|---|
| Identidad del empresario con NIF y teléfono | art. 97.1.b/c | E10-06 |
| **Precio total con impuestos** — hoy se pinta el importe sin mención de IVA | art. 97.1.e | E10-06 |
| Duración y condiciones de resolución | art. 97.1.p | E10-06 |
| **Que el plan se renueva automáticamente** — hoy no se dice en ningún sitio | art. 97.1.o | E10-06 |
| **Duración del bono en días** — el dato existe y el móvil lo enseña; la web no | art. 97.1.e | E10-06 |
| Derecho de desistimiento y formulario del Anexo A | arts. 97.1.i, 102-108 | E10-06 |
| Casilla de aceptación de condiciones | art. 97 | E10-06 |
| **Botón con etiqueta inequívoca de pago** — hoy dice `Contratar` | art. 98.2 | E10-06 |
| Confirmación en soporte duradero | art. 98.7 | E10-06 |
| Aviso legal y condiciones en el pie de `/planes` | art. 10 LSSI | E10-06 |
| **El NIF del centro no es obligatorio para vender** — `blocking: false` en la puesta en marcha | art. 97.1.b | ⚠️ falta HU |

---

## Bloque 1 · Información precontractual (va en la página, antes de pagar)

### Quién te vende

> **⟦PENDIENTE: razón social del centro⟧** · NIF ⟦PENDIENTE⟧
> ⟦PENDIENTE: domicilio⟧ · Teléfono ⟦PENDIENTE⟧ · ⟦PENDIENTE: email⟧

### Qué contratas

⟦Se rellena por producto desde `MembershipPlan`⟧

| | |
|---|---|
| **Producto** | {nombre del plan} |
| **Qué incluye** | {descripción} · {sesiones incluidas} sesiones |
| **Precio total** | **{importe} €, IVA incluido** (21 %) |
| **Duración** | {bono: válido {días} días desde la compra · cuota: mensual} |
| **Renovación** | {bono: **no se renueva; caduca** · cuota: **se renueva automáticamente cada mes hasta que la canceles**} |
| **Cómo se cancela** | Desde tu portal, en cualquier momento, con efecto al final del periodo en curso |
| **Política de cancelación de clases** | Puedes cancelar una reserva sin coste hasta **{ventana del centro} horas** antes. Después, la sesión se descuenta de tu bono |

> **Las dos últimas filas hoy no existen en la página, y son las dos que generan reclamación en recepción.** La ventana tiene que salir del servidor, no de un literal (historias **E2-05** y **E2-06**).

### Derecho de desistimiento

> **Tienes 14 días naturales para desistir**, desde la contratación, sin justificación y sin penalización.
>
> Para ejercerlo, comunícanoslo por cualquier medio inequívoco —el formulario de abajo, un email o desde tu portal—. Te devolveremos lo pagado **en un máximo de 14 días naturales**, por el mismo medio de pago.
>
> **Si pides que el servicio empiece dentro de esos 14 días** y luego desistes, nos deberás la parte proporcional al servicio ya prestado, calculada sobre el precio total.
>
> **El derecho se pierde** cuando el servicio se ha ejecutado por completo, habiéndolo solicitado tú expresamente y reconociendo que perdías el derecho al completarse.

⟦PENDIENTE: validar el encaje del último párrafo. Un bono de 10 sesiones no se "ejecuta por completo" hasta la décima, así que el desistimiento con descuento proporcional sigue vivo durante los 14 días aunque se hayan gastado dos sesiones. Conviene decirlo así de claro.⟧

### Casilla y botón

- [ ] He leído y acepto las **Condiciones de contratación** y la **Política de privacidad**. *(no premarcada)*

**Botón: `Pagar {importe} €`** — nunca "Contratar", "Continuar" ni "Confirmar". El art. 98.2 exige que la etiqueta diga inequívocamente que se asume una obligación de pago.

---

## Bloque 2 · Confirmación en soporte duradero (email tras pagar)

Art. 98.7. **No existe plantilla de confirmación de contratación** en `src/lib/emails/templates.ts` — hay once plantillas y ninguna es esta. Hay que crearla.

Debe contener: producto y precio con IVA · duración y renovación · fecha de contratación · **el texto completo del desistimiento y el formulario del Anexo A** · datos del empresario · enlace a las condiciones en la versión aceptada.

---

## Bloque 3 · Formulario de desistimiento (Anexo A TRLGDCU)

> **Modelo de formulario de desistimiento**
> *(solo debe cumplimentarlo y enviarlo si desea desistir del contrato)*
>
> A la atención de ⟦PENDIENTE: razón social, domicilio y email del centro⟧:
>
> Por la presente le comunico que desisto de mi contrato de prestación del siguiente servicio:
>
> — Servicio contratado: ______________________
> — Fecha de contratación: ______________________
> — Nombre del consumidor: ______________________
> — Domicilio del consumidor: ______________________
> — Firma del consumidor *(solo si se presenta en papel)*: ______________________
> — Fecha: ______________________

---

## Bloque 4 · Pie legal de `/planes` y páginas públicas

Art. 10 LSSI, exigible **aunque el cliente sea empresa**: denominación social, NIF, domicilio, email y teléfono de contacto, y datos registrales. Más enlaces a Aviso legal, Condiciones y Privacidad.

⟦PENDIENTE: aquí el empresario es **Apta**, no el centro — es la venta B2B, tratamiento T13⟧

---

## Notas para el despacho

1. **Dos empresarios distintos, dos juegos de condiciones.** `/hazte-socio` es el centro vendiendo al socio consumidor; `/planes` es Apta vendiendo al centro empresario. Hoy la aplicación no distingue, y las obligaciones no son las mismas.
2. **IVA al 21 %.** Training Zone es una S.L. (consta en `consent.ts:25`) y la exención de servicios deportivos del art. 20.Uno.13º LIVA solo alcanza a entidades de carácter social. ⟦PENDIENTE: confirmar — 00.B.1⟧
3. **VERI\*FACTU no aplica en 2026.** Aplazado por el RDL 15/2025 al 1/1/2027 (Impuesto sobre Sociedades) y 1/7/2027 para el resto. Y por decisión **D-S8**, Apta no factura al socio: factura el centro con su software, y Apta entrega el recibo de Stripe. Eso hay que ponerlo en el contrato con el centro (documento 06).
4. **La normativa autonómica de consumo de Aragón** puede añadir requisitos de información. ⟦PENDIENTE: confirmar⟧
5. **Régimen sancionador**: las horquillas del art. 49 y siguientes del TRLGDCU se han modificado varias veces desde 2021. ⟦PENDIENTE: confirmar con asesoría de consumo⟧
