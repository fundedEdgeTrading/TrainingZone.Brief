# Diagnóstico del panel de dirección · septiembre 2026

**Historia:** E14-01 · pista M1 · **Fecha:** 15 de septiembre de 2026
**Base medida:** `main` en `e1a4c5f` · **Datos:** Postgres 16 local sembrado con `npm run db:seed`
**Estado del código:** **ninguna fórmula ha cambiado todavía.** Este documento es el paso previo.

Dirección reporta tres cifras raras —**279 € de ingresos del mes**, **2 % de ocupación**
y **−85 % contra agosto**— y dice que con ellas el insight del día «dice cosas raras».
El encargo no es arreglarlas: es averiguar, para cada una, cuál de estas tres es.

- **(a) El dato es correcto** y el negocio va así.
- **(b) La definición de la métrica no es la que dirección cree.**
- **(c) Hay un fallo.**

---

## Antes de nada: por qué mis euros no son los suyos

`prisma/seed.ts:35` fija `faker.seed(20260717)`, pero el resto del fichero usa
`Math.random()` sin sembrar (más de veinte llamadas: líneas 46, 59, 67, 904, 981…).
**La base de demo no es reproducible entre ejecuciones.** Mis cifras absolutas
no van a coincidir con las de la captura de dirección y no tienen por qué.

Lo que sí se reproduce, y es lo que importa, es **la forma**: el panel de mi base
saca **561 € del mes con un chip de ↓ 82,5 %** y una ocupación de un dígito.
Es el mismo cuadro. Las conclusiones de abajo son sobre el mecanismo, no sobre el euro.

Reproducción:

```bash
service postgresql start
createdb trainingzone && npm ci && npx prisma migrate deploy && npm run db:seed
set -a && . ./.env && set +a
```

Todas las consultas de este documento son SQL directo contra esa base, o llamadas
a las funciones reales de `src/lib/dashboard-queries.ts` con la misma sesión de Prisma
que usa la pantalla.

---

## Cifra 1 · «279 € de ingresos del mes»

**Veredicto: (a) el dato es correcto. La fórmula, la ventana y el rótulo están bien.**
**Lo que el panel está enseñando es un problema de cobros, no un problema de panel.**

### Lo que devuelve el código

`getKpiTiles`, tile `revenue`, rango `mes`, toda la organización:

```
revenue   561 €   delta=↓ 82,5%   hint="vs. agosto a esta fecha"
          spark=[3282, 3182, 4506, 4536, 5264, 5330, 561]
```

La ventana es `2026-09-01 00:00 → 2026-09-15 15:51`. Correcta. Cinco cobros:

| fecha | importe | método | centro |
|---|---|---|---|
| 02-09 | 102 € | BIZUM | Puerta del Carmen |
| 03-09 | 140 € | BIZUM | La Jota |
| 06-09 | 264 € | CARD | La Jota |
| 14-09 | 40 € | CASH | Santander |
| 15-09 | 15 € | CASH | La Jota |

### Descartado: no es que los cobros vengan a final de mes

Era la explicación cómoda. No se sostiene. En 2026, **152 de los 261 cobros caen en
los días 1-15** y el día con más cobros del mes es el 7. La primera quincena de cada
mes de este año:

| quincena | ene | feb | mar | abr | may | jun | jul | ago | **sep** |
|---|---|---|---|---|---|---|---|---|---|
| nº cobros | 14 | 18 | 19 | 20 | 20 | 20 | 20 | 21 | **5** |
| euros | 1.484 | 2.030 | 1.970 | 2.166 | 2.390 | 2.498 | 2.752 | 3.202 | **561** |

Septiembre no va por detrás de agosto: va por detrás de **las ocho primeras quincenas
del año**, enero incluido. El panel no está recortando nada.

### Lo que sí pasa: faltan los cobros, no los euros

Hay **61 suscripciones ACTIVE** que suman **9.790 € de cuota mensual**. Los meses
cerrados generan 34-36 cobros. Septiembre lleva 5.

```
ACTIVE, último cobro hace más de 35 días : 35 subs · 4.824 €/mes de cuota
ACTIVE, cobro en los últimos 35 días     : 19 subs · 3.188 €/mes
ACTIVE, sin ningún cobro                 :  7 subs · 1.778 €/mes
```

**En la base de demo la causa está localizada y es del sembrado**, no del panel:
`prisma/seed.ts:1073` genera cobros con `monthsElapsed = Math.min(12, …)`, así que
una suscripción deja de cobrar al llegar a doce recibos. **27 de las 61 suscripciones
ACTIVE han tocado ese tope** y no han vuelto a pagar.

