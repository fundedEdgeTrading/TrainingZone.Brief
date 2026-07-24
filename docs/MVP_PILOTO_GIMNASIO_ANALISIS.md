# Evaluación de madurez para un piloto en un gimnasio real

> Análisis crítico del estado del producto (frontend + funcionalidad) de cara a
> ponerlo delante de un **gimnasio real que lo use en su operación diaria**, no
> en una demo. Lectura de mercado incluida. Fecha: 2026-07.
>
> Método: revisión del código real (rutas `src/app/(app)/*`, `src/lib/*`,
> `prisma/schema.prisma`, webhooks Stripe, mailer, jobs) y de los 11 documentos
> de `docs/`. Cada afirmación apunta al archivo que la respalda.

---

## 0. Veredicto ejecutivo

Training Zone **no es "otra herramienta de reservas y cobros"**: su tesis es una
capa de **inteligencia de entrenamiento + salud/aptitud + retención** encima de
la gestión. Esa apuesta está **sorprendentemente bien construida para un MVP** y
es su verdadera defensa frente al mercado.

El problema para un piloto real es de **orden de prioridades del comprador**. Un
dueño de gimnasio no compra software por el Session Brief; lo compra para **tres
dolores**: (1) **cobrar todos los meses sin fugas**, (2) **llenar las clases**, y
(3) **no perder socios**. De esos tres analgésicos, **dos —cobro recurrente y
comunicación con el socio— son hoy las piezas más débiles**. Los
diferenciadores brillantes son "vitaminas": mejoran la calidad, pero no son por
lo que se firma el contrato.

**Conclusión:** el producto está listo para un piloto de **co-diseño** (un
gimnasio "amigo" que prueba las funciones estrella y da feedback) pero **no para
un piloto de operación real que maneje dinero de socios**, porque el núcleo de
cobro recurrente, la comunicación con el socio y la captura de asistencia no
están cerrados. Ver §6 para las dos rutas de piloto recomendadas.

---

## 1. Lo que YA es un punto fuerte (para no romper lo que funciona)

Para ser justos y no reconstruir lo que ya está bien:

- **Diferenciadores reales y profundos para ser un MVP:**
  - **Session Brief / Session Loop** (`src/app/(app)/brief/*`, `src/lib/brief-queries.ts`): el entrenador recibe, antes de cada sesión, adaptaciones de salud, objetivos y debriefs recientes de cada socio. Casi ningún competidor generalista hace este "bucle de coach".
  - **Semáforo de Aptitud + RGPD Art. 9 centralizado** (`src/lib/health-access.ts`, `src/lib/rbac.ts`, módulo Auditoría): todo acceso a datos de salud pasa por un único punto que aplica permisos y deja log append-only. Esto es un **foso legal**, no solo una feature.
  - **Motor de retención** por frecuencia reciente vs. línea base personal (`src/lib/retention` / alertas): el KPI que más importa a un gimnasio.
- **Portal del socio muy pulido** (`src/app/(app)/portal/*`): es la referencia de calidad visual, responsive, con reserva real (aforo + lista de espera, `portal/agenda/actions.ts`), transparencia de adaptaciones y evolución.
- **Multi-tenant / multi-centro con imputación de personal** (`CenterMembership`) e **aislamiento por `orgId`** consistente.
- **CRM de leads con funnel público** (`src/app/lead-form/[orgSlug]/[centerSlug]/*`): capta desde una URL pública por centro, con canales y motivos de no-cierre.
- **Alta self-service de organización** (`src/app/register/*`, wizard) e **importación de socios por CSV** (`src/lib/member-import.ts`): reduce fricción de arranque.
- **Composición corporal (Tanita)** con importación y evolución.

Esta base es sólida. El resto del documento es **crítico a propósito**: son los
huecos que un gimnasio real destaparía en la primera semana.

---

## 2. Bloqueantes P0 — sin esto, un piloto que maneja dinero real falla

### 2.1 No hay cobro recurrente real (el bloqueante nº 1)

