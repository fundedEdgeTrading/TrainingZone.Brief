import { ApiError } from "@/api/client";
import { EmptyState } from "./EmptyState";

/**
 * E6-01: un **402** no es un fallo de carga, es un módulo que la organización
 * no ha contratado (o un servicio suspendido). Reintentar no lo arregla, así
 * que decirle a quien mira "desliza hacia abajo para reintentar" lo deja dando
 * vueltas contra una pantalla que nunca va a cargar.
 *
 * El mensaje lo pone el servidor (`requireApiFeature` → "Tu plan no incluye
 * esta funcionalidad."), que es quien sabe qué falta: aquí solo se distingue el
 * caso y se enseña. Cualquier otro error mantiene el estado de siempre.
 */
export function isPlanRequiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 402;
}

export function QueryErrorState({
  error,
  title,
  description,
}: {
  error: unknown;
  /** Lo que se enseña cuando el fallo es de carga de verdad. */
  title: string;
  description: string;
}) {
  if (isPlanRequiredError(error)) {
    return (
      <EmptyState
        icon="star"
        title={error.message}
        description="Esta parte va con otro plan. Habla con la dirección de tu centro para ampliarlo."
      />
    );
  }
  return <EmptyState icon="alert" title={title} description={description} />;
}
