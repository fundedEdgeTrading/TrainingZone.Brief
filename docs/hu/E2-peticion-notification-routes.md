# E2 → M3 / E12 · petición sobre `tasks.ts` y `notification-routes.ts`

**Pista que lo pide:** E2 · Motor de flujos (`lote3/E2-flujos`)
**Ficheros ajenos:** `src/lib/tasks.ts` (M3) y `src/lib/notification-routes.ts` (E12)
**Urgencia:** baja. Nada está roto; lo que falta es que una tarea de flujo se
vea agrupada y enlazada como el resto.

---

## Qué hace E2 hoy

Las acciones «crear tarea a un entrenador» y «avisar al director» de un flujo
escriben con `createNotificationOnce`, como todas las reglas del motor, y usan
un espacio de deduplicación propio:

```
entityType = "FlowTask"
entityId   = "<enrollmentId>:<stepId>"
```

La clave es **la inscripción y el paso**, no el socio. Es deliberado y es la
lección de E14-11: si dos flujos distintos compartieran clave sobre la misma
persona, el segundo no se escribiría y nadie lo sabría — exactamente el fallo
que M3 acaba de arreglar entre «pocas sesiones programadas» y «bono
acabándose».

## Qué falta, y por qué no lo he tocado yo

`"FlowTask"` **no está** en el catálogo `AUTO_TASK_RULES` de `tasks.ts` ni en
`NOTIFICATION_ENTITY_TYPES` de `notification-routes.ts`. Consecuencias, las dos
pequeñas y ninguna un fallo:

1. **La tarjeta no se agrupa por regla** en el tablero (E14-13): sin entrada en
   el catálogo, `autoTaskRuleFor` devuelve `null` y la tarea se pinta suelta.
2. **La campana no la enlaza**: `notificationHref` no conoce la entidad y
   devuelve `null`, así que la tarea se lee pero no lleva a ningún sitio. El
   título ya trae el nombre del socio, que es lo que hace que se entienda.

Los dos ficheros son de otras pistas y el trimestre pide pedirlo por escrito en
vez de tocarlos.

## Lo que pido, concreto

En `src/lib/tasks.ts`, dentro de `AUTO_TASK_RULES`:

```ts
flowTask: { entityType: "FlowTask", label: "Tarea de un flujo", audience: "persona" },
```

`"persona"` y no `"centro"`: la tarea de un flujo va a **el entrenador de ese
socio**, que es quien puede hacerla; repartirla por hueco la mandaría a
cualquiera de dirección.

En `src/lib/notification-routes.ts`, añadir `"FlowTask"` a
`NotificationEntityType` y a `NOTIFICATION_ENTITY_TYPES`, y resolver su destino.
**Ojo:** el `entityId` de esta regla NO es un id de socio, es
`<enrollmentId>:<stepId>`, así que el destino no puede ser `/members/<id>`. Dos
opciones, y la decisión es de quien mantiene el fichero:

- llevar a `/flujos/<flowId>` (haría falta que E2 cambie el `entityId` para
  incluir el flujo — decidme y lo cambio en una línea), o
- dejar `null` explícitamente y documentar por qué, que es lo que pasa hoy de
  hecho pero sin que esté escrito.

Y recordad que la app móvil replica esa tabla
(`apps/mobile/src/notification-routes.ts`): `notification-routes.test.ts` avisa
si se desincronizan.

## Lo que NO pido

Que el tope semanal de tareas de M3 deje pasar las de flujo. **Las de flujo
cuentan para el tope como cualquier otra**, y así debe seguir: el tope protege
la bandeja de una persona de la máquina, y un flujo es máquina. Si el tope se
come una tarea de flujo, la situación sigue ahí y la próxima pasada con hueco la
escribe — que es justo lo que dice `docs/hu/M3-decisiones-motor-tareas.md`.
