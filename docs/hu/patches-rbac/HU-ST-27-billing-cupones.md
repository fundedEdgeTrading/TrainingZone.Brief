# HU-ST-27 · `/billing/cupones`, ruta nueva: gate y título en `rbac.ts`

`src/lib/rbac.ts` está congelado este trimestre. HU-ST-27 añade la pantalla
`/billing/cupones` (alta de códigos promocionales y medición de lo que ha
traído cada uno), y una ruta nueva obliga a tomar dos decisiones que viven en
ese fichero. Una **no necesita cambio** y se deja escrita aquí para que no se
lea como un olvido; la otra sí, y es cosmética.

## 1 · Gateo por plan: **no se gatea**, y no es un olvido

`FEATURE_BY_ROUTE` no lleva entrada nueva. `/billing` no está gateado —cobrar
entra en todos los planes— y la herencia por prefijo (E6-02) hace que
`/billing/cupones` tampoco lo esté.

Es la misma decisión que `/audit` (E6-07 / D-C7): lo que se gatea es la
inteligencia construida encima de los datos, no la operación del propio
gimnasio. Un código de descuento es una forma de cobrar; dejarlo fuera del plan
Esencial significaría que un gimnasio no puede hacer una promoción de verano con
la pasarela que ya está pagando, mientras la landing presume de **"cero comisión
sobre tus cobros"** (E6-05, y HU-ST-28 en este mismo lote). La medición que trae
la pantalla tampoco es BI de panel: son las ventas de sus propios códigos, en su
propio ámbito de centro.

**Está fijado en test**: `src/lib/stripe-coupons-gate.test.ts` comprueba que
`FEATURE_BY_ROUTE["/billing"]` y `FEATURE_BY_ROUTE["/billing/cupones"]` siguen
sin entrada y que la pantalla, coherentemente, no llama a `requireFeature`. La
otra mitad ya estaba mecanizada: `rbac-gating.test.ts` (E6-02) recorre todas las
páginas de `(app)` y exige `requireFeature` a cualquiera que herede un gate, así
que el día que alguien decida gatear esto, CI se pone en rojo hasta que la
pantalla llame a la guarda. **La ruta no puede quedarse medio gateada.**

Si dirección decidiera lo contrario, el cambio sería una línea —y la pantalla
tendría que añadir la guarda en el mismo commit:

```diff
 export const FEATURE_BY_ROUTE: Record<string, PlatformFeature> = {
   "/feedback": "feedback_direccion",
+  "/billing/cupones": "bi_avanzado",
   "/brief": "salud_aptitud",
```

## 2 · Título de cabecera (esto sí es un cambio pendiente)

`getPageTitle` resuelve por prefijo más largo sobre `NAV_BY_ROLE`, así que hoy
`/billing/cupones` hereda el rótulo **"Cobros"** de `/billing`. Funciona, pero la
cabecera de la pantalla de cupones dice "Cobros". Lo que se pediría en la ventana
de merge:

```diff
 export const OFF_NAV_TITLES: Record<string, string> = {
   "/mapa-barrios": "Mapa de barrios",
   "/mi-perfil": "Mi perfil",
+  "/billing/cupones": "Cupones",
   "/portal/perfil": "Mi perfil",
```

Y, con él, la vuelta al sitio del que cuelga:

```diff
 export const PARENT_ROUTE: Record<string, string> = {
   "/mapa-barrios": "/dashboard",
+  "/billing/cupones": "/billing",
 };
```

`PARENT_ROUTE` es necesario junto con `OFF_NAV_TITLES`: `activeNavHref` deja de
buscar por prefijo en cuanto la ruta tiene título propio, así que sin la entrada
el item "Cobros" del menú se quedaría sin marcar mientras se está dentro de
cupones.

**Mientras tanto** la pantalla no queda coja: `PageHeader` lleva su propio
`kicker="Cupones"` y un enlace explícito "Volver a Cobros", que es exactamente lo
que daría `PARENT_ROUTE`. En cuanto `rbac.ts` se descongele, ese enlace puede
retirarse.

## 3 · Entrada de menú: **no la lleva, a propósito**

No se pide item en `NAV_BY_ROLE`. La pantalla cuelga de Cobros y se llega desde
ahí; un menú con una entrada por cada subpantalla de facturación es justo lo que
el rediseño del NavBar quitó. El enlace de entrada vive en `/billing`.
