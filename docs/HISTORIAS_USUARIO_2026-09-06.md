# Historias de usuario · TrainingZone / Apta

**Fecha:** 6 de septiembre de 2026 · **Repositorio:** `fundedEdgeTrading/TrainingZone.Brief`
**Origen:** [`REVISION_WEB_MOVIL_2026-09-06.md`](./REVISION_WEB_MOVIL_2026-09-06.md) — §5.2 y §12
**Estado:** las 30 dudas de negocio del §11 están **cerradas**. Este documento es el lote de historias listo para Notion.

---

## Cómo leer este documento

Cada historia lleva:

- **ID** estable (`E1-01`, `HU-ST-07`) para referenciarla en Notion, en la rama de git y en el commit.
- **Talla** `XS` (<0,5 d) · `S` (0,5-1 d) · `M` (2-3 d) · `L` (4-8 d) · `XL` (>8 d, candidata a partirse).
- **Prioridad**: **P0** bloquea el piloto o hay dinero o datos de salud en juego · **P1** el cliente lo nota esta semana · **P2** deuda que crece · **P3** mejora.
- **Origen**: el hallazgo del informe de revisión del que sale, con su sección.
- **Criterios de aceptación en Gherkin**. Un escenario que no se puede escribir es una historia que no se puede estimar.
- **Regla de negocio** `RB-*` cuando la historia crea o corrige una. Numeración verificada como libre en §5.2 (máximos actuales: `RB-PAGO-019`, `RB-CONNECT-003`, `RB-VENTA-006`, `RB-PLAT-007`).

Las historias marcadas **⚠️ backlog de publicación** solo entran cuando se ejecute la decisión D-M2 (publicar la app en tiendas, acordada pero fuera de este trimestre). Están escritas para no tener que reabrir la sesión de negocio cuando llegue el momento.

## Decisiones de negocio cerradas

Estas treinta respuestas están incorporadas a las historias. **No se reabren**: si una historia contradice una de estas filas, la historia está mal escrita.

### Alcance de la app móvil

| # | Duda | Decisión |
|---|---|---|
| D-M1 | ¿Entra el no-show desde el móvil? | **Sí**, como excepción al alcance congelado. Endpoint nuevo + interfaz → **E2-14** |
| D-M2 | ¿Se publica en App Store y Google Play? | **Sí, pero más adelante**. Las tres historias que exige la tienda se escriben ahora y se marcan **⚠️ backlog de publicación** → **E5-15, E9-16, E10-19** |
| D-M3 | ¿Se retira el muro de compra de la app? | **Sí**: modo lectura + banda de compra persistente → **E5-14** |
| D-M4 | ¿Se recorta de 8 roles a 2? | **Sí, en la app móvil**: solo `MEMBER` y `TRAINER`. La **web conserva** dirección de plataforma (Apta), dirección de organización y director de centro → **E13-01** |
| D-M5 | ¿Entra el selector de tema? | **No el control**, sí la obediencia: la app **lee** `User.theme` del servidor, sin pantalla nueva en Perfil → **E13-02** |

### Cobro y Stripe

| # | Duda | Decisión |
|---|---|---|
| D-S1 | Tipo de cuenta Connect | **Standard**. Cada centro activa sus propios métodos de pago |
| D-S2 | ¿Bizum en bonos puntuales? | **Sí, solo en `mode:"payment"`**. La restricción se mueve a `isRecurring()` → HU-ST-09 |
| D-S3 | Plan `ONLINE` e IAP de Apple | **No se vende desde la app**. Sigue existiendo y vendiéndose en web → HU-ST-10, E12-03 |
| D-S4 | Prorrateo al cambiar de plan | **Subida: prorrateo inmediato. Bajada: al próximo ciclo** → HU-ST-13 |
| D-S5 | Periodo de gracia de morosidad | **7 días naturales, configurable por organización** → HU-ST-18 |
| D-S6 | Al agotar reintentos | **`cancel`**. Se configura en el Dashboard **y** en el código → HU-ST-18 |
| D-S7 | ¿Quién atiende reembolsos y disputas? | **Desde Apta**. Se construyen HU-ST-20 y HU-ST-21 |
| D-S8 | VERI\*FACTU | **Apta factura solo su licencia** (B2B, Apta → centro). El centro factura al socio con su software; Apta entrega el recibo de Stripe. Va al contrato |
| D-S9 | Ventana mínima de cancelación de reserva | **Configurable por centro**, con valor por defecto → **E2-05** |
| D-S10 | Ventana del entrenador (24 h) vs. del socio | **Una sola ventana, la del centro**, para socio, entrenador y recepción. Se documenta como `RB-AGENDA-009` → **E2-04** |

### Producto y modelo de negocio

| # | Duda | Decisión |
|---|---|---|
| D-P1 | ¿Training Zone paga la licencia? | **Sí, con descuento de fundador** (cupo y fecha). Es cliente, no laboratorio → **E6-04** |
| D-P2 | Objetivo a 12 meses | **100 clientes** → back-office y self-service son obligatorios. **E6-08 sube a P1** |
| D-P3 | ¿España o EEUU? | **Solo España** durante 12 meses. `wa.me` sin reservas, CP españoles, sin i18n → **E12-17** |
| D-P4 | Titularidad de `src/lib/ai/methodology/` | **Es de Apta**. Hay que dejarlo por escrito en el contrato con Training Zone → **E13-03** |
| D-P5 | ¿Se reempaqueta el catálogo? | **Sí, completo**: matar o subir Esencial, IA con cupo en Avanzado, Élite hasta 10 centros, Fundador con cupo y fecha → **E6-04** |
| D-P6 | ¿Qué se apaga? | **La rutina de IA falsa del portal** (E12-01) y **el "responde al instante" del chat** (E12-02). **No** se apagan biblioteca/ONLINE, tareas ni anuncios. **Fichajes sí se apaga** (derivada) → **E10-21** |
| D-P7 | ¿Se construye `SessionLedger`? | **Sí, pero después de E2-01 y E2-02**: primero se tapan las fugas de bono, luego se lleva el libro → **E2-15** |

### Cumplimiento

| # | Duda | Decisión |
|---|---|---|
| D-C1 | Región de la base de datos | **Ya está en la UE**. E10-07 se reduce a documentarlo y añadir una comprobación de arranque que falle si la región no es UE |
| D-C2 | Base jurídica del dato de salud obligatorio | **Art. 9.2.f**, con validación jurídica externa como criterio de cierre → **E10-03** |
| D-C3 | Tabla de plazos de conservación | **Propuesta estándar ahora, validada después**. El motor se construye con plazos parametrizables → **E10-08** |
| D-C4 | ¿DPD y EIPD? | **Los dos**: se designa DPD y se realiza la EIPD → **E10-10** |
| D-C5 | DPA con Anthropic | **Se firma antes del piloto**. Hasta entonces la IA no toca datos de un socio real → **E3-15** lleva la condición dentro |
| D-C6 | ¿Microempresa a efectos de la Ley 11/2023? | **Sí**: la accesibilidad es **recomendación**, no obligación. La épica **E8 se prioriza por calidad de producto**, y el análisis del umbral se documenta igualmente |
| D-C7 | ¿Sale `/audit` del muro de pago? | **Sí, la consulta. La exportación masiva se queda de pago** → **E6-07** |

## Resumen del lote

| Épica | Historias | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| E1 · Aislamiento multi-tenant y control de acceso | 11 | 6 | 4 | 1 | 0 |
| E2 · Integridad de reservas y bonos | 15 | 3 | 6 | 6 | 0 |
| E3 · Salud, semáforo de aptitud y metodología | 18 | 4 | 9 | 5 | 0 |
| E4 · Cobros con Stripe | 30 | 16 | 7 | 5 | 2 |
| E5 · Autoservicio del socio | 15 | 3 | 7 | 4 | 1 |
| E6 · Gateo comercial y planes | 8 | 3 | 4 | 1 | 0 |
| E7 · Calidad: pruebas y cobertura | 9 | 6 | 2 | 1 | 0 |
| E8 · Accesibilidad y usabilidad | 18 | 4 | 9 | 5 | 0 |
| E9 · SEO y captación | 16 | 2 | 8 | 6 | 0 |
| E10 · Cumplimiento normativo | 22 | 7 | 12 | 2 | 1 |
| E11 · Mapa y datos de captación | 10 | 0 | 4 | 6 | 0 |
| E12 · Higiene técnica y deuda | 17 | 1 | 5 | 8 | 3 |
| E13 · Derivadas de las decisiones del §11 | 3 | 0 | 2 | 1 | 0 |
| **Total** | **192** | **55** | **79** | **51** | **7** |

Las 30 de la épica E4 son las 28 `HU-ST-*` de las cinco fases de Stripe más `E4-29` y `E4-30`, que salen de otros capítulos.

## Orden de ejecución

**Lote 1 · Bloqueantes (no se toca dinero real ni socios reales antes)**
E1-01 a E1-06 · E2-01, E2-02, E2-03 · E3-01, E3-02, E3-03, E3-15 · E6-01, E6-02, E6-03 · E4-29 · HU-ST-01 a HU-ST-06 · E10-01, E10-02, E10-04, E10-05, E10-06 · E8-01, E8-02, E8-03, E8-04 · E7-01, E7-02, E7-03, E7-06, E7-07, E7-08 · E9-01, E9-02.

Los tres frentes de E1 (aislamiento), E2 (integridad de bonos) y E6-01/02/03 (gateo) **se atacan como un solo lote**: comparten ficheros y guardas, y separarlos multiplica los conflictos.

**Lote 2 · Lo que promete y no cumple**
E12-01, E12-02, E12-03 · E2-06, E2-11, E5-12, E5-13 · E2-09, E12-14 · E10-09 · E12-13 · E9-13.

**Lote 3 · Lo que el socio y el entrenador notan cada semana**
E5-01 a E5-08 · E3-05 a E3-14 · E2-04, E2-05, E2-14 · HU-ST-07 a HU-ST-11.

**Lote 4 · Producto, negocio y recurrencia**
E6-04 a E6-08 · E8-17 · E12-17 · HU-ST-12 a HU-ST-22 · E2-15 · E5-09.

**Lote 5 · SEO, accesibilidad, mapa y contabilidad**
E9-03 a E9-15 · E8-05 a E8-16, E8-18 · E11-01 a E11-10 · HU-ST-23 a HU-ST-28 · E10-08 a E10-22.

**Backlog de publicación (cuando se ejecute D-M2)**
E5-15 · E9-16 · E10-19.

---

# E1 · Aislamiento multi-tenant y control de acceso

> Dos de estos hallazgos los encontraron de forma independiente el auditor de seguridad y el de QA, por caminos distintos. La confianza en ellos es alta y **están demostrados end-to-end contra la aplicación levantada**, no inferidos de la lectura.

## E1-01 · El Session Brief solo abre sesiones del ámbito de centro de quien lo pide

`M` · **P0** · origen §2.4 SEC-01, §8 W-01 · regla `RB-SEG-001`

**Como** dirección de centro **quiero** que el Session Brief solo me deje abrir sesiones de mis centros **para** no acceder a datos de salud de socios que no están bajo mi responsabilidad.

Hoy `canViewSessionDebrief` (`rbac.ts:364-371`) devuelve `true` para `OWNER`/`CENTER_DIRECTOR` ante cualquier sesión de la organización, y `getSessionBrief` (`brief-queries.ts:23-83`) filtra solo por `orgId`. Verificado: el director de La Jota recibe 43 sesiones de tres centros y obtiene la lesión *"cervicales, molestia crónica"* de un socio de Santander, **con `canSeeHealth: true` y auditado como lectura legítima**.

```gherkin
Escenario: sesión fuera del ámbito de centro
  Dado un CENTER_DIRECTOR imputado solo a "La Jota"
  Cuando pide el brief de una sesión de "Puerta del Carmen"
  Entonces getSessionBrief devuelve null
  Y la ruta web /brief/[id] responde notFound()
  Y GET /api/mobile/v1/trainer/brief/[id] responde 404
  Y no se escribe ninguna entrada de lectura en AuditLog

Escenario: índice de briefs
  Dado el mismo director
  Cuando abre /brief
  Entonces solo se listan sesiones de los centros de su ámbito
  Y el recuento coincide con el de su agenda

Escenario: entrenador con dos centros imputados
  Dado un TRAINER con CenterMembership en dos centros
  Entonces ve los briefs de sus sesiones en ambos, y de ningún otro

Escenario: dirección de organización
  Dado un OWNER sin restricción de centro
  Entonces ve los briefs de toda su organización, y de ninguna otra
```

**Nota de implementación**: resolver el `centerId` de la sesión dentro de `getSessionBrief` y comprobar `isCenterInScope(actor, centerId)`. Web y móvil comparten esta función, así que **un solo arreglo cierra las dos superficies**.

## E1-02 · Los endpoints de agenda móvil rechazan sesiones fuera del ámbito de centro

`M` · **P0** · origen §2.4 SEC-05, §8 M-01, §9.2 A1 · regla `RB-SEG-002`

**Como** responsable del producto **quiero** que la API móvil aplique el mismo ámbito de centro que la web **para** que un entrenador no pueda vaciar la agenda de un centro ajeno.

Verificado con dos cuentas reales: una entrenadora imputada solo a La Jota **creó** una sesión en Puerta del Carmen, **renombró** una existente a `"AUDIT-HIJACKED"` y **borró** la que había creado. Los tres con `200`. Por E2-01, borrar además quema los bonos de todos los apuntados.

```gherkin
Escenario: crear sesión en centro ajeno
  Dado un TRAINER imputado a "La Jota" y "Puerta del Carmen"
  Cuando hace POST /api/mobile/v1/agenda/sessions con centerId de "Santander"
  Entonces responde 404 y no se crea ninguna ClassSession

Escenario: renombrar sesión ajena
  Cuando hace PATCH /api/mobile/v1/agenda/sessions/[id] sobre una sesión de "Santander"
  Entonces responde 404 y la sesión no cambia

Escenario: borrar sesión ajena
  Cuando hace DELETE /api/mobile/v1/agenda/sessions/[id] sobre una sesión de "Santander"
  Entonces responde 404 y la sesión sigue existiendo

Escenario: mover una sesión entre centros
  Cuando cambia el centerId de una sesión propia a un centro fuera de su ámbito
  Entonces responde 404: se valida el centro de ORIGEN y el de DESTINO

Escenario: sesión dentro del ámbito
  Cuando opera sobre una sesión de "La Jota"
  Entonces las tres operaciones funcionan igual que hoy
```

**Nota de implementación**: introducir `requireApiCenterScope(claims, centerId)` y hacerlo **obligatorio en toda escritura con `centerId`**, igual que ya hacen los endpoints hermanos `agenda/ep-slots`, `agenda/sessions/[id]/bookings` y `capacity`.

## E1-03 · `/feedback`, `/feedback/[id]` y `debriefs-semanales` respetan el ámbito de centro

`S` · **P0** · origen §8 W-04 · regla `RB-SEG-003`

**Como** dirección de centro **quiero** que el módulo de feedback esté acotado a mis centros **para** no leer notas confidenciales de debrief de socios y entrenadores de otros centros.

Hoy `centerId` es **un facet que elige el usuario, no una frontera** (`feedback-queries.ts:87-92,210-213`), y ni `getMemberFeedbackDetail` ni `getWeeklyDebriefReport` reciben ámbito.

```gherkin
Escenario: listado
  Dado un CENTER_DIRECTOR de "La Jota"
  Cuando abre /feedback sin filtro de centro
  Entonces solo ve socios y entrenadores de "La Jota"
  Y el selector de centro solo ofrece los centros de su ámbito

Escenario: detalle por URL directa
  Cuando abre /feedback/[id] de un socio de "Santander"
  Entonces recibe notFound()

Escenario: informe semanal
  Cuando abre /feedback/debriefs-semanales
  Entonces el informe agrega solo sesiones de su ámbito
  Y el total de sesiones coincide con el de su agenda de esa semana

Escenario: dirección de organización
  Entonces sigue viendo toda la organización
```

## E1-04 · `GET /api/mobile/v1/staff` devuelve solo la plantilla del ámbito

`S` · **P0** · origen §8 M-04, §9.2 A6 · regla `RB-SEG-002`

**Como** dirección de centro **quiero** ver en la app solo mi propia plantilla **para** que la app no filtre lo que la web ya protege.

Verificado: dirección de La Jota recibe **28 personas, incluidas las 8 de Santander**, con email, rol e imputaciones. Las escrituras sí están acotadas: es fuga de **lectura**. La web ya aplica `staffScopeWhere` y hay un e2e que lo prueba — en la web.

```gherkin
Escenario: dirección de centro
  Dado un CENTER_DIRECTOR de "La Jota"
  Cuando hace GET /api/mobile/v1/staff
  Entonces la respuesta no contiene ninguna persona ajena a su ámbito
  Y el recuento coincide con el de /rrhh en la web para el mismo usuario

Escenario: dirección de organización
  Entonces recibe la plantilla completa de su organización

Escenario: RRHH
  Entonces recibe el mismo alcance que en la web para su rol

Escenario: paridad
  Entonces para cualquier rol, GET /api/mobile/v1/staff y la web devuelven el mismo conjunto de personas
```

## E1-05 · El selector de socio de la agenda ofrece solo socios del ámbito, y la escritura lo valida

`S` · **P0** · origen §8 W-07 · regla `RB-SEG-003`

**Como** entrenador **quiero** que el selector "Socio" de la agenda me ofrezca solo a quien puedo atender **para** no reservar plaza a alguien de un centro que no es mío.

Verificado: `entrenador@trainingzone.es` (La Jota + Puerta del Carmen) recibe los dos centros correctos y **los 49 socios de la organización, incluidos los 34 de Santander**. El criterio correcto ya existe justo al lado: `listMembersBookableForSession` (`members-queries.ts:424-449`) sí acota por centro y modalidad.

```gherkin
Escenario: selector acotado
  Dado un TRAINER imputado a dos de los tres centros
  Cuando abre el selector de socio en la agenda
  Entonces solo se ofrecen socios de esos dos centros

Escenario: escritura con un socio ajeno
  Cuando envía una reserva de staff con el memberId de un socio de un centro ajeno
  Entonces la acción falla y no se crea ninguna Booking
  Y el bono de ese socio no se toca

Escenario: modalidad
  Entonces el selector respeta además la modalidad de la sesión, como ya hace listMembersBookableForSession
```

## E1-06 · Recepción deja de recibir `feedbackAvg`

`XS` · **P0** · origen §8 M-02, §9.2 A7 · regla `RB-SEG-004`

**Como** responsable de cumplimiento **quiero** que recepción no reciba la media del debrief del entrenador **para** no exponer datos de salud a un rol que la matriz de permisos excluye explícitamente.

`debriefAverage` promedia `technique`, `attitude`, `energy`, **`mobility`** y **`pain` invertido**. La cabecera del propio fichero afirma *"Nada de datos de salud"*. Con el seed actual sale `null` porque nadie ha puntuado ejes todavía, **pero la ruta de escritura está viva**.

```gherkin
Escenario: recepción
  Dado un usuario con rol RECEPTION
  Cuando pide GET /api/mobile/v1/members/[id] o .../calendar
  Entonces la respuesta NO contiene la clave feedbackAvg
  Y tampoco ninguna de las dimensiones que la componen

Escenario: entrenador de la sesión
  Entonces sigue recibiendo feedbackAvg con normalidad

Escenario: contrato tipado
  Entonces el tipo de la respuesta para recepción no declara feedbackAvg,
  de modo que un cambio futuro rompe la compilación en vez de filtrar el dato
```

## E1-07 · La alerta de tres faltas llega solo a la dirección del centro del socio

`XS` · **P1** · origen §8 W-12 · corrige la desviación respecto a `CRM_REGLAS_NEGOCIO.md:388-391`

**Como** dirección **quiero** recibir la alerta de faltas solo de mis socios **para** que el nombre y apellidos de un socio no cruce la frontera de centro.

`no-show-alerts.ts:36-43` selecciona `role: { in: ["OWNER","CENTER_DIRECTOR"] }` **sin filtrar por centro**, mientras la documentación dice "dirección **del centro**".

```gherkin
Escenario: socio de un centro
  Dado un socio de "La Jota" que acumula tres faltas sin avisar
  Cuando se dispara la alerta
  Entonces la reciben el OWNER y la dirección de "La Jota"
  Y no la recibe la dirección de "Santander" ni de "Puerta del Carmen"

Escenario: socio con imputación a dos centros
  Entonces la reciben las direcciones de los dos centros
```

## E1-08 · `getHealthRecordsForMember` acota por `orgId`

`XS` · **P2** · origen §8 W-18 · defensa en profundidad

**Como** responsable de seguridad **quiero** que la última barrera de un dato del Art. 9 aplique también el filtro de organización **para** que un fallo aguas arriba no se convierta en una fuga entre clientes.

No es explotable hoy: los dos llamantes validan la pertenencia. Es exactamente por eso que es P2 y no P0 — y exactamente por eso hay que arreglarlo antes de que aparezca un tercer llamante.

```gherkin
Escenario: memberId de otra organización
  Cuando se invoca getHealthRecordsForMember con un memberId de otra org
  Entonces devuelve lista vacía, nunca registros

Escenario: llamada legítima
  Entonces el comportamiento actual no cambia y los tests existentes siguen pasando
```

## E1-09 · Cabeceras de seguridad HTTP

`S` · **P1** · origen §2.4 SEC-03

**Como** responsable de seguridad **quiero** que la aplicación emita cabeceras de seguridad **para** no ser enmarcable ni degradable a HTTP en pantallas con datos de salud y de pago.

Verificado con `curl -D -` contra `/login`: `next.config.ts` no define `async headers()` y **no se emite ninguna**.

```gherkin
Escenario: cabeceras presentes
  Cuando se pide cualquier ruta en producción
  Entonces la respuesta incluye Content-Security-Policy con frame-ancestors 'none'
  Y Strict-Transport-Security con max-age de al menos un año
  Y X-Frame-Options: DENY
  Y Referrer-Policy: strict-origin-when-cross-origin
  Y X-Content-Type-Options: nosniff

Escenario: rutas con token firmado
  Entonces además se emite Referrer-Policy: no-referrer,
  para que el token no viaje en la cabecera Referer

Escenario: la aplicación sigue funcionando
  Entonces el mapa de Leaflet, los gráficos y el checkout de Stripe cargan sin bloqueos de CSP
  Y el despliegue incluye una pasada manual por esas tres pantallas antes de dar por buena la política
```

## E1-10 · Rate limiting y protección de fuerza bruta en el login web y móvil

`M` · **P1** · origen §2.4 SEC-04 · regla `RB-SEG-005`

**Como** responsable de seguridad **quiero** limitar los intentos de acceso **para** que un atacante no pueda probar contraseñas indefinidamente contra emails de staff predecibles.

Verificado: **12 intentos fallidos consecutivos contra `/api/mobile/v1/auth/login` se procesan todos**, sin bloqueo, retardo ni captcha. Agravante: los emails de staff siguen el patrón `rol.centro@org`.

```gherkin
Escenario: intentos fallidos consecutivos
  Dado un mismo email con N intentos fallidos en la ventana configurada
  Cuando supera el umbral
  Entonces las peticiones siguientes se rechazan con retardo progresivo
  Y la respuesta no revela si la cuenta existe

Escenario: por dirección IP
  Entonces existe un límite independiente por IP, para el caso de barrido de muchos emails

Escenario: acceso legítimo tras el bloqueo
  Cuando pasa la ventana de bloqueo
  Entonces el usuario correcto entra sin fricción adicional

Escenario: recuperación de contraseña
  Entonces el mismo límite aplica a la solicitud de enlace de recuperación

Escenario: trazabilidad
  Entonces cada bloqueo deja entrada en AuditLog con email, IP y momento
```

## E1-11 · `confirmDemoCheckoutAction` comprueba `isDemoModeActive()`

`XS` · **P1** · origen §2.4 SEC-02

**Como** responsable de plataforma **quiero** que la server action del checkout de demostración repita la comprobación que hace su página **para** que nadie dé de alta una organización operativa sin pagar.

La **página** redirige a `/planes` si Stripe está configurado, pero **la server action que la respalda no repite la comprobación** — y una server action es un endpoint por sí misma, registrada en el build aunque la página redirija. `provisionDemoOrganization` crea una `Organization` con `platformStatus: "ACTIVE"`.

```gherkin
Escenario: Stripe configurado
  Dado un entorno con STRIPE_SECRET_KEY presente
  Cuando se invoca confirmDemoCheckoutAction directamente
  Entonces devuelve error y no se crea ninguna Organization

Escenario: modo demo activo
  Entonces el comportamiento actual no cambia

Escenario: cupo Fundador
  Entonces la comprobación de cupo que ya existe se mantiene y se ejecuta después de esta
```

---

# E2 · Integridad de reservas y bonos

> Aquí hay dinero del socio. Dos de las historias están **verificadas por reproducción con restauración posterior** en la base de datos sembrada.

## E2-01 · Borrar una sesión devuelve el bono a cada socio apuntado y lo audita

`S` · **P0** · origen §8 W-02 · regla `RB-AGENDA-010`

**Como** socio **quiero** recuperar mi sesión si el centro borra la clase **para** no pagar por una sesión que nunca ocurrió.

Verificado con restauración: bono a 5 → reserva de staff → **4** → el entrenador borra la sesión → **sigue en 4**. La reserva desaparece, el socio no recibe nada y **ni siquiera queda `AuditLog`**, a diferencia de `discardAttendeeAsStaff`, que sí audita cada descarte. Es pérdida de dinero **a escala de clase entera**, y el descuadre solo se ve semanas después.

```gherkin
Escenario: sesión con reservas activas
  Dado una sesión con tres socios en estado BOOKED y bono consumido
  Cuando el entrenador borra la sesión
  Entonces los tres recuperan su sesión de bono
  Y se escribe una entrada en AuditLog por cada devolución, con motivo SESSION_DELETED
  Y los tres reciben aviso de que la clase se ha cancelado

Escenario: reservas ya canceladas
  Dado una reserva en estado CANCELLED con el bono ya devuelto
  Entonces no se devuelve dos veces

Escenario: reservas en lista de espera
  Dado una reserva WAITLISTED, que no consumió bono
  Entonces no se devuelve nada y no se rompe la operación

Escenario: reservas ya asistidas
  Dado una sesión pasada con reservas ATTENDED
  Cuando se borra
  Entonces el sistema pide confirmación explícita y no devuelve el bono de las asistidas

Escenario: atomicidad
  Cuando falla la devolución de uno de los bonos
  Entonces no se borra la sesión y no se devuelve ninguno
```

## E2-02 · Una reserva `CANCELLED` o `WAITLISTED` no puede pasar a `ATTENDED`

`S` · **P0** · origen §8 W-03, M-06, §9.2 A3 · regla `RB-RES-010`

**Como** dirección **quiero** que solo se pueda puntuar una reserva viva **para** que una asistencia inexistente no ocupe aforo ni falsee adherencia, retención y KPIs.

Verificado: reserva → cancelación (`CANCELLED`, `subscriptionId = null`, bono devuelto) → `POST /trainer/brief/<id>/debrief` con ese `bookingId` → `{"saved":true}` → en BD `status = ATTENDED`, `checkedInAt` puesto. **Ninguna de las cuatro vías de escritura valida el estado de partida.** `markBookingNoShow` sí lo hace: es el patrón a copiar.

```gherkin
Escenario: debrief sobre reserva cancelada (web)
  Dado una Booking en estado CANCELLED
  Cuando se guarda el debrief desde /brief/[id]
  Entonces la operación se rechaza y el estado sigue siendo CANCELLED

Escenario: debrief sobre reserva cancelada (API móvil)
  Cuando se hace POST /api/mobile/v1/trainer/brief/[id]/debrief
  Entonces responde 409 y no escribe nada

Escenario: feedback de ejes sobre reserva cancelada
  Cuando se hace POST /api/mobile/v1/trainer/sessions/[id]/feedback
  Entonces responde 409 para esa reserva

Escenario: check-in sobre reserva en lista de espera
  Dado una Booking WAITLISTED, que nunca ocupó plaza ni consumió bono
  Cuando se alterna el check-in desde /agenda/session/[id]
  Entonces se rechaza

Escenario: reserva viva
  Dado una Booking BOOKED
  Entonces las cuatro vías siguen funcionando exactamente igual que hoy

Escenario: transición legítima de vuelta
  Dado una Booking ATTENDED
  Cuando se desmarca
  Entonces vuelve a BOOKED, no a CANCELLED
```

**Nota de implementación**: una única función `assertBookingTransition(from, to)` compartida por los cuatro puntos de escritura. Cuatro parches separados vuelven a divergir.

## E2-03 · Desmarcar una asistencia en el móvil se propaga al servidor

`XS` · **P0** · origen §2.2, §9.2 A4

**Como** entrenador **quiero** que quitar un check quite la asistencia de verdad **para** no dejar a un socio pagando una sesión a la que no fue.

`brief/[id].tsx:184-199` y `:246-254` hacen `if (!next) return;`: el estado local se pone a `null` y **no se manda nada**. La reserva sigue en `ATTENDED` y el debrief sigue guardado. Al recargar, el check vuelve.

```gherkin
Escenario: desmarcar
  Dado un socio marcado como asistido desde la app
  Cuando el entrenador toca el check por segunda vez
  Entonces se envía la operación al servidor
  Y la Booking vuelve a BOOKED
  Y el bono queda como estaba antes de marcar

Escenario: recarga
  Cuando la pantalla se recarga
  Entonces el check aparece desmarcado, coincidiendo con la base de datos

Escenario: fallo de red
  Entonces el check vuelve a su estado anterior y se muestra el aviso,
  nunca se queda en un estado local que el servidor desconoce
```

## E2-04 · Un único criterio para sacar a un socio de una sesión

`M` · **P1** · origen §1.2 M-02, §8 M-08, §9.2 A16 · **decisión D-S10** · regla `RB-AGENDA-009`

**Como** socio **quiero** que sacarme de una clase tenga el mismo efecto sobre mi bono venga de donde venga **para** no perder una sesión según por qué pantalla haya entrado el trabajador.

Hoy hay dos reglas opuestas: `cancelSessionBooking` (web) **siempre** devuelve el bono; `discardAttendeeAsStaff` (móvil) lo consume dentro de las 24 h salvo override. La web es la ruta fácil: **para regalar una sesión dentro de la ventana basta con abrirla desde el navegador**.

**Decisión tomada (D-S10)**: una sola ventana, la configurable del centro (E2-05), aplicada por igual a socio, entrenador y recepción.

```gherkin
Escenario: fuera de la ventana del centro
  Dado un centro con ventana de cancelación de 24 h
  Y una sesión dentro de 30 h
  Cuando cualquiera saca al socio (socio, entrenador o recepción, web o app)
  Entonces se devuelve la sesión al bono
  Y queda AuditLog con quién, cuándo y por qué vía

Escenario: dentro de la ventana del centro
  Dado la misma sesión dentro de 6 h
  Cuando cualquiera saca al socio
  Entonces se consume la sesión del bono
  Y se informa en pantalla de que se ha consumido, antes de confirmar

Escenario: override del staff
  Dado un rol con permiso de override
  Cuando saca al socio dentro de la ventana marcando "devolver de todos modos"
  Entonces se devuelve la sesión y el motivo queda en AuditLog

Escenario: el literal desaparece
  Entonces TRAINER_DISCARD_WINDOW_HOURS deja de existir en el código
  Y las dos superficies leen la ventana del centro

Escenario: documentación
  Entonces RB-AGENDA-009 queda escrita en CRM_REGLAS_NEGOCIO.md con este comportamiento
```