> **Lo que hay que comprobar contra la base de producción, y es la respuesta a dirección:**
> repetir estas dos consultas allí. Si sale lo mismo —suscripciones ACTIVE sin cobro
> reciente— **el panel está haciendo su trabajo**: está avisando de que la remesa del mes
> no se ha pasado o no se ha registrado. Eso es dinero, no es un bug de la pantalla, y es
> urgente. Si en producción los cobros están y el panel no los ve, entonces sí es un fallo
> y vuelvo a mirar.

### El matiz que sí es (b): «Ingresos» significa exactamente `status = 'PAID'`

`getRevenueSeries` y `getKpiTiles` filtran `status: "PAID"`. Es una definición legítima,
pero **no está escrita en ninguna parte de la pantalla**, y el esquema tiene un estado
diseñado justamente para el dinero en vuelo:

```prisma
/// HU-ST-12/RB-PAGO-025 · Primer cobro ASÍNCRONO aún sin liquidar (SEPA
/// Direct Debit tarda días en confirmarse). No es ACTIVE a propósito […]
PENDING_CONFIRMATION
```

`stripe-mandate.ts:130` baja la suscripción a `PENDING_CONFIRMATION` y deja el `Payment`
**sin marcar como PAID**. Medido en la base de demo:

| | importe | nº |
|---|---|---|
| PENDING en el mes en curso | **0,00 €** | 0 |
| PENDING en todo el histórico | 468 € | 3 (ninguno SEPA) |
| Suscripciones en `PENDING_CONFIRMATION` | — | **0** |

**Hoy no es material: son cero euros.** La hipótesis SEPA no explica las cifras de
dirección y no puedo confirmarla con estos datos. Pero el mecanismo existe en el código
y hay un agujero que sí conviene tapar ahora, porque es barato:

> **Un euro en `PENDING` no aparece en ningún sitio del panel.** No está en «Ingresos»
> (filtra `PAID`) y tampoco está en morosidad: `getDelinquencyAmount` exige además
> `member.state = 'DELINQUENT'`, y un socio con el primer adeudo SEPA en vuelo no es
> un moroso —no ha impagado nada, todavía no se sabe—. Se cae entre las dos cards.

**Decisión propuesta para E14-03** (es la barata y la que no toca una cifra que dirección
ya se sabe): la cifra grande **sigue siendo solo `PAID`**, y el pie de la card dice qué deja
fuera. Cuando el importe en vuelo de la ventana es mayor que cero, se añade una segunda
línea explícita —«y 340 € en vuelo (SEPA sin liquidar)»—, distinguida y nunca sumada.
Con los datos de hoy esa línea no aparece.

---

## Cifra 2 · «2 % de ocupación»

**Veredicto: (b) la definición no es la que dirección cree — y dentro hay (c) un fallo.**

### Primero, un problema que no estaba en la lista: son dos números distintos

En la misma pantalla, con la misma palabra:

| dónde | ventana | valor |
|---|---|---|
| tile «Ocupación media» (`getKpiTiles`) | la del selector (1-15 sep) | **7 %** |
| pie de «Ocupación por centro» (`getAverageOccupancy`) | **fija, 30 días** | **8 %** |

`getAverageOccupancy` ignora `opts.range`: devuelve 8 % para los cuatro rangos del selector
(comprobado abajo, en el barrido). La card rotula honestamente su «30 días», pero el tile
de arriba no rotula nada y se mueve con el selector. Dos cifras, un nombre.

### El sospechoso de la historia: BOOKED sin resolver. **No es el que manda.**

La medida que pide E14-02, ocurrencias del mes en curso con reservas `BOOKED` sin resolver:

```
Reservas BOOKED en el mes en curso ............................ 14
  de ellas, en clases de HOY (todavía no celebradas) .......... 13
  de ellas, en clases YA CELEBRADAS (nadie pasó lista) ........  1
Ocurrencias ya celebradas con BOOKED sin resolver ............   1  (de 216)
```

Meter `BOOKED` en el numerador mueve la ocupación de **6,9 % a 7,8 %**. Menos de un punto.
**La sospecha estaba bien planteada y en estos datos no es la causa.** Sigue siendo cierto
que son dos métricas y hay que separarlas —eso no cambia—, pero no es de ahí de donde sale
el 2 %.

### El fallo (c): el denominador cuenta clases que todavía no se han dado

