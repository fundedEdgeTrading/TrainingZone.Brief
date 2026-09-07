# Línea base de SEO · semana 0

> E9-09. Este fichero existe para que dentro de tres meses se pueda decir si el
> trabajo de la épica E9 sirvió de algo. **Sin la fila de la semana 0 anotada, no
> hay comparación posible**: cualquier mejora posterior será una opinión, que es
> exactamente el punto de partida que la épica venía a cambiar.

## Qué hay que dejar montado antes de poder anotar nada

1. **Verificar el dominio en Google Search Console**, preferentemente por **DNS**
   (registro `TXT` en el proveedor del dominio). Cubre el dominio entero y sus
   subdominios y no se pierde al redesplegar.
   - Como segunda vía queda la meta de la aplicación: se rellena
     `GOOGLE_SITE_VERIFICATION` y el layout raíz la emite
     (`metadata.verification.google`). Es la que sobrevive a un cambio de
     proveedor de DNS.
2. **Enviar el sitemap** en Search Console: `https://<dominio>/sitemap.xml`
   (E9-06). Comprobar que responde 200 y no 307 — eso es lo que arregló E9-01.
3. **Configurar la analítica sin cookies**: `NEXT_PUBLIC_ANALYTICS_DOMAIN`. Sin
   ella no se carga ningún script y no se mide nada.

## La medición de la semana 0

Search Console → Rendimiento → filtrar por página `=/planes`, rango **últimos 28
días**, y anotar:

| Fecha de la toma | Página | Impresiones | Clics | CTR | Posición media |
| --- | --- | --- | --- | --- | --- |
| _(pendiente: se anota el día que se verifique el dominio)_ | `/planes` | | | | |

> No se rellena con cifras inventadas ni con estimaciones. Hasta que el dominio
> esté verificado, la fila correcta es la vacía: un número puesto "a ojo" en la
> línea base convierte cualquier comparación futura en ruido.

Conviene anotar además, el mismo día:

- **Número de URLs indexables**: hoy eran cuatro (`/planes`, `/privacidad` y las
  dos plantillas de centro). Con E9-11 y las fichas de centro publicadas
  (E9-05/E9-06) esa cifra sube, y es la métrica que explica el resto.
- **First Load JS de `/planes`**: E9-08 lo bajó de **672,6 KB a 578,6 KB** sin
  comprimir (medido sumando los `<script src>` que sirve la página en
  producción). Es la referencia contra la que comparar Core Web Vitals.

## Eventos de conversión

Los tres que la analítica registra (ver `src/lib/analytics.ts`):

| Evento | Dónde se dispara | Qué significa |
| --- | --- | --- |
| `checkout-plataforma` | `/planes` | Un gimnasio inicia la compra de la licencia de Apta |
| `checkout-centro` | `/hazte-socio/[org]/[centro]` | Una persona inicia el alta como socio de un centro |
| `lead-enviado` | `/lead-form/[org]/[centro]` | Un lead entra en el CRM del centro |

`lead-enviado` se cuenta al **responder** la acción de servidor, no al enviar el
formulario: contar el envío contaría también los que fallan.

## Cadencia

Revisar el mismo cuadro **al mes, a los tres meses y a los seis**. Si a los tres
meses las impresiones de `/planes` no se mueven, el problema no es de metadatos:
es de que cuatro URLs no compiten contra blogs de cientos de artículos, y la
respuesta está en E9-11.

## Cierre pendiente de E9-07 · validación externa del marcado

El JSON-LD se valida en test por su forma (`src/lib/json-ld.test.ts`: contexto,
tipo, campos obligatorios, precios que sí se cobran, escapado de `</script>`).
Eso cubre lo que se puede comprobar sin desplegar, pero **no sustituye a las dos
validaciones externas** que la historia pone como criterio de cierre y que solo
se pueden hacer contra una URL pública real:

- [ ] **Rich Results Test** (`https://search.google.com/test/rich-results`) sobre
      `/planes` — debe detectar `FAQPage` sin advertencias.
- [ ] **Rich Results Test** sobre la ficha de un centro publicado — debe detectar
      `SportsActivityLocation` con dirección, coordenadas y horario.
- [ ] **validator.schema.org** sobre las dos anteriores, que es más estricto que
      el de Google y avisa de propiedades mal tipadas que Google ignora.

Hasta que estas tres casillas estén marcadas, el marcado está escrito pero no
dado por bueno.
