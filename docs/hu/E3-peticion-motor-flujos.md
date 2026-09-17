# E3 · petición al motor de flujos (E2), a etiquetas (E1) y a la costura (S2)

> **Pista que lo pide:** E3 · Los seis flujos de salida y el panel por flujo.
> **Ficheros ajenos implicados:** `src/lib/flows/engine.ts`, `src/lib/flows/actions.ts`
> (E2) · `src/lib/tag-engine.ts`, `src/lib/tags.ts` (E1) · `prisma/schema.prisma` (S2,
> congelado).
> **Estado:** abierto. **Nada de esto se ha tocado desde E3.**

El encargo de E3 es explícito: «si necesitas algo que el motor no hace, PARA Y
DÍMELO — cambiarlo por tu cuenta rompe las reglas de seguridad que E2 probó una
por una». Esto es ese «dímelo», por el canal que fija el plan
(`docs/PLAN_LOTE3…`, «las cuatro reglas que no se rompen», regla 1).

Los ocho flujos están entregados y sembrables. **Seis de ellos llevan una parte
que hoy sigue haciendo una persona**, y esa parte está declarada como DATO en
cada semilla (`FlowSeed.gaps`), no en un comentario: se pinta en el panel del
flujo, debajo del embudo, para que dirección la vea **antes** de darle a
Activar. Aquí va la lista para quien tenga que cerrarla.

---

## 1 · El botón del correo no puede llevar un enlace por socio · **es el más caro**

**Qué pasa.** `FlowStep.actionConfig.ctaPath` es una ruta FIJA, y
`sendFlowEmail` la envuelve tal cual con el token de clic. Ningún correo de
flujo puede llevar un enlace firmado para ESE socio.

**A quién afecta.** A dos flujos, y a los dos por lo mismo:

| Flujo | Enlace que pide el encargo | Dónde vive hoy |
|---|---|---|
| **5 · Impago** | «Pagar ahora» de HU-ST-19 | `memberBillingUrlFor(generateMemberDunningToken(memberId))` |
| **7 · Referidos** | el enlace del socio | `referralLinkUrl(code)` (`referrals.ts`) |

El encargo decía, con razón, «el enlace YA EXISTE, no generes otro». No se ha
generado ninguno: lo que falta es por dónde meterlo.

**Qué hacen los flujos mientras tanto.** El botón lleva al portal —a
«Membresía», donde está el recibo pendiente con su botón de pagar; y al portal a
secas en el de referidos, con el texto diciendo dónde está el código—. Un clic
de más para el socio, ningún enlace inventado y ningún segundo sistema de cobro
ni de códigos.

**Arreglo mínimo propuesto (es de E2, `engine.ts`).** Un registro de resolutores
de destino, **exactamente el mismo patrón que E2 ya usa para el objetivo del
panel** (`registerFlowGoalResolver`): el paso declara una clave
(`ctaResolver: "enlace-de-pago"`) y `sendFlowEmail` la resuelve por socio justo
antes de firmar el token de clic. Son pocas líneas, no toca ninguna de las seis
reglas de seguridad —el enlace se resuelve DESPUÉS de la puerta, con el hueco ya
reservado— y sirve para los dos flujos y para los que vengan.

De paso resolvería lo mismo para **trozos de texto**: hoy tampoco se puede
escribir en el cuerpo los días de gracia de la organización (flujo 5) ni el
importe de la recompensa del centro (flujo 7). Los textos NO los inventan: no
dan ninguna cifra.

---

## 2 · Faltan tres condiciones en `FlowConditionType`

El catálogo tiene `CENTER`, `PLAN_TYPE`, `TAG`, `TENURE` y `TRAINER`. Falta:

| Condición | La pide | Mientras tanto |
|---|---|---|
| **«no ha rellenado el formulario de alta»** | 1 · Bienvenida, día 2 | La tarea se abre para TODA alta nueva y su texto dice «comprueba si lo ha rellenado» |
| **«motivo de baja»** | 6 · Reactivación | Va **un solo correo** en vez de los dos que pedía el encargo, y su texto no promete nada que dependa del motivo |
| **«valoración 8 o más»** | 7 · Referidos (lo dejó abierto R1) | **El correo le llega a todo el que siga siendo socio a los 90 días**, con la nota que sea. Por eso ese flujo conviene dejarlo en borrador |

**Las tres tienen la misma salida barata, y es de E1, no de S2:** una etiqueta
automática nueva del motor de etiquetas y aquí una condición `TAG`. No toca
`prisma/schema.prisma`, se ve en la ficha del socio y en `/etiquetas` con su
definición en texto llano, y de paso queda disponible para segmentar a mano.

- «Formulario de alta pendiente» — la pone el alta y la quita el motor al
  rellenarse. Es una de las dieciocho mitades que el plan avisa que se olvidan.
- «Baja por precio» / «Baja por mudanza» / … — por familia de motivo, contra
  `Member.cancelReasonId`, que M4 hizo obligatorio precisamente para esto.
- «Valoración 8 o más» — contra `TrainerRating.score`. Es la salida A que
  recomendó R1 y sigue siendo la buena.

Hay una cuarta, menor, que **no hace falta arreglar**: «tiene una suscripción
activa» (lo que el encargo del flujo 3 llama «pagando»). Se expresa hoy como
`PLAN_TYPE` con todos los tipos, que sobre el fotograma del socio significa
exactamente eso. Funciona; solo se lee peor. Queda escrito para que nadie lo
borre creyendo que sobra.

