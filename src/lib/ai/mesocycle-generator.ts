import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  getAnthropicClient,
  MESOCYCLE_GENERATE_MODEL,
  MESOCYCLE_REFINE_MODEL,
} from "@/lib/ai/anthropic";
import { MesocyclePlanSchema, type MesocyclePlan } from "@/lib/ai/mesocycle-schema";
import {
  MESOCYCLE_SYSTEM_METHODOLOGY,
  MESOCYCLE_SYSTEM_REFINE,
  buildMesocycleBriefing,
  buildRefineRequest,
} from "@/lib/ai/mesocycle-prompt";
import type { MesocycleBriefing } from "@/lib/health-access";

/**
 * Historial multi-turno del refinado, tal y como se guarda en
 * `Mesocycle.aiConversation`. Es el formato de mensajes del SDK: se vuelve a
 * mandar entero en cada refinado, que es lo que hace que "y ahora quítale
 * también el segundo" se entienda sin repetir el contexto.
 */
export type MesocycleConversation = Anthropic.MessageParam[];

export type PlanResult =
  | { ok: true; plan: MesocyclePlan; conversation: MesocycleConversation }
  | { ok: false; error: string };

const MAX_TOKENS = 64000;

/** Un mesociclo completo son miles de tokens: sin streaming se agota el timeout HTTP. */
export async function generateMesocyclePlan(briefing: MesocycleBriefing): Promise<PlanResult> {
  const client = getAnthropicClient();
  if (!client) return { ok: false, error: "La generación con IA no está configurada (falta ANTHROPIC_API_KEY)." };

  const userMessage = buildMesocycleBriefing(briefing);

  try {
    const stream = client.messages.stream({
      model: MESOCYCLE_GENERATE_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system: [
        // El punto de corte del caché va al final de la metodología: lo del
        // socio viene después, en el mensaje de usuario, y no lo invalida.
        { type: "text", text: MESOCYCLE_SYSTEM_METHODOLOGY, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
      output_config: { format: zodOutputFormat(MesocyclePlanSchema) },
    });

    const message = await stream.finalMessage();
    logCacheUsage("generar", message.usage);

    if (!message.parsed_output) {
      return { ok: false, error: describeUnparsed(message) };
    }

    return {
      ok: true,
      plan: message.parsed_output,
      conversation: [
        { role: "user", content: userMessage },
        { role: "assistant", content: JSON.stringify(message.parsed_output) },
      ],
    };
  } catch (error) {
    return { ok: false, error: describeApiError(error) };
  }
}

/**
 * Refinado conversacional ("cambia la fase 2, no me gusta el broad jump"). Va
 * en multi-turno sobre el historial guardado y devuelve el plan completo: solo
 * debe cambiar lo pedido.
 */
export async function refineMesocyclePlan({
  plan,
  conversation,
  request,
}: {
  plan: MesocyclePlan;
  conversation: MesocycleConversation;
  request: string;
}): Promise<PlanResult> {
  const client = getAnthropicClient();
  if (!client) return { ok: false, error: "El refinado con IA no está configurado (falta ANTHROPIC_API_KEY)." };

  const userMessage = buildRefineRequest(plan, request);
  const messages: MesocycleConversation = [...conversation, { role: "user", content: userMessage }];

  try {
    const stream = client.messages.stream({
      model: MESOCYCLE_REFINE_MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: MESOCYCLE_SYSTEM_REFINE, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { format: zodOutputFormat(MesocyclePlanSchema) },
    });

    const message = await stream.finalMessage();
    logCacheUsage("refinar", message.usage);

    if (!message.parsed_output) {
      return { ok: false, error: describeUnparsed(message) };
    }

    return {
      ok: true,
      plan: message.parsed_output,
      conversation: [...messages, { role: "assistant", content: JSON.stringify(message.parsed_output) }],
    };
  } catch (error) {
    return { ok: false, error: describeApiError(error) };
  }
}

/**
 * El caché del prefijo se amortiza a partir del segundo mesociclo. Si
 * `cache_read_input_tokens` sale cero en llamadas repetidas hay un invalidador
 * silencioso en la parte estable del sistema, y esta línea es la que lo delata.
 */
function logCacheUsage(step: string, usage: Anthropic.Usage) {
  console.log(
    `[mesociclo:${step}] entrada=${usage.input_tokens} caché_escrito=${usage.cache_creation_input_tokens ?? 0} ` +
      `caché_leído=${usage.cache_read_input_tokens ?? 0} salida=${usage.output_tokens}`
  );
}

function describeUnparsed(message: Anthropic.Message): string {
  if (message.stop_reason === "max_tokens") {
    return "El plan se cortó por longitud. Prueba con menos semanas o menos días por semana.";
  }
  if (message.stop_reason === "refusal") {
    return "El modelo declinó generar este plan. Revisa los criterios clínicos de la ficha.";
  }
  return "La respuesta del modelo no encajó con el formato del plan. Vuelve a intentarlo.";
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "La clave de la API de Claude no es válida.";
  if (error instanceof Anthropic.RateLimitError) return "Límite de peticiones alcanzado. Inténtalo en unos minutos.";
  if (error instanceof Anthropic.APIError) return `Error de la API de Claude (${error.status}).`;
  console.error("[mesociclo] error inesperado", error);
  return "No se pudo contactar con la API de Claude.";
}
