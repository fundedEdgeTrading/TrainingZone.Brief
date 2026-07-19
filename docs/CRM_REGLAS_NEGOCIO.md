# TRAINING ZONE — CRM de Leads, Perfil de Cliente y Gestión de Centro

**Documento de trabajo interno · v1.0**
**Objetivo:** convertir el volcado funcional recibido en un catálogo de reglas de negocio,
campos y estados accionable, siguiendo el mismo criterio que `TRAININGZONE_planfuncionaleimplementacion.md`
(`DOMAIN_RULES.md`). Cada regla numerada (`RB-XXX-NNN`) es candidata a convertirse en un
ticket o en un campo de esquema. Las preguntas abiertas están marcadas explícitamente —
no se han inventado respuestas donde el texto original dejaba una decisión de negocio sin cerrar.

**Relación con el sistema ya construido:** este documento asume el modelo de datos ya
existente en el repo (`Member`, `Center`, `MembershipPlan`, `Subscription`, `ClassSession`,
`Booking`, `Payment`, `HealthRecord`, `AptitudeRule`, `SessionDebrief`, `RetentionAlert`,
`AuditLog`) y describe qué hay que **añadir** o **extender** sobre él, no un sistema desde cero.
Se marca con 🆕 lo que es entidad/módulo nuevo y con ➕ lo que extiende algo que ya existe.

---

## 0. Principio rector

> El embudo comercial (Lead) y la ficha de cliente activo son **el mismo dato visto en dos
> momentos**, no dos sistemas separados. Un Lead que cierra **se convierte** en `Member`
> (conserva historial, no se duplica); un Lead que no cierra **se archiva** como histórico
> de recaptación, nunca se borra.

---

## 1. CRM de Leads (pre-clientes) 🆕

### 1.1. Entidad `Lead`

Un Lead es todo contacto que aún no ha pagado. Se rellena por dos vías:

1. **Formulario público** (web/redes) → el propio lead introduce sus datos.
2. **Entrenador/recepción** → cuando el contacto llega en persona, por teléfono, o por un
   formulario web que no trae todos los campos, el responsable que atiende **debe** completar
   los campos obligatorios antes de poder guardar el Lead (bloqueante, no opcional).

| Campo | Obligatorio | Origen típico | Notas |
|---|---|---|---|
| Nombre y apellidos | Sí | Formulario / entrenador | |
| Teléfono | Sí | Formulario / entrenador | Canal de reset de contraseña vía SMS (ver 1.2) |
| Email | **Condicional** | Formulario / entrenador | Ver `RB-LEAD-002` |
| Zona (vive / trabaja cerca) | Sí | Formulario / entrenador | Campo libre o código postal — **abierto**, ver §11 |
| Fecha de contacto | Sí (auto) | Sistema | Se sella sola al crear el registro |
| Responsable del contacto | Sí | Entrenador/recepción | Ver `RB-LEAD-003` |
| Estado del lead | Sí (auto) | Sistema | Máquina de estados, ver 1.4 |
| Canal de origen | Sí | Formulario / entrenador | Ver `RB-LEAD-004` |
| Objetivos | Sí | Formulario / entrenador | Texto libre + posible checklist (ver 2.4) |
| Ocupación / a qué se dedica | Sí | Formulario / entrenador | Alimenta la analítica de nicho (§9.3) |
| Lesiones / enfermedades / patologías | Sí (aunque sea "ninguna") | Formulario / entrenador | Dato Art. 9 RGPD — mismo tratamiento que `HealthRecord` (consentimiento explícito, acceso restringido) |
| ¿Ha entrenado antes? | Sí | Formulario / entrenador | Booleano + texto libre opcional |
| Comentarios internos | No (pero siempre visible) | Entrenador | Campo de bitácora, ver 1.7 |

**`RB-LEAD-001`** — Todos los campos marcados "Obligatorio" son bloqueantes: el formulario
(sea autocompletado por el lead o por el staff) no permite guardar sin ellos.

