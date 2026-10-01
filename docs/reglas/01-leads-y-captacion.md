# 01 · Leads y captación

> Principio rector: el lead y el socio son **el mismo dato visto en dos
> momentos**. Un lead que cierra se convierte en socio (conserva su historia, no
> se duplica); uno que no cierra se archiva para recaptación, no se borra.

Pantallas: `/leads`, `/leads/[id]`, formulario público `/lead-form/[org]/[centro]`,
mapa `/mapa-barrios`. Descripción funcional en
[CRM_Y_MARKETING.md](../CRM_Y_MARKETING.md) §1.

## Ficha del lead

### RB-LEAD-001 · Campos obligatorios bloqueantes

**Estado:** 🟢 Vigente

El lead no se guarda sin sus campos obligatorios, lo rellene el propio lead en
el formulario público o el personal en `/leads`. Obligatorios: nombre y
apellidos, teléfono, código postal, canal de origen, objetivos. La fecha de
contacto la sella el sistema al crear el registro.

- El formulario público además valida canal, sexo y que la organización esté
  operativa (QA-ALTA-20).
- Lesiones y patologías son dato de salud (art. 9 RGPD): se guardan por
  `health-access.ts`, como cualquier otro dato de salud ([05](./05-salud-ia-y-seguimiento.md)).

**Dónde vive:** `src/lib/leads-queries.ts`, `src/app/lead-form/`

### RB-LEAD-002 · Teléfono siempre; email condicional

**Estado:** 🟡 Parcial

El teléfono es obligatorio; el email es opcional si hay teléfono, aunque se
recomienda pedirlo para enviar recibos.

