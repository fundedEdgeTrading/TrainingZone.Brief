# 08 · Comunicación con el socio

Pantallas: chat del portal (panel flotante) y su lado del personal en la ficha
del socio, `/anuncios`, `/preferencias`. Descripción funcional en
[CRM_Y_MARKETING.md](../CRM_Y_MARKETING.md) §5.

### RB-CHAT-001 · Quién ve el chat de un socio

**Estado:** ⚠️ En conflicto con su enunciado original · ver [P-08](./PENDIENTES_DE_DECIDIR.md#p-08)

**Lo que hace hoy la aplicación:**
- **Dirección** del centro ve todos los chats.
- Un **entrenador** ve el chat de un socio si le ha dado o dirigido alguna sesión
  en los **últimos 90 días**. Ya no existe "el entrenador asignado" fijo para esto.
- **Recepción** solo entra mientras el último mensaje sea del socio (pregunta
  sin responder); en cuanto contesta dirección o el entrenador, deja de verlo
  (E12-02).
- El chat **no promete respuesta inmediata** (E12-02). No hay IA escribiendo en él.

**Lo que decía la regla:** lo ve el entrenador **asignado** al socio y dirección;
la IA podía escribir en el chat.

### RB-ANUN-003 · Vistas de los anuncios

**Estado:** 🟢 Vigente

Dirección publica anuncios en el portal del socio. Cada socio cuenta **una vez
por anuncio** como vista, para la analítica de dirección. Publicar anuncios es
exclusivo de dirección.

### RB-MARCA-001 · El socio recibe la marca de su gimnasio

**Estado:** 🟢 Vigente

Toda comunicación a un socio (correos, enlaces, invitaciones) lleva la marca de
**su organización y su centro**, nunca la de Apta: el socio no ha comprado Apta,
ha comprado su gimnasio. Solo las comunicaciones de plataforma (al director que
compra la licencia) llevan la marca de Apta.

### RB-SMTP-001 · Un fallo de correo no rompe el flujo ni revela nada

**Estado:** 🟢 Vigente

Si el proveedor de correo falla, la acción del usuario se completa igual y la
respuesta visible no cambia (para no revelar si una cuenta existe, ver
`RB-ID-005`). En producción **no se simula** el envío: si no hay correo
configurado, el servidor no arranca (PROD-02/PROD-03).

### Preferencias y consentimiento de correo (sin número `RB`)

**Estado:** 🟢 Vigente

Ningún envío al socio se salta sus preferencias (`canSendMemberEmail`): es el
derecho de oposición del art. 21 RGPD y del art. 21 LSSI. El socio gestiona sus
preferencias en `/preferencias` sin necesidad de entrar en su cuenta.

### Correos que existen hoy

Bienvenida del socio · invitación al personal · verificación de email ·
recuperación de contraseña · enlace de pago del socio · plaza libre (lista de
espera) · cumpleaños · pago fallido · preaviso SEPA · confirmación de mandato
SEPA · tarjeta a punto de caducar · activación del director · valoración
pendiente · recordatorio de sesión · enlace a preferencias · mensaje nuevo de
chat · acuse de baja de cuenta · formulario para rellenar. Además, los correos
de los flujos de marketing.

**No existe:** confirmación de reserva (`RB-AGENDA-005`) ni notificaciones push.

**Dónde vive:** `src/lib/emails/templates.ts`
