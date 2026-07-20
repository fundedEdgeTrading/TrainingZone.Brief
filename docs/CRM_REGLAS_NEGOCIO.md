# TRAINING ZONE — CRM de Leads, Perfil de Cliente y Gestión de Centro

**Documento de trabajo interno · v1.1**
**Cambios v1.1:** cerradas las 9 decisiones de negocio que en v1.0 quedaban abiertas en §11.
Cada decisión se ha convertido en regla concreta (`RB-*`) en su sección correspondiente y la §11
pasa a ser el registro histórico de esas decisiones.
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
| Código postal | Sí | Formulario / entrenador | Campo estructurado (no texto libre). Base para segmentación por proximidad y mapa de radio, ver `RB-LEAD-010` |
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
autoasigna o asigna a otro compañero** — no puede quedar un lead sin responsable pasado el
plazo definido en `RB-LEAD-009`.

**`RB-LEAD-009`** — Alerta por lead sin responsable **(decisión §11.2)**. Si un lead entrado por
formulario web permanece **más de 24 horas sin responsable asignado**, el sistema dispara una
alerta a dirección (notificación accionable, ver §8.6). El contador arranca en la fecha de
contacto auto-sellada (`RB-LEAD-001`). La alerta se resuelve automáticamente al asignarse un
responsable.

**`RB-LEAD-004`** — Canal de origen (`comoNosConocio`), lista cerrada configurable:
`Boca a boca`, `Instagram`, `TikTok`, `Web`, `Vive/trabaja por la zona`, `Otro` (con texto).
Esta lista debe ser editable por dirección sin desplegar código (tabla, no enum fijo en código
— igual que las reglas de aptitud del módulo de salud).

**`RB-LEAD-010`** — Ubicación del lead/cliente **(decisión §11.1)**. La zona se captura como
**código postal** (campo estructurado de 5 dígitos), no como texto libre. Sobre ese dato:
- Se usa para **segmentar campañas por proximidad** (§9.3) y para analítica demográfica.
- La UI de dirección debe ofrecer una **visualización en mapa con radios/heatmap** de la
  distribución geográfica de leads y clientes alrededor del centro (objetivo de producto:
  ver de dónde vienen los clientes de un vistazo). El código postal es la clave de geocodificación
  (CP → coordenadas aproximadas) que alimenta ese mapa.

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
de histórico, consultable para campañas de recaptación (marketing), con todos sus datos.

**`RB-LEAD-011`** — Razón de no cierre **obligatoria (decisión §11.3)**. Al pasar un lead a
`NO_CERRADO` el sistema **exige** seleccionar un motivo (bloqueante, no se puede archivar sin
él). Lista cerrada configurable por dirección (misma mecánica de tabla que `RB-LEAD-004`), p. ej.:
`Precio`, `Horarios`, `Se fue a la competencia`, `No decide / lo piensa`, `Distancia/ubicación`,
`Otro` (con texto). Este motivo es la clave de segmentación de las campañas de recaptación.

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
- Cliente de **solo online** → tiene un **entrenador individual asignado explícitamente**, igual
  que EP y **no** "Training Zone" genérico **(decisión §11.4)**. Ese entrenador es el responsable
  de cara al cliente y quien confirma la programación de la IA (`RB-IA-003`), aunque el día a día
  del seguimiento lo lleve la IA.

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
directamente en la ficha del cliente. El entrenador puede, para cada hueco de EP, elegir entre:
- **Reservarlo manualmente** en nombre del cliente (crear el evento él mismo), o
- **Dejarlo disponible como "autorreservable"** para que el propio cliente de EP coja el hueco
  desde la app sin pasar por él.

La reserva manual es un requisito de primera clase, no un caso raro: hay clientes de EP (p. ej.
personas mayores) que **no usan la app** y a los que se les agenda todo a mano — el flujo manual
debe cubrir a esos clientes de punta a punta.

