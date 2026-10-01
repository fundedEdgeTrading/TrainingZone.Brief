# Cómo trabaja negocio las reglas con Claude Code

Procedimiento para que las personas de negocio escriban y cambien reglas de
negocio en este repositorio, con Claude Code como asistente, sin pisar el
trabajo de desarrollo y sin que una decisión se pierda entre el documento y el
código.

## La idea en una frase

**Negocio decide en `docs/reglas/`; desarrollo construye en el código; una pull
request une las dos cosas.** Cada regla tiene un número `RB-*` que el código
cita, y un estado que dice si la aplicación ya la cumple.

```
  NEGOCIO                              DESARROLLO
  ───────                              ──────────
  1. Consulta: ¿qué hace hoy la app?
  2. Escribe la regla (📝 Propuesta)
  3. Dirección la aprueba (✅ Aprobada)
     └── pull request solo con docs/reglas ──►  4. Revisa coherencia técnica
                                                5. Construye (historia en docs/hu/)
                                                6. Al mezclar: la regla pasa a 🟢 Vigente
```

## Preparación (una vez)

1. **Acceso**: cuenta de GitHub con permiso de escritura en el repositorio y
   Claude Code. No hace falta instalar nada: se usa **Claude Code en la web**
   (claude.ai/code) o en la aplicación de escritorio, conectado al repositorio.
2. **Lectura de 15 minutos**: [README.md](./README.md) de esta carpeta (estados
   y formato) y [PENDIENTES_DE_DECIDIR.md](./PENDIENTES_DE_DECIDIR.md), que es
   la lista de trabajo inicial.
3. **Quién aprueba**: acordad qué personas pueden poner una regla en ✅
   Aprobada. Recomendación: una sola persona de dirección por dominio.

## Una sesión de trabajo, paso a paso

1. **Una sesión de Claude Code por tema.** Un tema = una regla o un grupo
   pequeño de reglas que se deciden juntas ("ventana de cancelación por
   centro"). No mezcles temas: una pull request pequeña se revisa en minutos;
   una grande se queda parada.
2. **Arranca con la skill** escribiendo en Claude Code:

   ```
   /regla-negocio quiero que cada centro pueda fijar su ventana de cancelación
   ```

   La skill (`.claude/skills/regla-negocio/SKILL.md`) hace que Claude:
   - cree una rama `negocio/<tema>`,
   - lea el catálogo y **el código** para contarte qué hace hoy la aplicación,
   - te diga **con qué otras reglas choca** tu propuesta,
   - te haga las preguntas que falten (¿quién?, ¿cuánto?, ¿configurable?),
   - redacte la regla con la plantilla, en el fichero correcto,
   - y te enseñe el cambio antes de guardarlo.
3. **Para preguntar sin cambiar nada** usa la misma skill:
   `/regla-negocio ¿qué pasa hoy si un socio cancela 3 horas antes?`
4. **Revisa el diff** que te enseña Claude y da tu visto bueno.
5. **Pide la pull request**: "sube la rama y abre la pull request". Va contra
   `release`. En la descripción Claude resume qué cambia, por qué y si
   necesita desarrollo.
6. **Aprobación**: la persona de dirección del dominio aprueba la pull request
   (si la regla queda en ✅ Aprobada, que lo diga en un comentario).
   Desarrollo revisa que no hay contradicciones técnicas y la mezcla.

## Reglas del juego

| Hacer | No hacer |
|---|---|
| Una regla, una decisión, con números | "Un plazo razonable", "varios días" |
| Buscar reglas del mismo tema antes de escribir | Escribir la misma regla en dos ficheros |
| Cambiar una regla editándola y dejando `**Antes:**` | Crear una regla nueva que contradiga a otra viva |
| Retirar tachando y dejando el número | Reutilizar números |
| Dejar en ✅ Aprobada lo que exige código | Pedir a Claude que cambie el código desde una rama de negocio |
| Pasar por `cumplimiento-normativo` lo que toque salud, cobros, cookies o conservación | Aprobar sin revisión algo con implicaciones legales |

**Qué ficheros toca negocio:** solo `docs/reglas/`. La skill se lo impide a
Claude. Si una pull request de negocio toca algo fuera de esa carpeta, se
devuelve.

**Qué no toca negocio aunque parezca documentación:**
- `docs/hu/` — historias de desarrollo: el *cómo* y el *cuándo*.
- `docs/PRODUCTO_*.md`, `docs/ARQUITECTURA.md`, `docs/OPERACIONES.md` —
  describen lo construido; los actualiza desarrollo al construir.
- `src/lib/ai/methodology/*.md` — la metodología de entrenamiento que lee la IA.
  Parece texto, pero es código: un cambio ahí cambia lo que genera la IA al
  instante. Va por pull request de desarrollo, con revisión del agente
  `entrenador-experto`.
- `docs/legal/` — borradores para el jurídico.

## Qué hace desarrollo con una regla aprobada

1. Abre (o actualiza) la historia en `docs/hu/` que la implementa, citando el
   `RB-*`.
2. Construye en web **y** app, y cita el `RB-*` en el código que la cumple.
3. En la misma pull request del código: pone la regla en 🟢 Vigente (o 🟡
   Parcial con nota), rellena **Dónde vive** y actualiza el documento de
   producto que describa la pantalla.
4. Si al construir descubre que la regla no se sostiene, no la reinterpreta: la
   devuelve a negocio como entrada en `PENDIENTES_DE_DECIDIR.md`.

## Ritmo recomendado

- **Arranque (semanas 1-2):** cerrar las entradas de
  [PENDIENTES_DE_DECIDIR.md](./PENDIENTES_DE_DECIDIR.md), de una en una. Son
  las contradicciones que ya existen entre lo escrito y lo que hace la
  aplicación; no tiene sentido añadir reglas nuevas encima.
- **Después, numerar lo que funciona sin regla** (P-12): referidos, etiquetas,
  flujos de email, tipos de persona, renovación de bonos. Es la forma de que
  negocio valide por escrito lo que hoy solo está en el código.
- **Semanal:** 30 minutos negocio + desarrollo para repasar las pull requests
  de reglas abiertas y lo que pasó a 🟢 esa semana.

## Si algo sale mal

- **"Claude dice que la aplicación hace X y no me lo creo"** → pídele que te
  diga dónde lo ha leído; si no lo cita, no lo afirmes en la regla.
- **Dos personas cambian la misma regla** → la segunda pull request tendrá
  conflicto; se resuelve hablando, no eligiendo la última.
- **Una regla aprobada lleva semanas sin construirse** → es una decisión de
  prioridad, no de documentación: llévala a la reunión semanal.
