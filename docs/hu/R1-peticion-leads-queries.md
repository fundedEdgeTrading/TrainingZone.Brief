# R1 · los dos enganches fuera de mis ficheros, y por qué son de tres líneas

> **Para la ventana de merge.** R1 posee `src/lib/referrals.ts`,
> `src/lib/referral-rewards.ts`, `src/app/(app)/referidos/` y
> `src/app/r/[code]/`. Ha tocado **cuatro ficheros más**, y ninguno es de una
> pista viva del lote. Se listan aquí uno a uno para que el integrador los vea
> sin tener que leer el diff entero.

## 1 · `src/lib/leads-queries.ts` — el embudo NO se duplica, así que hay que entrar en él

No es de ninguna pista del lote 3 (no aparece en la tabla de «Quién posee qué»).
Son dos cambios **aditivos** y no cambian el comportamiento de nadie que no pase
los campos nuevos.

**a) `CreateLeadInput` gana dos campos opcionales.**

```ts
referredByMemberId?: string | null;
referralCodeId?: string | null;
```

Y se escriben en el `prisma.lead.create` que ya existía. Por qué aquí y no en un
`update` posterior desde mi módulo: entre el `create` y el `update` hay una
ventana en la que el lead existe sin embajador, y esa ventana decide dinero. El
resto del repositorio los deja en blanco y no cambia nada.

**b) `confirmLeadClosureForMember` llama a `releaseReferralRewardsForLead`.**

Es el ÚNICO sitio del repositorio donde un lead pasa a `CERRADO` con su socio ya
creado, o sea **el alta**. Va fuera de la transacción y no puede lanzar: el alta
del socio no se deshace porque el programa de referidos tenga un mal día.

No hay ciclo de importación: `referral-rewards.ts` no importa `leads-queries.ts`
y no lo va a importar.

## 2 · `src/lib/member-lifecycle.ts` (M4) — antifraude 3, donde M4 dijo

El propio encabezado del módulo de M4 ya lo anticipa: *«además R1 y E2 se
enganchan a estas funciones —el código de referido caduca con la baja—, así que
un update suelto en otro fichero se los salta a los dos»*.

Son **dos líneas**, una en `cancelMember` y otra en `reactivateMember`:

```ts
await syncReferralCodeWithMemberState(member.id, "CANCELLED"); // y "ACTIVE" al volver
```

Esa función solo toca `ReferralCode.revokedAt`. **No abre un segundo sitio desde
el que se cambia el estado de un socio**, que es justamente lo que M4 vino a
cerrar. Es idempotente y no lanza.

M4 ya está mezclada en `main`, así que no hay sesión viva a la que pedírselo; si
cuando se lea esto hubiera una, este fichero es la petición.

## 3 · `src/lib/public-paths.ts` y `src/lib/seo.ts` — la ruta pública nueva

`/r/` entra en `PUBLIC_PATHS` (con barra final: `"/r"` a secas marcaría pública
`/rrhh` entera) y en `NOINDEX_PUBLIC_PATHS`. Sin lo primero el proxy rebota el
enlace a `/login` y no lleva a ninguna parte — el mismo fallo que ya tuvo
`/cookies`. Lo segundo no hace falta para que quede fuera del índice —
`robotsRules()` es una allowlist con `Disallow: /` de fondo— pero un robots.txt
también es documentación operativa, y quien lo audite tiene que poder leer que
la ruta está excluida sin deducirlo de un comodín.

## 4 · `src/app/(app)/members/[id]/page.tsx` — dos líneas, como E1

El import y el componente. Todo lo demás —consulta, ámbito de centro, permiso y
muro de plan— vive en `src/app/(app)/referidos/member-referral-section.tsx`, que
es mío. Es **exactamente el patrón que ya dejó E1** con `MemberTagsSection` tres
commits antes, y por la misma razón: la ficha no crece por esto.

## 5 · `src/lib/referral-program.ts` — fichero nuevo, y no es un capricho

El inventario de R1 decía dos módulos. Son tres, y el tercero lo obligó el build:
`program-form.tsx` y `member-referral-panel.tsx` son componentes de CLIENTE, y al
importar la validación y los rótulos de un módulo con `prisma` dentro, Next se
llevaba Prisma —y `pg`— al bundle del navegador y **cortaba el build en seco**.
La salida es la que el repositorio ya usa dos veces: `coupon-code.ts` respecto a
`stripe-coupons.ts`, y `tags.ts` respecto a `tags-queries.ts`. `referral-program.ts`
es la mitad pura (estados derivados, formato del código, rótulos, validación del
programa y **las tres reglas antifraude**) y los dos módulos de servidor la
reexportan, así que los call sites de servidor siguen importando de un solo sitio.