## E2-05 · Ventana mínima de cancelación de reserva

`M` · **P1** · origen §2.3 · **decisión D-S9** · regla `RB-RES-011`

**Como** centro **quiero** fijar con cuánta antelación se puede cancelar sin penalización **para** tener margen de revender la plaza desde la lista de espera.

Hoy **no hay antelación mínima**: un socio cancela un minuto antes y recupera la sesión. Lo detectan la primera semana.

**Decisión tomada (D-S9)**: configurable por centro, con un valor por defecto.

```gherkin
Escenario: configuración
  Dado un CENTER_DIRECTOR en Organización → Centros
  Cuando fija la ventana de cancelación en horas
  Entonces el valor se guarda en el centro y sustituye al de entorno
  Y el valor por defecto se aplica a los centros que no lo hayan fijado

Escenario: validación
  Cuando intenta fijar un valor negativo o mayor que 168 h
  Entonces se rechaza con un mensaje claro

Escenario: cancelación fuera de la ventana
  Entonces se devuelve la sesión y no hay penalización

Escenario: cancelación dentro de la ventana
  Entonces se consume la sesión, y el modal lo dice con el número real de horas del centro

Escenario: la ventana viaja
  Entonces el número aparece en la tarjeta de la clase, en el modal y en la app,
  siempre leído del servidor (ver E2-06 y E5-05)
```

## E2-06 · La ventana de cancelación viaja del servidor a la app

`S` · **P1** · origen §1.2 M-07, §8 M-05, §9.2 A9

**Como** socio **quiero** que la app me diga la antelación real de mi centro **para** no cancelar creyendo que es gratis y perder la sesión.

Tres pantallas de la app dicen **12 horas** a pelo (`agenda.tsx:371-372`, `sesiones.tsx:61`, `index.tsx:74`) mientras el servidor aplica 24 h por defecto. El booleano `canCancelFreely` sí viaja y es correcto; **el número está escrito a mano y es el equivocado**. Un socio con la clase dentro de 18 h lee *"estás dentro de las 12 h previas"* — cuando faltan 18.

```gherkin
Escenario: la API entrega el número
  Cuando la app pide la agenda o las próximas sesiones
  Entonces cada elemento trae cancelWindowHours, además de canCancelFreely

Escenario: la pantalla lo usa
  Dado un centro con ventana de 24 h
  Entonces las tres pantallas dicen 24, no 12

Escenario: centro con ventana distinta
  Dado un centro con ventana de 6 h
  Entonces la app dice 6 sin necesidad de una nueva versión

Escenario: literales eliminados
  Entonces no queda ningún 12 codificado en agenda.tsx, sesiones.tsx ni index.tsx
```

## E2-07 · "Cancelable sin penalización" usa la zona horaria del centro

`S` · **P1** · origen §8 W-09 · regla `RB-RES-012`

**Como** socio **quiero** que el distintivo de cancelación gratuita coincida con lo que va a pasar al pulsar **para** no perder una sesión por un desfase de zona horaria.

`timezone.ts:20-22` prioriza la cookie `tz` y el portal calcula `canCancelFreely` con ella, mientras la escritura usa siempre `cls.center.timezone` — **con un desfase de hasta ~26 h que el propio comentario advierte**.

```gherkin
Escenario: cliente en otra zona horaria
  Dado un socio con la cookie tz en America/Lima
  Y un centro en Europe/Madrid
  Cuando mira una reserva justo en el límite de la ventana
  Entonces el distintivo y el resultado de cancelar coinciden

Escenario: fuente única
  Entonces la decisión de "cancelable sin penalización" se calcula siempre con Center.timezone,
  tanto en la lectura como en la escritura

Escenario: cambio de hora
  Dado una sesión en la madrugada del cambio de hora
  Entonces el cálculo sigue siendo correcto (ya cubierto por zonedTimeToInstant)
```

## E2-08 · Las posiciones de la lista de espera se renumeran, o se deja de mostrar el número

`S` · **P2** · origen §2.1, §8 W-14

**Como** socio **quiero** que el puesto de la cola signifique algo **para** no ver un número que lleva semanas sin cambiar.

`portal-queries.ts:720-728` escribe `waitlistedCount + 1` **una sola vez** y no hay ninguna renumeración en el repositorio: A(1), B(2), A cancela, C entra → **C obtiene también la 2**. Además no hay promoción automática: `session-vacancy-notify.ts` manda **un email a toda la lista a la vez** y la plaza es de quien la pinche antes. **Se enseña un puesto de cola donde no hay cola.**

```gherkin
Escenario: renumeración tras una baja
  Dado tres socios en lista de espera con posiciones 1, 2 y 3
  Cuando el primero se da de baja de la cola
  Entonces los otros dos pasan a 1 y 2, sin huecos ni duplicados

Escenario: entrada nueva
  Cuando entra un cuarto socio
  Entonces recibe la posición 3, no la 4

Escenario: alternativa aceptada
  Dado que se decida no renumerar
  Entonces la interfaz dice "En lista de espera" sin número
  Y explica que la plaza se avisa a toda la lista y es de quien la reclame antes
```

## E2-09 · No se envía "se ha liberado una plaza" al limpiar el roster de una sesión pasada

`XS` · **P2** · origen §8 W-15

**Como** socio **quiero** no recibir invitaciones a clases que ya ocurrieron **para** no dejar de leer los correos del centro.

`cancelSessionBooking` no comprueba que la sesión sea futura, así que limpiar el roster de una clase antigua **manda correo a todos los socios con bono de esa modalidad**. `cancelBookingForMember` sí bloquea el pasado; la vía de staff no.

```gherkin
Escenario: sesión pasada
  Dado una sesión cuya hora de inicio ya pasó
  Cuando el staff cancela una reserva de esa sesión
  Entonces no se envía ningún aviso de plaza liberada

Escenario: sesión futura
  Entonces el aviso se envía como hoy

Escenario: sesión en curso
  Dado una sesión que ya ha empezado pero no ha terminado
  Entonces tampoco se avisa
```

## E2-10 · `WAITLISTED` se distingue de `BOOKED` en la app y en el calendario de la ficha

`XS` · **P2** · origen §8 M-13, §9.2 A22

**Como** recepción **quiero** ver de un vistazo quién tiene plaza y quién está en espera **para** no decirle a un socio que puede venir cuando no tiene sitio.

`sesiones.tsx:177` colapsa los dos estados en la misma etiqueta, y **en el calendario de la ficha que ve el staff no hay distintivo alguno**.

```gherkin
Escenario: app del socio
  Dado una reserva WAITLISTED
  Entonces la etiqueta dice "En espera", nunca "Reservada"

Escenario: calendario de la ficha
  Entonces la ocurrencia se distingue visualmente de una reserva con plaza
  Y el distintivo se explica en una leyenda o en el propio texto

Escenario: contraste
  Entonces la distinción no depende solo del color
```

## E2-11 · La hoja de reserva no anuncia descuento de bono cuando va a lista de espera

`XS` · **P2** · origen §8 M-09, §9.2 A17

**Como** socio **quiero** que la hoja de confirmación diga la verdad sobre mi bono **para** no creer que he gastado una sesión que no he gastado.

`agenda.tsx:317` calcula `remainingAfter` siempre y `:355-363` lo pinta aunque el kicker ya diga "LISTA DE ESPERA" — que **no descuenta bono**. Extra: `remainingAfter` sale del saldo **agregado por modalidad**, no del bono del centro que se va a cargar.

```gherkin
Escenario: sesión llena
  Dado una sesión sin plazas libres
  Cuando el socio abre la hoja de confirmación
  Entonces no se anuncia ningún descuento de bono
  Y el texto explica que entra en lista de espera y que la sesión se descontará solo si obtiene plaza

Escenario: sesión con plaza
  Entonces se anuncia el descuento, calculado sobre el bono del centro que se va a cargar,
  no sobre el saldo agregado por modalidad
```

## E2-12 · `moveSessionAction`, `POST /agenda/sessions` y `PATCH` validan hora y fecha

`XS` · **P2** · origen §8 W-13, M-14, §9.2 A23

**Como** responsable del producto **quiero** que las tres vías de escritura de agenda validen igual **para** que no se pueda dejar `"NaN:NaN"` en una `ClassSession`.

`session-actions.ts:238-259` acepta `startTime`/`endTime` como string libre — **justo el fallo que el comentario de la línea 68 dice haber cerrado**. El endpoint de EP (`ep-slots/route.ts:47`) sí valida con `TIME_RE`.

```gherkin
Escenario: hora inválida
  Cuando se envía "NaN:NaN", "25:00" o "" como startTime
  Entonces la operación se rechaza en las tres vías: moveSessionAction, POST y PATCH del endpoint móvil

Escenario: fecha inválida
  Entonces se rechaza igual

Escenario: fin antes que el inicio
  Entonces se rechaza

Escenario: validador compartido
  Entonces isValidHHMM vive en un único módulo consumido por las tres superficies
```

## E2-13 · El aforo por defecto respeta `MAX_GROUP_CAPACITY` en las dos superficies

`S` · **P2** · origen §8 W-11, M-10, §9.2 A18

**Como** dirección **quiero** que el tope global de aforo se respete siempre **para** que nadie pueda poner 500 plazas a una clase de grupo reducido ni 12 a una franja de entrenamiento personal.

`aforo/actions.ts:23-26` solo valida `capacity >= 1` y el input no tiene `max`, así que **poner 500 convierte 500 en el techo** y se salta `MAX_GROUP_CAPACITY = 30`. Y el `PATCH /capacity` móvil usa un tope fijo de 30 (ignorando el del centro) y **acepta cualquier `sessionId`**, incluidas franjas de EP que la web fuerza a 1.

```gherkin
Escenario: aforo por defecto del centro en la web
  Cuando se fija un aforo por defecto mayor que MAX_GROUP_CAPACITY
  Entonces se rechaza, y el input declara el max

Escenario: PATCH de capacidad en el móvil
  Entonces el tope aplicado es el aforo por defecto del centro, no un 30 fijo

Escenario: sesión que no es de grupo
  Cuando se hace PATCH /capacity sobre una franja de entrenamiento personal
  Entonces responde 400 y la capacidad sigue siendo 1

Escenario: sesión creada con más de 30 plazas antes del arreglo
  Entonces se puede seguir editando desde el móvil sin quedar bloqueada
```

## E2-14 · El no-show desde el móvil

`M` · **P1** · origen §1.2 M-03, §9.1 · **decisión D-M1: entra como excepción al alcance congelado** · regla `RB-RES-009`

**Como** entrenador **quiero** marcar un no-show desde la app **para** que la falta cuente, se dispare la alerta de tres faltas y la tasa de no-show del panel sea real.

Hoy `markBookingNoShow`/`clearBookingNoShow` tienen un único consumidor: la web. Un entrenador que trabaje solo desde la app (1) marca asistencia implícitamente al guardar el debrief, (2) deja en `BOOKED` para siempre a quien no apareció, (3) **nunca dispara la alerta de tres faltas** y (4) falsea `getNoShowRate`.

```gherkin
Escenario: marcar no-show
  Dado un entrenador con una sesión pasada o en curso
  Cuando marca a un socio como no presentado desde la app
  Entonces se llama a POST /api/mobile/v1/trainer/bookings/[id]/no-show
  Y el motivo es obligatorio y se valida contra el enum, igual que en la web
  Y la decisión de devolver o no la sesión es explícita

Escenario: rectificar
  Cuando desmarca el no-show
  Entonces se vuelve a descontar la sesión si se había devuelto, sin dejar el bono en negativo

Escenario: doble devolución
  Entonces noShowRefunded impide devolver dos veces, como en la web

Escenario: alerta de tres faltas
  Dado un socio que llega a tres faltas sin avisar marcadas desde la app
  Entonces se dispara la alerta a la dirección de su centro (ver E1-07)

Escenario: ámbito de centro
  Cuando el bookingId pertenece a una sesión fuera de su ámbito
  Entonces responde 404

Escenario: estado de partida
  Cuando la reserva está CANCELLED o WAITLISTED
  Entonces se rechaza (ver E2-02)
```

## E2-15 · Libro mayor del bono (`SessionLedger`)

`L` · **P1** · origen §1.2 M-06, §9.2 A10 · **decisión D-P7: se construye, después de E2-01 y E2-02** · regla `RB-VENTA-008`

**Como** socio **quiero** ver cada movimiento de mi bono con su motivo **para** poder discutir un saldo que no me cuadra.

Verificado: en la **misma pantalla**, la tarjeta dice "5 gastadas de 12", el resumen dice "0 gastadas" y "9 no presentadas", y el listado que promete *"aquí aparece cada sesión gastada y cada devolución"* **no tiene ni una línea de consumo**. Causa: `consumption/route.ts:75` deriva el movimiento de `booking.subscriptionId`, y **1.458 de 1.458 `ATTENDED` y 155 de 155 `NO_SHOW` lo tienen a NULL**. Las devoluciones se leen solo de `AuditLog` con `BOOKING_DISCARDED*`, que únicamente escribe el descarte móvil.

**Dependencia dura**: no se construye hasta que E2-01 y E2-02 estén cerradas. Un libro mayor sobre un modelo que pierde movimientos solo documenta el error con más precisión.

```gherkin
Escenario: modelo
  Entonces existe SessionLedger con subscriptionId, bookingId opcional, delta con signo,
  motivo del enum, saldo resultante, autor y momento

Escenario: consumo
  Cuando una reserva descuenta bono
  Entonces se escribe una fila con delta -1 y motivo BOOKING_CONSUMED

Escenario: devolución
  Cuando se devuelve por cancelación, descarte, borrado de sesión o rectificación de no-show
  Entonces se escribe una fila con delta +1 y el motivo correspondiente

Escenario: alta y renovación
  Entonces se escribe una fila con el delta de sesiones incluidas y motivo SUBSCRIPTION_CREATED

Escenario: ajuste manual
  Cuando el staff ajusta el saldo
  Entonces se escribe la fila con autor y nota obligatoria

Escenario: cuadre
  Entonces la suma de deltas de una suscripción es igual a su sessionsRemaining
  Y existe un test que lo comprueba sobre datos generados

Escenario: la pantalla deja de mentir
  Entonces "gastadas", "devueltas" y el listado salen todos del ledger
  Y ninguna de las tres cifras puede contradecir a las otras dos

Escenario: histórico previo
  Entonces se genera una fila de apertura por suscripción con el saldo actual,
  y el listado indica desde qué fecha hay detalle
```

---

# E3 · Salud, semáforo de aptitud y metodología

> El semáforo de aptitud es el foso del producto y **hoy se apaga en silencio**. De las ocho zonas de dolor que puede marcar una valoración, **solo dos encuentran regla** con el catálogo sembrado; y el móvil ni siquiera pinta las condiciones sin regla, aunque el servidor se las manda.

## E3-01 · La app pinta las condiciones sin regla asignada, en ámbar, nunca en "Sin restricciones"

`XS` · **P0** · origen §2.2, §9.2 A2 · regla `RB-SALUD-010`

**Como** entrenador **quiero** ver en el móvil las condiciones declaradas aunque no tengan regla **para** no programar un circuito metabólico a un hipertenso creyendo que no tiene nada.

El endpoint manda `conditions` por el cable, `BriefRosterEntry` las tipa, y **la pantalla no las pinta en ningún sitio**: solo recorre `matchedRules`. Un socio con hipertensión declarada o una socia embarazada aparecen en la lista compacta **"Sin restricciones"**, sin una sola línea de texto. En la web al menos se imprime el texto crudo; en el móvil no aparece nada — y el móvil es el dispositivo que se lleva en la sala.

**Es el defecto número uno de todo el producto y se arregla en veinte líneas.**

```gherkin
Escenario: condición sin regla
  Dado un socio con una condición declarada y ninguna matchedRule
  Cuando el entrenador abre el brief en la app
  Entonces el socio aparece en "Requieren atención", no en "Sin restricciones"
  Y la tarjeta muestra la condición en ámbar

Escenario: condición con regla
  Entonces se pinta la adaptación de la regla, como hoy

Escenario: condición con regla Y otra sin regla
  Entonces se pintan las dos, y la luz resultante es la más restrictiva

Escenario: sin ninguna condición
  Entonces el socio aparece en "Sin restricciones", que a partir de ahora significa lo que dice

Escenario: paridad con la web
  Entonces el conjunto de condiciones mostradas en app y web es el mismo
```

## E3-02 · Las zonas de lesión son un enum cerrado, con lateralidad como campo aparte

`M` · **P0** · origen §2.2 · regla `RB-SALUD-011`

**Como** director técnico **quiero** que las zonas de lesión sean un catálogo cerrado **para** que una regla de aptitud no deje de aplicarse porque alguien escribió "hombro dcho" en vez de "hombro derecho".

La regla casa por **igualdad de texto exacto** entre dos campos libres (`brief-queries.ts:88`). Y la valoración inicial escribe la zona **sin lado** (`HOMBRO → "hombro"`) mientras el catálogo de partida está lateralizado ("hombro derecho", "rodilla derecha"): **de las ocho zonas que puede marcar la valoración, solo "zona lumbar" y "cervicales" encuentran regla.** El resto sale como "Sin restricciones", y nadie ve un error.

```gherkin
Escenario: enum compartido
  Entonces HealthRecord.zone y AptitudeRule.injuryZone usan el mismo enum cerrado
  Y la lateralidad es un campo aparte con valores izquierdo, derecho, bilateral y no aplica

Escenario: regla sin lado
  Dado una regla de aptitud para "hombro" sin lateralidad
  Y un socio con lesión en "hombro" lado derecho
  Entonces la regla casa

Escenario: regla con lado
  Dado una regla para "hombro" lado izquierdo
  Y un socio con lesión en "hombro" lado derecho
  Entonces la regla NO casa

Escenario: valoración
  Cuando la valoración inicial registra dolor de hombro
  Entonces escribe zona y lateralidad por separado, y la regla casa

Escenario: migración de datos existentes
  Entonces las filas actuales de texto libre se normalizan con un mapeo declarado,
  y las que no se puedan mapear quedan marcadas para revisión manual, nunca descartadas
  Y el informe de migración dice cuántas quedaron sin mapear

Escenario: los formularios
  Entonces ni la ficha de socio ni la pantalla de reglas ofrecen ya un campo de texto libre para la zona
```

## E3-03 · Reglas de aptitud por condición, con ámbar por defecto

`M` · **P0** · origen §2.2 · regla `RB-SALUD-012`

**Como** entrenador **quiero** que hipertensión, embarazo, diabetes o un postoperatorio enciendan luz **para** que el semáforo sea de aptitud y no solo musculoesquelético.

Hipertensión, diabetes, cardiovascular, cirugías, medicación y embarazo se guardan con `zone: null`, y **sin zona no hay regla que casar**. En la sala eso está al revés de lo que importa: la rodilla se ve cojear, la tensión no.

```gherkin
Escenario: segundo tipo de regla
  Entonces existe una regla condición → luz + adaptación, independiente de la zona

Escenario: catálogo de partida
  Entonces el seed trae reglas para hipertensión, diabetes, embarazo y posparto,
  obesidad, cardiovascular y postoperatorio

Escenario: ámbar por defecto
  Dado una condición declarada sin ninguna regla asignada
  Entonces la luz resultante del socio es AMBER, nunca GREEN
  Y el brief explica que es una condición sin regla, no una adaptación conocida

Escenario: combinación
  Dado un socio con una condición ámbar y una lesión roja
  Entonces la luz resultante es la más restrictiva

Escenario: "Sin restricciones" recupera su significado
  Entonces solo se pinta cuando el socio no tiene ninguna condición ni lesión declarada
```

## E3-04 · La pantalla de reglas muestra "esta regla afecta hoy a N socios"

`S` · **P1** · origen §2.2

**Como** director técnico **quiero** ver a cuánta gente afecta cada regla **para** detectar de un vistazo una regla mal escrita que no encaja con nada.

Si sale 0 en una zona con lesiones registradas, la regla está mal y se ve al instante.

```gherkin
Escenario: contador
  Cuando se abre la lista de reglas de aptitud
  Entonces cada regla muestra a cuántos socios del ámbito afecta hoy

Escenario: regla huérfana
  Dado una regla con 0 socios afectados y lesiones registradas en esa zona
  Entonces la fila se destaca visualmente como posible error de escritura

Escenario: ámbito
  Entonces el recuento respeta el ámbito de centro de quien mira

Escenario: rendimiento
  Entonces el recuento se calcula agregado, no con una consulta por regla
```

## E3-05 · El brief muestra la adaptación, no la descripción clínica cruda

`S` · **P1** · origen §2.2, §7 CN-10

**Como** socio **quiero** que mi medicación y mis cirugías no se impriman en una tarjeta abierta en la sala **para** que mi historial no lo lean las seis personas que entrenan a mi lado.

`brief-card.tsx:99-101` imprime la descripción cruda de cada condición sin zona: nombres de medicamentos, cirugías y patologías, literalmente. Es dato del Art. 9 en una pantalla pública de facto, y rompe la regla básica: **el entrenador lee adaptaciones, no historiales**.

```gherkin
Escenario: tarjeta del brief
  Dado un socio con una condición con descripción clínica
  Entonces bajo su nombre solo aparece la adaptación
  Y la descripción clínica no se pinta

Escenario: condición sin adaptación escrita
  Entonces aparece la etiqueta de la condición y la luz, no la descripción libre

Escenario: acceso al detalle
  Cuando el entrenador pulsa "ver detalle clínico"
  Entonces se muestra la descripción completa
  Y se escribe la entrada correspondiente en AuditLog

Escenario: roles sin permiso
  Entonces el detalle no está disponible y no se revela que exista
```

## E3-06 · La revisión de valoración vuelve a preguntar por lesiones

`S` · **P1** · origen §2.2

**Como** entrenador **quiero** que la revisión periódica pregunte por lesiones nuevas **para** que una lumbalgia que aparece en el mes 4 entre en el semáforo sin que nadie la teclee a mano.

`reviewAssessmentSchema` no lleva screening ni zonas de dolor.

```gherkin
Escenario: revisión
  Cuando se abre una revisión de valoración
  Entonces incluye el bloque de zonas de dolor y screening, precargado con lo declarado antes

Escenario: lesión nueva
  Cuando se marca una zona que antes no estaba
  Entonces se crea el HealthRecord correspondiente y el semáforo lo recoge

Escenario: lesión resuelta
  Cuando se desmarca una zona
  Entonces el HealthRecord se marca resuelto con fecha, no se borra

Escenario: sin cambios
  Entonces no se duplica ningún registro
```

## E3-07 · Un único canal de debrief: 🟢🟡🔴 puesto por el entrenador

`M` · **P1** · origen §2.2, §1.1 W-06

**Como** entrenador **quiero** un solo gesto para registrar cómo ha ido la sesión **para** que el dato signifique lo mismo el lunes y el jueves.

Hay **tres escritores de `SessionDebrief` con dos criterios de `feeling` incompatibles**: la web (solo 🟢🟡🔴), su espejo móvil, y el endpoint de ocho ejes que **deriva** `feeling` con `feelingFor()`. Un entrenador puntúa ocho ejes en la app (media 8,5 → `GREEN`), luego toca 🔴 en la web, y queda `feeling: RED` con `technique: 9, progress: 9`. **Nadie reconcilia.** Peor: rellenar solo el RPE deja la media a `null` y `feelingFor` devuelve **AMBER** — el socio queda marcado "regular" para siempre.

Y promediar movilidad con actitud no significa nada: es un número que parece riguroso y no lo es.

```gherkin
Escenario: gesto único
  Entonces el debrief de sesión es verde/ámbar/rojo más una frase opcional,
  con el color puesto por el dedo del entrenador

Escenario: nunca derivado
  Entonces feeling no se calcula nunca promediando ejes
  Y feelingFor deja de existir

Escenario: los ocho ejes salen del flujo de sala
  Entonces la puntuación por ejes pasa a la valoración periódica desde la ficha,
  fuera del debrief de sesión

Escenario: paridad
  Entonces web y app escriben el debrief con el mismo contrato y la misma gramática

Escenario: histórico
  Entonces los debriefs existentes se conservan, marcados con el origen de su feeling
```

## E3-08 · Se retira el feedback mensual de nueve deslizadores

`S` · **P1** · origen §2.2, §2.3

**Como** dirección **quiero** dejar de pedir un cuestionario que nadie va a rellenar con verdad **para** no decidir sobre datos que son ruido.

Con 30 socios de EP son **270 deslizadores y 30 textos al mes**, con nota obligatoria. El primer martes que se intente usar, el entrenador los deja todos en 7, escribe "va bien" y envía. A las dos semanas dirección estará decidiendo sobre "Nutrición: 7" que nadie ha medido. Además dos de esas dimensiones —"Bienestar físico: ¿libre de dolores?" y "Nutrición"— son juicios sobre salud y alimentación que al entrenador no le corresponde puntuar.

```gherkin
Escenario: el formulario desaparece
  Entonces /trainer/feedback/[memberId] deja de estar accesible y no aparece en ningún menú

Escenario: los datos existentes
  Entonces los TrainerDebrief ya escritos se conservan y siguen siendo consultables en modo lectura

Escenario: lo que dirección necesita
  Entonces las métricas de seguimiento se calculan del debrief de sesión (E3-07),
  la asistencia y el consumo de bono

Escenario: la divergencia entrenador ↔ socio
  Entonces se sigue pudiendo contrastar con getWeeklyClientFeedback, que ya existe
```

## E3-09 · Rangos de composición corporal por sexo y edad, o sin semáforo

`M` · **P1** · origen §2.2 · regla `RB-SALUD-013`

**Como** socia de 52 años **quiero** que un 29 % de grasa no me salga marcado en rojo **para** no recibir una etiqueta de alarma sanitaria en mi propio portal.

`reference-ranges.ts:17-22` fija `bodyFatPct: { min: 8, max: 19 }` **unisex y sin edad**: son los rangos del informe Tanita de **un hombre de 28 años** convertidos en el defecto de toda la aplicación — y es el defecto que se usa mientras dirección no cree filas, o sea siempre. Una mujer de 52 años con un 29 % de grasa, perfectamente normal, sale `critical` en su ficha **y en su portal**. Poner una etiqueta roja de salud a una socia sana es la forma más rápida de perderla.

```gherkin
Escenario: rangos por sexo y edad
  Entonces las filas de referencia se definen por sexo y tramo de edad

Escenario: sin fila configurada
  Dado un socio para el que no hay rango definido
  Entonces el valor se muestra SIN semáforo, nunca en rojo por defecto

Escenario: el defecto actual desaparece
  Entonces los valores de reference-ranges.ts dejan de aplicarse a todo el mundo

Escenario: tendencia
  Entonces el % graso se presenta como tendencia contra la medición anterior,
  que es lo único defendible sin normativa poblacional

Escenario: portal del socio
  Entonces la misma regla aplica en portal/evolucion, no solo en la ficha de staff
```

## E3-10 · "Edad metabólica" deja de pintarse

`XS` · **P2** · origen §2.2

**Como** responsable del producto **quiero** retirar la edad metabólica de la ficha y del portal **para** no presentar marketing de fabricante de básculas como si fuera un dato clínico.

En una ficha con membrete del centro, "Edad metabólica: 47" parece un diagnóstico.

```gherkin
Escenario: ficha de socio
  Entonces metabolicAge no se pinta

Escenario: portal del socio
  Entonces tampoco

Escenario: el dato se conserva
  Entonces la columna sigue existiendo y se sigue importando de la báscula,
  disponible en la exportación, solo que no se presenta como métrica de seguimiento
```

## E3-11 · La valoración incorpora patrones de movimiento, movilidad y cargas

`L` · **P1** · origen §2.2

**Como** entrenador **quiero** que la valoración valore movimiento **para** poder programar con algo más que una autopercepción.

De los siete patrones básicos que **la propia metodología exige** no se evalúa **ninguno**. Lo más cercano es `experiencia.tecnicaBasicos: BAJA|MEDIA|ALTA`, una autopercepción. Y las marcas son un catálogo cerrado de cuatro: dominadas, flexiones, plancha y circuito de agilidad. Ni bisagra, ni sentadilla, ni empuje horizontal, ni movilidad de tobillo u hombro, ni carga de referencia.

```gherkin
Escenario: siete patrones
  Entonces la valoración incluye los siete patrones de la metodología
  Y cada uno se puntúa como ejecuta / ejecuta con regresión / no ejecuta, más nota corta

Escenario: movilidad
  Entonces incluye tres chequeos de pasa/no pasa: tobillo, cadera y hombro

Escenario: cargas de referencia
  Entonces se registran kilos de referencia por patrón, con fecha

Escenario: duración
  Entonces el bloque completo se rellena en menos de un minuto con el socio delante:
  siete toques, tres toques y los kilos que haya

Escenario: histórico
  Entonces las cargas de referencia se pueden comparar entre valoraciones
```

## E3-12 · El mesociclo gana `startDate`, semana en curso y descarga declarada

`M` · **P1** · origen §2.2 · regla `RB-MESO-005`

**Como** entrenador **quiero** saber en qué semana del mesociclo está el socio **para** que el plan sea una periodización y no un documento.

`Mesocycle` **no tiene fecha de inicio**. Y sin descarga, sin RIR/RPE objetivo y sin progresión semana a semana, cada fase describe "la semana tipo": una fase de 4 semanas es cuatro veces la misma semana.

```gherkin
Escenario: fecha de inicio
  Entonces Mesocycle tiene startDate, obligatoria al aprobar

Escenario: semana en curso
  Entonces la ficha y el panel muestran en qué semana del plan está el socio hoy

Escenario: descarga declarada
  Entonces MesocyclePhase tiene deload booleano
  Y una fase de más de 3 semanas exige declarar dónde está la descarga o cómo progresa

Escenario: validación al aprobar
  Cuando se aprueba un mesociclo con una fase larga sin descarga ni progresión declarada
  Entonces se rechaza con el motivo

Escenario: mesociclos existentes
  Entonces se les asigna startDate a partir de su fecha de aprobación, marcado como estimado
```

## E3-13 · Registro de la carga del ejercicio principal en el debrief de EP

`M` · **P2** · origen §2.2

**Como** entrenador **quiero** anotar con cuántos kilos entrenó el socio **para** no proponer una progresión a ciegas.

`MesocycleExercise.load` es carga **planificada**. No existe modelo de serie realizada, kilos ni RM: **cero historial de cargas**. Un entrenador serio no se fía de un sistema que propone progresar sin saber con cuánto entrenó el socio la semana pasada.

```gherkin
Escenario: registro en el debrief
  Dado una sesión de entrenamiento personal
  Cuando el entrenador guarda el debrief
  Entonces puede anotar ejercicio principal, kilos y repeticiones, en dos campos

Escenario: opcional
  Entonces el debrief se puede guardar sin ese dato: no bloquea el flujo de sala

Escenario: histórico
  Entonces la ficha muestra la progresión de carga de ese ejercicio a lo largo del tiempo

Escenario: el generador lo recibe
  Entonces las cargas registradas entran en el briefing del generador de mesociclos
```

## E3-14 · Derivación a fisio como registro de primera clase

`M` · **P1** · origen §2.2 · regla `RB-SALUD-014`

**Como** centro **quiero** registrar a quién derivé, cuándo y qué dijo **para** poder demostrar que adapté y derivé, en vez de rehabilitar.

