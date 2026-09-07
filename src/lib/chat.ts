import { prisma } from "@/lib/prisma";
import { Prisma, type Role } from "@prisma/client";
import { createNotificationOnce } from "@/lib/notifications";
import { sendMail } from "@/lib/mailer";
import { renderNewChatMessageEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/site";

const CHAT_RECENT_WINDOW_DAYS = 90;

/**
 * RB-CHAT-001: visibilidad — dirección del centro ve el chat completo. Un
 * entrenador lo ve si ha impartido o dirigido alguna sesión de ese socio (vía
 * Booking) en la ventana reciente: ya no hay "el entrenador asignado" fijo, el
 * acceso se deriva de quién lo ha entrenado de verdad.
 *
 * E12-02: recepción YA NO ve todos los chats de forma permanente — antes era
 * un acceso indefinido, y "solo lectura para siempre" no es ámbito, es fuga.
 * Su acceso se acota a lo que necesita para atender: mientras el último
 * mensaje del hilo sea del socio (una pregunta sin responder), recepción
 * puede entrar y contestar. En cuanto alguien de dirección o el entrenador
 * responde, el hilo deja de estar abierto para recepción.
 */
export async function canAccessMemberChat(orgId: string, memberId: string, actorUserId: string, actorRole: Role) {
  if (actorRole === "OWNER" || actorRole === "CENTER_DIRECTOR") return true;
  if (actorRole === "RECEPTION") {
    const conversation = await prisma.conversation.findUnique({ where: { memberId }, select: { id: true } });
    if (!conversation) return false;
    const lastMessage = await prisma.chatMessage.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      select: { senderKind: true },
    });
    return lastMessage?.senderKind === "MEMBER";
  }
  if (actorRole !== "TRAINER" && actorRole !== "TRAINER_ADMIN") return false;

  const since = new Date(Date.now() - CHAT_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentBooking = await prisma.booking.findFirst({
    where: {
      memberId,
      session: {
        orgId,
        date: { gte: since },
        OR: [{ trainerId: actorUserId }, { directedByUserId: actorUserId }],
      },
    },
    select: { id: true },
  });
  return !!recentBooking;
}

/**
 * El hilo de chat lo abre cualquier pantalla del portal (`portal/layout.tsx`),
 * así que un socio recién dado de alta llega con varias peticiones a la vez: la
 * página, su prefetch y el chat flotante. Todas leían "no hay conversación" y
 * todas intentaban crearla; la que perdía la carrera chocaba con el unique de
 * `memberId` y tumbaba la pantalla entera con un error de servidor — el socio
 * nuevo veía "This page couldn't load" justo al entrar por primera vez.
 *
 * Ni `findUnique`+`create` ni `upsert` bastan (Prisma resuelve el upsert con un
 * SELECT y un INSERT separados, así que la carrera sigue viva): la única lectura
 * fiable del resultado es tratar el P2002 como "ya la creó la otra petición" y
 * volver a leerla.
 */
export async function getOrCreateConversation(orgId: string, memberId: string) {
  const existing = await prisma.conversation.findUnique({ where: { memberId } });
  if (existing) return existing;
  try {
    return await prisma.conversation.create({ data: { orgId, memberId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.conversation.findUniqueOrThrow({ where: { memberId } });
    }
    throw error;
  }
}

export async function listMessages(conversationId: string) {
  return prisma.chatMessage.findMany({
    where: { conversationId },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export type ChatWriteResult = { ok: true } | { ok: false; error: string };

/** Mismo orden de magnitud que el resto de textos libres del portal (feedback, notas). */
const MAX_MESSAGE_LENGTH = 2000;

export async function sendMessage(
  conversationId: string,
  senderKind: "MEMBER" | "TRAINER" | "AI" | "DIRECTION",
  senderUserId: string | null,
  body: string
): Promise<ChatWriteResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "El mensaje no puede estar vacío." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `El mensaje es demasiado largo (máximo ${MAX_MESSAGE_LENGTH} caracteres).` };
  }
  await prisma.chatMessage.create({ data: { conversationId, senderKind, senderUserId, body: trimmed } });

  // E12-02: un mensaje del socio ya no cae en un buzón del que nadie se
  // entera. Avisa a dirección con una Notification (bandeja) y un email —
  // antes no había ni una cosa ni la otra.
  if (senderKind === "MEMBER") {
    await notifyDirectorsOfNewMessage(conversationId, trimmed);
  }
  return { ok: true };
}

async function notifyDirectorsOfNewMessage(conversationId: string, messageBody: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      orgId: true,
      memberId: true,
      member: { select: { firstName: true, lastName: true } },
      organization: { select: { name: true, logoUrl: true } },
    },
  });
  if (!conversation) return;

  const directors = await prisma.user.findMany({
    where: { orgId: conversation.orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] }, deactivatedAt: null },
    select: { id: true, email: true, name: true },
  });
  const memberName = `${conversation.member.firstName} ${conversation.member.lastName}`.trim();
  const preview = messageBody.length > 140 ? `${messageBody.slice(0, 140)}…` : messageBody;

  for (const director of directors) {
    await createNotificationOnce({
      orgId: conversation.orgId,
      recipientUserId: director.id,
      kind: "TASK",
      title: `Mensaje nuevo de ${memberName}`,
      body: preview,
      entityType: "Member",
      entityId: conversation.memberId,
    });
    await sendMail({
      to: director.email,
      subject: `Mensaje nuevo de ${memberName} en el chat`,
      html: renderNewChatMessageEmail({
        recipientFirstName: director.name?.split(" ")[0] ?? "",
        memberName,
        orgName: conversation.organization.name,
        orgLogoUrl: conversation.organization.logoUrl || "/brand/tz-logo-white.png",
        messagePreview: preview,
        chatUrl: absoluteUrl(`/members/${conversation.memberId}?s=actividad`),
      }),
      fromName: conversation.organization.name,
    });
  }
}
