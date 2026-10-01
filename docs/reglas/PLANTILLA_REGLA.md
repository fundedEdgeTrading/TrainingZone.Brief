# Plantilla de regla

Copia el bloque en el fichero del dominio que toque, en la sección que
corresponda, y rellénalo. Borra las líneas que no apliquen.

```markdown
### RB-<DOMINIO>-<NNN> · <Título que se entienda solo>

**Estado:** 📝 Propuesta · **Decisión:** <quién decide>, <fecha> · **Sustituye a:** <RB-… o —>

<Enunciado. Quién hace qué, cuándo, y qué pasa si no se cumple. Con números.>

- **Configurable:** <no | sí, por organización / centro / servicio; quién la cambia; valor por defecto>
- **Excepciones:** <…>
- **Ejemplo:** <un caso concreto con nombres de rol y cifras>
- **Afecta a:** <web · app · correo · panel · cobros>
- **Antes:** <solo si cambia una regla vigente: qué decía y por qué cambia>

**Dónde vive:** <lo rellena desarrollo al construirla>
```

## Preguntas que una regla tiene que contestar

1. **¿Quién?** El rol concreto: dirección de organización, dirección de
   centro, Entrenador Admin, entrenador, recepción, RRHH, socio.
2. **¿Cuándo?** El disparador: una acción de alguien, una fecha, un umbral.
3. **¿Cuánto?** Horas, días, sesiones, euros, porcentajes. Nunca "pronto",
   "varios" ni "razonable".
4. **¿Dónde?** Web, app, correo. Si algo vale en la web, vale en la app salvo
   que la regla diga lo contrario.
5. **¿Y si no?** Qué ve el usuario cuando la regla le impide algo.
6. **¿Choca con otra?** Busca en el catálogo reglas del mismo tema antes de
   escribir.
