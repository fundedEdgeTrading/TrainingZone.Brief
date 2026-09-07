# Geometría de barrio por ciudad (E11-08)

Un fichero por ciudad, `<slug-de-ciudad>.topo.json`, servido por
`GET /api/geo/[ciudad]`. **Este directorio está vacío a propósito**: hasta que se
publique la geometría de una ciudad, el mapa usa `tessellate()` (Voronoi sobre el
centroide de cada CP) y la leyenda lo declara. Es el respaldo, no una avería.

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
