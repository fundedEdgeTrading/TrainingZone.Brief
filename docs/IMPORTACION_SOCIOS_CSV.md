# Importación de socios desde CSV (RB-IMPORT)

Permite a **dirección** dar de alta socios en bloque a partir de un CSV
exportado de otra plataforma (validado contra un export real de
**MyWellness / Technogym**). Pensado para la migración inicial de un centro
que llega desde otro sistema.

## Quién puede importar

Exclusivo de dirección: `OWNER` (dirección de la organización) y
`CENTER_DIRECTOR` (dirección de centro). Recepción **no** puede importar,
aunque sí pueda dar de alta socios de uno en uno (`canImportMembers` en
`src/lib/rbac.ts`). El botón **«Importar CSV»** aparece en la cabecera del
módulo Socios solo para esos roles.

## Cómo funciona

1. Dirección elige el **centro de destino** (donde se dan de alta los socios
   nuevos) y sube el archivo.
2. El servidor parsea el CSV (`src/lib/member-import.ts`), reconoce las
   cabeceras en español (con o sin acentos) y autodetecta el separador
   (`,`, `;` o tabulador).
3. Cada fila se **inserta o actualiza** (`importMembersCsv` en
   `members/import-actions.ts`). La operación es **idempotente**: reimportar
   el mismo archivo actualiza los socios en vez de duplicarlos.
4. Se devuelve un resumen: altas, actualizados y omitidos (con el motivo por
   fila).

No se envían emails de bienvenida ni se generan invitaciones: es una carga de
datos existentes, no un alta comercial.

## Clave de idempotencia

El emparejamiento con un socio ya existente se hace, por este orden:

1. `externalRef` — el **«Identificador de la nube»** del origen (presente y
   único en el 100 % del export de referencia).
2. `email` dentro de la organización, como respaldo.

Hay un índice único `@@unique([orgId, externalRef])` sobre `Member`.

## Mapeo de columnas → `Member`

| Columna del CSV                  | Campo `Member`        | Notas |
|----------------------------------|-----------------------|-------|
| Nombre                           | `firstName`           | Obligatorio |
| Apellidos                        | `lastName`            | Obligatorio |
| Email                            | `email`               | Se normaliza a minúsculas |
| Teléfono / Móvil                 | `phone`               | Usa Teléfono; si está vacío, cae al Móvil |
| Fecha de nacimiento              | `birthDate`           | `YYYY-MM-DD` o `DD/MM/YYYY` |
| Sexo                             | `sex` (`Sex`)         | Mujer→FEMALE, Hombre→MALE, Otro→OTHER |
| Dirección 1 / Dirección 2        | `address` / `addressLine2` | |
| Ciudad / Provincia / País / C.P. | `city` / `province` / `country` / `postalCode` | |
| Último acceso                    | `lastAccessAt`        | |
| Última interacción               | `lastInteractionAt`   | |
| Fecha de inscripción             | `joinedAt`            | |
| Fecha de creación de la cuenta   | `accountCreatedAt`    | |
| Tipo de contacto                 | `state` (`MemberState`) | Miembro→ACTIVE, Ex cliente→CANCELLED, Cliente potencial→PROSPECT |
| Riesgo de abandono               | `churnRisk` (`ChurnRisk`) | Baja→LOW, Media→MEDIUM, Alta→HIGH |
| Aspiración principal / secundaria| `primaryAspiration` / `secondaryAspiration` | Valor literal (Move/Shape/Power/Sport/Balance/Fun) |
| Cuenta mywellness                | `mywellnessAccount`   | |
| ID externo                       | `externalId`          | |
| Identificador de la nube         | `externalRef`         | Clave de idempotencia |

Las columnas **Instructor Fitness**, **Entrenador personal**, **Entrenador** y
**Permanent Token** se reconocen pero no se mapean por ahora (se ignoran sin
error). El `churnRisk` importado es la señal del sistema de origen; el motor de
retención propio (G.3) sigue calculando su `RetentionAlert` por separado.

## Validaciones por fila

- Nombre y apellidos obligatorios.
- Email con formato válido si viene informado.
- Debe haber al menos una clave estable (`externalRef` o `email`).

Las filas que fallan se **omiten** (no abortan el resto de la importación) y
aparecen listadas en el resumen con su número de fila y motivo.