`occurrencesInRange` (`session-occurrences.ts:53`) normaliza la fecha base con
`base.setHours(0, 0, 0, 0)`. La ventana del panel termina en `now`. Resultado: **la agenda
entera de hoy entra en el denominador**, incluidas las clases de esta tarde, aportando su
aforo completo y cero asistencia —nadie puede haber asistido todavía—.

```
Ocurrencias de hoy dentro de la ventana ....  20  (134 plazas, 1 asistencia)
Ocupación 1-15 sep (incluye hoy) ..........  6,9 %
Ocupación 1-14 sep (excluye hoy) ..........  7,5 %
```

Seis décimas hoy, día 15. **El día 1 del mes ese mismo sesgo vale un tercio de la cifra**,
y es exactamente cuando dirección abre el panel a ver cómo empieza el mes. Esto es un fallo
y se arregla: el denominador de la asistencia solo puede contener ocurrencias **ya celebradas**.

### La causa dominante: el denominador es la agenda entera, llena o vacía

De las 216 ocurrencias del mes en curso, **123 (el 57 %, 854 plazas de 1.454) no tienen ni
una sola reserva de ningún estado**. Ni asistida, ni reservada, ni cancelada, ni en espera.

| ámbito | ocurrencias | aforo | ocupación |
|---|---|---|---|
| todas | 216 | 1.454 | **6,9 %** |
| solo las que tuvieron roster | 93 | 600 | **16,7 %** |
| sin ninguna reserva | 123 | 854 | — |

Y encima se promedian dos negocios distintos: el entrenamiento personal tiene aforo 1.

| | ocurrencias | aforo | ocupación |
|---|---|---|---|
| grupo (Fuerza, Funcional, HIIT, CrossTraining, Movilidad) | 138 | 1.376 | **4,8 %** |
| Personal Training (aforo 1) | 78 | 78 | **43,6 %** |

**Eso es lo que significa hoy «Ocupación media»:** qué fracción de todos los huecos que
alguien puso en la agenda —se abrieran a la venta o no, se hubieran celebrado o no, fueran
de grupo o uno-a-uno— acabó con alguien marcado como asistido. Dirección lee otra cosa:
«qué lleno va mi centro». **No es el mismo número y por eso el 2 % no significa lo que parece.**

### Las dos métricas, y qué las separa

1. **Plazas vendidas** — `BOOKED + ATTENDED + NO_SHOW` sobre el aforo de las ocurrencias
   **abiertas a la venta**. Responde «¿estoy llenando?». Es una métrica comercial y puede
   calcularse sobre clases futuras.
2. **Asistencia real** — `ATTENDED` sobre las plazas vendidas de las ocurrencias **ya
   celebradas**. Responde «¿viene la gente que reservó?». Es la métrica de operación y solo
   tiene sentido sobre el pasado.

El numerador de «asistencia real» **no** lleva `BOOKED`: un roster sin pasar lista no es una
asistencia, es un dato que falta, y meterlo ahí es volver a confundir las dos preguntas. Lo
que sí hace falta es que la card diga **cuántas ocurrencias del periodo tienen el roster sin
resolver**, porque una asistencia calculada sobre una lista a medio pasar es una cifra con
una nota al pie obligatoria. Grupo y entrenamiento personal se pintan por separado.

---

## Cifra 3 · «−85 % contra agosto»

**Veredicto: (a) el dato es correcto. `comparisonWindow` está bien y no se toca.**

Verificado ejecutando `comparisonWindow("mes")`:

```
  actual : 2026-09-01 00:00 → 2026-09-15 15:51
  previo : 2026-08-01 00:00 → 2026-08-15 15:51     ← recortado a los mismos días transcurridos
  deltaHint: "vs. agosto a esta fecha"
```

Contrastado contra SQL:

| comparación | importe | variación |
|---|---|---|
| 1-15 sep contra **1-15 ago** | 561 € vs **3.202 €** | **−82,5 %** ← es esto |
| 1-15 sep contra **agosto entero** | 561 € vs 5.330 € | −89,5 % |

El chip del panel dice exactamente **↓ 82,5 %**. **Sale de comparar quincena contra quincena,
como debe.** La regla de recortar el tramo previo a los mismos días transcurridos funciona,
y el pie ya lo dice en prosa.

Por tanto el trabajo aquí es **de rótulo y solo de rótulo**, y es más pequeño de lo que
parecía: el pie de la card ya es honesto. Lo que viaja sin contexto es **el chip**, que es
lo que la gente fotografía y pega en un chat. Se extiende el mismo criterio a los siete
rangos (E14-06) y no se toca una línea de la fórmula.

---

## Cifra 4 · El insight del día

