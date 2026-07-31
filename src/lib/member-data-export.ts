import { prisma } from "@/lib/prisma";

/**
 * RGPD — derecho de portabilidad: una copia de los datos que el propio socio
 * ha aportado o generado con su actividad, en un formato legible. No incluye
 * la bitácora interna del staff sobre él (`MemberNote`): esa es información
 * *sobre* el socio producida por el equipo, no datos que él haya aportado, y
 * puede contener valoraciones internas no pensadas para mostrarse tal cual.
 */
export async function getMemberDataExport(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      primaryCenter: { select: { name: true } },
      subscriptions: { include: { plan: { select: { name: true, type: true } } }, orderBy: { startDate: "desc" } },
      payments: { orderBy: { date: "desc" } },
      healthRecords: { orderBy: { reportedAt: "desc" } },
      clientFeedback: { orderBy: { submittedAt: "desc" } },
    },
  });
  if (!member) return null;

  const [bookings, progressEntries, selfAssessments, goals, trainerRatings, conversation] = await Promise.all([
    prisma.booking.findMany({
      where: { memberId },
      include: { session: { select: { name: true, classType: true, startTime: true } } },
      orderBy: { occurrenceDate: "desc" },
    }),
    prisma.memberProgressEntry.findMany({ where: { memberId }, orderBy: { date: "desc" } }),
    prisma.selfAssessment.findMany({ where: { memberId }, orderBy: { createdAt: "desc" } }),
    prisma.clientGoal.findMany({ where: { memberId, isTemplate: false }, orderBy: { createdAt: "desc" } }),
    prisma.trainerRating.findMany({ where: { memberId }, orderBy: { createdAt: "desc" } }),
    prisma.conversation.findUnique({
      where: { memberId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  return {
    exportadoEl: new Date().toISOString(),
    perfil: {
      nombre: `${member.firstName} ${member.lastName}`,
      email: member.email,
      telefono: member.phone,
      fechaNacimiento: member.birthDate,
      direccion: member.address,
      direccion2: member.addressLine2,
      ciudad: member.city,
      provincia: member.province,
      pais: member.country,
      codigoPostal: member.postalCode,
      contactoEmergencia: member.emergencyContact,
      centro: member.primaryCenter.name,
      altaEl: member.joinedAt,
      estado: member.state,
    },
    consentimientos: {
      contrato: { aceptado: member.consentContract, fecha: member.consentContractAt },
      datosSalud: { aceptado: member.consentHealth, fecha: member.consentHealthAt },
      usoImagenes: { aceptado: member.consentImages, fecha: member.consentImagesAt },
      marketing: { aceptado: member.consentMarketing, fecha: member.consentMarketingAt },
    },
    suscripciones: member.subscriptions.map((s) => ({
      plan: s.plan.name,
      tipo: s.plan.type,
      estado: s.status,
      inicio: s.startDate,
      fin: s.endDate,
      precioCents: s.priceCents,
      sesionesRestantes: s.sessionsRemaining,
    })),
    pagos: member.payments.map((p) => ({
      fecha: p.date,
      importeCents: p.amountCents,
      metodo: p.method,
      estado: p.status,
      numeroRecibo: p.receiptNumber,
    })),
    reservas: bookings.map((b) => ({
      sesion: b.session.name,
      tipo: b.session.classType,
      fecha: b.occurrenceDate,
      hora: b.session.startTime,
      estado: b.status,
    })),
    datosSalud: member.healthRecords.map((h) => ({
      tipo: h.type,
      zona: h.zone,
      descripcion: h.description,
      severidad: h.severity,
      estado: h.status,
      reportadoEl: h.reportedAt,
    })),
    progresoFisico: progressEntries.map((p) => ({
      fecha: p.date,
      pesoKg: p.weightKg,
      grasaCorporalPct: p.bodyFatPct,
      cinturaCm: p.waistCm,
      masaMuscularKg: p.muscleMassKg,
      imc: p.bmi,
      origen: p.source,
    })),
    autovaloraciones: selfAssessments.map((a) => ({ tipo: a.kind, texto: a.text, datos: a.structured, fecha: a.createdAt })),
    objetivos: goals.map((g) => ({ objetivo: g.label, conseguidoEl: g.achievedAt, creadoEl: g.createdAt })),
    feedbackEnviado: member.clientFeedback.map((f) => ({
      satisfaccion: f.sat,
      progreso: f.prog,
      adherencia: f.adher,
      motivacion: f.motiv,
      esfuerzo: f.esf,
      descanso: f.descanso,
      nutricion: f.nutricion,
      bienestarFisico: f.bienestar,
      comunicacion: f.comunicacion,
      comentario: f.comment,
      periodo: f.periodKey,
      fecha: f.submittedAt,
    })),
    valoracionesAEntrenadores: trainerRatings.map((r) => ({ puntuacion: r.score, fortalezas: r.strengths, mejoras: r.improvements, fecha: r.createdAt })),
    mensajesChat: (conversation?.messages ?? []).map((m) => ({ de: m.senderKind, texto: m.body, fecha: m.createdAt })),
  };
}
