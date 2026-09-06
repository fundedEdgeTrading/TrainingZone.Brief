# 06 · Borrador de contrato de encargo del tratamiento

**Art. 28 RGPD** · Apta (encargado) ↔ centro cliente (responsable).

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE. NO SE FIRMA ASÍ.**
>
> **Lee primero esto**: si Apta y Training Zone resultan ser **la misma sociedad** (pregunta 00.A.5), este documento no aplica al piloto — sería un contrato consigo mismo. En ese caso lo que hace falta es separar finalidades dentro del mismo responsable, y el DPA aparece con el segundo cliente. **La pregunta A.5 decide si este documento existe.**

Hoy **no hay ningún punto del flujo en que el gimnasio firme nada**: el Checkout de licencia se crea sin `consent_collection.terms_of_service`, y la organización nace del webhook de pago sin aceptación de condiciones ni de encargo (§7 CN-30). Sin DPA, el tratamiento es **ilícito para las dos partes**, y es un bloqueante comercial absoluto: ningún cliente B2B con asesoría propia firma un SaaS que trata datos del art. 9 sin esto.

---

## Anexo de Encargo del Tratamiento

Entre **⟦PENDIENTE: razón social, NIF y domicilio de Apta — 00.A⟧** ("el Encargado") y el centro identificado en el pedido ("el Responsable").

### 1. Objeto

El Responsable encarga al Encargado el tratamiento de datos personales necesario para prestar el servicio de gestión de centros deportivos descrito en las Condiciones del Servicio.

**El Encargado no trata los datos para finalidad propia alguna.** En particular, no los usa para entrenar modelos, no los cede a terceros salvo a los subencargados autorizados, y no los explota comercialmente.

### 2. Alcance

| | |
|---|---|
| **Duración** | La del contrato de servicio, más el periodo de devolución o supresión del §9 |
| **Naturaleza** | Alojamiento, tratamiento automatizado, comunicación por email y tratamiento por IA cuando el interesado lo consienta |
| **Categorías de interesados** | Socios del centro, personas interesadas en darse de alta (leads), personal del centro |
| **Categorías de datos** | Identificativos, de contacto, postales, económicos, de asistencia, y **datos de salud (art. 9)**: lesiones, condiciones, medicación, screening, composición corporal y fotografías de progreso |

### 3. Obligaciones del Encargado

1. Tratar los datos **solo siguiendo instrucciones documentadas** del Responsable. Si una instrucción infringe la normativa, informarle de inmediato.
2. Garantizar la **confidencialidad** de quien accede a los datos.
3. Aplicar las **medidas técnicas y organizativas** del Anexo II.
4. Respetar el régimen de **subencargados** del §4.
5. **Asistir al Responsable** en la atención de derechos de los interesados, con las funciones del producto: exportación de datos, rectificación desde la ficha, supresión y gestión de consentimientos.
6. Asistirle en el cumplimiento de los arts. 32 a 36 — seguridad, brechas y evaluación de impacto.
7. **Notificar cualquier brecha sin dilación indebida y, en todo caso, en menos de 24 horas** desde que tenga conocimiento, con la información del art. 33.3. *(24 h y no 72: el Responsable necesita margen dentro de su propio plazo de 72 h.)*
8. Poner a disposición del Responsable la información necesaria para **acreditar el cumplimiento**, y permitir auditorías conforme al §8.
9. **No transferir datos fuera del EEE** salvo a los subencargados autorizados y con las garantías del Anexo I.

### 4. Subencargados

El Responsable **autoriza de forma general** a los subencargados listados en el Anexo I, que se publica en ⟦PENDIENTE: URL estable y versionada⟧.

El Encargado podrá incorporar o sustituir subencargados **notificándolo con al menos 30 días de antelación**. El Responsable podrá **oponerse motivadamente** dentro de ese plazo; si la oposición impide prestar el servicio, cualquiera de las partes podrá resolver el contrato sin penalización.

El Encargado impondrá a cada subencargado las mismas obligaciones de este anexo y **responderá frente al Responsable** de su actuación.

> **Mención expresa por su sensibilidad**: el tratamiento por **Anthropic** implica el envío de datos del art. 9 a un proveedor en EEUU. Solo se activa cuando el interesado presta **consentimiento explícito e independiente**, es revocable en cualquier momento, y su revocación **no afecta al acceso al servicio**.

### 5. Obligaciones del Responsable

