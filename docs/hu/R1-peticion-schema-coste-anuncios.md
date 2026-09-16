# R1 → S2 · falta el coste de los anuncios, y no me lo he inventado (E14-34)

> **Para la ventana de merge.** `prisma/schema.prisma` está **congelado** y solo
> lo toca S2. Esto es la petición de UNA tabla, con su argumento, su forma
> exacta y lo que ya está montado esperándola.

## El escenario que no se puede cerrar

E14-34 pide, literalmente:

```gherkin
Escenario: la comparación con ads
  Dado que el coste de los anuncios no está hoy en ninguna parte del repositorio
  Entonces se PARA y se pregunta de dónde sale ese dato
  Y no se inventa un campo
```

**Comprobado contra el árbol antes de preguntar.** No existe ningún modelo,
campo ni fichero con gasto publicitario, campaña, CPA ni CPL:

- `/anuncios` (`src/app/(app)/anuncios/`) es el **tablón de comunicados
  internos** (`Announcement` / `AnnouncementView`), no publicidad. El nombre
  engaña y es la primera pista que hay que descartar.
- `grep -rn "cost\|spend\|gasto\|inversion\|presupuesto"` sobre `src/lib` y
  `prisma/schema.prisma` no devuelve nada que hable de anuncios.
- `Payment` es dinero que ENTRA. No hay ningún modelo de dinero que SALGA.

## La respuesta de negocio

**Lo teclea dirección**, por centro y por mes. Ni integración con Meta/Google
Ads (es un módulo propio: credenciales por centro, cron de sincronía y
conciliación, y no cabe en R1) ni un número global escondido en una variable de
entorno.

## Lo que hace falta, y nada más

```prisma
/// Gasto publicitario declarado a mano por dirección, por centro y mes. Es el
/// OTRO lado de la comparación de captación de R1 (E14-34): sin él, el panel de
/// referidos sabe lo que cuesta un alta por recomendación pero no con qué
/// compararla.
///
/// Cuelga del CENTRO y no de la organización por lo mismo que
/// `ReferralProgramConfig`: la inversión en anuncios la decide quien dirige ese
/// centro, y así `isCenterInScope` puede acotarla.
///
/// `(centerId, year, month)` es único: un mes tiene un gasto, y volver a
/// teclearlo lo corrige en vez de duplicarlo. En céntimos, como todo el dinero
/// del esquema.
model AdSpend {
  id          String   @id @default(cuid())
  orgId       String
  centerId    String
  year        Int
  month       Int      // 1-12
  amountCents Int
  /// De dónde salió: "Meta", "Google", "buzoneo"... Texto libre y configurable
  /// por dirección sin desplegar, mismo criterio que `Lead.channel`
  /// (RB-LEAD-004). No es un enum: cada centro anuncia donde le da la gana.
  source      String?
  note        String?
  createdByUserId String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt

  organization Organization @relation(fields: [orgId], references: [id])
  center       Center       @relation(fields: [centerId], references: [id])
  createdBy    User?        @relation("AdSpendCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@unique([centerId, year, month, source])
  @@index([orgId])
  @@index([centerId, year, month])
}
```

Y los tres lados en `Organization`, `Center` y `User`.

## Qué hay ya montado esperándola

`referralPanelData` (`src/lib/referral-rewards.ts`) devuelve
`totals.costPerSignupCents`: **lo que cuesta un alta por referido**, que es
`coste en recompensas ÷ altas conseguidas`. La pantalla lo pinta y **dice que le
falta el otro lado**, con todas las letras y en un bloque propio, en vez de
rellenarlo con un número inventado.

El día que exista `AdSpend`, lo que falta es de un tamaño conocido:

1. sumar el gasto del periodo en `referralPanelData` y devolver
   `adCostPerSignupCents` (gasto ÷ altas cuyo `Lead.channel` no sea "Referido");
2. cambiar el bloque de "falta el otro lado" por las dos cifras juntas;
3. un formulario por centro y mes, que cabe al lado del programa de referidos en
   `/referidos` — o en `/anuncios`, si para entonces esa pantalla ya significa
   anuncios de verdad.

Nada de eso está a medias en la rama: no hay campo muerto, no hay columna
fantasma y no hay TODO colgando.

## Lo que NO se ha hecho, a propósito

- No se ha añadido la tabla en esta rama. El esquema está congelado y el lote
  entero depende de que siga estándolo.
- No se ha metido el gasto en una variable de entorno ni en un JSON de
  configuración. Un dato que dirección va a cambiar cada mes no vive en un
  despliegue.
- No se ha estimado el coste de los anuncios a partir de los leads con canal
  "Instagram" o "TikTok". Eso sería inventarse el campo por la puerta de atrás.
