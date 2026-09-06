# 08 · Borrador de cláusula informativa laboral

**Art. 89.1 LOPDGDD** · Se entrega y firma **antes** de que el trabajador use la aplicación.

> ⚠️ **BORRADOR — NO VALIDADO JURÍDICAMENTE.**

> ### Por qué esto no puede esperar
>
> `timeclock-queries.ts:61-95` (`crossCheckHours`) cruza las horas fichadas de cada trabajador con las sesiones que consta que dirigió y devuelve **la desviación en minutos, nominalmente, a dirección**. `ClassSession.directedByUserId` existe precisamente para esa verificación.
>
> El art. 89.1 exige informar **previa y expresamente** a la plantilla y a su representación legal. El riesgo es doble: sanción de la AEPD, y **nulidad de la prueba** en un despido disciplinario apoyado en estos datos — doctrina constante del Tribunal Constitucional y del Supremo. *Una verificación de horas que no se ha informado no sirve para lo único para lo que se construyó.*

**Esta cláusula no depende de la cadena de RGPD** (documentos 01→05→06→07). Se puede lanzar el mismo lunes, en paralelo.

---

## Información al personal sobre el tratamiento de sus datos

**⟦PENDIENTE: razón social y NIF del centro⟧** ("la Empresa") te informa de lo siguiente.

### 1. Qué tratamos y para qué

| Qué | Para qué | Base jurídica |
|---|---|---|
| Identificativos, contacto y credenciales | Darte acceso a la aplicación | Relación laboral (art. 6.1.b) |
| Centros a los que estás imputado | Organizar el trabajo y delimitar a qué datos accedes | Relación laboral |
| Sesiones que impartes y asistencia registrada | Organizar la agenda y planificar | Relación laboral |
| **Valoraciones que los socios hacen de ti** | Calidad del servicio y seguimiento profesional | Interés legítimo (art. 6.1.f) |
| **Ranking de ventas por importe** | Seguimiento comercial | Interés legítimo (art. 6.1.f) |
| Registro de accesos a datos de salud de socios | Cumplir el art. 32 RGPD | Obligación legal (art. 6.1.c) |

### 2. Control de la actividad

> **Se te informa expresamente**, conforme al art. 89.1 LOPDGDD y al art. 20.3 del Estatuto de los Trabajadores, de que:
>
> - Queda registro de **qué sesiones has impartido** y de la asistencia que registras.
> - Queda registro de **tus accesos a los datos de salud** de los socios, con fecha y hora. Este registro existe por obligación legal y **se usa para auditoría de protección de datos**, no para medir tu rendimiento.
> - Los socios pueden **valorar tu trabajo**, y esas valoraciones son visibles para dirección.
> - Tu volumen de ventas puede mostrarse **de forma comparada con el del resto del equipo**.

⟦PENDIENTE: decidir si el ranking sigue siendo nominal — 00.D.3. La forma (ranking, medallas, comparación entre compañeros) entra en el terreno del art. 20.3 ET. Con base legítima y todo, conviene valorar si compensa mantenerlo nominal.⟧

> **Registro de jornada**: la Empresa **no utiliza esta aplicación como registro de jornada** a efectos del art. 34.9 ET. El registro se lleva por ⟦PENDIENTE: indicar el medio — 00.D.4⟧.

### 3. Tus derechos

Puedes acceder, rectificar, suprimir, oponerte, limitar y portar tus datos, dirigiéndote a ⟦PENDIENTE: canal⟧, y reclamar ante la AEPD.

> **Acceso a tus valoraciones**: puedes solicitar copia de las valoraciones que se han hecho de ti — puntuación, fortalezas y áreas de mejora. **No se te facilitará quién escribió cada una**: el art. 15.4 permite proteger la identidad del tercero, pero **no negar el contenido**. Se atiende en un mes.

⟦Hoy no existe ningún camino, ni siquiera manual: `rbac.ts:352-355` dice *"valoraciones de entrenadores: EXCLUSIVO dirección, nunca el propio entrenador"*. Historia **E10-16**.⟧

### 4. Conservación

Durante la relación laboral y, después, durante los plazos de prescripción de las acciones derivadas de ella. Ver documento 03.

### 5. Desconexión digital

⟦PENDIENTE: política de desconexión digital, art. 88 LOPDGDD. **Exigible con cualquier plantilla, sin umbral.**

Es especialmente pertinente aquí: **la app móvil de personal es exactamente el vector que el art. 88 pretende regular** — envía trabajo al móvil personal del entrenador fuera de jornada. Hoy no existe ninguna política.⟧

---

**Fecha:** ____________
**Nombre y DNI:** ____________________________
**Firma:** ____________

*He recibido y leído esta información antes de acceder a la aplicación.*

---

## Notas para la asesoría laboral

1. **Informar también a la RLT** si existe (00.D.2), art. 64.4.d ET, especialmente porque las valoraciones pueden usarse en decisiones laborales — que es para lo que existen.
2. **Trabajadores existentes**: hay que entregársela antes de que sigan usando las funciones afectadas, no solo a los nuevos.
3. **Fichajes**: el módulo se apaga (decisión D-P6 derivada, **E10-21**). Antes de retirar el modelo hay que **exportar y conservar** los `TimeClockEntry` existentes — el plazo de 4 años del art. 34.9 ET sigue corriendo aunque la funcionalidad desaparezca. Y si algún día vuelve, el diseño actual no cumpliría: `TimeClockEntry` admite **una sola entrada y una sola salida por día**, lo que no permite pausas ni jornada partida —habituales con turno de mañana y tarde— y no distingue ordinarias de extraordinarias.
4. **Umbral de 50 trabajadores** (00.D.1): plan de igualdad y canal de denuncias de la Ley 2/2023. Revisar anualmente.
5. **Ámbito de RRHH sin acotar**: `HR_MANAGER` tiene alcance sobre toda la organización mientras dirección de centro sí está acotada. Irrelevante en un cliente de un centro, relevante en una cadena (§7 CN-22).
