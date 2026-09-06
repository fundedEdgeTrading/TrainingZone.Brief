# 05 · Borrador de política de privacidad

**Art. 13 RGPD** · Sustituye a `src/app/privacidad/page.tsx`, que hoy reutiliza `CONSENT_TEXT` más dos bloques y **es un incumplimiento verificable en treinta segundos desde el navegador** (§7 CN-06).

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE. NO PUBLICAR.**
> Los `⟦PENDIENTE⟧` son huecos reales; publicarlo con ellos sería peor que la página actual.

---

## Política de privacidad

**Última actualización:** ⟦PENDIENTE: fecha de publicación⟧ · **Versión:** ⟦PENDIENTE⟧

### 1. Quién trata tus datos

El responsable del tratamiento de tus datos como socio es **el centro deportivo** en el que te has dado de alta:

> **Training Zone Cesar Augusto, S.L.**
> NIF ⟦PENDIENTE: 00.A⟧ · Domicilio ⟦PENDIENTE⟧ · ⟦PENDIENTE: email y teléfono⟧

El centro utiliza la plataforma **Apta**, operada por ⟦PENDIENTE: razón social, NIF y domicilio de Apta — 00.A.1-A.3⟧, que actúa como **encargado del tratamiento** por cuenta del centro y bajo contrato conforme al art. 28 RGPD.

**Delegado de Protección de Datos:** ⟦PENDIENTE: nombre y contacto — 00.C.1-C.2⟧

### 2. Qué datos tratamos, para qué y con qué base

| Qué tratamos | Para qué | Base jurídica |
|---|---|---|
| Nombre, apellidos, email, teléfono, fecha de nacimiento, dirección | Darte de alta, gestionar tus reservas y tu bono | Ejecución del contrato (art. 6.1.b) |
| Contacto de emergencia | Poder avisar a alguien si te ocurre algo en la sala | Interés vital (art. 6.1.d) e interés legítimo |
| **Lesiones, condiciones de salud, medicación y screening** | Valorar tu aptitud, adaptar tu entrenamiento y poder acreditar que se adaptó | **Art. 9.2.f** — formulación, ejercicio o defensa de reclamaciones ⟦PENDIENTE: validación — 00.C.4⟧ |
| **Composición corporal y fotografías de progreso** | Seguimiento de tu evolución | **Consentimiento explícito** (art. 9.2.a) — puedes retirarlo |
| **Envío de tus datos clínicos a un sistema de IA** | Elaborar una propuesta de programación que revisa un profesional | **Consentimiento explícito** (art. 9.2.a) — puedes retirarlo sin perder acceso al servicio |
| Datos de pago e importes | Cobrar tu cuota o bono y conservar el justificante | Contrato (art. 6.1.b) y obligación legal (art. 6.1.c) |
| Tu asistencia y consumo de bono | Saber si necesitas seguimiento y mejorar el servicio | Interés legítimo (art. 6.1.f) |
| Tu email para promociones | Enviarte ofertas del centro | **Consentimiento** (art. 6.1.a) — puedes retirarlo |
| Tu código postal | Saber en qué barrios están nuestros socios, de forma agregada | Interés legítimo (art. 6.1.f) |

> ### Sobre la declaración de salud
>
> **La declaración de salud es condición para prestarte el servicio**, y por eso no te la pedimos como consentimiento: te la pedimos como declaración. Sin saber si tienes una lesión, una condición cardiovascular o estás embarazada, no podemos adaptar tu entrenamiento ni programar con seguridad, y el centro estaría entrenándote a ciegas.
>
> **Los otros tres —imágenes, inteligencia artificial y promociones— sí son libres**, y decir que no a cualquiera de ellos no afecta a tu acceso al servicio ni a la calidad de tu entrenamiento.

### 3. Quién más ve tus datos

| Proveedor | Para qué | Dónde está |
|---|---|---|
| **Stripe Payments Europe** | Procesar tus pagos | Irlanda, con tratamiento en EEUU |
| **Anthropic** | Generar la propuesta de programación, **solo si lo has consentido** | EEUU |
| **Brevo** | Enviarte los correos del centro | Francia |
| **Render** | Alojar la aplicación y la base de datos | ⟦PENDIENTE: confirmar UE — 00.C.7⟧ |