**`RB-LEAD-002`** — Cuenta de acceso. El alta de cuenta se puede hacer con **email o con
teléfono** como identificador. Si el lead solo da teléfono, el sistema debe permitir alta sin
email (email pasa a opcional en ese caso, pero se recomienda pedirlo para poder mandar
recibos/facturas más adelante). El restablecimiento de contraseña siempre es por **SMS al
teléfono registrado**, exista o no email.

**`RB-LEAD-003`** — Responsable del contacto. Si el contacto es presencial, se asigna
automáticamente al entrenador/recepcionista que lo atiende (usuario logueado). Si llega por
un formulario web, el campo queda vacío hasta que un responsable de centro lo revisa y **se
autoasigna o asigna a otro compañero** — no puede quedar un lead sin responsable pasado un
plazo (ver `RB-LEAD-009`, abierto).

**`RB-LEAD-004`** — Canal de origen (`comoNosConocio`), lista cerrada configurable:
`Boca a boca`, `Instagram`, `TikTok`, `Web`, `Vive/trabaja por la zona`, `Otro` (con texto).
Esta lista debe ser editable por dirección sin desplegar código (tabla, no enum fijo en código
— igual que las reglas de aptitud del módulo de salud).

### 1.2. Máquina de estados del Lead

```
SIN_CONTACTAR → SEGUIMIENTO → CON_FECHA_VALORACION → CERRADO
                     ↓                  ↓
                     └──────────→ NO_CERRADO (histórico)
```

| Estado | Significado | Quién lo cambia |
|---|---|---|
| `SIN_CONTACTAR` | Lead recién creado, nadie le ha hablado aún | Sistema (por defecto) |
| `SEGUIMIENTO` | Se le ha contactado, está en conversación | Responsable del lead |
| `CON_FECHA_VALORACION` | Tiene cita agendada para valoración/prueba | Responsable del lead |
| `CERRADO` | Se ha dado de alta como cliente | Sistema, automático al cumplirse `RB-LEAD-005` |
| `NO_CERRADO` | No ha comprado — pasa a histórico de recaptación | Responsable del lead (manual) |

**`RB-LEAD-005`** — **Un Lead solo puede pasar a `CERRADO` si existe al menos un pago
confirmado vía Stripe** asociado a ese Lead (primera cuota, matrícula, o bono). No basta con
que el entrenador marque "ha cerrado" — esa acción **inicia** el proceso de alta (crea el
`Member` en estado `TRIAL`/`ACTIVE` según corresponda) pero el estado `CERRADO` del lead y el
paso a la base de clientes activos **se confirma solo cuando Stripe confirma el cobro**. Si el
pago falla o se cancela, el lead vuelve a `SEGUIMIENTO` con una nota automática.

**`RB-LEAD-006`** — Al marcar `NO_CERRADO`, el registro **no se borra**: pasa a una tabla/estado
de histórico, consultable para campañas de recaptación (marketing), con todos sus datos
(incluida la razón de no cierre si se registró — campo opcional recomendado, ver §11).

**`RB-LEAD-007`** — Al confirmarse el cierre (`RB-LEAD-005`), todos los datos del Lead se
**trasladan al perfil de `Member`** (no se duplica captura de datos): nombre, teléfono, email,
zona, objetivos, ocupación, lesiones/patologías, si ha entrenado antes, y el histórico de
comentarios internos.

### 1.3. Comentarios internos del Lead/Cliente

**`RB-LEAD-008`** — Tanto en el Lead como después en el `Member`, debe existir un apartado de
**comentarios de bitácora** (no un solo campo de texto, sino una lista cronológica tipo
"nota + autor + fecha") donde cualquier entrenador o recepción pueda anotar observaciones
libres sobre la situación del cliente o cómo proceder con él. Estas notas son **distintas** de
los datos estructurados (objetivos, lesiones, etc.) y no tienen formato fijo.

---

## 2. Perfil de Cliente Activo (`Member`) ➕

### 2.1. Ficha resumen (vista rápida / tarjeta de cliente)

