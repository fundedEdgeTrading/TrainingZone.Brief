# 03 · Plazos de conservación

**Decisión D-C3**: propuesta estándar ahora, validada después; el motor se construye con plazos **parametrizables por organización**, con un mínimo legal que no se puede relajar.

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.** La norma citada en cada fila es la propuesta de anclaje, no un dictamen. ⟦PENDIENTE: validación — 00.C.3⟧

Hoy **no existe ninguna regla de retención**: `api/jobs/run` ejecuta once reglas y **ninguna borra nada** (§7 CN-04). Un socio de baja en 2019 conserva íntegras sus lesiones, sus fotos y su bioimpedancia.

## Tabla

| # | Dato | Modelos | Plazo | Anclaje | Desde |
|---|---|---|---|---|---|
| 1 | Ficha del socio y contrato | `Member`, `Subscription`, `CenterMembership` | **6 años** | art. 30 CCom | baja |
| 2 | Cobros y justificantes | `Payment` | **6 años** · fiscal 4 (art. 66 LGT) | art. 30 CCom | emisión |
| 3 | **Datos de salud** | `HealthRecord`, `Assessment`, `SessionDebrief`, `SelfAssessment`, `ClientFeedback`, `PerformanceMetric` | **5 años** | art. 1964 CC — prescripción de acciones personales, coherente con la base del art. 9.2.f | baja |
| 4 | **Fotografías de progreso** | `MemberProgressEntry.photo*Url` | **borrado a la baja** | minimización, art. 5.1.c | baja |
| 5 | Métricas de composición corporal | `MemberProgressEntry` (numéricos) | **5 años** | igual que 3 | baja |
| 6 | Notas internas | `MemberNote`, `LeadNote` | **2 años** | minimización | último uso |
| 7 | Registro de auditoría | `AuditLog` | **3 años** | art. 32 · trazabilidad | escritura |
| 8 | Leads no convertidos | `Lead`, `LeadNote` | **12 meses** | interés legítimo agotado | último contacto |
| 9 | Leads convertidos | `Lead` | se disocia al convertir | — | conversión |
| 10 | Consentimientos y revocaciones | `consent*At`, `consentVersion` | **mientras dure la relación + 6 años** | prueba del art. 7.1 | revocación |
| 11 | Baja de comunicaciones | fecha de baja | **indefinido** | es la prueba del art. 21 — **no se borra** | — |
| 12 | Invitaciones caducadas | `Invitation` | **30 días** tras `expiresAt` | minimización | caducidad |
| 13 | Tokens de refresco revocados | `MobileRefreshToken` | **90 días** | investigación de incidentes | revocación |
| 14 | Organizaciones sin pagar | `Organization` en `PENDING_PAYMENT` | **30 días** | el esquema **ya anuncia el TTL** y no está implementado | creación |
| 15 | Conversaciones | `Conversation`, `ChatMessage` | **2 años** | minimización | último mensaje |
| 16 | Mesociclos y conversación con la IA | `Mesocycle.aiConversation` | **se purga al aprobar** | minimización · **E3-18** | aprobación |
| 17 | Fichajes | `TimeClockEntry` | **4 años** | art. 34.9 ET | registro |

> **Fila 17 · el módulo se apaga** (decisión D-P6 derivada, **E10-21**). Antes de retirar el modelo hay que **exportar y conservar** lo que exista: el plazo de 4 años sigue corriendo aunque la funcionalidad desaparezca.

> **Fila 11 · no es un descuido.** La baja de comunicaciones guarda **fecha, no booleano**, porque es la prueba de que la persona ejerció el art. 21. Borrarla destruye la prueba de haberla respetado. El código ya lo hace bien.

## Anonimización, no borrado

Al vencer el plazo de un ex-socio, lo correcto **no es borrar la fila**: es disociarla.

- Se retiran identificativos, contacto, dirección y fotografías.
- Se conserva el histórico agregado no identificable (asistencia, consumo, ingresos) para contabilidad y estadística.
- Los `Payment` **se disocian, nunca se borran** — hoy `payment.deleteMany` los destruye (**E10-09**).

## Qué hay que construir

`runDataRetentionRule(orgId)` en `api/jobs/run`, con la tabla como configuración y no como código, dejando constancia de cuántas filas afectó cada regla. Historia **E10-08**.
