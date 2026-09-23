import test from "node:test";
import assert from "node:assert/strict";

import { sendMail, type MailOptions } from "@/lib/mailer";

/**
 * PROD-03 · En producción el correo ya no "se simula en silencio".
 *
 * Antes, sin BREVO_API_KEY el mailer escribía "simulando envío" en el log y
 * volvía como si nada, y con un error de Brevo lo tragaba: la invitación de un
 * entrenador o el enlace de recuperación de contraseña no salían y ninguna
 * pantalla se enteraba. Ahora devuelve un resultado explícito que el llamador
 * puede leer — y sigue sin lanzar, para quien lo ignora (`void sendMail(...)`).
 */

const MAIL: MailOptions = { to: "socio@example.com", subject: "Asunto de prueba", html: "<p>hola</p>" };
const SECRET_KEY = "xkeysib-no-debe-salir-en-ningun-log";

type Captured = { log: string[]; error: string[] };

/** Captura console.log/console.error durante `fn`, sin ensuciar la salida del test. */
async function capture<T>(fn: () => Promise<T>): Promise<{ result: T; out: Captured }> {
  const out: Captured = { log: [], error: [] };
  const original = { log: console.log, error: console.error };
  console.log = (...args: unknown[]) => void out.log.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => void out.error.push(args.map(String).join(" "));
  try {
    return { result: await fn(), out };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
}

function fakeFetch(response: { status: number; body: unknown }): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

test("PROD-03 · producción sin BREVO_API_KEY: ok:false, log de error y NO simula", async () => {
  const { result, out } = await capture(() => sendMail(MAIL, { env: { NODE_ENV: "production" } }));
  assert.equal(result.ok, false);
  assert.equal(out.error.length, 1, "tiene que quedar un log de error");
  assert.match(out.error[0], /BREVO_API_KEY/);
  assert.equal(out.log.some((line) => /simulando/.test(line)), false, "en producción no se finge el envío");
});

test("PROD-03 · producción con error de Brevo: ok:false, log de error sin la clave", async () => {
  const { result, out } = await capture(() =>
    sendMail(MAIL, {
      env: { NODE_ENV: "production", BREVO_API_KEY: SECRET_KEY, BREVO_FROM_EMAIL: "no-reply@example.com" },
      fetch: fakeFetch({ status: 401, body: { code: "unauthorized", message: "Key not found" } }),
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /401/);
  assert.equal(out.error.length, 1);
  assert.doesNotMatch(out.error.join("\n"), new RegExp(SECRET_KEY));
  assert.doesNotMatch(result.ok ? "" : result.error, new RegExp(SECRET_KEY));
});

test("PROD-03 · un fallo de red no lanza: devuelve ok:false", async () => {
  const { result } = await capture(() =>
    sendMail(MAIL, {
      env: { NODE_ENV: "production", BREVO_API_KEY: SECRET_KEY, BREVO_FROM_EMAIL: "no-reply@example.com" },
      fetch: (async () => {
        throw new Error("ECONNRESET");
      }) as typeof fetch,
    })
  );
  assert.equal(result.ok, false);
});

test("PROD-03 · envío correcto: ok:true con el messageId de Brevo", async () => {
  const { result } = await capture(() =>
    sendMail(MAIL, {
      env: { NODE_ENV: "production", BREVO_API_KEY: SECRET_KEY, BREVO_FROM_EMAIL: "no-reply@example.com" },
      fetch: fakeFetch({ status: 201, body: { messageId: "<abc@smtp-relay.brevo.com>" } }),
    })
  );
  assert.deepEqual(result, { ok: true, id: "<abc@smtp-relay.brevo.com>" });
});

test("PROD-03 · en desarrollo sin clave se mantiene la simulación, con el mismo formato de log", async () => {
  const { result, out } = await capture(() =>
    sendMail({ ...MAIL, fromName: "Centro" }, { env: { NODE_ENV: "development" } })
  );
  assert.equal(result.ok, true);
  // P12 lee estos correos del log: el formato no cambia.
  assert.equal(out.log[0], "[mailer] Brevo no configurado — simulando envío de «Centro» → socio@example.com · Asunto de prueba");
  assert.equal(out.log[1], "<p>hola</p>");
  assert.equal(out.error.length, 0);
});
