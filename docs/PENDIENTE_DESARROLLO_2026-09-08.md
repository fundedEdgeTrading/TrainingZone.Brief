# Lo que queda por desarrollar

**Fecha del corte:** 8 de septiembre de 2026
**Rama medida:** `main` en `06661fe` (Pista T10, PR #213)
**Origen:** `docs/HISTORIAS_USUARIO_2026-09-06.md` — 192 historias
**Plan que se ejecutó:** `docs/RUNBOOK_EJECUCION.md`

---

## Resumen en diez segundos

```
192 historias del catálogo
─ 168  con commit en main          (87,5 %)
─  24  sin empezar                 ≈ 54,8 días-persona

    de esas 24:
      13  Stripe fases 2–4      34,5 d   ← el trozo grande, y es el dinero
       6  bloqueadas por el despacho    9,5 d
       3  backlog de publicación        5,8 d
       2  huecos no previstos           5,0 d   ← empieza por aquí
```

Más un hallazgo que no es una historia y que conviene arreglar antes que
ninguna de ellas: **13 pruebas del alta pago-primero no se ejecutan en CI**.
Está al final, en "El punto ciego de CI".

---

## Estado verificado de `main`

Comprobado el 8 de septiembre, con Postgres levantado y datos de demo
sembrados. No es una impresión: son las órdenes y sus salidas.

| Comprobación | Resultado |
|---|---|
| `npm run lint` | limpio |
| `npx tsc --noEmit` | 0 errores |
| `npm run test:unit` | 955 / 955 |
| `npm run build` | compila |
| `npm run test:e2e` (suite completa) | 125 pasan · 0 fallan · 15 saltadas |
| Los tres specs que CI se salta | 18 / 18, tras corregir un desfase |

Los ocho invariantes del trimestre (`AGENTS.md`) se sostienen: ámbito de centro
también en la API móvil, acceso a salud con `canViewHealthData` + `AuditLog`,
ningún movimiento de saldo sin `SessionLedger`, los cuatro puntos de escritura
de reserva entrando por `checkBookingTransition`, ningún `Price` borrado.

La congelación se respetó al 100 %: `prisma/schema.prisma` solo cambió en el
commit de la migración única del trimestre, y `src/lib/rbac.ts` solo en los
cuatro commits de la ola de costuras S0-A.

---

## Grupo 1 · Los dos huecos no previstos — 5,0 d

Ninguno de los dos entra en las categorías que el plan había apartado a
propósito. Se quedaron fuera sin que nadie lo decidiera.

| HU | Esf. | Pri. | Título |
|---|---|---|---|
| **E1-10** | M | P1 | Rate limiting y protección de fuerza bruta en el login web y móvil |
| E5-09 | M | P2 | Historial de asistencia y de movimientos del bono en la web |

### E1-10 pesa más que su P1

De los **seis bloqueadores técnicos del Anexo II del DPA**, cinco están
cerrados y este es el único que queda:

| Medida | Historia | Estado |
|---|---|---|
| Cifrado de columnas / fotos | E10-20 | hecho (`src/lib/column-crypto.ts`) |
| `AuditLog` inmutable | E10-14 | hecho (trigger `auditlog_append_only`) |
| Cabeceras de seguridad HTTP | E1-09 | hecho (`src/lib/security-headers.ts`) |
| Fugas de ámbito de centro | E1-01, E1-02 | hechas |
| **Rate limiting en el login** | **E1-10** | **pendiente** |

Mientras E1-10 no esté, el anexo de medidas técnicas del DPA no se puede
firmar honestamente. El hallazgo original decía que **12 intentos fallidos
consecutivos contra `/api/mobile/v1/auth/login` se procesan todos**, sin
bloqueo, retardo ni captcha, y que los emails de staff siguen el patrón
predecible `rol.centro@org`. Sigue siendo cierto: lo único que aparece al
buscar rate limiting en el repo es el límite de la API de IA, que no tiene
nada que ver.

### E5-09 está a medias

El libro de movimientos del bono existe, pero **solo en la API móvil**
(`src/app/api/mobile/v1/portal/consumption/route.ts`). La mitad web no se
escribió. Es un caso claro del espejo al revés: por una vez el móvil va por
delante.

---

## Grupo 2 · Stripe, fases 2–4 — 34,5 d

La pista T3 paró tras la fase 1; su propio PR lo dice en el título. Son 13
historias y es el camino por el que entra y sale el dinero.

| HU | Esf. | Pri. | Título | Estado real |
|---|---|---|---|---|
| **HU-ST-12** | L | **P0** | SEPA Direct Debit con mandato | parcial ⚠ |
| HU-ST-16 | S | P1 | Preaviso de cobro | parcial ⚠ |
| **HU-ST-18** | M | **P0** | Dunning con corte de acceso explícito | parcial ⚠ |
| HU-ST-19 | S | P1 | Pantalla de recuperación para el socio | no existe |
| HU-ST-20 | L | P1 | Reembolsos reales y notas de crédito | no existe |
| HU-ST-21 | M | P1 | Disputas y contracargos visibles | no existe |
| HU-ST-22 | S | P2 | Tarjetas por caducar | no existe |
| HU-ST-23 | M | P2 | Neto real, comisiones y payouts | no existe |
| HU-ST-24 | L | P2 | Consola de lectura de Stripe para dirección | no existe |
| HU-ST-25 | M | P2 | Exportación contable para la gestoría | no existe |
| HU-ST-26 | S | P3 | Informes financieros de Stripe bajo demanda | no existe |
| HU-ST-27 | M | P2 | Cupones y códigos promocionales medibles | no existe |
| HU-ST-28 | S | P3 | Comisión de plataforma documentada, NO activada | no existe |

### Qué quiere decir "parcial"

Tres de ellas tienen parte del trabajo hecho por historias vecinas, así que
son más baratas de lo que su estimación sugiere:

- **HU-ST-12** — `sepa_debit` ya está habilitado en el checkout
  (`src/lib/member-billing.ts`). Falta la gestión del mandato en sí.
- **HU-ST-16** — el preaviso SEPA existe (`src/lib/sepa-prenotification.ts` y
  su job), porque lo trajo E10-13 de la pista T8.
- **HU-ST-18** — el mapeo `past_due` / `incomplete` / `paused` → `FROZEN` y
  `canceled` / `unpaid` → `CANCELLED` está escrito en `member-billing.ts`.
  Falta el corte de acceso explícito y lo que ve el socio.

### Qué no existe en absoluto

Verificado buscando en `src/app`: **cero** ficheros para disputas,
contracargos, cupones, exportación contable o pantalla de recuperación. La
única ruta de cobro que existe hoy es `/billing`, que es fase 0–1.

---

## Grupo 3 · Bloqueadas por el despacho — 9,5 d

No dependen de código. Dependen de que el despacho devuelva los borradores de
`docs/legal/` y de que dirección conteste
`docs/legal/00-CUESTIONARIO-DIRECCION.md`, que todavía tiene **18 huecos**
`⟦PENDIENTE⟧` repartidos por el expediente.

| HU | Esf. | Pri. | Título |
|---|---|---|---|
| E10-04 | M | P0 | Contrato de encargado del tratamiento Apta ↔ centro |
| E10-05 | S | P0 | Política de privacidad completa conforme al art. 13 |
| E10-06 | M | P0 | Información precontractual, condiciones, desistimiento y confirmación |
| E10-10 | M | P1 | Registro de actividades, procedimiento de brechas, EIPD y DPD |
| E10-15 | S | P1 | Cláusula informativa laboral |
| E13-03 | XS | P1 | Titularidad de la metodología documentada en el contrato |

Los 9,5 días son solo la parte de programación: montar las páginas y los
flujos una vez los textos estén firmados. El calendario real lo marca el
despacho, entre dos y cuatro semanas, y **no se acorta poniendo más sesiones**.

E10-03 sí se hizo: era la parte que no necesitaba firma de nadie.

---

## Grupo 4 · Backlog de publicación — 5,8 d

Apartadas a propósito en el plan (decisión D-M2). Necesitan cuentas de
desarrollador en App Store y Google Play, que son un trámite con su propio
calendario.

| HU | Esf. | Pri. | Título |
|---|---|---|---|
| E5-15 | M | P1 | Borrado de cuenta desde la app y desde el portal |
| E9-16 | M | P2 | Ficha de tienda: identificadores, capturas, copy y App Links |
| E10-19 | S | P1 | Enlaces legales y gestión de consentimientos dentro de la app |

**E5-15 no es opcional si se publica.** Apple exige borrado de cuenta dentro
de la app para cualquier app que permita crear cuenta, y Google lo pide con su
propio formulario. Sin ella no hay publicación, así que va antes que las otras
dos aunque parezca la menos vistosa.

E10-19 además depende del Grupo 3: no se pueden enlazar textos legales que
todavía no están firmados.

---

## El punto ciego de CI

Esto no es una historia del catálogo. Es un fallo de la red de seguridad, y
por eso va aparte.

### Qué pasó

La pista T7 implementó E9-15, que añadió el paso **"enlaces"** al checklist de
puesta en marcha: de siete pasos a ocho. El spec
`e2e/alta-completa-gimnasio.spec.ts` seguía afirmando `"1 de 7 completados"` y
`"6 de 7 completados"`.

Corregido en la rama `claude/revision-web-movil-2026-oavrac`.

### Por qué nadie lo vio

Ese spec **se salta entero en CI**:

```ts
test.skip(!WEBHOOK_SECRET || !DATABASE_URL, "Requiere STRIPE_WEBHOOK_SECRET y DATABASE_URL en el entorno.");
```

Y `.github/workflows/e2e.yml` deja las claves de Stripe sin definir **a
propósito**, con este comentario:

> Las claves de Stripe se dejan SIN definir a propósito: `/planes` debe
> arrancar en modo demo, que es lo que verifica `planes-gateo.spec.ts`.

Las dos condiciones son incompatibles dentro del mismo job:

| Spec | Necesita |
|---|---|
| `planes-gateo.spec.ts` | `STRIPE_SECRET_KEY` **ausente** |
| `alta-comercial.spec.ts` (4 tests) | `STRIPE_SECRET_KEY` **y** `STRIPE_WEBHOOK_SECRET` presentes |
| `alta-completa-gimnasio.spec.ts` (9 tests) | lo mismo |

Resultado: **13 pruebas del alta pago-primero no corren en ninguna parte.**
Cubren compra → webhook firmado → activación de contraseña → puesta en marcha
completa: el recorrido por el que entra un gimnasio nuevo y su primer pago.

Un decimocuarto test, `notifications.spec.ts:28`, se salta por
`JOBS_CRON_SECRET` y ese sí se arregla con una línea, porque nada depende de
que ese secreto falte.

### El arreglo

Un **segundo job** en `e2e.yml` que corra solo esos tres specs con
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `JOBS_CRON_SECRET` de usar y
tirar. No hacen falta claves reales de Stripe: las pruebas firman sus propios
eventos con el mismo secreto que los verifica, y la verificación de firma es
criptografía local, sin llamada a la API.

Coste aproximado: media jornada. Es lo que más devuelve por hora invertida de
todo este documento.

---

## En qué orden lo haría

**1 · El segundo job de CI.** Media jornada. Todo lo que venga después se
apoya en él, y hoy hay un recorrido de pago sin red.

**2 · E1-10.** 2,5 d. Es el último bloqueador del Anexo II del DPA, y hasta
que no esté hay una puerta de fuerza bruta abierta contra emails predecibles.

**3 · Decidir sobre Stripe fases 2–4.** No es una tarea, es una conversación:
son 34,5 días, más de la mitad de lo que queda. Merece decidirse mirando qué
necesita el piloto de Training Zone de verdad, no despacharse como un hueco en
una lista. Si hay que elegir, HU-ST-12 y HU-ST-18 son las dos P0 y las dos
están ya a medias.

**4 · E5-09.** 2,5 d, y la mitad del trabajo está hecha en la API móvil.

**5 · Los grupos 3 y 4 cuando se desbloqueen.** El despacho manda en el 3; las
cuentas de las tiendas, en el 4. Ninguno de los dos avanza más rápido por
ponerle más gente.

---

## Cómo verificar todo esto por tu cuenta

El repo no traía instrucciones para levantar el entorno completo. Estas son
las que funcionan, y son las que se usaron para medir lo de arriba.

```bash
# 1 · Postgres 16 (viene instalado; la config está en /etc, no en el datadir)
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/16/main \
  -l /tmp/pg.log -o '-c config_file=/etc/postgresql/16/main/postgresql.conf \
  -c listen_addresses=127.0.0.1 -p 5432' start"
su postgres -c "psql -h /var/run/postgresql -U postgres \
  -c \"ALTER USER postgres WITH PASSWORD 'postgres'\""
su postgres -c "psql -h /var/run/postgresql -U postgres -c 'CREATE DATABASE trainingzone'"

# 2 · .env idéntico al de CI (.github/workflows/e2e.yml)
cat > .env <<'EOF'
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/trainingzone?schema=public"
AUTH_SECRET="ci-secret-no-usar-en-produccion"
NEXTAUTH_URL="http://localhost:3000"
CANCELLATION_WINDOW_HOURS="24"
DATA_REGION="frankfurt"
PROGRESS_PHOTO_KEY="Y2ktb25seS1rZXktbm90LWZvci1wcm9kdWN0aW9uISE="
EOF

# 3 · Migrar, sembrar, comprobar
npm ci
npx prisma migrate deploy
npm run db:seed
npm run lint && npx tsc --noEmit && npm run test:unit
npm run build && npm run test:e2e
```

Dos avisos que cuestan media hora si no los sabes:

- **`DATA_REGION` no puede quedar vacía** con `npm run start`. E10-07 detiene
  el arranque a propósito: `npm run start` corre en modo producción y ahí una
  base de datos sin región declarada es un hallazgo, no una comodidad. El
  comentario de `.env.example` que dice que en local se puede dejar vacía solo
  vale en `next dev`.
- **No inventes valores de entorno.** Poner `STRIPE_SECRET_KEY` hace fallar
  cinco tests unitarios que verifican precisamente el modo demo y el aviso de
  Connect sin configurar; fijar `CANCELLATION_WINDOW_HOURS` a un valor
  distinto de 24 rompe un sexto; y `DATA_REGION="eu"` impide arrancar. Copia
  el bloque `env` de `.github/workflows/e2e.yml` y no lo toques.

Para los tres specs que CI se salta, añade encima:

```bash
STRIPE_SECRET_KEY="sk_test_solo_para_verificacion_local_0000"
STRIPE_WEBHOOK_SECRET="whsec_solo_para_verificacion_local_0000"
JOBS_CRON_SECRET="cron-solo-para-verificacion-local"
```

```bash
npx playwright test e2e/alta-comercial.spec.ts \
  e2e/alta-completa-gimnasio.spec.ts e2e/notifications.spec.ts
```

Con eso puestos, `planes-gateo.spec.ts` fallará: es esperado, verifica el modo
demo. Por eso el arreglo es un segundo job y no añadir las claves al que hay.

---

## Anexo · Las 24, en una tabla

`XS` = 0,4 d · `S` = 0,8 d · `M` = 2,5 d · `L` = 6 d

| HU | Esf. | Pri. | Grupo | Título |
|---|---|---|---|---|
| E1-10 | M | P1 | huecos | Rate limiting y protección de fuerza bruta en el login web y móvil |
| E5-09 | M | P2 | huecos | Historial de asistencia y de movimientos del bono en la web |
| HU-ST-12 | L | P0 | Stripe | SEPA Direct Debit con mandato |
| HU-ST-16 | S | P1 | Stripe | Preaviso de cobro |
| HU-ST-18 | M | P0 | Stripe | Dunning con corte de acceso explícito |
| HU-ST-19 | S | P1 | Stripe | Pantalla de recuperación para el socio |
| HU-ST-20 | L | P1 | Stripe | Reembolsos reales y notas de crédito |
| HU-ST-21 | M | P1 | Stripe | Disputas y contracargos visibles |
| HU-ST-22 | S | P2 | Stripe | Tarjetas por caducar |
| HU-ST-23 | M | P2 | Stripe | Neto real, comisiones y payouts |
| HU-ST-24 | L | P2 | Stripe | Consola de lectura de Stripe para dirección |
| HU-ST-25 | M | P2 | Stripe | Exportación contable para la gestoría |
| HU-ST-26 | S | P3 | Stripe | Informes financieros de Stripe bajo demanda |
| HU-ST-27 | M | P2 | Stripe | Cupones y códigos promocionales medibles |
| HU-ST-28 | S | P3 | Stripe | Comisión de plataforma documentada, NO activada |
| E10-04 | M | P0 | despacho | Contrato de encargado del tratamiento Apta ↔ centro |
| E10-05 | S | P0 | despacho | Política de privacidad completa conforme al art. 13 |
| E10-06 | M | P0 | despacho | Información precontractual, condiciones, desistimiento y confirmación |
| E10-10 | M | P1 | despacho | Registro de actividades, procedimiento de brechas, EIPD y DPD |
| E10-15 | S | P1 | despacho | Cláusula informativa laboral |
| E13-03 | XS | P1 | despacho | Titularidad de la metodología documentada en el contrato |
| E5-15 | M | P1 | backlog | Borrado de cuenta desde la app y desde el portal |
| E9-16 | M | P2 | backlog | Ficha de tienda: identificadores, capturas, copy y App Links |
| E10-19 | S | P1 | backlog | Enlaces legales y gestión de consentimientos dentro de la app |

**Reparto por prioridad:** 5 P0 · 10 P1 · 7 P2 · 2 P3.

---

## Cómo se midió

Las 24 salen de cruzar los identificadores de historia del catálogo con los
que aparecen en los mensajes de commit de `main` desde el merge del PR #201:

```bash
git log 7c5a0a2..HEAD --format='%s%n%b' \
  | grep -oE '\b(E1[0-3]|E[1-9])-[0-9]{2}\b|\bHU-ST-[0-9]{2}\b' | sort -u
```

Es una traza de commits, no una auditoría historia por historia: dice qué se
abordó, no que cada criterio de aceptación esté cumplido. Para las que importan
—los dos huecos del Grupo 1 y las trece de Stripe— se comprobó además a mano
en el código, y eso es lo que hay en las columnas "Estado real".
