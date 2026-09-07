/**
 * E10-18 · T10: fuera de `__DEV__`, una `API_URL` sin `https://` falla en vez
 * de caer al `http://localhost` de desarrollo — ahí es donde un despliegue
 * mal configurado mandaría datos de salud en claro.
 */
const ORIGINAL_DEV = (globalThis as { __DEV__?: boolean }).__DEV__;
const ORIGINAL_URL = process.env.EXPO_PUBLIC_API_URL;

function loadClientAsProd(url: string | undefined) {
  jest.resetModules();
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = url;
  // require() a propósito: el módulo decide http(s) y __DEV__ AL CARGARSE, y
  // jest.resetModules() solo limpia la caché para la próxima llamada a
  // require — un import estático se resolvería una única vez, antes de que
  // este test pudiera cambiar __DEV__ o la variable de entorno.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return () => require("@/api/client");
}

describe("HTTPS forzado en producción (T10 / E10-18)", () => {
  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV;
    process.env.EXPO_PUBLIC_API_URL = ORIGINAL_URL;
    jest.resetModules();
  });

  it("sin EXPO_PUBLIC_API_URL fuera de dev, el build falla al cargar", () => {
    expect(loadClientAsProd(undefined)).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it("con una URL http:// fuera de dev, la app se niega a arrancar", () => {
    expect(loadClientAsProd("http://api.trainingzone.example/api/mobile/v1")).toThrow(/https/);
  });

  it("con https:// fuera de dev, el módulo carga sin lanzar", () => {
    expect(loadClientAsProd("https://api.trainingzone.example/api/mobile/v1")).not.toThrow();
  });

  it("en __DEV__, sin variable, sigue cayendo al fallback de desarrollo", () => {
    jest.resetModules();
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    delete process.env.EXPO_PUBLIC_API_URL;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require("@/api/client")).not.toThrow();
  });
});
