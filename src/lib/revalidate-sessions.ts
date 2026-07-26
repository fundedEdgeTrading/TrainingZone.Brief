import { revalidatePath } from "next/cache";

/**
 * Las mismas sesiones alimentan cuatro vistas: la agenda, el detalle de sesión,
 * el índice de briefs y el panel del entrenador. Cada acción revalidaba solo la
 * pantalla desde la que se lanzó, así que guardar un debrief dejaba el panel
 * marcándolo como pendiente, y crear o mover una sesión en la agenda no
 * aparecía en el panel ni en brief hasta que caducaba la caché.
 */
export function revalidateSessionViews(sessionId?: string) {
  revalidatePath("/agenda");
  revalidatePath("/trainer");
  revalidatePath("/brief");
  if (sessionId) {
    revalidatePath(`/agenda/session/${sessionId}`);
    revalidatePath(`/brief/${sessionId}`);
  }
}
