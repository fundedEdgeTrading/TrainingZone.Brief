import type { AccountDeletionRequestView } from "@/lib/account-deletion";

/**
 * E5-15 · En qué estado está la solicitud.
 *
 * Resolverlo como solicitud verificada al centro está permitido; lo que no lo
 * está es que el socio no sepa en qué punto va. De ahí que esto sea lo primero
 * de la pantalla y que enseñe siempre la fecha límite: sin fecha, "la estamos
 * tramitando" no es información.
 */

const FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };

export function DeletionRequestStatus({ request }: { request: AccountDeletionRequestView }) {
  const requestedAt = request.requestedAt.toLocaleDateString("es-ES", FORMAT);
  const dueAt = request.dueAt.toLocaleDateString("es-ES", FORMAT);
  const resolvedAt = request.resolvedAt?.toLocaleDateString("es-ES", FORMAT);
  const source = request.source === "MOBILE_APP" ? "desde la app" : "desde el portal web";

  if (request.status === "PENDING") {
    return (
      <div className="rounded-2xl border border-warning-text/30 bg-warning-bg p-[22px]">
        <h3 className="font-display font-extrabold text-base uppercase tracking-[.01em] text-warning-text">
          Tu solicitud está en curso
        </h3>
        <p className="text-[13px] text-brand-text-2 leading-relaxed mt-2">
          La pediste el {requestedAt} {source}. Tu centro tiene hasta el <strong>{dueAt}</strong> para resolverla: es el
          plazo máximo de un mes del art. 12.3 RGPD. Te avisaremos por correo en cuanto esté hecha.
        </p>
        <p className="text-[12px] text-brand-muted mt-2">
          Mientras tanto puedes seguir usando tu cuenta con normalidad. Si cambias de idea, dilo en tu centro.
        </p>
      </div>
    );
  }

  const denied = request.status === "REJECTED";
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-card p-[22px]">
      <h3 className="font-display font-extrabold text-base uppercase tracking-[.01em] text-brand-text">
        {denied ? "Tu solicitud fue denegada" : "Tu solicitud está resuelta"}
      </h3>
      <p className="text-[13px] text-brand-text-2 leading-relaxed mt-2">
        La pediste el {requestedAt} {source} y se resolvió el {resolvedAt}
        {resolvedAt && request.resolvedAt && request.resolvedAt <= request.dueAt
          ? ", dentro del plazo de un mes"
          : ""}
        .
      </p>
      {request.resolutionNotes && (
        <p className="text-[13px] text-brand-text-2 leading-relaxed mt-2">«{request.resolutionNotes}»</p>
      )}
      {denied && (
        <p className="text-[12px] text-brand-muted mt-2">
          Si no estás de acuerdo, puedes reclamar ante la Agencia Española de Protección de Datos.
        </p>
      )}
    </div>
  );
}
