# Geometría de barrio por ciudad (E11-08)

Un fichero por ciudad, `<slug-de-ciudad>.topo.json`, servido por
`GET /api/geo/[ciudad]`. Una ciudad sin fichero aquí usa `tessellate()` (Voronoi
sobre el centroide de cada CP) y la leyenda lo declara. Es el respaldo, no una
avería.

## Publicadas

| Fichero | Contornos | Fuente | Licencia |
| --- | --- | --- | --- |
| `zaragoza.topo.json` | CP 50001–50022 del municipio de Zaragoza (INE 50297) | CNIG · CartoCiudad, capa de códigos postales | CC BY 4.0 · © Instituto Geográfico Nacional |
| `santander.topo.json` | CP 39001–39012 del municipio de Santander (INE 39075) | CNIG · CartoCiudad, capa de códigos postales | CC BY 4.0 · © Instituto Geográfico Nacional |

Son **áreas de código postal**, no barrios administrativos: es exactamente la
unidad por la que se agregan socios y leads, así que el color de cada contorno
mide lo que dice medir. El nombre de barrio que se rotula sigue siendo el de
`PostalCodeArea` y es orientativo. La atribución va en la nota de la leyenda
(`geometryNote`) y en el control de atribución del mapa.

Los CP periurbanos 50011 y 50012 incluyen término rural al oeste. No se
recortan (sería inventar un límite); el mapa encuadra sobre los centroides de
los barrios y deja que esas colas salgan del encuadre.

Copia de trabajo de la capa: el repositorio público
`inigoflores/ds-codigos-postales` la publica por provincia en GeoJSON
(`data/ZARAGOZA.geojson`, `data/CANTABRIA.geojson`), procesada desde la descarga
del CNIG. Filtrado previo (municipio y CP urbanos) y paso a `code`:

```sh
node -e '
  const fs = require("fs");
  const g = JSON.parse(fs.readFileSync("ZARAGOZA.geojson"));
  g.features = g.features
    .filter((f) => f.properties.CODIGO_INE === 50297 && /^500[0-2]\d$/.test(f.properties.COD_POSTAL))
    .map((f) => ({ ...f, properties: { code: f.properties.COD_POSTAL } }));
  fs.writeFileSync("zaragoza.src.geojson", JSON.stringify(g));'

npx mapshaper zaragoza.src.geojson -dissolve code -simplify 30% keep-shapes \
  -filter-fields code -rename-layers barrios \
  -o format=topojson quantization=1e5 src/data/geo/zaragoza.topo.json
```

(Santander igual, con `CODIGO_INE === 39075` y `/^390\d\d$/`.) Aquí se usa
`-simplify 30%` y no el 8 % de la receta general: con un CP por barrio la ciudad
entera pesa ~5 KB comprimida, y al 8 % los contornos se volvían poligonales a
zoom de barrio.

## Qué tiene que traer el fichero

- Un objeto llamado **`barrios`** (`BARRIOS_OBJECT` en `src/lib/barrio-geojson.ts`).
- Cada geometría, con `properties.code` = **código postal de cinco dígitos**, que
  es la clave por la que la vista cruza contorno y dato. Un contorno sin `code`
  se descarta.
- Coordenadas en **WGS84 (EPSG:4326)**, `[lng, lat]`, como manda GeoJSON. La
  conversión a `[lat, lng]` para Leaflet la hace `barrio-geojson.ts`, en un solo
  sitio.

## De dónde salen los datos

- **INE · secciones censales** — cobertura nacional, hay que agregar secciones a
  código postal.
- **Portales municipales de datos abiertos** — Zaragoza y Santander publican los
  suyos, y son mejores: el barrio administrativo real, no una agregación.

Comprueba la licencia antes de meter un fichero aquí. La mayoría son CC-BY y
piden atribución, que va en la nota de la leyenda.

## Preproceso

Se simplifica **offline**, nunca en tiempo de ejecución:

```sh
npx mapshaper barrios-zaragoza.geojson \
  -simplify 8% keep-shapes \
  -filter-fields code,name \
  -o format=topojson quantization=1e5 src/data/geo/zaragoza.topo.json
```

- `-simplify 8% keep-shapes` — a escala de ciudad el detalle de portal no se ve;
  `keep-shapes` evita que un barrio pequeño desaparezca al simplificar.
- `-filter-fields code,name` — todo lo demás son kilobytes que el cliente
  descarga y nadie lee.
- `quantization=1e5` — redondea las coordenadas a una rejilla. Es lo que hace que
  una ciudad entre en el presupuesto.

## Presupuesto

**80 KB comprimidos por ciudad.** Lo comprueba `src/lib/barrio-geojson.test.ts`
sobre todos los ficheros de este directorio, así que un fichero que se pase hace
fallar la suite en vez de hundir el mapa en producción.

Si no entra: sube el porcentaje de `-simplify` antes que bajar la
`quantization` — perder vértices se nota mucho menos que perder precisión de
coordenada, que hace que los barrios contiguos dejen de tocarse y aparezcan
rendijas entre ellos.
