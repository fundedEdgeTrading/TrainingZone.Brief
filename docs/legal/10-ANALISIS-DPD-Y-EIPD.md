# 10 · Análisis de DPD y de necesidad de EIPD

**Arts. 30, 35 y 37-39 RGPD** · **Decisión D-C4 ya tomada: se designa DPD y se realiza la EIPD.**

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.**
>
> Este documento existe porque **el art. 30 obliga a poder acreditar que el análisis se hizo, aunque la conclusión sea "no procede"**. Aquí la conclusión es que sí procede, pero el razonamiento hay que dejarlo escrito igual: es de los cuatro documentos que se piden en el primer requerimiento de una inspección, **antes de mirar una sola línea de código**.

---

## Parte 1 · Delegado de Protección de Datos

### ¿Es obligatorio?

El art. 37.1.c lo exige cuando las actividades principales consisten en el **tratamiento a gran escala de categorías especiales** del art. 9.

| Criterio | Situación | Valoración |
|---|---|---|
| ¿Se tratan datos del art. 9? | Sí: salud, composición corporal y fotografías corporales, en tres tratamientos (T02, T03, T07) | **Sí** |
| ¿Es actividad principal? | Sí. El semáforo de aptitud y el Session Brief **son el producto**, no un accesorio | **Sí** |
| ¿A gran escala? | Discutible para un centro individual. **Para Apta como SaaS multi-tenant con objetivo de 100 clientes (decisión D-P2), sí** | **Sí para Apta** |
| ¿Tratamiento sistemático? | Sí: cada sesión genera registros clínicos; once reglas automatizadas corren a diario | **Sí** |

### Conclusión

**Apta designa DPD.** No solo por el art. 37.1.c: con objetivo de cien clientes B2B que van a preguntar por él en cada venta, el DPD es también argumento comercial.

**Para el centro individual** es discutible por escala, pero la designación de Apta cubre en la práctica la función respecto de la plataforma. ⟦PENDIENTE: confirmar si el centro designa el suyo propio — 00.C.1⟧

### Qué falta

| Acción | Estado |
|---|---|
| Elegir DPD, interno o externo | ⟦PENDIENTE — 00.C.1⟧ |
| Comunicar la designación a la AEPD *(es comunicación, no autorización — el trámite es rápido, pero necesita el DPD ya elegido)* | ⟦PENDIENTE⟧ |
| Publicar sus datos en la política de privacidad | bloqueado por lo anterior |
| Garantizar que participa en todas las cuestiones de protección de datos y **reporta al más alto nivel** (art. 38) | ⟦PENDIENTE⟧ |
| Garantizar que **no recibe instrucciones** sobre el desempeño de su función y no puede ser removido por ejercerla | ⟦PENDIENTE⟧ |

---

## Parte 2 · Evaluación de Impacto (EIPD)

### ¿Es obligatoria?

El art. 35.3 la exige en tres supuestos. Contrastados con las directrices del CEPD, que consideran necesaria la EIPD cuando concurren **dos o más** de nueve criterios:

| Criterio del CEPD | ¿Concurre? |
|---|---|
| Evaluación o puntuación | **Sí** — semáforo de aptitud, alertas de retención, puntuación de adherencia |
| Decisión automatizada con efecto jurídico | No — hay revisión humana y el mesociclo no se expone al socio |
| Observación sistemática | Parcial — asistencia, consumo, geolocalización por CP |
| **Datos sensibles o de naturaleza muy personal** | **Sí** — art. 9, más fotografías corporales |
| **Tratamiento a gran escala** | **Sí para Apta** |
| Asociación de conjuntos de datos | **Sí** — salud, asistencia, pagos y ubicación por CP en el mismo perfil |
| **Interesados vulnerables** | **Sí** — relación asimétrica socio ↔ centro; y menores si el centro los admite (D-P8) |
| Uso innovador o nueva tecnología | **Sí** — IA generativa sobre datos clínicos |
| Impide ejercer un derecho o usar un servicio | **Sí** — el alta no se completa sin la declaración de salud |

**Concurren seis de nueve.** La EIPD es obligatoria y no admite discusión razonable.

### Alcance propuesto