**Un centro de entrenamiento personal en España no rehabilita: adapta y deriva.** El perfil "Rehabilitación" está bien escrito, pero le faltan dos cosas obligatorias: campo de derivación y **bloqueo**.

```gherkin
Escenario: registro de derivación
  Entonces existe un registro con profesional, fecha, motivo y respuesta o informe recibido

Escenario: bloqueo del perfil Rehabilitación
  Cuando se intenta aprobar un mesociclo con perfil Rehabilitación
  Y no hay alta médica ni informe registrado
  Entonces se rechaza con el motivo

Escenario: texto que ve el entrenador
  Entonces el perfil se rotula "adaptación bajo supervisión médica", no "recuperar la zona"

Escenario: dolor referido dispara la propuesta
  Cuando un debrief registra dolor referido
  Entonces se propone abrir una derivación, sin crearla automáticamente
```

## E3-15 · Filtro de identificadores sobre el texto libre que va a la IA

`M` · **P0** · origen §2.2, §7 CN-08 · **condicionada por D-C5** · regla `RB-IA-004`

**Como** socio **quiero** que la promesa de seudonimización se cumpla **para** que mi nombre no viaje a un tercero después de que la pantalla me haya dicho que no lo hace.

`mesociclos/panel.tsx:94-98` dice literalmente *"La IA recibe… Nunca nombre, DNI, teléfono ni email"*, y **no existe ningún filtro de texto libre**: van sin filtrar `HealthRecord.description`, `cierre.notasEntrenador`, `screening.lesionesActuales`, `screening.medicacion`, `screening.cirugias`, `perfil.motivacionReal` y `ClientGoal.label`. Basta que un entrenador escriba *"María se queja del hombro desde que su hijo Pablo nació"*.

**El riesgo no es la salida en sí** —Anthropic es encargado y el trayecto está auditado— **sino prometer una garantía técnica que no se aplica**: eso convierte un tratamiento defendible en uno desleal.

**Decisión D-C5**: el DPA con Anthropic se firma antes del piloto. Hasta que esté firmado, la generación con IA no opera sobre datos de un socio real.

```gherkin
Escenario: filtro de identificadores
  Dado un texto libre que contiene un nombre propio, un DNI, un teléfono o un email
  Cuando se construye el briefing para la IA
  Entonces esos identificadores se sustituyen por marcadores antes de salir

Escenario: cobertura
  Entonces el filtro se aplica a los siete campos de texto libre que hoy viajan sin filtrar,
  y a la petición en crudo de refineMesocyclePlan

Escenario: aviso en la interfaz
  Entonces la pantalla explica que el filtro es automático y no sustituye al criterio de quien escribe

Escenario: DPA no firmado
  Dado que el contrato de encargado con el proveedor de IA no consta firmado
  Entonces la generación se bloquea para socios reales y solo opera sobre datos de demostración
  Y el motivo se explica en pantalla

Escenario: alternativa documentada
  Dado que se opte por ajustar el texto en vez de filtrar
  Entonces se sube CONSENT_VERSION y se pide re-consentimiento
  Y esta historia se cierra como "vía 2", dejando constancia de la elección
```

## E3-16 · El generador de mesociclos recibe el material disponible por centro y sala

`M` · **P2** · origen §2.2

**Como** entrenador **quiero** que la IA sepa qué material hay **para** que no me programe una kettlebell de 32 kg en un centro donde no la hay.

Hoy el briefing **no recibe nada de material**. No hace falta un control de inventario —se pide siempre y no lo usa nadie—: basta una lista por centro y sala.

```gherkin
Escenario: lista de material
  Entonces cada centro y cada sala declaran su material disponible, como lista editable

Escenario: el briefing lo recibe
  Cuando se genera un mesociclo
  Entonces el material del centro del socio entra en el briefing

Escenario: sin lista configurada
  Entonces el generador declara el supuesto en vez de inventarlo,
  coherente con la regla de la metodología de marcar supuestos

Escenario: propuesta fuera de catálogo
  Entonces si el plan propone material no declarado, se marca visiblemente al revisar
```

## E3-17 · Plantillas de sesión reutilizables para grupo reducido

`L` · **P2** · origen §2.2

**Como** entrenador **quiero** plantillas de sesión con contenido **para** no rehacer cada semana el entrenamiento de un grupo, que es el 70 % del negocio.

Hoy `SessionTemplate` es solo un horario —nombre, día, hora, aforo— **sin contenido**.

```gherkin
Escenario: plantilla con contenido
  Entonces una plantilla contiene bloques y ejercicios, con series, repeticiones e intensidad

Escenario: regresión y progresión
  Entonces cada ejercicio declara su regresión y su progresión

Escenario: aplicar a una sesión
  Cuando se aplica una plantilla a una sesión de grupo
  Entonces el contenido queda disponible en el brief de esa sesión

Escenario: adaptación por socio
  Entonces el brief cruza el contenido con el semáforo de cada asistente
  y señala qué ejercicio hay que regresionar y para quién

Escenario: la plantilla sigue sirviendo de horario
  Entonces el uso actual como franja de agenda no cambia
```

## E3-18 · Auditar la apertura de un mesociclo y purgar `aiConversation` al aprobar

`S` · **P2** · origen §7 CN-10 · regla `RB-IA-005`

**Como** responsable de cumplimiento **quiero** que los datos clínicos duplicados fuera del punto único de lectura dejen traza **para** no perder la trazabilidad que el resto del sistema sí tiene.

`Mesocycle.safetyCriteria` y `Mesocycle.aiConversation` —que contiene el briefing íntegro con la sección "Screening clínico"— se leen **sin pasar por `health-access.ts` y sin escribir en `AuditLog`**. El control por rol sí coincide; lo que se pierde es la traza. Igual con `SessionDebrief.pain`.

```gherkin
Escenario: apertura de mesociclo
  Cuando alguien abre un mesociclo con criterios clínicos
  Entonces se escribe AuditLog con actor, socio y momento

Escenario: purga al aprobar
  Cuando se aprueba un mesociclo
  Entonces aiConversation se purga, conservando solo el plan aprobado y la marca de revisión humana

Escenario: SessionDebrief.pain
  Entonces su lectura fuera del entrenador de la sesión también deja traza

Escenario: el rol sigue mandando
  Entonces los permisos actuales no cambian: esta historia añade traza, no acceso
```

---

# E4 · Cobros con Stripe

> **Superficie de escritura contra Stripe en todo el sistema hoy: 8 llamadas.** No existe ni una sola a `subscriptions.update/cancel`, `refunds.create`, `invoices.*`, `prices.update`, `products.update`, `balance`, `payouts`, `disputes`, `creditNotes` ni `subscriptionSchedules`. **Todo el ciclo de vida posterior a la venta está desconectado de la pasarela**: un socio dado de baja en Apta sigue siendo cargado por Stripe.
>
> Las 28 historias `HU-ST-*` se reproducen aquí con las decisiones D-S1 a D-S8 ya incorporadas. Fases: **0 saneamiento** (bloqueante) · **1 MVP de cobro** · **2 recurrencia y ciclo de vida** · **3 morosidad** · **4 contabilidad**.
>
> **Decisiones aplicadas**: cuentas **Standard** (D-S1) · Bizum solo en `mode:"payment"` (D-S2) · plan `ONLINE` no se vende desde la app (D-S3) · subida prorrateada, bajada al ciclo (D-S4) · gracia de morosidad **7 días configurable** (D-S5) · fin de reintentos `cancel` (D-S6) · reembolsos y disputas **desde Apta** (D-S7) · **Apta factura solo su licencia**, el centro factura al socio (D-S8).

## FASE 0 — Saneamiento · ≈1 sprint · bloqueante antes de tocar dinero real

### HU-ST-01 · Un webhook que verifica las dos firmas

`S` · **P0** · regla `RB-PAGO-020` · cierra BUG-3

Un endpoint del Dashboard escucha eventos *de tu cuenta* **o** *de cuentas conectadas*, y cada uno tiene su propio signing secret. El código verifica con un único secreto → **uno de los dos flujos devolverá siempre 400 "Firma inválida"**. `.env.example` ya anticipa `STRIPE_CONNECT_WEBHOOK_SECRET`, **y el código no lo lee**. Bloquea la puesta en producción.

```gherkin
Escenario: evento de plataforma
  Dado STRIPE_WEBHOOK_SECRET y STRIPE_CONNECT_WEBHOOK_SECRET configurados
  Cuando llega un evento firmado con el secreto de plataforma
  Entonces se verifica con ese secreto y se enruta a handlePlatformEvent
Escenario: evento de cuenta conectada
  Cuando llega un evento firmado con el secreto de Connect
  Entonces se verifica con ese secreto y se enruta a handleConnectEvent
Escenario: firma que no valida con ninguno
  Entonces responde 400 y no escribe nada en la base de datos
Escenario: solo un secreto configurado
  Entonces sigue funcionando con ese (compatible hacia atrás)
```

### HU-ST-02 · Plano 1 conciliado contra la API vigente

`S` · **P0** · dep. HU-ST-01 · corrige `RB-PLAT-004` · cierra BUG-1 y BUG-2

Verificado contra el SDK instalado (22.5.0, API `2026-07-29.dahlia`): **`Invoice` ya no tiene `subscription` de primer nivel**. `subscriptionId` sale siempre `null` → `invoice.paid` **nunca renueva** y `invoice.payment_failed` **nunca pone `PAST_DUE`**: *un gimnasio que deja de pagar la licencia conserva el acceso para siempre*.

```gherkin
Escenario: renovación cobrada
  Dado un invoice.paid de plataforma con parent.subscription_details.subscription
  Entonces la organización queda ACTIVE y currentPeriodEnd se actualiza al fin de periodo del item
Escenario: impago de licencia
  Dado un invoice.payment_failed de plataforma
  Entonces la organización pasa a PAST_DUE
Escenario: cuenta pinneada a una versión antigua
  Dado un invoice con el campo legado subscription
  Entonces se resuelve igual (se comprueban ambos shapes)
Escenario: reentrega del mismo evento
  Entonces el estado final es idéntico y no se duplica nada
```

Extrae `resolveInvoiceSubscriptionId` de `member-billing.ts` a un módulo compartido: el plano 2 ya lo tiene resuelto, el plano 1 se quedó con el shape legado.

### HU-ST-03 · Versión de API fijada y auditada

`S` · **P0** · regla `RB-PAGO-021` · cierra BUG-4

`new Stripe(key)` usa la versión que traiga el SDK, declarado como `^22.3.2`. Un `npm update` puede cambiar la versión de API bajo los pies — **exactamente el mecanismo que produjo BUG-1**.

```gherkin
Escenario: cliente construido
  Entonces getStripeClient construye con apiVersion explícita
Escenario: documentación
  Entonces la versión está documentada en .env.example
Escenario: SDK con otra versión
  Cuando el SDK instalado declara una versión distinta a la fijada
  Entonces el arranque lo avisa por log, sin impedir el arranque
```

### HU-ST-04 · Idempotencia en toda creación

`M` · **P0** · regla `RB-PAGO-022` · cierra BUG-5

`grep idempotencyKey src/` → **0 resultados**. Todas las creaciones pueden duplicarse ante reintento de red.

```gherkin
Escenario: checkout de socio
  Cuando createMemberCheckout se ejecuta dos veces con el mismo (orgId, memberId, planId, ventana de 10 min)
  Entonces Stripe devuelve la misma sesión y no se crean dos Payment PENDING
Escenario: espejo de precio
  Cuando ensureStripePrice corre en paralelo dos veces para el mismo plan
  Entonces se crea un único Product y un único Price
Escenario: clave documentada
  Entonces cada clave sigue el patrón <recurso>:<orgId>:<entidad>:<versión> y está listada en el doc
```

### HU-ST-05 · Deduplicación de eventos por `event.id`

`M` · **P0** · modelo nuevo `StripeWebhookEvent` · regla `RB-PAGO-023`

```gherkin
Escenario: primera entrega
  Entonces se inserta StripeWebhookEvent(id, type, account, processedAt) y se procesa
Escenario: reentrega
  Entonces se responde 200 sin reprocesar
Escenario: fallo durante el procesado
  Entonces NO queda marcado como procesado y se responde 500 para que Stripe reintente
```

### HU-ST-06 · Desconexión de la cuenta conectada

`S` · **P0** · regla `RB-CONNECT-004`

```gherkin
Escenario: deauthorize
  Dado account.application.deauthorized de una cuenta conocida
  Entonces StripeAccount queda chargesEnabled=false y payoutsEnabled=false
  Y la UI vuelve a "Conecta tu Stripe para cobrar"
  Y no se borra el acct_ ni el espejo de precios (histórico intacto)
Escenario: cuenta desconocida
  Entonces se descarta sin escribir
```

## FASE 1 — MVP de cobro: Connect, catálogo y venta · ≈1,5 sprints

### HU-ST-07 · Onboarding de Connect con estado de KYC a la vista

`M` · **P0** · dep. HU-ST-06 · **decisión D-S1: cuentas Standard**

```gherkin
Escenario: sin conectar
  Entonces veo "Conectar cobros con Stripe" y el checklist marca el paso pendiente
Escenario: conectado con requisitos pendientes
  Dado chargesEnabled=false
  Entonces veo requirements.currently_due traducidos y un enlace para completarlos
  Y no se muestra ningún botón de cobro a socios
Escenario: conectado y operativo
  Entonces veo chargesEnabled y payoutsEnabled en verde y la fecha del próximo payout
Escenario: Connect no configurado en el entorno
  Entonces se explica que falta STRIPE_CONNECT_CLIENT_ID, sin botón muerto
Escenario: métodos de pago
  Entonces se explica que cada centro activa sus propios métodos desde su Dashboard de Stripe,
  con enlace directo, porque la cuenta es Standard
```

### HU-ST-08 · CRUD de productos con sincronización real a Stripe

`L` · **P0** · dep. HU-ST-04 · cierra BUG-7 y la divergencia móvil · regla `RB-VENTA-007`

Web: al cambiar precio invalida `stripePriceId` (correcto). **Móvil: no** — `PATCH /api/mobile/v1/products/[id]` cambia `priceCents` sin tocarlo → **se sigue vendiendo al precio antiguo**. Además `name`/`description`/`imageUrl` nunca se propagan, archivar no pone `active:false` en Stripe, y el `DELETE` móvil deja Product/Price huérfanos. Y `createMemberCheckout` no filtra planes archivados: **un plan `active:false` sigue siendo vendible desde recepción/portal web**.

```gherkin
Escenario: alta de producto
  Entonces se crea Product y Price en la cuenta conectada con idempotencia
  Y stripeProductId/stripePriceId/stripeAccountId quedan guardados
Escenario: cambio de precio
  Entonces se crea un Price NUEVO, el anterior se marca active:false pero NO se borra
  Y las Subscription vivas siguen cobrando el importe anterior hasta migrarse explícitamente
  Y se registra el cambio en AuditLog con importe anterior y nuevo
Escenario: cambio de nombre, descripción o foto
  Entonces se actualiza el Product de Stripe (no genera precio nuevo)
Escenario: ocultar producto
  Entonces active=false en Apta y en Stripe; quien lo tiene contratado sigue igual
Escenario: plan archivado
  Entonces createMemberCheckout lo rechaza, en web y en móvil
Escenario: sin Stripe conectado
  Entonces el producto se crea solo en Apta, marcado "pendiente de sincronizar"
Escenario: paridad móvil
  Cuando cambio el precio desde PATCH /api/mobile/v1/products/[id]
  Entonces se aplica exactamente la misma regla que en la web
  Y el DELETE móvil archiva, nunca borra
```

`RB-VENTA-007`: **nunca borrar un Price; archivar.**

### HU-ST-09 · Venta de bono puntual con los métodos del mercado español

`M` · **P0** · dep. HU-ST-08 · **decisión D-S2: Bizum solo en `mode:"payment"`**

Hoy `member-billing.ts:145` fija `payment_method_types` a mano, lo que además **desactiva Link y wallets**.

```gherkin
Escenario: bono puntual
  Dado un plan SESSION_PACK/DROP_IN/DUO/PERSONAL_TRAINING
  Entonces el checkout se abre en mode:"payment" y ofrece los métodos habilitados en la cuenta conectada,
  Bizum incluido
Escenario: cuota recurrente
  Entonces se abre en mode:"subscription" y NUNCA ofrece Bizum
Escenario: la restricción vive en un solo sitio
  Entonces la exclusión de Bizum se decide dentro de isRecurring(), no repartida por el código
Escenario: método no disponible en la cuenta del gimnasio
  Entonces simplemente no aparece; el checkout no falla
```

### HU-ST-10 · Reglas de las tiendas en la app nativa

`M` · **P1** · dep. HU-ST-09 · **decisión D-S3: el plan `ONLINE` no se vende desde la app**

`PlanType.ONLINE` es contenido digital consumido dentro de la app → cae potencialmente bajo IAP obligatorio; los planes presenciales quedan exentos. La base actual es correcta: `onboarding/pago.tsx:43-60` ya usa `WebBrowser.openBrowserAsync`.

```gherkin
Escenario: bono o cuota presencial
  Entonces se abre Stripe Checkout en el navegador del sistema (nunca en un WebView propio)
  Y no se guarda ningún dato de tarjeta en la app ni en nuestro servidor
Escenario: plan ONLINE
  Entonces NO aparece en el catálogo de la app, ni se enlaza a su compra
  Y sigue estando disponible en la web
Escenario: vuelta del navegador
  Entonces la app relee /me y desbloquea el acceso solo si el webhook ya confirmó el cobro
```

### HU-ST-11 · Modo demo también en el plano 2

`S` · **P1** · regla `RB-PAGO-024`

`/demo-checkout` sustituye el checkout de **licencia** sin `STRIPE_SECRET_KEY`, pero **no hay equivalente para el plano 2**: sin Stripe, el socio simplemente no puede comprar.

```gherkin
Escenario: compra de socio sin Stripe configurado
  Entonces existe un checkout de demostración equivalente, claramente rotulado
Escenario: protección
  Entonces la server action comprueba isDemoModeActive(), igual que E1-11
Escenario: fecha de caducidad
  Entonces la ruta de demostración queda documentada como temporal
  Y se retira el día que Stripe esté vivo en producción
```

## FASE 2 — Recurrencia y ciclo de vida · ≈2 sprints

### HU-ST-12 · SEPA Direct Debit con mandato

`L` · **P0** · dep. HU-ST-09, HU-ST-05 · reglas `RB-PAGO-009` + `RB-PAGO-025`

SEPA está **declarado pero no soportado**: `payment_method_types` lo incluye, pero **sin ningún manejo de su asincronía**. Un débito que se devuelve a las semanas **no produce ningún efecto en Apta hoy**.

```gherkin
Escenario: alta con SEPA
  Entonces Stripe recoge IBAN y mandato, y Apta guarda referencia de mandato y últimos 4 del IBAN
  Y el socio recibe la confirmación de mandato exigida por el esquema SEPA
Escenario: primer cobro asíncrono
  Entonces la Subscription queda "pendiente de confirmación" y NO se abre acceso a reservas
  Y al llegar checkout.session.async_payment_succeeded / invoice.paid se activa
Escenario: fallo asíncrono
  Entonces el Payment queda FAILED y arranca el dunning
Escenario: devolución bancaria posterior (R-transaction)
  Dado charge.refunded o charge.dispute.created sobre un cobro SEPA ya conciliado
  Entonces el Payment vuelve a FAILED/REFUNDED, el socio pasa a DELINQUENT y se avisa a recepción
```

`RB-PAGO-025`: **un cobro asíncrono no da acceso hasta liquidar.**

### HU-ST-13 · Cambio de plan con prorrateo, sin doble suscripción

`L` · **P0** · **decisión D-S4** · cierra el doble cobro

`createMemberCheckout` **siempre** abre una suscripción nueva y nada cancela la anterior → **doble cobro**. Lo mismo en el plano 1: `applyPlanChangeFromCheckout` sobrescribe `platformStripeSubscriptionId` y **abandona** la anterior, que sigue facturando.

```gherkin
Escenario: subida de plan a mitad de mes
  Entonces se actualiza el ITEM de la suscripción existente (no se crea otra)
  Y se aplica prorrateo inmediato: se cobra la diferencia y el acceso se abre ya
  Y Stripe emite la factura de prorrateo y el webhook la concilia como Payment
Escenario: bajada de plan
  Entonces el cambio se aplica al próximo ciclo, sin devolución del periodo en curso
  Y el socio ve la fecha exacta en la que empieza a pagar menos
Escenario: socio sin suscripción viva
  Entonces se abre un checkout nuevo (comportamiento actual)
Escenario: previsualización
  Entonces antes de confirmar se muestra el importe exacto que se va a cobrar hoy
Escenario: plano 1
  Entonces el cambio de plan de licencia sigue la misma regla y cancela la suscripción anterior
```

### HU-ST-14 · Congelación real

`M` · **P0** · **requiere separar `FROZEN` (impago) de `PAUSED` (voluntaria)** · reglas `RB-PAGO-004` + `RB-PAGO-026`

Congelar hoy escribe `FROZEN` en local y **nada en Stripe**: se sigue cobrando cada mes. Y `FROZEN` está **sobrecargado**: significa a la vez "congelado en agosto" y "no ha pagado".

```gherkin
Escenario: congelar con fecha de fin
  Entonces la suscripción de Stripe queda con pause_collection y se programa la reanudación
  Y en Apta el estado es PAUSED (nuevo, distinto de FROZEN por impago)
Escenario: congelar indefinidamente
  Entonces pause_collection sin fecha; recepción puede reanudar en cualquier momento
Escenario: reanudar
  Entonces se retira pause_collection y el próximo ciclo se cobra con normalidad
Escenario: sin Stripe conectado
  Entonces se congela solo en local y se avisa de que el cobro externo no se ha detenido
Escenario: lista de morosos
  Entonces un socio PAUSED no aparece como moroso
```

### HU-ST-15 · Baja a fin de periodo vs. inmediata

`M` · **P0** · corrige `subscription-actions.ts:182-205` y `subscription-jobs.ts:8-22`

Cancelación programada hoy escribe `CANCELLED` en local y **nada en Stripe**: se sigue cobrando indefinidamente. **Un socio dado de baja en Apta sigue siendo cargado.**

```gherkin
Escenario: baja a fin de periodo (por defecto)
  Entonces cancel_at_period_end=true; la suscripción sigue ACTIVE hasta el fin de ciclo
  Y al llegar customer.subscription.deleted pasa a CANCELLED en Apta
Escenario: baja inmediata con devolución
  Entonces se cancela ya y se ofrece el reembolso prorrateado, con motivo obligatorio
Escenario: revertir una baja programada
  Entonces se retira cancel_at_period_end antes de la fecha
Escenario: el job local ya no cancela por su cuenta
  Entonces runScheduledCancellationsRule solo cubre bonos sin suscripción de Stripe
Escenario: cambio de importe
  Cuando dirección cambia el importe de una suscripción viva
  Entonces se propaga a Stripe; hoy solo se escribe priceCents en local
```

### HU-ST-16 · Preaviso de cobro

`S` · **P1** · regla `RB-PAGO-027` · cubre también CN-13 (E10-13)

```gherkin
Escenario: preaviso
  Dado invoice.upcoming a X días del cargo
  Entonces el socio recibe un email con importe, fecha y método de pago
  Y se envía una sola vez por factura (marca en AuditLog, patrón de sendDunningNoticeOnce)
Escenario: SEPA
  Entonces el preaviso respeta el plazo mínimo de 14 días naturales del esquema SEPA Core
  Y menciona el plazo de devolución de 8 semanas
Escenario: el socio ha desactivado avisos comerciales
  Entonces igualmente lo recibe: es correo de servicio, sin unsubscribe
```

### HU-ST-17 · Cambio de titular o método de pago sin llamar por teléfono

`M` · **P0** · la librería ya existe · relacionada con E5-01

`createMemberBillingPortalSession` existe y **el portal web no la enlaza en ningún sitio**: solo se llega por el enlace mágico del email de impago.

```gherkin
Escenario: desde el portal web con sesión
  Entonces hay un botón "Gestionar mi pago" que abre el Billing Portal de la cuenta conectada
Escenario: desde la app
  Entonces el mismo botón usa /api/mobile/v1/portal/billing/portal y abre el navegador del sistema
Escenario: cambio de método
  Entonces el siguiente cobro usa el método nuevo sin intervención de recepción
Escenario: socio sin cliente de Stripe
  Entonces se explica que aún no tiene pago online y se le remite a su centro
```

## FASE 3 — Morosidad y dunning · ≈1,5 sprints

### HU-ST-18 · Dunning con corte de acceso explícito

`M` · **P0** · dep. HU-ST-14 · **decisiones D-S5 (7 días configurable) y D-S6 (`cancel`)** · reglas `RB-PAGO-012` + `RB-PAGO-028`

`Member.state = DELINQUENT` **no corta el acceso**: el motor de reservas filtra por `Subscription.status === "ACTIVE"`, no por `Member.state`.

```gherkin
Escenario: primer fallo
  Entonces Payment FAILED, Member DELINQUENT, email al socio con enlace de arreglo, tarea a recepción
  Y el socio TODAVÍA puede reservar durante el periodo de gracia
Escenario: periodo de gracia por defecto
  Entonces son 7 días naturales desde el primer impago
Escenario: periodo de gracia configurable
  Cuando la organización fija otro valor
  Entonces se aplica el suyo, y el valor se valida entre 0 y 60 días
Escenario: fin del periodo de gracia
  Entonces se corta la reserva de nuevas sesiones y se le explica el motivo al entrar
Escenario: cobro recuperado
  Entonces vuelve a ACTIVE, el aviso se resuelve y el acceso se restablece
Escenario: agotados los reintentos
  Entonces la suscripción se CANCELA en Stripe y el socio pasa a baja, con registro en AuditLog
  Y la configuración del Dashboard de Stripe se fija a "cancel" para que ambos lados coincidan
Escenario: el socio está congelado voluntariamente
  Entonces no aparece en la lista de morosos
```

### HU-ST-19 · Pantalla de recuperación para el socio

`S` · **P1**

Ya existe la base (`/gestionar-suscripcion/[token]`); falta el **reintento explícito de la factura pendiente** sin esperar al siguiente reintento de Stripe.

```gherkin
Escenario: reintento explícito
  Dado un socio con una factura pendiente
  Cuando pulsa "Pagar ahora"
  Entonces se reintenta la factura en el momento
Escenario: método caducado
  Entonces se le ofrece actualizar el método antes de reintentar
Escenario: éxito
  Entonces el acceso se restablece sin intervención de recepción
```

### HU-ST-20 · Reembolsos reales y notas de crédito

`L` · **P1** · **decisión D-S7: desde Apta** · desbloquea `subscription-actions.ts:79-84`

La "devolución" actual es marcar `REFUNDED` en local, y **bloquea** si el pago vino de Stripe; `Payment.stripeRefundId` sigue siempre NULL.

```gherkin
Escenario: devolución total de un cobro Stripe
  Entonces se emite el refund en la cuenta conectada con idempotencia y motivo obligatorio
  Y al llegar charge.refunded el Payment pasa a REFUNDED con stripeRefundId
Escenario: devolución parcial
  Entonces se admite un importe menor y el Payment refleja el importe devuelto
Escenario: cuota prorrateada al darse de baja
  Entonces se calcula con la previsualización de Stripe y se devuelve ese importe
Escenario: nota de crédito sobre una factura de suscripción
  Entonces se emite creditNote y queda enlazada al Payment
Escenario: pago en efectivo
  Entonces sigue el flujo local actual, sin llamar a Stripe
Escenario: doble clic
  Entonces no se emiten dos refunds (misma clave de idempotencia)
Escenario: permisos
  Entonces solo dirección puede emitir un reembolso, y queda en AuditLog con autor y motivo
```

### HU-ST-21 · Disputas y contracargos visibles

`M` · **P1** · **decisión D-S7**

```gherkin
Escenario: disputa abierta
  Dado charge.dispute.created
  Entonces se crea una tarea para dirección con importe y evidence_details.due_by
Escenario: aportar evidencia
  Entonces en esta fase se enlaza al Dashboard de Stripe, sin delegar la subida en Apta
Escenario: resolución
  Cuando llega charge.dispute.closed
  Entonces la tarea se resuelve y el Payment refleja el resultado
```

### HU-ST-22 · Tarjetas por caducar

`S` · **P2** · dep. HU-ST-17, HU-ST-24

```gherkin
Escenario: aviso
  Dado una tarjeta que caduca el mes que viene
  Entonces el socio recibe un aviso con enlace al Billing Portal
Escenario: panel
  Entonces dirección ve cuántos socios tienen el método a punto de caducar
Escenario: método actualizado
  Entonces el aviso deja de aparecer
```

## FASE 4 — Contabilidad, consola e informes · ≈2 sprints

### HU-ST-23 · Neto real, comisiones y payouts

`M` · **P2**

```gherkin
Escenario: desglose del cobro
  Entonces Payment guarda bruto, comisión y neto desde el balance transaction
Escenario: vista de payouts
  Entonces se listan los payouts con arrival_date y qué cobros lo componen
Escenario: cuadre
  Entonces la suma de netos de los cobros de un payout coincide con su importe
```

### HU-ST-24 · Consola de lectura de Stripe para dirección

`L` · **P2**

No existe `src/app/(app)/stripe/`. Todo `docs/STRIPE_API_SECCION_IMPLEMENTACION.md` está sin construir.

```gherkin
Escenario: acceso
  Entonces /stripe es accesible solo para OWNER, y cada apertura queda en AuditLog
Escenario: entorno
  Entonces se muestra un distintivo TEST o LIVE según el prefijo de la clave
Escenario: listados
  Entonces cobros, suscripciones, clientes y payouts se listan con paginación por cursor
Escenario: error de Stripe
  Entonces la tarjeta afectada degrada con su mensaje, sin tumbar la pantalla
```

### HU-ST-25 · Exportación contable para la gestoría

`M` · **P2** · regla `RB-BI-023` · **decisión D-S8**

```gherkin
Escenario: CSV mensual
  Entonces incluye fecha, socio, concepto, bruto, comisión, neto, método, id de Stripe y payout asociado
Escenario: cuadre
  Entonces la suma de netos del periodo coincide con la suma de payouts liquidados
Escenario: devoluciones
  Entonces aparecen en negativo, con su motivo
Escenario: formato español
  Entonces usa punto y coma y BOM, como el patrón ya probado de export-ranking-button
Escenario: qué NO es
  Entonces el fichero declara que no es una serie de facturación:
  Apta factura solo su licencia al centro, y el centro factura al socio con su propio software
```

### HU-ST-26 · Informes financieros de Stripe bajo demanda

`S` · **P3**

```gherkin
Escenario: informe
  Entonces dirección puede pedir un informe financiero del periodo y descargarlo
Escenario: sin Stripe conectado
  Entonces la sección explica que hace falta conectar cobros, sin botón muerto
```

### HU-ST-27 · Cupones y códigos promocionales medibles

`M` · **P2** · dep. HU-ST-08

```gherkin
Escenario: alta de cupón
  Entonces se crea en la cuenta conectada y queda espejado en Apta
Escenario: uso
  Entonces el checkout admite el código y el Payment registra el descuento aplicado
Escenario: medición
  Entonces dirección ve cuántas ventas y cuánto importe ha traído cada código
```

### HU-ST-28 · Comisión de plataforma documentada, NO activada

