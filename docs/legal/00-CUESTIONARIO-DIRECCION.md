# 00 · Cuestionario de dirección

**Lo único de este expediente que no se puede sacar del código.** Mientras estas respuestas no existan, el resto de documentos llevan huecos y el despacho no puede arrancar.

Cada respuesta rellena un `⟦PENDIENTE⟧` concreto. La columna "bloquea" dice qué se para si falta.

---

## A · Identidad de las partes

Verificado: **la identidad de Apta no consta en ninguna parte del repositorio.** La de Training Zone sí — `src/lib/consent.ts:25` la nombra como **"Training Zone Cesar Augusto S.L."**.

| # | Pregunta | Bloquea |
|---|---|---|
| A.1 | **Razón social completa de Apta** | 05, 06, 07 |
| A.2 | **NIF de Apta** | 05, 06, 07 |
| A.3 | **Domicilio social de Apta** | 05, 06 |
| A.4 | **Teléfono y email de contacto** de Apta para ejercicio de derechos | 05, 06 |
| A.5 | ¿Apta y Training Zone son **la misma sociedad**, sociedades distintas del mismo grupo, o independientes? | 06, 09 |
| A.6 | Confirmar que el responsable del tratamiento de los socios es **el centro** (Training Zone Cesar Augusto S.L. en el piloto) y Apta es **encargado** | 01, 06 |
| A.7 | Dirección postal que ya se usa en el pie de los correos (`EMAIL_POSTAL_ADDRESS` en `.env.example`) — ¿es la de Apta o la del centro? | 05 |

> **Ojo con A.5.** Si Apta y Training Zone son la misma sociedad, el "contrato de encargo" del documento 06 es un contrato consigo mismo y hay que replantearlo: lo que hace falta entonces es la separación de finalidades dentro del mismo responsable, y el DPA aparece cuando entre el segundo cliente. **Esta pregunta cambia la naturaleza del documento 06, no solo un hueco.**

## B · Fiscal y facturación

Ya cerrado por decisión **D-S8**: Apta factura solo su licencia al centro; el centro factura al socio con su propio software.

| # | Pregunta | Bloquea |
|---|---|---|
| B.1 | Training Zone es una **S.L.** (consta en el código). Confirmar que **no** es entidad de carácter social a efectos del art. 20.Uno.13º LIVA → **los servicios deportivos tributan al 21 %** | 07 |
| B.2 | ¿Qué tipo de IVA se aplica a la **licencia de Apta** al centro? (B2B, previsiblemente 21 %) | 07 |
| B.3 | ¿Quién emite el recibo que ve el socio: el centro con su software, o se acepta el recibo de Stripe como justificante? | 07, E10-06 |

> **Hallazgo del código, no del despacho**: `Organization.taxId` y `billingName` son opcionales en el esquema, y el paso "Datos de tu empresa" de la puesta en marcha está marcado `blocking: false` (`src/lib/setup-checklist.ts:43`). **Hoy un centro puede vender sin haber dado su NIF**, y la información precontractual lo exige. Eso es código, no papel: hay que hacer ese paso bloqueante antes de activar el cobro.

## C · Protección de datos

| # | Pregunta | Bloquea |
|---|---|---|
| C.1 | **¿Quién será el DPD?** ¿Interno o externo? (decisión D-C4 ya tomada: se designa) | 05, 10 |
| C.2 | Datos de contacto del DPD, para publicarlos en la política | 05, 10 |
| C.3 | ¿Se acepta la **tabla de plazos** propuesta en el documento 03, o dirección quiere plazos distintos? | 03, 05 |
| C.4 | ¿Se acepta apoyar el dato de salud obligatorio en el **art. 9.2.f** (decisión D-C2), o se prefiere recortar qué se pide como obligatorio? | 05, E10-03 |
| C.5 | ¿Está firmado el **DPA con Anthropic**? (decisión D-C5: se firma antes del piloto) | 02, 04 |
| C.6 | ¿Están firmados los DPA con **Stripe, Brevo y Render**? Los tres publican DPA estándar; hay que aceptarlos y archivarlos | 02, 06 |
| C.7 | **Región de despliegue de Render**, confirmada por escrito (decisión D-C1: ya está en la UE) | 02, 05 |
| C.8 | ¿Quién recibe y tramita un ejercicio de derechos que llegue a `info@trainingzone.es`? | 05 |

## D · Laboral

| # | Pregunta | Bloquea |
|---|---|---|
| D.1 | Nº de trabajadores del centro (marca el umbral de 50 del plan de igualdad y del canal de denuncias) | 08 |
| D.2 | ¿Existe **representación legal de los trabajadores**? Si la hay, hay que informarle además de a la plantilla | 08 |
| D.3 | ¿Se mantiene el **ranking nominal de ventas con medallas** de `rrhh/page.tsx`, o pasa a agregado? | 08 |
| D.4 | Confirmar que el **módulo de fichajes se apaga** (decisión D-P6 derivada) y que el centro lleva el registro de jornada por su cuenta | 08, E10-21 |

## E · Metodología y propiedad intelectual

| # | Pregunta | Bloquea |
|---|---|---|
| E.1 | Confirmar la decisión **D-P4**: la metodología de `src/lib/ai/methodology/` es propiedad de Apta | 09 |
| E.2 | ¿Quién la escribió materialmente, y bajo qué relación (socio, empleado, contrato de servicios)? De eso depende que la titularidad sea de Apta por ley o haya que cederla expresamente | 09 |
| E.3 | ¿Training Zone aportó contenido a esa metodología? Si sí, hay que regular las aportaciones futuras | 09 |

## F · Menores

Decisión **D-P8** ya tomada: configurable por centro.

| # | Pregunta | Bloquea |
|---|---|---|
| F.1 | ¿Training Zone admite menores hoy, de hecho? | 05, E10-12 |
| F.2 | Si sí, ¿desde qué edad? (el umbral legal de consentimiento propio en España es 14 años) | 05, E10-12 |

---

## Resumen de lo que hay que traer

**Antes de mandar nada al despacho**, dirección tiene que aportar:

- Escritura o datos registrales de Apta (A.1-A.4)
- Confirmación de la relación societaria Apta ↔ Training Zone (A.5)
- Nombre y contacto del DPD (C.1-C.2)
- Los cuatro DPA de proveedor, firmados o aceptados: Anthropic, Stripe, Brevo, Render (C.5-C.6)
- Confirmación por escrito de la región de Render (C.7)
- Nº de trabajadores y si hay RLT (D.1-D.2)
- Bajo qué relación se escribió la metodología (E.2)

**Lo único que es camino crítico de verdad son A.1-A.5 y C.5-C.6.** El resto se puede contestar con el despacho delante.