1. **Descripción sistemática** de los trece tratamientos del documento 01, con especial detalle en T02, T03 y T07.
2. **Necesidad y proporcionalidad**: por qué el dato de salud es imprescindible, por qué se pide como obligatorio, y por qué el art. 9.2.f es la base correcta y no el consentimiento.
3. **Riesgos para derechos y libertades**, con los que ya están identificados y medidos:

| Riesgo | Estado | Historia |
|---|---|---|
| Acceso a datos de salud de socios de otro centro | **Demostrado end-to-end** | E1-01, E1-02 |
| Recepción ve composición corporal y fotografías sin gate ni auditoría | **Verificado** | E10-02 |
| Fotografías corporales legibles en un volcado de la base de datos | **Verificado** | E10-20 |
| Texto libre con identificadores enviado a un tercero en EEUU | **Verificado** | E3-15 |
| `AuditLog` modificable por quien es auditado | **Verificado** | E10-14 |
| Sin límite de intentos de acceso | **12 intentos consecutivos procesados** | E1-10 |
| Captación de datos de salud sin base jurídica en el formulario público | **Verificado** | E10-01 |

4. **Medidas para mitigarlos**: las siete historias de la tabla, más las medidas ya verificadas del Anexo II del documento 06.
5. **Consulta al DPD** y, si el riesgo residual sigue siendo alto tras las medidas, **consulta previa a la AEPD** (art. 36).

> **El valor de esta tabla es que no es especulativa.** Una EIPD normal enumera riesgos hipotéticos; esta enumera siete que están reproducidos contra la aplicación levantada, con su historia de corrección asignada. Eso es lo que se enseña en una inspección.

---

## Parte 3 · Los otros dos documentos del art. 30

### Registro de actividades

**Existe en borrador**: documento 01, trece tratamientos. La excepción de menos de 250 empleados **no aplica** porque se tratan datos del art. 9 de forma no ocasional.

⟦PENDIENTE: aprobar, fechar y firmar. Y entregar a cada cliente su propia copia precumplimentada — es cumplimiento y argumento de venta a la vez.⟧

### Procedimiento de brechas

**No existe.** Con datos del art. 9 y el hallazgo E10-02 abierto, es el hueco que más duele si algo pasa.

| Pieza | Estado |
|---|---|
| Procedimiento de detección, evaluación y notificación | ⟦PENDIENTE⟧ |
| Plantilla de notificación a la AEPD (72 h, art. 33) | ⟦PENDIENTE⟧ |
| Plantilla de comunicación al interesado (art. 34) | ⟦PENDIENTE⟧ |
| **Registro interno de incidentes (art. 33.5) — obligatorio aunque no se notifique** | ⟦PENDIENTE⟧ |
| Cadena de escalado con nombres y teléfonos | ⟦PENDIENTE⟧ |
| Simulacro documentado | ⟦PENDIENTE⟧ |

> El plazo de notificación de 24 h que el documento 06 impone a Apta como encargado está calculado para que el centro tenga margen dentro de sus propias 72 h.

---

## Parte 4 · Accesibilidad (Ley 11/2023)

**Decisión D-C6: se considera aplicable la exención de microempresa**, así que la accesibilidad es recomendación y no obligación. **El análisis hay que dejarlo escrito igualmente.**

| Criterio | Situación |
|---|---|
| Menos de 10 trabajadores | ⟦PENDIENTE — 00.D.1⟧ |
| Volumen de negocio o balance ≤ 2 M€ | ⟦PENDIENTE⟧ |
| **Revisión** | **Al superar cualquiera de los dos umbrales, la exención decae y la EAA pasa a ser obligación.** Con objetivo de cien clientes (D-P2), eso ocurre dentro del horizonte de planificación |

La épica **E8** se ejecuta igualmente, por calidad de producto. Las cuatro primeras historias son P0 porque tocan un fichero cada una y suben la nota de accesibilidad de la web de 4,0 a un 7 largo.

---

## Resumen

| Documento | Conclusión | Estado |
|---|---|---|
| Designación de DPD | **Procede** | ⟦PENDIENTE: elegir y comunicar a la AEPD⟧ |
| EIPD | **Obligatoria** — seis de nueve criterios del CEPD | ⟦PENDIENTE: encargar⟧ |
| Registro de actividades | **Obligatorio** | borrador en 01 |
| Procedimiento de brechas | **Obligatorio** | ⟦PENDIENTE⟧ |
| Análisis de microempresa | **Exento hoy, revisable** | ⟦PENDIENTE: datos⟧ |