`S` · **P3**

```gherkin
Escenario: por defecto
  Entonces no se envía application_fee_amount: Apta no toca el dinero del gimnasio
Escenario: documentación
  Entonces queda escrito dónde se insertaría y qué implicaciones fiscales tendría
Escenario: argumento de venta
  Entonces "cero comisión sobre tus cobros" se puede afirmar sin matices (ver E6-05)
```

## Fuera de la numeración `HU-ST-*`

### E4-29 · `saveMembershipPlan()` compartido

`M` · **P0** · origen §1.2 M-05, §9.2 A8

**Como** dirección **quiero** que editar un producto haga lo mismo desde la web y desde la app **para** que no se cobre el precio antiguo ni desaparezca un producto que debía archivarse.

| | Web `/organization` | Móvil `/products` |
|---|---|---|
| Tipo de plan | `type` explícito, 6 valores | `serviceKind` de 3 → `planTypeFor`. **`DROP_IN` y `DUO` inalcanzables**, y editar uno lo convierte en `SESSION_PACK` |
| `description` / `imageUrl` | **no existen en el formulario** | sí |
| Cambio de precio | invalida `stripePriceId` | **no lo invalida** |
| Borrado | archivar (`RB-VENTA-002`) | `prisma.membershipPlan.delete()` |

Dos consecuencias reales: **hay un cobro con precio obsoleto esperando a ocurrir**, y `description`/`imageUrl` —lo que ve el socio en el catálogo y en `/hazte-socio`— **un gimnasio que solo use la web no puede rellenarlos nunca**.

```gherkin
Escenario: función única
  Entonces web y móvil llaman a saveMembershipPlan() con el mismo contrato

Escenario: cambio de precio desde el móvil
  Entonces invalida stripePriceId igual que la web

Escenario: borrado desde el móvil
  Entonces archiva (active=false), nunca borra

Escenario: tipo de plan
  Entonces los seis valores de PlanType son alcanzables desde las dos superficies
  Y editar un DROP_IN no lo convierte en SESSION_PACK

Escenario: contenido de venta
  Entonces description e imageUrl están en el formulario de la web

Escenario: regresión
  Entonces existe un test que edita el mismo plan por las dos vías y comprueba el mismo resultado
```

### E4-30 · `createSubscriptionFromPlan()` único

`M` · **P1** · origen §1.1 W-05

**Como** responsable del producto **quiero** una sola función que cree suscripciones **para** que el mismo plan no quede topado a 8 sesiones por una vía e ilimitado por otra.

Cinco sitios crean `Subscription` con reglas de saldo distintas. El caso del webhook recurrente **no pone `sessionsRemaining`**, y `bonoUsage` interpreta `null` como **ilimitado**: un plan `MONTHLY` con `sessionsIncluded: 8` comprado por Stripe **queda ilimitado**, mientras el mismo plan vendido en recepción queda topado a 8. En la semilla no hay ningún plan `MONTHLY`, así que **este camino nunca se ha ejercitado**.

```gherkin
Escenario: fuente única
  Entonces existe createSubscriptionFromPlan(tx, {...}) en src/lib/subscriptions.ts
  Y los cinco llamantes actuales pasan por ella

Escenario: plan con sesiones incluidas comprado por Stripe
  Dado un plan MONTHLY con sessionsIncluded: 8
  Cuando se crea la suscripción desde el webhook
  Entonces sessionsRemaining es 8, no null

Escenario: plan sin sesiones incluidas
  Entonces sessionsRemaining es null y bonoUsage lo interpreta como ilimitado, como hoy

Escenario: importación CSV
  Entonces sigue la misma regla que el alta manual

Escenario: contrato explícito
  Entonces priceCents, sessionsIncluded y sessionsRemaining se resuelven en un solo sitio
  Y hay un test por cada uno de los cinco caminos
```

---

# E5 · Autoservicio del socio

> Las cuatro primeras fricciones por probabilidad de causar baja están aquí. **Para cancelar hoy hay que cerrar sesión, ir a la página pública donde el gimnasio vende altas y pedir un enlace por email.** En varios estados de EEUU eso sería directamente ilegal.

## E5-01 · Gestionar suscripción y darse de baja desde el portal web

`M` · **P0** · origen §2.1 · dep. HU-ST-15, HU-ST-17

**Como** socio **quiero** gestionar mi suscripción desde dentro del portal **para** no tener que salir a la página de captación del gimnasio para darme de baja.

El menú de cuenta tiene Mi perfil, Datos de salud, Notificaciones, Cerrar sesión — **no hay "gestionar suscripción" ni "darme de baja"**. `/baja` es solo baja de correos publicitarios: **el nombre engaña**. El Billing Portal de Stripe existe y **el portal no enlaza a él en ningún sitio**.

```gherkin
Escenario: entrada de menú
  Entonces el menú de cuenta incluye "Mi suscripción" con acceso directo

Escenario: gestionar el pago
  Cuando el socio pulsa "Gestionar mi pago"
  Entonces se abre el Billing Portal de la cuenta conectada de su centro

Escenario: darse de baja
  Cuando pulsa "Darme de baja"
  Entonces se le explica qué pasa con su bono y hasta cuándo tiene acceso
  Y confirma en un paso, sin llamar por teléfono ni escribir un email

Escenario: baja a fin de periodo
  Entonces por defecto la baja es a fin de periodo, y se muestra la fecha exacta

Escenario: revertir
  Cuando cambia de opinión antes de esa fecha
  Entonces puede revertir la baja desde la misma pantalla

Escenario: socio sin pago online
  Entonces se le explica cómo tramitarla con su centro, con el contacto a un clic

Escenario: /baja deja de engañar
  Entonces la ruta /baja se rotula explícitamente como baja de comunicaciones comerciales
```

## E5-02 · "Mi membresía" muestra precio, próximo cobro y recibos

`M` · **P0** · origen §2.1

**Como** socio **quiero** ver cuánto pago y cuándo **para** no tener que preguntarlo en recepción.

El propio comentario del código lo reconoce: *"El socio no ve aquí lo que lleva gastado: ni historial de pagos ni el precio de su cuota/bono en curso"*. **En la pantalla llamada "Mi membresía" no aparece cuánto pagas.** Hoy es una decisión explícita (`rbac.ts:175`) que hay que revertir.

```gherkin
Escenario: precio de la cuota
  Entonces "Mi membresía" muestra el importe del plan en curso

Escenario: próximo cobro
  Dado un plan recurrente
  Entonces muestra la fecha del próximo cargo y el método de pago (últimos 4 dígitos)

Escenario: bono puntual
  Entonces NO muestra "próximo cobro": muestra la fecha de caducidad (ver E5-13)

Escenario: recibos
  Entonces se listan los cobros anteriores con fecha, concepto e importe, descargables

Escenario: cambio de estado
  Entonces si hay una baja programada o una congelación, se dice en esta pantalla
```

## E5-03 · Recordatorios de sesión por email a 24 h y 2 h

`M` · **P0** · origen §2.1 · regla `RB-RES-013`

**Como** socio **quiero** que me avisen antes de mi sesión **para** no perder la sesión del bono por un olvido.

**Los recordatorios de sesión no existen en ningún canal.** Hay plantillas de bienvenida, verificación, plaza liberada, cumpleaños, pago fallido y valoración, pero ni un "mañana a las 19:00 entrenas". Para una app cuya regla es "si no cancelas con antelación pierdes la sesión", **no avisar es cobrar por el olvido**. El push queda congelado por el alcance de la app, así que el email **deja de ser el plan B y pasa a ser el canal**.

```gherkin
Escenario: recordatorio a 24 h
  Dado una reserva confirmada para mañana
  Entonces el socio recibe un email 24 h antes con hora, sala, entrenador
  Y con el enlace de cancelación y la ventana real de su centro

Escenario: recordatorio a 2 h
  Entonces recibe un segundo aviso 2 h antes, más breve

Escenario: es correo de servicio
  Entonces se envía aunque el socio haya desactivado las comunicaciones comerciales
  Y no lleva enlace de baja publicitaria

Escenario: preferencia propia
  Entonces el socio puede desactivar los recordatorios desde sus preferencias, de forma independiente

Escenario: idempotencia
  Entonces cada recordatorio se envía una sola vez por reserva, con marca en AuditLog

Escenario: cancelación previa
  Cuando la reserva se cancela antes de la hora del aviso
  Entonces no se envía
```

## E5-04 · Saldo del bono y próxima sesión en la primera pantalla del portal

`S` · **P1** · origen §2.1

**Como** socio **quiero** ver mi saldo y mi próxima hora nada más entrar **para** no abrir un cajón detrás de una hamburguesa en el móvil, que es donde estoy el 90 % de las veces.

Los cuatro KPI de la home son "Sesiones este mes / este año / Total histórico / Tu mejor mes". **Ninguno es el saldo del bono**, que vive en el sidebar, y el sidebar en móvil es un cajón. La app nativa lo hace bien: cero toques para las dos cosas que más se miran.

```gherkin
Escenario: saldo visible
  Entonces el saldo del bono aparece en la primera pantalla del portal, sin abrir ningún cajón

Escenario: próxima sesión
  Entonces la próxima reserva aparece con fecha, hora, sala y acción de cancelar

Escenario: se retiran los KPI que sobran
  Entonces "Total histórico" y "Tu mejor mes" dejan de ocupar sitio en el hero

Escenario: sin bono ni reservas
  Entonces se muestra un estado vacío útil, con la acción de comprar o de reservar
```

## E5-05 · Política de cancelación visible antes de reservar

`S` · **P1** · origen §2.1 · dep. E2-05

**Como** socio **quiero** saber la política de cancelación antes de reservar **para** no descubrirla al intentar cancelar.

No aparece en `agenda/session-card.tsx` ni en ningún sitio antes de reservar: se descubre en el modal de cancelación. **La app nativa sí avisa antes de confirmar.** Esto es literalmente una reclamación en recepción.

```gherkin
Escenario: tarjeta de la clase
  Entonces la tarjeta indica hasta cuándo se puede cancelar sin penalización,
  con el número real de horas del centro

Escenario: confirmación
  Entonces antes de confirmar la reserva se repite la condición

Escenario: paridad
  Entonces web y app dicen lo mismo, leído del servidor
```

## E5-06 · Congelar el bono desde el portal

`M` · **P1** · origen §2.1 · dep. HU-ST-14

**Como** socio **quiero** congelar mi bono por vacaciones o lesión **para** no perderlo ni tener que pasar por recepción.

Existe en el sistema (`pauseUntil`, estado congelado) pero **solo lo toca el staff**. Para un socio español esto pesa más que media app.

```gherkin
Escenario: congelar
  Dado un socio con bono activo
  Cuando pide congelar indicando fechas
  Entonces la suscripción queda pausada y la caducidad se desplaza el mismo número de días

Escenario: límites configurables
  Entonces el centro fija cuántos días al año y con cuánta antelación se puede congelar
  Y el socio ve esos límites antes de pedirlo

Escenario: reanudar antes de tiempo
  Entonces el socio puede reanudar en cualquier momento

Escenario: reservas activas
  Cuando tiene reservas dentro del periodo de congelación
  Entonces se le avisa y se le pide que las cancele o las mantenga, explícitamente

Escenario: propagación a Stripe
  Entonces en un plan recurrente se aplica pause_collection (ver HU-ST-14)
```

## E5-07 · Filtro por día y modalidad en `/portal/agenda`

`S` · **P2** · origen §2.1

**Como** socio **quiero** filtrar la agenda por día y modalidad **para** no recorrer 42 tarjetas con el pulgar.

Hoy son 7 días en lista continua: con 6 clases al día son 42 tarjetas. La app nativa ya tiene tira de días y chips Personal/Grupo.

```gherkin
Escenario: tira de días
  Entonces hay un selector de día que filtra la lista

Escenario: modalidad
  Entonces hay chips de modalidad, con las mismas etiquetas que la app (ver E12-04)

Escenario: estado en la URL
  Entonces la selección viaja en la URL y se puede compartir o recargar

Escenario: sin resultados
  Entonces se muestra un vacío que ofrece quitar el filtro
```

## E5-08 · El muro de alta pide solo lo que bloquea

`M` · **P1** · origen §2.1

**Como** socio recién dado de alta **quiero** poder reservar mi primera sesión sin rellenar siete campos y un cuestionario **para** no encontrarme un muro sin salida justo después de pagar.

`portal/first-session-wall.tsx` es pantalla completa cuya **única salida es cerrar sesión**: pide nacimiento, teléfono, CP, dirección, ciudad, provincia y contacto de emergencia, y después la valoración inicial. El propio comentario del código dice que el CP es para *"el mapa de calor por barrios del cuadro de mando"*: **se está bloqueando la reserva para alimentar el panel de dirección**. Y el teléfono ya se dio en el checkout.

```gherkin
Escenario: campos bloqueantes
  Entonces solo son obligatorios los que el servicio necesita de verdad:
  fecha de nacimiento, contacto de emergencia y la declaración de salud (ver E10-03)

Escenario: el resto se pide después
  Entonces dirección, ciudad, provincia y código postal se piden desde el perfil,
  con un aviso no bloqueante en el portal

Escenario: el teléfono no se pide dos veces
  Entonces si ya se recogió en el checkout, viene precargado

Escenario: hay salida
  Entonces el muro tiene una salida que no sea cerrar sesión

Escenario: valoración inicial
  Entonces se puede posponer y se recuerda desde el portal, sin bloquear la reserva
```

## E5-09 · Historial de asistencia y de movimientos del bono en la web

`M` · **P2** · origen §2.1 · dep. **E2-15**

**Como** socio **quiero** ver por qué se gastó cada sesión **para** poder discutir un saldo que no me cuadra.

Es *el* documento con el que se discute un saldo raro, y la web no lo tiene. La app lo tiene en `/consumo` y **no cuadra consigo mismo** (ver E2-15).

```gherkin
Escenario: movimientos
  Entonces el portal lista cada movimiento del bono con fecha, signo, motivo y saldo resultante,
  leído del SessionLedger

Escenario: asistencia
  Entonces lista las sesiones asistidas, canceladas y no presentadas, con su efecto sobre el bono

Escenario: cuadre
  Entonces el saldo mostrado arriba coincide con la suma de los movimientos listados

Escenario: paridad con la app
  Entonces la app consume el mismo origen de datos, y las dos cifras coinciden
```

## E5-10 · La valoración post-sesión se pide en un solo sitio

`XS` · **P2** · origen §2.1, §1.1

**Como** socio **quiero** que no me pidan la misma valoración en tres pantallas **para** no acabar silenciando los avisos del centro.

`getPendingSessionFeedback` alimenta `PostSessionFeedbackPrompts` en `/portal/agenda`, `PendingSessionsRating` en `/portal/membresia` y un badge en el menú.

```gherkin
Escenario: un solo punto
  Entonces la valoración pendiente se pide en un único sitio

Escenario: el badge
  Entonces el contador del menú lleva a ese sitio, sin repetir el formulario

Escenario: tras valorar
  Entonces la petición desaparece de todas las superficies a la vez
```

## E5-11 · Se retiran los KPI de retención del hero de "Mi membresía"

`XS` · **P3** · origen §2.1

**Como** socio **quiero** no ver mi porcentaje de adherencia en la pantalla donde me venden bonos **para** no leerlo como un reproche.

"Adherencia %" y "Racha" son KPI de retención **del gimnasio**, no del socio. Un 62 % de adherencia junto al botón de comprar se lee como una regañina.

```gherkin
Escenario: hero limpio
  Entonces "Adherencia" y "Racha" no aparecen en el hero de Mi membresía

Escenario: dirección los conserva
  Entonces dirección sigue viéndolos en su panel, que es donde sirven

Escenario: el socio, si quiere
  Entonces su historial de asistencia sigue disponible en E5-09, sin nota ni porcentaje
```

## E5-12 · Textos honestos en el checkout móvil

`S` · **P1** · origen §1.2 M-08, §9.2 A11-A14

**Como** socio **quiero** que la app no me invente el precio, la fecha de cobro ni las condiciones **para** poder fiarme del resto de lo que dice.

Cuatro mentiras en dos pantallas: `/mes` **fijo en el código** para todos los productos (un bono de 300 € se anuncia "300 €/mes"); `nextCharge = hoy + 1 mes` calculado **en el móvil** para cualquier producto; *"Sin contrato de permanencia · cancela cuando quieras"* escrito a fuego para todos los planes de todos los centros; y el badge **"Más elegido"** puesto automáticamente al primer producto (`featured ?? products[0]`). **La web lo hace bien** con `isRecurring(plan.type)`, y el dato ya viaja: `ProductItem.planType` está en la respuesta y no se usa.

```gherkin
Escenario: producto no recurrente
  Dado un plan SESSION_PACK
  Entonces el precio NO lleva "/mes"
  Y no se muestra ninguna fecha de "siguiente cobro"

Escenario: producto recurrente
  Entonces lleva "/mes" y la fecha del próximo cobro viene del servidor, no se calcula en el móvil

Escenario: promesa de permanencia
  Entonces "sin permanencia" solo se muestra si el producto lo declara

Escenario: más elegido
  Entonces el badge solo aparece si featured está marcado; sin featured, ningún producto lo lleva

Escenario: destino tras pagar
  Entonces la pantalla de pago no remite a "Mi membresía", que no existe en la app
```

## E5-13 · "Caduca el" vs "Renueva el", y se pintan `cancelAt` y `pauseUntil`

`XS` · **P1** · origen §2.1, §9.2 A13

**Como** socio **quiero** que la app distinga caducar de renovar **para** no creer que mi cuota sigue viva cuando ya pedí la baja.

`bonos.tsx:105` pinta `renewsAt` (que es `endDate`) siempre como "Renueva el X". `endDate` es la caducidad en un bono y el fin de período en una cuota: **dos cosas opuestas con la misma etiqueta**. Además `cancelAt` y `pauseUntil` **llegan al dispositivo y la pantalla no los pinta nunca**: si has pedido la baja y tu cuota termina el 31, la app sigue diciendo "Activo · Renovación automática".

```gherkin
Escenario: bono no recurrente
  Entonces la etiqueta dice "Caduca el X"

Escenario: cuota recurrente
  Entonces dice "Renueva el X"

Escenario: baja programada
  Dado cancelAt presente
  Entonces dice "Termina el X" y no dice "Renovación automática"

Escenario: congelación
  Dado pauseUntil presente
  Entonces dice "Congelado hasta el X"

Escenario: paridad
  Entonces la web usa las mismas tres etiquetas
```

## E5-14 · Modo lectura sin bono vivo en la app

`M` · **P2** · origen §2.1 · **decisión D-M3: se retira el muro**

**Como** socio que ha dejado caducar el bono **quiero** seguir viendo mi historial y mis medidas **para** no encontrarme un portazo después de cuatro años pagando.

`needsMembershipGate` redirige al catálogo y las tabs no cargan: no se puede ver el historial, ni las medidas, ni escribir al centro. **Solo comprar o cerrar sesión.** Y si el gimnasio no tiene Stripe Connect, la pantalla dice "Habla con recepción" y no hay salida.

**Decisión tomada (D-M3)**: modo lectura completo más banda de compra persistente. No añade pantallas: las de socio ya existen.

```gherkin
Escenario: sin bono vivo
  Dado un socio cuya última suscripción ha caducado
  Cuando abre la app
  Entonces entra en la aplicación, no en el catálogo

Escenario: qué puede hacer
  Entonces consulta historial, bonos, medidas y evolución en solo lectura

Escenario: qué no puede hacer
  Entonces no puede reservar, y al intentarlo se le explica por qué con la acción de comprar

Escenario: banda de compra
  Entonces una banda persistente ofrece renovar, sin ocupar la pantalla entera

Escenario: centro sin Stripe
  Entonces la banda ofrece contactar con recepción, con el teléfono a un toque

Escenario: al comprar
  Entonces el acceso completo se restablece sin cerrar sesión
```

## E5-15 · Borrado de cuenta desde la app y desde el portal

`M` · **P1** · origen §7 CN-25 · **⚠️ backlog de publicación (D-M2)**

**Como** socio **quiero** poder iniciar el borrado de mi cuenta desde donde uso el producto **para** ejercer mi derecho sin escribir un email.

`(tabs)/perfil.tsx` ofrece solo "Mi evolución", "Mis bonos" y "Cerrar sesión"; **tampoco lo hay en la web para el socio** (`deleteMember` es exclusivo de dirección). No es normativa española: es **contractual con las tiendas y bloqueante para publicar** — App Store Review Guideline **5.1.1(v)** y la política de Google Play, que exige ruta in-app **y** URL web accesible desde la ficha.

Puede resolverse como **solicitud verificada al centro** en vez de borrado inmediato, siempre que se cumpla el plazo de un mes del art. 12.3 RGPD y se informe de qué se conserva por obligación legal.

```gherkin
Escenario: solicitud desde la app
  Cuando el socio pide borrar su cuenta desde Perfil
  Entonces se le explica qué se borra, qué se conserva y por cuánto tiempo
  Y confirma con su contraseña

Escenario: solicitud desde el portal web
  Entonces existe la misma ruta, accesible sin necesidad de la app

Escenario: URL web pública
  Entonces existe una página accesible desde la ficha de tienda que explica cómo pedirlo

Escenario: plazo
  Entonces la solicitud se atiende en un máximo de un mes, con acuse al socio

Escenario: obligaciones de conservación
  Entonces los cobros se disocian en vez de borrarse (ver E10-09)
  Y el texto que ve el socio dice exactamente eso

Escenario: trazabilidad
  Entonces la solicitud y su resolución quedan en AuditLog
```

---

# E6 · Gateo comercial y planes

> **El muro de pago se salta por URL, y el módulo caro no está gateado en ningún sitio.** `grep -rn "orgHasFeature\|requireFeature" src` devuelve **6 llamadas, ninguna con `ia_programacion`** — el único módulo con coste marginal real, ~0,18 $ por generación, facturados a Apta.

## E6-01 · La API móvil comprueba el plan contratado

`M` · **P0** · origen §1.2 M-01, §8 M-03, §9.2 A5 · regla `RB-PLAT-008`

**Como** Apta **quiero** que la app respete el catálogo comercial **para** no regalar los módulos de pago a quien no los ha comprado.

Verificado en ejecución: con la organización demo en `esencial_mes` (`features: []`, sin `salud_aptitud`) y el token del entrenador, `GET /trainer/brief` devuelve **200 con la lista completa**, y `GET /trainer/members?filter=alerts` devuelve **200 con `{"light":"RED","zone":"rodilla derecha"}`**. En web esas mismas dos cosas redirigen a `/planes`. **Session Brief, semáforo de aptitud, zona de lesión, rangos de composición y feedback 1-10 son gratis desde la app.** Es fuga de ingresos directa.

```gherkin
Escenario: helper
  Entonces existe requireApiFeature(claims, feature), aplicado en _lib/api-session.ts

Escenario: rutas gateadas
  Entonces /trainer/brief*, /trainer/members*, /trainer/sessions/[id]/feedback y /mesocycles*
  responden 402 cuando la organización no tiene la feature

Escenario: mensaje útil
  Entonces la app muestra que la funcionalidad requiere otro plan, sin pantalla en blanco

Escenario: mapa declarativo
  Entonces existe un FEATURE_BY_ROUTE móvil, de modo que una ruta nueva sin gate declarado
  falla en el arranque o en un test, nunca en silencio

Escenario: plan con la feature
  Entonces el comportamiento actual no cambia
```

## E6-02 · Las rutas hijas de los módulos premium pasan por `requireFeature`

`S` · **P0** · origen §8 W-05

**Como** Apta **quiero** que el muro de pago no se salte escribiendo la URL **para** que el plan contratado signifique algo.

`FEATURE_BY_ROUTE` solo declara `/brief`, `/feedback`, `/health/*` y `/audit`, pero `brief/[id]/page.tsx`, `feedback/[id]/page.tsx` y `feedback/debriefs-semanales/page.tsx` **no llaman a `requireFeature`**. Con plan Esencial, `/brief` redirige a `/planes` pero `/brief/<sessionId>?d=…` —**el enlace que la propia app pinta**— responde 200 con el semáforo completo. El comentario de `brief/page.tsx:13-14` dice literalmente *"Sin esto, la URL directa se saltaría el filtro del menú"*: **eso es exactamente lo que ocurre un nivel más abajo.**

```gherkin
Escenario: ruta hija por URL directa
  Dado una organización en plan Esencial
  Cuando se abre /brief/[id], /feedback/[id] o /feedback/debriefs-semanales
  Entonces redirige a /planes?feature=…, igual que la ruta padre

Escenario: el enlace de la propia app
  Entonces el enlace desde /agenda/session/[id] tampoco elude el gate

Escenario: herencia declarativa
  Entonces el gate de una ruta padre se hereda por defecto en sus hijas,
  de modo que añadir una hija nueva no vuelve a abrir el agujero

Escenario: plan con la feature
  Entonces todo funciona igual que hoy
```

## E6-03 · `ia_programacion` se gatea antes de llamar a la API de Claude

`S` · **P0** · origen §8 W-06 · regla `RB-PLAT-009`

**Como** Apta **quiero** que la generación con IA compruebe el plan antes de gastar **para** no pagar por generaciones de clientes que no la han contratado.

`platform-plans.ts:21` lo comenta como *"único módulo con coste marginal real"* y está **ausente de `FEATURE_BY_ROUTE`**; ni la acción web ni el endpoint móvil lo comprueban. **Cualquier organización en Esencial o Avanzado genera y refina mesociclos.**

```gherkin
Escenario: organización sin la feature
  Cuando se pide generar o refinar un mesociclo
  Entonces se rechaza ANTES de llamar a la API del proveedor de IA
  Y no se registra ningún consumo

Escenario: las dos superficies
  Entonces la comprobación está en la acción web y en el endpoint móvil

Escenario: cupo por plan
  Dado un plan con cupo mensual de generaciones (ver E6-04)
  Cuando se agota el cupo
  Entonces se rechaza con el motivo y la fecha de reinicio del contador

Escenario: contador visible
  Entonces dirección ve cuántas generaciones lleva del mes y cuántas le quedan
```

## E6-04 · Reempaquetado del catálogo de planes

`M` · **P1** · origen §2.3 · **decisión D-P5: sí, completo** · con **D-P1** dentro

**Como** Apta **quiero** un catálogo que no canibalice ni regale lo caro **para** mover ingresos sin escribir producto nuevo.

Catálogo actual: Esencial 79 €, Avanzado 149 €, Élite 279 €, Fundador 3.990 € lifetime, eje = centros. **Lo que está bien y no se toca**: el eje por centros y la **cero comisión sobre los cobros del gimnasio**.

Lo que cambia: **Esencial a 79 € es un error de diseño comercial** — el propio plan admite que es "el tier me-too, sin ningún diferenciador"; hay **70 € de distancia entre tiers**, que es una excusa perfecta para quedarse abajo. **Élite a 279 € no tiene sentido económico**: lo único que añade es IA (~17 $/mes de coste) y **centros ilimitados**, que es justo donde está el coste real de soporte — *se cobran 130 € de margen sobre 17 € de coste y se regala lo caro*. **Fundador está bien razonado**, pero un lifetime sin fecha no vende: **la escasez es el producto**.

```gherkin
Escenario: Esencial
  Entonces se retira del catálogo o sube a 99 €, y Avanzado baja a 129 €
  Y la distancia entre tiers queda en torno a 30 €

Escenario: IA con cupo en Avanzado
  Entonces ia_programacion entra en Avanzado con cupo mensual (p. ej. 20 generaciones)
  Y el cupo se aplica de verdad (ver E6-03)

Escenario: Élite
  Entonces Élite pasa a "hasta 10 centros"; por encima, precio a medida

Escenario: Fundador
  Entonces se publica con cupo real de 15 plazas y fecha de cierre visible
  Y el contador de plazas restantes es real, no decorativo

Escenario: Training Zone
  Entonces Training Zone contrata con el descuento de fundador, con cupo y fecha,
  y su alta pasa por el mismo checkout que cualquier otro cliente

Escenario: clientes existentes
  Entonces quien ya tiene un plan conserva sus condiciones hasta que cambie voluntariamente

Escenario: la tabla comparativa
  Entonces solo aparecen las funcionalidades que se venden de verdad:
  fuera tareas, anuncios, chat, biblioteca online, fichajes, mapa de barrios y app nativa
```

## E6-05 · "Cero comisión sobre tus cobros" en la landing

`XS` · **P2** · origen §2.3

**Como** Apta **quiero** decir en grande que no toco el dinero del gimnasio **para** usar el mejor argumento de venta que tengo contra MindBody y Glofox.

Hoy está escondido en un documento interno.

```gherkin
Escenario: mensaje visible
  Entonces /planes lo dice en el hero o inmediatamente debajo, con esas palabras

Escenario: coherencia
  Entonces el mensaje es cierto: no se envía application_fee_amount (ver HU-ST-28)

Escenario: comparativa
  Entonces la tabla de planes lo repite como fila propia
```

## E6-06 · Exportación CSV de socios y de cobros

`M` · **P1** · origen §2.3

**Como** dueño de un gimnasio **quiero** poder sacar mis socios y mis cobros **para** dárselos a mi gestoría y para saber que mis datos son míos.

Hay export de auditoría, de datos RGPD del socio y de un ranking del panel, pero **no de socios ni de cobros** — y la feature `exportaciones` **se cobra** en el plan Avanzado. **Se está cobrando por algo que casi no existe**, y es la primera objeción de cualquier dueño: *"¿puedo sacar mis datos?"*.

```gherkin
Escenario: exportar socios
  Entonces dirección puede descargar un CSV con los socios de su ámbito y sus campos de gestión
  Y NO incluye datos de salud

Escenario: exportar cobros
  Entonces puede descargar los cobros del periodo con fecha, socio, concepto, importe, método y estado

Escenario: formato español
  Entonces usa punto y coma y BOM, y neutraliza fórmulas, como el export de auditoría

Escenario: ámbito
  Entonces un CENTER_DIRECTOR exporta solo lo de sus centros

Escenario: traza
  Entonces cada exportación queda en AuditLog con actor, filtros y número de filas
```

## E6-07 · `/audit` sale del muro de pago; la exportación se queda dentro

`XS` · **P1** · origen §7 CN-09 · **decisión D-C7**

**Como** cliente de Apta **quiero** poder consultar quién ha accedido a los datos de salud de mis socios **para** poder acreditar el art. 32 RGPD sin comprar un plan superior.

`rbac.ts:88` mapea `"/audit": "exportaciones"`. **Un cliente en plan Esencial no puede consultar quién ha accedido a los datos de salud de sus socios**, pese a que el `AuditLog` se escribe igualmente. El responsable del tratamiento es **el gimnasio**: ante un requerimiento no puede acreditar el control de accesos porque su proveedor se lo vendió como premium.

**Decisión tomada (D-C7)**: la consulta entra en todos los planes; la exportación masiva y la retención extendida siguen siendo de pago. *Es defendible que la exportación masiva sea de pago; no lo es que lo sea el acceso a la propia traza.*

```gherkin
Escenario: consulta en cualquier plan
  Dado una organización en el plan más bajo
  Entonces /audit es accesible y se puede filtrar y paginar

Escenario: exportación
  Entonces el botón de exportar sigue requiriendo la feature exportaciones,
  y explica qué plan la incluye

Escenario: ámbito
  Entonces el registro respeta el ámbito de centro de quien consulta

Escenario: la landing lo dice
  Entonces "registro de accesos incluido en todos los planes" aparece en la comparativa
```

