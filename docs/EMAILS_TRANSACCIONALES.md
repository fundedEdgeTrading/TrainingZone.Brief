# Correo transaccional — plantillas, preferencias y baja

Implementación del handoff *Emails Training Zone* (rediseño de
`src/lib/emails/templates.ts`) más lo que el handoff dejaba pendiente: las
rutas `/preferencias`, `/baja` y `/privacidad`, la baja de verdad y los datos
que rellenan la ficha de cada correo.

## 1. Plantillas

`src/lib/emails/templates.ts` es el único sitio donde se maqueta correo. Un
shell común (cabecera negra con logo + sección, titular, cuerpo, **ficha de
datos**, botón, nota, firma y pie) y una función por correo:

| # | Plantilla | Call site | Tipo |
|---|---|---|---|
| 01 | `renderMemberWelcomeEmail` | `members/actions.ts`, `members/[id]/actions.ts`, `stripe-checkout.ts` | Servicio |
| 02 | `renderVerifyEmail` | `activar/actions.ts` | Servicio |
| 03 | `renderStaffInviteEmail` | `organization/actions.ts`, `api/mobile/v1/staff/route.ts` | Servicio |
| 04 | `renderPasswordResetEmail` | `recuperar-clave/actions.ts` | Servicio |
| 05 | `renderMemberBillingLinkEmail` | `hazte-socio/[orgSlug]/[centerSlug]/actions.ts` | Servicio |
| 06 | `renderSessionVacancyEmail` | `session-vacancy-notify.ts` | Prescindible |
| 07 | `renderBirthdayEmail` | `birthday-jobs.ts` | Prescindible |
| 08 | `renderEmailPreferencesLinkEmail` | `preferencias/actions.ts` | Servicio |
| — | `renderPaymentFailedEmail` | `member-billing.ts` | Servicio |
| — | `renderOwnerActivationEmail` | `provisioning.ts` | Servicio |
| — | `renderAssessmentDueEmail` | `assessment-jobs.ts` | Prescindible |

Decisiones que conviene no deshacer sin querer:

- **Nada firma como Apta.** El pie, las despedidas y los `fromName` de los
  correos de plataforma dicen Training Zone o el nombre del centro.
- **Ficha de datos.** Cada plantilla acepta filas etiqueta/valor y las pinta
  solo si el call site las pasa; una fila que falta no rompe nada.
- **Todo dato interpolado se escapa** (`esc()`): un apellido con `<` no puede
  romper la maqueta ni inyectar marcado en el correo.
- **El módulo es puro**: ni Prisma ni `crypto`. Así se renderiza y se prueba
  una plantilla sin base de datos (`src/lib/emails/templates.test.ts`).
- **Dirección postal**: la pasa el call site desde `Center.address`. Sin ella
  cae a `EMAIL_POSTAL_ADDRESS` (ver `.env.example`).

## 2. Correo de servicio vs. correo prescindible

Es la distinción que gobierna todo lo demás:

- **Servicio** (alta de acceso, contraseña, enlace de cuota, cobro fallido,
  confirmación de email de dirección, invitación de personal): es la ejecución
  del contrato. No se puede desactivar y **no lleva** cabecera
  `List-Unsubscribe`. Sin estos correos el socio no puede entrar ni pagar.
- **Prescindible** (plaza liberada, recordatorio de valoración, cumpleaños,
  marketing): se apaga uno a uno o de golpe.

## 3. Preferencias y baja

- `src/lib/email-preferences.ts` — módulo **puro**: tipos, etiquetas y
  `canSendMemberEmail(kind, prefs)`, la única puerta por la que sale el correo
  prescindible. Lo importan tanto los jobs como el formulario de cliente.
- `src/lib/email-preferences-queries.ts` — lo que toca BD: leer/guardar
  preferencias, baja total y `memberEmailFooterLinks(memberId)`, que devuelve
  el token del pie, las dos URLs del pie y la de `List-Unsubscribe`.
- `Member.notifyVacancies` / `notifyBirthday` / `notifyAssessments` /
  `consentMarketing` + `Member.emailOptOutAt` (baja global, con fecha: es la
  prueba de cuándo se ejerció la oposición del Art. 21 RGPD).

Cuatro caminos para darse de baja, todos equivalentes:

1. **Pie del correo → "Darme de baja"** → `/baja/<token>`, con confirmación de
   un clic. No se da de baja al abrir la página: los escáneres de enlaces de
   algunos clientes visitan todas las URLs de un correo.
2. **Botón del cliente de correo** (Gmail, Outlook) → POST a
   `/api/email/baja/<token>` (RFC 8058). Ese sí es intencionado: da de baja y
   devuelve 200 sin HTML.
3. **Pie del correo → "Preferencias"** → `/preferencias/<token>`, interruptor
   a interruptor, con botón de baja total al final.
4. **Portal del socio** → `/portal/perfil`, tarjeta "Correos que recibes".

Sin enlace a mano, `/preferencias` y `/baja` (sin token) piden el email y
mandan uno nuevo. La respuesta visible es siempre la misma exista o no el
socio (RB-ID-005): si no, el formulario sería un oráculo de quién es socio de
qué gimnasio.

### El token del pie

Propósito `email-preferences` de `email-verification.ts`, sujeto = `Member.id`,
TTL **un año**. Un enlace de baja que caduca es una baja que no se puede
ejercer. Solo sirve para preferencias: no abre sesión, no toca credenciales y
no expone datos de salud, y el propósito va dentro de la firma, así que no vale
como token de ninguna otra cosa.

### Reactivación

Encender cualquier interruptor levanta la baja global. Si no, el socio marcaría
la casilla y seguiría sin recibir nada.

## 4. Rutas nuevas

| Ruta | Qué hace |
|---|---|
| `/preferencias` | Pide por email el enlace de preferencias |
| `/preferencias/[token]` | Interruptores + baja total |
| `/baja` | Pide por email el enlace de baja |
| `/baja/[token]` | Confirmación de baja de un clic |
| `/api/email/baja/[token]` | POST: baja RFC 8058. GET: redirige a `/baja/[token]` |
| `/privacidad` | Política: mismo texto que firma el socio (`lib/consent.ts`) |

Todas públicas (`src/proxy.ts`): exigir login para dejar de recibir correo es,
literalmente, no ofrecer un medio sencillo de oposición.

## 5. Qué queda fuera

- La **fecha del próximo cobro** de la fila "Próximo cobro" del correo 05 no
  está en la BD (la lleva Stripe). La fila no se pinta antes que inventarla.
- El **logo** se sirve desde el dominio público de la app
  (`absoluteUrl("/brand/tz-logo-white.png")`): ese dominio tiene que ser
  accesible desde fuera para que la imagen cargue en el cliente de correo.
- Poppins solo se ve en quien la tenga instalada; los clientes de correo no
  cargan fuentes web. El fallback es Helvetica → Arial.
