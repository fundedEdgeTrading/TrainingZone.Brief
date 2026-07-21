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
const MADRID_POSTAL_CODES = ["28001", "28004", "28009", "28013", "28020", "28028", "28035", "28045"];
const OCCUPATIONS = [
  "Administrativo/a",
  "Profesor/a",
  "Enfermero/a",
  "Empresario/a (consultoría)",
  "Autónomo/a (diseño gráfico)",
  "Ingeniero/a de software",
  "Comercial",
  "Médico/a",
  "Abogado/a",
  "Estudiante",
  "Gerente de tienda",
  "Fisioterapeuta",
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
    { id: id(), name: "Entrenamiento online 1:1", type: PlanType.ONLINE, sessionsIncluded: null as number | null, priceCents: 3900, validityDays: 30 },
  ];
  await prisma.membershipPlan.createMany({ data: plans.map((p) => ({ ...p, orgId })) });
  const [monthlyPlan, pack10, pack20, dropIn, personalTraining, , onlinePlan] = plans;

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
      // F9 (RB-PERFIL): perfil extendido para poder enseñar BI demográfico (RB-BI-003).
      postalCode: m.state === MemberState.PROSPECT ? null : pick(MADRID_POSTAL_CODES),
      occupation: m.state === MemberState.PROSPECT ? null : pick(OCCUPATIONS),
      hasChildren: m.state === MemberState.PROSPECT ? null : Math.random() < 0.85 ? Math.random() < 0.5 : null,
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
            [monthlyPlan, 50],
            [pack10, 20],
            [pack20, 10],
            [personalTraining, 8],
            [dropIn, 7],
            [onlinePlan, 5],
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

  // F9/RB-PERFIL-002 (decisión §11.4): EP y online SIEMPRE tienen entrenador
  // individual asignado explícitamente; "solo grupos" se queda sin trainerId.
  const epOrOnlinePlanIds = new Set<string>([personalTraining.id, onlinePlan.id]);
  const trainerAssignments: { memberId: string; trainerId: string }[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== SubscriptionStatus.ACTIVE || !epOrOnlinePlanIds.has(sub.planId)) continue;
    const member = members.find((m) => m.id === sub.memberId)!;
    const centerTrainers = trainersByCenter[member.centerId];
    if (!centerTrainers?.length) continue;
    trainerAssignments.push({ memberId: member.id, trainerId: pick(centerTrainers).id });
  }
  for (const t of trainerAssignments) {
    await prisma.member.update({ where: { id: t.memberId }, data: { trainerId: t.trainerId } });
  }

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
  const sellerIds = staffUsers.filter((u) => u.role === "RECEPTION" || u.role === "CENTER_DIRECTOR" || u.role === "OWNER").map((u) => u.id);
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
    soldByUserId: string | null;
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
        soldByUserId: sellerIds.length ? pick(sellerIds) : null,
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

  // ---------- F8: Embudo de Leads ----------
  const leadChannels = ["Boca a boca", "Instagram", "TikTok", "Web", "Vive/trabaja por la zona", "Otro"].map((label) => ({
    id: id(),
    orgId,
    label,
  }));
  await prisma.leadChannel.createMany({ data: leadChannels });

  const noCloseReasons = ["Precio", "Horarios", "Se fue a la competencia", "No decide / lo piensa", "Distancia/ubicación", "Otro"].map(
    (label) => ({ id: id(), orgId, label })
  );
  await prisma.noCloseReason.createMany({ data: noCloseReasons });

  const anyCenter = centersData[0];
  const receptionOrOwner = staffUsers.filter((u) => u.role === "RECEPTION" || u.role === "TRAINER" || u.role === "CENTER_DIRECTOR");
  const activeNonAnchorMembers = members.filter((m) => m.state === MemberState.ACTIVE && m.id !== demoMemberId);

  type SeedLead = {
    id: string;
    centerId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    postalCode: string;
    occupation: string;
    hasChildren: boolean | null;
    goals: string;
    hasTrainedBefore: boolean;
    channel: string;
    status: "SIN_CONTACTAR" | "SEGUIMIENTO" | "CON_FECHA_VALORACION" | "CERRADO" | "NO_CERRADO";
    ownerUserId: string | null;
    contactedAt: Date;
    noCloseReason: string | null;
    convertedMemberId: string | null;
  };
  const leads: SeedLead[] = [
    {
      id: id(),
      centerId: anyCenter.id,
      firstName: "Marina",
      lastName: "Castillo",
      phone: faker.phone.number({ style: "national" }),
      email: faker.internet.email({ firstName: "Marina", lastName: "Castillo" }).toLowerCase(),
      postalCode: pick(MADRID_POSTAL_CODES),
      occupation: pick(OCCUPATIONS),
      hasChildren: null,
      goals: "Perder peso y ganar energía en el día a día",
      hasTrainedBefore: false,
      channel: pick(leadChannels).label,
      status: "SIN_CONTACTAR",
      ownerUserId: null, // RB-LEAD-003: entró por formulario web, sin responsable
      contactedAt: addDays(TODAY, -2), // >24h sin responsable → dispara RB-LEAD-009
      noCloseReason: null,
      convertedMemberId: null,
    },
    {
      id: id(),
      centerId: anyCenter.id,
      firstName: "Pedro",
      lastName: "Salinas",
      phone: faker.phone.number({ style: "national" }),
      email: null,
      postalCode: pick(MADRID_POSTAL_CODES),
      occupation: pick(OCCUPATIONS),
      hasChildren: true,
      goals: "Prepararse para una carrera popular",
      hasTrainedBefore: true,
      channel: pick(leadChannels).label,
      status: "SEGUIMIENTO",
      ownerUserId: receptionOrOwner.length ? pick(receptionOrOwner).id : null,
      contactedAt: addDays(TODAY, -5),
      noCloseReason: null,
      convertedMemberId: null,
    },
    {
      id: id(),
      centerId: anyCenter.id,
      firstName: "Aitana",
      lastName: "Roldán",
      phone: faker.phone.number({ style: "national" }),
      email: faker.internet.email({ firstName: "Aitana", lastName: "Roldan" }).toLowerCase(),
      postalCode: pick(MADRID_POSTAL_CODES),
      occupation: pick(OCCUPATIONS),
      hasChildren: false,
      goals: "Tonificar y mejorar movilidad",
      hasTrainedBefore: true,
      channel: pick(leadChannels).label,
      status: "CON_FECHA_VALORACION",
      ownerUserId: receptionOrOwner.length ? pick(receptionOrOwner).id : null,
      contactedAt: addDays(TODAY, -3),
      noCloseReason: null,
      convertedMemberId: null,
    },
    {
      id: id(),
      centerId: anyCenter.id,
      firstName: "Rubén",
      lastName: "Aparicio",
      phone: faker.phone.number({ style: "national" }),
      email: faker.internet.email({ firstName: "Ruben", lastName: "Aparicio" }).toLowerCase(),
      postalCode: pick(MADRID_POSTAL_CODES),
      occupation: pick(OCCUPATIONS),
      hasChildren: null,
      goals: "Ganar fuerza general",
      hasTrainedBefore: false,
      channel: pick(leadChannels).label,
      status: "NO_CERRADO",
      ownerUserId: receptionOrOwner.length ? pick(receptionOrOwner).id : null,
      contactedAt: addDays(TODAY, -40),
      noCloseReason: pick(noCloseReasons).label,
      convertedMemberId: null,
    },
    ...(activeNonAnchorMembers.length
      ? [
          {
            id: id(),
            centerId: anyCenter.id,
            firstName: "Historial",
            lastName: "Convertido",
            phone: faker.phone.number({ style: "national" }),
            email: faker.internet.email({ firstName: "historial", lastName: "convertido" }).toLowerCase(),
            postalCode: pick(MADRID_POSTAL_CODES),
            occupation: pick(OCCUPATIONS),
            hasChildren: false,
            goals: "Ponerse en forma para el verano",
            hasTrainedBefore: false,
            channel: pick(leadChannels).label,
            status: "CERRADO" as const,
            ownerUserId: receptionOrOwner.length ? pick(receptionOrOwner).id : null,
            contactedAt: addDays(TODAY, -60),
            noCloseReason: null,
            convertedMemberId: activeNonAnchorMembers[0].id,
          },
        ]
      : []),
  ];
  await prisma.lead.createMany({ data: leads.map((l) => ({ ...l, orgId })) });

  if (activeNonAnchorMembers.length) {
    await prisma.member.update({ where: { id: activeNonAnchorMembers[0].id }, data: { originLeadId: leads[leads.length - 1].id } });
  }

  const leadNoteRows = leads
    .filter((l) => l.status !== "SIN_CONTACTAR")
    .map((l) => ({
      id: id(),
      orgId,
      leadId: l.id,
      authorUserId: l.ownerUserId,
      body: pick(["Le encajan mejor las clases de tarde.", "Muy interesado/a, pedir referencia de un amigo.", "Quiere probar antes de comprometerse a un bono largo."]),
      createdAt: addDays(l.contactedAt, 1),
    }));
  if (leadNoteRows.length) await prisma.leadNote.createMany({ data: leadNoteRows });

  // ---------- F9: Catálogo de objetivos (RB-PERFIL-003) ----------
  const goalTemplates = [
    "Conseguir hacer 1 flexión completa",
    "Conseguir hacer 10 sentadillas con el peso corporal",
    "Mejorar el dolor de espalda",
    "Mejorar el dolor de rodilla",
    "Sentir más energía en el día a día",
  ].map((label) => ({ id: id(), orgId, label, isTemplate: true }));
  await prisma.clientGoal.createMany({ data: goalTemplates });

  const goalAssignments: { id: string; orgId: string; memberId: string; label: string; isTemplate: boolean; achievedAt: Date | null }[] = [];
  for (const m of members) {
    if (m.state !== MemberState.ACTIVE) continue;
    if (Math.random() > 0.35) continue;
    const label = pick(goalTemplates).label;
    goalAssignments.push({
      id: id(),
      orgId,
      memberId: m.id,
      label,
      isTemplate: false,
      achievedAt: Math.random() < 0.3 ? addDays(TODAY, -randInt(1, 30)) : null,
    });
  }
  if (goalAssignments.length) await prisma.clientGoal.createMany({ data: goalAssignments });

  // ---------- F11: Franjas de EP (autorreserva + director de sesión) ----------
  const epSessionIds = sessions.filter((s) => s.classType === "Personal Training");
  const selfBookableIds = epSessionIds.filter(() => Math.random() < 0.5).map((s) => s.id);
  if (selfBookableIds.length) {
    await prisma.classSession.updateMany({ where: { id: { in: selfBookableIds } }, data: { selfBookable: true } });
  }
  const pastDirectedIds = epSessionIds.filter((s) => s.isPast && s.trainerId && Math.random() < 0.6);
  for (const s of pastDirectedIds.slice(0, 150)) {
    await prisma.classSession.update({ where: { id: s.id }, data: { directedByUserId: s.trainerId } });
  }

  // ---------- F13: RRHH — fichaje y buzón de propuestas ----------
  const timeClockRows: { id: string; orgId: string; userId: string; centerId: string; workDate: Date; clockIn: string; clockOut: string | null; signedAt: Date | null }[] = [];
  for (const u of staffUsers) {
    if (!u.centerId) continue;
    for (let d = 1; d <= 10; d++) {
      const workDate = addDays(TODAY, -d);
      if (workDate.getDay() === 0 || workDate.getDay() === 6) continue;
      const signed = Math.random() < 0.7;
      timeClockRows.push({
        id: id(),
        orgId,
        userId: u.id,
        centerId: u.centerId,
        workDate,
        clockIn: fmtTime(9, randInt(0, 15)),
        clockOut: fmtTime(17, randInt(0, 30)),
        signedAt: signed ? workDate : null,
      });
    }
  }
  for (let i = 0; i < timeClockRows.length; i += CHUNK) {
    await prisma.timeClockEntry.createMany({ data: timeClockRows.slice(i, i + CHUNK) });
  }

  const trainerUsers = staffUsers.filter((u) => u.role === "TRAINER");
  if (trainerUsers.length) {
    await prisma.staffProposal.createMany({
      data: [
        { id: id(), orgId, authorUserId: pick(trainerUsers).id, body: "Podríamos añadir una clase de movilidad los sábados por la mañana.", status: "OPEN" },
        { id: id(), orgId, authorUserId: pick(trainerUsers).id, body: "Sería útil tener una sala pequeña solo para EP.", status: "REVIEWED" },
      ],
    });
  }

  // ---------- F14: Ofertas personalizadas y valoración de entrenadores ----------
  if (activeNonAnchorMembers.length && trainerUsers.length) {
    const offerMembers = activeNonAnchorMembers.slice(0, Math.min(3, activeNonAnchorMembers.length));
    const offerStatuses: ("SUGERIDA" | "PENDIENTE_DIRECCION" | "APROBADA")[] = ["SUGERIDA", "PENDIENTE_DIRECCION", "APROBADA"];
    await prisma.personalizedOffer.createMany({
      data: offerMembers.map((m, i) => ({
        id: id(),
        orgId,
        memberId: m.id,
        proposedByUserId: offerStatuses[i] === "SUGERIDA" ? null : pick(trainerUsers).id,
        approvedByUserId: offerStatuses[i] === "APROBADA" ? ownerId : null,
        signals: { attendancePerWeek: 1.0, tenureDays: 90 },
        description: "2 días/semana con 20% dto. el primer mes.",
        status: offerStatuses[i] ?? "SUGERIDA",
      })),
    });

    const ratingMembers = activeNonAnchorMembers.slice(0, Math.min(5, activeNonAnchorMembers.length));
    await prisma.trainerRating.createMany({
      data: ratingMembers.map((m) => ({
        id: id(),
        orgId,
        trainerUserId: pick(trainerUsers).id,
        memberId: m.id,
        score: randInt(3, 5),
        strengths: "Explica muy bien la técnica y motiva.",
        improvements: "Podría variar más los ejercicios.",
      })),
    });
  }

  // ---------- F16: IA (rutinas), autovaloración y chat — foco en el socio demo ----------
  if (cfg.demoMember && demoMemberId && demoMemberUserId) {
    const demoTrainer = trainersByCenter[centerIdByKey.get(cfg.demoMember.centerKey)!]?.[0];
    await prisma.member.update({ where: { id: demoMemberId }, data: { trainerId: demoTrainer?.id } });

    await prisma.workoutProgram.createMany({
      data: [
        {
          id: id(),
          orgId,
          memberId: demoMemberId,
          createdByAI: true,
          confirmedByUserId: demoTrainer?.id ?? null,
          status: demoTrainer ? "ACTIVE" : "DRAFT",
          payload: {
            goals: ["Mejorar el dolor de espalda"],
            sessions: [
              { day: "Lunes", blocks: ["Movilidad 10'", "Fuerza tren inferior 3x10", "Core 3x30\""] },
              { day: "Miércoles", blocks: ["Movilidad 10'", "Fuerza tren superior 3x10", "Cardio ligero 15'"] },
            ],
            source: "mock-ai-v1",
          },
        },
      ],
    });

    await prisma.selfAssessment.create({
      data: {
        orgId,
        memberId: demoMemberId,
        kind: "checkin-objetivos",
        text: "Me siento con más energía, aunque algunas semanas cuesta más venir.",
        structured: { stalled: false, wantsMore: true },
        aiRecommendation: "¡Sigue así! Registramos tu progreso y tu entrenador lo revisará en tu próximo check-in.",
      },
    });

    const conversation = await prisma.conversation.create({ data: { orgId, memberId: demoMemberId } });
    await prisma.chatMessage.createMany({
      data: [
        { id: id(), conversationId: conversation.id, senderKind: "TRAINER", senderUserId: demoTrainer?.id ?? null, body: "¡Hola! ¿Qué tal la rodilla esta semana?", createdAt: addDays(TODAY, -2) },
        { id: id(), conversationId: conversation.id, senderKind: "MEMBER", senderUserId: demoMemberUserId, body: "Mucho mejor, gracias. Ya sin molestias.", createdAt: addDays(TODAY, -2) },
        { id: id(), conversationId: conversation.id, senderKind: "AI", senderUserId: null, body: "Recuerda tu sesión de mañana a las 09:00 — ¡nos vemos!", createdAt: addDays(TODAY, -1) },
      ],
    });
  }

  // ---------- F10: Notificaciones de ejemplo ----------
  const directorForNotif = staffUsers.find((u) => u.role === "OWNER" || u.role === "CENTER_DIRECTOR");
  if (directorForNotif) {
    const staleLead = leads.find((l) => l.status === "SIN_CONTACTAR");
    await prisma.notification.createMany({
      data: [
        ...(staleLead
          ? [
              {
                id: id(),
                orgId,
                recipientUserId: directorForNotif.id,
                kind: "ALERT" as const,
                title: `Lead sin responsable: ${staleLead.firstName} ${staleLead.lastName}`,
                body: "Lleva más de 24h sin que nadie se lo asigne (RB-LEAD-009).",
                entityType: "Lead",
                entityId: staleLead.id,
              },
            ]
          : []),
        {
          id: id(),
          orgId,
          recipientUserId: directorForNotif.id,
          kind: "INFO" as const,
          title: "Nueva propuesta de un compañero",
          body: "Podríamos añadir una clase de movilidad los sábados por la mañana.",
          entityType: "StaffProposal",
          entityId: null,
        },
      ],
    });
  }

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
    prisma.chatMessage.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.selfAssessment.deleteMany(),
    prisma.workoutProgram.deleteMany(),
    prisma.trainerRating.deleteMany(),
    prisma.personalizedOffer.deleteMany(),
    prisma.staffProposal.deleteMany(),
    prisma.timeClockEntry.deleteMany(),
    prisma.checkinScheduleConfig.deleteMany(),
    prisma.clientGoal.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.leadNote.deleteMany(),
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
    // Lead <-> Member forman un ciclo de FKs (Lead.convertedMemberId / Member.originLeadId):
    // se rompe el ciclo antes de poder borrar cualquiera de las dos tablas.
    prisma.member.updateMany({ data: { originLeadId: null } }),
    prisma.lead.updateMany({ data: { convertedMemberId: null } }),
    prisma.lead.deleteMany(),
    prisma.leadChannel.deleteMany(),
    prisma.noCloseReason.deleteMany(),
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