Dentro del centro, tus datos de salud **solo son accesibles para dirección y para tu entrenador**. Recepción y el personal de administración **no ven tus datos de salud**, y cada acceso queda registrado con quién, cuándo y a qué.

**Transferencias fuera de la UE:** ⟦PENDIENTE: mecanismo por proveedor — ver documento 02⟧

**No cedemos tus datos a terceros** para finalidades distintas de las descritas, ni los vendemos.

### 4. Cuánto tiempo los guardamos

⟦PENDIENTE: insertar la tabla del documento 03 una vez validada⟧

Al terminar el plazo, tus datos se **anonimizan**: se retira todo lo que permita identificarte y se conserva solo el histórico agregado que la ley obliga a mantener por razones contables y fiscales.

### 5. Tus derechos

Puedes **acceder** a tus datos, **rectificarlos**, **suprimirlos**, **oponerte** a su tratamiento, **limitarlo** y pedir su **portabilidad**. También puedes **retirar cualquiera de los consentimientos** que hayas dado, en cualquier momento y con la misma facilidad con la que los diste — desde tu perfil en el portal, sin llamar a nadie.

Retirar un consentimiento no afecta a la licitud del tratamiento anterior.

Para ejercerlos: ⟦PENDIENTE: canal — hoy el código dice `info@trainingzone.es`⟧. Te responderemos en un plazo máximo de un mes.

Puedes **descargar todos tus datos** desde tu perfil, en formato estructurado.

Si crees que no hemos atendido bien tus derechos, puedes reclamar ante la **Agencia Española de Protección de Datos** (www.aepd.es), sin perjuicio de reclamar antes ante nuestro DPD.

### 6. Decisiones automatizadas

**No tomamos decisiones automatizadas** que produzcan efectos jurídicos sobre ti o te afecten significativamente.

La propuesta de programación generada con inteligencia artificial **siempre es revisada y aprobada por un profesional cualificado antes de aplicarse**, y no se te muestra sin esa revisión. El semáforo de aptitud que ve tu entrenador es una regla escrita por el director técnico del centro, no un sistema automático que decida sobre ti.

### 7. Menores

⟦PENDIENTE: 00.F. Si el centro admite menores, aquí va la edad mínima y el régimen de consentimiento del tutor (umbral legal en España: 14 años)⟧

### 8. Cookies

Esta aplicación usa **únicamente cookies técnicas**: la de tu sesión y la que guarda tu zona horaria. No usamos analítica, ni píxeles, ni cookies de terceros, y por eso no te mostramos un banner de consentimiento. Puedes ver el inventario completo en ⟦PENDIENTE: /cookies — historia E10-22⟧.

### 9. Cambios

Si cambiamos esta política de forma material, te lo comunicaremos y, cuando afecte a un consentimiento que nos diste, te lo volveremos a pedir.

---

## Notas para el despacho

1. **La tabla del §2 es la parte que más se aparta de una plantilla al uso**, y es deliberado: cada fila sale de un tratamiento identificado en el documento 01.
2. **El §2 sobre la declaración de salud es la pieza que hay que validar** (00.C.4). Si el 9.2.f no cubre todo el alcance, la palanca no es volver a hacer opcional el alta: es **recortar qué se pide como obligatorio** — el mínimo defendible es el PAR-Q y las lesiones activas, no la medicación ni el historial quirúrgico completo.
3. **El §6 es cierto hoy y hay que vigilarlo**: el código lo cumple (`DRAFT` → `APPROVED` con revisión humana, y el mesociclo no se expone al socio en ningún endpoint). Si eso cambia, este párrafo pasa a ser falso.
4. **Falta la información del art. 13 para el cliente B2B** (tratamiento T13, donde Apta es responsable, no encargado). Es un texto distinto y va en el documento 06.
5. **El contacto de emergencia es un dato de un tercero** que el socio aporta sin que ese tercero lo sepa. Hay que decidir si se le informa o se justifica el art. 14.5.b. No está resuelto.