## E6-08 · Back-office `/apta`

`L` · **P1** · origen §2.3 · **prioridad elevada por D-P2: objetivo 100 clientes**

**Como** soporte de Apta **quiero** un back-office mínimo **para** no administrar cien clientes con SQL.

`PLATFORM_ADMIN` **no tiene ni una pantalla propia**. Con dos clientes te apañas con SQL; con cien, no. Y sin **alta asistida** no se puede vender con transferencia o factura, que es como se cierra la mitad de la venta B2B pequeña en España.

**Decisión D-P2**: el objetivo son 100 clientes en 12 meses, así que back-office y self-service dejan de ser opcionales.

```gherkin
Escenario: listado de organizaciones
  Entonces /apta lista organizaciones con plan, estado de plataforma, centros, socios y último cobro
  Y se puede buscar y filtrar por estado

Escenario: reenviar activación
  Entonces se puede reenviar la invitación de alta al OWNER

Escenario: alta asistida
  Entonces soporte puede dar de alta una organización con cobro fuera de Stripe
  Y queda registrado quién la creó, con qué plan y con qué justificante

Escenario: acceso
  Entonces solo PLATFORM_ADMIN entra, y cada acción queda en AuditLog

Escenario: lo que NO hace
  Entonces no da acceso a datos de salud de los socios de ningún cliente

Escenario: métricas de plataforma
  Entonces muestra organizaciones activas, en impago y canceladas, y el MRR agregado
```

---

# E7 · Calidad: pruebas y cobertura

> **Ninguno de los 32 hallazgos de QA toca una línea probada.** Todas las comprobaciones automáticas pasan: `tsc` limpio, ESLint sin avisos, 219/219 unitarios, `expo lint` y `tsc` móvil limpios. Esa es la conclusión más importante del capítulo 8 del informe.
>
> Punto de partida de la app: **86 ficheros, ~14.900 líneas, 0 tests, 0 % de cobertura**, y **ningún paso de la app móvil en CI**.

## E7-01 · Infraestructura de pruebas de la app móvil

`M` · **P0** · origen §9.4

**Como** equipo **quiero** poder escribir tests de la app **para** dejar de encontrar sus fallos leyendo código y con `curl`.

```gherkin
Escenario: runner
  Entonces jest-expo, @testing-library/react-native y expo-router/testing-library están instalados
  Y las versiones se resuelven con "npx expo install --dev", no fijadas a mano

Escenario: envoltorio común
  Entonces existe renderWithProviders con un QueryClient de test (retry:false, gcTime:0) y el AuthProvider
  Y ningún test arrastra caché ni reintentos a otro

Escenario: frontera de red
  Entonces se dobla el fetch global y se sirven respuestas tipadas con api/types.ts
  Y no se instala MSW: la app habla con el servidor por un único punto

Escenario: fixtures
  Entonces existe src/test/fixtures.ts con un constructor por respuesta y sobrescritura parcial
  Y las fixtures se escriben CONTRA EL TIPO, de modo que un cambio de contrato del servidor
  rompe los tests de la app

Escenario: lo que no se monta
  Entonces no se instala Detox ni Maestro: caros, lentos y no cazan ninguno de los 22 fallos
```

## E7-02 · Job de CI propio para la app móvil

`S` · **P0** · origen §9.7

**Como** equipo **quiero** que la app se compruebe en cada cambio **para** que su calidad no dependa de que alguien se acuerde de ejecutar los comandos.

`.github/workflows/e2e.yml` **no ejecuta nada de la app móvil**.

```gherkin
Escenario: job separado
  Entonces existe un job "mobile" paralelo al de verify, sin base de datos ni Playwright,
  que ejecuta lint, typecheck, test y cobertura

Escenario: caché
  Entonces cache-dependency-path apunta al lockfile de apps/mobile, no al de la raíz

Escenario: aislamiento
  Entonces un fallo de la app no oculta el resultado de la web, ni al revés

Escenario: duración
  Entonces el job termina en menos de dos minutos
```

## E7-03 · Batería base de la app: T1-T14

`L` · **P0** · origen §9.5

**Como** equipo **quiero** una batería que habría cazado los fallos de este informe **para** que la siguiente tanda no pase igual.

Los ocho primeros casos habrían cazado un fallo real.

```gherkin
Escenario: T1 · condiciones sin regla
  Entonces un roster con conditions y sin matchedRules pinta la condición
  Y no cae en "Sin restricciones"                                        # caza A2 / E3-01

Escenario: T2 · desmarcar
  Entonces tocar dos veces el check emite la operación al servidor        # caza A4 / E2-03

Escenario: T3 · ventana de cancelación
  Entonces con cancelWindowHours 24 el texto dice 24, no un literal       # caza A9 / E2-06

Escenario: T4 · lista de espera
  Entonces en una sesión llena la hoja no anuncia descuento de bono       # caza A17 / E2-11

Escenario: T5 · producto no recurrente
  Entonces no muestra "/mes" ni "siguiente cobro"                         # caza A11 / E5-12

Escenario: T6 · más elegido
  Entonces sin featured, ningún producto lleva el badge                   # caza A14 / E5-12

Escenario: T7 · caduca vs renueva
  Entonces un bono no recurrente dice "Caduca el"
  Y con cancelAt presente no dice "Renovación automática"                 # caza A13 / E5-13

Escenario: T8 · lista de espera visible
  Entonces WAITLISTED se distingue de BOOKED                              # caza A22 / E2-10

Escenario: T9 · cliente HTTP
  Entonces un 401 dispara refresh una sola vez y reintenta
  Y un segundo 401 cierra sesión
  Y el timeout de 12 s traduce a mensaje en castellano

Escenario: T10 · HTTPS
  Entonces fuera de __DEV__, una API_URL sin https:// falla               # caza A20 / E10-18

Escenario: T11 · navegación
  Entonces tabsFor, homeRouteFor y needsMembershipGate se prueban por rol

Escenario: T12 · paridad de permisos
  Entonces los predicados de auth/routes.ts coinciden con src/lib/rbac.ts (ver E7-09)

Escenario: T13 · formato
  Entonces fechas, euros y helpers de ISO, incluidos cambio de hora y fin de mes

Escenario: T14 · componentes
  Entonces Field, Button, Toast y EmptyState: nombre accesible, hitSlop y anuncio del toast
```

## E7-04 · Cobertura medida y publicada

`S` · **P1** · origen §9.6

**Como** equipo **quiero** medir la cobertura antes de exigirla **para** no poner un umbral que se acabe bajando el primer día.

```gherkin
Escenario: al arrancar
  Entonces la cobertura se mide y se publica en el job de CI, sin umbral que rompa

Escenario: tras la batería base
  Entonces se exige 60 % de líneas y ramas en src/api, src/auth, src/utils y src/components

Escenario: estable
  Entonces se exige 80 % en src/api y src/auth, y 60 % en el resto

Escenario: exclusiones
  Entonces collectCoverageFrom excluye src/theme (constantes) y los _layout.tsx (declarativos)
```

## E7-05 · Cobertura de la web

`S` · **P2** · origen §9.6

**Como** equipo **quiero** saber qué parte de la web está probada **para** poder priorizar dónde escribir tests.

`npm run test:unit` es `tsx --test` sin flags: **no se mide nada**.

```gherkin
Escenario: intento con node:test
  Entonces se comprueba si la cobertura experimental de Node funciona con el cargador de tsx

Escenario: alternativa
  Dado que el mapeo de fuentes con transpilación en vuelo no funcione
  Entonces se usa c8

Escenario: publicación
  Entonces el resumen se publica en CI, sin umbral que rompa al principio
```

## E7-06 · Ocho specs de API móvil con Playwright `request`

`M` · **P0** · origen §8.3

**Como** equipo **quiero** probar la API móvil **para** que la paridad web↔móvil deje de romperse en silencio.

**Cero tests de la API móvil hoy.** Es el origen de nueve de los hallazgos del informe. Se ejecutan con `request.newContext()`, sin navegador.

```gherkin
Escenario: E1 · ámbito de agenda
  Entonces un TRAINER de La Jota recibe 404 en POST, PATCH y DELETE de sesiones de Santander

Escenario: E2 · ámbito de plantilla
  Entonces GET /staff como dirección de La Jota no incluye personal de Santander

Escenario: E3 · datos de salud
  Entonces recepción no recibe feedbackAvg en la ficha ni en el calendario

Escenario: E4 · ámbito de brief
  Entonces dirección de La Jota no ve ni abre sesiones de Santander

Escenario: E5 · gateo
  Entonces con plan Esencial las tres rutas hijas redirigen y el endpoint móvil de brief responde 402

Escenario: E6 · borrado de sesión
  Entonces tras borrar una sesión con 3 reservas, los 3 socios recuperan su sesión

Escenario: E7 · cancelación tardía
  Entonces la UI avisa con el número real y el bono baja

Escenario: E8 · paridad
  Entonces reservar y cancelar la misma clase por web y por API produce el mismo estado y saldo

Escenario: orden
  Entonces se empieza por E1 y E2, que son los dos bloqueantes y no necesitan interfaz
```

## E7-07 · Diez pruebas unitarias de la web

`M` · **P0** · origen §8.3

**Como** equipo **quiero** cubrir la lógica que dejó pasar los fallos **para** no volver a corregirlos dos veces.

Patrón: `agenda-booking.test.ts`, que monta su propia organización contra Postgres real. Es el mejor fichero de test del repositorio.

```gherkin
Escenario: U1 · agenda-delete
  Entonces borrar una sesión con reservas devuelve el bono a cada socio y deja AuditLog

Escenario: U2 · máquina de estados de Booking
  Entonces setDebrief, toggleCheckIn y el feedback móvil NO mueven CANCELLED ni WAITLISTED a ATTENDED

Escenario: U3 · ventana de cancelación del socio
  Entonces a ventana+1 min devuelve el bono; a −1 min lo consume con forfeited
  Y la lista de espera nunca reembolsa

Escenario: U4 · zona horaria
  Entonces la ventana se mide con Center.timezone: mismo veredicto con tz=America/Lima

Escenario: U5 · ámbito de brief
  Entonces getSessionBrief devuelve null fuera del ámbito de centro

Escenario: U6 · ámbito de feedback
  Entonces listMemberFeedback y getWeeklyDebriefReport respetan centerScopeFor

Escenario: U7 · ocupación con series
  Entonces una serie semanal de 8 semanas con aforo 10 da ocupación por ocurrencia, no >100 %

Escenario: U8 · lista de espera
  Entonces tras una baja en la cola, las posiciones ni se duplican ni dejan hueco

Escenario: U9 · entitlements
  Entonces orgHasFeature("ia_programacion") es false en Esencial y Avanzado
  Y la generación se rechaza ANTES de llamar al proveedor de IA

Escenario: U10 · alertas de no-show
  Entonces la alerta de 3 faltas solo llega a la dirección del centro del socio
```

## E7-08 · `planes-gateo.spec.ts` con el camino negativo

`S` · **P0** · origen §8.3

**Como** equipo **quiero** probar que el muro de pago cierra **para** no tener un test verde sobre un agujero abierto.

Hoy solo prueba el **camino positivo**: por eso pasaron los dos fallos de gateo.

```gherkin
Escenario: plan sin la feature
  Dado una organización en plan Esencial
  Entonces cada ruta premium redirige a /planes con el parámetro de feature

Escenario: rutas hijas
  Entonces las rutas hijas también redirigen (ver E6-02)

Escenario: API móvil
  Entonces el endpoint móvil equivalente responde 402

Escenario: ia_programacion
  Entonces la generación se rechaza y no se registra consumo
```

## E7-09 · Test de paridad de permisos app ↔ `src/lib/rbac.ts`

`S` · **P1** · origen §9.5 T12, §9.3 R10

**Como** equipo **quiero** que las dos tablas de permisos no puedan divergir **para** que la app no enseñe un botón que el servidor rechaza con 403.

`auth/routes.ts:133-167` reimplementa a mano cinco predicados de `rbac.ts` (el comentario los llama *"espejo"*), y **ya hay una asimetría**: `canManageCenterCapacity` incluye `OWNER`, así que la app muestra "Aforo de clases" a dirección de organización, que en web **no tiene esa entrada** por decisión deliberada. El propio comentario de `routes.ts:59-62` cuenta que este bug ya ocurrió una vez.

```gherkin
Escenario: paridad
  Entonces para cada uno de los roles y cada uno de los cinco predicados,
  la app y rbac.ts devuelven el mismo valor

Escenario: la asimetría conocida
  Entonces canManageCenterCapacity deja de incluir OWNER en la app, o se corrige en la web,
  y el test fija la decisión

Escenario: fuente única (preferida)
  Entonces los predicados se extraen a un módulo compartido, tipando Role como unión literal
  en vez de importarlo de @prisma/client

Escenario: rol nuevo
  Cuando se añade un rol
  Entonces el test falla hasta que las dos tablas lo declaren
```

---

# E8 · Accesibilidad y usabilidad

> **Decisión D-C6**: Apta y Training Zone entran en la exención de microempresa de la Ley 11/2023, así que la accesibilidad es **recomendación, no obligación**. Esta épica se prioriza **por calidad de producto**, no por ley — y el análisis del umbral se documenta igualmente (E10-10), porque hay que poder acreditar que se hizo. Las cuatro primeras siguen siendo P0 porque son baratas, tocan un fichero cada una y suben la nota de accesibilidad de la web de 4,0 a un 7 largo.
>
> Notas: **web 6,4/10 · móvil 6,9/10**. La web es *"muy pensada en el nivel de diseño y floja en el nivel de contrato"*. Lo que un usuario con ratón y vista ve es notable; lo que ocurre cuando algo falla, o con teclado, es aprobado raspado.

## E8-01 · `error.tsx` en `(app)/` y en las cuatro rutas con más consultas

`S` · **P0** · origen §4

**Como** recepción con alguien delante **quiero** que un error me deje una salida **para** no quedarme mirando "Application error".

**0 `error.tsx`, 0 `global-error.tsx`, 0 `not-found.tsx` en toda la aplicación.** Cualquier excepción en un Server Component deja la pantalla genérica de Next: sin marca, sin explicación y **sin salida** — el layout también cae, así que no hay ni sidebar ni header.

```gherkin
Escenario: error en una ruta de la aplicación
  Entonces se muestra un estado crítico con la marca, explicación y dos acciones:
  reintentar (reset) y volver a defaultRouteForRole

Escenario: rutas con más consultas
  Entonces dashboard, members/[id], agenda y billing tienen su propio error.tsx

Escenario: mensaje de red
  Entonces el texto es el mismo que ya usa api/client.ts en la app nativa,
  que traduce todo fallo de red a castellano: es la forma más barata de que las dos suenen igual

Escenario: 404
  Entonces existe not-found.tsx propio, invocado desde las rutas públicas que ya llaman a notFound()
```

## E8-02 · `Field` con `htmlFor`, `aria-invalid` y `aria-describedby`

`S` · **P0** · origen §4

**Como** usuario de lector de pantalla **quiero** que los campos tengan nombre **para** poder rellenar un formulario.

`field.tsx:40`: el `<label>` es **hermano** de `{children}`, sin `htmlFor`. **221 usos de `<Field>` frente a 5 `htmlFor` en todo `src/`**: para un lector de pantalla, prácticamente todos los campos están sin nombre, y hacer clic en la etiqueta no enfoca. Falla WCAG 1.3.1, 3.3.2 y 4.1.2. **Un fichero arregla 221 sitios.**

```gherkin
Escenario: asociación
  Entonces Field genera un id con useId(), lo pone en htmlFor y lo inyecta al hijo

Escenario: clic en la etiqueta
  Entonces enfoca el campo

Escenario: error
  Entonces el campo con error lleva aria-invalid y aria-describedby apuntando al mensaje

Escenario: ayuda
  Entonces el hint también se referencia con aria-describedby

Escenario: regresión
  Entonces los selectores de e2e/leads.spec.ts, alta-socio-bonos, plantilla-crud
  y members-bonos-calendario se revisan en el mismo cambio
```

## E8-03 · `accessibilityLabel` en `Field` de la app

`XS` · **P0** · origen §4, §9.3 R2

**Como** usuario de VoiceOver o TalkBack **quiero** que los campos de la app se anuncien con su nombre **para** poder iniciar sesión.

`Field.tsx:44`: la etiqueta es un `<Text>` suelto y el `<TextInput>` no recibe `accessibilityLabel`. En React Native **no hay asociación implícita**: se anuncia "campo de texto" a secas. 24 usos, **incluido el login**.

```gherkin
Escenario: nombre accesible
  Entonces el TextInput recibe accessibilityLabel con el texto de la etiqueta

Escenario: error
  Entonces el estado de error se anuncia, no solo se pinta en rojo

Escenario: login
  Entonces los dos campos del login se anuncian por su nombre
```

## E8-04 · Contraste de los tokens gris/oro y tint de la barra de pestañas

`S` · **P0** · origen §4, §9.3 R1

**Como** usuario que mira la pantalla al sol **quiero** poder leer la navegación **para** poder usar la aplicación donde se usa.

**Web**: `--color-muted` `#8A8574` mide **3,69:1 sobre blanco** y es el color de cabeceras de tabla, subtítulos, hints y descripciones; `--color-faint` `#A8A296` mide **2,54:1** y es el de los placeholder. **Móvil**: la pestaña activa `theme.gold` `#C8AB72` da **2,20:1 sobre blanco** y la inactiva **2,54:1** — ni el 3:1 de componente ni el 4,5:1 de texto; en oscuro también falla. **La navegación principal es ilegible al sol.** El token correcto ya existe en el tema: `theme.goldText`.

```gherkin
Escenario: tokens de la web
  Entonces --color-muted sube a ~#6E6A5C y --color-faint a ~#7C7768
  Y en tema oscuro #7B7566 sube a ~#8F8879

Escenario: badge dorada
  Entonces --color-gold sobre --color-gold-bg alcanza 4,5:1, o la badge deja de usarse a 11 px

Escenario: barra de pestañas
  Entonces la pestaña activa usa theme.goldText y la inactiva theme.textMuted
  Y el tamaño de la etiqueta sube de 9,5 px a 11

Escenario: parejas documentadas
  Entonces cada token lleva documentadas junto a él las parejas fondo/texto en las que se usa

Escenario: comprobación
  Entonces se revisan los dos temas en navegador y dispositivo reales,
  no solo por fórmula sobre los valores
```

## E8-05 · `inert` y trampa de foco en `Drawer` y `Sidebar`

`S` · **P1** · origen §4

**Como** usuario de teclado **quiero** no caer dentro de un panel invisible **para** no perderme en un formulario que no veo.

`drawer.tsx:45` hace `if (!mounted) return null;` **sin comprobar `open`**: el panel se pinta siempre y solo se aparta con `translate-x-full`. En `/members`, tabulando desde la tabla se cae dentro del formulario invisible de "Nuevo socio", que además tiene `role="dialog" aria-modal="true"`. **16 usos de `<Drawer>`**, y lo mismo con el sidebar móvil.

```gherkin
Escenario: panel cerrado
  Entonces el contenido lleva inert y no es alcanzable con tabulador

Escenario: al abrir
  Entonces el foco entra en el panel

Escenario: dentro
  Entonces el foco queda atrapado en el panel mientras esté abierto

Escenario: al cerrar
  Entonces el foco vuelve al elemento que lo abrió

Escenario: Escape
  Entonces cierra el panel
```

## E8-06 · `<h1>` real en el header y enlace de salto al contenido

`XS` · **P1** · origen §4

**Como** usuario de lector de pantalla **quiero** que la página tenga un encabezado y un salto al contenido **para** no tabular por los quince items del sidebar en cada carga.

`header.tsx:79-85` pinta el título de ruta en un `<div>`: **el documento no tiene `h1`**. Y doce pantallas pintan el suyo, duplicando.

```gherkin
Escenario: encabezado
  Entonces el título de ruta del header es un h1

Escenario: los doce duplicados
  Entonces los h1 de trainer, members/[id], puesta-en-marcha, portal/evolucion y los demás bajan a h2

Escenario: salto al contenido
  Entonces existe un enlace "Saltar al contenido" como primer elemento tabulable,
  visible al recibir foco

Escenario: rutas de tercer nivel
  Entonces members/[id]/valoraciones/[assessmentId] y .../mesociclos/[mesocycleId]
  tienen título propio y vuelta, ampliando PARENT_ROUTE
```

## E8-07 · Toasts anunciados a lectores de pantalla

`S` · **P1** · origen §4, §9.3 R4

**Como** usuario de lector de pantalla **quiero** enterarme de si mi formulario se guardó **para** no quedarme sin ninguna señal.

**Web**: el contenedor es `role="region"` y el `role="status"` va en cada toast *insertado después* — las regiones vivas deben existir antes de recibir contenido, así que NVDA y JAWS típicamente no lo leen; y los errores usan `status` (polite) en vez de `alert`. Combinado con `action-form.tsx:49`, donde el error de una server action se muestra **solo** como toast: *un usuario ciego guarda un formulario y no recibe ninguna señal*. **Móvil**: `pointerEvents="none"`, sin `accessibilityLiveRegion`, sin `announceForAccessibility`, temporizador fijo de 2800 ms — y es el **único** acuse de recibo de reservar, cancelar o guardar un debrief.

```gherkin
Escenario: región viva presente
  Entonces el contenedor de toasts existe en el DOM antes de recibir contenido

Escenario: severidad
  Entonces los errores usan role="alert" y el resto role="status"

Escenario: duración
  Entonces los 4200 ms fijos dejan de ser fijos: los mensajes críticos no se autoocultan
  (WCAG 2.2.1)

Escenario: app nativa
  Entonces el toast declara accessibilityLiveRegion y llama a announceForAccessibility

Escenario: doble canal
  Entonces el error de una server action se muestra además junto al formulario, no solo en el toast
```

## E8-08 · `accessibilityRole="header"` en la app

`XS` · **P1** · origen §9.3 R3

**Como** usuario de VoiceOver **quiero** poder moverme por encabezados **para** no barrer la ficha de socio elemento a elemento.

**0 `accessibilityRole="header"` en toda la app.** Sin encabezados el rotor no funciona. **Dos líneas, efecto en las 33 pantallas.**

```gherkin
Escenario: ScreenHeader
  Entonces declara accessibilityRole="header"

Escenario: SectionTitle
  Entonces también

Escenario: el rotor
  Entonces en una pantalla con varias secciones, el rotor permite saltar entre ellas
```

## E8-09 · `FlatList` en las cuatro listas largas de la app

`M` · **P1** · origen §4, §9.3 R5

**Como** socio o entrenador de un centro grande **quiero** que las listas no vayan a tirones **para** no concluir que la app va mal.

**0 `FlatList` en toda la app.** `ScreenContainer` monta todo en un `ScrollView`, y `socios/index.tsx` acumula páginas con `flatMap` + `onEndReached` **dentro de ese mismo `ScrollView`**: un centro con 500 socios son 500 tarjetas vivas con sus `Animated.Value`.

```gherkin
Escenario: variante virtualizada
  Entonces existe una variante de ScreenContainer sobre FlatList

Escenario: las cuatro listas
  Entonces socios/index, mis-socios/index, leads y consumo la usan

Escenario: animación acotada
  Entonces FadeInUp se desactiva a partir del sexto elemento

Escenario: paginación
  Entonces onEndReached sigue funcionando, ahora sobre la lista virtualizada

Escenario: medición
  Entonces se mide el rendimiento antes y después con una lista de 500 elementos
```

## E8-10 · Suelo tipográfico de 11 px y `maxFontSizeMultiplier`

`S` · **P1** · origen §9.3 R6

**Como** usuario con la letra grande del sistema **quiero** que el texto no se recorte **para** poder leer la app.

`typography.ts`: `badge` 9,5 px, `legend` 9,5, `kpiLabel` 10, `kicker` 10,5; etiqueta de pestaña 9,5 y contador 9. Y **0 apariciones de `allowFontScaling`/`maxFontSizeMultiplier`** conviviendo con alturas fijas (`HEIGHT.sm = 36`, `iconWrapper` 22 px, `tabBarHeight: 58`). WCAG 1.4.4 exige 200 %.

```gherkin
Escenario: suelo
  Entonces ningún estilo de texto baja de 11 px

Escenario: escalado acotado
  Entonces donde hay altura fija se declara maxFontSizeMultiplier

Escenario: prueba a 200 %
  Entonces con el tamaño de letra del sistema al máximo, ningún texto se recorta
  en las pestañas, los botones ni las tarjetas de KPI
```

## E8-11 · `hitSlop` en el botón `sm` y auditoría de objetivos táctiles

`S` · **P2** · origen §9.3 R7

**Como** entrenador de pie y con las manos ocupadas **quiero** poder acertar el botón **para** no repetir el gesto tres veces.

`Button.tsx:50` `HEIGHT: { sm: 36, md: 46, lg: 54 }` sin `hitSlop`, **existiendo `layout.touchMin = 44` declarado y no usado**. El `sm` es el de las acciones de tarjeta. 71 pulsables, 16 con `hitSlop`.

```gherkin
Escenario: botón pequeño
  Entonces el botón sm lleva hitSlop hasta alcanzar 44 px de área efectiva

Escenario: auditoría
  Entonces se revisan los 71 pulsables y los que bajen de 44 px reciben hitSlop

Escenario: el token se usa
  Entonces layout.touchMin deja de estar declarado sin usar
```

## E8-12 · Estados de carga en "Más" y "Perfil"

`XS` · **P2** · origen §9.3 R8

**Como** usuario **quiero** no ver contadores a cero que un segundo después dicen siete **para** no decidir que no tengo nada que hacer.

`mas.tsx` no tiene `isLoading`: las baldosas se pintan con contadores a 0 y saltan al valor real. Un "0 tareas" que medio segundo después dice "7" es peor que un esqueleto: el usuario ya se ha ido. Son las **2 pantallas de 33** que no tienen estado de carga.

```gherkin
Escenario: carga
  Entonces mientras llegan los datos se muestra un esqueleto, no un cero

Escenario: vacío real
  Entonces un cero de verdad se distingue del cero de carga

Escenario: Perfil
  Entonces la misma regla se aplica a la pantalla de perfil
```

## E8-13 · Tablas con `scope`, `aria-sort` y paginación en servidor

`M` · **P2** · origen §4

**Como** usuario de lector de pantalla **quiero** saber por qué columna está ordenada la tabla **para** no depender de una flecha de 10 px al 25 % de opacidad.

`data-table.tsx:276-320`: `<th>` sin `scope="col"`, **0 `aria-sort` en todo `src/`**. Segundo problema: la **paginación es de cliente**, o sea que el servidor envía las 500 filas y el navegador ordena y corta.

```gherkin
Escenario: semántica
  Entonces los th declaran scope="col" y el orden se expone con aria-sort

Escenario: indicación visible
  Entonces el estado de orden se indica con algo más que una flecha tenue

Escenario: paginación en servidor
  Entonces /members y /billing paginan y ordenan en servidor
  Y el estado viaja en la URL

Escenario: degradación a tarjetas
  Entonces bajo 640 px sigue funcionando, y el primer pintado en móvil no es la tabla ancha
```

## E8-14 · El `Select` con `required` valida de verdad

`XS` · **P2** · origen §4

**Como** usuario **quiero** que un campo obligatorio me lo diga antes de enviar **para** no hacer el viaje al servidor y recibir un toast rojo genérico.

`field.tsx:384` usa `<input type="hidden" … required>`, y los `hidden` están **excluidos de la validación de restricciones** del HTML. En `new-lead-drawer.tsx:113` (Centro) y `:143` (Canal) el formulario se envía vacío.

```gherkin
Escenario: campo vacío
  Entonces el envío se bloquea en cliente y se marca el campo culpable

Escenario: mensaje
  Entonces el mensaje dice qué campo falta, no un error genérico

Escenario: servidor
  Entonces la validación de servidor se mantiene: esta historia añade la de cliente
```

## E8-15 · Captura de lead en dos pasos

`S` · **P1** · origen §4

**Como** recepción **quiero** capturar un lead en cuatro campos **para** no tener a alguien esperando de pie mientras relleno once.

`leads/new-lead-drawer.tsx:97-170`: nombre, apellidos, teléfono, CP, centro, ocupación, canal, objetivos y —línea 165— "Lesiones / patologías" con el hint *'Obligatorio, escribe "ninguna" si no aplica'*. **Eso es un formulario de admisión, no una captura de lead.**

```gherkin
Escenario: primer paso
  Entonces solo son obligatorios nombre, teléfono, centro y canal

Escenario: segundo paso diferible
  Entonces el resto se puede completar después, desde la ficha del lead

Escenario: el campo de lesiones
  Entonces deja de ser texto libre obligatorio (ver E10-01)

Escenario: lead incompleto
  Entonces la ficha señala qué falta, sin bloquear la gestión comercial
```

## E8-16 · El panel de acceso demo y los botones de SSO muertos salen del login

`XS` · **P1** · origen §4

**Como** Apta **quiero** que la primera pantalla del producto no enseñe contraseñas compartidas ni botones desactivados **para** no dar la peor primera impresión posible en un producto que se vende como premium.

`login/login-form.tsx:271-296` lista usuarios demo con inicio a un clic y **la contraseña compartida impresa en un `<code>`**; y `:183-201` deja "Continuar con Microsoft" y "Continuar con Google" permanentemente `disabled`, con la explicación escondida en un `title` que no se ve ni con teclado ni en táctil.

```gherkin
Escenario: producción
  Entonces el panel de acceso demo no se renderiza

Escenario: entorno de demostración
  Entonces sí se renderiza, controlado por la misma bandera que el resto del modo demo

Escenario: SSO
  Entonces los botones desactivados se retiran, o se activan
  Y en ningún caso queda un botón permanentemente disabled con la explicación en un title
```

## E8-17 · Menú a cinco secciones

`M` · **P1** · origen §2.3 · **decisión D-P6 aplicada**

**Como** dirección **quiero** un menú organizado por cómo trabajo **para** encontrar lo que busco sin recorrer quince entradas.

El OWNER tiene **15 entradas en cuatro secciones**. El roadmap se marcó bajarlo a 13; `MODULOS_APARCADOS.md` admite que se quedó en 14 y argumenta que ninguna es prescindible — **ese argumento es el síntoma**. Cinco de las quince son **configuración disfrazada de módulo**: `/aforo`, `/health/aptitude-rules`, `/health/reference-ranges`, `/organization/valoraciones`, `/puesta-en-marcha`.

Criterio: **¿se toca al menos una vez por semana? Si no, es Ajustes.** La ficha de socio ya unificó once pestañas en cinco secciones: ese mismo criterio va al menú.

```gherkin
Escenario: cinco secciones
  Entonces el menú queda en Hoy, Socios, Dinero, Crecer y Ajustes

Escenario: Hoy
  Entonces contiene agenda, Session Brief, check-in y tareas del día

Escenario: Socios
  Entonces contiene fichas, salud, valoraciones, mesociclos y retención

Escenario: Dinero
  Entonces contiene cobros, morosidad, productos y planes, y MRR

Escenario: Crecer
  Entonces contiene leads, anuncios y el mapa de barrios

Escenario: Ajustes
  Entonces contiene organización, centros con aforo dentro, reglas, rangos, valoraciones,
  puesta en marcha, RRHH y auditoría

Escenario: /aforo deja de ser módulo
  Entonces el aforo se edita en Organización → Centros, como ya dice MODULOS_APARCADOS.md

Escenario: módulos apagados
  Entonces la rutina de IA del portal y los fichajes no aparecen (ver E12-01 y E10-21)
  Y chat, tareas, anuncios y biblioteca siguen presentes, porque no se apagan (D-P6)

Escenario: por rol
  Entonces cada rol ve solo las secciones con contenido para él
```