**`RB-AGENDA-006`** — Quién configura las franjas autorreservables **(decisión §11.5)**. Modelo
por fases:
- **Ahora (v1):** las configura **cada entrenador** para sus propios clientes de EP. El entrenador
  necesita permiso explícito para **crear, editar y añadir** franjas/eventos de EP (crear el
  evento reservado a mano o publicarlo como disponible).
- **Objetivo (futuro):** existirá además una **política global de centro** (dirección) que fije
  el marco por defecto (nº de franjas, antelación mínima) sobre el que el entrenador ajusta.

**`RB-AGENDA-007`** — Diferencia estructural EP vs. grupos **(aclaración §11.5)**. En **grupos**
la reserva la hace **siempre el cliente**: solo puede reservar en las horas en las que el centro
ha puesto una sesión de grupo, y cada sesión tiene un **límite de personas** (aforo) definido por
el centro. Los horarios de grupo los pone el centro, no el entrenador cliente a cliente. En **EP**,
en cambio, el hueco puede nacer como reserva manual del entrenador o como franja autorreservable
(ver `RB-AGENDA-002`).

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

**`RB-IA-007`** — Definición de "cliente estancado" **(decisión §11.9)**. El estancamiento **no**
se decide solo por la autovaloración textual: se **combina** la señal subjetiva con **señales
objetivas**:
1. **Autovaloración textual** del cliente ("me siento estancado", etc.).
2. **Caída de asistencia** respecto a su patrón habitual.
3. **RPE bajo sostenido** en las últimas sesiones.
4. **Ausencia de progresión en marcadores clave** (peso, marcas de fuerza, objetivos de salud del
   §2.3 sin avance en X periodo).

Estas señales objetivas **reutilizan el motor de retención ya existente** (`RetentionAlert`), no se
construye un sistema paralelo: la detección de estancamiento es una regla más sobre esas señales.
El cliente se marca como "en riesgo de estancamiento" cuando concurre la autovaloración **o** un
umbral de señales objetivas, y eso alimenta la recomendación de IA (§4.5) y el motor de ofertas.

### 4.6. Seguimiento periódico de objetivos (check-in recurrente)

**`RB-IA-006`** — Cada cierto tiempo el sistema debe preguntar al cliente si ha cambiado algo
respecto a su objetivo: si lo ha modificado, si se ve estancado, o si quiere ir a por más. Estas
respuestas alimentan tanto la recomendación de IA (§4.5) como el reporte semanal al equipo (§8.7).

**Periodicidad (decisión §11.6):** **configurable por tipo de servicio**, con **default mensual**
para el check-in de objetivos. Dirección puede cambiar el intervalo por servicio (EP, grupos,
online) sin desplegar código.

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

**Umbral (decisión §11.8):** el disparador es **por tiempo**: la alerta salta cuando al cliente le
quedan **menos de 2 semanas** de entrenamientos ya programados en el calendario. Como salvaguarda
equivalente en volumen (para clientes con baja frecuencia semanal), salta también cuando le queden
**4 sesiones o menos** programadas. Se dispara la que se cumpla antes de las dos.

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

Con esas señales, el sistema (IA + reglas) sugiere ofertas concretas al entrenador.

**`RB-RRHH-013`** — Aprobación de ofertas personalizadas **(decisión §11.7)**. Una oferta sugerida
por el motor **requiere luz verde de dirección antes de comunicarse al cliente**. Flujo:
`sistema sugiere → entrenador la propone/eleva → dirección aprueba o rechaza → solo tras
aprobación se comunica al cliente`. El entrenador **no** puede ofrecer el descuento/upsell
directamente sin ese visto bueno. La oferta arrastra su estado (`SUGERIDA` → `PENDIENTE_DIRECCION`
→ `APROBADA`/`RECHAZADA` → `COMUNICADA`) para trazabilidad.

### 8.8. RPE y anotaciones post-sesión → informe semanal

**`RB-RRHH-009`** — Tras cada sesión, además del check-in de asistencia (`RB-AGENDA-003`), se
captura una valoración de esfuerzo (RPE) y opcionalmente una anotación corta. *(Nota: esto ya
existe como `SessionDebrief` en el sistema actual — feeling 🟢/🟡/🔴 + RPE 1-10 + nota — por lo
que este punto es una confirmación de que el mecanismo ya construido cubre el requisito, no
una funcionalidad nueva)*.

