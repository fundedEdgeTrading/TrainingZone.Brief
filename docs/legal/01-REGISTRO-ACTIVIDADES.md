# 01 · Registro de actividades de tratamiento

**Art. 30 RGPD** · Borrador generado desde el esquema de Prisma (52 modelos), `src/lib/rbac.ts`, `src/lib/health-access.ts` y `src/lib/consent.ts`.

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.** La asignación de bases jurídicas es una propuesta razonada, no un dictamen.

**La excepción del art. 30.5 (menos de 250 empleados) no aplica aquí**: se tratan datos del art. 9 de forma no ocasional. Este registro es obligatorio.

**Responsable por defecto:** el centro (en el piloto, `Training Zone Cesar Augusto S.L.`).
**Encargado:** Apta ⟦PENDIENTE: razón social y NIF — ver 00.A.1⟧.
**Excepción:** el tratamiento **T13** tiene a Apta como responsable, no como encargado.

---

## T01 · Gestión de socios y prestación del servicio

| | |
|---|---|
| **Finalidad** | Alta del socio, reserva de sesiones, control de aforo y asistencia, gestión del bono |
| **Interesados** | Socios del centro |
| **Categorías** | Identificativos (`firstName`, `lastName`, `email`, `phone`, `birthDate`), postales (`address`, `addressLine2`, `city`, `province`, `postalCode`), contacto de emergencia (`emergencyContact`), fotografía de perfil (`photoUrl`) |
| **Modelos** | `Member`, `CenterMembership`, `Booking`, `ClassSession`, `SessionTemplate`, `Subscription` |
| **Base jurídica** | Art. 6.1.b — ejecución del contrato |
| **Acceden** | `OWNER`, `CENTER_DIRECTOR`, `TRAINER`, `TRAINER_ADMIN`, `RECEPTION`, acotados por ámbito de centro |
| **Cesiones** | Ninguna |
| **Plazo** | Ver 03 · relación contractual + 6 años |
| **Medidas** | Aislamiento multi-tenant por `orgId`; ámbito de centro vía `isCenterInScope`; `notFound()` fuera de ámbito, de modo que la ficha no existe desde fuera |

> **Riesgo abierto**: el contacto de emergencia es un **dato de un tercero** que el socio aporta sin que ese tercero lo sepa. Hay que informarle o justificar el art. 14.5.b. **No está resuelto hoy.**

## T02 · Salud y aptitud para el entrenamiento ★ Art. 9

| | |
|---|---|
| **Finalidad** | Valorar la aptitud del socio, adaptar la sesión, evitar lesiones y poder acreditar que se adaptó |
| **Interesados** | Socios |
| **Categorías** | **Datos de salud**: lesiones y zona (`HealthRecord.description`, `zone`), condiciones crónicas, medicación, cirugías, screening, dolor referido, objetivos clínicos |
| **Modelos** | `HealthRecord`, `Assessment`, `AptitudeRule`, `SessionDebrief`, `SelfAssessment`, `ClientFeedback`, `TrainerDebrief`, `PerformanceMetric`, `ClientGoal`, `MemberNote` |
| **Base jurídica** | Art. 9.2.f (formulación, ejercicio o defensa de reclamaciones) + art. 6.1.b ⟦PENDIENTE: validación jurídica — ver 00.C.4⟧ |
| **Acceden** | Solo `OWNER`, `CENTER_DIRECTOR`, `TRAINER`, `TRAINER_ADMIN` (`canViewHealthData`, `rbac.ts:220`). **Recepción, RRHH y Admin de plataforma quedan excluidos y reciben `null`, nunca un error que revele si el dato existe** |
| **Plazo** | Ver 03 · relación + 5 años |
| **Medidas** | Punto único de acceso `health-access.ts`; cada lectura escribe `AuditLog` con `HEALTH_RECORD_READ` |

> **Por qué 9.2.f y no consentimiento**: el alta no se completa sin declaración de salud (decisión de dirección). El art. 7.4 presume no libre un consentimiento que condiciona la prestación del servicio, así que **llamarlo consentimiento es lo que lo vuelve atacable**. Ver documento 05.

## T03 · Composición corporal y fotografías de progreso ★ Art. 9

| | |
|---|---|
| **Finalidad** | Seguimiento de la evolución física del socio |
| **Categorías** | `bodyFatPct`, `visceralFatRating`, `bmi`, `metabolicAge`, `muscleMassKg`, `bodyWaterPct`, y **fotografías frontal, de perfil y de espalda** (`photoFrontUrl`, `photoSideUrl`, `photoBackUrl`) |
| **Modelos** | `MemberProgressEntry`, `ReferenceRange` |
| **Base jurídica** | Art. 9.2.a — consentimiento explícito (`consentImages`, por defecto `false`) |
| **Acceden** | Los mismos cuatro roles de T02 |
| **Plazo** | Ver 03 · **las fotografías se borran a la baja** |

