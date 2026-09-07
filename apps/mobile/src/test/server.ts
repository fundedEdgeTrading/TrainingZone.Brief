/**
 * Doble de la frontera de red (E7-01).
 *
 * La app habla con el servidor por un ÚNICO punto —`apiRequest` en
 * `@/api/client`, que llama al `fetch` global— así que no hace falta MSW: se
 * dobla `globalThis.fetch` y se sirven respuestas ya tipadas. Un interceptor a
 * nivel de red para una sola salida es infraestructura que hay que mantener a
 * cambio de nada.
 *
 * Las respuestas se declaran por ruta y método, con el mismo sobre
 * (`{ ok, data }`) que emite `src/app/api/mobile/v1/**`: si el sobre cambia en
 * el servidor, estos tests se enteran.
 */

/** Método y ruta tal como los pide `apiRequest`, sin el prefijo de la API. */
export type RouteKey = `${"GET" | "POST" | "PATCH" | "DELETE"} ${string}`;

type Handler = {
  status: number;
  /** Cuerpo ya envuelto. `undefined` = respuesta sin JSON válido. */
  body: unknown;
  /** Retraso antes de resolver (E8-12): sin él, un doble sin latencia real
   * resuelve dentro del mismo tick del render y un estado de carga transitorio
   * nunca llega a ser observable por `findBy*`. */
  delayMs?: number;
};

type Recorded = {
  method: string;
  /** Ruta sin el prefijo de la API: "/me", "/agenda?from=…". */
  path: string;
  body: unknown;
  authorization: string | null;
};

const handlers = new Map<RouteKey, Handler[]>();
let calls: Recorded[] = [];
let realFetch: typeof globalThis.fetch | undefined;

/** Todo lo que la app pidió, en orden. Sirve para afirmar sobre el contrato. */
export function requests(): readonly Recorded[] {
  return calls;
}

/** La última petición a una ruta, o `undefined` si no se pidió. */
export function lastRequest(key: RouteKey): Recorded | undefined {
  const [method, path] = splitKey(key);
  return [...calls].reverse().find((c) => c.method === method && stripQuery(c.path) === path);
}

function splitKey(key: RouteKey): [string, string] {
  const space = key.indexOf(" ");
  return [key.slice(0, space), key.slice(space + 1)];
}

function stripQuery(path: string) {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

/**
 * Declara la respuesta de una ruta. Encolar varias veces la misma ruta sirve
 * para el segundo intento tras un 401, o para que una lista cambie entre dos
 * refrescos; la última se repite si se piden más.
 */
export function reply<T>(key: RouteKey, data: T, status = 200) {
  push(key, { status, body: { ok: true, data } });
}

/** Como `reply`, pero resuelve pasado `delayMs`: para observar un estado de
 * carga que, sin latencia, se resolvería dentro del mismo tick del render. */
export function replyDelayed<T>(key: RouteKey, data: T, delayMs: number, status = 200) {
  push(key, { status, body: { ok: true, data }, delayMs });
}

/**
 * Declara un fallo con el sobre de error del servidor. `details` es lo que
 * `ApiError` deja en `error.details` (hoy, las organizaciones del 409 del
 * login).
 */
export function replyError(key: RouteKey, error: string, status = 400, details: Record<string, unknown> = {}) {
  push(key, { status, body: { ok: false, error, ...details } });
}

/** El servidor no contesta: red caída, DNS, TLS. */
export function replyNetworkError(key: RouteKey) {
  push(key, { status: 0, body: undefined });
}

function push(key: RouteKey, handler: Handler) {
  const queue = handlers.get(key) ?? [];
  queue.push(handler);
  handlers.set(key, queue);
}

function take(method: string, path: string): Handler | undefined {
  const exact = handlers.get(`${method} ${path}` as RouteKey);
  const byPath = exact ?? handlers.get(`${method} ${stripQuery(path)}` as RouteKey);
  if (!byPath || byPath.length === 0) return undefined;
  // La última declarada se repite: así un test que refresca N veces no tiene
  // que encolar N respuestas idénticas.
  return byPath.length === 1 ? byPath[0] : byPath.shift();
}

/**
 * Instala el doble. Lo llama `src/test/setup.ts` antes de cada test, así que un
 * test normal no necesita invocarlo.
 */
export function installFetchDouble(apiUrl: string) {
  realFetch ??= globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.startsWith(apiUrl) ? url.slice(apiUrl.length) : url;

    calls.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headerOf(init?.headers, "Authorization"),
    });

    const handler = take(method, path);
    if (!handler) {
      // Explícito a propósito: un test que olvida declarar una ruta tiene que
      // decir CUÁL, no fallar con un `undefined` tres capas más arriba.
      throw new Error(
        `[test] Sin respuesta declarada para "${method} ${path}". ` +
          `Declárala con reply("${method} ${stripQuery(path)}", …) en el propio test.`,
      );
    }

    if (handler.body === undefined) {
      // Mismo error que lanza el motor de red: `client.ts` lo traduce a
      // «No hay conexión con el servidor…».
      throw new TypeError("Network request failed");
    }

    if (handler.delayMs) await new Promise((resolve) => setTimeout(resolve, handler.delayMs));

    return new Response(JSON.stringify(handler.body), {
      status: handler.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

function headerOf(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) return headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? (headers as Record<string, string>)[key] : null;
}

/** Borra rutas y registro. Ningún test arrastra respuestas a otro. */
export function resetFetchDouble() {
  handlers.clear();
  calls = [];
}
