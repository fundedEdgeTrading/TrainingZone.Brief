import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente único de la API de Claude. Sin `ANTHROPIC_API_KEY` configurada, el
 * módulo degrada con un error controlado en vez de romper el flujo — la misma
 * convención que Stripe y Brevo en este repo.
 */
export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic | null {
  if (!isAiConfigured()) return null;
  // Los mesociclos son respuestas largas: el timeout por defecto del SDK (10
  // min) se deja tal cual y la llamada va en streaming, que es lo que evita
  // agotarlo.
  client ??= new Anthropic();
  return client;
}

/** Modelos de la fase: generar razona sobre el screening; refinar solo edita. */
export const MESOCYCLE_GENERATE_MODEL = "claude-sonnet-5";
export const MESOCYCLE_REFINE_MODEL = "claude-haiku-4-5";