Estos son los datos que deben verse **de un vistazo** al abrir un cliente desde el listado de
activos del centro:

- Foto de perfil
- Nombre y apellidos
- Teléfono
- Edad (derivada de fecha de nacimiento)
- Lesiones activas (resumen/semáforo, no el detalle clínico completo)
- Servicio(s) contratado(s)
- Antigüedad (tiempo que lleva como cliente)

### 2.2. Tipos de servicio y perfiles híbridos

**`RB-PERFIL-001`** — Un cliente puede tener **más de un servicio simultáneo**:
- Entrenamiento personal (EP)
- Grupos reducidos
- Entrenamiento online (para casa)
- Combinaciones: EP + Grupos, EP + Online

El perfil del cliente debe mostrar **secciones condicionales**: si tiene EP, se abre la sección
de entrenamiento personal (entrenador asignado, rutinas, valoraciones); si tiene grupos, se
abre la sección de reservas de grupo; ambas pueden coexistir en el mismo perfil.

**`RB-PERFIL-002`** — Entrenador responsable:
- Cliente de **EP** → tiene un **entrenador responsable** asignado explícitamente.
- Cliente de **solo grupos** → el responsable "de cara al cliente" es **Training Zone**
  (marca/equipo), aunque internamente la programación la gestiona el agente de IA (§4.2).
- **Abierto:** ¿el cliente de **solo online** tiene entrenador responsable asignado o también
  "Training Zone"? (ver §11).

### 2.3. Objetivos y valoración inicial

**`RB-PERFIL-003`** — En la valoración inicial se capturan los objetivos del cliente en texto
libre, **más** un set de objetivos concretos y medibles cuando el objetivo declarado es de
tipo "salud", derivados de esa primera valoración. Catálogo de ejemplo (debe ser editable, no
hardcoded):
- Conseguir hacer 1 flexión completa
- Conseguir hacer 10 sentadillas con el peso corporal
- Mejorar el dolor de espalda
- Mejorar el dolor de rodilla
- Sentir más energía en el día a día

Estos objetivos concretos son la base de comparación para el seguimiento periódico (§9.4) y
para las recomendaciones de la IA (§4.5).

**`RB-PERFIL-004`** — Datos de salud (lesiones/enfermedades/patologías) del cliente activo
siguen el mismo tratamiento Art. 9 RGPD ya implementado para `HealthRecord`: consentimiento
explícito, acceso restringido a entrenador asignado + dirección, y registro de auditoría en
cada lectura. Esto **no cambia** respecto al sistema actual, solo se confirma que el dato
capturado en el Lead se convierte en el primer `HealthRecord` del `Member`.

---

## 3. Agenda y Reservas ➕

### 3.1. Visibilidad segmentada

**`RB-AGENDA-001`** — Reglas de visibilidad de huecos:

| Rol / tipo de cliente | Ve grupos | Ve huecos de EP |
|---|---|---|
| Cliente de grupos | Sí (puede reservar) | No |
| Cliente de EP | No | Solo las franjas que el centro marque como "abiertas a autorreserva" (ver `RB-AGENDA-002`) |
| Entrenador | Sí | Sí (todas) |

**`RB-AGENDA-002`** — Entrenamiento personal: por defecto **lo agenda el entrenador**
directamente en la ficha del cliente. El centro puede marcar ciertas franjas horarias como
**"autorreservables"** para que el propio cliente de EP pueda coger hueco sin pasar por el
entrenador. **Abierto:** ¿cuántas franjas, con qué antelación, y quién decide cuáles son
autorreservables — el entrenador de cada cliente o dirección globalmente? (ver §11).

### 3.2. Check-in / asistencia y entrenador director de sesión

**`RB-AGENDA-003`** — Al comenzar cada sesión (tanto EP como grupo reducido), el entrenador
debe poder marcar, por cliente: **Asistió** / **No asistió** (tick, ya existe como mecanismo
de check-in en `Booking.status` — se extiende a EP, hoy solo cubre grupos).