## E8-18 · Diccionario único de rótulos y matriz única de permisos

`M` · **P2** · origen §4, §9.3 R10

**Como** director que usa las dos superficies **quiero** que las cosas se llamen igual **para** no aprender dos mapas del mismo producto.

`ROLE_LABEL` está escrito dos veces con textos distintos (la app dice "Dirección" y "Administración"; `rbac.ts` dice "Dirección de organización" y "Admin plataforma"). La web llama "Organización" a lo que la app llama "Equipo". Y los iconos se nombran por dominio en la web (`panel`, `socios`, `agenda`, `cobros`) y por forma en la app (`activity`, `users`, `calendar`, `wallet`), con geometrías distintas: **la misma "Agenda" se dibuja de dos maneras**.

```gherkin
Escenario: rótulos
  Entonces ROLE_LABEL vive en un solo módulo, consumido por las dos superficies

Escenario: nombres de sección
  Entonces web y app usan el mismo nombre para la misma sección

Escenario: iconos
  Entonces los trazos de la app se exportan como datos de path y los consumen las dos superficies
  (los del móvil están mejor construidos: son los que se conservan)

Escenario: paridad de capacidades
  Entonces toda entrada de menú de un rol en la web existe en la app,
  como pestaña o como baldosa de "Más", dentro de los roles que la app conserva (ver E13-01)

Escenario: permisos
  Entonces la matriz es única y el test de paridad la protege (ver E7-09)
```

---

# E9 · SEO y captación

> Inventario completo de páginas públicas indexables hoy: `/planes`, `/privacidad` y las dos plantillas de centro. **Cuatro URLs** contra Trainingym, Mindbody, Virtuagym, Glofox y AimHarder, todos con blogs de cientos de artículos.
>
> **Decisión D-P3**: solo España durante 12 meses. `lang="es"` fijo sigue siendo correcto; no se invierte en i18n.

## E9-01 · El proxy deja pasar `robots.txt`, `sitemap.xml` y `/.well-known/*`

`XS` · **P0** · origen §3 A.1, B.2

**Como** Apta **quiero** que Googlebot pueda leer `robots.txt` **para** que no suspenda el rastreo del host.

`src/proxy.ts:62` — el matcher no excluye `.txt` ni `.xml`, y `public-paths.ts` no los lista. Resultado: `NextResponse.redirect("/login?callbackUrl=/robots.txt")`. Googlebot pide `robots.txt` **antes de rastrear nada**; un 307 a `/login` se interpreta como "no disponible". **Hay que arreglarlo antes de escribir los ficheros, no después.** Y `/.well-known/*` tiene la misma raíz: la verificación de App Links fallaría **en silencio**.

```gherkin
Escenario: robots.txt
  Cuando se pide /robots.txt sin sesión
  Entonces responde 200, no 307

Escenario: sitemap.xml
  Entonces responde 200 sin sesión

Escenario: well-known
  Entonces /.well-known/apple-app-site-association y /assetlinks.json responden sin redirección

Escenario: el resto sigue protegido
  Entonces cualquier otra ruta privada sigue redirigiendo a /login
```

## E9-02 · `robots.ts` con `noindex` de lo privado y de las rutas con token

`S` · **P0** · origen §3 A.2, A.3

**Como** Apta **quiero** que las rutas privadas y las que llevan token firmado no se indexen **para** que un enlace de gestión de suscripción no aparezca en una búsqueda.

`grep -rn "robots\|noindex" src/` **no devuelve nada**. El único freno es el redirect, que evita servir contenido pero no evita que Google **descubra e indexe la URL**, y `/login?callbackUrl=…` genera infinitas variantes. Y hay **seis rutas públicas con token firmado en la URL, sin `noindex`**, que viajan en el pie de todos los correos transaccionales: un `/gestionar-suscripcion/<token>` indexado es **acceso sin contraseña al método de pago de una persona expuesto en la SERP**. Es un incidente de datos personales, no solo un problema de SEO.

```gherkin
Escenario: robots.ts
  Entonces existe src/app/robots.ts derivado de PUBLIC_PATHS

Escenario: las 39 privadas
  Entonces el metadata de (app)/layout.tsx declara robots index:false, follow:false

Escenario: las seis con token
  Dado /onboarding/[token], /verificar-email/[token], /recuperar-clave/[token],
  /gestionar-suscripcion/[token], /preferencias/[token] y /baja/[token]
  Entonces cada una declara robots index:false, follow:false, nocache:true
  Y emite meta name="referrer" content="no-referrer" para que el token no se filtre en el Referer
  Y aparecen en Disallow

Escenario: demo y gracias
  Entonces /demo-checkout y /hazte-socio/gracias también llevan noindex
```

## E9-03 · `metadataBase`, OG por defecto y `src/lib/site.ts`

`S` · **P1** · origen §3 A.8

**Como** Apta **quiero** la marca y el origen canónico en un solo módulo **para** que un cambio de nombre sea una línea y no una arqueología.

`layout.tsx:18-21` son cuatro líneas: `title: "TRAINING ZONE"` y una `description`. Sin `metadataBase`, cualquier `openGraph.images` relativa se resuelve mal; sin OG, cada enlace compartido sale como texto plano — y **en venta B2B a dueños de gimnasio la recomendación ocurre por mensajería**. Y "TRAINING ZONE" no contiene ninguna palabra clave: es una marca desconocida ocupando los 60 caracteres más valiosos. Además `NEXTAUTH_URL` está duplicado en cinco módulos.

```gherkin
Escenario: módulo único
  Entonces existe src/lib/site.ts con BRAND y publicOrigin()
  Y los cinco módulos que hoy leen NEXTAUTH_URL por su cuenta pasan por él

Escenario: metadataBase
  Entonces el layout raíz lo declara

Escenario: plantilla de título
  Entonces usa title: { default, template: "%s · Apta" }

Escenario: OpenGraph
  Entonces hay imagen y descripción por defecto, y un enlace compartido muestra tarjeta

Escenario: coherencia de marca
  Entonces el logo y el title dicen lo mismo: hoy el logo dice "Apta" y el title "TRAINING ZONE",
  y Google indexa dos marcas
```

## E9-04 · `generateMetadata` por centro, con canonical

`S` · **P1** · origen §3 A.4, A.9

**Como** centro **quiero** que mi página tenga título propio **para** no desaparecer canibalizada por las de los otros noventa y nueve.

Las dos plantillas tienen `metadata` **estáticos** pese a que `ctx.center.name` está disponible en el render: cien centros = cien URLs con título idéntico y cuerpo idéntico salvo el `<h1>`. Google los agrupa y **elige una sola canónica**; las demás desaparecen. **La propuesta de valor "cada centro con su página" hoy no existe funcionalmente.** Y `/hazte-socio` y `/lead-form` compiten por la misma intención sin canonical: Google elegirá probablemente `/lead-form` —la que el gimnasio embebe— y el usuario aterrizará en un formulario en vez de en la página con precios.

```gherkin
Escenario: título por centro
  Entonces generateMetadata compone title, description y openGraph con el nombre y la ciudad del centro

Escenario: canonical
  Entonces /hazte-socio/[org]/[centro] declara su propia URL como canónica

Escenario: lead-form
  Entonces /lead-form declara alternates.canonical apuntando a /hazte-socio
  Y robots index:false, follow:true

Escenario: centro sin datos
  Entonces se degrada al título genérico, sin romper
```

## E9-05 · NAP en el modelo `Center` y en las queries públicas

`M` · **P1** · origen §3 A.5

**Como** centro **quiero** que mi página diga dónde estoy, cuándo abro y qué hago **para** que Google la case con una intención local.

`public-membership-queries.ts` y `public-lead-queries.ts` hacen `select: { id, name }`, cuando el esquema **sí tiene** `address`, `lat`, `lng` y `timezone`. Y no existen en el modelo: `phone`, `openingHours`, `city`, `postalCode`, `neighborhood`, `description`, ni flag de publicación. **`description` es el campo que decide si esto posiciona**: sin párrafo propio por centro, la plantilla compartida sigue siendo contenido duplicado aunque cambies el título.

```gherkin
Escenario: primer tiempo
  Entonces el select público incluye address, lat, lng y timezone
  Y la página pinta la dirección y un mapa

Escenario: segundo tiempo
  Entonces Center gana phone, city, postalCode, neighborhood, description @db.Text,
  openingHours Json? y publicPage Boolean @default(false)

Escenario: edición
  Entonces dirección edita todo eso desde Organización → Centros

Escenario: publicación
  Entonces un centro con publicPage=false no aparece en el sitemap ni se indexa

Escenario: NAP consistente
  Entonces la puesta en marcha recuerda que el NAP debe coincidir carácter a carácter
  con la ficha de Google Business Profile del centro
```

## E9-06 · `sitemap.ts` filtrado por `platformStatus` y `publicPage`

`S` · **P1** · origen §3 A.7

**Como** Apta **quiero** un sitemap que solo publique lo que debe **para** no enseñar a Google gimnasios que no han pagado ni organizaciones de prueba.

Ninguna página pública tiene `generateStaticParams`, y no hay ningún índice interno que enlace a los centros: **si el gimnasio no las enlaza desde su web, Google no llega jamás**.

```gherkin
Escenario: sitemap
  Entonces existe src/app/sitemap.ts con las páginas públicas y las de centro

Escenario: filtros
  Entonces solo entran centros de organizaciones con platformStatus operativo y con publicPage=true

Escenario: lead-form fuera
  Entonces /lead-form no entra en el sitemap

Escenario: sin tokens
  Entonces ningún loc contiene /portal, /dashboard ni token alguno
```

## E9-07 · JSON-LD: `SportsActivityLocation`, `FAQPage` y `Organization`

`S` · **P2** · origen §3 A.6

**Como** Apta **quiero** datos estructurados **para** ganar presencia en resultados enriquecidos.

`grep -rn "application/ld+json\|schema.org"` **no devuelve nada**. Las cinco preguntas de la FAQ **ya están escritas** en `planes/faq.tsx:4-57`.

```gherkin
Escenario: FAQPage
  Entonces se genera desde el array FAQS, no a mano, para que no se desincronice

Escenario: centro
  Entonces se emite SportsActivityLocation SOLO si address y lat/lng no son nulos:
  marcado incompleto es peor que ausente

Escenario: Organization
  Entonces se emite en el layout raíz

Escenario: Offer sin precio
  Entonces no se marca price desde priceLabel, que es "solo presentación"
  y puede no coincidir con el cobro real
  Y se emite Offer sin price hasta que haya importe canónico

Escenario: validación
  Entonces el marcado pasa el Rich Results Test y validator.schema.org antes de darse por bueno
```

## E9-08 · Carga diferida del tour de `/planes`

`S` · **P1** · origen §3 A.10

**Como** visitante **quiero** poder pulsar "Ver planes" sin esperar **para** no abandonar la página donde se decide la conversión.

`planes/tour-screens.tsx` son **85.911 bytes** de fuente importados desde un componente `"use client"`; `tour-stage.tsx` son otros 22 KB. **~108 KB de JS antes de poder pulsar.**

```gherkin
Escenario: carga diferida
  Entonces tour-stage se carga con dynamic(..., { ssr: false }) o por intersección

Escenario: sin salto de maquetación
  Entonces el póster tiene exactamente las mismas dimensiones,
  para no cambiar TBT por CLS

Escenario: medición
  Entonces se anota el First Load JS de /planes antes y después

Escenario: el resto de /planes
  Entonces hero, tour, FAQ y testimonios quedan estáticos
  Y el bloque de precios se extrae a Suspense, conservando su force-dynamic
```

## E9-09 · Analítica sin cookies, Search Console y eventos de conversión

`S` · **P1** · origen §3 A.11

**Como** Apta **quiero** medir **para** que el trabajo de SEO deje de ser opinión.

Cero analítica, cero Search Console, cero eventos.

```gherkin
Escenario: analítica sin cookies
  Entonces se instala una analítica sin cookies, para no arrastrar banner en la landing
  Y si se optase por GA4, sería con Consent Mode y CMP con "rechazar todo"
  al mismo nivel visual que "aceptar" (ver E10-22)

Escenario: Search Console
  Entonces metadata.verification.google está puesto y el dominio verificado por DNS

Escenario: eventos
  Entonces hay evento de conversión en el checkout de /planes, en el de centro y en el lead form

Escenario: línea base
  Entonces se anota la posición media y las impresiones de /planes en la semana 0
```

## E9-10 · Un solo H1 en `/planes`, con la consulta principal

`XS` · **P2** · origen §3 A.12

Hay **dos H1**: `hero.tsx:20` y `page.tsx:71`. El e2e no comprueba el nivel, así que bajarlo no rompe nada. Y el H1 del hero no lleva la consulta principal.

```gherkin
Escenario: un solo h1
  Entonces "Elige tu plan" baja a h2 y queda el del hero

Escenario: la consulta
  Entonces el h1 contiene la consulta principal, "software gestión gimnasio"

Escenario: sin duplicar
  Entonces el eyebrow del hero no repite la misma frase

Escenario: activar
  Entonces los dos h1 de activar/page.tsx se conservan: son ramas de return mutuamente excluyentes
```

## E9-11 · Páginas de captación por funcionalidad y por vertical, e índice de centros

`L` · **P2** · origen §3 A.13

**Como** Apta **quiero** más de cuatro URLs indexables **para** competir con quien tiene cientos.

El contenido **ya está escrito** en `FEATURE_LABEL` y `CORE_FEATURES`, y el hero ya nombra los tres verticales.

```gherkin
Escenario: por funcionalidad
  Entonces existe una página por funcionalidad, generada desde CORE_FEATURES

Escenario: por vertical
  Entonces existen páginas para box/CrossFit, entrenamiento personal y pilates

Escenario: índice de centros
  Entonces existe /centros y /centros/[ciudad], que además resuelve la orfandad del sitemap

Escenario: enlazado
  Entonces cada página de centro se alcanza desde su índice sin escribir la URL a mano

Escenario: el blog
  Entonces queda para el final, después de las tres anteriores
```

## E9-12 · `next/image` en las páginas públicas y `remotePatterns`

`S` · **P2** · origen §3 A.14

Los logos dinámicos son `<img>` sin dimensiones, justo encima del H1 → **CLS**. Y `logoUrl` es una URL arbitraria por organización: **un gimnasio puede subir un PNG de 3 MB y hundir el LCP de su propia página**.

```gherkin
Escenario: imágenes
  Entonces los logos usan next/image con dimensiones declaradas

Escenario: dominios
  Entonces next.config.ts declara images.remotePatterns para los logos de organización

Escenario: tamaño
  Entonces se sirve una versión optimizada aunque el original sea grande

Escenario: lo que ya está bien
  Entonces la fuente sigue usando next/font/google con display swap
```

## E9-13 · Testimonios: retirar o desatribuir por completo

`XS` · **P1** · origen §3 A.15

**Como** Apta **quiero** no publicar reseñas inventadas con nombre y cargo **para** no incumplir la Ley 3/1991 tras la Directiva Ómnibus ni destruir mi E-E-A-T.

`planes/testimonials.tsx:4-23`: tres citas atribuidas a personas y empresas concretas; el propio comentario reconoce que son inventadas, y el único descargo es un subtítulo genérico **debajo**.

```gherkin
Escenario: opción A
  Entonces la sección se retira

Escenario: opción B
  Entonces se desatribuye por completo, con rótulo inequívoco ENCIMA de las citas

Escenario: sin término medio
  Entonces no se conservan nombres, cargos ni empresas inventadas

Escenario: testimonios reales
  Entonces cuando haya consentimiento por escrito de tres clientes piloto,
  se publican con su nombre real
```

## E9-14 · Las páginas de centro se cachean

`S` · **P2** · origen §3 A.16

Sin `revalidate` ni `generateStaticParams`, y con dos consultas secuenciales más el catálogo y la comprobación de Stripe.

```gherkin
Escenario: caché
  Entonces las páginas de centro declaran revalidate = 600

Escenario: invalidación
  Entonces al editar el centro o su catálogo se llama a revalidateTag

Escenario: /planes NO
  Entonces /planes conserva su force-dynamic, que está justificado
```

## E9-15 · Enseñar las URLs públicas del centro en la puesta en marcha

`XS` · **P1** · origen §1.1 W-03

**Como** dueño de un gimnasio **quiero** saber cuál es la URL pública de mi centro **para** poder usarla.

`grep -rn "hazte-socio\|lead-form"` fuera de sus propias carpetas devuelve **solo** el allowlist del middleware y dos comentarios. La puesta en marcha tiene 7 pasos y **ninguno enseña la URL pública**; `/organization` recoge el `slug` y jamás lo devuelve como enlace. **El embudo comercial completo solo es alcanzable si el gimnasio construye la URL a mano.** Es una línea de interfaz que desbloquea el embudo entero.

```gherkin
Escenario: paso en la puesta en marcha
  Entonces existe un paso "Tus enlaces públicos" con la URL de cada centro

Escenario: bloque en Organización → Centros
  Entonces cada centro muestra sus dos URLs públicas con copiar al portapapeles

Escenario: publicación
  Entonces el enlace indica si el centro está publicado (publicPage) y cómo cambiarlo

Escenario: reclamar Google
  Entonces el mismo bloque recuerda reclamar la ficha de Google Business Profile,
  con NAP idéntico al de la página
```

## E9-16 · Ficha de tienda: identificadores, capturas, copy y App Links

`M` · **P2** · origen §3 B.1-B.5 · **⚠️ backlog de publicación (D-M2)**

**Como** Apta **quiero** una ficha de tienda que se pueda publicar y encontrar **para** que la app no parta de cero dentro de la tienda.

`app.json` **no tiene bloque `ios` en absoluto**, ni `android.package`, ni `ios.bundleIdentifier`, ni `description`, ni `privacy`. Tampoco existe `eas.json`. **Sin eso no hay build firmada, ni TestFlight, ni ficha.** Y en `assets/images/` solo hay iconos: **ni una captura**.

**Decisión irreversible que hay que tomar antes de la primera subida**: `bundleIdentifier` y `package` son **inmutables tras publicar**. Es la única pieza del repositorio donde el nombre queda cementado.

```gherkin
Escenario: identificadores
  Entonces app.json declara ios.bundleIdentifier y android.package, decididos con el nombre cerrado
  Y existe eas.json con perfil de producción

Escenario: copy
  Entonces el nombre de ficha es "Apta · Tu gimnasio", con subtítulo "Reserva, bonos y tu progreso"
  Y la descripción breve de Play dice qué resuelve, no qué es

Escenario: capturas
  Entonces hay entre 6 y 8 capturas por plataforma, en los tamaños obligatorios

Escenario: App Links
  Entonces existen apple-app-site-association y assetlinks.json servidos desde /.well-known
  Y el proxy los deja pasar (ver E9-01)
  Y un enlace a /portal/agenda abre la app si está instalada

Escenario: página /app
  Entonces existe una página con capturas, botones de tienda y JSON-LD MobileApplication
  Y la página de centro enlaza a las tiendas, que es donde está el socio real

Escenario: privacidad
  Entonces app.json referencia la URL de política de privacidad
  Y los cuestionarios App Privacy y Data safety declaran "Health & Fitness" y "Sensitive Info"

Escenario: OTA
  Entonces se decide si entra expo-updates, hoy ausente pese a estar planificado
```

---

# E10 · Cumplimiento normativo

> El proyecto tiene una arquitectura de protección de datos **muy por encima de lo habitual en el sector**: punto único de acceso a salud, auditoría real, consentimiento versionado y granular, oposición a la IA que funciona de verdad, y gestión de correo impecable. **Los incumplimientos no están en el diseño: están en los bordes** — el formulario público que nadie revisó, la pestaña que se olvidó de gatear, el ciclo de vida del dato que nunca se cerró, y toda la capa documental que no existe.
>
> Regla general que atraviesa esta épica: **un texto legal que el código incumple es peor que no tenerlo.**

## E10-01 · Capa informativa y minimización del campo de salud en el formulario público de leads

`S` · **P0** · origen §7 CN-01

**Como** persona que rellena un formulario en la web de un gimnasio **quiero** saber qué se hace con mi dato de salud antes de darlo **para** poder decidir.

`public-lead-form.tsx:111-113` pide *"¿Alguna lesión, enfermedad o patología?"* como campo **`required`**. **No hay casilla de consentimiento, ni texto informativo, ni enlace a `/privacidad`.** Y `health-access.ts:100-138` crea el `HealthRecord` con `consentSignedAt: new Date()` — **se estampa la firma de un consentimiento que nadie ha prestado**. Arts. 9.2.a, 13 y 7 RGPD; art. 6 LOPDGDD. Es el hallazgo con la relación coste/exposición más desfavorable del repositorio.

```gherkin
Escenario: capa informativa
  Entonces sobre el formulario aparece quién trata los datos, para qué, con qué base
  y el enlace a la política de privacidad

Escenario: consentimiento separado
  Entonces hay una casilla específica para el dato de salud, no premarcada,
  distinta de la de contacto comercial

Escenario: sin casilla marcada
  Cuando se envía sin marcarla
  Entonces no se crea ningún HealthRecord
  Y el lead se crea igualmente con los datos de contacto

Escenario: consentSignedAt
  Entonces solo se estampa si la casilla se marcó, con la versión de consentimiento

Escenario: minimización
  Entonces el texto libre se sustituye por un booleano "¿Tienes alguna lesión o condición
  que debamos tener en cuenta?"
  Y el detalle se recoge en la valoración presencial, con el entrenador delante

Escenario: campo obligatorio
  Entonces el campo de salud deja de ser required
```

## E10-02 · `MemberProgressEntry` pasa por `health-access.ts`

`S` · **P0** · origen §7 CN-02

**Como** socio **quiero** que mis fotos de progreso y mi composición corporal tengan el mismo trato que mi historial clínico **para** que no las vea recepción sin dejar rastro.

La matriz excluye a recepción de los datos de salud, y la ficha gatea "Salud" y las valoraciones — pero **la sección `evolucion` no lleva ningún gate**, y `members-queries.ts:137` carga `progressEntries` dentro del `include`, **sin pasar por `health-access.ts` y sin `AuditLog`**. Recepción ve `bodyFatPct`, `visceralFatRating`, `bmi`, `metabolicAge`, `muscleMassKg`, la evolución gráfica y **las fotos frontal, de perfil y de espalda** de cualquier socio de su ámbito, **sin dejar rastro**. Contradice literalmente el comentario del propio esquema: *"Dato Art. 9 RGPD: mismo tratamiento que HealthRecord"*.

**Es la brecha de datos de salud más probable del sistema, y la que peor se defiende: el propio repositorio documenta la regla que incumple.**

```gherkin
Escenario: recepción
  Dado un usuario RECEPTION
  Cuando abre la ficha de un socio
  Entonces la sección "evolución" no se renderiza
  Y progressEntries no viaja en la respuesta

Escenario: punto único
  Entonces toda lectura de MemberProgressEntry pasa por health-access.ts

Escenario: auditoría
  Entonces cada lectura autorizada escribe AuditLog con actor, socio y momento

Escenario: la app
  Entonces la pantalla de evolución de la app aplica la misma regla

Escenario: roles autorizados
  Entonces entrenador asignado y dirección siguen viéndola, ahora con traza
```

## E10-03 · "Declaración de salud" en el onboarding, con la base jurídica documentada

`M` · **P0** · origen §7 CN-03 · **decisión de dirección (obligatorio) + D-C2 (art. 9.2.f)**

**Como** Apta **quiero** que el dato de salud obligatorio se apoye en una base jurídica que aguante **para** no tener un consentimiento presumiblemente no libre en el centro de mi producto.

Dirección ha decidido que **el alta no se completa sin declaración de salud**: el motivo de negocio es sólido — sin datos clínicos, el semáforo y las adaptaciones no funcionan, y el centro asume el riesgo de programar a ciegas.

Lo que hay que hacer **es distinto, no menos**: si el dato es obligatorio, la base jurídica **ya no puede ser el consentimiento**. El art. 7.4 presume no libre un consentimiento que condiciona la prestación del servicio, así que **llamarlo "consentimiento" es precisamente lo que lo vuelve atacable**. La vía que sostiene la decisión (D-C2) es el **art. 9.2.f** —tratamiento necesario para la formulación, ejercicio o defensa de reclamaciones, que es exactamente el escenario de una lesión en sala— junto al art. 6.1.b/6.1.f para los datos base.

```gherkin
Escenario: renombrado
  Entonces el bloque obligatorio se llama "Declaración de salud", no "consentimiento"
  Y el texto explica que es condición del servicio y por qué:
  seguridad en sala, adaptación del entrenamiento y defensa ante reclamaciones

Escenario: los otros tres siguen siendo libres
  Entonces IA, imágenes y marketing siguen siendo opcionales y revocables
  Y no se pueden marcar en bloque junto con la declaración

Escenario: el alta se completa
  Cuando el socio acepta la declaración de salud pero rechaza los otros tres
  Entonces el alta se completa con normalidad

Escenario: revocación
  Entonces los tres accesorios se siguen pudiendo retirar desde portal/perfil

Escenario: documentación
  Entonces la base jurídica queda escrita en el registro de actividades y en la política de privacidad
  Y el análisis se recoge en la EIPD (ver E10-10)

Escenario: validación jurídica
  Entonces la redacción se valida con asesoría externa antes de publicarse
  Y si concluye que el 9.2.f no cubre todo el alcance,
  la palanca es RECORTAR qué se pide como obligatorio (PAR-Q y lesiones activas),
  no volver a hacer opcional el alta
```

## E10-04 · Contrato de encargado del tratamiento Apta ↔ centro

`M` · **P0** · origen §7 CN-30 · producto + jurídico

**Como** Apta **quiero** que el centro firme el encargo del tratamiento **para** que el tratamiento no sea ilícito para las dos partes.

Apta trata datos de salud de los socios por cuenta del gimnasio: **es encargado del tratamiento, sin discusión**. Y **no hay ningún punto del flujo en que el gimnasio firme nada**: el Checkout de licencia se crea **sin `consent_collection.terms_of_service`**, la organización nace del webhook de pago sin aceptación de condiciones ni de encargo, y el onboarding solo hace que el `OWNER` cree contraseña. **Tampoco hay autorización de subencargados** (Anthropic, Stripe, Brevo, Render, Expo) ni lista publicada.

**Bloqueante comercial absoluto**: ningún cliente B2B con asesoría propia firma un SaaS que trata datos del art. 9 sin DPA.

```gherkin
Escenario: aceptación en el checkout
  Entonces el Checkout de licencia recoge consent_collection.terms_of_service
  Y la aceptación queda registrada con versión, fecha y quién

Escenario: anexo de encargo
  Entonces las condiciones incluyen el Anexo de Encargo del Tratamiento

Escenario: subencargados
  Entonces existe una lista pública de subencargados, con su función y ubicación
  Y el contrato prevé el mecanismo de notificación de cambios

Escenario: clientes existentes
  Entonces se les pide la aceptación antes de seguir operando, con un flujo de re-aceptación

Escenario: sin aceptación
  Entonces la organización no queda operativa

Escenario: doble uso
  Entonces Apta entrega al cliente una plantilla de registro de actividades precumplimentada:
  es a la vez cumplimiento y argumento de venta
```

## E10-05 · Política de privacidad completa conforme al art. 13

`S` · **P0** · origen §7 CN-06 · producto + jurídico

**Como** socio **quiero** una política de privacidad que diga la verdad completa **para** saber quién trata mis datos y a quién se los da.

`/privacidad` reutiliza `CONSENT_TEXT` más dos bloques. **Faltan**: NIF y domicilio del responsable; DPD o declaración de que no procede; **base jurídica por cada tratamiento** (hoy todo se presenta como consentimiento, cuando agenda, cobros y portal son ejecución de contrato); **destinatarios** (no se nombra a Stripe, Anthropic, Brevo ni Render); transferencias internacionales y sus garantías; plazos de conservación; derecho a retirar el consentimiento; derecho a reclamar ante la AEPD; y existencia o no de decisiones automatizadas. **Es un incumplimiento verificable en treinta segundos desde el navegador.**

```gherkin
Escenario: contenido del art. 13
  Entonces la política incluye responsable con NIF y domicilio, DPD o su ausencia motivada,
  base jurídica por tratamiento, destinatarios nominados, transferencias y garantías,
  plazos de conservación, derechos incluida la retirada del consentimiento,
  reclamación ante la AEPD y existencia de decisiones automatizadas

Escenario: decisiones automatizadas
  Entonces se declara que NO hay decisión automatizada con efectos significativos:
  el mesociclo nace DRAFT, exige aprobación humana y no se expone al socio

Escenario: versión para la app
  Entonces existe la misma política enlazable desde la app (ver E10-19)

Escenario: versionado
  Entonces la política lleva versión y fecha, y los cambios materiales se comunican
```

## E10-06 · Información precontractual, condiciones, desistimiento y confirmación

`M` · **P0** · origen §7 CN-07 · producto + jurídico

**Como** socio que contrata por internet **quiero** la información precontractual completa **para** saber qué contrato estoy firmando.

`hazte-socio/.../page.tsx:74-123` es un contrato a distancia con consumidor y **no contiene**: identidad del empresario con NIF y teléfono; **precio total con impuestos** (pinta el importe sin mención de IVA); duración, condiciones de resolución y **renovación automática** (los planes recurrentes se cobran solos y **en ningún sitio se dice**); **derecho de desistimiento de 14 días** ni el formulario del Anexo A; casilla de condiciones; ni botón con etiqueta inequívoca de obligación de pago (dice `Contratar`, art. 98.2). Tampoco hay **confirmación en soporte duradero**. Y `/planes` no tiene aviso legal ni condiciones en el pie (art. 10 LSSI).

**Riesgo práctico más grave que la multa**: si no se informa del desistimiento, **el plazo se amplía a 12 meses** — cualquier socio puede deshacer el contrato durante un año.

*Nota fiscal*: la exención de servicios deportivos del art. 20.Uno.13º LIVA **solo alcanza a entidades de carácter social**; una S.L. con ánimo de lucro tributa al 21 %.

```gherkin
Escenario: información precontractual
  Entonces la página de contratación muestra identidad con NIF y teléfono,
  precio total con impuestos, duración, condiciones de resolución
  y si el plan se renueva automáticamente

Escenario: duración del bono
  Entonces se dice cuántos días de validez tiene el bono, dato que ya existe y el móvil sí enseña

Escenario: desistimiento
  Entonces se informa del derecho de 14 días y se ofrece el formulario del Anexo A

Escenario: casilla de condiciones
  Entonces hay casilla de aceptación de condiciones, no premarcada

Escenario: botón
  Entonces el botón dice "Pagar" o "Suscribirse y pagar", nunca solo "Contratar"

Escenario: confirmación en soporte duradero
  Entonces tras contratar se envía email de confirmación con las condiciones completas

Escenario: pie legal
  Entonces /planes y las páginas de centro llevan aviso legal, condiciones y privacidad en el pie
```

## E10-07 · Región de despliegue en la UE, documentada y verificada en arranque

`S` · **P0** · origen §7 CN-31 · **decisión D-C1: ya está en la UE**