**Evidencia:** `src/lib/stripe-checkout.ts` crea el checkout con `mode: "payment"`
(pago **puntual**). El webhook (`src/app/api/stripe/webhook/route.ts`) solo
escucha `checkout.session.completed` y `checkout.session.expired`. **No hay**
`customer.subscription.*`, ni `invoice.payment_succeeded/failed`, ni mandato
**SEPA**, ni **Bizum**, ni **dunning** (reintentos + aviso de tarjeta caducada),
ni renovación automática. El propio `STRIPE_FUNCIONALIDADES_ROI.md` lo reconoce
como pendiente (F18/F19).

**Por qué es fatal para un gimnasio:** un gimnasio **vive de la domiciliación
mensual**. Hoy la "recurrencia" se simula: las suscripciones viven en la BD y un
cron externo ejecuta cancelaciones programadas (`src/lib/subscription-jobs.ts`),
pero **nadie cobra el mes que viene automáticamente**. En España, además, el
método nº1 es **Bizum/SEPA**, no la tarjeta puntual. Sin esto, el módulo de
Cobros es un **registro manual**, no una pasarela.

**Añadido legal:** no hay facturación **VERI\*FACTU / ticket legal** (declarado
fuera de alcance). En España esto está dejando de ser opcional. Un gimnasio no
puede facturar de verdad sin comprobante conforme.

### 2.2 El gimnasio no puede *comunicarse* con el socio desde la herramienta

**Evidencia:** `grep` de `whatsapp|twilio|sms|firebase|web-push|push` en `src/`
→ **cero resultados**. La única vía es email (`src/lib/mailer.ts`), que **cae a
`console.log` si no hay SMTP configurado** — y en el entorno actual no lo está.
Las notificaciones internas (`notification-bell.tsx`) se renderizan en servidor y
**solo se refrescan al navegar**: no hay polling, ni realtime, ni push.

**Por qué importa:** en el mercado español, **WhatsApp es el canal por defecto**
para seguimiento de leads y avisos a socios (clase cancelada, recibo devuelto,
"te echamos de menos"). Un motor de retención que detecta el riesgo de fuga pero
**no puede lanzar el mensaje** se queda a medias. Para un piloto, hoy el gimnasio
**no puede llegar a sus socios** a través del producto.

### 2.3 La asistencia se captura a mano — y de ahí se alimentan las features estrella

**Evidencia:** `grep` de control de acceso (torno/QR/NFC/kiosk) → no existe
integración; el "check-in" es el entrenador/recepción marcando asistencia en el
roster de la sesión (`agenda/session/[id]/checkin-button.tsx`).

**Por qué importa:** el **motor de retención** y el **semáforo de aptitud**
valen lo que valen los datos de asistencia y debrief que se capturan. Si la
asistencia depende de que el staff marque cada entrada a mano, en un gimnasio con
tráfico real **los datos quedan incompletos** y las features inteligentes se
degradan justo donde tenían que brillar. Competidores como Nubapp/Provisual
integran torno/acceso; aquí no hay ni **auto-check-in por QR** en el portal.

### 2.4 La infraestructura del piloto no está "encendida"

No es código que falte, es **puesta en marcha** que hoy no está y que un piloto
real necesita el día 1:

- **SMTP sin configurar** → invitaciones de staff, onboarding y recibos **no se
  envían** (se loguean). `src/lib/mailer.ts`.
- **Cron no programado** → alertas de retención, recordatorios de check-in,
  cancelaciones programadas y sugerencias de oferta **solo se ejecutan si alguien
  llama a `/api/jobs/run`** (`src/app/api/jobs/run/route.ts`). Sin un scheduler
  real (Vercel Cron u otro), toda la "automatización temporal" está parada.
- **Sin recuperación de contraseña** (`grep forgot/reset` → nada). Un socio o
  recepcionista que olvide la clave se queda fuera; hoy solo hay login por
  credenciales demo. SSO (Microsoft/Google) está declarado pero apagado.

---

## 3. Frontend — secciones que todavía NO son un punto fuerte (P1)

### 3.1 La Agenda es el corazón operativo y es la pieza más frágil

- **Está construida a mano** (`agenda/agenda-view.tsx`, 505 líneas: drag-and-drop,
  `layoutDay`, `snap`, `ROW_HEIGHT` propios) **mientras `react-big-calendar`
  está instalado pero sin usar en ningún archivo** (dependencia muerta). Reinventar
  el calendario multiplica la superficie de bugs.