**`RB-RRHH-010`** — Estas anotaciones se acumulan y generan un **reporte semanal para todo el
equipo**, para revisar comentarios y proponer mejoras conjuntamente.

### 8.9. Valoración de entrenadores (confidencial)

**`RB-RRHH-011`** — Periódicamente se pregunta a los clientes por su entrenador, generando una
valoración cualitativa/cuantitativa de cada entrenador (fortalezas/áreas de mejora), para usar en
reuniones individuales de dirección con cada entrenador.

**Periodicidad (decisión §11.6):** **configurable por tipo de servicio**, con **default
trimestral** para la valoración de entrenadores. Comparte el mismo mecanismo de configuración de
intervalos que `RB-IA-006`.

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
| Ofertas personalizadas sugeridas | No (hasta que se aprueba y se le comunica) | No | Propone/eleva, no ofrece sin aprobación | **Aprueba** — luz verde obligatoria (`RB-RRHH-013`) |
| Reporte semanal de comentarios | No | Sí (es del equipo) | Sí | Sí |
| Huecos de agenda de grupos | Sí (si es de grupos) | Sí | Sí | Sí |
| Huecos de agenda de EP | No | No | Solo franjas autorreservables (si es su cliente) | Sí |

---

## 11. Decisiones de negocio cerradas (registro)

Las 9 cuestiones que en v1.0 quedaban abiertas están **decididas**. Se conservan aquí como
registro histórico; cada una ya está reflejada como regla concreta en su sección.

| # | Cuestión | Decisión | Regla / sección |
|---|---|---|---|
| 11.1 | Zona del lead (texto libre / CP / mapa) | **Código postal** como campo estructurado; visualización objetivo en **mapa con radios** alrededor del centro | `RB-LEAD-010` (§1.1) |
| 11.2 | Plazo máximo sin responsable | **24 horas** sin responsable → alerta a dirección | `RB-LEAD-009` (§1.1) |
| 11.3 | Razón de no cierre obligatoria | **Sí, obligatoria** (lista cerrada configurable), bloqueante al archivar | `RB-LEAD-011` (§1.2) |
| 11.4 | Entrenador responsable en "solo online" | **Entrenador individual asignado**, no "Training Zone" genérico | `RB-PERFIL-002` (§2.2) |
| 11.5 | Franjas autorreservables de EP | Las **configura el entrenador** (con permiso crear/editar/añadir); objetivo futuro: política global de centro. El EP admite **reserva manual** (clientes que no usan app) o franja autorreservable. Grupos: siempre reserva el cliente, en horarios del centro, con aforo por sesión | `RB-AGENDA-002/006/007` (§3.1) |
| 11.6 | Periodicidad check-in objetivos y valoración de entrenadores | **Configurable por tipo de servicio**, con defaults: check-in de objetivos **mensual**, valoración de entrenadores **trimestral** | `RB-IA-006` (§4.6), `RB-RRHH-011` (§8.9) |
| 11.7 | Aprobación de ofertas personalizadas | **Requiere luz verde de dirección** antes de comunicarse al cliente | `RB-RRHH-013` (§8.7) |
| 11.8 | Umbral de "pocas sesiones programadas" | **Por tiempo**: < 2 semanas de entrenamientos programados; salvaguarda equivalente en **4 sesiones** restantes | `RB-RRHH-006` (§8.5) |
| 11.9 | Definición de "cliente estancado" | **Combinar** autovaloración textual **+** señales objetivas (caída de asistencia, RPE bajo sostenido, ausencia de progresión), reutilizando el motor de retención | `RB-IA-007` (§4.5) |

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

*Fin del documento. Con las decisiones de §11 ya cerradas, el siguiente paso es la
**priorización e implementación de las funcionalidades restantes**, detallada en el documento
complementario `CRM_IMPLEMENTACION_FUNCIONALIDADES.md`.*