**Veredicto: (c) fallo. No es un número equivocado: es una precisión que el dato no aguanta.**

`getDailyInsight` escribe la frase de ingresos en cuanto `revenue > 0 && change !== null`.
Con cinco cobros produce, literalmente:

> Santander lidera con un 13% de ocupación, 3 puntos por debajo de agosto.
> **Los ingresos van un 82,5% abajo respecto a agosto.**
> La señal a mirar hoy son los 7 socios marcados en riesgo de fuga, 2 de ellos en Cuatro Caminos.

«82,5 %» tiene una cifra decimal y está calculado sobre cinco cobros. **Un solo cobro cambia
la frase**: el recibo de 264 € del día 6, si hubiera entrado el 16, la convierte en «90,7 %
abajo». Ocho puntos de swing por un movimiento de diez días en un recibo. Eso es ruido con
voz de autoridad, y es peor que no decir nada porque suena calculado.

### El suelo: N = 10 cobros, M = 1.500 €

No van a ojo. El ticket medio medido de la organización es **129,92 €**. Un porcentaje
merece decirse cuando **un cobro medio que cruce el borde de la ventana no lo mueve más de
diez puntos**:

```
1 ticket / ingresos_ventana < 10 %   ⟹   ingresos_ventana > 10 × 129,92 € = 1.299 €
```

- **M = 1.500 €** en la ventana (los 1.299 € redondeados hacia arriba, con holgura).
- **N = 10 cobros**, que es el mismo umbral contado en recibos (10 × ticket medio ≈ M).

Contrastado contra los datos reales, que es lo que decide si un umbral sirve:

| quincena | cobros | euros | ¿da porcentaje? |
|---|---|---|---|
| 1-15 de enero (la más floja del año) | 14 | 1.484 € | sí, por poco |
| 1-15 de febrero … agosto | 18-21 | 1.970-3.202 € | sí |
| **1-15 de septiembre** | **5** | **561 €** | **no** |

Discrimina justo donde tiene que discriminar: **ninguna quincena de operación normal se
queda muda, y la actual sí.** Por debajo del suelo la frase no desaparece —callarse del
todo también informa mal—: dice el número absoluto y cuántos cobros lo sostienen, sin
porcentaje. Algo como «Llevas 561 € cobrados este mes, en 5 recibos.»

Los dos umbrales van a `src/lib/dashboard-targets.ts` con su comentario, junto a
`OCCUPANCY_TARGET_PCT` y a la referencia de permanencia de 25 meses: son cifras de
organización, no constantes de una fórmula.

---

## Hallazgo extra · 21 de las 25 consultas del panel ignoran el selector de periodo

No estaba en el encargo como sospechoso, pero es la raíz del punto 4 (el mapa) y de la mitad
de las incoherencias de arriba. Barrido mecánico: llamar a cada función exportada de
`dashboard-queries.ts` con los cuatro rangos y comparar la salida. **Si las cuatro salidas
son idénticas, la función recibe `opts.range` y no lo usa.**

**Usan el rango (4):** `getRevenueSeries` · `getNetJoins` · `getKpiTiles` · `getDailyInsight`

**No lo usan (21).** No todas están mal; hay que separarlas:

| | consultas | juicio |
|---|---|---|
| **Stock, el rango no aplica** | `getMemberStateBreakdown` · `getSexDistribution` · `getAgeBrackets` · `getMemberDemographics` · `getMembersByService` · `getDelinquencyAmount` | Correcto. «Cuántos socios hay **ahora**» no tiene periodo. Que quede dicho en el rótulo |
| **Ventana propia, ya rotulada** | `getOccupancyByCenter` (30 d) · `getOccupancyByWeekday` (60 d) · `getNoShowRate` (30 d) · `getWeeklyChurn` (8 semanas) · `getLeadCloseRate` | La pantalla dice su ventana. Aceptable, pero conviven con un selector que no las mueve, y `getAverageOccupancy` produce la contradicción de la cifra 2 |
| **Flujo sin acotar: todo el histórico** | `getRevenueByMethod` · **`getLtvAndTicket`** · `getGoalsAggregate` · `getAcquisitionChannels` · `getTopServices` · `getMemberRanking` | **Mal.** Son métricas de flujo (dinero cobrado, leads captados, altas) pintadas junto a otras que sí respetan el selector. `getLtvAndTicket` devuelve lo mismo con `range=mes` y con `range=ano`: **1.118,55 €, 64 clientes** |
| **El mapa (petición T7, 9 días sin aplicar)** | `getPostalCodeMapData` · `getPostalCodeStats` · `getPostalPanelData` | **Mal, y con consecuencias.** Ver abajo |

