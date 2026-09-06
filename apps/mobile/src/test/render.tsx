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

import { AuthProvider } from "@/auth/auth-context";
import { ToastProvider } from "@/components/Toast";

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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Providers, ...rest }), queryClient };
}

export * from "@testing-library/react-native";
