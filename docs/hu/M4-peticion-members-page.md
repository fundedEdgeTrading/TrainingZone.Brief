# M4 → M2 · filtro, columna y agrupación por TIPO DE PERSONA en `/members`

> **Para la ventana de merge.** `src/app/(app)/members/page.tsx` y
> `src/lib/members-queries.ts` son de la pista **M2**; M4 no los ha tocado.
> La mitad de **E14-15** que vive en la pantalla —filtro, columna y la
> agrupación bajo un rótulo— necesita esos dos ficheros más
> `src/app/(app)/members/members-filters.ts`, así que va escrita aquí para que
> se aplique mecánicamente, sin reconstruir el razonamiento.
>
> **Todo el criterio ya está escrito y probado** en `src/lib/member-kinds.ts`
> (M4, mezclado): tipos, rótulos, orden, traducción tipo → estado y agrupación
> de pantalla. Este documento solo enchufa ese módulo a la tabla. No hay que
> decidir nada aquí, y sobre todo **no hay que reimplementar «quién es
> excliente»**: dos criterios distintos para eso es el fallo que estamos
> evitando.

## Lo que M4 deja listo

`src/lib/member-kinds.ts` — **sin Prisma detrás a propósito**, para que lo pueda
importar un componente de cliente (el mismo motivo por el que `dashboard-range.ts`
vive fuera de `dashboard-queries.ts`):

```ts
type MemberKind = "CLIENTE" | "CONGELADO" | "SUSPENDIDO" | "EXCLIENTE" | "EN_CAPTACION";

memberKindOf(member | state): MemberKind
MEMBER_KIND_LABEL: Record<MemberKind, string>      // "Cliente", "Congelado", …
MEMBER_KIND_ORDER: MemberKind[]                     // orden de lectura
MEMBER_KIND_STATES: Record<MemberKind, MemberState[]>
statesForKinds(kinds): MemberState[]                // filtro de pantalla → where de Prisma

type MemberGroup = "CLIENTES" | "EN_PAUSA" | "EXCLIENTES" | "EN_CAPTACION";
MEMBER_KIND_GROUP: Record<MemberKind, MemberGroup>
MEMBER_GROUP_LABEL / MEMBER_GROUP_ORDER
kindsInGroup(group): MemberKind[]
```

`EN_CAPTACION` **no es un quinto tipo de persona**: es dónde caen `PROSPECT` y
`TRIAL`, que son estados de embudo. Sin él el filtro dejaría fuera media tabla,
porque `MemberState` tiene seis valores y los tipos de persona son cuatro.

`src/lib/member-kinds.test.ts` fija que cada estado cae en un tipo y en uno solo,
que la cobertura es total y que **congelado y suspendido siguen siendo dos**.

---

## 1 · El eje de filtro pasa a ser el TIPO, no el estado crudo

`members-filters.ts` tiene hoy `MEMBER_AXIS.state` con los seis valores de
`MemberState` y rótulos `MEMBER_STATE_LABEL` ("Activo", "Moroso", "Baja"…). Ese
no es el vocabulario de dirección, que pide «cliente / congelado / suspendido /
excliente».

- Añadir `kind: "kind"` a `MEMBER_AXIS` y `kind: string[]` a `MemberSelection`.
- En `MemberFilterRow`, derivar `kind: memberKindOf(row.state)` (la fila ya trae
  `state`, no hace falta consultar nada nuevo).
- `matchesMemberFilters`: `if (selection.kind.length && !selection.kind.includes(row.kind)) return false;`
- `memberFacetCounts`: un caso más, igual que `state`, con `row.kind` como valor.
- **El eje `state` puede quedarse** (es útil para soporte) o irse; lo que no
  puede es ser el único, porque es el que confunde a dirección.

En `page.tsx`, el grupo del FilterRail:

```tsx
{
  name: MEMBER_AXIS.kind,
  label: "Tipo",
  width: 252,
  options: MEMBER_KIND_ORDER.map((k) => ({
    value: k,
    label: MEMBER_KIND_LABEL[k],
    count: facets.kind[k] ?? 0,
  })),
}
```

Y el filtro que sí baja a la consulta —`listMembers(..., { states })`— se traduce
con `statesForKinds(selection.kind as MemberKind[])`, en vez de pasar los estados
a pelo. **No hace falta tocar `listMembers`**: sigue recibiendo `MemberState[]`.

## 2 · La columna

La tabla enseña hoy el estado. Que enseñe el tipo, con `MEMBER_KIND_LABEL[memberKindOf(m.state)]`
y el mismo tono de badge que ya usa (`MEMBER_STATE_TONE[m.state]`): el tono
distingue congelado de suspendido aunque el rótulo sea el de pantalla. En la
ficha ya está hecho así (`members/[id]/page.tsx`, cabecera), y conviene que las
dos pantallas digan lo mismo.

## 3 · La agrupación, que es de PANTALLA y nada más

Decisión **D-L3-2**, cerrada: congelado y suspendido se pueden leer juntos bajo
un rótulo, **siguiendo separados por dentro**. Eso es exactamente lo que hacen
`MEMBER_KIND_GROUP` y `kindsInGroup`:

- Un selector (o un segundo eje) con `MEMBER_GROUP_ORDER` y `MEMBER_GROUP_LABEL`
  da «Clientes · En pausa · Exclientes · En captación».
- Elegir «En pausa» se traduce a `statesForKinds(kindsInGroup("EN_PAUSA"))`, que
  es `["FROZEN", "DELINQUENT"]`.
- **Lo que no puede pasar** es que la agrupación sustituya a los dos tipos: el
  flujo 5 de E3 (impago) pregunta por `SUSPENDIDO` y tiene que salirle solo quien
  debe dinero. Volver a fusionarlos deshace HU-ST-14 —la lista de morosos incluía
  a quien estaba de vacaciones— y pone en rojo `member-kinds.test.ts`.

## 4 · Lo que NO hay que hacer

- **No** añadir un `MemberState` nuevo ni tocar el enum: los cuatro estados ya
  existen y S2 no los tocó a propósito.
- **No** escribir una segunda tabla `estado → rótulo` en `members-filters.ts`:
  si el rótulo tiene que cambiar, cambia en `member-kinds.ts` y lo hereda todo.
- **No** cambiar `getMemberDetail` ni `listMembers` para traer los motivos: la
  ficha ya los lee por su cuenta y el listado no los enseña.

## Cómo se comprueba

`npm run test:unit` (incluye `member-kinds.test.ts`) y el spec de la tabla de
socios que ya tenga M2 en su pista. El criterio de aceptación es el escenario
«la pantalla» de **E14-15**: `/members` tiene filtro y columna de tipo, y
congelado y suspendido se pueden ver juntos bajo un rótulo siguiendo separados
por dentro.