**`RB-AGENDA-004`** — En cada sesión (EP y grupo) debe registrarse **qué entrenador la ha
dirigido efectivamente**, que puede ser distinto del entrenador asignado originalmente
(sustituciones). Este dato alimenta el cruce con el registro horario (§8.2).

### 3.3. Notificaciones

**`RB-AGENDA-005`** — El cliente recibe notificación al reservar (confirmación) y recordatorio
antes de cada sesión reservada (EP o grupo). La reserva confirmada debe aparecer siempre
visible en "Mis próximas sesiones" dentro de su perfil.

---

## 4. Entrenamientos, Rutinas y Agente de IA 🆕

### 4.1. Rutinas para casa

**`RB-IA-001`** — Cualquier cliente (de grupos o de EP) puede recibir una rutina para hacer en
casa. La rutina la genera/gestiona el agente de IA, pero **siempre bajo supervisión y
confirmación de un entrenador humano** antes de que llegue al cliente como definitiva.

### 4.2. Agente de IA de programación (uso exclusivo del staff)

**`RB-IA-002`** — Existe un agente de IA para programar entrenamientos, tanto de EP como de
grupos. **Este agente solo lo ven y usan los entrenadores** (herramienta interna), no es un
chat directo IA-cliente para la programación de sala/grupo.

### 4.3. Solicitud de rutina online por el cliente

**`RB-IA-003`** — Flujo: el cliente solicita una rutina para casa → la IA la programa y hace
seguimiento continuo (ajustes, preguntas) → **el entrenador asignado es siempre quien
confirma** la programación antes de que se active, y sigue siendo el responsable de cara al
cliente aunque la interacción del día a día sea con la IA.

### 4.4. Seguimiento de progreso visible al cliente

**`RB-IA-004`** — El cliente debe ver en su perfil: datos y gráficas de su progresión (según lo
que se esté midiendo: peso, marcas de fuerza, asistencia, cumplimiento de objetivos de
salud del punto 2.3, etc.).

### 4.5. Autovaloraciones + recomendación de IA

**`RB-IA-005`** — El propio cliente puede rellenar una autovaloración (p. ej. cómo se ha
sentido en su primer mes, o si nota estancamiento). La IA analiza esa autovaloración y genera
una recomendación. Ejemplo de flujo completo:

```
Cliente rellena autovaloración: "me siento estancado"
  → IA detecta patrón de estancamiento
  → notifica al entrenador asignado
  → entrenador contacta al cliente
  → acción comercial sugerida: sesión de regalo / upsell (1 día más/semana,
    nutrición, cambio de modalidad de entrenamiento)
```

Esto conecta directamente con el motor de ofertas personalizadas (§8.6): la detección de
estancamiento es una de las señales de entrada de ese motor, no un sistema aparte.

### 4.6. Seguimiento periódico de objetivos (check-in recurrente)

**`RB-IA-006`** — Cada cierto tiempo (**abierto: periodicidad exacta**, ver §11) el sistema debe
preguntar al cliente si ha cambiado algo respecto a su objetivo: si lo ha modificado, si se ve
estancado, o si quiere ir a por más. Estas respuestas alimentan tanto la recomendación de IA
(§4.5) como el reporte semanal al equipo (§8.7).

---

## 5. Comunicación (Chat) 🆕

**`RB-CHAT-001`** — Existe un chat entre el centro y cada cliente. La IA puede escribir en ese
chat (recordatorios, seguimiento de rutina, preguntas de valoración), pero:
- El **entrenador asignado** al cliente siempre puede ver la conversación completa.
- Los **trabajadores con rol de dirección** también tienen visibilidad total de cualquier chat.
- Los entrenadores **no asignados** a ese cliente no ven su chat (salvo que sean director).

---

## 6. Pagos y Cuotas (Stripe) ➕

**`RB-PAGO-001`** — Todo cobro (matrícula, cuota, bono, sesión suelta) se gestiona a través de
Stripe. No hay registro de cobro manual paralelo para clientes activos (a diferencia del MVP
inicial de "registro manual en mostrador" — aquí se asume Stripe como único canal, sea con
tarjeta o domiciliación gestionada por Stripe).

