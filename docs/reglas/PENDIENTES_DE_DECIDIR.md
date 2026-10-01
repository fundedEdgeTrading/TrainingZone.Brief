# Pendientes de decidir

Lo que la revisión del 01-10-2026 encontró: sitios donde **la regla y la
aplicación no dicen lo mismo**, o donde una decisión quedó a medias. Cada
entrada necesita una respuesta de negocio; con ella, la regla pasa a ✅ Aprobada
y desarrollo cambia el código (o se reescribe la regla para describir lo que ya
hace la aplicación).

Cómo se cierra una entrada: se escribe la decisión en la regla afectada, se
borra la entrada de aquí y el commit dice `decide P-NN`.

---

<a id="p-01"></a>

## P-01 · ¿Recuperación de contraseña por SMS?

**Regla:** `RB-LEAD-002` · **Hoy:** la recuperación es solo por email; no hay
envío de SMS en Apta.
**Pregunta:** ¿se mantiene el SMS como requisito (coste por mensaje y un
proveedor nuevo) o se reescribe la regla a "por email"? ¿Qué pasa con el socio
que solo dio teléfono?

<a id="p-02"></a>

## P-02 · ¿Se permite cobro manual?

**Reglas:** `RB-PAGO-001`, `RB-LEAD-005` · **Hoy:** dirección, dirección de
centro y recepción pueden registrar un cobro en efectivo, datáfono, Bizum o
transferencia. Cuenta igual que un cobro por Stripe: cierra el lead y anota
quién vendió.
**Pregunta:** ¿el cobro manual es permanente (y la regla se reescribe), o tiene
fecha de retirada? Si es permanente, ¿quién puede registrarlo y con qué tope?

<a id="p-03"></a>

## P-03 · Ventana de cancelación por centro

**Regla:** `RB-RES-011` (decisión D-S9) · **Hoy:** una sola ventana para toda la
plataforma, 24 h, en una variable de entorno. `AGENTS.md` habla de "la del
centro", pero no existe el campo. El paso a producción (D2) decidió que los dos
primeros centros comparten ventana.
**Pregunta:** ¿hace falta ya por centro? Si sí, ¿quién la cambia (dirección de
organización, de centro) y con qué mínimo y máximo?

<a id="p-04"></a>

## P-04 · El recordatorio de 2 horas no llega a tiempo

**Regla:** `RB-RES-013` · **Hoy:** los trabajos programados corren una vez al
día (05:00 UTC). El de "mañana entrenas" funciona; el de 2 h no.
**Pregunta:** ¿se quiere de verdad el de 2 h? Si sí, es un cambio de
infraestructura (cron cada hora, con coste); si no, se retira de la regla.

<a id="p-05"></a>

## P-05 · ¿Quién ve el informe semanal de comentarios?

**Reglas:** `RB-RRHH-010`, `RB-FB-104` · **Hoy:** solo dirección. La regla
original decía "para todo el equipo, para revisar juntos".
**Pregunta:** ¿se abre a entrenadores (sin la valoración confidencial de
`RB-RRHH-012`) o se reescribe la regla?

<a id="p-06"></a>

## P-06 · Objetivos de negocio escritos en el código

**Dónde:** `src/lib/dashboard-targets.ts` · **Hoy:** ocupación objetivo 75 % y
permanencia objetivo 25 meses, iguales para todas las organizaciones.
**Pregunta:** ¿cada organización fija los suyos? Si no, ¿son estos los números?

<a id="p-07"></a>

## P-07 · ¿Una cuenta Stripe por centro?

**Documento:** `docs/hu/HU-ST-29-cuenta-stripe-por-centro.md` (borrador, no
aprobado) · **Hoy:** una cuenta Stripe por organización; la caja se separa por
centro.
**Pregunta (su §2, sin responder):** ¿hay clientes con centros de **distinto
CIF** dentro de la misma organización? Sin esa respuesta no se empieza.

<a id="p-08"></a>

## P-08 · Quién ve el chat de un socio

**Regla:** `RB-CHAT-001` · **Hoy:** dirección siempre; entrenador si le ha dado
sesión en los últimos 90 días; recepción solo mientras haya una pregunta sin
responder. La regla original hablaba del "entrenador asignado" y de que la IA
escribiera en el chat.
**Pregunta:** ¿se aprueba el comportamiento actual tal cual (y se reescribe la
regla) o se vuelve al entrenador responsable (`RB-PERFIL-002`)?

<a id="p-09"></a>

## P-09 · Política de centro para las franjas de EP

**Regla:** `RB-AGENDA-006` · **Hoy:** cada entrenador publica sus franjas sin
marco común. La decisión §11.5 dejaba "para el futuro" una política de
dirección (número de franjas, antelación mínima).
**Pregunta:** ¿se construye o se retira de la regla?

<a id="p-10"></a>

## P-10 · Confirmación de reserva por email

**Regla:** `RB-AGENDA-005` · **Hoy:** no se envía. El socio ve la reserva en
su portal y recibe los recordatorios.
**Pregunta:** ¿se quiere el correo de confirmación, o basta lo que hay?

<a id="p-11"></a>

## P-11 · Plazos de reserva iguales para todos los centros

**Reglas:** `RB-RES-001` (30 minutos de antelación mínima) y `RB-RES-002`
(7 días vista) · **Hoy:** fijos en el código.
**Pregunta:** ¿son estos los valores? ¿Debe poder cambiarlos cada centro?

<a id="p-12"></a>

## P-12 · Comportamiento construido sin regla

Funciona, pero ninguna regla lo enuncia, así que nadie de negocio lo ha
validado por escrito: **referidos con recompensa**, **etiquetas**, **flujos de
email** (y cuándo sale cada uno), **cuatro tipos de persona con motivo
obligatorio**, **renovación sin arrastre de sesiones** (D3), **adelanto de la
renovación** (D4, D5), **qué productos son recurrentes** (D6), **quién ve datos
de salud**.
**Propuesta:** numerarlos uno a uno a partir de lo que ya está descrito en los
ficheros de este catálogo, revisando que el enunciado es el que negocio quiere.