- **Falta:** la regla original pedía que el restablecimiento de contraseña fuera
  **por SMS**. No existe envío de SMS: la recuperación es por email
  (`/recuperar-clave`). Ver [PENDIENTES](./PENDIENTES_DE_DECIDIR.md#p-01).

**Dónde vive:** `src/lib/leads-queries.ts`, `prisma/schema.prisma` (`Lead.phone`, `Lead.email`)

### RB-LEAD-003 · Responsable del contacto

**Estado:** 🟢 Vigente

Un contacto presencial o telefónico se asigna a quien lo registra. Un lead que
entra por formulario web nace **sin responsable** hasta que alguien de dirección
se lo asigna o se lo autoasigna. Registrar un contacto desde la app móvil se
lleva el lead consigo. El responsable solo puede ser alguien del equipo de la
organización (QA-ALTA-19).

**Dónde vive:** `src/app/(app)/leads/actions.ts`, `src/app/lead-form/`, `src/app/api/mobile/v1/leads/[id]/route.ts`

### RB-LEAD-004 · Canal de origen configurable

**Estado:** 🟢 Vigente

"¿Cómo nos conociste?" es una lista cerrada que dirección edita sin desplegar
código. Una organización nueva nace con una lista por defecto (QA-ALTA-02):
boca a boca, Instagram, TikTok, web, vive/trabaja por la zona, otro.

**Dónde vive:** `src/app/(app)/leads/lead-config-panel.tsx`, `src/lib/leads-queries.ts`

### RB-LEAD-009 · Alerta por lead sin responsable

**Estado:** 🟢 Vigente · **Decisión:** §11.2 (24 h)

Un lead lleva **más de 24 horas sin responsable** → tarea para dirección. La
alerta se cierra sola al asignarlo. La comprueba la pasada periódica de
`/api/jobs/run`.

**Dónde vive:** `src/lib/leads-queries.ts`

### RB-LEAD-010 · Código postal como ubicación

**Estado:** 🟢 Vigente · **Decisión:** §11.1

La zona se captura como **código postal español de 5 dígitos**, no texto libre.
Alimenta la segmentación por proximidad y el mapa de barrios de dirección
(`/mapa-barrios`, coropleta por código postal y por ciudad).

**Dónde vive:** `src/lib/leads-queries.ts`, `src/app/(app)/mapa-barrios/`

## Estados del lead

```
SIN_CONTACTAR → SEGUIMIENTO → CON_FECHA_VALORACION → CERRADO
                     └──────────────┴──────────→ NO_CERRADO (histórico)
```

### RB-LEAD-005 · Solo un cobro confirmado cierra el lead

**Estado:** ⚠️ En conflicto (menor) · ver [P-02](./PENDIENTES_DE_DECIDIR.md#p-02)

Marcar "ha cerrado" **inicia** el alta (crea el socio), pero el lead pasa a
`CERRADO` solo cuando se confirma el primer cobro. "Cerrado directamente" ya no
cierra el lead sin pago (QA-ALTA-03). Si el pago falla, vuelve a `SEGUIMIENTO`.

- **Conflicto:** la regla dice "confirmado **por Stripe**". Hoy también lo
  confirma un **cobro manual** registrado por recepción o dirección
  (`registerManualPayment`), que se mantiene como puente (ver `RB-PAGO-001`).

**Dónde vive:** `src/lib/leads-queries.ts` (`confirmLeadClosureForMember`), `src/app/(app)/billing/actions.ts`

### RB-LEAD-006 · No cerrar no es borrar

**Estado:** 🟢 Vigente

Un lead `NO_CERRADO` no se borra: queda como histórico de recaptación con todos
sus datos, hasta que lo purgue la política de conservación (`RB-DATOS-001`).

### RB-LEAD-011 · Motivo de no cierre obligatorio

**Estado:** 🟢 Vigente · **Decisión:** §11.3

No se puede archivar un lead como `NO_CERRADO` sin motivo. Lista cerrada
configurable por dirección (misma mecánica que `RB-LEAD-004`); la organización
nueva nace con una por defecto (precio, horarios, competencia, lo piensa,
distancia, otro).

**Dónde vive:** `src/lib/leads-queries.ts`, `src/lib/member-lifecycle.ts`

### RB-LEAD-007 · La conversión traslada los datos al socio

**Estado:** 🟢 Vigente

Al convertir, el socio hereda sin recapturar: nombre, teléfono, email, código
postal, objetivos (como su primer objetivo), ocupación, sexo, hijos, fecha de
nacimiento, consentimiento comercial, lesiones y patologías (el registro de
salud cambia de dueño, no se copia) y la bitácora de comentarios. Convertir
envía al socio el correo de bienvenida (QA-ALTA-04).

**Dónde vive:** `src/lib/leads-queries.ts`, `src/lib/health-access.ts`

### RB-LEAD-008 · Bitácora de comentarios

**Estado:** 🟢 Vigente

Lead y socio tienen una bitácora cronológica (nota + autor + fecha), distinta
de los datos estructurados. La del lead pasa al socio al convertir.

**Dónde vive:** `prisma/schema.prisma` (`LeadNote`, `MemberNote`)

## Comportamiento construido sin regla numerada

Existe y funciona, pero ninguna regla `RB-*` lo enuncia. Si negocio quiere
cambiarlo, lo primero es numerarlo aquí (ver
[COMO_TRABAJAR_LAS_REGLAS.md](./COMO_TRABAJAR_LAS_REGLAS.md)):

- **Referidos con recompensa** (E14-30…34): enlace por socio `/r/[código]`,
  embudo, antifraude y tarea de recompensa. → [CRM_Y_MARKETING.md](../CRM_Y_MARKETING.md)
- **Etiquetas** de leads y socios. → [CRM_Y_MARKETING.md](../CRM_Y_MARKETING.md)
- **Flujos de email** (motor y los siete flujos de salida, E3). Decisión del lote 3:
  en fase 1 **no se miden aperturas** (exigiría píxel y banner de cookies); se
  miden entradas, clics y objetivo cumplido. → [CRM_Y_MARKETING.md](../CRM_Y_MARKETING.md)
- **Formulario que rellena alguien sin cuenta** mediante enlace con token (E14-19).
