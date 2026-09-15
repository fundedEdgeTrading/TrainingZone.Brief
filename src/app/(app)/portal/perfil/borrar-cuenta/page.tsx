import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  ACCOUNT_DELETION_DEADLINE_TEXT,
  ACCOUNT_DELETION_PUBLIC_PATH,
  getAccountDeletionDisclosure,
  getLatestDeletionRequest,
} from "@/lib/account-deletion";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { prisma } from "@/lib/prisma";
import { DeletionEffectsList, RetentionNote } from "./effects-list";
import { DeletionRequestForm } from "./request-form";
import { DeletionRequestStatus } from "./request-status";

export const metadata = {
  title: "Borrar mi cuenta",
  description: "Pide el borrado de tu cuenta: qué se borra, qué se conserva y en cuánto tiempo.",
};

/**
 * E5-15 · La misma ruta que la app, accesible sin necesidad de la app
 * (escenario "solicitud desde el portal web"). Google Play exige además que
 * exista una URL pública que lo explique sin sesión: es `/borrar-cuenta`, que
 * termina aquí.
 */
export default async function DeleteAccountPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const [disclosure, request, user] = await Promise.all([
    getAccountDeletionDisclosure({
      memberId: member.id,
      orgId: session.user.orgId,
      actorUserId: session.user.id,
      actorRole: session.user.role,
    }),
    getLatestDeletionRequest(member.id, session.user.orgId),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { identity: { select: { passwordSetAt: true, authProvider: true } } },
    }),
  ]);
  if (!disclosure) redirect("/portal/perfil");

  const canUsePassword = Boolean(user?.identity.passwordSetAt) && user?.identity.authProvider === "password";
  const isOpen = request?.status === "PENDING";

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-4">
      <PageHeader
        kicker="Borrar mi cuenta"
        description="Puedes pedir que se borre tu cuenta desde aquí o desde la app. Antes de confirmar, lee qué se borra y qué está obligado tu centro a conservar."
      />

      {request && <DeletionRequestStatus request={request} />}

      <Card title="Qué pasa con tus datos" meta="RGPD">
        <p className="text-[13px] text-brand-muted -mt-3 mb-4">
          Esto no es un resumen: es el plan que se ejecuta, bloque a bloque, y el mismo que ve tu centro.
        </p>
        <DeletionEffectsList disclosure={disclosure} />
        <div className="border-t border-brand-border mt-4 pt-3">
          <RetentionNote disclosure={disclosure} />
        </div>
      </Card>

      <Card title="Los cobros no se borran" meta="Obligación legal">
        <p className="text-[13px] text-brand-text-2 leading-relaxed -mt-3">
          Los cobros que ya se te emitieron <strong>se disocian, no se borran</strong>: se conservan el número de
          recibo, el importe, la fecha y el método de pago, y se les retira el vínculo contigo. Dejan de identificarte y
          siguen contando en la contabilidad del periodo. Tu centro está obligado a conservarlos (art. 30 del Código de
          Comercio y art. 66 de la Ley General Tributaria); destruirlos sería una infracción del art. 200 LGT.
        </p>
      </Card>

      {!isOpen && (
        <Card title="Pedir el borrado">
          <p className="text-[13px] text-brand-muted -mt-3 mb-4">{ACCOUNT_DELETION_DEADLINE_TEXT}</p>
          <DeletionRequestForm canUsePassword={canUsePassword} />
        </Card>
      )}

      <p className="text-[12px] text-brand-muted">
        ¿Prefieres consultarlo antes de entrar?{" "}
        <Link href={ACCOUNT_DELETION_PUBLIC_PATH} className="underline">
          La página pública
        </Link>{" "}
        explica el mismo procedimiento sin necesidad de sesión. También puedes{" "}
        <Link href="/api/portal/export-data?alcance=acceso" className="underline">
          descargar antes una copia de tus datos
        </Link>
        : después del borrado ya no será posible.
      </p>
    </div>
  );
}