**`RB-PAGO-002`** — El cierre de un Lead (`RB-LEAD-005`) depende de la confirmación de pago de
Stripe, no de una acción manual del entrenador.

---

## 7. Vista de "Clientes activos del centro" (listado + ficha) ➕

**`RB-VISTA-001`** — Listado de clientes activos con: foto, nombre, teléfono, edad, lesiones
(resumen), servicio contratado, antigüedad (§2.1). Al entrar en un cliente concreto, se
despliegan **todas** las secciones descritas en la sección 2 (datos, objetivos, salud,
comentarios, pagos, agenda, progreso), con las secciones de EP/grupos mostrándose solo si
aplica (§2.2).

---

## 8. Apartado de Personal / RRHH 🆕

### 8.1. Registro horario

**`RB-RRHH-001`** — Cada entrenador registra mensualmente: hora de entrada, hora de salida,
día, y **firma** (confirmación digital de conformidad) de cada jornada.

### 8.2. Verificación cruzada de horas

**`RB-RRHH-002`** — Con el registro horario (§8.1) y el registro de qué entrenador ha dirigido
cada sesión (`RB-AGENDA-004`), el sistema debe poder generar una comparativa/alerta si las
horas fichadas no cuadran con las sesiones dirigidas registradas ese día (ni por exceso ni por
defecto). Es una herramienta de verificación para dirección, no un bloqueo automático de
nóminas.

### 8.3. Propuestas y mejoras

**`RB-RRHH-003`** — Los entrenadores pueden enviar propuestas/mejoras que llegan
directamente al director (bandeja tipo buzón de sugerencias, con notificación a dirección).

### 8.4. Ventas del mes

**`RB-RRHH-004`** — Cuando se registra una venta (cierre de un Lead o venta adicional a un
cliente existente: upsell, bono, etc.) en el CRM, se anota **quién** ha realizado la venta. Esto
alimenta el ranking/reporte de ventas por trabajador y por mes.

### 8.5. Panel del entrenador: clientes propios y alertas de programación

**`RB-RRHH-005`** — Cada entrenador ve sus propios clientes de EP con: análisis y gráficos de
seguimiento, horas de EP y de grupos realizadas al mes.

**`RB-RRHH-006`** — La IA debe detectar cuándo a un cliente de EP **le quedan pocas sesiones ya
programadas** (no confundir con sesiones consumidas del bono: aquí se refiere a que el
calendario futuro del cliente se está quedando sin entrenamientos planificados) y notificar al
entrenador responsable para que programe más.

### 8.6. Notificaciones accionables al entrenador

**`RB-RRHH-007`** — El entrenador debe recibir notificaciones tipo tarea, por ejemplo:
- "Cliente X necesita una valoración — fecha Y"
- "Cliente X: valorar si puede pasar a fase 2"
- "Cliente X: le quedan 2 sesiones del bono, ¿va a renovar?"
- "Cliente X lleva 2 meses viniendo 1 día/semana — ¿ofrecerle 2 días/semana con 20% de
  descuento el primer mes?"

Este último ejemplo es un caso concreto del motor de ofertas personalizadas (§8.7): no es una
notificación aislada, es la salida visible de ese motor.

### 8.7. Motor de ofertas personalizadas

**`RB-RRHH-008`** — El comportamiento del cliente que alimenta las ofertas personalizadas se
registra por **tres vías combinadas**:
1. Automática por software: asistencia real (días que viene), antigüedad, consumo de bono.
2. Preguntada al entrenador (cualitativo).
3. Anotada por el propio cliente (autovaloraciones, RPE, comentarios post-sesión).

Con esas señales, el sistema (IA + reglas) sugiere ofertas concretas al entrenador, que es
quien decide si ofrecerlas. **Abierto:** ¿la oferta requiere aprobación de dirección antes de
comunicarse al cliente, o el entrenador puede ofrecerla directamente? (ver §11).

### 8.8. RPE y anotaciones post-sesión → informe semanal

