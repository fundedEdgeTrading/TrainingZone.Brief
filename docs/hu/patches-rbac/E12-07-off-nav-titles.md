# E12-07 · retirar tres rutas muertas de `OFF_NAV_TITLES`

`src/lib/rbac.ts` está congelado este trimestre. E12-07 borra las páginas de
redirect duplicado de `/portal/plan` y `/portal/comprar` (el 308 de
`next.config.ts` ya las resuelve; los `page.tsx` con su propio `redirect()`
eran el segundo redirect inalcanzable) y confirma que `/portal/chat` no tenía
ese problema (nunca tuvo entrada en `next.config.ts`, solo el `redirect()` de
su propio `page.tsx`, que sigue siendo necesario y no se toca).

Cambio pendiente en `rbac.ts` (pídase en la ventana de merge):

```diff
 export const OFF_NAV_TITLES: Record<string, string> = {
   "/mapa-barrios": "Mapa de barrios",
   "/mi-perfil": "Mi perfil",
   "/portal/perfil": "Mi perfil",
   "/portal/chat": "Chat con tu centro",
-  "/portal/comprar": "Comprar o renovar",
-  "/portal/plan": "Mi plan",
 };
```

`/portal/chat` se queda: sigue siendo una ruta real (con su propio
`redirect()", sin duplicado) y su título sigue haciendo falta si alguna vez
se llega a pintar esa cabecera antes de que el `redirect()` navegue. `/portal/comprar`
y `/portal/plan` ya no existen como páginas (E12-07): dejar sus entradas en
`OFF_NAV_TITLES` sería declarar el título de una ruta que ya no se puede
visitar por dentro de la app (el 308 de red la intercepta antes).

No hace falta tocar `PARENT_ROUTE`: nunca tuvo entradas para estas tres
rutas (solo `/mapa-barrios`).
