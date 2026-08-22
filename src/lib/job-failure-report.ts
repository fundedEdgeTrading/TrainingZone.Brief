import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

export type JobFailure = { orgId: string; rule: string; error: string };

/**
 * F4 §5.1: el runner aísla los fallos por regla y devuelve `failures[]`, pero
 * ese array solo lo lee el cron — y un cron no lee. Sin esto, una regla rota en
 * una organización es invisible hasta que alguien echa de menos el efecto
 * (nadie recibe su valoración, nadie recibe su felicitación) semanas después.
 *
 * Cada fallo abre una tarea para la dirección de esa organización, una por
 * regla: `createNotificationOnce` no abre una segunda mientras la anterior siga
 * sin resolver, así que un fallo que se repite cada día no inunda la bandeja.
 */
export async function reportJobFailures(failures: JobFailure[]): Promise<void> {
  if (failures.length === 0) return;

  const byOrg = new Map<string, JobFailure[]>();
  for (const failure of failures) {
    const list = byOrg.get(failure.orgId) ?? [];
    list.push(failure);
    byOrg.set(failure.orgId, list);
  }

  for (const [orgId, orgFailures] of byOrg) {
    const recipients = await prisma.user.findMany({
      where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] } },
      select: { id: true },
    });
    for (const rule of new Set(orgFailures.map((f) => f.rule))) {
      const error = orgFailures.find((f) => f.rule === rule)!.error;
      for (const recipient of recipients) {
        await createNotificationOnce({
          orgId,
          recipientUserId: recipient.id,
          kind: "ALERT",
          title: `Una tarea automática está fallando: ${rule}`,
          body: `El proceso diario no ha podido completar «${rule}». Último error: ${error}`,
          entityType: "JobFailure",
          entityId: rule,
        });
      }
    }
  }
}
