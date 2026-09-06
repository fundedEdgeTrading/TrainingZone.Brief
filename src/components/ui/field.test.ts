import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import { Field, Input, Select, Textarea } from "./field";

// El runner de unitarias es `tsx --test` sobre `src/**/*.test.ts`: no hay DOM ni
// JSX, así que se compone con `createElement` y se afirma sobre el marcado. Es
// suficiente, porque lo que hay que proteger aquí es el CONTRATO de atributos
// del que sale el nombre accesible.
function html(element: Parameters<typeof renderToStaticMarkup>[0]) {
  return renderToStaticMarkup(element);
}

/** `aria-labelledby="a b"` → ["a", "b"]. */
function attr(markup: string, name: string, nth = 0): string | undefined {
  const matches = [...markup.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))];
  return matches[nth]?.[1];
}

test("la etiqueta apunta al control con htmlFor y el control recibe ese id", () => {
  const markup = html(h(Field, { label: "Teléfono", children: h(Input, { name: "phone" }) }));
  const forId = attr(markup, "for");
  assert.ok(forId, "la etiqueta tiene que llevar htmlFor");
  assert.match(markup, new RegExp(`<input[^>]*id="${forId}"`));
});

test("un campo con error marca aria-invalid y describe el mensaje", () => {
  const markup = html(
    h(Field, { label: "Teléfono", error: "El teléfono no es válido", children: h(Input, { name: "phone" }) }),
  );
  const describedBy = attr(markup, "aria-describedby");
  assert.match(markup, /aria-invalid="true"/);
  assert.ok(describedBy);
  assert.match(markup, new RegExp(`<p id="${describedBy}"[^>]*>El teléfono no es válido</p>`));
});

test("la ayuda también se referencia con aria-describedby", () => {
  const markup = html(h(Field, { label: "Objetivos", hint: "Solo dígitos", children: h(Textarea, { name: "goals" }) }));
  const describedBy = attr(markup, "aria-describedby");
  assert.ok(describedBy);
  assert.match(markup, new RegExp(`<p id="${describedBy}"[^>]*>Solo dígitos</p>`));
  assert.doesNotMatch(markup, /aria-invalid="/, "sin error no se marca el atributo (la clase de Tailwind sí aparece)");
});

/**
 * La regresión que tumbó `leads.spec.ts` e `import-socios-cuota.spec.ts`:
 *
 * el disparador de `Select` es un `<button>`, y a un `<button>` asociado con
 * `htmlFor` el navegador le da como nombre accesible el texto de la etiqueta y
 * DESCARTA su contenido, que es justo el valor elegido. Con solo `htmlFor` el
 * nombre pasó de "Selecciona..." a "¿Cómo nos has conocido?" — el lector de
 * pantalla dejó de decir qué había elegido, y los dos specs dejaron de
 * encontrar el botón.
 *
 * El contrato es: `aria-labelledby` = id de la etiqueta + id del nodo del
 * valor, en ese orden, de modo que el nombre sea "<etiqueta> <valor>" como en
 * un `<select>` nativo.
 */
test("el disparador de Select se nombra con la etiqueta Y el valor, no solo la etiqueta", () => {
  const markup = html(
    h(Field, {
      label: "¿Cómo nos has conocido?",
      children: h(
        Select,
        { name: "channel", defaultValue: "" },
        h("option", { value: "", disabled: true }, "Selecciona..."),
      ),
    }),
  );

  const labelId = attr(markup, "id");
  const labelledBy = attr(markup, "aria-labelledby")?.split(" ") ?? [];
  assert.equal(labelledBy.length, 2, "tienen que ser dos ids: etiqueta y valor");
  assert.equal(labelledBy[0], labelId, "la etiqueta va primero");
  assert.match(
    markup,
    new RegExp(`<span id="${labelledBy[1]}"[^>]*>Selecciona\\.\\.\\.</span>`),
    "el segundo id es el del nodo que pinta el valor",
  );
});

test("un Select sin etiqueta de Field conserva el nombre por contenido", () => {
  // Es el caso del diálogo de falta (`no-show-button.tsx`), que envuelve el
  // Select en su propio `<label>`: componer ahí un aria-labelledby a medias
  // dejaría el disparador nombrado solo por su valor.
  const markup = html(h(Select, { name: "reason" }, h("option", { value: "x" }, "Causa justificada")));
  assert.doesNotMatch(markup, /aria-labelledby/);
});

test("un hijo no etiquetable toma el camino role=group", () => {
  // Un `<label for>` apuntando a un `div` no asocia nada, así que el nombre se
  // da con role="group" + aria-labelledby sobre el contenedor.
  const markup = html(h(Field, { label: "Barrio / zona", children: h("div", null, h(Input, { name: "barrio" })) }));
  assert.match(markup, /role="group"/);
  const labelledBy = attr(markup, "aria-labelledby");
  assert.ok(labelledBy);
  assert.match(markup, new RegExp(`<label id="${labelledBy}"`));
  assert.doesNotMatch(markup, /<label[^>]*for=/);
});

test("un id puesto a mano por el call-site manda sobre el generado", () => {
  const markup = html(h(Field, { label: "Email", children: h(Input, { name: "email", id: "mi-email" }) }));
  assert.match(markup, /for="mi-email"/);
  assert.match(markup, /<input[^>]*id="mi-email"/);
});