> **Dos incumplimientos abiertos, ambos con historia asignada**: recepción ve hoy esta sección sin gate y sin auditoría (§7 CN-02 → **E10-02**); y las fotos se guardan como `data:image/jpeg;base64` en columnas de texto de Postgres, de modo que **un volcado de la base de datos las entrega legibles** (§7 CN-16 → **E10-20**). Son fotos habitualmente en ropa interior.

## T04 · Cobros y facturación

| | |
|---|---|
| **Finalidad** | Cobrar la cuota o el bono, gestionar impagos, conservar el justificante |
| **Categorías** | Importes, método de pago, referencia de mandato SEPA, últimos 4 dígitos, identificadores de Stripe. **Apta no almacena datos de tarjeta** |
| **Modelos** | `Payment`, `Subscription`, `MembershipPlan`, `StripeAccount` |
| **Base jurídica** | Art. 6.1.b (contrato) + art. 6.1.c (obligación contable y fiscal) |
| **Cesiones** | **Stripe Payments Europe** — ver 02 |
| **Plazo** | Ver 03 · 6 años (art. 30 CCom) / 4 años (art. 66 LGT) |

> **Incumplimiento abierto**: `members/[id]/actions.ts:426` ejecuta `payment.deleteMany` al suprimir un socio — **destruye justificantes dentro del plazo de prescripción**, y el diálogo dice que se anonimizan. Historia **E10-09**.

## T05 · Captación comercial (leads)

| | |
|---|---|
| **Finalidad** | Gestionar el interés de una persona que aún no es socia |
| **Categorías** | Identificativos, `postalCode`, ocupación, sexo, hijos, objetivos — **y hoy también un campo de salud en texto libre** |
| **Modelos** | `Lead`, `LeadNote`, `LeadChannel`, `NoCloseReason` |
| **Base jurídica** | Art. 6.1.a — consentimiento ⟦PENDIENTE: hoy no se recoge⟧ |
| **Plazo** | Ver 03 · 12 meses si no convierte |

> **Es el hallazgo con peor relación coste/exposición de todo el repositorio** (§7 CN-01 → **E10-01**): el formulario público pide *"¿Alguna lesión, enfermedad o patología?"* como campo **obligatorio**, sin casilla, sin capa informativa y sin enlace a privacidad — y `health-access.ts:100-138` estampa `consentSignedAt: new Date()`, **la firma de un consentimiento que nadie ha prestado**.

## T06 · Comunicaciones comerciales

