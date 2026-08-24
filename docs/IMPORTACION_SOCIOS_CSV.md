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

5. A los socios **nuevos** con email se les crea una invitación y se les envía
   el email de acceso, salvo que dirección desmarque la casilla
   **«Enviar el email de acceso a los socios nuevos»**.

## Email de acceso y datos que faltan

La importación trae lo justo para identificar a la persona. En el export de
referencia, `Dirección 1/2`, `Ciudad`, `C.P.` y `Provincia` vienen en blanco en
casi todas las filas, `Teléfono` está vacío (el número real viaja en `Móvil`) y
no hay ninguna columna de contacto de emergencia. Dirección no puede
inventárselos, así que **se le piden al socio la primera vez que entra**
(`src/lib/member-first-session.ts`).

El email va marcado por defecto y se puede desmarcar: migrar la cartera activa
quiere que a todos les llegue su acceso, pero cargar un histórico de ex clientes
no debe disparar cientos de emails a gente que ya no entrena allí. Solo se envía
a los socios dados de alta **en esa pasada** —reenviarlo en cada corrección del
CSV sería spam, y `Invitation.memberId` es único— y nunca a quien ya tenga la
ficha activada.

### El muro de la primera sesión

Al entrar al portal, y antes de poder usarlo, el socio pasa por lo que le falte:

1. **Datos esenciales** — fecha de nacimiento, teléfono, CP, dirección, ciudad,
   provincia y contacto de emergencia. Solo se le piden los que estén vacíos. El
   CP es el que alimenta el mapa de calor por barrios del cuadro de mando
   (`getPostalCodeMapData`); sin él, el socio no aparece en ninguna métrica de
   zona.
2. **Su parte de la valoración inicial** — perfil, experiencia y constantes.

El muro **no tiene salida** (solo cerrar sesión) y se devuelve *en lugar* del
portal, no como un modal encima: todo lo que pregunta lo puede contestar el
propio socio en un minuto, así que un «ahora no» equivaldría a no pedirlo nunca.
Es la diferencia deliberada con el aviso de valoración vencida
(`pending-assessment-gate.tsx`), que **sí** se puede descartar porque allí se
pide una revisión que solo cierra el entrenador.

### La valoración inicial se rellena a dos manos

F3 dejó la valoración entera del lado del entrenador porque es él quien firma el
PAR-Q con el socio delante y quien interpreta el screening. Eso no cambia; lo
que se añade es un primer tramo de autoservicio:

| Lo rellena | Secciones |
|------------|-----------|
| El socio, al entrar | Perfil (edad, sexo, altura, objetivos, motivación), experiencia y constantes (peso, dolor, sueño, estrés, energía, días/semana) |
| El entrenador, en el centro | Screening de salud, marcas físicas (dominadas, plancha, circuito), notas y PAR-Q |

`Assessment.memberPartAt` marca el primer tramo. No vale un `completedAt` a
medias: sin PAR-Q firmado no se puede propagar nada a `HealthRecord`, que es la
puerta del Art. 9. El entrenador se encuentra el formulario **ya escrito y
editable** —si al medir resulta que el socio se puso 4 cm de más, corregirlo
ahora es más barato que arrastrar una altura falsa a todos sus IMC.

La valoración se abre al terminar el onboarding, no en la pasada del cron: quien
se dé de alta por la tarde entraría si no sin valoración que rellenar. Las
valoraciones ya cerradas se quedan con `memberPartAt` a null a propósito —se
rellenaron enteras del lado del entrenador, la única vía que existía antes— y el
muro solo mira las que siguen abiertas, así que ningún socio con su valoración
hecha se lo encuentra.

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
