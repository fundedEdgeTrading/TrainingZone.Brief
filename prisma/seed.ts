import "dotenv/config";
import {
  PrismaClient,
  PlanType,
  MemberState,
  BookingStatus,
  PaymentMethod,
  HealthRecordType,
  HealthSeverity,
  HealthStatus,
  AptitudeLight,
  DebriefFeeling,
  RetentionRiskLevel,
  SubscriptionStatus,
  Role,
} from "@prisma/client";
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

// ---------- Configuración por organización ----------
type CenterCfg = {
  key: string;
  name: string;
  slug: string;
  address: string;
  logoUrl?: string | null;
  templateCount: number;
  capacityRange: [number, number];
  memberCount: number;
};
type StaffCfg = {
  name: string;
  email: string;
  role: Exclude<Role, "MEMBER">;
  centerKey: string | null;
};
type ExtraImputacion = {
  email: string;
  centerKey: string;
  role: Role;
  allocationPct: number;
  primaryAllocationPct?: number;
};
type DemoMemberCfg = { email: string; firstName: string; lastName: string; centerKey: string };
type OrgSeedConfig = {
  name: string;
  slug: string;
  logoUrl: string | null;
  centers: CenterCfg[];
  staff: StaffCfg[];
  extraImputaciones: ExtraImputacion[];
  demoMember: DemoMemberCfg | null;
  historyDays: number;
  futureDays: number;
};