---

## 3 · No hay disparador de fecha fija del calendario · **por esto falta media historia**

`FlowTriggerType` tiene `DATE_ANNIVERSARY` (meses desde el alta de cada socio) y
`DATE_BIRTHDAY` (su cumpleaños). Las dos son **una fecha distinta para cada
persona**.

La campaña anual del flujo 6 —«cada septiembre, a la etiqueta Excliente»— es una
**fecha fija igual para todos**, y eso no se puede expresar. **Esa mitad del
flujo 6 NO se entrega**: se sigue haciendo a mano, como hoy. No se ha forzado
con `DATE_ANNIVERSARY` porque eso mandaría en el aniversario del alta de cada
socio, que no es septiembre para nadie salvo por casualidad: habría sido
entregar otra cosa con el mismo nombre.

**Dos salidas, y la segunda vale para mucho más:**

- **A** · un valor nuevo en `FlowTriggerType` (`DATE_FIXED`, con día y mes en
  `triggerConfig`), cableado contra el calendario del centro. Mismo patrón que
  `DATE_BIRTHDAY` y casi todo hecho en `triggers.ts`. Toca esquema: S2.
- **B** · **una campaña de un disparo** desde la pantalla de flujos: «mandar
  este flujo ahora a quien tenga esta etiqueta». No es un disparador, es un
  botón. Sirve para la de septiembre y para cualquier campaña de temporada —y
  también resuelve algo que se ha visto contando la demo: el flujo 2 (rama por
  producto) solo alcanza a las altas nuevas, así que los **37 socios de grupo
  reducido y 25 de entrenamiento personal que ya están dentro** no reciben nunca
  ese correo. Hoy eso solo se arregla a mano.

---

## 4 · Una tarea de flujo no puede llevar un dato del socio en el cuerpo

El encargo del flujo 3 pide «tarea al entrenador **CON EL TELÉFONO** del socio».
`createTask` (`flows/actions.ts`) escribe `body` tal cual desde `actionConfig`,
que es texto fijo; y la `Notification` que crea **no guarda el `memberId`**, así
que la tarea tampoco enlaza con la ficha.

Mientras tanto: el título ya lleva el nombre del socio (se lo pega el motor) y el
cuerpo dice dónde está el teléfono. El entrenador da un clic de más.

**Arreglo mínimo:** o un puñado de huecos del socio sustituibles en el cuerpo de
la tarea, o —mejor, porque sirve para todas— que la `Notification` de flujo
guarde el `memberId` y la pantalla de tareas enlace con la ficha.

---

## 5 · Nadie llama a `refreshFlowGoals`

`/api/flujos/cron` consume la cola y se va: la tercera cifra del embudo
(`FlowEnrollment.goalMetAt`) **no la recalcula nadie**.

E3 lo ha rodeado sin tocar nada: el panel por flujo **mide el objetivo en vivo
cada vez que se abre** —con los mismos resolutores, sin escribir— y ofrece un
botón «Guardar la medición» para dejar la fotografía escrita. Así la pantalla
nunca miente, aunque el cron no lo haga.

**Arreglo mínimo:** una línea en el cron, después de `runFlowQueue`, recorriendo
los flujos vivos con `refreshFlowGoals`. Es de E2.

---

## 6 · Dos cosas que E3 **sí** ha tocado fuera de su lista, y por qué

Van aquí para que el integrador las vea en el sitio donde mira.

### `src/lib/public-paths.ts` — **era un fallo, y gordo**

`/api/flujos/cron` **no estaba en `PUBLIC_PATHS`**, así que el proxy lo rebotaba
a `/login`. El workflow `flujos-cron.yml` recibía un 307 en vez de un 200 y **la
cola no se vaciaba nunca**: el módulo de flujos entero no habría mandado un solo
correo en producción, sin que nada se pusiera rojo. Lo destapó
`e2e/flujos.spec.ts` al intentar mover el motor por donde lo mueve producción.

Añadida la entrada, con el mismo patrón y las mismas garantías que `/api/jobs`:
el endpoint sigue fallando cerrado sin `JOBS_CRON_SECRET` y comparando el
secreto en tiempo constante. Cubierto con una prueba
(`flows/seeds/seeds.test.ts`) para que no se vuelva a caer.

### `src/app/(app)/flujos/[id]/page.tsx` — un enlace de una línea

El panel por flujo (`/flujos/[id]/panel`, de E3) no tenía **ninguna puerta**: la
pantalla existía y no se podía llegar a ella salvo escribiendo la URL. Añadido
«Ver el embudo» en la cabecera del flujo, junto a «Volver». Una línea, sin
lógica.

Y una tercera, de CI: `.github/workflows/e2e.yml` no define `JOBS_CRON_SECRET`
en el job `verify`, así que `e2e/flujos.spec.ts` **se saltaría entero** en vez de
fallar — el mismo punto ciego que tuvo el alta pago-primero antes del job
`e2e-pago`. Añadida la variable de usar y tirar.

---

## Lo que NO se pide

Ninguna de las seis reglas de seguridad. Los ocho flujos pasan por las seis sin
excepción, y ninguno necesita saltarse el tope semanal: eso lo comprueba un test
(`seeds.test.ts`) recorriendo las esperas de cada rama, y el e2e lo prueba
contra la base con dos flujos cayendo sobre el mismo socio.