De paso hace literal lo que pedía el encargo: las tres reglas antifraude son
lógica pura, en un módulo que **no tiene ni cómo ir a buscar un dato**.

---

## Apéndice · dos cosas que salieron de CI, y una es un fallo de producto

Escritas aquí porque ninguna de las dos es de un fichero de R1 y el integrador
tiene que verlas.

### a) `e2e/etiquetas.spec.ts` (E1) se caía siempre que el recuento valía 1

El pie del listado de socios **singulariza** (`members/page.tsx:350`):
`{total} {total === 1 ? "socio" : "socios"} en total`. La aserción de E1 tenía
el plural fijo:

```ts
await expect(page.getByText(`${impagoCount} socios en total`)).toBeVisible();
```

Así que el test fallaba **siempre** que hubiera exactamente un socio con la
etiqueta «Impago», y pasaba el resto de las veces. Cuánta gente hay en impago en
la demo cuando llega ese spec depende de lo que hayan hecho antes los specs de
cobros, así que caía unas pasadas sí y otras no — y en la de este PR cayó.

**Reproducido y arreglado**: dejando un solo socio en impago, el fallo sale
idéntico al de CI (`Locator: getByText('1 socios en total')`); con la aserción
singularizando igual que la pantalla, pasa con 1 y con 4. No se ha tocado lo que
el test comprueba —el número sigue comparándose—, solo la gramática.

**No lo causó R1**: se reproduce en cualquier rama poniendo el recuento a 1. Lo
único que hizo este cambio fue mover los datos de la demo lo justo para que el
recuento cayera en ese valor.

### b) La tarea de la recompensa NO puede pasar por el tope semanal de M3

Esto sí era un fallo de verdad, y lo destapó la propia suite al repetirse: con
el tope de tareas automáticas agotado (`Organization.autoTaskWeeklyCapPerUser`),
`createNotificationOnce` devolvía `capped` y **la recompensa se quedaba sin
tarea**. Dinero prometido a un socio y nadie a quien se le encarga pagarlo.

El tope de M3 está pensado para los DETECTORES del motor —lo dice su propio
comentario: vuelven a pasar cada noche y reescriben lo que no cupo, así que «no
se ha descartado nada»—. La tarea de una recompensa **no es un detector**: nace
de un hecho puntual, una vez, y no hay cron que vuelva a mirarla.

Arreglado dentro de `referral-rewards.ts`: se llama a `createNotification`
directamente. La deduplicación que aportaba `createNotificationOnce` no hacía
falta, y por eso no se pierde nada: la tarea se abre una sola vez por
recompensa, justo después de crearla, y crear la recompensa lo protege el
`@@unique([leadId, beneficiary])`. Hay un test que lo fija
(`referral-release.test.ts`: «la tarea de la recompensa se escribe aunque el
tope semanal esté agotado»).

**No se ha tocado `notifications.ts` ni `tasks.ts`**, que son de M3: el tope
sigue exactamente como estaba para todas las demás reglas.

### c) `getByText("Pagada")` casaba con el botón «Marcar pagada»

Tercera pasada de CI, y esta era mía del todo. La espera después de marcar la
recompensa como pagada era:

```ts
await expect(rowOf("quien trae").getByText("Pagada")).toBeVisible();
```

`getByText` con una cadena busca **subcadena y sin distinguir mayúsculas**, así
que «Pagada» casaba con el botón **«Marcar pagada»** que ya estaba en la fila
ANTES de pulsarlo. La aserción se cumplía sola, no esperaba a nada, y la lectura
de la base de datos de la línea siguiente adelantaba a la acción de servidor: en
local la acción ganaba la carrera y el test pasaba; en CI, más lento, la perdía
y leía todavía `VALIDATED`.

Comprobado con un caso mínimo —`getByText("Pagada")` casa con un
`<button>Marcar pagada</button>`, y con `{ exact: true }` no—, y arreglado
esperando a las dos cosas que sí significan que el salto ha cuajado: que el
botón de la acción desaparezca de la fila y que el rótulo del estado sea
exactamente el nuevo. Eso no se puede cumplir hasta que la escritura está
confirmada y la página se ha revalidado.