// Datos de dominio compartidos (se crean por organización).
const CLASS_TYPES = ["CrossTraining", "Funcional", "Fuerza", "HIIT", "Movilidad", "Personal Training"];
const INJURY_ZONES = ["hombro derecho", "hombro izquierdo", "rodilla derecha", "rodilla izquierda", "zona lumbar", "tobillo derecho", "cervicales", "muñeca derecha"];
const CONDITIONS = [
  { type: HealthRecordType.CHRONIC_CONDITION, desc: "Hipertensión controlada con medicación", severity: HealthSeverity.LOW },
  { type: HealthRecordType.CHRONIC_CONDITION, desc: "Asma leve inducida por esfuerzo", severity: HealthSeverity.LOW },
  { type: HealthRecordType.MEDICATION, desc: "Anticoagulantes — evitar impacto alto", severity: HealthSeverity.MEDIUM },
  { type: HealthRecordType.ALLERGY, desc: "Alergia a la penicilina", severity: HealthSeverity.LOW },
  { type: HealthRecordType.PREGNANCY, desc: "Embarazo, segundo trimestre", severity: HealthSeverity.MEDIUM },
  { type: HealthRecordType.SURGERY, desc: "Cirugía de menisco hace 6 meses, en recuperación", severity: HealthSeverity.MEDIUM },
];
const NOTE_BODIES = [
  "Viaja bastante por trabajo, le encaja mejor un plan flexible.",
  "Muy motivada, objetivo puesto en una carrera en primavera.",
  "Prefiere entrenar a primera hora; evitar reprogramar a la tarde.",
  "Comentó dudas con el precio del bono — vigilar la renovación.",
  "Viene con una amiga, valorar oferta dúo.",
  "Le cuesta la constancia los lunes; un recordatorio el domingo ayuda.",
  "Interesado en pasar a personal training 1:1.",
  "Prefiere clases pequeñas; avisar si sube el aforo.",
  "Vuelve tras una temporada parado, ir progresivo las primeras semanas.",
  "Contento con el seguimiento, mantener al entrenador actual.",
];
const APTITUDE_RULES = [
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

async function seedOrganization(cfg: OrgSeedConfig, passwordHash: string) {
  const orgId = id();
  await prisma.organization.create({
    data: { id: orgId, name: cfg.name, slug: cfg.slug, logoUrl: cfg.logoUrl },
  });

  // ---------- Centros ----------
  const centersData = cfg.centers.map((c) => ({ ...c, id: id() }));
  await prisma.center.createMany({
    data: centersData.map((c) => ({
      id: c.id,
      orgId,
      name: c.name,
      slug: c.slug,
      address: c.address,
      logoUrl: c.logoUrl ?? null,
    })),
  });
  const centerIdByKey = new Map(centersData.map((c) => [c.key, c.id]));

  // ---------- Usuarios (staff) ----------
  type StaffUser = StaffCfg & { id: string; centerId: string | null };
  const staffUsers: StaffUser[] = cfg.staff.map((s) => ({
    ...s,
    id: id(),
    centerId: s.centerKey ? centerIdByKey.get(s.centerKey)! : null,
  }));
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

  // ---------- Imputación de personal a centros (CenterMembership) ----------
  type Membership = { id: string; orgId: string; userId: string; centerId: string; role: Role; isPrimary: boolean; allocationPct: number };
  const memberships: Membership[] = [];
  for (const u of staffUsers) {
    if (u.centerId) {
      memberships.push({ id: id(), orgId, userId: u.id, centerId: u.centerId, role: u.role, isPrimary: true, allocationPct: 100 });
    }
  }
  for (const extra of cfg.extraImputaciones) {
    const user = staffUsers.find((u) => u.email === extra.email);
    const centerId = centerIdByKey.get(extra.centerKey);
    if (!user || !centerId) continue;
    if (extra.primaryAllocationPct != null) {
      const primary = memberships.find((m) => m.userId === user.id && m.isPrimary);
      if (primary) primary.allocationPct = extra.primaryAllocationPct;
    }
    memberships.push({ id: id(), orgId, userId: user.id, centerId, role: extra.role, isPrimary: false, allocationPct: extra.allocationPct });
  }
  await prisma.centerMembership.createMany({ data: memberships });

  const trainersByCenter: Record<string, StaffUser[]> = {};
  for (const c of centersData) {
    trainersByCenter[c.id] = staffUsers.filter((u) => u.role === "TRAINER" && u.centerId === c.id);
  }
  const ownerId = staffUsers.find((u) => u.role === "OWNER")?.id ?? staffUsers[0].id;

  // ---------- Catálogo comercial ----------
  const plans = [
    { id: id(), name: "Cuota mensual ilimitada", type: PlanType.MONTHLY, sessionsIncluded: null as number | null, priceCents: 4900, validityDays: 30 },
    { id: id(), name: "Bono 10 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 10 as number | null, priceCents: 8000, validityDays: 60 },
    { id: id(), name: "Bono 20 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 20 as number | null, priceCents: 15000, validityDays: 90 },
    { id: id(), name: "Sesión suelta", type: PlanType.DROP_IN, sessionsIncluded: 1 as number | null, priceCents: 1200, validityDays: 7 },
    { id: id(), name: "Personal Training 1:1 (4 sesiones)", type: PlanType.PERSONAL_TRAINING, sessionsIncluded: 4 as number | null, priceCents: 20000, validityDays: 30 },
    { id: id(), name: "Dúo (2 personas)", type: PlanType.DUO, sessionsIncluded: 8 as number | null, priceCents: 12000, validityDays: 30 },
  ];
  await prisma.membershipPlan.createMany({ data: plans.map((p) => ({ ...p, orgId })) });
  const [monthlyPlan, pack10, pack20, dropIn, personalTraining] = plans;

  // ---------- Plantillas semanales (agenda) ----------
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
    popularity: number;
  };
  const templates: Tpl[] = [];
  const slotHours = [7, 9, 10, 17, 18, 19, 20];
  for (const c of centersData) {
    const trainers = trainersByCenter[c.id];
    for (let i = 0; i < c.templateCount; i++) {
      const weekday = randInt(1, 6);
      const hour = pick(slotHours);
      const classType = pick(CLASS_TYPES);
      templates.push({
        id: id(),
        centerId: c.id,
        name: `${classType} ${fmtTime(hour)}`,
        classType,
        weekday,
        startTime: fmtTime(hour),
        durationMin: classType === "Personal Training" ? 60 : 50,
        capacity: classType === "Personal Training" ? 1 : randInt(...c.capacityRange),
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

  const demoMemberId = cfg.demoMember ? id() : null;
  const demoMemberUserId = cfg.demoMember ? id() : null;

  for (const c of centersData) {
    const centerTemplates = templates.filter((t) => t.centerId === c.id && t.classType !== "Personal Training");
    for (let i = 0; i < c.memberCount; i++) {
      const isDemoAnchor = !!cfg.demoMember && c.key === cfg.demoMember.centerKey && i === 0;
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
      const cancelledAt = state === MemberState.CANCELLED ? addDays(joinedAt, randInt(30, joinedDaysAgo)) : null;

      const firstName = isDemoAnchor ? cfg.demoMember!.firstName : faker.person.firstName();
      const lastName = isDemoAnchor ? cfg.demoMember!.lastName : `${faker.person.lastName()} ${faker.person.lastName()}`;

      const nPref = randInt(1, 3);
      const preferredTemplates: Tpl[] = [];
      const pool = [...centerTemplates];
      for (let k = 0; k < nPref && pool.length; k++) {
        preferredTemplates.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
      }

      const atRisk = state === MemberState.ACTIVE && !isDemoAnchor && Math.random() < 0.14;

      members.push({
        id: isDemoAnchor ? demoMemberId! : id(),
        centerId: c.id,
        firstName,
        lastName,
        email: isDemoAnchor
          ? cfg.demoMember!.email
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
  if (cfg.demoMember) {
    await prisma.user.create({
      data: {
        id: demoMemberUserId!,
        orgId,
        centerId: centerIdByKey.get(cfg.demoMember.centerKey)!,
        name: `${cfg.demoMember.firstName} ${cfg.demoMember.lastName}`,
        email: cfg.demoMember.email,
        passwordHash,
        role: "MEMBER",
        authProvider: "demo",
      },
    });
  }

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
      consentHealth: Math.random() < 0.45,
      consentMarketing: Math.random() < 0.6,
    })),
  });

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

  // ---------- Sesiones (agenda) ----------
  const startDate = addDays(TODAY, -cfg.historyDays);
  const endDate = addDays(TODAY, cfg.futureDays);
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
    for (const t of templates.filter((t) => t.weekday === weekday)) {
      const cancelled = Math.random() < 0.02;
      const [h, m] = t.startTime.split(":").map(Number);
      const endH = Math.floor((h * 60 + m + t.durationMin) / 60);
      const endM = (h * 60 + m + t.durationMin) % 60;
      sessions.push({
        id: id(),
        centerId: t.centerId,
        templateId: t.id,
        name: cancelled ? `${t.name} (cancelada)` : t.name,
        classType: t.classType,
        date: new Date(d),
        startTime: t.startTime,
        endTime: fmtTime(endH, endM),
        capacity: t.capacity,
        room: t.room,
        trainerId: t.trainerId,
        isPast: d < TODAY,
      });
    }
  }
  const CHUNK = 500;
  for (let i = 0; i < sessions.length; i += CHUNK) {
    await prisma.classSession.createMany({
      data: sessions.slice(i, i + CHUNK).map((s) => ({
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
  const bookedCountBySession = new Map<string, number>();
  const attendanceByMember = new Map<string, Date[]>();

  for (const m of members) {
    if (m.state === MemberState.PROSPECT) continue;
    attendanceByMember.set(m.id, []);
    for (const tpl of m.preferredTemplates) {
      for (const s of sessionsByTemplate.get(tpl.id) ?? []) {
        if (s.name.includes("cancelada")) continue;
        if (s.date < m.joinedAt) continue;
        if (m.cancelledAt && s.date > m.cancelledAt) continue;
        if (m.state === MemberState.FROZEN && s.date > addDays(TODAY, -randInt(0, 20))) continue;

        let attendChance = tpl.popularity;
        if (m.atRisk && s.date > addDays(TODAY, -14)) attendChance *= 0.1;
        else if (m.atRisk) attendChance *= 1.05;
        if (m.state === MemberState.TRIAL) attendChance *= 1.3;
        if (Math.random() > attendChance) continue;

        const count = bookedCountBySession.get(s.id) ?? 0;
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
        if (status !== "CANCELLED") bookedCountBySession.set(s.id, count + 1);

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
    await prisma.booking.createMany({ data: bookings.slice(i, i + CHUNK) });
  }

  // ---------- Session Debrief (G.1) ----------
  const debriefNotes = ["Buena sesión, progresando en técnica", "Un poco cansada hoy", "Molestia leve en la rodilla, vigilar", "Muy buen ritmo, aumentar carga la próxima", null, null];
  const debriefs: { id: string; bookingId: string; feeling: DebriefFeeling; rpe: number | null; note: string | null }[] = [];
  for (const b of bookings) {
    if (b.status !== "ATTENDED") continue;
    if (Math.random() > 0.7) continue;
    debriefs.push({
      id: id(),
      bookingId: b.id,
      feeling: weightedPick<DebriefFeeling>([[DebriefFeeling.GREEN, 70], [DebriefFeeling.AMBER, 22], [DebriefFeeling.RED, 8]]),
      rpe: Math.random() < 0.5 ? randInt(4, 9) : null,
      note: Math.random() < 0.25 ? pick(debriefNotes) : null,
    });
  }
  for (let i = 0; i < debriefs.length; i += CHUNK) {
    await prisma.sessionDebrief.createMany({ data: debriefs.slice(i, i + CHUNK) });
  }

  // ---------- Pagos (F3) ----------
  const receiptPrefix = cfg.slug.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "TZ";
  const payments: {
    id: string;
    orgId: string;
    memberId: string;
    subscriptionId: string;
    amountCents: number;
    method: PaymentMethod;
    status: "PAID" | "PENDING" | "FAILED";
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
    const monthsElapsed = Math.min(12, Math.max(1, Math.round((TODAY.getTime() - sub.startDate.getTime()) / (30 * DAY))));
    for (let k = 0; k < monthsElapsed; k++) {
      const date = addDays(sub.startDate, k * 30 + randInt(0, 3));
      if (date > TODAY) break;
      const isLastPeriod = k === monthsElapsed - 1;
      const status = member.state === MemberState.DELINQUENT && isLastPeriod ? (Math.random() < 0.5 ? "FAILED" : "PENDING") : "PAID";
      payments.push({
        id: id(),
        orgId,
        memberId: sub.memberId,
        subscriptionId: sub.id,
        amountCents: sub.priceCents,
        method: weightedPick(methodWeights),
        status,
        date,
        receiptNumber: `${receiptPrefix}-${receiptCounter++}`,
        notes: null,
      });
    }
  }
  for (let i = 0; i < payments.length; i += CHUNK) {
    await prisma.payment.createMany({ data: payments.slice(i, i + CHUNK) });
  }

  // ---------- Salud (A.2.4) ----------
  const trainerAndOwnerIds = staffUsers.filter((u) => u.role === "TRAINER" || u.role === "OWNER").map((u) => u.id);
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
  for (const m of members.filter((m) => m.state !== MemberState.PROSPECT)) {
    if (Math.random() > 0.28) continue;
    const reportedAt = addDays(m.joinedAt, randInt(5, Math.max(6, Math.floor((TODAY.getTime() - m.joinedAt.getTime()) / DAY))));
    if (Math.random() < 0.6) {
      const zone = pick(INJURY_ZONES);
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
      const c = pick(CONDITIONS);
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

  // ---------- Bitácora de observaciones (MemberNote) ----------
  const noteAuthorIds = staffUsers.filter((u) => u.role !== "PLATFORM_ADMIN").map((u) => u.id);
  const noteRows: { id: string; orgId: string; memberId: string; authorUserId: string; body: string; createdAt: Date }[] = [];
  for (const m of members) {
    if (m.state === MemberState.PROSPECT) continue;
    if (Math.random() > 0.3) continue;
    for (let k = 0; k < randInt(1, 2); k++) {
      noteRows.push({ id: id(), orgId, memberId: m.id, authorUserId: pick(noteAuthorIds), body: pick(NOTE_BODIES), createdAt: addDays(TODAY, -randInt(1, 120)) });
    }
  }
  await prisma.memberNote.createMany({ data: noteRows });

  // ---------- Semáforo de Aptitud (G.2) ----------
  await prisma.aptitudeRule.createMany({
    data: APTITUDE_RULES.map((r) => ({ id: id(), orgId, injuryZone: r.injuryZone, blockArea: r.blockArea, light: r.light, adaptation: r.adaptation, editedByUserId: ownerId })),
  });

  // ---------- Motor de retención (G.3) ----------
  const retentionAlerts: { id: string; memberId: string; baselineFreq: number; recentFreq: number; dropPct: number; riskLevel: RetentionRiskLevel; context: string | null }[] = [];
  for (const m of members) {
    if (m.state !== MemberState.ACTIVE) continue;
    const dates = attendanceByMember.get(m.id) ?? [];
    const baselineCount = dates.filter((d) => d >= addDays(TODAY, -98) && d < addDays(TODAY, -14)).length;
    const recentCount = dates.filter((d) => d >= addDays(TODAY, -14)).length;
    const baselineFreq = baselineCount / 12;
    const recentFreq = recentCount / 2;
    if (baselineFreq < 0.4) continue;
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
        context: hr
          ? `Reportó ${hr.description.toLowerCase()} el ${hr.reportedAt.toLocaleDateString("es-ES")}.`
          : daysSinceLast !== null
          ? `Última clase hace ${daysSinceLast} días.`
          : null,
      });
    }
  }
  await prisma.retentionAlert.createMany({ data: retentionAlerts });

  // ---------- Auditoría (ADR-008) ----------
  const receptionIds = staffUsers.filter((u) => u.role === "RECEPTION").map((u) => u.id);
  const auditRows: { id: string; orgId: string; actorUserId: string; action: string; entityType: string; entityId: string; memberId: string | null; createdAt: Date }[] = [];
  for (const hr of healthRecords.slice(0, 25)) {
    auditRows.push({ id: id(), orgId, actorUserId: pick(trainerAndOwnerIds), action: "HEALTH_RECORD_READ", entityType: "HealthRecord", entityId: hr.id, memberId: hr.memberId, createdAt: addDays(TODAY, -randInt(0, 60)) });
  }
  if (receptionIds.length) {
    for (let i = 0; i < 20; i++) {
      const mem = pick(members);
      auditRows.push({ id: id(), orgId, actorUserId: pick(receptionIds), action: "MEMBER_UPDATED", entityType: "Member", entityId: mem.id, memberId: mem.id, createdAt: addDays(TODAY, -randInt(0, 90)) });
    }
  }
  await prisma.auditLog.createMany({ data: auditRows });

  console.log(
    `[${cfg.name}] ${centersData.length} centros · ${staffUsers.length} personal · ${memberships.length} imputaciones · ${members.length} socios · ${sessions.length} sesiones · ${bookings.length} reservas · ${payments.length} pagos · ${healthRecords.length} salud · ${noteRows.length} notas · ${retentionAlerts.length} alertas`
  );
}

const ORGS: OrgSeedConfig[] = [
  {
    name: "TRAINING ZONE",
    slug: "training-zone",
    logoUrl: "/brand/tz-logo-black.png",
    historyDays: 210,
    futureDays: 21,
    centers: [
      { key: "centro", name: "TRAINING ZONE Centro", slug: "centro", address: "Calle Mayor 12, Madrid", templateCount: 11, capacityRange: [10, 16], memberCount: 130 },
      { key: "norte", name: "TRAINING ZONE Norte", slug: "norte", address: "Av. de la Ilustración 45, Madrid", templateCount: 9, capacityRange: [8, 14], memberCount: 85 },
      { key: "sur", name: "TRAINING ZONE Sur", slug: "sur", address: "Calle Toledo 88, Madrid", templateCount: 8, capacityRange: [8, 12], memberCount: 70 },
    ],
    staff: [
      { name: "Sergio Martín", email: "sergio@trainingzone.es", role: "OWNER", centerKey: null },
      { name: "Beatriz Ruiz", email: "direccion.centro@trainingzone.es", role: "CENTER_DIRECTOR", centerKey: "centro" },
      { name: "Dani Herrero", email: "entrenador@trainingzone.es", role: "TRAINER", centerKey: "centro" },
      { name: "Ana Cabrera", email: "recepcion@trainingzone.es", role: "RECEPTION", centerKey: "centro" },
      { name: "Laura Gimeno", email: "laura.gimeno@trainingzone.es", role: "TRAINER", centerKey: "centro" },
      { name: "Marcos Iglesias", email: "marcos.iglesias@trainingzone.es", role: "TRAINER", centerKey: "centro" },
      { name: "Diego Ramos", email: "diego.ramos@trainingzone.es", role: "TRAINER", centerKey: "centro" },
      { name: "Elena Vidal", email: "elena.vidal@trainingzone.es", role: "TRAINER", centerKey: "norte" },
      { name: "Javier Soto", email: "javier.soto@trainingzone.es", role: "TRAINER", centerKey: "norte" },
      { name: "Sara Ortiz", email: "sara.ortiz@trainingzone.es", role: "TRAINER", centerKey: "norte" },
      { name: "Carla Nuñez", email: "carla.nunez@trainingzone.es", role: "TRAINER", centerKey: "sur" },
      { name: "Hugo Marín", email: "hugo.marin@trainingzone.es", role: "TRAINER", centerKey: "sur" },
      { name: "Patricia Domínguez", email: "direccion.norte@trainingzone.es", role: "CENTER_DIRECTOR", centerKey: "norte" },
      { name: "Rubén Castillo", email: "direccion.sur@trainingzone.es", role: "CENTER_DIRECTOR", centerKey: "sur" },
      { name: "Nuria Paredes", email: "recepcion.norte@trainingzone.es", role: "RECEPTION", centerKey: "norte" },
      { name: "Óscar Bravo", email: "recepcion.sur@trainingzone.es", role: "RECEPTION", centerKey: "sur" },
      { name: "Cristina Molina", email: "rrhh@trainingzone.es", role: "HR_MANAGER", centerKey: null },
      { name: "Piensaenweb Admin", email: "admin@piensaenweb.dev", role: "PLATFORM_ADMIN", centerKey: null },
    ],
    extraImputaciones: [
      { email: "entrenador@trainingzone.es", centerKey: "norte", role: "TRAINER", allocationPct: 40, primaryAllocationPct: 60 },
      { email: "direccion.centro@trainingzone.es", centerKey: "sur", role: "CENTER_DIRECTOR", allocationPct: 30 },
    ],
    demoMember: { email: "socio@trainingzone.es", firstName: "Marta", lastName: "García López", centerKey: "centro" },
  },
  {
    name: "VITALIA WELLNESS",
    slug: "vitalia",
    logoUrl: "/brand/vitalia-logo.svg",
    historyDays: 150,
    futureDays: 14,
    centers: [
      { key: "chamberi", name: "Vitalia Chamberí", slug: "chamberi", address: "Calle de Almagro 22, Madrid", templateCount: 9, capacityRange: [8, 14], memberCount: 82 },
      // Retiro sin logo propio → hereda el de la organización (Vitalia) en el NavBar.
      { key: "retiro", name: "Vitalia Retiro", slug: "retiro", address: "Av. Menéndez Pelayo 15, Madrid", logoUrl: null, templateCount: 7, capacityRange: [8, 12], memberCount: 58 },
    ],
    staff: [
      { name: "Nerea Salas", email: "owner@vitalia.es", role: "OWNER", centerKey: null },
      { name: "Pablo Herrán", email: "direccion.chamberi@vitalia.es", role: "CENTER_DIRECTOR", centerKey: "chamberi" },
      { name: "Marta Iñiguez", email: "direccion.retiro@vitalia.es", role: "CENTER_DIRECTOR", centerKey: "retiro" },
      { name: "Iván Lozano", email: "entrenador@vitalia.es", role: "TRAINER", centerKey: "chamberi" },
      { name: "Claudia Reyes", email: "claudia.reyes@vitalia.es", role: "TRAINER", centerKey: "chamberi" },
      { name: "Gonzalo Prieto", email: "gonzalo.prieto@vitalia.es", role: "TRAINER", centerKey: "retiro" },
      { name: "Alba Serrano", email: "alba.serrano@vitalia.es", role: "TRAINER", centerKey: "retiro" },
      { name: "Marta Gil", email: "recepcion.chamberi@vitalia.es", role: "RECEPTION", centerKey: "chamberi" },
      { name: "Sergio Pastor", email: "recepcion.retiro@vitalia.es", role: "RECEPTION", centerKey: "retiro" },
      { name: "Rocío Vega", email: "rrhh@vitalia.es", role: "HR_MANAGER", centerKey: null },
    ],
    extraImputaciones: [
      { email: "entrenador@vitalia.es", centerKey: "retiro", role: "TRAINER", allocationPct: 35, primaryAllocationPct: 65 },
    ],
    demoMember: { email: "socio@vitalia.es", firstName: "Lucía", lastName: "Fernández Soler", centerKey: "chamberi" },
  },
];

async function main() {
  console.log("Limpiando base de datos...");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.memberNote.deleteMany(),
    prisma.centerMembership.deleteMany(),
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

  const passwordHash = await bcrypt.hash("demo1234", 10);
  for (const cfg of ORGS) {
    await seedOrganization(cfg, passwordHash);
  }

  console.log("\nSeed completado.");
  console.log("Usuarios demo (contraseña: demo1234):");
  console.log("  TRAINING ZONE:");
  console.log("    sergio@trainingzone.es            (Dirección / Owner)");
  console.log("    direccion.centro@trainingzone.es  (Dirección de centro)");
  console.log("    entrenador@trainingzone.es        (Entrenador — imputado a Centro + Norte)");
  console.log("    recepcion@trainingzone.es         (Recepción)");
  console.log("    rrhh@trainingzone.es              (RRHH — organización y equipo)");
  console.log("    socio@trainingzone.es             (Socio — Marta García López)");
  console.log("  VITALIA WELLNESS (segunda empresa, multi-tenant):");
  console.log("    owner@vitalia.es                  (Dirección / Owner)");
  console.log("    entrenador@vitalia.es             (Entrenador — imputado a Chamberí + Retiro)");
  console.log("    rrhh@vitalia.es                   (RRHH)");
  console.log("    socio@vitalia.es                  (Socio — Lucía Fernández)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
