import "dotenv/config";
import { PrismaClient, PlanType, MemberState, BookingStatus, PaymentMethod, PaymentStatus, HealthRecordType, HealthSeverity, HealthStatus, AptitudeLight, DebriefFeeling, RetentionRiskLevel, SubscriptionStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

faker.seed(20260717);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const id = () => randomUUID();
const DAY = 24 * 60 * 60 * 1000;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function weightedPick<T>(pairs: [T, number][]): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    if (r < w) return v;
    r -= w;
  }
  return pairs[0][0];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * DAY);
}
function fmtTime(h: number, m = 0) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function main() {
  console.log("Limpiando base de datos...");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.retentionAlert.deleteMany(),
    prisma.sessionDebrief.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.classSession.deleteMany(),
    prisma.sessionTemplate.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.healthRecord.deleteMany(),
    prisma.aptitudeRule.deleteMany(),
    prisma.member.deleteMany(),
    prisma.membershipPlan.deleteMany(),
    prisma.user.deleteMany(),
    prisma.center.deleteMany(),
    prisma.organization.deleteMany(),
  ]);

  // ---------- Organización y centros ----------
  const orgId = id();
  await prisma.organization.create({
    data: { id: orgId, name: "TRAINING ZONE", slug: "training-zone" },
  });

  const centersData = [
    { id: id(), name: "TRAINING ZONE Centro", slug: "centro", address: "Calle Mayor 12, Madrid" },
    { id: id(), name: "TRAINING ZONE Norte", slug: "norte", address: "Av. de la Ilustración 45, Madrid" },
    { id: id(), name: "TRAINING ZONE Sur", slug: "sur", address: "Calle Toledo 88, Madrid" },
  ];
  await prisma.center.createMany({
    data: centersData.map((c) => ({ ...c, orgId })),
  });
  const [centro, norte, sur] = centersData;

  // ---------- Usuarios ----------
  const passwordHash = await bcrypt.hash("demo1234", 10);

  type SeedUser = {
    id: string;
    name: string;
    email: string;
    role: "PLATFORM_ADMIN" | "OWNER" | "CENTER_DIRECTOR" | "TRAINER" | "RECEPTION" | "MEMBER";
    centerId: string | null;
  };

  const staffUsers: SeedUser[] = [
    { id: id(), name: "Sergio Martín", email: "sergio@trainingzone.es", role: "OWNER", centerId: null },
    { id: id(), name: "Beatriz Ruiz", email: "direccion.centro@trainingzone.es", role: "CENTER_DIRECTOR", centerId: centro.id },
    { id: id(), name: "Dani Herrero", email: "entrenador@trainingzone.es", role: "TRAINER", centerId: centro.id },
    { id: id(), name: "Ana Cabrera", email: "recepcion@trainingzone.es", role: "RECEPTION", centerId: centro.id },
    // Personal adicional para poblar agenda y variedad de datos
    { id: id(), name: "Laura Gimeno", email: "laura.gimeno@trainingzone.es", role: "TRAINER", centerId: centro.id },
    { id: id(), name: "Marcos Iglesias", email: "marcos.iglesias@trainingzone.es", role: "TRAINER", centerId: centro.id },
    { id: id(), name: "Elena Vidal", email: "elena.vidal@trainingzone.es", role: "TRAINER", centerId: norte.id },
    { id: id(), name: "Javier Soto", email: "javier.soto@trainingzone.es", role: "TRAINER", centerId: norte.id },
    { id: id(), name: "Carla Nuñez", email: "carla.nunez@trainingzone.es", role: "TRAINER", centerId: sur.id },
    { id: id(), name: "Patricia Domínguez", email: "direccion.norte@trainingzone.es", role: "CENTER_DIRECTOR", centerId: norte.id },
    { id: id(), name: "Rubén Castillo", email: "direccion.sur@trainingzone.es", role: "CENTER_DIRECTOR", centerId: sur.id },
    { id: id(), name: "Nuria Paredes", email: "recepcion.norte@trainingzone.es", role: "RECEPTION", centerId: norte.id },
    { id: id(), name: "Óscar Bravo", email: "recepcion.sur@trainingzone.es", role: "RECEPTION", centerId: sur.id },
    { id: id(), name: "Piensaenweb Admin", email: "admin@piensaenweb.dev", role: "PLATFORM_ADMIN", centerId: null },
  ];

  await prisma.user.createMany({
    data: staffUsers.map((u) => ({
      id: u.id,
      orgId,
      centerId: u.centerId,
      name: u.name,
      email: u.email,
      passwordHash,
      role: u.role,
      authProvider: "demo",
    })),
  });

  const trainersByCenter: Record<string, SeedUser[]> = {
    [centro.id]: staffUsers.filter((u) => u.role === "TRAINER" && u.centerId === centro.id),
    [norte.id]: staffUsers.filter((u) => u.role === "TRAINER" && u.centerId === norte.id),
    [sur.id]: staffUsers.filter((u) => u.role === "TRAINER" && u.centerId === sur.id),
  };

  // ---------- Catálogo comercial ----------
  const plans = [
    { id: id(), name: "Cuota mensual ilimitada", type: PlanType.MONTHLY, sessionsIncluded: null, priceCents: 4900, validityDays: 30 },
    { id: id(), name: "Bono 10 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 10, priceCents: 8000, validityDays: 60 },
    { id: id(), name: "Bono 20 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 20, priceCents: 15000, validityDays: 90 },
    { id: id(), name: "Sesión suelta", type: PlanType.DROP_IN, sessionsIncluded: 1, priceCents: 1200, validityDays: 7 },
    { id: id(), name: "Personal Training 1:1 (4 sesiones)", type: PlanType.PERSONAL_TRAINING, sessionsIncluded: 4, priceCents: 20000, validityDays: 30 },
    { id: id(), name: "Dúo (2 personas)", type: PlanType.DUO, sessionsIncluded: 8, priceCents: 12000, validityDays: 30 },
  ];
  await prisma.membershipPlan.createMany({ data: plans.map((p) => ({ ...p, orgId })) });
  const monthlyPlan = plans[0];
  const pack10 = plans[1];
  const pack20 = plans[2];
  const dropIn = plans[3];
  const personalTraining = plans[4];

  // ---------- Plantillas semanales (agenda) ----------
  const classTypes = ["CrossTraining", "Funcional", "Fuerza", "HIIT", "Movilidad", "Personal Training"];
  type Tpl = {
    id: string;
    centerId: string;
    name: string;
    classType: string;
    weekday: number;
    startTime: string;
    durationMin: number;
    capacity: number;
    room: string;
    trainerId: string | null;
    popularity: number; // 0..1, ocupación media objetivo
  };

  const templates: Tpl[] = [];
  const slotHours = [7, 9, 10, 17, 18, 19, 20];
  const centersList = [
    { center: centro, count: 9, capacityRange: [10, 16] as [number, number] },
    { center: norte, count: 7, capacityRange: [8, 14] as [number, number] },
    { center: sur, count: 6, capacityRange: [8, 12] as [number, number] },
  ];

  for (const { center, count, capacityRange } of centersList) {
    const trainers = trainersByCenter[center.id];
    for (let i = 0; i < count; i++) {
      const weekday = randInt(1, 6); // lunes-sábado
      const hour = pick(slotHours);
      const classType = pick(classTypes);
      templates.push({
        id: id(),
        centerId: center.id,
        name: `${classType} ${fmtTime(hour)}`,
        classType,
        weekday,
        startTime: fmtTime(hour),
        durationMin: classType === "Personal Training" ? 60 : 50,
        capacity: classType === "Personal Training" ? 1 : randInt(...capacityRange),
        room: pick(["Sala 1", "Sala 2", "Sala Funcional", "Box"]),
        trainerId: trainers.length ? pick(trainers).id : null,
        popularity: 0.45 + Math.random() * 0.5,
      });
    }
  }

  await prisma.sessionTemplate.createMany({
    data: templates.map((t) => ({
      id: t.id,
      orgId,
      centerId: t.centerId,
      name: t.name,
      classType: t.classType,
      weekday: t.weekday,
      startTime: t.startTime,
      durationMin: t.durationMin,
      capacity: t.capacity,
      room: t.room,
      trainerId: t.trainerId,
    })),
  });

  // ---------- Socios ----------
  type SeedMember = {
    id: string;
    centerId: string;
    firstName: string;
    lastName: string;
    email: string;
    state: MemberState;
    joinedAt: Date;
    cancelledAt: Date | null;
    userId: string | null;
    preferredTemplates: Tpl[];
    atRisk: boolean;
  };

  const members: SeedMember[] = [];
  const centerMemberCounts: [typeof centro, number][] = [
    [centro, 95],
    [norte, 55],
    [sur, 42],
  ];

  // Socio demo con historial rico y estable (para el portal del socio)
  const demoMemberId = id();
  const demoMemberUserId = id();

  for (const [center, count] of centerMemberCounts) {
    const centerTemplates = templates.filter((t) => t.centerId === center.id && t.classType !== "Personal Training");
    for (let i = 0; i < count; i++) {
      const isDemoAnchor = center.id === centro.id && i === 0;
      const state = isDemoAnchor
        ? MemberState.ACTIVE
        : weightedPick<MemberState>([
            [MemberState.ACTIVE, 68],
            [MemberState.DELINQUENT, 10],
            [MemberState.FROZEN, 5],
            [MemberState.CANCELLED, 12],
            [MemberState.TRIAL, 5],
          ]);

      const joinedDaysAgo = state === MemberState.TRIAL ? randInt(1, 13) : randInt(20, 720);
      const joinedAt = addDays(TODAY, -joinedDaysAgo);
      const cancelledAt =
        state === MemberState.CANCELLED ? addDays(joinedAt, randInt(30, joinedDaysAgo)) : null;

      const firstName = isDemoAnchor ? "Marta" : faker.person.firstName();
      const lastName = isDemoAnchor ? "García López" : `${faker.person.lastName()} ${faker.person.lastName()}`;

      const nPref = randInt(1, 3);
      const preferredTemplates: Tpl[] = [];
      const pool = [...centerTemplates];
      for (let k = 0; k < nPref && pool.length; k++) {
        const idx = randInt(0, pool.length - 1);
        preferredTemplates.push(pool.splice(idx, 1)[0]);
      }

      const atRisk =
        state === MemberState.ACTIVE && !isDemoAnchor && Math.random() < 0.14;

      const memberId = isDemoAnchor ? demoMemberId : id();

      members.push({
        id: memberId,
        centerId: center.id,
        firstName,
        lastName,
        email: isDemoAnchor
          ? "socio@trainingzone.es"
          : faker.internet.email({ firstName, lastName: lastName.split(" ")[0] }).toLowerCase(),
        state,
        joinedAt,
        cancelledAt,
        userId: isDemoAnchor ? demoMemberUserId : null,
        preferredTemplates,
        atRisk,
      });
    }
  }

  // Usuario de login para el socio demo
  await prisma.user.create({
    data: {
      id: demoMemberUserId,
      orgId,
      centerId: centro.id,
      name: "Marta García López",
      email: "socio@trainingzone.es",
      passwordHash,
      role: "MEMBER",
      authProvider: "demo",
    },
  });

  await prisma.member.createMany({
    data: members.map((m) => ({
      id: m.id,
      orgId,
      primaryCenterId: m.centerId,
      userId: m.userId,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: faker.phone.number({ style: "national" }),
      birthDate: faker.date.birthdate({ min: 18, max: 65, mode: "age" }),
      state: m.state,
      joinedAt: m.joinedAt,
      cancelledAt: m.cancelledAt,
      consentContract: true,
      consentHealth: Math.random() < 0.4,
      consentMarketing: Math.random() < 0.6,
    })),
  });
  console.log(`Creados ${members.length} socios.`);

  // ---------- Suscripciones ----------
  const subscriptions: {
    id: string;
    memberId: string;
    planId: string;
    startDate: Date;
    endDate: Date | null;
    status: SubscriptionStatus;
    priceCents: number;
    sessionsRemaining: number | null;
  }[] = [];

  for (const m of members) {
    if (m.state === MemberState.PROSPECT) continue;
    const plan =
      m.state === MemberState.TRIAL
        ? dropIn
        : weightedPick<typeof plans[number]>([
            [monthlyPlan, 55],
            [pack10, 20],
            [pack20, 10],
            [personalTraining, 8],
            [dropIn, 7],
          ]);
    const status: SubscriptionStatus =
      m.state === MemberState.CANCELLED
        ? SubscriptionStatus.CANCELLED
        : m.state === MemberState.FROZEN
        ? SubscriptionStatus.FROZEN
        : SubscriptionStatus.ACTIVE;
    subscriptions.push({
      id: id(),
      memberId: m.id,
      planId: plan.id,
      startDate: m.joinedAt,
      endDate: m.cancelledAt,
      status,
      priceCents: plan.priceCents,
      sessionsRemaining: plan.sessionsIncluded ? randInt(0, plan.sessionsIncluded) : null,
    });
  }
  await prisma.subscription.createMany({ data: subscriptions });
  console.log(`Creadas ${subscriptions.length} suscripciones.`);

  // ---------- Sesiones (agenda) ----------
  const HISTORY_DAYS = 182; // ~6 meses
  const FUTURE_DAYS = 14;
  const startDate = addDays(TODAY, -HISTORY_DAYS);
  const endDate = addDays(TODAY, FUTURE_DAYS);

  type SessionRow = {
    id: string;
    centerId: string;
    templateId: string;
    name: string;
    classType: string;
    date: Date;
    startTime: string;
    endTime: string;
    capacity: number;
    room: string | null;
    trainerId: string | null;
    isPast: boolean;
  };
  const sessions: SessionRow[] = [];

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const weekday = d.getDay();
    const dayTemplates = templates.filter((t) => t.weekday === weekday);
    for (const t of dayTemplates) {
      // Pequeñas cancelaciones puntuales de sesión (festivos/sustituciones)
      const cancelled = Math.random() < 0.02;
      const [h, m] = t.startTime.split(":").map(Number);
      const endH = Math.floor((h * 60 + m + t.durationMin) / 60);
      const endM = (h * 60 + m + t.durationMin) % 60;
      sessions.push({
        id: id(),
        centerId: t.centerId,
        templateId: t.id,
        name: t.name,
        classType: t.classType,
        date: new Date(d),
        startTime: t.startTime,
        endTime: fmtTime(endH, endM),
        capacity: t.capacity,
        room: t.room,
        trainerId: t.trainerId,
        isPast: d < TODAY,
      });
      if (cancelled) sessions[sessions.length - 1].name += " (cancelada)";
    }
  }

  // Insertar en lotes para no saturar el pool de conexiones
  const CHUNK = 500;
  for (let i = 0; i < sessions.length; i += CHUNK) {
    const chunk = sessions.slice(i, i + CHUNK);
    await prisma.classSession.createMany({
      data: chunk.map((s) => ({
        id: s.id,
        orgId,
        centerId: s.centerId,
        templateId: s.templateId,
        name: s.name,
        classType: s.classType,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        room: s.room,
        trainerId: s.trainerId,
        status: s.name.includes("(cancelada)") ? "CANCELLED" : "SCHEDULED",
      })),
    });
  }
  console.log(`Creadas ${sessions.length} sesiones.`);

  // ---------- Reservas, check-in, no-shows ----------
  const sessionsByTemplate = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    if (!sessionsByTemplate.has(s.templateId)) sessionsByTemplate.set(s.templateId, []);
    sessionsByTemplate.get(s.templateId)!.push(s);
  }

  type BookingRow = {
    id: string;
    sessionId: string;
    memberId: string;
    status: BookingStatus;
    waitlistPosition: number | null;
    bookedAt: Date;
    checkedInAt: Date | null;
  };
  const bookings: BookingRow[] = [];
  const attendanceByMember = new Map<string, Date[]>(); // fechas ATENDIDAS por socio

  for (const m of members) {
    if (m.state === MemberState.PROSPECT) continue;
    attendanceByMember.set(m.id, []);
    for (const tpl of m.preferredTemplates) {
      const tplSessions = sessionsByTemplate.get(tpl.id) ?? [];
      for (const s of tplSessions) {
        if (s.name.includes("cancelada")) continue;
        if (s.date < m.joinedAt) continue;
        if (m.cancelledAt && s.date > m.cancelledAt) continue;
        if (m.state === MemberState.FROZEN && s.date > addDays(TODAY, -randInt(0, 20))) continue;

        // Bajón de frecuencia reciente para socios "en riesgo" (motor de retención)
        let attendChance = tpl.popularity;
        if (m.atRisk && s.date > addDays(TODAY, -14)) {
          attendChance *= 0.1;
        } else if (m.atRisk) {
          attendChance *= 1.05;
        }
        if (m.state === MemberState.TRIAL) attendChance *= 1.3;

        if (Math.random() > attendChance) continue;

        const count = bookings.filter((b) => b.sessionId === s.id && b.status !== "CANCELLED").length;
        const overCapacity = count >= s.capacity;

        let status: BookingStatus;
        let checkedInAt: Date | null = null;
        if (!s.isPast) {
          status = overCapacity ? "WAITLISTED" : "BOOKED";
        } else if (overCapacity) {
          status = "WAITLISTED";
        } else {
          const r = Math.random();
          status = r < 0.85 ? "ATTENDED" : r < 0.94 ? "NO_SHOW" : "CANCELLED";
          if (status === "ATTENDED") {
            const [h, mi] = s.startTime.split(":").map(Number);
            checkedInAt = new Date(s.date);
            checkedInAt.setHours(h, mi + randInt(-5, 8));
          }
        }

        bookings.push({
          id: id(),
          sessionId: s.id,
          memberId: m.id,
          status,
          waitlistPosition: status === "WAITLISTED" ? count - s.capacity + 1 : null,
          bookedAt: addDays(s.date, -randInt(0, 5)),
          checkedInAt,
        });

        if (status === "ATTENDED") attendanceByMember.get(m.id)!.push(s.date);
      }
    }
  }

  for (let i = 0; i < bookings.length; i += CHUNK) {
    const chunk = bookings.slice(i, i + CHUNK);
    await prisma.booking.createMany({ data: chunk });
  }
  console.log(`Creadas ${bookings.length} reservas.`);

  // ---------- Session Debrief (G.1) ----------
  const debriefs: {
    id: string;
    bookingId: string;
    feeling: DebriefFeeling;
    rpe: number | null;
    note: string | null;
  }[] = [];
  const notes = [
    "Buena sesión, progresando en técnica",
    "Un poco cansada hoy",
    "Molestia leve en la rodilla, vigilar",
    "Muy buen ritmo, aumentar carga la próxima",
    null,
    null,
  ];
  for (const b of bookings) {
    if (b.status !== "ATTENDED") continue;
    if (Math.random() > 0.7) continue;
    const feeling = weightedPick<DebriefFeeling>([
      [DebriefFeeling.GREEN, 70],
      [DebriefFeeling.AMBER, 22],
      [DebriefFeeling.RED, 8],
    ]);
    debriefs.push({
      id: id(),
      bookingId: b.id,
      feeling,
      rpe: Math.random() < 0.5 ? randInt(4, 9) : null,
      note: Math.random() < 0.25 ? pick(notes) : null,
    });
  }
  for (let i = 0; i < debriefs.length; i += CHUNK) {
    await prisma.sessionDebrief.createMany({ data: debriefs.slice(i, i + CHUNK) });
  }
  console.log(`Creados ${debriefs.length} debriefs.`);

  // ---------- Pagos (F3) ----------
  const payments: {
    id: string;
    memberId: string;
    subscriptionId: string;
    amountCents: number;
    method: PaymentMethod;
    status: PaymentStatus;
    date: Date;
    receiptNumber: string;
    notes: string | null;
  }[] = [];
  let receiptCounter = 1000;

  const methodWeights: [PaymentMethod, number][] = [
    [PaymentMethod.CARD, 30],
    [PaymentMethod.BIZUM, 25],
    [PaymentMethod.CASH, 20],
    [PaymentMethod.SEPA, 15],
    [PaymentMethod.TRANSFER, 10],
  ];

  for (const sub of subscriptions) {
    const member = members.find((m) => m.id === sub.memberId)!;
    const monthsElapsed = Math.min(
      12,
      Math.max(1, Math.round((TODAY.getTime() - sub.startDate.getTime()) / (30 * DAY)))
    );
    for (let k = 0; k < monthsElapsed; k++) {
      const date = addDays(sub.startDate, k * 30 + randInt(0, 3));
      if (date > TODAY) break;
      const isLastPeriod = k === monthsElapsed - 1;
      const status =
        member.state === MemberState.DELINQUENT && isLastPeriod
          ? weightedPick<PaymentStatus>([
              [PaymentStatus.FAILED, 60],
              [PaymentStatus.PENDING, 40],
            ])
          : PaymentStatus.PAID;
      payments.push({
        id: id(),
        memberId: sub.memberId,
        subscriptionId: sub.id,
        amountCents: sub.priceCents,
        method: weightedPick(methodWeights),
        status,
        date,
        receiptNumber: `TZ-${receiptCounter++}`,
        notes: null,
      });
    }
  }
  for (let i = 0; i < payments.length; i += CHUNK) {
    await prisma.payment.createMany({
      data: payments.slice(i, i + CHUNK).map((p) => ({ ...p, orgId })),
    });
  }
  console.log(`Creados ${payments.length} pagos.`);

  // ---------- Salud (A.2.4) ----------
  const injuryZones = ["hombro derecho", "hombro izquierdo", "rodilla derecha", "rodilla izquierda", "zona lumbar", "tobillo derecho", "cervicales", "muñeca derecha"];
  const conditions = [
    { type: HealthRecordType.CHRONIC_CONDITION, desc: "Hipertensión controlada con medicación", severity: HealthSeverity.LOW },
    { type: HealthRecordType.CHRONIC_CONDITION, desc: "Asma leve inducida por esfuerzo", severity: HealthSeverity.LOW },
    { type: HealthRecordType.MEDICATION, desc: "Anticoagulantes — evitar impacto alto", severity: HealthSeverity.MEDIUM },
    { type: HealthRecordType.ALLERGY, desc: "Alergia a la penicilina", severity: HealthSeverity.LOW },
    { type: HealthRecordType.PREGNANCY, desc: "Embarazo, segundo trimestre", severity: HealthSeverity.MEDIUM },
    { type: HealthRecordType.SURGERY, desc: "Cirugía de menisco hace 6 meses, en recuperación", severity: HealthSeverity.MEDIUM },
  ];

  const healthRecords: {
    id: string;
    memberId: string;
    type: HealthRecordType;
    zone: string | null;
    description: string;
    severity: HealthSeverity;
    status: HealthStatus;
    reportedByUserId: string;
    reportedAt: Date;
    consentSignedAt: Date;
  }[] = [];

  const trainerAndOwnerIds = staffUsers.filter((u) => u.role === "TRAINER" || u.role === "OWNER").map((u) => u.id);
  const activeMembers = members.filter((m) => m.state !== MemberState.PROSPECT);

  for (const m of activeMembers) {
    if (Math.random() > 0.28) continue;
    const isInjury = Math.random() < 0.6;
    const reportedAt = addDays(m.joinedAt, randInt(5, Math.max(6, Math.floor((TODAY.getTime() - m.joinedAt.getTime()) / DAY))));
    if (isInjury) {
      const zone = pick(injuryZones);
      healthRecords.push({
        id: id(),
        memberId: m.id,
        type: HealthRecordType.INJURY,
        zone,
        description: `Lesión: ${zone}, ${pick(["tendinopatía", "sobrecarga muscular", "esguince leve", "molestia crónica"])}`,
        severity: weightedPick([[HealthSeverity.LOW, 40], [HealthSeverity.MEDIUM, 45], [HealthSeverity.HIGH, 15]]),
        status: Math.random() < 0.6 ? HealthStatus.ACTIVE : HealthStatus.RESOLVED,
        reportedByUserId: pick(trainerAndOwnerIds),
        reportedAt,
        consentSignedAt: reportedAt,
      });
    } else {
      const c = pick(conditions);
      healthRecords.push({
        id: id(),
        memberId: m.id,
        type: c.type,
        zone: null,
        description: c.desc,
        severity: c.severity,
        status: HealthStatus.ACTIVE,
        reportedByUserId: pick(trainerAndOwnerIds),
        reportedAt,
        consentSignedAt: reportedAt,
      });
    }
  }
  await prisma.healthRecord.createMany({ data: healthRecords });
  console.log(`Creados ${healthRecords.length} registros de salud.`);

  // ---------- Semáforo de Aptitud (G.2) ----------
  const sergioId = staffUsers.find((u) => u.email === "sergio@trainingzone.es")!.id;
  const aptitudeRules = [
    { injuryZone: "hombro derecho", blockArea: "Empuje vertical", light: AptitudeLight.RED, adaptation: "Evitar por completo — sustituir por landmine press" },
    { injuryZone: "hombro derecho", blockArea: "Empuje horizontal", light: AptitudeLight.AMBER, adaptation: "Reducir ROM, carga ≤60%" },
    { injuryZone: "hombro derecho", blockArea: "Tren inferior", light: AptitudeLight.GREEN, adaptation: null },
    { injuryZone: "hombro izquierdo", blockArea: "Empuje vertical", light: AptitudeLight.RED, adaptation: "Evitar por completo — sustituir por landmine press" },
    { injuryZone: "hombro izquierdo", blockArea: "Empuje horizontal", light: AptitudeLight.AMBER, adaptation: "Reducir ROM, carga ≤60%" },
    { injuryZone: "rodilla derecha", blockArea: "Sentadilla / tren inferior", light: AptitudeLight.RED, adaptation: "Sustituir por trabajo isométrico sin carga axial" },
    { injuryZone: "rodilla izquierda", blockArea: "Sentadilla / tren inferior", light: AptitudeLight.RED, adaptation: "Sustituir por trabajo isométrico sin carga axial" },
    { injuryZone: "rodilla derecha", blockArea: "Tren superior", light: AptitudeLight.GREEN, adaptation: null },
    { injuryZone: "zona lumbar", blockArea: "Flexión de columna cargada", light: AptitudeLight.RED, adaptation: "Evitar peso muerto y buenos días" },
    { injuryZone: "zona lumbar", blockArea: "Core anti-extensión", light: AptitudeLight.AMBER, adaptation: "Priorizar planchas y pallof press" },
    { injuryZone: "tobillo derecho", blockArea: "Saltos / pliometría", light: AptitudeLight.RED, adaptation: "Sustituir por trabajo en máquina sentado" },
    { injuryZone: "cervicales", blockArea: "Carga sobre cabeza", light: AptitudeLight.AMBER, adaptation: "Reducir rango, vigilar técnica" },
    { injuryZone: "muñeca derecha", blockArea: "Apoyo de muñeca (flexiones, front rack)", light: AptitudeLight.AMBER, adaptation: "Usar muñequeras o sustituir agarre" },
  ];
  await prisma.aptitudeRule.createMany({
    data: aptitudeRules.map((r) => ({
      id: id(),
      orgId,
      injuryZone: r.injuryZone,
      blockArea: r.blockArea,
      light: r.light,
      adaptation: r.adaptation,
      editedByUserId: sergioId,
    })),
  });
  console.log(`Creadas ${aptitudeRules.length} reglas de aptitud.`);

  // ---------- Motor de retención (G.3) ----------
  const retentionAlerts: {
    id: string;
    memberId: string;
    baselineFreq: number;
    recentFreq: number;
    dropPct: number;
    riskLevel: RetentionRiskLevel;
    context: string | null;
  }[] = [];

  for (const m of members) {
    if (m.state !== MemberState.ACTIVE) continue;
    const dates = attendanceByMember.get(m.id) ?? [];
    const baselineWindowStart = addDays(TODAY, -98); // 14 semanas antes de las últimas 2
    const baselineWindowEnd = addDays(TODAY, -14);
    const recentWindowStart = addDays(TODAY, -14);

    const baselineCount = dates.filter((d) => d >= baselineWindowStart && d < baselineWindowEnd).length;
    const recentCount = dates.filter((d) => d >= recentWindowStart).length;

    const baselineFreq = baselineCount / 12; // sesiones/semana en 12 semanas
    const recentFreq = recentCount / 2; // sesiones/semana en 2 semanas

    if (baselineFreq < 0.4) continue; // sin historial suficiente para tener línea base
    const dropPct = (recentFreq - baselineFreq) / baselineFreq;

    if (dropPct <= -0.6) {
      const lastDate = dates.length ? dates[dates.length - 1] : null;
      const daysSinceLast = lastDate ? Math.round((TODAY.getTime() - lastDate.getTime()) / DAY) : null;
      const hr = healthRecords.find((h) => h.memberId === m.id && h.status === "ACTIVE");
      retentionAlerts.push({
        id: id(),
        memberId: m.id,
        baselineFreq: Number(baselineFreq.toFixed(2)),
        recentFreq: Number(recentFreq.toFixed(2)),
        dropPct: Number((dropPct * 100).toFixed(0)),
        riskLevel: dropPct <= -0.85 ? RetentionRiskLevel.HIGH : RetentionRiskLevel.MEDIUM,
        context:
          hr
            ? `Reportó ${hr.description.toLowerCase()} el ${hr.reportedAt.toLocaleDateString("es-ES")}.`
            : daysSinceLast !== null
            ? `Última clase hace ${daysSinceLast} días.`
            : null,
      });
    }
  }
  await prisma.retentionAlert.createMany({ data: retentionAlerts });
  console.log(`Creadas ${retentionAlerts.length} alertas de retención.`);

  // ---------- Auditoría (ADR-008) ----------
  const auditRows: {
    id: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    memberId: string | null;
    createdAt: Date;
  }[] = [];
  const someHealthMembers = healthRecords.slice(0, 25);
  for (const hr of someHealthMembers) {
    auditRows.push({
      id: id(),
      actorUserId: pick(trainerAndOwnerIds),
      action: "HEALTH_RECORD_READ",
      entityType: "HealthRecord",
      entityId: hr.id,
      memberId: hr.memberId,
      createdAt: addDays(TODAY, -randInt(0, 60)),
    });
  }
  const receptionIds = staffUsers.filter((u) => u.role === "RECEPTION").map((u) => u.id);
  for (let i = 0; i < 20; i++) {
    const mem = pick(members);
    auditRows.push({
      id: id(),
      actorUserId: pick(receptionIds),
      action: "MEMBER_UPDATED",
      entityType: "Member",
      entityId: mem.id,
      memberId: mem.id,
      createdAt: addDays(TODAY, -randInt(0, 90)),
    });
  }
  await prisma.auditLog.createMany({
    data: auditRows.map((a) => ({ ...a, orgId })),
  });
  console.log(`Creadas ${auditRows.length} entradas de auditoría.`);

  console.log("\nSeed completado.");
  console.log("Usuarios demo (contraseña: demo1234):");
  console.log("  sergio@trainingzone.es              (Dirección / Owner)");
  console.log("  direccion.centro@trainingzone.es     (Dirección de centro)");
  console.log("  entrenador@trainingzone.es           (Entrenador)");
  console.log("  recepcion@trainingzone.es            (Recepción)");
  console.log("  socio@trainingzone.es                (Socio — Marta García López)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
