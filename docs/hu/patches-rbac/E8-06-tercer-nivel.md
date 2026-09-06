# E8-06 · título y vuelta para las rutas de tercer nivel (`rbac.ts` congelado)

`src/lib/rbac.ts` está congelado este trimestre. E8-06 pide que
`members/[id]/valoraciones/[assessmentId]` y
`members/[id]/mesociclos/[mesocycleId]` tengan título propio en la cabecera
(el `<h1>` de `header.tsx`, ya corregido en esta historia) y vuelta, ampliando
`PARENT_ROUTE` — hoy solo tiene `/mapa-barrios`.

Hoy `getPageTitle`/`activeNavHref` resuelven por coincidencia de prefijo más
larga contra `NAV_BY_ROLE`, así que estas dos rutas de tercer nivel caen en
el nav item `/members` ("Socios") en la cabecera, aunque la propia pantalla
ya pinte su título real en un `<h2>` (corregido en este mismo cambio). Y no
tienen entrada en `OFF_NAV_TITLES`/`PARENT_ROUTE`, así que no hay "vuelta"
declarativa como la de `/mapa-barrios → /dashboard`.

Cambio pendiente (pídase en la ventana de merge):

```diff
 export const OFF_NAV_TITLES: Record<string, string> = {
   "/mapa-barrios": "Mapa de barrios",
   "/mi-perfil": "Mi perfil",
   "/portal/perfil": "Mi perfil",
   "/portal/chat": "Chat con tu centro",
 };
```

No es directamente extensible: `OFF_NAV_TITLES`/`PARENT_ROUTE` son
`Record<string, string>` por **ruta exacta**, y
`members/[id]/valoraciones/[assessmentId]` y
`members/[id]/mesociclos/[mesocycleId]` llevan DOS parámetros dinámicos —
una entrada por pathname exacto no sirve (habría que registrar una por cada
socio y cada valoración/mesociclo, que no es lo que hace este mapa en
ningún otro sitio). Hace falta un mecanismo nuevo, dos opciones:

1. **Patrón con comodín**: `OFF_NAV_TITLES`/`PARENT_ROUTE` pasan a aceptar
   claves con `[id]` literal (p.ej. `"/members/[id]/valoraciones/[id2]"`) y
   `getPageTitle`/`activeNavHref`/`resolveOffNav` (nombre a decidir) hacen
   coincidencia de segmento en vez de string exacto. Cambia la forma del
   mapa y de las tres funciones que lo leen — no es un `diff` de una línea.
2. **La propia página pasa su título**: `src/app/(app)/header-slot.tsx` ya
   tiene el mecanismo de "hueco del header" (`HeaderActionsTarget`) y
   `useHeaderSubtitleOverride`, pero ESE solo sobreescribe el SUBTÍTULO
   (`header.tsx:86`), no el `<h1>`. Haría falta el mismo patrón aplicado al
   título: una tiendecilla de módulo gemela (`titleOverride`,
   `useHeaderTitleOverride`) que estas dos páginas rellenen con el nombre
   real (el de la valoración, el del mesociclo) y que `header.tsx` lea en el
   `<h1>` en vez de `title` a secas. La "vuelta" (botón atrás a
   `/members/[id]`) es un `Link` normal en la propia página — eso no depende
   de nada de esto.

La opción 2 no necesita ningún cambio en `rbac.ts` — se puede implementar ya,
sin depender de la ventana de merge. Se deja señalada aquí en vez de
implementada porque toca `header-slot.tsx`/`header.tsx` (ya tocados dos veces
en esta misma historia y en E12-09) y dos páginas que no están en mi lote de
ficheros (`members/[id]/valoraciones/[assessmentId]/page.tsx`,
`members/[id]/mesociclos/[mesocycleId]/editor.tsx`); prefiero no encadenar un
tercer cambio sobre el mismo componente compartido sin coordinarlo primero
con quien más lo toque.