- **Los bugs recientes lo confirman:** los últimos merges arreglan *"session
  dialog getting clipped"* y *"session modal cutoff"* (#55, #53) — problemas de
  robustez en el componente donde el staff pasa el día.
- **Faltan vistas que un gimnasio espera:** vista **mes**, vista por **recurso/sala**,
  edición madura de **recurrencias**. Es donde recepción y entrenadores viven 8h.

> Recomendación: o se blinda el calendario a medida con tests, o se migra a
> `react-big-calendar` (ya instalado) / FullCalendar y se tematiza. Mantener 505
> líneas de calendario propio sin tests es deuda cara.

### 3.2 Conviven dos generaciones de estilo (el plan UX premium está a medias)

`docs/UX_PREMIUM_PLAN.md` diagnostica "dos generaciones de estilo" y define
primitivas (`src/components/ui/*`). Pero la adopción es **desigual**: `members` y
`leads` usan las primitivas; **`billing` y `retention` solo importan 2**, `brief`
2, y **`agenda-view` ninguna** (todo a mano). El resultado es una app donde
portal/dashboard se ven premium y las pantallas operativas se ven de otra
generación. Para un piloto, la **primera impresión del dueño** es el dashboard
(bien) pero su equipo vive en agenda/cobros (peor).

### 3.3 Experiencia móvil del staff, pobre

- `mobile-nav.tsx` son **43 líneas** (hamburguesa básica); el layout operativo es
  desktop-first. La **agenda con drag-and-drop no está pensada para táctil**, y
  recepción/entrenadores a menudo trabajan desde tablet o móvil en pista.
- No hay **app nativa**: `docs/APP_MOVIL_NATIVA_PLAN.md` es solo un plan y avisa de
  que los **Server Actions no son reutilizables** desde React Native → primero hay
  que exponer una **API JSON con auth por token**. Los competidores (Nubapp,
  Virtuagym, Trainingym) entregan **app de marca blanca con push**; aquí el socio
  tiene web responsive (buena, pero no instalable ni con push).

### 3.4 Otros huecos de frontend que un gimnasio nota

- **Sin exportaciones.** No hay CSV/PDF de socios, cobros ni un informe de
  dashboard para la **gestoría** (`grep` de export/csv/pdf → solo existe la
  *importación*). Un dueño quiere sacar sus datos.
- **Inteligencia geográfica atada a Zaragoza.** El mapa de calor por código postal
  está **hardcodeado a Zaragoza** (`src/lib/postal-codes-zaragoza.ts`,
  `dashboard/postal-heatmap.tsx`). **Cualquier gimnasio fuera de Zaragoza ve un
  mapa vacío o roto.** Necesita geocodificación genérica por CP.
- **Skeletons/empty states incompletos.** Hay `loading.tsx` en 7 rutas
  (dashboard, members, agenda, retention, billing, brief, portal) pero **no** en
  leads, offers, feedback, health, audit, organization, rrhh.
- **Notificaciones sin realtime** (ver §2.2): la campana no avisa hasta recargar.
- **Sin tests unitarios** (solo 6 specs e2e en `e2e/`). Para el corazón (agenda,
  cobros, retención) es poca red de seguridad para iterar en un piloto.

---

## 4. Lectura de mercado — dónde ganamos y dónde nos falta la mesa

**Dónde competimos:** producto de gama media-alta para **centros de entrenamiento
españoles** (no boutique-solo-reservas tipo Resasports/Bsport, no gran-cadena-
solo-acceso tipo Perfect Gym). Vecinos directos: **Trainingym, Virtuagym, Nubapp,
Provisual**.

