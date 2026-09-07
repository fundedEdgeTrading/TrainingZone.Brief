import { prisma } from "@/lib/prisma";

/**
 * Ejercicio de derechos del socio sobre sus datos (E10-11 · CN-11).
 *
 * SON DOS DERECHOS DISTINTOS, y por eso hay dos alcances:
 *
 * · `PORTABILIDAD` (art. 20): los datos que él ha aportado o generado con su
 *   actividad, en formato estructurado. **Sin** la bitácora interna del staff
 *   (`MemberNote`) ni el registro de accesos: son información *sobre* el socio
 *   producida por el equipo, no datos aportados por él.
 * · `ACCESO` (art. 15): más amplio. SÍ alcanza a `MemberNote` y al `AuditLog` de
 *   accesos a sus propios datos. Excluir las notas del art. 20 estaba bien; usar
 *   ese mismo razonamiento para el art. 15 estaba mal.
 *
 * Cada ejercicio deja entrada en `AuditLog` con su fecha y su alcance: el
 * ejercicio de un derecho es exactamente lo que tiene que quedar registrado.
 */
export type ExportScope = "PORTABILIDAD" | "ACCESO";

/** Art. 12.3: la entrega se produce dentro del mes siguiente a la solicitud. */
export const RIGHTS_RESPONSE_DAYS = 30;

export function rightsDeadline(requestedAt: Date = new Date()): Date {
  const deadline = new Date(requestedAt);
  deadline.setDate(deadline.getDate() + RIGHTS_RESPONSE_DAYS);
  return deadline;
}

export async function getMemberDataExport(
  memberId: string,
  orgId: string,
  scope: ExportScope = "PORTABILIDAD"
) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      primaryCenter: { select: { name: true } },
      subscriptions: { include: { plan: { select: { name: true, type: true } } }, orderBy: { startDate: "desc" } },
      payments: { orderBy: { date: "desc" } },
      healthRecords: { orderBy: { reportedAt: "desc" } },
      clientFeedback: { orderBy: { submittedAt: "desc" } },
    },
  });
  if (!member) return null;

  const [
    bookings,
    progressEntries,
    selfAssessments,
    goals,
    trainerRatings,
    conversation,
    assessments,
    performanceMetrics,
    mesocycles,
    debriefs,
    notes,
    accessLog,
  ] = await Promise.all([
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
    // Donde vive el grueso del dato clínico declarado, y faltaba entero.
    prisma.assessment.findMany({ where: { memberId, orgId }, orderBy: { dueDate: "desc" } }),
    prisma.performanceMetric.findMany({ where: { memberId, orgId }, orderBy: { recordedAt: "desc" } }),
    prisma.mesocycle.findMany({
      where: { memberId, orgId },
      orderBy: { createdAt: "desc" },
      select: {
        title: true,
        objective: true,
        profile: true,
        status: true,
        startDate: true,
        approvedAt: true,
        createdAt: true,
        phases: {
          orderBy: { order: "asc" },
          select: { name: true, weekFrom: true, weekTo: true, deload: true, notes: true },
        },
      },
    }),
    prisma.sessionDebrief.findMany({
      where: { booking: { memberId } },
      orderBy: { createdAt: "desc" },
      select: {
        feeling: true,
        note: true,
        createdAt: true,
        booking: { select: { occurrenceDate: true, session: { select: { name: true } } } },
      },
    }),
    // Art. 15 únicamente: la bitácora interna y el registro de accesos no entran
    // en la portabilidad.
    scope === "ACCESO"
      ? prisma.memberNote.findMany({ where: { memberId, orgId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    scope === "ACCESO"
      ? prisma.auditLog.findMany({
          where: { orgId, memberId },
          orderBy: { createdAt: "desc" },
          select: { action: true, entityType: true, createdAt: true, actor: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  return {
    exportadoEl: new Date().toISOString(),
    alcance: scope,
    baseJuridica: scope === "ACCESO" ? "Art. 15 RGPD — derecho de acceso" : "Art. 20 RGPD — derecho de portabilidad",
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
      // E10-11: el quinto. El bloque listaba cuatro de los cinco y el
      // tratamiento por IA —justo el que más gente pregunta— se quedaba fuera.
      tratamientoPorIA: { aceptado: member.consentAI, fecha: member.consentAIAt },
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
      fechaLesion: h.injuryDate,
      fechaLesionAproximada: h.injuryDateApprox,
      reportadoEl: h.reportedAt,
      ultimoCambioDeEstado: h.statusChangedAt,
    })),
    progresoFisico: progressEntries.map((p) => ({
      fecha: p.date,
      pesoKg: p.weightKg,
      grasaCorporalPct: p.bodyFatPct,
      cinturaCm: p.waistCm,
      masaMuscularKg: p.muscleMassKg,
      imc: p.bmi,
      // E3-10: no se PRESENTA como métrica de seguimiento, pero es un dato suyo
      // y en el ejercicio de sus derechos tiene que salir.
      edadMetabolica: p.metabolicAge,
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
    valoraciones: assessments.map((a) => ({
      tipo: a.kind,
      vence: a.dueDate,
      completadaEl: a.completedAt,
      respuestas: a.answers,
    })),
    marcas: performanceMetrics.map((m) => ({
      clave: m.key,
      valor: m.value,
      unidad: m.unit,
      fecha: m.recordedAt,
      origen: m.source,
    })),
    mesociclos: mesocycles.map((m) => ({
      titulo: m.title,
      objetivo: m.objective,
      perfil: m.profile,
      estado: m.status,
      inicio: m.startDate,
      aprobadoEl: m.approvedAt,
      creadoEl: m.createdAt,
      fases: m.phases.map((f) => ({
        nombre: f.name,
        semanaDesde: f.weekFrom,
        semanaHasta: f.weekTo,
        descarga: f.deload,
        notas: f.notes,
      })),
    })),
    debriefsDeSesion: debriefs.map((d) => ({
      sesion: d.booking.session.name,
      fecha: d.booking.occurrenceDate,
      valoracion: d.feeling,
      nota: d.note,
      registradoEl: d.createdAt,
    })),
    // Solo en el ejercicio del art. 15 (ver la cabecera de este fichero).
    ...(scope === "ACCESO"
      ? {
          notasInternas: notes.map((n) => ({ texto: n.body, fecha: n.createdAt })),
          accesosATusDatos: accessLog.map((a) => ({
            accion: a.action,
            sobre: a.entityType,
            quien: a.actor?.name ?? "(usuario dado de baja)",
            fecha: a.createdAt,
          })),
        }
      : {}),
  };
}