**Como** responsable de cumplimiento **quiero** poder demostrar dónde está la base de datos con los `HealthRecord` **para** no tener una transferencia internacional de datos de salud sin declarar.

**Decisión D-C1**: la base de datos ya está en la UE. Esta historia se reduce a **documentarlo y blindarlo**, para que no se pierda en el siguiente despliegue.

```gherkin
Escenario: verificación de arranque
  Entonces el arranque comprueba que la región de la base de datos es de la UE
  Y falla si no lo es, en vez de arrancar y callarse

Escenario: documentación
  Entonces la región queda escrita en la política de privacidad y en el registro de actividades

Escenario: los demás proveedores
  Entonces se declara la ubicación y las garantías de Anthropic, Stripe, Brevo, Expo,
  Microsoft y Google, con el mecanismo de transferencia de cada uno

Escenario: cambio de región
  Entonces mover la base de datos exige actualizar la documentación en el mismo cambio
```

## E10-08 · Motor de retención de datos y anonimización de ex-socios

`L` · **P1** · origen §7 CN-04 · **decisión D-C3: propuesta estándar, validada después** · regla `RB-DATOS-001`

**Como** responsable de cumplimiento **quiero** que los datos dejen de acumularse para siempre **para** poder acreditar una política de conservación.

`api/jobs/run` ejecuta once reglas y **ninguna de retención**. No se purga: `Invitation` caducadas (el índice `@@index([expiresAt])` existe **y nadie lo usa**), tokens de refresco revocados, `AuditLog` (crece indefinidamente con `memberId` y metadatos con nombre y email), datos de ex-socios (`Member.cancelledAt` **no dispara nada**: *un socio de baja en 2019 conserva íntegras lesiones, fotos y bioimpedancia*), y organizaciones en `PENDING_PAYMENT` (el esquema **anuncia el TTL** y no está implementado).

**Decisión D-C3**: se construye con la tabla de partida y plazos parametrizables, sin esperar a la validación jurídica.

```gherkin
Escenario: tabla de plazos
  Entonces existe una tabla de plazos por tipo de dato, parametrizable por organización,
  con un mínimo legal que no se puede relajar

Escenario: plazos de partida
  Entonces contractual y de cobro 6 años (art. 30 CCom) y 4 años (art. 66 LGT)
  Y salud, relación + 5 años (art. 1964 CC)
  Y fotos de progreso, borrado a la baja
  Y AuditLog 2-3 años
  Y leads no convertidos 12 meses

Escenario: motor
  Entonces runDataRetentionRule(orgId) se ejecuta con el resto de reglas del cron

Escenario: ex-socios
  Entonces al cumplirse el plazo desde cancelledAt, los datos clínicos se anonimizan,
  conservando lo que la ley obliga

Escenario: purgas
  Entonces se purgan invitaciones caducadas, tokens revocados
  y organizaciones en PENDING_PAYMENT pasado su TTL

Escenario: traza
  Entonces cada ejecución deja constancia de cuántas filas afectó y a qué regla

Escenario: validación posterior
  Entonces los plazos se ajustan tras la validación jurídica sin tocar código,
  porque son configuración
```

## E10-09 · La supresión de socio disocia los cobros, y el diálogo dice la verdad

`S` · **P1** · origen §7 CN-05

**Como** Apta **quiero** que borrar un socio no destruya justificantes de cobro **para** no destruir documentación dentro del plazo de prescripción fiscal.

`members/[id]/actions.ts:426` ejecuta `tx.payment.deleteMany({ where: { memberId } })` y `:434` borra los `HealthRecord`. Mientras tanto, el diálogo que ve dirección afirma: *"RGPD: los datos de salud y los pagos emitidos se conservan anonimizados por obligación legal."* **Es falso: nada se anonimiza, se borra.** Doble riesgo — ante la AEAT, destrucción de justificantes (art. 200 LGT); ante el socio y la AEPD, un texto en pantalla que describe un tratamiento que no ocurre.

```gherkin
Escenario: cobros
  Cuando se suprime un socio
  Entonces sus Payment se disocian (se retira el vínculo con la persona), no se borran
  Y siguen contando en la contabilidad del periodo

Escenario: datos de salud
  Entonces se borran o se anonimizan según la tabla de plazos (ver E10-08)

Escenario: el texto del diálogo
  Entonces describe exactamente lo que va a ocurrir, campo por campo

Escenario: traza
  Entonces la supresión queda en AuditLog con actor, socio y alcance
```

## E10-10 · Registro de actividades, procedimiento de brechas, EIPD y DPD

`M` · **P1** · origen §7 CN-32 · **decisión D-C4: se designa DPD y se hace EIPD** · documental

**Como** Apta **quiero** los cuatro documentos que se piden en el primer requerimiento **para** poder responder a una inspección antes de que mire una sola línea de código.

Ninguno de los cuatro existe. **La excepción de <250 empleados del art. 30 no aplica cuando se tratan datos del art. 9.** Y no hay procedimiento de brechas, ni plantilla de notificación, ni registro interno de incidentes — **con datos del art. 9, es el hueco que más duele si algo pasa**.

**Decisión D-C4**: se designa DPD y se realiza la EIPD.

```gherkin
Escenario: registro de actividades
  Entonces existe el registro con todos los tratamientos, su base jurídica,
  categorías de datos e interesados, destinatarios, transferencias y plazos

Escenario: EIPD
  Entonces se realiza la evaluación de impacto sobre el tratamiento de datos de salud
  y sobre el uso de IA, y se archiva

Escenario: DPD
  Entonces se designa DPD, interno o externo, y se comunica a la AEPD
  Y sus datos de contacto aparecen en la política de privacidad

Escenario: brechas
  Entonces existe procedimiento de notificación, plantilla y registro interno de incidentes
  Y está probado con un simulacro documentado

Escenario: umbral de microempresa
  Entonces se documenta el análisis del umbral de la Ley 11/2023 para Apta y para el centro,
  aunque la conclusión sea "exento" (ver D-C6)

Escenario: plantilla para clientes
  Entonces se entrega al cliente su propio registro de actividades precumplimentado
```

## E10-11 · Exportación de datos del socio completa y auditada

`M` · **P1** · origen §7 CN-11

**Como** socio **quiero** que la descarga de mis datos incluya todo lo que me corresponde **para** que el ejercicio de mi derecho sea real.

Faltan `consentAI` (el bloque lista cuatro de los cinco consentimientos), `Assessment` (**donde vive el grueso del dato clínico declarado**), `PerformanceMetric`, `Mesocycle`, `SessionDebrief` y el `AuditLog` de accesos a sus propios datos. `MemberNote` se excluye a propósito, y el razonamiento es correcto **para el art. 20** (portabilidad) — pero **el art. 15 sí alcanza a las notas**. Y la ruta **no escribe ninguna entrada en `AuditLog`**: el ejercicio de un derecho no queda registrado.

```gherkin
Escenario: art. 20 · portabilidad
  Entonces la descarga en formato estructurado incluye los datos aportados por el socio
  y los generados por su actividad, sin las notas internas

Escenario: art. 15 · acceso
  Entonces existe una vía que incluye además MemberNote y el AuditLog de accesos a sus datos

Escenario: los cinco consentimientos
  Entonces consentAI aparece junto a los otros cuatro

Escenario: los que faltan
  Entonces se incluyen Assessment, PerformanceMetric, Mesocycle y SessionDebrief

Escenario: traza
  Entonces cada ejercicio de derecho queda en AuditLog con fecha y alcance

Escenario: plazo
  Entonces la entrega se produce dentro del mes del art. 12.3
```

## E10-12 · Control de edad y consentimiento de tutores

`M` · **P1** · origen §7 CN-12 · **decisión D-P8: configurable por centro**

**Como** centro **quiero** poder declarar si admito menores y desde qué edad **para** no captar a un menor de 14 años cuyo consentimiento de datos de salud sería nulo.

**No hay ninguna comprobación de edad en ningún flujo**: `Member.birthDate` es opcional y nunca se valida, **el alta pública ni siquiera pide fecha de nacimiento**, `Lead` tampoco la tiene, y no existe campo para el consentimiento del tutor. En España el umbral es **14 años** (art. 7 LOPDGDD).

**Decisión D-P8**: cada organización declara si admite menores y desde qué edad. Quien lo active necesita el flujo de tutores completo.

```gherkin
Escenario: configuración por organización
  Entonces cada organización declara si admite menores y la edad mínima
  Y el valor por defecto es "solo mayores de 18"

Escenario: fecha de nacimiento obligatoria
  Entonces el alta pública y el alta en recepción piden fecha de nacimiento y la validan

Escenario: centro que no admite menores
  Cuando la fecha de nacimiento indica que es menor
  Entonces el alta se bloquea, explicando el motivo

Escenario: centro que sí admite, socio menor de 14
  Entonces se exige consentimiento del tutor legal, con identificación y registro verificable
  Y sin él, el alta no se completa

Escenario: entre 14 y 18
  Entonces se aplica la política declarada por el centro, con el registro correspondiente

Escenario: datos de salud del menor
  Entonces reciben el mismo tratamiento reforzado, y el tutor puede ejercer los derechos

Escenario: leads
  Entonces el formulario público no capta datos de salud de menores
```

## E10-13 · Preaviso de cargo SEPA a 14 días

`S` · **P1** · origen §7 CN-13 · cubierto operativamente por HU-ST-16

**Como** socio domiciliado **quiero** saber cuándo y cuánto me van a cargar **para** que el esquema SEPA se cumpla.

El esquema SEPA Core exige **pre-notificación con al menos 14 días naturales** salvo pacto distinto. Se habilita `sepa_debit` pero **no existe ninguna plantilla de preaviso**: de las once plantillas, la única de cobro es la de pago fallido, **posterior al fallo**. Tampoco se informa del plazo de devolución de 8 semanas.

```gherkin
Escenario: plantilla
  Entonces existe una plantilla de preaviso de cargo con importe, fecha y mandato

Escenario: plazo
  Entonces se envía con al menos 14 días naturales de antelación

Escenario: pacto distinto
  Entonces si las condiciones pactan otro plazo, se aplica el pactado y consta por escrito

Escenario: derecho de devolución
  Entonces el preaviso informa del plazo de devolución de 8 semanas

Escenario: es correo de servicio
  Entonces se envía aunque el socio haya desactivado las comunicaciones comerciales
```

## E10-14 · `AuditLog` append-only por construcción

`XS` · **P1** · origen §7 CN-23 · regla `RB-SEG-006`

**Como** responsable de cumplimiento **quiero** que el registro de auditoría no se pueda modificar **para** que sostenga una impugnación.

`health-access.ts` es un punto único real y el camino móvil también audita: **el diseño es correcto**. Lo que falta es que el `AuditLog` sea **append-only por construcción, no por convención**: el esquema no tiene trigger, ni RLS, ni encadenado hash, y de hecho `members/[id]/actions.ts:461` ya ejecuta `tx.auditLog.updateMany(...)`. **Un log que quien es auditado puede modificar no sostiene una impugnación.**

```gherkin
Escenario: permisos de base de datos
  Entonces la migración de producción ejecuta REVOKE UPDATE, DELETE ON "AuditLog"
  para el rol de aplicación

Escenario: el updateMany existente
  Entonces se sustituye por una fila nueva que anota la corrección, sin modificar la anterior

Escenario: purga por retención
  Entonces el borrado por retención (E10-08) se ejecuta con un rol distinto,
  y queda registrado como operación de mantenimiento

Escenario: MemberNote
  Entonces se documenta que no debe usarse como historial clínico encubierto
  Y su lectura por roles sin permiso de salud queda acotada
```

## E10-15 · Cláusula informativa laboral

`S` · **P1** · origen §7 CN-19, CN-21 · documental

**Como** trabajador **quiero** que se me informe previamente del control de mi actividad **para** que la información sobre mí no se recoja a mis espaldas.

`crossCheckHours` cruza las horas fichadas de cada trabajador con las sesiones que consta que dirigió y devuelve la desviación en minutos, **nominalmente, a dirección**. `ClassSession.directedByUserId` existe precisamente para esa verificación. **No existe ningún documento de información al trabajador**, y el art. 89.1 LOPDGDD exige informar **previa y expresamente** a la plantilla y a la RLT. Riesgo doble: AEPD, y **nulidad de la prueba** en un despido disciplinario apoyado en estos datos.

Y `rrhh/page.tsx:57-91` publica un **ranking nominal por importe vendido, con medallas**: base legítima, pero la forma —ranking, gamificación, comparación entre compañeros— entra en el terreno del art. 20.3 ET.

```gherkin
Escenario: cláusula firmada
  Entonces existe una cláusula informativa que cubre registro de jornada,
  verificación cruzada de horas, valoraciones de socios y ranking de ventas
  Y se entrega y firma antes de que el trabajador use el sistema

Escenario: RLT
  Entonces cuando haya representación legal, se le informa también

Escenario: trabajadores existentes
  Entonces se les entrega antes de seguir usando las funciones afectadas

Escenario: el ranking
  Entonces se informa expresamente de su existencia y finalidad
  Y se evalúa si compensa mantenerlo nominal o pasar a agregado

Escenario: fichajes
  Entonces la cláusula se ajusta a que el módulo queda apagado (ver E10-21)
```

## E10-16 · Procedimiento de acceso del entrenador a sus propias valoraciones

`S` · **P2** · origen §7 CN-20

**Como** entrenador **quiero** poder acceder a lo que se ha valorado de mí **para** ejercer mi derecho de acceso.

`rbac.ts:352-355`: *"valoraciones de entrenadores: EXCLUSIVO dirección, nunca el propio entrenador"*. El diseño está bien argumentado **desde RRHH**, pero la valoración que un socio hace de un entrenador **es dato personal del entrenador**: si ejerce el art. 15 hay que dársela, seudonimizando solo **quién** la escribió — el art. 15.4 permite proteger la identidad del tercero, **no negar el contenido**. **Hoy no hay ningún camino, ni siquiera manual.**

```gherkin
Escenario: solicitud
  Entonces existe un procedimiento por el que el entrenador puede pedir sus valoraciones

Escenario: contenido entregado
  Entonces recibe puntuación, fortalezas y áreas de mejora

Escenario: identidad del tercero
  Entonces no recibe quién escribió cada valoración

Escenario: plazo
  Entonces se atiende dentro del mes del art. 12.3

Escenario: uso en decisión laboral
  Entonces si las valoraciones se usan en una decisión laboral,
  se informa a la RLT conforme al art. 64.4.d ET

Escenario: la pantalla sigue restringida
  Entonces el acceso directo desde la interfaz sigue siendo exclusivo de dirección:
  esta historia crea el procedimiento, no abre la pantalla
```

## E10-17 · Clasificación AI Act, marca de contenido generado y formación del art. 4

`S` · **P1** · origen §7 CN-33 · documental + producto

**Como** Apta **quiero** cumplir las obligaciones del Reglamento de IA que ya son exigibles **para** no acumular una infracción de transparencia mientras el resto del calendario se retrasa.

Calendario verificado: **art. 4 (alfabetización) aplicable desde el 2/2/2025** — alcanza a proveedores **y a responsables del despliegue**. **Art. 50 (transparencia) aplicable desde el 2/8/2026: ya está en vigor.** El alto riesgo está retrasado (Anexo III a 2/12/2027).

Clasificación razonada: el generador de mesociclos **no encaja en ningún supuesto del Anexo III** (no es empleo, ni educación reglada, ni crédito, ni servicios esenciales, ni dispositivo médico), y el semáforo de aptitud es **determinista, no IA**. Conclusión: **riesgo limitado**, arts. 4 y 50. *Conviene no precipitarse ante el ruido comercial de este mercado.*

```gherkin
Escenario: documento de clasificación
  Entonces existe un documento de una página con la clasificación razonada y su fecha

Escenario: marca de contenido generado
  Entonces todo mesociclo generado muestra "Propuesta generada con IA · revisada por [entrenador]"
  de forma visible, no en un pie

Escenario: formación del art. 4
  Entonces queda constancia de la formación en alfabetización en IA de quien opera el sistema

Escenario: revisión de la clasificación
  Entonces si alguna vez el mesociclo llega al socio sin revisión humana,
  se reabre la clasificación y el análisis del art. 22 RGPD

Escenario: lo que ya cumple
  Entonces se conserva el diseño actual: DRAFT por defecto, approvedByUserId,
  y el mesociclo no expuesto al socio en ningún endpoint
```

## E10-18 · HTTPS forzado en producción y `keychainAccessible` en SecureStore

`XS` · **P1** · origen §7 CN-28, CN-29, §9.2 A20, A28

**Como** socio **quiero** que mis datos de salud no viajen en claro **para** que un despliegue mal configurado no los exponga.

`api/client.ts:22-34`: `devApiUrlFallback()` construye `http://` y `API_URL` cae ahí si faltan `EXPO_PUBLIC_API_URL` y `extra.apiUrl`. **En un build de producción con la variable mal configurada, la app enviaría credenciales y datos de salud en claro.** Y `setItemAsync` va sin opciones: en iOS la entrada puede incluirse en copias de seguridad y sincronizarse.

```gherkin
Escenario: fallback solo en desarrollo
  Entonces devApiUrlFallback solo se aplica con __DEV__ === true

Escenario: build de producción sin variable
  Entonces el build FALLA, en vez de caer a http://

Escenario: URL sin https en producción
  Entonces la app se niega a arrancar con un mensaje claro

Escenario: SecureStore
  Entonces setItemAsync se llama con keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY

Escenario: plugin declarado
  Entonces expo-secure-store figura en la sección plugins de app.json
```

## E10-19 · Enlaces legales y gestión de consentimientos dentro de la app

`S` · **P1** · origen §7 CN-26 · **⚠️ backlog de publicación (D-M2)**

**Como** socio que usa la app **quiero** poder leer la privacidad y gestionar mis consentimientos desde ahí **para** no tener que abrir la web para ejercer mis derechos.

**Ninguna pantalla enlaza a `/privacidad`, a condiciones, ni permite gestionar consentimientos: todo vive en la web.** Y la app **muestra composición corporal y fotos de progreso** sin ninguna capa informativa — solo comprueba `consentHealth`/`consentImages` para decidir qué pinta, que es correcto pero no informa. *La API y la lógica ya existen* (`updateMyConsentAction`): **es cablear la interfaz.**

```gherkin
Escenario: enlaces legales
  Entonces Perfil enlaza a política de privacidad y a condiciones

Escenario: gestión de consentimientos
  Entonces el socio puede ver y cambiar sus consentimientos de IA, imágenes y marketing desde la app
  Y la declaración de salud se muestra como informativa, no revocable (ver E10-03)

Escenario: capa informativa en evolución
  Entonces la pantalla de evolución explica qué dato es y con qué base se trata

Escenario: paridad
  Entonces el efecto de cambiar un consentimiento en la app es idéntico al de la web,
  con la misma auditoría
```

## E10-20 · Fotos de composición corporal fuera de la base de datos y cifrado por columna

`L` · **P2** · origen §7 CN-16 · ADR-005

**Como** socio **quiero** que mis fotos en ropa interior no estén en una columna de texto **para** que un volcado de base de datos no las entregue legibles.

`members/[id]/actions.ts:554` y `apps/mobile/src/utils/pick-image.ts:37` guardan `data:image/jpeg;base64,...` en columnas de texto de Postgres. Son fotos frontal, de perfil y de espalda, habitualmente en ropa interior. El esquema **ya reconoce** que el esquema `health.*` cifrado está pendiente.

```gherkin
Escenario: almacenamiento
  Entonces las fotos se guardan fuera de la base de datos, con acceso firmado y caducado

Escenario: cifrado por columna
  Entonces los campos clínicos sensibles se cifran por columna, según ADR-005

Escenario: migración
  Entonces las fotos existentes se migran y las columnas de texto quedan vacías

Escenario: acceso
  Entonces cada acceso a una foto sigue pasando por health-access.ts y queda en AuditLog

Escenario: borrado
  Entonces borrar una entrada de progreso borra también el fichero
```

## E10-21 · El módulo de fichajes se apaga, y se dice por escrito que Apta no presta registro de jornada

`S` · **P1** · origen §7 CN-18, §2.3 · **decisión D-P6 derivada: apagar solo fichajes**

**Como** Apta **quiero** retirar el módulo de fichajes **para** no dejar implícita una obligación legal que el producto no cumple.

El modelo y la lógica existen, pero **el widget está desmontado** y `crossCheckHours` tiene **0 consumidores**. La app **no ofrece registro de jornada** (art. 34.9 ET, RDL 8/2019), y el centro lo lleva por otro medio. Y si se reactivase tal cual **no cumpliría**: `TimeClockEntry` admite **una sola entrada y una sola salida por día**, lo que no permite pausas ni jornadas partidas —habituales con turno de mañana y tarde— y no distingue ordinarias de extraordinarias.

Un módulo aparcado indefinidamente **paga peaje en cada migración y en cada auditoría de permisos**. Y el control horario en España es obligación legal: o se hace bien y se vende, o se apaga. A medias es lo peor de los dos mundos.

**Decisión tomada**: se apaga.

```gherkin
Escenario: el módulo desaparece
  Entonces TimeClockWidget, timeclock-queries.ts, crossCheckHours y las acciones asociadas se retiran
  Y no queda ninguna entrada de menú ni ruta accesible

Escenario: datos existentes
  Entonces los TimeClockEntry se exportan y se conservan según la tabla de plazos (4 años, art. 34.9 ET)
  antes de retirar el modelo

Escenario: declaración por escrito
  Entonces las condiciones del servicio dicen expresamente que Apta NO presta registro de jornada
  y que el centro debe llevarlo por su propio medio

Escenario: cláusula laboral
  Entonces E10-15 se ajusta: deja de cubrir el fichaje y la verificación cruzada de horas

Escenario: si algún día vuelve
  Entonces el diseño contemplará pausas, jornada partida, inalterabilidad
  y acceso del trabajador y su representación, vigilando el RD pendiente
```

## E10-22 · Página `/cookies` con el inventario actual y regla en `AGENTS.md`

`XS` · **P3** · origen §7 CN-15

**Como** Apta **quiero** poder acreditar que no uso cookies que requieran consentimiento **para** que el día que alguien lo pregunte la respuesta esté escrita.

**Hoy es correcto y no hace falta banner**: las únicas cookies son la de sesión de Auth.js y `tz` (zona horaria), ambas técnicas. Verificado: **cero analítica, cero GTM, cero píxeles**. Lo que falta es dejarlo por escrito y protegerlo de un cambio futuro.

```gherkin
Escenario: inventario
  Entonces existe /cookies con las cookies actuales, su finalidad y su duración

Escenario: sin banner
  Entonces se explica por qué no hay banner: todas son técnicas

Escenario: regla de futuro
  Entonces AGENTS.md incorpora la regla: cualquier cambio que añada analítica
  debe traer CMP con "rechazar todo" al mismo nivel visual que "aceptar"

Escenario: coherencia con E9-09
  Entonces si se instala analítica sin cookies, el inventario se actualiza en el mismo cambio
```

---

# E11 · Mapa y datos de captación

> **El mapa hoy no puede sostener tres de sus seis métricas ante dirección.** No es un problema de cartografía: es del dato que lo alimenta. Y conviene decir antes de optimizar que **el rendimiento actual no es un problema**: 31 polígonos, ~177 vértices, ~5 KB. `L.svg()` es la elección correcta a esta escala.

## E11-01 · El mapa filtra estado de socio y de lead

`S` · **P1** · origen §6 M1

**Como** dirección **quiero** que el mapa cuente solo socios vivos y leads sin convertir **para** no ver oscuro un barrio del que se me está yendo la gente.

`Member`: se cuentan **todos** los estados, incluidos cancelados, congelados y prospectos — un barrio con fuga masiva sigue pintándose oscuro. `Lead`: se cuentan todos, incluidos los cerrados con `convertedMemberId`, así que **la misma persona se cuenta como lead y como socio** y la etiqueta "leads sin convertir" es falsa.

```gherkin
Escenario: socios
  Entonces la agregación excluye CANCELLED y PROSPECT por defecto

Escenario: leads
  Entonces excluye los cerrados y los que tienen convertedMemberId

Escenario: opción explícita
  Entonces existe un parámetro memberStates para poder pedir lo contrario,
  que es lo que necesitará la métrica de fuga (E11-09)

Escenario: tests
  Entonces se rehacen los tests de barrio-map.test.ts que asumen la fórmula actual de conversión
```

## E11-02 · Clasificación por cuantiles y leyenda con los siete cortes

`M` · **P1** · origen §6 M2

**Como** dirección **quiero** una escala que reparta los barrios **para** que un barrio dominante no achate el mapa entero.

Con una distribución realista, el reparto medido es: escalón 0 → **11 barrios**, escalón 1 → 6, escalón 2 → 1, escalones 3-5 → **0**, escalón 6 → 1. **Un solo barrio dominante achata la escala.** Es el problema clásico que resuelven cuantiles o Jenks.

```gherkin
Escenario: función pura
  Entonces existe classify(values, kind, classes) con su colorForValueClassified

Escenario: por métrica
  Entonces socios, leads y oportunidad usan cuantiles (distribuciones sesgadas)
  Y conversión y distancia usan intervalo igual (ya acotadas)
  Y tendencia usa divergente simétrica

Escenario: leyenda
  Entonces la leyenda muestra los siete cortes, no dos etiquetas de mínimo y máximo:
  con cuantiles los escalones no son equidistantes y una leyenda de dos extremos mentiría

Escenario: reparto
  Entonces la distribución sesgada de la prueba se reparte aproximadamente 3/3/3/3/3/2/2
  en vez de 11/6/1/0/0/0/1
```

## E11-03 · El mapa es honesto cuando no hay centros situados

`S` · **P1** · origen §6 M3

**Como** dirección **quiero** que el mapa me diga cuándo no puede calcular algo **para** no tomar una decisión de inversión sobre un cero inventado.

`dist: nearest?.km ?? 0` y `opp: nearest ? … : 0` con `Center.lat/lng` opcionales: **el mapa pinta toda la ciudad a 0,0 km**. La tarjeta de foco lo advierte; el mapa, la leyenda y el ranking, no. Y las coordenadas **se teclean a mano en el alta** y **no hay pantalla para corregirlas después**: un dedo gordo en un signo mueve el centro de continente.

```gherkin
Escenario: sin centros situados
  Entonces distancia y oportunidad son null, no 0
  Y sus pastillas se deshabilitan con explicación
  Y el relleno es un gris neutro de "sin dato", con entrada propia en la leyenda

Escenario: validación en el alta
  Entonces lat debe estar en [-90,90] y lng en [-180,180]
  Y se avisa si el punto cae a más de X km del resto de centros de la organización

Escenario: edición posterior
  Entonces existe pantalla para corregir las coordenadas de un centro ya creado

Escenario: con centros situados
  Entonces el comportamiento actual no cambia
```

## E11-04 · Vista tabla accesible sincronizada con el mapa

`M` · **P1** · origen §6 M4

**Como** usuario sin ratón, o con pantalla estrecha **quiero** una vía no cartográfica al dato **para** poder usar el módulo.

**Bajo 1024 px se pierden ranking y tarjeta de foco; bajo 768 px se pierden además leyenda y selector de ciudad**: queda **un mapa de colores sin escala**. Un mapa sin leyenda no es un mapa degradado: **es un mapa incorrecto**. Y los polígonos son `<path>` con handlers de ratón, no focusables, sin `role` ni `tabindex`.

```gherkin
Escenario: tabla real
  Entonces existe un <table> con <caption> que declara fuente y aproximaciones,
  <th scope="col"> ordenables y las seis métricas a la vez

Escenario: siempre en el DOM
  Entonces la tabla está siempre presente, y visible por defecto bajo 1024 px

Escenario: sincronía
  Entonces seleccionar una fila enfoca el barrio en el mapa, y al revés

Escenario: región viva
  Entonces el cambio de foco se anuncia con aria-live polite

Escenario: contenedor
  Entonces el mapa declara role="application" y aria-label

Escenario: e2e
  Entonces se actualiza el selector span.tz-nums de mapa-barrios.spec.ts,
  que esta historia rompe al sustituir la lista de botones por una tabla
```

## E11-05 · Pie de cobertura: cuántos socios no se están representando

`S` · **P2** · origen §6 M7

**Como** dirección **quiero** saber cuánta gente no aparece en el mapa **para** saber cuánto vale lo que estoy mirando.

El `FROM "PostalCodeArea"` descarta cualquier CP que no esté entre las 31 filas sembradas: **un socio de Madrid con CP 28001 no sale en ningún sitio**. No hay contador: **el mapa no dice cuánta gente no está enseñando.** Y la nota de geometría solo advierte de una de las dos aproximaciones encadenadas: la correspondencia CP→barrio es un "mejor esfuerzo" reconocido, **y encima la geometría es Voronoi, no barrio real**.

```gherkin
Escenario: cobertura
  Entonces el pie dice cuántos socios y leads se representan y cuántos no,
  distinguiendo "sin código postal" de "fuera de cobertura"

Escenario: redacción
  Entonces con el ejemplo del informe diría:
  "Se representan 412 de 468 socios: 31 sin código postal y 25 en zonas fuera de cobertura"

Escenario: las dos aproximaciones
  Entonces la nota de geometría declara tanto la correspondencia CP→barrio
  como que la geometría es una teselación, no el barrio real
```

## E11-06 · Contraste, daltonismo y modo oscuro del mapa

`S` · **P2** · origen §6 M8

**Como** usuario con protanopia o deuteranopia **quiero** poder leer la métrica de tendencia **para** que el mapa me sirva.

**La rampa secuencial está bien**: L\* monótona, intrínsecamente segura para daltonismo. **La divergente no**: los pares simétricos tienen prácticamente la misma claridad (ΔL\* de 1,9, 4,4 y **0,8**), y la única señal que los separa es el eje rojo-verde — **exactamente el que pierde el ~8 % de los hombres**. Y las etiquetas se pintan con tinta fija: sobre el escalón 6, el nombre da **2,08:1** y la cifra **1,12:1**. Lo llamativo: **`readableMetricInk()` ya resuelve este problema** y solo se usa en la tarjeta de foco.

En oscuro hay dos fallos reales: `readableMetricInk` devuelve un literal que sobre la tarjeta oscura da **1,07:1 — invisible**; y el selector de teselas del mapa de barrios no tiene variante oscura, así que **gana el filtro invertido pensado para otra pantalla**.

```gherkin
Escenario: etiquetas del mapa
  Entonces readableMetricInk() se usa también en las etiquetas: escalones 0-3 tinta oscura,
  4-6 tinta hueso
  Y el peor contraste sube de 1,12:1 a más de 7:1

Escenario: tinta por token
  Entonces RAMP_FALLBACK_INK deja de ser literal y pasa a var(--color-brand-text)

Escenario: divergente
  Entonces ningún par simétrico tiene ΔL* menor que 12
  Y se añade redundancia no cromática: patrón SVG o dashArray distinto en los negativos

Escenario: modo oscuro
  Entonces existe [data-theme="dark"] .tz-barrio-map .leaflet-tile propio,
  y el mapa deja de heredar el filtro de la tarjeta del panel
```

## E11-07 · Filtros de periodo y estado, con el estado en la URL

`M` · **P2** · origen §6 M6

**Como** dirección **quiero** filtrar el mapa por periodo **para** poder preguntar "leads de este trimestre" y no solo "leads desde siempre".