**`RB-RRHH-009`** — Tras cada sesión, además del check-in de asistencia (`RB-AGENDA-003`), se
captura una valoración de esfuerzo (RPE) y opcionalmente una anotación corta. *(Nota: esto ya
existe como `SessionDebrief` en el sistema actual — feeling 🟢/🟡/🔴 + RPE 1-10 + nota — por lo
que este punto es una confirmación de que el mecanismo ya construido cubre el requisito, no
una funcionalidad nueva)*.

**`RB-RRHH-010`** — Estas anotaciones se acumulan y generan un **reporte semanal para todo el
equipo**, para revisar comentarios y proponer mejoras conjuntamente.

### 8.9. Valoración de entrenadores (confidencial)

**`RB-RRHH-011`** — Periódicamente (**abierto: cada cuánto**, ver §11) se pregunta a los
clientes por su entrenador, generando una valoración cualitativa/cuantitativa de cada
entrenador (fortalezas/áreas de mejora), para usar en reuniones individuales de dirección con
cada entrenador.

**`RB-RRHH-012`** — **Estas valoraciones de entrenadores son visibles únicamente para
dirección.** Los propios entrenadores **no** tienen acceso a esta información. Esto es una
excepción explícita a la regla general de "el entrenador ve los datos de su cliente" — aquí el
dato es sobre el entrenador, no sobre el cliente, y su confidencialidad es una decisión de
negocio explícita del cliente que ha pedido esto.

---

## 9. Analítica / BI para Dirección ➕

Estos indicadores ya existen parcialmente en el panel de control actual (ocupación, ingresos,
retención). Se listan aquí los que son **nuevos** respecto al sistema construido:

**`RB-BI-001`** — Operativos: ocupación media de las sesiones, sesiones/semana totales *(ya
existe)*.

**`RB-BI-002`** — Económicos: LTV por cliente, ticket medio (cuánto paga cada cliente de media)
🆕.

**`RB-BI-003`** — Demográficos/nicho 🆕:
- Edad media de los clientes
- Ocupación/profesión, agrupada por frecuencia (para detectar el nicho principal)
- % de clientes con hijos
- % de clientes que son empresarios, y a qué se dedican (segmento declarado como
  numeroso y de interés comercial)

**`RB-BI-004`** — Seguimiento de objetivos agregado: cuántos clientes han modificado su
objetivo, cuántos se ven estancados, cuántos piden "más" en el último check-in periódico
(§4.6), como entrada agregada para dirección (no solo a nivel de cliente individual).

---

## 10. Roles y matriz de permisos (resumen de lo nuevo)

| Dato / acción | Cliente | Entrenador (no asignado) | Entrenador asignado | Dirección |
|---|---|---|---|---|
| Su propio chat | Lee/escribe | No | Lee/escribe | Lee |
| Comentarios internos (bitácora) | No | Lee/escribe (si atiende al cliente) | Lee/escribe | Lee/escribe |
| Lesiones/patologías | Ve las suyas | No (salvo asignado) | Sí | Sí |
| Valoraciones de entrenadores | No | No | No (ni sobre sí mismo) | Sí — **exclusivo** |
| Registro horario propio | — | Lee/firma el suyo | — | Ve todos |
| Ofertas personalizadas sugeridas | No (hasta que se le comunique) | No | Sí, decide si ofrecerla | Sí |
| Reporte semanal de comentarios | No | Sí (es del equipo) | Sí | Sí |
| Huecos de agenda de grupos | Sí (si es de grupos) | Sí | Sí | Sí |
| Huecos de agenda de EP | No | No | Solo franjas autorreservables (si es su cliente) | Sí |

---

## 11. Preguntas abiertas (decisiones de negocio pendientes)

Estas son las cuestiones que el texto original deja sin cerrar y que conviene decidir antes de
convertir este documento en tickets:

1. **Zona del lead** (`vive/trabaja por la zona`): ¿campo de texto libre, código postal, o radio
   en un mapa? Condiciona si se puede usar para segmentar campañas por proximidad.
