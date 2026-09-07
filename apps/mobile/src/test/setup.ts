/**
 * Preparación común de cada test de la app (E7-01).
 *
 * Se ejecuta antes de cada fichero (`setupFilesAfterEnv`). Todo lo que hay aquí
 * existe para que **ningún test arrastre estado a otro**: ni tokens, ni caché de
 * red, ni respuestas declaradas.
 */
// RNTL 13 registra sus matchers (`toBeOnTheScreen`, `toHaveTextContent`…) al
// importarse: no hay que traer un `extend-expect` aparte como en versiones
// anteriores.
import { installFetchDouble, resetFetchDouble } from "./server";

/** El mismo valor que lee `@/api/client` para componer las URLs. */
const TEST_API_URL = "http://api.test/api/mobile/v1";
process.env.EXPO_PUBLIC_API_URL = TEST_API_URL;

/**
 * `expo-secure-store` es nativo: en Jest no existe. Se dobla con un almacén en
 * memoria en vez de con `jest.fn()` sueltos, porque `client.ts` guarda y relee
 * tokens de verdad (el refresco tras un 401 depende de ello).
 */
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    // E10-18: el valor real no importa en el doble — solo que `client.ts` lo
    // pase tal cual a `setItemAsync`, así que basta con que exista.
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: "127.0.0.1:8081", extra: { apiUrl: TEST_API_URL } } },
}));

beforeEach(() => {
  resetFetchDouble();
  installFetchDouble(TEST_API_URL);
});

afterEach(() => {
  resetFetchDouble();
  // El almacén de tokens vive en el módulo doblado, no en el test: se vacía
  // aquí para que una sesión iniciada en un test no entre en el siguiente.
  const secureStore = jest.requireMock("expo-secure-store") as { __store: Map<string, string> };
  secureStore.__store.clear();
});
