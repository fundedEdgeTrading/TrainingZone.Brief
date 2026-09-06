# 02 · Subencargados y transferencias internacionales

**Arts. 28.2, 28.4 y 44-49 RGPD** · Proveedores verificados en `package.json`, `.env.example`, `src/lib/mailer.ts` y `render.yaml`. **No es una lista genérica: es lo que el código llama de verdad.**

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.**

## Los seis proveedores reales

| Proveedor | Función | Dato que sale | Ubicación | Evidencia en el código |
|---|---|---|---|---|
| **Stripe Payments Europe** | Cobros, Connect, Billing | Nombre, email, teléfono, importes, mandato SEPA | Irlanda, con tratamiento en EEUU | `package.json: "stripe"` · `STRIPE_SECRET_KEY` |
| **Anthropic** | Generación de mesociclos | Edad, sexo, objetivos, métricas, **criterios clínicos y texto libre** | EEUU | `package.json: "@anthropic-ai/sdk"` · `ANTHROPIC_API_KEY` |
| **Brevo** | Correo transaccional | Email, nombre, contenido del correo | Francia (UE) | `src/lib/mailer.ts:12` → `api.brevo.com/v3/smtp/email` |
| **Render** | Alojamiento y base de datos | **Toda la base de datos, `HealthRecord` incluido** | ⟦PENDIENTE: confirmación por escrito — 00.C.7⟧ · decisión D-C1 dice UE | `render.yaml` · `DATABASE_URL` |
| **Expo / EAS** | Compilación de la app móvil | Artefactos de build; potencialmente OTA | EEUU | `apps/mobile/` |
| **Google · Microsoft Entra** | SSO | Email, identificador | EEUU / global | `AUTH_GOOGLE_ID`, `AUTH_MICROSOFT_ENTRA_ID_ID` |

> **Sobre Google y Microsoft**: las variables existen, pero los botones de SSO están **permanentemente desactivados** en el login (§4, historia **E8-16**). Hoy no procesan ningún dato. Decidir si se activan o se retiran las variables — **declarar un subencargado que no se usa es tan malo como omitir uno que sí**.

> **Sobre `nodemailer`**: está en `package.json` pero el envío real va por la API HTTP de Brevo, porque Render bloquea los puertos SMTP salientes (`mailer.ts:3-4`). No es un subencargado.

## Estado de los contratos

| Proveedor | DPA | Estado |
|---|---|---|
| Stripe | DPA estándar publicado | ⟦PENDIENTE: aceptar y archivar — 00.C.6⟧ |
| Anthropic | DPA comercial | ⟦PENDIENTE — decisión **D-C5**: se firma antes del piloto⟧ |
| Brevo | DPA estándar publicado | ⟦PENDIENTE: aceptar y archivar⟧ |
| Render | DPA estándar publicado | ⟦PENDIENTE: aceptar y archivar⟧ |
| Expo | Términos de servicio | ⟦PENDIENTE: revisar si aplica encargo⟧ |

**Hasta que el DPA con Anthropic esté firmado, la generación con IA no opera sobre datos de un socio real.** Está escrito como criterio de aceptación en la historia E3-15.

## Transferencias fuera de la UE

| Proveedor | ¿Sale de la UE? | Mecanismo |
|---|---|---|
| Stripe | Sí, a EEUU | ⟦PENDIENTE: DPF o cláusulas tipo⟧ |
| Anthropic | Sí, a EEUU | ⟦PENDIENTE: DPF o cláusulas tipo + análisis de impacto⟧ |
| Brevo | **No** (Francia) | — |
| Render | **No**, si se confirma la UE (D-C1) | — |
| Expo | Sí, a EEUU | ⟦PENDIENTE⟧ |

**La transferencia sensible es Anthropic**, porque es la única por la que salen datos del art. 9. Requiere análisis de impacto de la transferencia, y ese análisis entra en la EIPD del documento 10.

## Autorización de subencargados

El art. 28.2 exige que el responsable —el centro— autorice a los subencargados. Hoy **no hay ningún punto del flujo en que el centro firme nada**: la organización nace del webhook de pago sin aceptación de condiciones ni de encargo (§7 CN-30).

Lo que hay que construir, y está en la historia **E10-04**:

1. Esta lista publicada en una URL estable y versionada.
2. Autorización general con **derecho de oposición** a un subencargado nuevo, en la cláusula del documento 06.
3. Compromiso de notificar cualquier alta o baja con antelación razonable.
4. Aceptación registrada en el Checkout de licencia (`consent_collection.terms_of_service`), con versión, fecha y quién.

## Lo que hay que arreglar en el código

| Qué | Historia |
|---|---|
| Ningún proveedor aparece en `/privacidad` | E10-05 |
| No hay aceptación de condiciones ni de encargo en el alta | E10-04 |
| Verificación de arranque de que la región es UE | E10-07 |
| Filtro de identificadores antes de mandar texto libre a Anthropic | E3-15 |
| `mailer.ts:46-48` vuelca **el HTML completo del correo** al log cuando Brevo no está configurado — evitarlo en producción | §2.4, refuerzo 4 |
