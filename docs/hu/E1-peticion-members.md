# E1 → M2 · petición sobre el listado y la ficha de socio

**Pista que pide:** E1 · Etiquetas · rama `lote3/E1-etiquetas`
**Historia que lo obliga:** E14-23 («Etiquetas en la ficha y filtro en el listado», P1)
**Para la ventana de merge.** Esto es lo que el reparto de `PLAN_LOTE3_PANEL_Y_MARKETING_2026-09-15.md`
manda escribir cuando una pista necesita tocar un fichero de otra. Va escrito
porque la petición de T7 se quedó sin aplicar nueve días y por eso el mapa sigue
dando números distintos que el panel de al lado.

## Qué se ha tocado, y por qué no cabía en otro sitio

E14-23 pide dos cosas que, por definición, viven en pantallas de M2: las
etiquetas del socio **en su ficha** y el filtro por etiqueta **en `/members`**.
No hay forma de entregarlas sin tocar esos ficheros. Lo que sí se ha hecho es
dejar el cambio en el mínimo posible: **toda** la lógica (consulta, ámbito de
centro, permiso, muro de plan y componentes) vive en `src/app/(app)/etiquetas/`
y en `src/lib/tags*.ts`, que son de E1.

| Fichero | Dueño | Qué se le ha hecho |
|---|---|---|
| `src/app/(app)/members/[id]/page.tsx` | sin dueño explícito (M4 tiene `[id]/actions.ts`, que NO se toca) | 2 líneas: un `import` y `<MemberTagsSection user={session.user} memberId={member.id} />` bajo las píldoras de la cabecera. El componente es de E1 y trae dentro su consulta, su ámbito de centro y su gateo por plan |
| `src/app/(app)/members/page.tsx` | M2 | eje de filtro nuevo: `tag` en la selección, dos consultas de E1 (`listTagOptions`, `tagKeysByMember`), el grupo «Etiqueta» del riel y `railAxes={[MEMBER_AXIS.tag]}` —el eje no tiene columna donde colgar su filtro, así que sin eso solo se vería en móvil— |
| `src/app/(app)/members/members-filters.ts` | M2 (por vecindad) | eje `tag` en `MEMBER_AXIS`, `tagKeys` en `MemberFilterRow`, `tag` en `MemberSelection` y su rama en `matchesMemberFilters` / `memberFacetCounts`. Es el **único eje multi-valor por fila**: un socio tiene varias etiquetas y la fila casa si comparte alguna con la selección (OR dentro del eje, como los demás) |
| `src/app/api/jobs/run/route.ts` | compartido | la línea del motor (`runMemberTagRule`), la que el plan ya reservaba a E1. Va **después** de `scheduledCancellations`, que es lo que mueve socios a CANCELLED: si fuera antes, las etiquetas de la pasada describirían el estado de la pasada anterior |

`src/lib/members-queries.ts` **no se ha modificado**: el motor solo *importa*
`lastAttendanceByMember` de ahí, que es justo lo que pedía el encargo para no
tener dos verdades sobre la última visita de un socio.

## Si M2 prefiere aplicarlo de otra manera

Lo único negociable es la presentación: si M2 quiere el eje de etiqueta como
columna de la tabla en vez de como píldora del riel, es cambiar el grupo de
sitio — la selección, el recuento por opción y el filtrado ya están resueltos en
`members-filters.ts` y no dependen de dónde se pinte el disparador.

Lo que no se puede mover sin romper E14-23 es que el filtro exista y que las
etiquetas se vean en la ficha.

## Cómo se ha comprobado

`npm run lint` · `npx tsc --noEmit` · `npm run test:unit` (1.251 en verde) ·
`npx playwright test e2e/etiquetas.spec.ts e2e/members-bonos-calendario.spec.ts e2e/planes-gateo.spec.ts`
(19 en verde: los de E1, los de la ficha de socio de M2 y los del gateo).