2. **Plazo máximo sin responsable**: si un lead de formulario web no se asigna a nadie, ¿a
   partir de cuánto tiempo salta una alerta a dirección?
3. **Razón de no cierre**: ¿se pide obligatoriamente un motivo al marcar `NO_CERRADO` (precio,
   horarios, se fue a la competencia, no decide...) para poder segmentar mejor la
   recaptación?
4. **Entrenador responsable en modalidad "solo online"**: ¿asignado individual o "Training
   Zone" como en grupos?
5. **Franjas autorreservables de EP**: ¿cuántas por semana, con qué antelación, y quién las
   configura (el propio entrenador por cliente, o una política global de centro)?
6. **Periodicidad del check-in de objetivos** (§4.6) y de la **valoración de entrenadores**
   (§8.6): ¿mensual, trimestral, configurable por tipo de servicio?
7. **Aprobación de ofertas personalizadas**: ¿el entrenador puede ofrecer el descuento
   directamente al detectarlo el sistema, o necesita luz verde de dirección antes de
   comunicarlo al cliente?
8. **Umbral de "pocas sesiones programadas"** (`RB-RRHH-006`): ¿cuántas sesiones futuras
   quedando disparan la alerta de reprogramación?
9. **Definición exacta de "cliente estancado"** para la IA (§4.5): ¿solo por autovaloración
   textual, o también por señales objetivas (caída de asistencia, RPE bajo sostenido, etc.,
   reutilizando el motor de retención ya existente)?

---

## 12. Mapeo a entidades de datos (orientativo, no definitivo)

| Concepto de negocio | Entidad | Estado |
|---|---|---|
| Lead / pre-cliente | `Lead` | 🆕 nueva |
| Historial de no-cierre | Estado `NO_CERRADO` sobre `Lead` | 🆕 (mismo modelo, no tabla aparte) |
| Comentarios de bitácora | `LeadNote` / `MemberNote` | 🆕 nueva |
| Cliente activo | `Member` | ➕ ya existe, se añaden campos (canal de origen, ocupación, referencia al lead de origen) |
| Servicio contratado (EP/grupos/online) | `Subscription` / `MembershipPlan` | ➕ ya existe el patrón, se añade "online" como tipo |
| Entrenador responsable | Relación `Member.trainerId` | 🆕 nueva relación explícita (hoy el entrenador se deduce de la sesión, no del cliente) |
| Objetivos de salud concretos | `ClientGoal` | 🆕 nueva |
| Autovaloración del cliente | `SelfAssessment` | 🆕 nueva |
| Rutina/programación (IA) | `WorkoutProgram` / `WorkoutPlan` | 🆕 nueva |
| Chat cliente-centro | `Conversation` / `ChatMessage` | 🆕 nueva |
| Check-in asistencia | `Booking.status` | ➕ ya existe para grupos, se confirma uso en EP |
| Entrenador que dirige la sesión | `ClassSession.trainerId` en el momento de check-in | ➕ ya existe el campo, se confirma que puede diferir del asignado originalmente |
| RPE + nota post-sesión | `SessionDebrief` | ➕ ya existe, cubre el requisito tal cual |
| Registro horario | `TimeClockEntry` | 🆕 nueva |
| Propuestas/mejoras al director | `StaffProposal` | 🆕 nueva |
| Venta atribuida a trabajador | Campo `soldByUserId` en `Payment`/`Subscription` | 🆕 nuevo campo |
| Oferta personalizada | `PersonalizedOffer` | 🆕 nueva |
| Valoración de entrenador (confidencial) | `TrainerRating` | 🆕 nueva, visibilidad restringida a `OWNER` |
| Reporte semanal de comentarios | Vista agregada sobre `SessionDebrief`/notas, no tabla nueva | — |

---

*Fin del documento. Siguiente paso sugerido: cerrar las preguntas de §11 y priorizar qué
bloque (Lead/CRM, Agenda EP, IA de programación, RRHH) entra primero en el backlog de
implementación.*
