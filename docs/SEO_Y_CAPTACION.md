# SEO y captación pública

La capa pública de Apta: qué páginas existen, qué se indexa y qué no, qué marcado
llevan, cómo se mide y qué estrategia de contenidos hay detrás.

Punto de partida de la épica E9: **cuatro URLs indexables** (`/planes`,
`/privacidad` y las dos plantillas de centro), cero analítica, cero Search
Console, cero eventos y cero datos estructurados. Todo el trabajo de SEO era,
literalmente, opinión.

---

## 1. Las páginas públicas

### 1.1 Comerciales

| Ruta | Qué es |
|---|---|
| `/` → `/planes` | Portada comercial: producto, planes y FAQ. Es la que manda |
| `/funcionalidades` y `/funcionalidades/[slug]` | Una página por capacidad del producto |
| `/para/[vertical]` | Una página por tipo de centro |
| `/centros` y `/centros/[ciudad]` | Directorio de centros publicados, por ciudad |
| `/app` | Ficha pública de la app nativa |
| `/privacidad`, `/cookies` | Legales |

**Seis páginas de funcionalidad**, derivadas de `CORE_FEATURES` —no escritas
aparte—: `gestion-de-socios`, `agenda-y-reservas`, `cobros-y-morosidad`,
`portal-del-socio-y-app`, `crm-de-leads` y `multicentro-y-personal`. Si alguien
añade una capacidad al catálogo comercial sin darle página, **el build falla**:
`landing-pages.ts` lanza en tiempo de carga.

**Tres verticales**: `box-crossfit`, `entrenamiento-personal` y `pilates`.

### 1.2 De cada centro

| Ruta | Qué es |
|---|---|
| `/hazte-socio/[org]/[centro]` | Alta como socio, con checkout |
| `/lead-form/[org]/[centro]` | Formulario de contacto. **Canoniza hacia `/hazte-socio`** y no se indexa |

Las dos plantillas tenían metadatos **estáticos** pese a que el nombre del centro
está disponible en el render: cien centros eran cien URLs con el mismo título y
el mismo cuerpo salvo el `<h1>`. Google los agrupa, elige una canónica y las
noventa y nueve restantes desaparecen — es decir, la propuesta de valor «cada
centro con su página» no existía funcionalmente. `src/lib/public-center-seo.ts`
compone título, descripción y canónica por centro, y el campo que de verdad
decide si eso posiciona es el **párrafo propio del centro**.

La publicación de una ficha de centro es un **interruptor, apagado por defecto**:
los datos de un centro no se publican sin que alguien lo decida.

---

## 2. Reglas de indexación

Viven en **un solo sitio**, `src/lib/seo.ts`, derivadas de `PUBLIC_PATHS`: la
lista de lo que se sirve sin sesión y la de lo que se indexa no pueden vivir en
dos ficheros que se desincronicen.

`robots.txt` es una **lista blanca**: `Disallow: /` de fondo y `Allow` solo para
lo publicable. Enumerar lo privado exigiría mantener a mano una lista que nadie
recordará actualizar; al revés, **una pantalla nueva nace fuera del índice**, que
es el fallo seguro.

### 2.1 Público no es lo mismo que indexable

`INDEXABLE_PATHS` es un subconjunto estricto de `PUBLIC_PATHS`, y hay un test que
lo comprueba. `/login`, `/activar`, `/demo-checkout`, `/servicio-no-disponible`,
`/lead-form`, `/hazte-socio/gracias`, `/r/` y `/api/` son públicas y no pintan
nada en una SERP.

### 2.2 Las rutas con token

`/onboarding`, `/verificar-email`, `/recuperar-clave`, `/gestionar-suscripcion`,
`/preferencias`, `/baja` y `/formulario` llevan un token firmado **dentro de la
propia URL** y viajan en el pie de los correos transaccionales.

> Un `/gestionar-suscripcion/<token>` indexado es acceso sin contraseña al método
> de pago de una persona, expuesto en la SERP: **un incidente de datos
> personales, no un problema de posicionamiento.**