### El mapa, confirmado punto por punto

```
range=mes  → 27 barrios, 19 leads, 71 socios
range=30d  → 27 barrios, 19 leads, 71 socios     ← idéntico
range=trim → 27 barrios, 19 leads, 71 socios     ← idéntico
range=ano  → 27 barrios, 19 leads, 71 socios     ← idéntico
memberStates=["ACTIVE"] → 71 socios              ← idéntico: también se ignora
```

Esos **71 socios son todos los de la organización**, y hay **8 CANCELLED con código postal**
entre ellos. De los 19 leads, **1 tiene `convertedMemberId`** y **1 está `CERRADO`**: esa
persona se está contando a la vez como lead y como socio, y la conversión del barrio se
calcula sobre ese total inflado. Es exactamente lo que describe
`docs/hu/T7-peticion-dashboard-queries.md`, escrito el 6 de septiembre.

`opts.centerId` **sí** se aplica (La Jota 5/11, Puerta del Carmen 0/10, Santander 14/50),
así que no es que la función ignore sus opciones: ignora estas dos.

---

## Qué cambia y qué no

**No se toca:**

- `comparisonWindow`. La regla es correcta y está verificada. Se **extiende** a siete rangos
  (E14-06); no se reescribe.
- El filtro `status = 'PAID'` de la cifra grande de ingresos.
- El numerador de la asistencia real: `BOOKED` no entra ahí.

**Se cambia:**

1. **Ocupación** → dos métricas separadas y rotuladas (E14-02), grupo y entrenamiento personal
   por separado, y el fallo del denominador: fuera las ocurrencias no celebradas.
2. **Ingresos** → el pie dice qué deja fuera; línea aparte para el importe en vuelo cuando
   exista (E14-03).
3. **Insight** → suelo de **N = 10 cobros / M = 1.500 €** en `dashboard-targets.ts`; por debajo,
   número absoluto y nada de porcentajes (E14-04).
4. **LTV** → acotado por `opts.range` y acompañado de permanencia medida (E14-05).
5. **Rangos** → de cuatro a siete más el personalizado, y las consultas de la fila «flujo sin
   acotar» pasan a usar el rango que reciben (E14-06).
6. **Mapa** → se aplican los cuatro puntos de T7 (E14-07). **M2 depende de esto**: se le avisa
   en cuanto esté mezclado.

---

## Anexo · permanencia y LTV, la medida previa a E14-05

Para que la decisión de E14-05 no se tome a ciegas. Aquí solo está medido; la decisión y su
argumento se escriben con el código.

**Lo que devuelve hoy `getLtvAndTicket`:** 1.118,55 € de «LTV medio por cliente» sobre
64 clientes con cobros, **sobre todo el histórico y sin acotar por periodo**. No es un LTV:
es facturación acumulada media por socio.

**Permanencia de quien se fue** (`joinedAt` → `cancelledAt`, los 8 CANCELLED):

```
media 7,26 meses · mediana 7,97 · mínimo 0,99 · máximo 11,99
```

**Antigüedad de los vivos** (63 socios sin `cancelledAt`, censura por la derecha):

```
media 10,00 meses · mediana 8,79 · máximo 23,58
```

**El dato que decide el método:** el alta más antigua de toda la organización es del
**28-09-2024**, hace **23,6 meses**. La referencia de negocio son **25 meses**.

> **Nadie ha podido quedarse 25 meses todavía: el negocio no existe desde hace 25 meses.**
> Promediar los 8 que se fueron da 7,26 meses y es un número sin sentido —mide la edad del
> negocio, no la lealtad del socio—. La censura por la derecha no es aquí un matiz
> estadístico: es el efecto dominante, y con 8 bajas sobre 71 socios cualquier media simple
> va a estar equivocada en la misma dirección. Comparar 7,26 contra 25 y titular «la
> permanencia está un 71 % por debajo del objetivo» sería el mismo error que el insight de
> la cifra 4, con más ceros.

**Socios importados:** en la base de demo, **cero**. `externalSource`, `externalId`,
`mywellnessAccount` y `accountCreatedAt` están vacíos en los 71 socios. Las columnas existen
en el esquema y el CSV de importación las rellena (`docs/IMPORTACION_SOCIOS_CSV.md`), pero
**no tengo un solo caso real que medir**. La decisión sobre su `joinedAt` se tomará y se
documentará en E14-05 como lo que es —una regla, no una conclusión de datos— y quedará
dicho en la card que esos socios llevan una antigüedad heredada de otra plataforma.
