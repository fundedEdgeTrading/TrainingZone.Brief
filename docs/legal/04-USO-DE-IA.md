# 04 · Uso de inteligencia artificial

Alimenta la política de privacidad (05), la EIPD (10) y la historia **E10-17** de clasificación del AI Act.

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.**

## Para qué se usa

Un único uso: **generar una propuesta de mesociclo** (plan de entrenamiento por fases) que un profesional revisa y aprueba antes de aplicarla. Proveedor: **Anthropic** (`@anthropic-ai/sdk`), como encargado del tratamiento.

**No hay ningún otro uso de IA en el producto.** El semáforo de aptitud, que es lo que más se parece a una decisión, es **determinista**: casa reglas escritas por el director técnico contra condiciones declaradas. No es IA.

## Qué datos viajan

**Sí viajan**: edad, sexo, objetivos, métricas de rendimiento, criterios de seguridad clínicos, y **texto libre** — `HealthRecord.description`, `screening.medicacion`, `screening.cirugias`, `screening.lesionesActuales`, `cierre.notasEntrenador`, `perfil.motivacionReal`, `ClientGoal.label`.

**No deberían viajar**: nombre, DNI, teléfono, email, dirección.

> ### El hueco que hay que declarar
>
> La pantalla promete literalmente *"La IA recibe… Nunca nombre, DNI, teléfono ni email"*, y **no existe ningún filtro de texto libre**: `scrubIdentifiers` no está en `src/`. Basta que un entrenador escriba *"María se queja del hombro desde que nació su hijo Pablo"* para que el nombre salga.
>
> **El riesgo no es la salida en sí** —Anthropic es encargado y el trayecto se audita con `MESOCYCLE_AI_INPUT_READ`— **sino prometer una garantía técnica que no se aplica**: eso convierte un tratamiento defendible en uno desleal. Historia **E3-15**, prioridad P0.
>
> Hay dos salidas y hay que elegir una, no las dos a medias: **(1)** construir el filtro, que es la correcta; **(2)** ajustar el texto del consentimiento y **subir `CONSENT_VERSION`**, que es el mínimo honesto y obliga a pedir re-consentimiento.

## Base jurídica y garantías

| | |
|---|---|
| **Base** | Art. 9.2.a — consentimiento explícito y separado (`consentAI`, por defecto `false`) |
| **Independencia** | `canUseClinicalDataForAI` exige `consentAI && consentHealth` |
| **Oposición real** | Decir que no **no afecta al acceso al servicio**: se toma la vía sin datos clínicos, avisando al modelo de que el plan nace incompleto. **Sin trampas** |
| **Revocación** | Desde `portal/perfil`, con auditoría `CONSENT_GRANTED` / `CONSENT_REVOKED` |
| **Revisión humana** | El mesociclo nace `DRAFT` y pasa a `APPROVED` con `approvedByUserId` |
| **No exposición** | El mesociclo **no se expone al socio en ningún endpoint**, ni en portal ni en app |

## Art. 22 RGPD — decisiones automatizadas

**No hay decisión automatizada con efectos jurídicos o significativos sobre el socio.** Razonado:

- El mesociclo nace `DRAFT`, exige aprobación humana explícita y no se expone al interesado.
- Las once reglas del cron generan **avisos internos**, no decisiones sobre la persona.
- El semáforo es una regla determinista mantenida por una persona.

> **Se reabre** si alguna vez el mesociclo llega al socio sin revisión humana. Está escrito como escenario en E10-17.

## Clasificación bajo el Reglamento de IA

**Calendario verificado a 6/9/2026**: art. 4 (alfabetización) aplicable desde el **2/2/2025**, alcanza a proveedores **y a responsables del despliegue**. Art. 50 (transparencia) aplicable desde el **2/8/2026 — ya está en vigor**. El alto riesgo se retrasó por el Digital Omnibus: Anexo III a 2/12/2027, Anexo I a 2/8/2028.

**Clasificación propuesta: riesgo limitado.** Razonado:

- **No encaja en ningún supuesto del Anexo III**: no es empleo, ni educación reglada, ni crédito, ni servicio esencial, ni dispositivo médico.
- **No es un producto sanitario**: propone entrenamiento, no diagnostica ni trata.
- Obligaciones aplicables: **art. 4** (formación) y **art. 50** (transparencia).

⟦PENDIENTE: contraste con el despacho. La frontera con "dispositivo médico" merece una segunda opinión cuando el sistema recibe medicación y cirugías como entrada.⟧

## Qué hay que hacer

| Acción | Historia |
|---|---|
| Filtro de identificadores, o ajustar el texto y subir `CONSENT_VERSION` | **E3-15** · P0 |
| Marca visible *"Propuesta generada con IA · revisada por [entrenador]"* — art. 50 | **E10-17** |
| Constancia de la formación del art. 4 | **E10-17** |
| Documento de clasificación de una página, fechado | **E10-17** |
| Purgar `aiConversation` al aprobar y auditar la apertura del mesociclo | **E3-18** |
| Firmar el DPA con Anthropic antes de tocar datos de un socio real | decisión **D-C5** |
