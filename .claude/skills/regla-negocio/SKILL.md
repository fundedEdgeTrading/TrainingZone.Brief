---
name: regla-negocio
description: Trabajar las reglas de negocio de Apta/Training Zone (catálogo RB-* en docs/reglas/) con una persona de negocio. Úsalo cuando alguien quiera consultar qué hace hoy la aplicación, proponer una regla nueva, cambiar o retirar una existente, o resolver una entrada de PENDIENTES_DE_DECIDIR.md. Solo edita docs/reglas/; nunca toca código.
---

# Reglas de negocio con negocio

Estás trabajando con una persona de **negocio**, no de desarrollo. Habla en
lenguaje de negocio (roles, socios, bonos, horas), no de ficheros ni funciones,
salvo que te lo pida. Todo en español.

## Límites que no se cruzan

- **Solo editas ficheros dentro de `docs/reglas/`.** Nada de `src/`, `apps/`,
  `prisma/`, `e2e/` ni del resto de `docs/`. Si una decisión exige cambiar el
  código, lo dejas escrito en la regla (estado ✅ Aprobada) y lo dices: lo hará
  desarrollo.
- **Nunca pones una regla en 🟢 Vigente.** Ese estado lo pone desarrollo cuando
  el código está mezclado.
- **No reutilizas números** de regla. Una retirada se tacha y se deja.
- **No inventas comportamiento.** Lo que digas sobre "qué hace hoy la
  aplicación" sale de leer el código, citando dónde, o dices que no lo sabes.
- **Datos de salud, cobros a socios, cookies y conservación de datos** tienen
  implicaciones legales: si la regla los toca, avísalo y recomienda pasarla por
  el agente `cumplimiento-normativo` antes de aprobarla.

## Paso 0 · Rama

Antes de editar nada, comprueba `git status` y la rama. Cada tema va en su
propia rama `negocio/<tema-corto>` creada desde la rama de integración
(`release`). Si ya estás en una rama `negocio/…` del mismo tema, sigue en ella.

## Paso 1 · Entender el encargo

Clasifícalo en uno de estos cuatro y confírmalo con la persona en una frase:

1. **Consulta** — "¿qué pasa hoy si…?". No se edita nada.
2. **Regla nueva.**
3. **Cambio o retirada** de una regla existente.
4. **Resolver un pendiente** de `docs/reglas/PENDIENTES_DE_DECIDIR.md`.

## Paso 2 · Investigar antes de escribir

1. Lee `docs/reglas/README.md` (estados, formato, siguiente número libre).
2. Busca reglas del mismo tema en **todo** el catálogo, no solo en el fichero
   del dominio: `grep -rn "<palabra clave>" docs/reglas`.
3. Comprueba qué hace hoy el código: `grep -rn "RB-<PREFIJO>-<NNN>" src apps`
   para la regla afectada y búsquedas por concepto para lo que no tenga número.
   Lee solo los fragmentos necesarios. Si el tema es grande, delega la lectura
   en el agente `Explore` y quédate con la conclusión.
4. Cuenta a la persona, antes de proponer texto:
   - qué dice hoy el catálogo,
   - qué hace hoy la aplicación (web y app), con un ejemplo concreto,
   - **con qué otras reglas choca o a cuáles afecta** (esto es lo más valioso).

## Paso 3 · Redactar

- Usa el formato de `docs/reglas/PLANTILLA_REGLA.md`, en el fichero del dominio
  y la sección que corresponda.
- Una regla, una decisión. Números concretos. Di si es configurable, por quién
  y con qué valor por defecto.
- Haz las preguntas de la plantilla que el texto no conteste. No rellenes
  huecos con suposiciones: pregunta.
- Estado: **📝 Propuesta** por defecto; **✅ Aprobada** solo si la persona dice
  explícitamente que la decisión está tomada por quien puede tomarla (anota
  quién y la fecha en `**Decisión:**`).
- Si cambias una regla vigente, añade `**Antes:**` con lo que decía.
- Si la regla contradice el código actual, márcalo en la propia regla y añade o
  actualiza la entrada en `PENDIENTES_DE_DECIDIR.md`.
- Si resuelves un pendiente: escribe la decisión en la regla y **borra** la
  entrada de `PENDIENTES_DE_DECIDIR.md`.
- Actualiza la tabla "Siguiente número libre" del README si usas un número nuevo.

## Paso 4 · Revisión de coherencia

Antes de guardar, relee el diff entero y comprueba:

- ¿El mismo enunciado aparece en dos sitios? Deja uno y cita el código `RB-*`.
- ¿Hay otra regla que ahora diga lo contrario? Si sí, o se cambia también o se
  anota como pendiente.
- ¿Los enlaces internos (`./…md`, `#p-NN`) siguen funcionando?

## Paso 5 · Entregar

1. Enseña el diff a la persona y pide su visto bueno explícito.
2. Commit con mensaje `reglas(<dominio>): <qué decide>` (añade `decide P-NN` si
   cierra un pendiente).
3. Sube la rama y, si la persona lo pide, abre una pull request contra
   `release` con: qué regla cambia, por qué, impacto previsto en web/app/cobros,
   reglas relacionadas y si necesita trabajo de desarrollo.
4. Termina con un resumen de tres líneas: qué ha quedado escrito, en qué
   estado, y qué tiene que pasar ahora (quién aprueba, quién lo construye).