| | |
|---|---|
| **Finalidad** | Enviar promociones y avisos no imprescindibles |
| **Base jurídica** | Art. 6.1.a + art. 21 LSSI (`consentMarketing`, por defecto `false`, casilla no premarcada) |
| **Plazo** | Hasta revocación |
| **Medidas** | Doble capa: baja global e interruptor por tipo; cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` (RFC 8058); se guarda **fecha de baja, no booleano**, porque es la prueba del ejercicio del art. 21 |

> Este tratamiento está **bien resuelto** en el código y conviene no tocarlo (§7.5).

## T07 · Programación asistida por inteligencia artificial ★ Art. 9

Ver documento **04** para el detalle completo.

| | |
|---|---|
| **Finalidad** | Generar una propuesta de mesociclo que un profesional revisa y aprueba |
| **Base jurídica** | Art. 9.2.a — consentimiento explícito y separado (`consentAI`), revocable sin perder acceso al servicio |
| **Cesiones** | **Anthropic** (EEUU) — ver 02 |
| **Medidas** | `canUseClinicalDataForAI` exige `consentAI && consentHealth`; sin consentimiento se toma la vía sin datos clínicos avisando al modelo; toda lectura audita `MESOCYCLE_AI_INPUT_READ`; el mesociclo nace `DRAFT` y exige aprobación humana |

> **Promesa incumplida**: la pantalla dice *"nunca nombre, DNI, teléfono ni email"* y **no existe filtro de texto libre** (§7 CN-08 → **E3-15**).

## T08 · Gestión del personal del centro

| | |
|---|---|
| **Interesados** | Trabajadores del centro |
| **Categorías** | Identificativos, credenciales, imputación a centros, **valoraciones que los socios hacen del entrenador**, ranking de ventas |
| **Modelos** | `User`, `Identity`, `CenterMembership`, `TrainerRating`, `TimeClockEntry` |
| **Base jurídica** | Art. 6.1.b + art. 6.1.c |
| **Acceden** | `OWNER`, `HR_MANAGER`, `PLATFORM_ADMIN` (`canManageStaff`). **RRHH no ve datos de salud ni valoraciones de entrenadores** |

> Ver documento **08**. Dos cosas abiertas: no hay cláusula informativa (art. 89.1 LOPDGDD), y al entrenador se le niega hoy el acceso a sus propias valoraciones, que **son dato personal suyo** (§7 CN-20 → **E10-16**). El módulo de fichajes se apaga (**E10-21**).

## T09 · Registro de accesos y auditoría

| | |
|---|---|
| **Finalidad** | Acreditar quién accedió a qué dato de salud, art. 32 RGPD |
| **Modelos** | `AuditLog` |
| **Base jurídica** | Art. 6.1.c |
| **Acciones registradas** | `HEALTH_RECORD_READ`, `HEALTH_RECORD_CREATED`, `HEALTH_RECORD_CREATED_FROM_ASSESSMENT`, `HEALTH_RECORD_STATUS_CHANGED`, `LEAD_HEALTH_RECORD_READ`, `LEAD_HEALTH_RECORD_CREATED`, `MESOCYCLE_AI_INPUT_READ` |
| **Plazo** | Ver 03 · 3 años |

> **El registro es append-only por convención, no por construcción**: no hay trigger ni RLS, y `members/[id]/actions.ts:461` ya ejecuta `auditLog.updateMany`. **Un log que quien es auditado puede modificar no sostiene una impugnación** (**E10-14**).

## T10 · Autenticación y seguridad

| | |
|---|---|
| **Categorías** | Credenciales (`passwordHash`, bcrypt), tokens de refresco móviles, tokens de invitación y verificación |
| **Modelos** | `Identity`, `MobileRefreshToken`, `Invitation` |
| **Base jurídica** | Art. 6.1.b + art. 6.1.f |
| **Medidas** | Access token de 15 min; refresh opaco de 30 días hasheado en base de datos, **con rotación en cada uso y detección de reuso que revoca toda la familia**; tokens de URL con HMAC-SHA256, `purpose` dentro de la firma y comparación en tiempo constante |

> Está **bien construido** (§7.5). Lo que falta es límite de intentos: **12 intentos fallidos consecutivos se procesan todos** (**E1-10**).

## T11 · Analítica de negocio y retención

| | |
|---|---|
| **Finalidad** | Detectar riesgo de baja, medir ocupación, decidir inversión comercial por barrio |
| **Categorías** | Asistencia, consumo de bono, estado de pago, **código postal** |
| **Modelos** | `RetentionAlert`, `CheckinScheduleConfig`, agregados de panel y mapa |
| **Base jurídica** | Art. 6.1.f — interés legítimo ⟦PENDIENTE: ponderación por escrito⟧ |
| **Medidas** | `retention.ts:95-104` documenta explícitamente **por qué no replica la causa clínica** en la alerta: viaja a pantallas donde llega recepción. Es el criterio correcto |

> **Reglas automatizadas del cron**: `runRetentionAlertRule`, `runConsecutiveNoShowsRule`, `runStallDetectionRule`, `runLowPackBalanceRule`, `runFewSessionsScheduledRule`, `runAssessmentDueRule`, `runFeedbackCycleRule`, `runPeriodicCheckinRule`, `runBirthdayRule`, `runLeadOwnerAlertRule`, `runScheduledCancellationsRule`. **Ninguna produce una decisión con efectos jurídicos sobre el socio**: generan avisos internos. Ver documento 10 sobre el art. 22.

## T12 · Mensajería centro ↔ socio

| | |
|---|---|
| **Modelos** | `Conversation`, `ChatMessage` |
| **Base jurídica** | Art. 6.1.b |
| **Riesgo** | `RECEPTION` ve **todos** los chats de forma permanente, sin acotar (**E12-02**) |

## T13 · Relación comercial Apta ↔ centro — **Apta es RESPONSABLE**

| | |
|---|---|
| **Finalidad** | Vender y facturar la licencia del software al centro |
| **Interesados** | Personas de contacto del centro cliente |
| **Categorías** | Identificativos de contacto, razón social, NIF, datos de suscripción |
| **Modelos** | `Organization`, `Identity` del `OWNER`, suscripción de plataforma |
| **Base jurídica** | Art. 6.1.b |
| **Cesiones** | Stripe (plano de plataforma) |

> **Este es el tratamiento que se olvida siempre.** En T01-T12 Apta es encargado; aquí es responsable, y necesita su propia información del art. 13 dirigida al cliente B2B, distinta de la del socio.

---

## Resumen

| | Tratamientos |
|---|---|
| Total | **13** |
| Con datos del art. 9 | 3 (T02, T03, T07) |
| Con Apta como responsable | 1 (T13) |
| Con cesión a tercero | 3 (T04 Stripe · T07 Anthropic · T06 Brevo) |
| Con incumplimiento abierto y historia asignada | 7 (T02, T03, T04, T05, T07, T08, T09) |
