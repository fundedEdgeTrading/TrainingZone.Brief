"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canManageAnnouncements } from "@/lib/rbac";
import { getCentersForUser } from "@/lib/agenda-queries";
import type { AnnouncementAudience, AnnouncementCategory } from "@prisma/client";

export type AnnouncementActionResult = { ok: true } | { ok: false; error: string };

const CATEGORIES: AnnouncementCategory[] = ["NEWS", "EVENT", "PROMO", "ALERT"];
const AUDIENCES: AnnouncementAudience[] = ["ALL", "MEMBERS"];

async function requireManager() {
  const session = await requireSession();
  if (!canManageAnnouncements(session.user.role)) return null;
  return session;
}

// Convierte "YYYY-MM-DD" (input date) en Date, o null si viene vacío.
// `endOfDay` para la fecha de fin: el gestor entiende "Hasta el 31" como que el
// anuncio se ve *durante* el 31. Guardándolo a las 00:00 el filtro `endsAt >= now`
// lo ocultaba en el portal desde el primer minuto de ese día.
function parseDate(raw: FormDataEntryValue | null, endOfDay = false): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(endOfDay ? `${s}T23:59:59.999Z` : s);
  return isNaN(d.getTime()) ? null : d;
}

function parseForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const rawCategory = String(formData.get("category") ?? "NEWS") as AnnouncementCategory;
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : "NEWS";
  const rawAudience = String(formData.get("audience") ?? "ALL") as AnnouncementAudience;
  const audience = AUDIENCES.includes(rawAudience) ? rawAudience : "ALL";
  const centerId = String(formData.get("centerId") ?? "").trim() || null;
  const pinned = formData.get("pinned") === "on" || formData.get("pinned") === "true";
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const startsAt = parseDate(formData.get("startsAt"));
  const endsAt = parseDate(formData.get("endsAt"), true);
  return { title, body, imageUrl, category, audience, centerId, pinned, tags, startsAt, endsAt };
}

// El director solo puede publicar en centros de su ámbito (o global). Devuelve
// true si el centerId propuesto es admisible para este gestor.
async function centerAllowed(
  user: { id: string; role: "OWNER" | "CENTER_DIRECTOR" | "PLATFORM_ADMIN" | string; orgId: string; centerId: string | null },
  centerId: string | null
): Promise<boolean> {
  if (centerId == null) return true; // global
  const centers = await getCentersForUser({ id: user.id, role: user.role as never, orgId: user.orgId, centerId: user.centerId });
  return centers.some((c) => c.id === centerId);
}

export async function createAnnouncement(formData: FormData): Promise<AnnouncementActionResult> {
  const session = await requireManager();
  if (!session) return { ok: false, error: "No tienes permiso para gestionar anuncios." };

  const data = parseForm(formData);
  if (!data.title) return { ok: false, error: "El anuncio necesita un título." };
  if (!data.body && !data.imageUrl) return { ok: false, error: "Añade un texto o una imagen al anuncio." };
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." };
  }
  if (!(await centerAllowed(session.user, data.centerId))) {
    return { ok: false, error: "No puedes publicar en ese centro." };
  }

  await prisma.announcement.create({
    data: {
      orgId: session.user.orgId,
      centerId: data.centerId,
      title: data.title,
      body: data.body,
      imageUrl: data.imageUrl,
      category: data.category,
      audience: data.audience,
      tags: data.tags,
      pinned: data.pinned,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      createdById: session.user.id,
    },
  });

  revalidatePath("/anuncios");
  revalidatePath("/portal");
  return { ok: true };
}

export async function updateAnnouncement(id: string, formData: FormData): Promise<AnnouncementActionResult> {
  const session = await requireManager();
  if (!session) return { ok: false, error: "No tienes permiso para gestionar anuncios." };

  const existing = await prisma.announcement.findFirst({ where: { id, orgId: session.user.orgId } });
  if (!existing) return { ok: false, error: "No se ha encontrado el anuncio." };
  // El centro ACTUAL del anuncio también tiene que estar en el ámbito de quien
  // edita, no solo el que proponga el formulario: si no, se podía tocar el
  // anuncio de otro centro (o uno global) con solo conocer su id, aunque el
  // listado ya lo filtrara.
  if (!(await centerAllowed(session.user, existing.centerId))) {
    return { ok: false, error: "No se ha encontrado el anuncio." };
  }

  const data = parseForm(formData);
  if (!data.title) return { ok: false, error: "El anuncio necesita un título." };
  if (!data.body && !data.imageUrl) return { ok: false, error: "Añade un texto o una imagen al anuncio." };
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." };
  }
  if (!(await centerAllowed(session.user, data.centerId))) {
    return { ok: false, error: "No puedes publicar en ese centro." };
  }

  await prisma.announcement.update({
    where: { id },
    data: {
      centerId: data.centerId,
      title: data.title,
      body: data.body,
      imageUrl: data.imageUrl,
      category: data.category,
      audience: data.audience,
      tags: data.tags,
      pinned: data.pinned,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    },
  });

  revalidatePath("/anuncios");
  revalidatePath("/portal");
  return { ok: true };
}

export async function toggleAnnouncementActive(id: string, active: boolean): Promise<AnnouncementActionResult> {
  const session = await requireManager();
  if (!session) return { ok: false, error: "No tienes permiso para gestionar anuncios." };
  const existing = await prisma.announcement.findFirst({ where: { id, orgId: session.user.orgId } });
  if (!existing) return { ok: false, error: "No se ha encontrado el anuncio." };
  if (!(await centerAllowed(session.user, existing.centerId))) {
    return { ok: false, error: "No se ha encontrado el anuncio." };
  }
  await prisma.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/anuncios");
  revalidatePath("/portal");
  return { ok: true };
}

export async function deleteAnnouncement(id: string): Promise<AnnouncementActionResult> {
  const session = await requireManager();
  if (!session) return { ok: false, error: "No tienes permiso para gestionar anuncios." };
  const existing = await prisma.announcement.findFirst({ where: { id, orgId: session.user.orgId } });
  if (!existing) return { ok: false, error: "No se ha encontrado el anuncio." };
  if (!(await centerAllowed(session.user, existing.centerId))) {
    return { ok: false, error: "No se ha encontrado el anuncio." };
  }
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/anuncios");
  revalidatePath("/portal");
  return { ok: true };
}
