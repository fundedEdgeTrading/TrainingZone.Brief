# Trabajo en paralelo

Este repositorio se desarrolla con **varias sesiones simultáneas**, cada una en su
rama y con su paquete de trabajo. Estas son las reglas del método; los documentos
de cada lote (qué pistas hay y qué historias lleva cada una) van y vienen, esto
no.

## Vocabulario

| Palabra | Qué es |
|---|---|
| **Sesión** | Una conversación de Claude Code trabajando. Nueve sesiones = nueve pestañas a la vez |
| **Rama** | La copia donde una sesión trabaja sin molestar a las demás (`pista/<nombre>`) |
| **Pista** | El paquete de trabajo de una sesión: sus historias y **sus ficheros** |
| **Costura** | El trabajo inicial que deja puestos los cimientos. Nadie más empieza hasta que está |
| **Ventana de merge** | Los momentos del día en que se junta el trabajo de todos |

## Las tres reglas que no se rompen

1. **Cada pista toca solo sus ficheros.** Si dos sesiones editan el mismo
   fichero, se pisan. Es la regla de oro y la única que de verdad importa.
2. **`prisma/schema.prisma` y `src/lib/rbac.ts` están congelados.** Si una pista
   los necesita, para y lo pide; no los edita en su rama.
3. **Nadie ejecuta la suite completa de Playwright** salvo quien integra, una vez
   al día: muta la base de datos de demo y contamina al resto de sesiones.

## Antes de la ventana · cada sesión

```
git add -A && git commit -m "wip"      # si queda algo sin commitear
git fetch origin main
git merge origin/main                   # resolver conflictos SOLO en los ficheros propios
npm run lint && npx tsc --noEmit && npm run test:unit
```

Y los specs de Playwright de la pista, nunca la suite entera.

## En la ventana · quien integra

Siempre en el mismo orden: de la pista que **más dependencias produce** a la que
menos.

```bash
git checkout main && git pull origin main

for RAMA in <pistas, en orden de dependencia>; do
  echo "──────── mezclando $RAMA ────────"
  git merge --no-ff pista/$RAMA || { echo "⛔ CONFLICTO en $RAMA — para aquí"; break; }
done

npm run lint && npx tsc --noEmit && npm run test:unit
git push origin main
```

Si el bucle se para en una rama, se resuelve esa y se relanza desde ahí.

> **Nunca `rebase`.** Hay nueve o diez checkouts vivos y un rebase les rompe el
> suyo. Siempre `merge`.

Una vez al día, en la última ventana, y solo entonces:

```bash
npx playwright test
```

## Corte de alcance

Al cerrar el lote, a cada sesión:

> Corte de alcance. Termina **solo** la historia que tengas a medias, haz commit
> y para. No empieces ninguna más. Dime: qué historias has terminado (con sus
> IDs), cuál has dejado a medias y cuáles no has empezado.

Con esas respuestas se tiene el estado real en cinco minutos.

## Las invariantes del dominio

Lo que ninguna pista puede redescubrir leyendo código ni cambiar por su cuenta
—ámbito de centro, datos de salud, bonos, estados de reserva, gateo por plan,
ventana de cancelación, Stripe, rótulos y cookies— está en `AGENTS.md` y
desarrollado en [ARQUITECTURA.md](./ARQUITECTURA.md).
