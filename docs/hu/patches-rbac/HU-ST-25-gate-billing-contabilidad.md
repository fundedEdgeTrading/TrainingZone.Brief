# HU-ST-25 · gate de plan para `/billing/contabilidad` (`rbac.ts` congelado)

`src/lib/rbac.ts` está congelado este trimestre, y `FEATURE_BY_ROUTE` vive
ahí. HU-ST-25 añade una ruta nueva, `/billing/contabilidad`, que **tiene que
ir gateada** con `exportaciones`: es la pantalla desde la que los cobros de
todos los socios salen del sistema en un CSV, el mismo criterio que ya se
aplica a `api/audit/export` y a `api/export/payments`.

Cambio pendiente (pídase en la ventana de merge):

```diff
 export const FEATURE_BY_ROUTE: Record<string, PlatformFeature> = {
   "/feedback": "feedback_direccion",
   "/brief": "salud_aptitud",
   "/health/aptitude-rules": "salud_aptitud",
   "/health/reference-ranges": "salud_aptitud",
+  // HU-ST-25 · el extracto contable saca del sistema los cobros de todos los
+  // socios del ámbito. `/billing` NO se gatea —es la pantalla de trabajo
+  // diario de recepción y cerrarla dejaría a un cliente Esencial sin poder
+  // cobrar—, así que el gate se declara en la hija, no en el padre.
+  "/billing/contabilidad": "exportaciones",
 };
```

Ojo con la herencia (E6-02): declarar `/billing` en vez de la hija cerraría
Cobros entero. La entrada tiene que ser exactamente la hija.

## Mientras tanto

La pantalla ya está protegida sin tocar `rbac.ts`:

- `page.tsx` llama a `requireFeature("exportaciones")` justo después de
  `requireRole(["OWNER", "CENTER_DIRECTOR"])`, así que escribir la URL a mano
  redirige a `/planes?feature=exportaciones` igual que si el mapa lo declarase.
- La acción de descarga (`downloadAccountingCsvAction`) vuelve a comprobar el
  plan con `orgHasFeatureNow` y devuelve el motivo en vez de redirigir, porque
  una acción de servidor que redirige deja al botón sin nada que enseñar.
- `contabilidad-gate.test.ts` comprueba las **dos** mitades: que la pantalla
  llama a la guarda y que esta petición sigue en pie mientras la ruta no esté
  en `FEATURE_BY_ROUTE`. El día que se aplique el diff, ese test señala este
  fichero para que se borre: no se puede quedar una ruta con el gate declarado
  en dos sitios.

## Navegación (opcional, misma ventana)

`/billing/contabilidad` no tiene entrada de menú y no la necesita: se llega
desde Cobros. Cuando `rbac.ts` se descongele conviene añadir su título para la
cabecera, que hoy resuelve por prefijo y pinta "Cobros":

```diff
 export const OFF_NAV_TITLES: Record<string, string> = {
   "/mapa-barrios": "Mapa de barrios",
   "/mi-perfil": "Mi perfil",
+  "/billing/contabilidad": "Contabilidad",
 };
```

El enlace de ida desde `/billing` **no** lo pone esta pista: `billing/page.tsx`
es de P1. La vuelta ("Volver a Cobros") sí está, en la propia pantalla nueva.
