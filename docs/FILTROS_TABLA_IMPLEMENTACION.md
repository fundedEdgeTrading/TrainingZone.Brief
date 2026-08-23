# Filtros de tabla unificados — implementación

Implementa el handoff «filtros de tabla unificados». Sustituye la tarjeta
`FilterBar` de ~330 px con botón **Filtrar** por un único modelo de filtro que
se aplica al instante, en dos presentaciones del mismo componente.

## Qué variante lleva cada vista

| Vista | Variante | Ejes |
|---|---|---|
| `/members` | **1b · filtros en columna** | Centro, Estado, Plan, Alta — cada uno en la cabecera de su columna; búsqueda y recuento en un riel dentro de la tarjeta |
| `/leads` | **1a · barra unificada** | Centro, Tipo de cierre, Canal, Responsable |
| `/feedback` | **1a** | Centro, Alineación + Orden (píldora de selección única) |
| `/audit` | **1a** | Acción + rango de fechas (dos `date` dentro del panel); «Exportar CSV» hereda los filtros |
| `/billing` | píldora suelta | Estado del pago (no lleva barra: no hay búsqueda) |

El tablero de Leads y el listado de Feedback no tienen columnas donde colgar un
filtro, así que la barra (1a) es el patrón unificador; 1b solo aplica donde hay
tabla, y en `/members` es lo que hace que el listado empiece en pantalla.

## Piezas

```
src/lib/use-popover-position.ts    colocación compartida del panel flotante
                                   (extraída de field.tsx::Select, que ahora la usa)
src/lib/filter-params.ts           parseo de un eje desde la URL (server-safe)
src/lib/use-table-filters.ts       estado de filtros en la URL: debounce, reset de página
src/components/ui/filter-menu.tsx  panel multi-selección (portal + hoja móvil)
src/components/ui/filter-toolbar.tsx  variante 1a + tira de chips + barrido dorado
src/components/ui/filter-rail.tsx     riel de 44 px de la variante 1b
src/components/ui/column-filter.tsx   glifo de embudo en la cabecera de columna
src/components/ui/data-table.tsx      props `density`, `toolbar`, `column.filter`,
                                      `column.filterActive`, `column.cardClassName`
```

`src/components/ui/filter-bar.tsx` y `feedback/feedback-filter-bar.tsx` quedan
borrados: no había más call-sites.

## Decisiones

- **La URL es la fuente de verdad.** Se escribe con `router.replace(...,
  { scroll: false })` dentro de `startTransition`: filtrar no llena el historial
  ni salta al principio de la página. Los valores de un eje viajan separados por
  coma (`?state=ACTIVE,TRIAL`): OR dentro del eje, AND entre ejes.
- **Sin botón, hace falta confirmación.** Barrido dorado en el borde inferior
  (`tzSweep`, nueva en `globals.css`), recuento que rueda (`tzRollUp`) y filas
  que vuelven a entrar escalonadas — `DataTable` rearma la entrada cuando cambia
  la referencia de `rows`, que es exactamente lo que pasa al filtrar.
- **Recuentos por opción.** Cada opción enseña cuántas filas quedarían al
  elegirla, lo que evita el callejón sin salida de «filtro → 0 resultados». Se
  calculan sobre una base que solo aplica la búsqueda (`listMemberFilterBase`
  en socios; la lista completa en leads y feedback), no sobre el listado ya
  filtrado.
- **En móvil no hay cabeceras.** Por debajo de 640 px `DataTable` pinta tarjetas,
  así que el riel de `/members` recupera todos los ejes como píldoras. El panel
  se convierte en hoja inferior, igual que `Select`.
- **La tira de chips vive en el riel**, no solo en la barra: con el listado
  vacío es la única forma de deshacer el filtro que lo ha vaciado (por eso el
  riel se pinta también cuando no hay filas).
- **Columnas nuevas de socios**: «Bono» (saldo del bono activo, recortado al
  100 % porque el saldo se puede ajustar a mano, RB-RES-006) y «Última visita»
  (última `Booking` con `status = ATTENDED` sobre `occurrenceDate`, resuelta con
  un `groupBy` sobre los socios de la página). Aparecen a partir de `xl` y `2xl`:
  siete columnas no caben en un portátil sin arrastrar la tabla en horizontal.

## Fuera de alcance (preguntas abiertas del handoff)

1. **Eje «Responsable» en socios**: no hay responsable de un socio en el modelo
   (no existe `Member.assignedTrainerId`) y de dónde sale —último `Booking`,
   `Subscription` de EP…— es una decisión de negocio pendiente. El eje está
   especificado en el handoff pero no implementado. En leads sí existe
   (`Lead.ownerUserId`) y ahí sí está.
2. **Última visita**: se calcula solo sobre `Booking.status = ATTENDED`. Queda
   por confirmar si debe contar también `CheckIn`.
3. **Ámbito por rol**: el eje Centro se ofrece a todos los roles con acceso al
   listado. Si Recepción no debe verlo, hay que filtrar la lista de ejes por
   `rbac` en el server component.
4. **Vistas guardadas**: fuera de alcance por decisión del cliente.