1. Garantizar que dispone de **base jurídica** para los datos que introduce, y haber informado a los interesados conforme a los arts. 13 y 14.
2. Recabar y mantener los **consentimientos** que la normativa exija, usando los mecanismos del producto.
3. **No introducir en campos de texto libre datos innecesarios**, en especial datos de salud de terceros o de personas que no son socios.
4. Comunicar al Encargado cualquier ejercicio de derechos que requiera su asistencia.
5. Determinar los **plazos de conservación** aplicables dentro de los mínimos legales, usando la configuración que el producto ofrezca.

> El punto 3 no es retórico. El producto tiene campos de texto libre que llegan al sistema de IA, y hoy no hay filtro (documento 04). Mientras no lo haya, **esta obligación es la única barrera**, y por eso conviene que esté escrita.

### 6. Personas autorizadas

El acceso está limitado por rol. **El acceso a datos de salud está restringido a dirección y al personal técnico que prepara la sesión**; recepción y administración quedan excluidos por diseño del producto y **reciben un valor nulo, nunca un error que revele si el dato existe**.

Cada acceso a un dato de salud **queda registrado** con actor, interesado y momento, y el Responsable puede consultar ese registro.

### 7. Instrucciones documentadas

Constituyen instrucciones documentadas: este anexo, las Condiciones del Servicio, la configuración que el Responsable establece en la plataforma, y cualquier instrucción posterior por escrito.

### 8. Auditoría

El Responsable podrá auditar el cumplimiento **una vez al año**, con 30 días de preaviso, en horario laboral y sin interrumpir el servicio, directamente o mediante un tercero que no sea competidor del Encargado y que asuma confidencialidad. El Encargado podrá satisfacer este derecho aportando certificaciones o informes de auditoría independientes vigentes.

### 9. Fin del encargo

A la terminación, y **a elección del Responsable**, el Encargado devolverá los datos en formato estructurado de uso común, o los suprimirá, junto con las copias existentes, **salvo lo que deba conservar por obligación legal**, en cuyo caso queda bloqueado.

Plazo: **30 días** desde la solicitud. El Encargado lo certificará por escrito.

### 10. Responsabilidad

⟦PENDIENTE: régimen y límite de responsabilidad. Es una negociación comercial, no una cláusula de plantilla. Ojo: en datos del art. 9 los límites de responsabilidad al uso suelen quedarse cortos frente al art. 82 RGPD.⟧

---

## Anexo I · Subencargados

⟦PENDIENTE: insertar la tabla del documento 02 con la ubicación y el mecanismo de transferencia de cada uno, una vez confirmados⟧

## Anexo II · Medidas técnicas y organizativas

**Estas medidas están verificadas en el código**, no son declarativas:

| Medida | Cómo está implementada |
|---|---|
| Aislamiento entre clientes | `orgId` en toda tabla de negocio; desde fuera del ámbito la ficha **no existe** (`notFound()`, no un error) |
| Control de acceso por rol | `src/lib/rbac.ts`, matriz única con ocho roles |
| Punto único de acceso a salud | `src/lib/health-access.ts`, con registro de cada lectura |
| Registro de accesos | `AuditLog` con actor, interesado, acción y momento |
| Cifrado en tránsito | HTTPS en toda la superficie |
| Autenticación | Contraseñas con bcrypt; en móvil, access token de 15 min y refresh opaco hasheado **con rotación en cada uso y detección de reuso que revoca toda la familia** |
| Tokens de URL | HMAC-SHA256 con propósito dentro de la firma, caducidad y un solo uso |
| Seudonimización ante la IA | Consentimiento independiente y revisión humana obligatoria |
| Segregación de entornos | Base de datos de demostración separada de producción |

> **Lo que todavía NO se puede declarar aquí**, y hay que quitarlo o construirlo antes de firmar: cifrado por columna de los campos clínicos (**E10-20**), `AuditLog` inmutable por construcción (**E10-14**), límite de intentos de acceso (**E1-10**), cabeceras de seguridad HTTP (**E1-09**) y las dos fugas de ámbito de centro (**E1-01**, **E1-02**). **Firmar un anexo de medidas que el código no cumple es exactamente el error que este expediente intenta evitar.**

---

## Cómo se acepta

Historia **E10-04**:

1. El Checkout de licencia recoge `consent_collection.terms_of_service`.
2. La aceptación se registra con **versión del texto, fecha y quién**.
3. Sin aceptación, la organización **no queda operativa**.
4. A los clientes existentes se les pide re-aceptación antes de seguir operando.
