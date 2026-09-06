# Expediente de cumplimiento · Apta / TrainingZone

**Generado el 6 de septiembre de 2026** a partir del código de este repositorio.
Desbloquea las siete historias que el [plan de paralelización](../PLAN_PARALELIZACION_2026-09-06.md) marca como dependientes de terceros: **E10-03, E10-04, E10-05, E10-06, E10-10, E10-15 y E13-03**.

> ## ⚠️ Todo lo que hay en esta carpeta es un BORRADOR DE TRABAJO
>
> Está escrito para que un despacho lo revise, lo corrija y lo firme — **no para publicarse tal cual**. Ningún documento de aquí ha pasado validación jurídica. Publicar un texto legal sin revisar es peor que no tenerlo: el propio informe de revisión lo dice en §7 CN-05, donde un diálogo promete una anonimización que el código no hace.
>
> **Nada de esta carpeta se publica hasta que vuelva firmado.**

## Para qué sirve

Un despacho no redacta una política de privacidad a partir de *"somos un SaaS de gimnasios"*: te manda un cuestionario y el reloj empieza cuando lo contestas. Este expediente **es la respuesta a ese cuestionario, ya escrita**, sacada del esquema de Prisma, de `rbac.ts`, de `health-access.ts`, de `consent.ts` y de `.env.example`.

Con esto encima de la mesa, dos semanas de despacho es un plazo realista. Sin esto, son cuatro o seis, y el ida y vuelta lo pagas tú.

## Qué hay aquí

| # | Documento | Qué es | Alimenta |
|---|---|---|---|
| **00** | [Cuestionario de dirección](./00-CUESTIONARIO-DIRECCION.md) | Lo único que **no se puede sacar del código**. Empieza por aquí | todo lo demás |
| **01** | [Registro de actividades](./01-REGISTRO-ACTIVIDADES.md) | Art. 30 RGPD · 13 tratamientos inventariados | E10-10, E10-05, E10-04 |
| **02** | [Subencargados y transferencias](./02-SUBENCARGADOS-Y-TRANSFERENCIAS.md) | Los seis proveedores reales, verificados en `package.json` y `.env.example` | E10-04, E10-05 |
| **03** | [Plazos de conservación](./03-PLAZOS-CONSERVACION.md) | Tabla con norma citada por fila (decisión D-C3) | E10-05, E10-08 |
| **04** | [Uso de inteligencia artificial](./04-USO-DE-IA.md) | Qué viaja, con qué base, clasificación del AI Act | E10-05, E10-17, E3-15 |
| **05** | [Política de privacidad](./05-BORRADOR-POLITICA-PRIVACIDAD.md) | Borrador art. 13 completo | E10-05 |
| **06** | [Contrato de encargo (DPA)](./06-BORRADOR-DPA-ENCARGO.md) | Borrador art. 28 Apta ↔ centro | E10-04 |
| **07** | [Precontractual y desistimiento](./07-BORRADOR-PRECONTRACTUAL-Y-DESISTIMIENTO.md) | Borrador TRLGDCU + Anexo A | E10-06 |
| **08** | [Cláusula informativa laboral](./08-BORRADOR-CLAUSULA-LABORAL.md) | Borrador art. 89.1 LOPDGDD | E10-15 |
| **09** | [Titularidad de la metodología](./09-BORRADOR-TITULARIDAD-METODOLOGIA.md) | Borrador de cláusula mercantil (decisión D-P4) | E13-03 |
| **10** | [Análisis de DPD y EIPD](./10-ANALISIS-DPD-Y-EIPD.md) | Decisión motivada por escrito (decisión D-C4) | E10-10 |

## Cómo se usa

1. **Hoy** · dirección contesta el **00**. Sin eso, el resto lleva huecos y el despacho no puede empezar.
2. **Lunes** · se manda al despacho el paquete entero, en este orden: 01 → 02 → 03 → 04, y después los borradores 05 → 06 → 07.
3. **En paralelo, sin esperar** · el 08 y el 09 no dependen de la cadena de RGPD. Se pueden lanzar el mismo lunes por separado.
4. **Mientras tanto** · las pistas T5, T7, T8 y T9 implementan la mitad de código de cada historia (la casilla, el botón "Pagar", la aceptación registrada en el Checkout, la estructura de `/privacidad`) contra estos borradores. Cuando vuelva el texto firmado, se sustituye la copia y ya está.

## Cómo están marcados los huecos

Todo lo que falta por decidir aparece así:

```
⟦PENDIENTE: razón social y NIF de Apta⟧
```

Es greppable. Antes de mandar nada al despacho:

```bash
grep -rn "⟦PENDIENTE" docs/legal/ | wc -l
```

Ese número tiene que bajar a cero en el **00** antes de que el resto valga de algo.

## Qué NO es esto

No es asesoramiento jurídico. No sustituye a un abogado ni a un DPD. Los plazos de conservación del **03** llevan la norma citada, pero la citación es una propuesta de partida, no un dictamen. La clasificación del AI Act del **04** está razonada y puede estar equivocada. Y el análisis del **10** existe para que quede constancia de que se hizo el análisis, que es lo que exige el art. 30 — no para dar la conclusión por buena.