| Capacidad | Table stake del mercado | Estado aquí |
|---|---|---|
| Reservas + aforo + lista de espera | Sí | ✅ Sólido |
| Cobro recurrente (SEPA/tarjeta) + dunning | **Sí, innegociable** | ❌ Solo pago puntual |
| Bizum / métodos España | Sí en España | ❌ Enum existe, flujo no |
| Comunicación (WhatsApp/email/push) | **Sí** | ❌ Email sin configurar; sin WhatsApp/push |
| Control de acceso / check-in | Sí (medio/alto) | ❌ Manual |
| App de marca blanca | Sí (diferencial de venta) | ❌ Solo plan |
| Retención / engagement | Diferencial | ✅ Fuerte |
| Inteligencia de salud / aptitud | **Poco común — nuestro foso** | ✅ Único |
| CRM de leads + funnel | Sí | ✅ Bueno |

**El riesgo estratégico:** llegamos con **diferenciadores de gama premium**
(aptitud, coach loop) montados sobre una **base de table-stakes incompleta**
(cobro, comunicación, acceso). En una demo ganamos por lo bonito y lo inteligente;
en un piloto real, el gimnasio nos mide por **si cobra sin fugas y llena clases**,
y ahí es donde flojeamos. Además, el **coste de cambio** juega en contra: importar
socios por CSV está (bien), pero **no hay migración de suscripciones, historial de
pagos ni mandatos SEPA** → mover un gimnasio *vivo* desde su software actual es hoy
inviable sin trabajo manual.

---

## 5. Priorización (qué duele más primero)

| # | Hueco | Impacto piloto | Esfuerzo | Prioridad |
|---|---|---|---|---|
| 1 | Cobro recurrente Stripe (subscription + SEPA/Bizum + dunning) | Bloqueante | Alto | **P0** |
| 2 | Comunicación socio (WhatsApp/email real + notif. realtime) | Bloqueante | Medio | **P0** |
| 3 | Check-in socio (auto QR en portal, mínimo viable de acceso) | Alto (calidad de datos) | Medio | **P0/P1** |
| 4 | Encender infra piloto (SMTP, cron, reset contraseña) | Bloqueante operativo | Bajo | **P0** |
| 5 | Robustez de Agenda (tests o migrar a RBC; vista mes) | Alto (uso diario) | Medio | **P1** |
| 6 | Cierre del plan UX en billing/retención/brief/agenda | Medio (percepción) | Bajo-Medio | **P1** |
| 7 | Geo genérica por CP (quitar hardcode Zaragoza) | Alto si el piloto no es Zaragoza | Bajo | **P1** |
| 8 | Exportaciones (socios/cobros/gestoría) | Medio | Bajo | **P2** |
| 9 | Móvil staff + app nativa | Medio-Alto (venta) | Alto | **P2** |

---

## 6. Recomendación: dos rutas de piloto

**Ruta A — Piloto de co-diseño (recomendada para ya).** Elegir un gimnasio
"amigo", **sin migrar su facturación**. El gimnasio sigue cobrando por su sistema
actual; aquí prueba lo que nos diferencia: **Session Brief, semáforo de aptitud,
retención, CRM de leads y portal del socio**. Requisitos mínimos para que sea
honesto: **encender SMTP + cron + reset de contraseña** (P0-4), **quitar el
hardcode de Zaragoza** (P1-7) y **auto-check-in por QR** en el portal para que la
asistencia se capture sin fricción (P0/P1-3). Esto es alcanzable en poco y enseña
el foso real del producto sin prometer lo que aún no cobra.

**Ruta B — Piloto de operación real (aún no).** Que el gimnasio **cobre de
verdad** por aquí. No lanzar hasta cerrar **P0-1 (suscripciones + SEPA/Bizum +
dunning)**, **P0-2 (comunicación)** y la **migración de suscripciones/mandatos**.
Antes de esto, un piloto de operación real **destaparía fugas de dinero** y
quemaría la relación con el primer cliente de referencia.

**Regla de oro:** ser honesto en la demo sobre qué está "en registro manual" vs.
"automatizado". El mayor riesgo reputacional no es que falten features — es
prometer cobro automático y que un recibo no se pase.

---

*Documento vivo. Emparejar con `STRIPE_FUNCIONALIDADES_ROI.md` (plan de cobro
F18–F19), `UX_PREMIUM_PLAN.md` (deuda de estilo) y `APP_MOVIL_NATIVA_PLAN.md`
(capa API + app). Todas las afirmaciones son verificables en el código citado.*