`getPostalCodeMapData` **recibe el rango y nunca lo usa**; `/mapa-barrios` ni siquiera lee `searchParams`. El mapa es siempre acumulado histórico, **no comparable con el resto del panel**, y su estado **no es enlazable ni compartible** — a diferencia de `/dashboard`, cuyo estado vive en la URL por decisión explícita.

```gherkin
Escenario: parámetros
  Entonces /mapa-barrios acepta ciudad, metrica, range, estado y centerId en la URL

Escenario: periodo aplicado
  Entonces el rango recibido se propaga a la agregación

Escenario: enlace desde el panel
  Entonces el enlace del dashboard encadena su rango, manteniendo prefetch={false}

Escenario: compartible
  Entonces la URL se puede copiar y reproduce la misma vista
```

## E11-08 · Geometría real de barrios (TopoJSON) con respaldo a la teselación

`L` · **P2** · origen §6 M5

**Como** dirección **quiero** ver barrios de verdad **para** que el mapa se parezca a la ciudad.

Es la mejora que más precisión aporta por menos código: **la vista ya trabaja sobre anillos**. Fuentes: secciones censales del INE o los portales de datos abiertos municipales (Zaragoza y Santander los publican). Efecto colateral: **elimina de golpe el acantilado de rendimiento** de `tessellate()`, que es O(n²) y síncrono en el hilo principal (1.200 barrios → 150 ms; 2.500 → 603 ms).

```gherkin
Escenario: preproceso
  Entonces la geometría se simplifica offline con mapshaper a TopoJSON, con quantization 1e5

Escenario: almacenamiento
  Entonces se guarda en PostalCodeArea.ring o se sirve por GET /api/geo/[ciudad] con revalidate largo
  Y nunca se manda al cliente una ciudad que no se está mirando

Escenario: presupuesto
  Entonces cada ciudad pesa 80 KB gz o menos

Escenario: cliente
  Entonces topojson-client.feature() sustituye a tessellate(points)

Escenario: respaldo
  Entonces tessellate() se conserva para ciudades sin geometría publicada
  Y la nota de la leyenda se condiciona a cuál se está usando

Escenario: e2e
  Entonces se revisa mapa-barrios.spec.ts, que cuenta .leaflet-overlay-pane path
```

## E11-09 · Métrica de fuga por barrio desde `cancelledAt`

`M` · **P2** · origen §6, §6.5

**Como** dirección **quiero** ver en qué barrios se me va la gente **para** poder actuar donde duele.

*"¿Qué barrios tienen fuga?"* **no se puede responder hoy**, y sin embargo `Member.cancelledAt` **ya está guardado**: es el dato con mejor relación valor/coste de todo el módulo. `trend` mide altas, no bajas.

```gherkin
Escenario: métrica nueva
  Entonces existe una métrica "bajas" por barrio y periodo, calculada desde cancelledAt

Escenario: cota superior
  Entonces el recuento tiene cota superior de fecha:
  hoy _lib/dashboard.ts cuenta bajas con gte sin tope, y una baja programada a futuro
  ya cuenta como baja del mes

Escenario: comparación
  Entonces se puede comparar altas y bajas del mismo periodo sobre el mismo plano

Escenario: escala
  Entonces usa la clasificación de E11-02
```

## E11-10 · `prefers-reduced-motion` en los vuelos y objetivos táctiles de 44 px

`S` · **P2** · origen §6 M9, M10

**Como** usuario sensible al movimiento **quiero** que el mapa no vuele **para** poder usarlo sin marearme.

El bloque de `globals.css` anula animaciones **CSS**, pero `panTo` y `flyTo` son **animación JS de Leaflet** y siguen ejecutándose. Y los objetivos táctiles están por debajo de 44 px: métricas ≈35, `MapButton` ≈34, botones de ciudad ≈31. Además, en táctil `mouseover` dispara al tocar y `mouseout` **no llega nunca**: el barrio se queda señalado indefinidamente.

```gherkin
Escenario: movimiento reducido
  Entonces con prefers-reduced-motion se usa setView con animate:false en vez de panTo y flyTo

Escenario: objetivos táctiles
  Entonces métricas, botones de ciudad y MapButton alcanzan 44 px

Escenario: táctil
  Entonces con pointer:coarse se usa solo click como conmutador de foco,
  y un segundo toque desenfoca

Escenario: tooltip
  Entonces el polígono lleva bindTooltip, para no depender de la tarjeta de foco

Escenario: e2e
  Entonces se revisan las colisiones de layoutLabels, que cambian al crecer las cajas
```

---

# E12 · Higiene técnica y deuda

## E12-01 · Apagar la rutina de IA falsa del portal

`XS` · **P0** · origen §1.1 W-01, §2.3 · **decisión D-P6: se apaga**

**Como** Apta **quiero** retirar una funcionalidad que finge ser IA **para** que el segundo socio que la pida no descubra el truco.

`portal/evolucion/workout-request-button.tsx` deja al socio pedir una rutina y promete *"tu entrenador la confirmará pronto"*. Llega a `buildMockRoutine`, que devuelve **siempre las mismas tres sesiones** (Lunes/Miércoles/Viernes, "Movilidad 10'…"). **La pantalla que confirma no existe montada en ningún sitio**: `grep -rn "WorkoutProgramList"` devuelve **una sola referencia: su propia definición**. Remate: el botón se deshabilita si hay una en `DRAFT`, y como nadie puede sacarla de ahí, **el socio pierde la funcionalidad de forma permanente tras el primer clic**. Y la notificación lleva a una ficha que ya no tiene esa pestaña: el director aterriza sin nada que hacer.

Encima duplica el generador real que sí existe. **Coste de quitarlo: una hora.**

```gherkin
Escenario: la tarjeta desaparece
  Entonces la tarjeta y RequestWorkoutButton se retiran de portal/evolucion

Escenario: el emisor
  Entonces requestWorkoutProgram y buildMockRoutine se borran

Escenario: los DRAFT existentes
  Entonces se resuelven o se archivan, y ningún socio queda con el botón bloqueado

Escenario: la notificación
  Entonces deja de generarse, y las pendientes se marcan resueltas

Escenario: código aparcado
  Entonces workout-panel.tsx y workout-actions.ts se retiran también
```

## E12-02 · Quitar "responde al instante" del chat, o remontar el lado del personal

`XS` · **P1** · origen §1.1 W-02 · **decisión D-P6: se quita la promesa; el chat NO se apaga**

**Como** socio **quiero** que el chat no me prometa una respuesta inmediata que nadie va a dar **para** no escribir a un buzón del que nadie se entera.

`portal/layout.tsx:61` monta el chat en todas las pantallas del portal y `floating-chat.tsx:145` rotula literalmente **"En línea · responde al instante"**. **Ningún componente del lado del personal lee la conversación**: `StaffChatThread` está exportado y sin montar, `src/lib/chat.ts` **no crea ninguna `Notification`**, y la app móvil no tiene chat. Verificado: **cero push, cero WhatsApp, y ninguna plantilla de "mensaje nuevo"**. Un buzón del que nadie se entera **crea una expectativa y la incumple: es peor que no tenerlo**.

**Decisión D-P6**: el chat se queda; lo que se va es la promesa.

```gherkin
Escenario: mínimo inmediato
  Entonces el rótulo deja de decir "responde al instante"
  Y dice cuándo se responde de verdad

Escenario: el lado del personal
  Entonces se remonta StaffChatThread, accesible desde la ficha del socio

Escenario: aviso al personal
  Entonces un mensaje nuevo genera Notification para el destinatario correcto
  Y existe plantilla de email de mensaje nuevo

Escenario: ámbito de recepción
  Entonces recepción deja de ver todos los chats de forma permanente,
  y su acceso se acota a lo que necesita para atender

Escenario: ruta muerta
  Entonces portal/chat/actions.ts deja de revalidar /portal/chat, que es solo un redirect
```

## E12-03 · El plan y la biblioteca ONLINE no se venden desde la app

`XS` · **P2** · origen §2.3 · **decisión D-P6 (no se apaga) + D-S3 (no se vende en la app)**

**Como** Apta **quiero** que el plan ONLINE no se ofrezca desde la app **para** no caer bajo la compra in-app obligatoria de Apple.

`src/lib/online-queries.ts` lee `OnlineWorkout`; los únicos escritores del repositorio son el seed y su `deleteMany`: **no hay ninguna pantalla para dar de alta un vídeo**. Un gimnasio puede crear y vender un plan ONLINE y **no puede entregarlo**.

**Decisión D-P6**: no se retira del catálogo. **Decisión D-S3**: no se vende desde la app. Queda por resolver la entrega, que es lo que hace que el plan sea vendible de verdad.

```gherkin
Escenario: catálogo de la app
  Entonces los planes de tipo ONLINE no aparecen ni se enlazan desde la app (ver HU-ST-10)

Escenario: catálogo web
  Entonces siguen disponibles

Escenario: entrega
  Entonces existe una pantalla para dar de alta contenido online,
  o el plan se marca como "pendiente de contenido" y no se puede activar sin él

Escenario: aviso al centro
  Entonces al crear un plan ONLINE se advierte de que hace falta subir contenido para entregarlo
```

## E12-04 · `SERVICE_LABEL` único

`S` · **P2** · origen §1.1 W-08

**Como** socio **quiero** que mi bono se llame igual en todas las pantallas **para** no creer que tengo dos productos distintos.

`SERVICE_LABEL` está redefinido **siete veces con cuatro nombres para lo mismo** — más `BALANCE_LABEL` en la app, que es la octava. **El socio ve "Entrenamiento personal" en su portal y recepción ve "Personal Training" en su ficha, para el mismo bono.**

```gherkin
Escenario: fuente única
  Entonces existe una sola definición, consumida por las ocho superficies actuales

Escenario: nombres
  Entonces se fija un único nombre por modalidad, en castellano

Escenario: la app
  Entonces BALANCE_LABEL desaparece y consume la misma fuente

Escenario: regresión
  Entonces existe un test que comprueba que no hay más de una definición
```

## E12-05 · Un solo `dashboard-queries`

`S` · **P1** · origen §1.2 M-04, §8 M-11, §9.2 A19

**Como** dirección **quiero** que el panel diga el mismo número en la web y en la app **para** no tener dos verdades sobre mi propio negocio.

Medido sobre la misma organización el mismo día: **morosos 8 en web y 9 en móvil** (web usa `Member.state = 'DELINQUENT'`; móvil cuenta `Payment` en `PENDING|FAILED` **sin ventana temporal**). Ingresos del mes: web prorratea al mismo día del mes, móvil compara contra **agosto entero**. Y ocupación 7 % en web frente a asistencia 91 % en móvil: **dos métricas distintas, ambas presentadas como *la* salud de la agenda**. Además `_lib/dashboard.ts:26` cuenta bajas **sin cota superior**: una baja programada a futuro ya cuenta como baja del mes.

```gherkin
Escenario: borrar el duplicado
  Entonces _lib/dashboard.ts (79 líneas) desaparece
  Y el endpoint móvil sirve getKpiTiles() y getRevenueSeries()

Escenario: morosos
  Entonces las dos superficies dan el mismo número

Escenario: comparación de ingresos
  Entonces las dos prorratean al mismo día del mes

Escenario: ocupación
  Entonces si el móvil necesita otra métrica, tiene OTRO NOMBRE, no el mismo con otro número

Escenario: bajas
  Entonces el recuento de bajas tiene cota superior de fecha

Escenario: ámbito
  Entonces el móvil resuelve el ámbito con centerScopeFor, no con claims.centerId:
  hoy una dirección imputada a dos centros ve uno en la app y dos en la web
```

## E12-06 · Ocupación y no-show del panel calculados por ocurrencia

`M` · **P1** · origen §8 W-08

**Como** dirección **quiero** que la ocupación cuente sesiones reales **para** no ver ocupaciones por encima del 100 %.

`dashboard-queries.ts` filtra por `ClassSession.date`, que en una serie recurrente es **solo la fecha base**, y cuenta las reservas de la fila entera sin acotar por `occurrenceDate` — mientras el resto de la aplicación usa `expandOccurrences`. Consecuencias: una serie creada hace 6 meses **no cuenta nunca**; una cuya fecha base cae en la ventana aporta su aforo **una vez** y **todas** sus reservas históricas → **ocupación por encima del 100 %**; y la ocupación por día de la semana imputa una serie "todos los laborables" **a un solo día**. Latente en la demo, pero la funcionalidad existe y está cubierta por e2e.

```gherkin
Escenario: serie recurrente
  Dado una serie semanal de 8 semanas con aforo 10
  Entonces la ocupación se calcula por ocurrencia dentro de la ventana

Escenario: serie antigua
  Entonces una serie cuya fecha base está fuera de la ventana sí cuenta sus ocurrencias dentro

Escenario: tope
  Entonces la ocupación nunca supera el 100 %

Escenario: por día de la semana
  Entonces una serie de lunes a viernes se imputa a los cinco días, no a uno

Escenario: no-show
  Entonces la tasa de no-show se calcula sobre las mismas ocurrencias
```

## E12-07 · Borrar `api/mobile/v1/portal/billing/` y el wrapper `createCheckoutSession`

`XS` · **P3** · origen §1.2 M-09, §1.1 W-09

**Como** equipo **quiero** borrar el código sin consumidores **para** no mantener ni probar lo que nadie usa.

Recorridos los 51 endpoints móviles, **los únicos dos sin consumidor** son `POST /portal/billing/checkout` y `POST /portal/billing/portal`. Y `createCheckoutSession` es una línea que llama a `createMemberCheckout`, con un solo consumidor. Además `/portal/plan`, `/portal/comprar` y `/portal/chat` tienen **doble redirect** (308 en `next.config.ts` **y** un `page.tsx` con `redirect()`), así que esos `page.tsx` son inalcanzables, y `rbac.ts:403-405` sigue declarando `OFF_NAV_TITLES` para esas tres rutas muertas.

**Cuidado**: `/portal/billing/portal` se usará si se implementa E5-01 y HU-ST-17 desde la app. Comprobar antes de borrar.

```gherkin
Escenario: comprobación previa
  Entonces se verifica que E5-01 y HU-ST-17 no necesitan esos endpoints
  Y si los necesitan, se conservan y se les da consumidor

Escenario: borrado
  Entonces se retiran los endpoints sin consumidor confirmado

Escenario: wrapper
  Entonces createCheckoutSession se elimina y su consumidor llama directamente a createMemberCheckout

Escenario: redirects
  Entonces se elimina uno de los dos redirects de /portal/plan, /portal/comprar y /portal/chat
  Y OFF_NAV_TITLES deja de declarar esas tres rutas
```

## E12-08 · `/me` y notificaciones comprueban plataforma activa

`XS` · **P2** · origen §8 M-12, §9.2 A21

**Como** Apta **quiero** que una organización suspendida por impago no siga sirviendo desde la app **para** que el muro de pago signifique lo mismo en las dos superficies.

`/me`, `/notifications` y `/notifications/[id]/read` usan `requireApiSession` en vez de `requireApiRole`, y `assertPlatformOperational` solo vive dentro del segundo.

```gherkin
Escenario: organización suspendida
  Entonces esos tres endpoints responden con el estado de plataforma no operativo

Escenario: la app lo explica
  Entonces la app muestra que el centro tiene el servicio suspendido, sin pantalla en blanco

Escenario: organización activa
  Entonces nada cambia
```

## E12-09 · Resolución única de destino de notificación entre web y app

`S` · **P2** · origen §1.2 M-12, §9.2 A24

**Como** usuario **quiero** que tocar un aviso me lleve al sitio correcto **para** no aterrizar en una lista o en una pantalla de otro rol.

Los dos resolutores son **parcialmente disjuntos**: un aviso de `Lead` lleva a la ficha en web y a la lista **descartando el id** en móvil; uno de `Member` lleva a la ficha en web y a **una pantalla de entrenador** en móvil, donde recepción y dirección no entran; `MemberNoShowStreak` no tiene acción en móvil; y `Booking`, `ClassSession`, `Subscription` y `Payment` no tienen enlace en web.

```gherkin
Escenario: módulo compartido
  Entonces existe una resolución única entityType → destino, consumida por las dos superficies

Escenario: cobertura
  Entonces los siete tipos de entidad tienen destino en ambas

Escenario: por rol
  Entonces el destino respeta el rol de quien toca el aviso

Escenario: id preservado
  Entonces ningún destino descarta el identificador de la entidad
```

## E12-10 · Paginación real en `/members`

`S` · **P1** · origen §2.3

**Como** dirección de un centro con más de 300 socios **quiero** verlos todos **para** no perder veinte filas en silencio.

`members-queries.ts:32` tiene `take: 300` **fijo**. Un centro con 320 socios **pierde 20 filas sin ningún aviso**.

```gherkin
Escenario: paginación en servidor
  Entonces /members pagina en servidor, con el estado en la URL

Escenario: orden
  Entonces el orden también se resuelve en servidor

Escenario: recuento
  Entonces la interfaz muestra el total real de socios del ámbito

Escenario: sin truncado silencioso
  Entonces no queda ningún take fijo que descarte filas sin decirlo
```

## E12-11 · `/trainer` accesible para dirección

`XS` · **P2** · origen §2.3

**Como** director **quiero** ver el panel de mi propio equipo **para** saber cómo va la gente por la que pago.

`/trainer` sigue restringido a `TRAINER`: **dirección no puede ver el panel de su propio equipo**. Es un bug de negocio.

```gherkin
Escenario: dirección de centro
  Entonces accede a /trainer para los entrenadores de su ámbito

Escenario: dirección de organización
  Entonces accede para toda la organización

Escenario: datos de salud
  Entonces el acceso respeta la matriz de salud: dirección ve el panel, no lo que no le toca

Escenario: entrenador
  Entonces sigue viendo el suyo, como hoy
```

## E12-12 · Consentimientos revocables desde el panel de staff

`S` · **P2** · origen §2.3

**Como** socio que llama al centro **quiero** que recepción pueda retirar mi consentimiento de imágenes **para** ejercer mi derecho por el canal que uso.

Los consentimientos se escriben en el alta y **el panel de staff es de solo lectura**. Un socio que quiere retirar el consentimiento de imágenes hoy no puede hacerlo por teléfono. Es RGPD, no es opcional.

```gherkin
Escenario: revocación por staff
  Entonces el staff autorizado puede retirar un consentimiento accesorio a petición del socio

Escenario: traza
  Entonces queda en AuditLog quién lo retiró, cuándo y a petición de quién

Escenario: la declaración de salud
  Entonces no es revocable por esta vía: es condición del servicio (ver E10-03),
  y su retirada implica la baja

Escenario: efecto inmediato
  Entonces retirar el consentimiento de IA impide el uso de datos clínicos en la generación,
  igual que si lo hiciera el socio
```

## E12-13 · Alinear documentación y código

`S` · **P2** · origen §8 W-10, W-16, M-08, §2.3

**Como** quien diseñe el próximo cambio **quiero** que el documento de reglas describa el código real **para** no partir de una premisa falsa.

Tres desviaciones confirmadas: **`RB-RES-008`** documentada como *"el centro no opera en domingo"* mientras `isOperatingDay` devuelve **siempre `true`** (y la comprobación de `portal-queries.ts` quedó muerta); **`RB-PAGO-008`** da el ajuste de saldo al entrenador y el código se lo quita —el cambio fue deliberado y hasta hay un e2e que lo prueba, pero **el documento nunca se actualizó**—; y **`RB-AGENDA-009`** no existe: la ventana de descarte del staff no está documentada en ningún sitio.

```gherkin
Escenario: RB-RES-008
  Entonces o se restaura la regla de domingo, o se documenta que ya no aplica
  Y el código muerto de portal-queries.ts se retira

Escenario: RB-PAGO-008
  Entonces el documento refleja que el ajuste de saldo no es del entrenador

Escenario: RB-AGENDA-009
  Entonces se documenta la ventana única del centro (ver E2-04)

Escenario: estado del documento
  Entonces REGLAS_NEGOCIO_ESTADO_IMPLEMENTACION.md se pone al día con estas tres

Escenario: regla de futuro
  Entonces un cambio que altere una regla documentada actualiza el documento en el mismo cambio
```

## E12-14 · `OUR_ERROR` deja de sumar a la racha de faltas del socio

`XS` · **P2** · origen §8 W-17

**Como** socio **quiero** que un error del centro no cuente como falta mía **para** que no me abran una tarea comercial por algo que no hice.

`no-show.ts:42`: `NO_SHOW_REASONS_WITHOUT_NOTICE = ["FORGOT", "OUR_ERROR"]`. Una sesión mal agendada **por el centro** suma a la racha que abre una tarea comercial **contra el cliente**: dirección recibe *"Fulano: 3 faltas seguidas sin avisar"* cuando **las tres las provocó el centro**. Código y documento coinciden; la regla resultante es absurda.

```gherkin
Escenario: error del centro
  Entonces OUR_ERROR no suma a la racha

Escenario: olvido del socio
  Entonces FORGOT sigue sumando

Escenario: rachas existentes
  Entonces las rachas se recalculan excluyendo los OUR_ERROR pasados

Escenario: documentación
  Entonces la regla queda documentada con este comportamiento
```

## E12-15 · `override` para `mysql2` y limpieza de dependencias muertas

`XS` · **P3** · origen §2.4, §6 M18, §3 A.17

**Como** equipo **quiero** el árbol de dependencias limpio **para** que `npm audit` diga algo cuando diga algo.

`npm audit`: 2 vulnerabilidades (1 alta) por `mysql2` arrastrado transitivamente por Prisma. El proyecto usa el adaptador de Postgres, así que **`mysql2` no se ejecuta**, pero conviene fijar un `override`. Y `react-leaflet@5` está en `dependencies` **y no se importa en ningún fichero**. Más los cinco SVG de plantilla de Next que quedan en `public/`.

```gherkin
Escenario: override
  Entonces package.json fija un override para mysql2, o se actualiza Prisma cuando haya fix no disruptivo

Escenario: dependencia muerta
  Entonces react-leaflet se retira de dependencies

Escenario: plantilla de Next
  Entonces los cinco SVG de plantilla se borran de public/

Escenario: audit limpio
  Entonces npm audit deja de reportar la vulnerabilidad alta
```

## E12-16 · Corregir el texto de `/billing` sobre la pasarela

`XS` · **P3** · origen §2.3

**Como** cliente **quiero** que la aplicación no me diga que algo "queda fuera de esta entrega" **para** no dudar de lo que estoy viendo en esa misma pantalla.

`billing/page.tsx:40` sigue diciendo que la pasarela de pago online "queda fuera de esta entrega" **con el checkout de Stripe ya en esa misma página**. Un cliente lo lee.

```gherkin
Escenario: texto corregido
  Entonces el texto describe lo que la pantalla hace de verdad

Escenario: sin Stripe conectado
  Entonces explica cómo conectarlo, con enlace, en vez de decir que no está previsto

Escenario: barrido
  Entonces se revisa que no queden otros textos que describan un alcance ya superado
```

## E12-17 · WhatsApp `wa.me` con mensaje pre-escrito

`S` · **P1** · origen §2.3 · **decisión D-P3: solo España, sin reservas**

**Como** recepción **quiero** escribir por WhatsApp desde la aplicación **para** usar el canal que el mercado español usa de verdad.

`whatsapp` y `twilio` **no aparecen ni una vez** fuera de `docs/`. Versión mínima que da el 80 %: **no integrar la API de WhatsApp Business** (verificación de negocio, plantillas aprobadas, coste por conversación). Botón "abrir WhatsApp" con `wa.me/` y mensaje pre-redactado. **Días, no semanas, y cero infraestructura.**

```gherkin
Escenario: tres puntos de entrada
  Entonces hay botón de WhatsApp en la alerta de retención, en el recibo fallido y en el lead sin responder

Escenario: mensaje pre-redactado
  Entonces el mensaje viene escrito con el nombre del socio y el motivo, editable antes de enviar

Escenario: teléfono
  Entonces se compone con el prefijo correcto y se avisa si el socio no tiene teléfono

Escenario: nada de API
  Entonces se usa wa.me, sin integración de WhatsApp Business

Escenario: traza
  Entonces queda registrado que se abrió el contacto, no el contenido de la conversación
```

---

# E13 · Derivadas de las decisiones del §11

> Tres historias que no estaban en el índice del informe y que **nacen de las respuestas** de la sesión de negocio.

## E13-01 · Recorte de la app móvil a socio y entrenador

`M` · **P1** · **decisión D-M4** · origen §2.3, §11.1

**Como** Apta **quiero** que la app nativa sirva solo a socio y entrenador **para** dejar de mantener y probar una app de ocho roles con 53 endpoints detrás.

La app declara pestañas para **los ocho roles**, incluidos soporte de plataforma y RRHH: *se ha construido una app nativa para que el soporte de Apta administre organizaciones desde el móvil y para que RRHH gestione plantilla desde el móvil*. Recortar **reduce** superficie, no la añade — es compatible con el alcance congelado.

**Decisión D-M4**: en la **app móvil**, solo `MEMBER` y `TRAINER`. En la **web** se conservan íntegros dirección de plataforma (Apta), dirección de organización y director de centro.

```gherkin
Escenario: roles de la app
  Entonces la app solo declara pestañas y navegación para MEMBER y TRAINER

Escenario: acceso de otros roles
  Cuando alguien con otro rol inicia sesión en la app
  Entonces se le explica que su trabajo se hace desde la web, con el enlace
  Y no se le deja una rejilla vacía, que es lo que hoy ve PLATFORM_ADMIN

Escenario: endpoints retirados
  Entonces se retiran /api/mobile/v1/admin/* y /api/mobile/v1/staff/*
  Y los endpoints que quedan sin consumidor tras el recorte

Escenario: la web no cambia
  Entonces PLATFORM_ADMIN, OWNER y CENTER_DIRECTOR conservan toda su superficie en la web

Escenario: matriz de permisos
  Entonces la tabla de la app se reduce a los dos roles que conserva
  Y el test de paridad (E7-09) se ajusta a ese alcance

Escenario: pruebas
  Entonces la batería base cubre dos roles en vez de ocho, y T11 se ajusta
```

## E13-02 · La app respeta `User.theme`

`XS` · **P2** · **decisión D-M5** · origen §4, §11.1

**Como** socio **quiero** que la app use el tema que ya elegí en la web **para** no ver oscuro en el móvil lo que puse en claro en el portátil.

`theme.ts:186-189` decide solo con `useColorScheme()`, ignorando `User.theme`, que sí manda en la web. Quien necesita piel clara por sensibilidad al contraste **solo puede cambiar el ajuste de todo el sistema operativo**.

**Decisión D-M5**: la app **lee** la preferencia del servidor. **No se añade control en Perfil**: eso sería pantalla nueva y queda fuera del alcance congelado.

```gherkin
Escenario: preferencia explícita
  Dado un usuario con User.theme en "claro"
  Cuando abre la app
  Entonces la app se pinta en claro, aunque el sistema esté en oscuro

Escenario: preferencia "sistema"
  Entonces la app sigue useColorScheme(), como hoy

Escenario: el dato viaja
  Entonces /me incluye la preferencia de tema

Escenario: cambio en la web
  Cuando el usuario cambia el tema en la web
  Entonces la app lo refleja en el siguiente arranque o refresco de /me

Escenario: sin control nuevo
  Entonces Perfil NO gana ningún selector: queda documentado que el tema se cambia en la web
```

## E13-03 · Titularidad de la metodología documentada en el contrato

`XS` · **P1** · **decisión D-P4** · origen §11.3 · documental

**Como** Apta **quiero** que conste por escrito que la metodología es mía **para** poder venderla al segundo cliente sin discusión.

`src/lib/ai/methodology/` está escrito por alguien que sabe: *"cero cardio pasivo"*, *"el ejercicio nunca va pelado"*, *"la inestabilidad no es la base"*, *"fuera el repertorio de fisio"*, *"no infradosificar"*, y la regla de marcar supuestos en vez de inventar. **Eso se firma** — y por eso mismo hay que dejar claro de quién es antes de venderlo al centro de al lado.

**Decisión D-P4**: la metodología es de Apta.

```gherkin
Escenario: contrato con Training Zone
  Entonces el contrato declara expresamente que la metodología y su contenido son propiedad de Apta

Escenario: aportaciones del cliente
  Entonces se regula qué ocurre con las aportaciones que Training Zone haga en el futuro

Escenario: venta a terceros
  Entonces Apta puede licenciar la metodología a cualquier otro cliente sin autorización adicional

Escenario: antes de vender
  Entonces esta cláusula está firmada antes de cerrar el segundo cliente
```

---

## Anexo · Trazabilidad de las decisiones

| Decisión | Historias que activa | Historias que cambia o retira |
|---|---|---|
| D-M1 · no-show móvil sí | E2-14 | — |
| D-M2 · publicar más adelante | E5-15, E9-16, E10-19 (⚠️ backlog) | — |
| D-M3 · retirar el muro | E5-14 | — |
| D-M4 · app a 2 roles | **E13-01** | E7-03 (T11), E7-09, E8-18 |
| D-M5 · la app lee el tema | **E13-02** | — |
| D-S1 · Standard | — | HU-ST-07 |
| D-S2 · Bizum en pago puntual | — | HU-ST-09 |
| D-S3 · ONLINE fuera de la app | — | HU-ST-10, E12-03 |
| D-S4 · subida inmediata, bajada al ciclo | — | HU-ST-13 |
| D-S5 · gracia 7 días configurable | — | HU-ST-18 |
| D-S6 · `cancel` al agotar reintentos | — | HU-ST-18 |
| D-S7 · reembolsos desde Apta | HU-ST-20, HU-ST-21 | — |
| D-S8 · Apta factura solo su licencia | — | HU-ST-25, contrato |
| D-S9 · ventana configurable por centro | E2-05 | E2-06, E5-05 |
| D-S10 · una sola ventana | E2-04 | E12-13 |
| D-P1 · fundador con cupo y fecha | — | E6-04 |
| D-P2 · 100 clientes | — | **E6-08 sube a P1** |
| D-P3 · solo España | — | E12-17, E9 (sin i18n) |
| D-P4 · metodología de Apta | **E13-03** | — |
| D-P5 · reempaquetado completo | — | E6-04 |
| D-P6 · se apagan IA falsa, chat "al instante" y fichajes | E12-01, E12-02, E10-21 | **E12-03 reescrita**: ONLINE no se apaga · E8-17 conserva chat, tareas y anuncios |
| D-P7 · SessionLedger después de E2-01/E2-02 | E2-15 | E5-09 |
| D-C1 · BBDD ya en la UE | — | **E10-07 reducida** a documentar y blindar |
| D-C2 · art. 9.2.f | — | E10-03 |
| D-C3 · plazos estándar parametrizables | — | E10-08 |
| D-C4 · DPD + EIPD | — | E10-10 |
| D-C5 · DPA antes del piloto | — | E3-15 lleva la condición dentro |
| D-C6 · microempresa | — | **E8 se prioriza por calidad, no por ley**; el análisis se documenta en E10-10 |
| D-C7 · `/audit` consulta libre | — | E6-07 |

## Anexo · Lo que explícitamente NO se hace ahora

Reescribir la agenda (636 líneas de calendario propio donde recepción y entrenadores pasan ocho horas: **añadir vista mes y blindarla con tests**, no reescribirla) · vista por sala · VERI\*FACTU, aplazado a enero de 2027 por el RDL 15/2025 · Stripe Terminal · reactivar fichajes · más BI · más pantallas móviles · más dimensiones de feedback · basemap cartográfico propio · isócronas reales · notificaciones push · caché offline, biometría y cámara en la app · Detox o Maestro.