Por eso llevan `index:false, follow:false, nocache: true` **y**
`referrer: "no-referrer"`. Esta última mitad no es de SEO: sin ella, cualquier
recurso de terceros que cargue la página —o un enlace de salida— manda la URL
completa, token incluido, en la cabecera `Referer`.

Se escriben además una a una en `Disallow` aunque el `Disallow: /` final ya las
cubriría: un `robots.txt` es también documentación operativa, y quien lo audite
tiene que poder leerlo sin deducirlo de un comodín.

### 2.3 Todo lo privado

`index:false, follow:false`. `follow:false` a propósito: desde una pantalla
autenticada no hay nada que Google deba seguir.

---

## 3. Sitemap

`src/app/sitemap.ts`, dinámico (`force-dynamic`): el juego de centros publicados
cambia sin desplegar.

Incluye las estáticas indexables, las nueve páginas de captación, las ciudades
del directorio y la ficha de cada centro publicado, con la fecha real de
`updatedAt`. Las prioridades: `/planes` 1 · `/centros` y `/funcionalidades` 0,8 ·
fichas de centro 0,7 · ciudades y páginas de captación 0,6 · legales 0,3.

Lo que **no** entra, y por qué:

- `/lead-form`, porque canoniza hacia `/hazte-socio`: un sitemap que propone una
  URL canonizada hacia otra es una contradicción que Google resuelve ignorando el
  sitemap.
- Nada con token, ni `/portal`, ni `/dashboard` — se deriva de
  `INDEXABLE_PATHS`, así que no hay forma de colar una a mano.

Un apunte histórico que explica la mitad del problema: hasta E9-01, el matcher
del proxy rebotaba los `.txt`, así que `/robots.txt` respondía **307 a `/login`**
y Googlebot lo leía como «no disponible».

---

## 4. Datos estructurados (JSON-LD)

`src/lib/json-ld.ts`, módulo puro. Dos reglas lo gobiernan, y las dos son de
**mejor nada que a medias**:

1. **Marcado incompleto es peor que ausente.** Un `SportsActivityLocation` sin
   dirección ni coordenadas no gana nada y sí puede acarrear una acción manual
   por datos estructurados inválidos. Por eso el constructor devuelve `null`.
2. **Nunca un precio que no sea el que se cobra.** `PlatformPlan.priceLabel` es
   presentación («desde 49 €/mes»); marcarlo como `price` sería afirmar un importe
   que puede no coincidir con el cargo real. En la ficha de centro el importe sí
   es canónico: es el que se cobra.

Qué se emite: `Organization` en el layout raíz · `FAQPage` en `/planes`,
**derivado del array `FAQS`** y no escrito a mano (si mañana cambia una respuesta
y el JSON-LD sigue diciendo lo anterior, el resultado enriquecido enseña algo que
la página no dice, y *eso* sí es motivo de penalización) · `SportsActivityLocation`
en la ficha de centro, con dirección, coordenadas, horario y ofertas.

La forma se comprueba en `json-ld.test.ts` (contexto, tipo, campos obligatorios,
precios, escapado de `</script>`). Lo que falta es la validación externa contra
una URL pública real — ver `seo/linea-base.md`.

### App Links / Universal Links

`apple-app-site-association` y `assetlinks.json` siguen el mismo criterio: los dos
constructores devuelven `null` y las rutas responden 404 con cuerpo explícito
hasta que existan `APPLE_TEAM_ID`, el `bundleIdentifier`, el `package` de Android
y la huella SHA-256 del certificado. Un `assetlinks.json` con un paquete
equivocado no falla con un error visible: la verificación falla **en silencio** y
el enlace universal deja de abrir la app sin que nadie lo note.

---

## 5. Analítica y medición

`src/lib/analytics.ts` + `src/components/analytics.tsx`.

