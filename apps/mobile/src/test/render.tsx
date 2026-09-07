/**
 * Envoltorio común de render (E7-01).
 *
 * Monta lo mismo que `src/app/_layout.tsx` —`QueryClientProvider`, `AuthProvider`
 * y `ToastProvider`— pero con un `QueryClient` de test: `retry: false` para que
 * un fallo declarado falle a la primera en vez de reintentarse (y agotar el
 * timeout del test), y `gcTime: 0` para que la caché no sobreviva al test.
 *
 * Cada llamada crea un cliente NUEVO: un `QueryClient` compartido entre tests
 * arrastra respuestas de uno a otro y produce el peor tipo de fallo, el que
 * depende del orden.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";

import { AuthProvider } from "@/auth/auth-context";
import { ToastProvider } from "@/components/Toast";

/** Métricas fijas: en Jest no hay medición nativa de la ventana, y sin
 * `initialMetrics` `useSafeAreaInsets()` lanza en vez de devolver ceros. */
const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export type RenderWithProviders = RenderResult & { queryClient: QueryClient };

export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient } = {},
): RenderWithProviders {
  const { queryClient = createTestQueryClient(), ...rest } = options;

  function Providers({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }

  return { ...render(ui, { wrapper: Providers, ...rest }), queryClient };
}

export * from "@testing-library/react-native";
