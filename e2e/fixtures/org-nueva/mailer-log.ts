import fs from "fs";
import { expect } from "@playwright/test";

/**
 * Sin `BREVO_API_KEY`, `sendMail` (src/lib/mailer.ts) no envía nada: escribe
 * una línea `[mailer] … → destinatario · asunto` en la salida del servidor, y
 * el HTML solo fuera de producción (el webServer de Playwright es `next start`,
 * así que el cuerpo no aparece). Lo verificable es, por tanto, que el envío se
 * intentó con ese asunto y a esa persona; los enlaces se leen de `Invitation`.
 *
 * El proceso de Playwright no ve la salida del servidor, así que el servidor se
 * arranca a mano redirigida a un fichero y su ruta llega en `E2E_SERVER_LOG`.
 */
export function serverLogPath(): string {
  const path = process.env.E2E_SERVER_LOG;
  if (!path) {
    throw new Error(
      "Falta E2E_SERVER_LOG. Arranca el servidor a mano con su salida a un fichero " +
        "(`npm run build && npm run start > /tmp/server-org-nueva.log 2>&1 &`) y lanza Playwright con " +
        "E2E_SERVER_LOG=/tmp/server-org-nueva.log: sin ese fichero no hay forma de comprobar los emails."
    );
  }
  if (!fs.existsSync(path)) {
    throw new Error(`E2E_SERVER_LOG apunta a ${path}, que no existe: ¿se arrancó el servidor con la salida redirigida ahí?`);
  }
  return path;
}

function mailerLines(): string[] {
  return fs
    .readFileSync(serverLogPath(), "utf8")
    .split("\n")
    .filter((line) => line.includes("[mailer]"));
}

/**
 * Espera a que el servidor registre un envío a `to` cuyo asunto case con
 * `subject`. Los envíos de la app son "fire-and-forget" (`void sendMail`), así
 * que la línea puede llegar un instante después de la respuesta de la acción.
 */
export async function expectMailLogged(to: string, subject: RegExp, opts: { soft?: boolean } = {}) {
  const probe = () =>
    mailerLines().some((line) => {
      const [, tail] = line.split(" → ");
      if (!tail) return false;
      const sep = tail.indexOf(" · ");
      if (sep < 0) return false;
      return tail.slice(0, sep).trim().toLowerCase() === to.toLowerCase() && subject.test(tail.slice(sep + 3));
    });
  const poll = (opts.soft ? expect.configure({ soft: true }) : expect).poll(probe, { timeout: 10_000 });
  await poll.toBe(true);
}