**Sin cookies, y no GA4.** Una analítica sin cookies no trata datos personales
identificables ni almacena información en el terminal, así que no exige
consentimiento previo (art. 22.2 LSSI) y la landing **no arrastra banner**. Un
banner en la única página comercial que existe cuesta conversión y añade CLS por
encima del hero. Si algún día se optase por GA4, tendría que ser con Consent Mode
v2 y una CMP con «rechazar todo» al mismo nivel visual que «aceptar todo» — y
entonces esta decisión habría que reabrirla.

**Por entorno, no en el código.** Sin `NEXT_PUBLIC_ANALYTICS_DOMAIN`,
`analyticsConfig()` devuelve `null` y no se carga nada: es lo correcto en
desarrollo, en CI y en cualquier vista previa, donde medir es contaminar la
medición de producción. El proveedor por defecto es Plausible y el `src` se deja
configurable para poder autoalojarlo.

### Eventos de conversión

| Evento | Dónde | Qué significa |
|---|---|---|
| `checkout-plataforma` | `/planes` | Un gimnasio inicia la compra de la licencia |
| `checkout-centro` | `/hazte-socio/[org]/[centro]` | Una persona inicia el alta como socio |
| `lead-enviado` | `/lead-form/[org]/[centro]` | Un lead entra en el CRM del centro |

Un único escuchador, en **fase de captura**, marcado con `data-tz-conversion`:
así nadie tiene que acordarse de llamarlo y un `preventDefault` del manejador del
formulario no puede dejar el evento sin contar. `lead-enviado` se cuenta al
**responder** la acción de servidor, no al enviar: contar el envío contaría
también los que fallan.

### Línea base

`seo/linea-base.md` guarda la medición de la semana 0 y las casillas de
validación externa pendientes. **Sin la fila de la semana 0 anotada no hay
comparación posible**, y la regla del documento es que no se rellena con cifras
inventadas: hasta que el dominio esté verificado, la fila correcta es la vacía.

Verificación de Search Console: preferentemente por **DNS** (cubre el dominio y
sus subdominios y sobrevive a un redespliegue); `GOOGLE_SITE_VERIFICATION` queda
como segunda vía, que es la que sobrevive a un cambio de proveedor de DNS.

---

## 6. Estrategia de contenidos

El diagnóstico que originó las páginas de captación: se competía con **cuatro
URLs** contra Trainingym, Mindbody, Virtuagym, Glofox y AimHarder, todos con
blogs de cientos de artículos. No se compite con cuatro URLs, se compita como se
compita.

La respuesta **no fue inventar producto**: el contenido ya estaba escrito —
`CORE_FEATURES` enumera lo que hace el producto y el hero ya nombraba los
verticales. Lo que hicieron las páginas de captación es darle a cada cosa su URL,
su consulta y su párrafo. De ahí la regla de redacción: **nada que el producto no
haga ya**, tres a cinco puntos concretos por página, y un solo párrafo de entrada
— la página no es un folleto.

La otra mitad del problema era la **orfandad**: ninguna página pública tenía
`generateStaticParams` y no había un índice interno que enlazara a los centros.
Si el gimnasio no publicaba la URL en su propia web, Google no llegaba jamás. El
sitemap es una mitad de la respuesta y `/centros` es la otra, que además resuelve
la orfandad para un visitante humano.

Si a los tres meses las impresiones de `/planes` no se mueven, el problema no es
de metadatos: es que cuatro URLs no compiten contra cientos de artículos.

---

## 7. Cookies

Hoy solo hay **técnicas**: la sesión de Auth.js y `tz` (zona horaria).
Inventariadas en `/cookies`. **Sin banner, porque ninguna lo exige.**

> Cualquier cambio que añada analítica con cookies, publicidad o cualquier cookie
> no estrictamente técnica debe traer **en el mismo cambio** un CMP con «rechazar
> todo» al mismo nivel visual que «aceptar todo», y actualizar el inventario de
> `/cookies`.

---

## 8. Rendimiento

E9-08 bajó el First Load JS de `/planes` de **672,6 KB a 578,6 KB** sin
comprimir, medido sumando los `<script src>` que sirve la página en producción.
Es la referencia contra la que comparar Core Web Vitals.
