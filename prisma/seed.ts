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
  Sex,
  Prisma,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { ZARAGOZA_POSTAL_CODES } from "@/lib/postal-codes-zaragoza";
import { startOfWeekMonday } from "@/lib/date-utils";
import type { FeedbackDims } from "@/lib/feedback-queries";

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
// Fotos demo autocontenidas (data URL con SVG, sin depender de red externa),
// tal como indica el comentario del schema para Member.photoUrl.
function hashHue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
function svgDataUri(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function demoAvatarUrl(seed: string, initials: string) {
  const hue = hashHue(seed);
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="hsl(${hue},45%,55%)"/><text x="150" y="172" font-family="Arial,sans-serif" font-size="110" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`
  );
}
// Fotos de archivo para los anuncios: Lorem Picsum sirve imágenes de Unsplash
// bajo licencia Unsplash (uso comercial libre y sin atribución), así que la demo
// no arrastra material con derechos. La semilla fija la foto: el mismo anuncio
// enseña siempre la misma imagen entre reseeds.
function stockPhoto(seed: string) {
  return `https://picsum.photos/seed/tz-${seed}/1200/675`;
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
// Silueta tipo "muñeco" (no es una foto real de una persona) cuya anchura de
// cintura/cadera y grosor de brazos/piernas varían con los datos de cada
// registro (peso, cintura, % graso), para poder ver la evolución física
// entre fotos igual que con un dibujo del cuerpo.
// Lienzo horizontal (no vertical) porque las tarjetas del front recortan la
// imagen con object-cover en cajas anchas y bajas (miniatura ~8:5, comparador
// ~4:3): un lienzo alto perdería la cabeza. La etiqueta Frente/Perfil/Espalda
// ya la pinta el front debajo de la imagen, así que no se repite aquí.
function bodySilhouetteSvg(opts: { view: "front" | "side"; weightKg: number; bodyFatPct: number; waistCm: number }) {
  const { view, weightKg, bodyFatPct, waistCm } = opts;
  const cx = 240;
  const shoulderHalf = 95;
  const waistHalf = clamp(58 + (waistCm - 80) * 4.2 + (bodyFatPct - 26) * 2.6, 46, 118);
  const hipHalf = waistHalf * 0.88 + 14;
  const armW = clamp(20 + (weightKg - 67) * 1.6, 15, 34);
  const legW = clamp(34 + (weightKg - 67) * 1.8, 26, 52);
  const legGap = 12;
  const skin = "#8a97a6";
  const skinDark = "#5f6c7a";
  const bg = "#eef1f4";
  const legs = `<rect x="${cx - legGap - legW}" y="270" width="${legW}" height="60" rx="${legW / 3}" fill="${skinDark}"/><rect x="${cx + legGap}" y="270" width="${legW}" height="60" rx="${legW / 3}" fill="${skinDark}"/>`;

  if (view === "side") {
    const bellyBulge = clamp(waistHalf * 0.5, 25, 70);
    const path = [
      `M ${cx - 30} 135`,
      `L ${cx - 30} 275`,
      `L ${cx - 16} 285`,
      `L ${cx - 20} 330`,
      `L ${cx - 2} 330`,
      `L ${cx + 6} 285`,
      `L ${cx + 20} 330`,
      `L ${cx + 34} 330`,
      `L ${cx + 18} 280`,
      `Q ${cx + bellyBulge} 210 ${cx + 14} 155`,
      `L ${cx + 4} 138`,
      `Z`,
    ].join(" ");
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="380"><rect width="480" height="380" fill="${bg}"/><circle cx="${cx - 4}" cy="95" r="34" fill="${skin}"/><path d="${path}" fill="${skin}"/></svg>`
    );
  }

  // Torso (mitad derecha) desde el hombro hasta la cadera; la mitad izquierda
  // es el espejo, formando un polígono cerrado. Las piernas son dos bloques
  // cortos debajo, a modo de encuadre de foto de cuerpo (no de pie entero).
  const half: [number, number][] = [
    [shoulderHalf, 145],
    [shoulderHalf * 0.82, 180],
    [waistHalf, 225],
    [hipHalf, 270],
  ];
  const right = half.map(([x, y]) => `${cx + x} ${y}`).join(" L ");
  const left = [...half].reverse().map(([x, y]) => `${cx - x} ${y}`).join(" L ");
  const body = `M ${cx} 130 L ${right} L ${cx - hipHalf} 270 L ${left} Z`;
  const armY1 = 150;
  const armY2 = 260;
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="380"><rect width="480" height="380" fill="${bg}"/>` +
      `<rect x="${cx - shoulderHalf - armW}" y="${armY1}" width="${armW}" height="${armY2 - armY1}" rx="${armW / 2}" fill="${skinDark}"/>` +
      `<rect x="${cx + shoulderHalf}" y="${armY1}" width="${armW}" height="${armY2 - armY1}" rx="${armW / 2}" fill="${skinDark}"/>` +
      `${legs}<path d="${body}" fill="${skin}"/><circle cx="${cx}" cy="95" r="38" fill="${skin}"/></svg>`
  );
}

// ---------- Configuración por organización ----------
type CenterCfg = {
  key: string;
  name: string;
  slug: string;
  address: string;
  logoUrl?: string | null;
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
type DemoPlanKey = "group4" | "group8" | "group12" | "ep4" | "ep8" | "ep12";
type DemoMemberCfg = { email: string; firstName: string; lastName: string; centerKey: string; planKey?: DemoPlanKey };
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
// F9/BI-3: primera puesta en preproducción — el centro solo tiene socios/leads
// de Zaragoza capital, así que todo el pool de CP se restringe a los barrios
// de ZARAGOZA_POSTAL_CODES (ver postal-codes-zaragoza.ts), contra el que
// dashboard-queries.ts hace el join por CP completo (ya no por provincia).
const LEAD_POSTAL_CODES = Object.keys(ZARAGOZA_POSTAL_CODES);
// Pool de CP de socios para poblar el mapa de calor, ponderado hacia los
// barrios más poblados (Delicias, Casco Histórico, Universidad, Actur...) con
// una cola larga hacia los barrios periféricos — para que el mapa muestre
// tanto puntos grandes como pequeños repartidos por toda la ciudad.
const MEMBER_POSTAL_CODES: [string, number][] = [
  ["50005", 8], // Delicias
  ["50017", 5], // Delicias (Miralbueno)
  ["50001", 6], // Casco Histórico
  ["50006", 6], // Universidad
  ["50007", 5], // San José
  ["50013", 5], // Las Fuentes
  ["50015", 5], // Actur - Rey Fernando
  ["50018", 4], // Actur Norte
  ["50002", 4], // La Magdalena
  ["50003", 4], // San Pablo
  ["50004", 4], // La Almozara
  ["50010", 4], // Parque Roma
  ["50008", 3], // Torrero - La Paz
  ["50011", 3], // Oliver
  ["50009", 3], // Casablanca
  ["50014", 2], // Venecia
  ["50012", 2], // Valdefierro
  ["50016", 2], // Santa Isabel
  ["50019", 2], // Valdespartera
];
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
    // RB-PLAT-007: las orgs de demo nacen ACTIVE para no chocar con el muro de pago (A.3).
    data: { id: orgId, name: cfg.name, slug: cfg.slug, logoUrl: cfg.logoUrl, platformStatus: "ACTIVE" },
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
  // Catálogo (decisión de producto): dos modalidades — Grupos reducidos y
  // Entrenamiento personal — cada una con bonos de 4, 8 y 12 sesiones.
  const plans = [
    { id: id(), name: "Grupos reducidos · Bono 4 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 4 as number | null, priceCents: 4000, validityDays: 30 },
    { id: id(), name: "Grupos reducidos · Bono 8 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 8 as number | null, priceCents: 7200, validityDays: 60 },
    { id: id(), name: "Grupos reducidos · Bono 12 sesiones", type: PlanType.SESSION_PACK, sessionsIncluded: 12 as number | null, priceCents: 10200, validityDays: 90 },
    { id: id(), name: "Entrenamiento personal · Bono 4 sesiones", type: PlanType.PERSONAL_TRAINING, sessionsIncluded: 4 as number | null, priceCents: 14000, validityDays: 30 },
    { id: id(), name: "Entrenamiento personal · Bono 8 sesiones", type: PlanType.PERSONAL_TRAINING, sessionsIncluded: 8 as number | null, priceCents: 26400, validityDays: 60 },
    { id: id(), name: "Entrenamiento personal · Bono 12 sesiones", type: PlanType.PERSONAL_TRAINING, sessionsIncluded: 12 as number | null, priceCents: 37200, validityDays: 90 },
  ];
  await prisma.membershipPlan.createMany({ data: plans.map((p) => ({ ...p, orgId })) });
  const [group4, group8, group12, ep4, ep8, ep12] = plans;
  const plansByKey: Record<DemoPlanKey, typeof plans[number]> = { group4, group8, group12, ep4, ep8, ep12 };
  const epPlanIds = new Set<string>([ep4.id, ep8.id, ep12.id]);

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
  // Parrilla semanal fija: un club real repite el mismo horario cada semana. Se
  // declara explícitamente (en lugar de sortearla) para que la agenda sea
  // coherente — sin dos clases en la misma sala a la misma hora, sin entrenador
  // duplicado y con el nombre de la sesión casando siempre con su tipo de clase.
  const GROUP_GRID: { weekday: number; start: string; classType: string }[] = [
    { weekday: 1, start: "07:00", classType: "Funcional" },
    { weekday: 1, start: "09:30", classType: "Movilidad" },
    { weekday: 1, start: "18:00", classType: "Fuerza" },
    { weekday: 1, start: "19:00", classType: "CrossTraining" },
    { weekday: 2, start: "07:00", classType: "HIIT" },
    { weekday: 2, start: "10:00", classType: "Fuerza" },
    { weekday: 2, start: "18:00", classType: "Funcional" },
    { weekday: 2, start: "19:00", classType: "Movilidad" },
    { weekday: 3, start: "07:00", classType: "Funcional" },
    { weekday: 3, start: "09:30", classType: "Fuerza" },
    { weekday: 3, start: "18:00", classType: "CrossTraining" },
    { weekday: 3, start: "19:00", classType: "HIIT" },
    { weekday: 4, start: "07:00", classType: "Fuerza" },
    { weekday: 4, start: "10:00", classType: "Movilidad" },
    { weekday: 4, start: "18:00", classType: "Funcional" },
    { weekday: 4, start: "19:00", classType: "Fuerza" },
    { weekday: 5, start: "07:00", classType: "HIIT" },
    { weekday: 5, start: "09:30", classType: "Funcional" },
    { weekday: 5, start: "18:00", classType: "CrossTraining" },
    { weekday: 6, start: "10:00", classType: "CrossTraining" },
    { weekday: 6, start: "11:00", classType: "Movilidad" },
  ];
  // Franjas 1:1 de entrenamiento personal, fuera de las horas punta de grupo.
  const PT_GRID: { weekday: number; start: string }[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, start: "08:00" },
    { weekday, start: "17:00" },
  ]);
  const GROUP_ROOMS = ["Sala Funcional", "Box"];
  // Las clases de tarde llenan más que las de primera hora: la popularidad guía
  // luego cuántas reservas genera cada plantilla.
  const slotPopularity = (start: string) => {
    const h = Number(start.slice(0, 2));
    return h >= 18 ? 0.85 : h >= 17 ? 0.7 : h >= 9 ? 0.55 : 0.45;
  };
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

  for (const c of centersData) {
    const trainers = trainersByCenter[c.id];
    // Reservas ya ocupadas por (entrenador|sala) para no solapar en la rejilla.
    const busy = new Set<string>();
    const overlaps = (who: string, weekday: number, from: number, to: number) => {
      for (let t = from; t < to; t += 5) if (busy.has(`${who}|${weekday}|${t}`)) return true;
      return false;
    };
    const occupy = (who: string, weekday: number, from: number, to: number) => {
      for (let t = from; t < to; t += 5) busy.add(`${who}|${weekday}|${t}`);
    };

    const slots = [
      ...GROUP_GRID.map((g) => ({ ...g, durationMin: 50, isPt: false })),
      ...PT_GRID.map((g) => ({ ...g, classType: "Personal Training", durationMin: 60, isPt: true })),
    ];
    let rotation = 0;
    for (const slot of slots) {
      const from = toMin(slot.start);
      const to = from + slot.durationMin;
      // Reparto rotatorio, saltando a quien ya tenga algo en esa franja.
      let trainerId: string | null = null;
      for (let k = 0; k < trainers.length; k++) {
        const cand = trainers[(rotation + k) % trainers.length];
        if (!overlaps(cand.id, slot.weekday, from, to)) {
          trainerId = cand.id;
          break;
        }
      }
      rotation++;
      const room = slot.isPt
        ? "Sala 1"
        : GROUP_ROOMS.find((r) => !overlaps(r, slot.weekday, from, to)) ?? GROUP_ROOMS[0];
      if (trainerId) occupy(trainerId, slot.weekday, from, to);
      occupy(room, slot.weekday, from, to);

      templates.push({
        id: id(),
        centerId: c.id,
        name: `${slot.classType} ${slot.start}`,
        classType: slot.classType,
        weekday: slot.weekday,
        startTime: slot.start,
        durationMin: slot.durationMin,
        capacity: slot.isPt ? 1 : randInt(...c.capacityRange),
        room,
        trainerId,
        popularity: slot.isPt ? 0.9 : slotPopularity(slot.start),
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
    planKey: DemoPlanKey;
    atRisk: boolean;
    isDemoAnchor: boolean;
  };
  const members: SeedMember[] = [];

  const demoMemberId = cfg.demoMember ? id() : null;
  const demoMemberUserId = cfg.demoMember ? id() : null;

  for (const c of centersData) {
    const centerTemplates = templates.filter((t) => t.centerId === c.id && t.classType !== "Personal Training");
    const ptTemplates = templates.filter((t) => t.centerId === c.id && t.classType === "Personal Training");
    let ptCursor = 0;
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

      // El bono contratado decide a qué asiste: quien tiene Grupos reducidos
      // reserva clases colectivas y quien tiene EP ocupa una franja 1:1 fija.
      // Sin esta correspondencia la agenda mostraría socios de EP en clases de
      // grupo (y al revés), que es justo la incoherencia que había que quitar.
      const planKey: DemoPlanKey = isDemoAnchor
        ? cfg.demoMember!.planKey ?? "group8"
        : weightedPick<DemoPlanKey>([
            ["group4", 14],
            ["group8", 26],
            ["group12", 22],
            ["ep4", 10],
            ["ep8", 16],
            ["ep12", 12],
          ]);
      const isEp = planKey.startsWith("ep");

      const preferredTemplates: Tpl[] = [];
      if (isEp && ptTemplates.length) {
        // Franja 1:1 propia y estable (capacidad 1: repartir evita colisiones).
        preferredTemplates.push(ptTemplates[ptCursor % ptTemplates.length]);
        ptCursor++;
      } else {
        const nPref = randInt(1, 3);
        const pool = [...centerTemplates];
        for (let k = 0; k < nPref && pool.length; k++) {
          preferredTemplates.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
        }
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
        planKey,
        atRisk,
        isDemoAnchor,
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

  // Se recuerda quién firmó imágenes para poder generarle luego la serie de
  // fotos de seguimiento sin volver a consultar la base de datos.
  const consentImagesByMember = new Map<string, boolean>();
  await prisma.member.createMany({
    data: members.map((m) => {
      // El socio ancla de la demo (p.ej. Marta) tiene foto de perfil y todos los
      // consentimientos firmados, para poder enseñar Fotos y Evolución en el front.
      const consentHealth = m.isDemoAnchor || Math.random() < 0.7;
      // Con consentimiento de imágenes se les puede generar la serie de fotos de
      // seguimiento; se firma en la mayoría de altas para que las galerías de
      // evolución tengan contenido en varios socios, no solo en el ancla.
      const consentImages = m.isDemoAnchor || Math.random() < 0.65;
      consentImagesByMember.set(m.id, consentImages);
      const consentMarketing = m.isDemoAnchor || Math.random() < 0.6;
      return {
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
        photoUrl: m.isDemoAnchor ? demoAvatarUrl(m.email, `${m.firstName[0]}${m.lastName[0]}`.toUpperCase()) : null,
        consentContract: true,
        consentHealth,
        consentImages,
        consentMarketing,
        consentContractAt: m.joinedAt,
        consentHealthAt: consentHealth ? m.joinedAt : null,
        consentImagesAt: consentImages ? m.joinedAt : null,
        consentMarketingAt: consentMarketing ? m.joinedAt : null,
        // F9 (RB-PERFIL): perfil extendido para poder enseñar BI demográfico (RB-BI-003).
        postalCode: m.state === MemberState.PROSPECT ? null : weightedPick(MEMBER_POSTAL_CODES),
        occupation: m.state === MemberState.PROSPECT ? null : pick(OCCUPATIONS),
        hasChildren: m.state === MemberState.PROSPECT ? null : Math.random() < 0.85 ? Math.random() < 0.5 : null,
        // BI-2 (RB-BI-005): ~80% responde, el resto se queda "sin especificar" (sex=null).
        sex: m.state === MemberState.PROSPECT || Math.random() >= 0.8 ? null : pick([Sex.FEMALE, Sex.MALE, Sex.OTHER, Sex.FEMALE, Sex.MALE]),
      };
    }),
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
    // El plan ya se decidió al crear el socio (junto con sus franjas preferidas),
    // así que aquí solo se materializa la suscripción correspondiente.
    const plan = plansByKey[m.planKey];
    const status: SubscriptionStatus =
      m.state === MemberState.CANCELLED
        ? SubscriptionStatus.CANCELLED
        : m.state === MemberState.FROZEN
        ? SubscriptionStatus.FROZEN
        : SubscriptionStatus.ACTIVE;
    // El socio demo arranca con saldo intermedio garantizado (ni lleno ni a 0)
    // para que se vea el contador y pueda reservar en la demo.
    const sessionsRemaining = plan.sessionsIncluded
      ? m.id === demoMemberId
        ? Math.max(2, Math.round(plan.sessionsIncluded * 0.6))
        : randInt(0, plan.sessionsIncluded)
      : null;
    subscriptions.push({
      id: id(),
      memberId: m.id,
      planId: plan.id,
      startDate: m.joinedAt,
      endDate: m.cancelledAt,
      status,
      priceCents: plan.priceCents,
      sessionsRemaining,
    });
  }
  await prisma.subscription.createMany({ data: subscriptions });

  // F9/RB-PERFIL-002 (decisión §11.4): EP SIEMPRE tiene entrenador individual
  // asignado explícitamente; "solo grupos" se queda sin trainerId. El entrenador
  // es el de su franja 1:1, para que ficha y agenda cuenten lo mismo.
  const trainerAssignments: { memberId: string; trainerId: string }[] = [];
  for (const sub of subscriptions) {
    if (sub.status !== SubscriptionStatus.ACTIVE || !epPlanIds.has(sub.planId)) continue;
    const member = members.find((m) => m.id === sub.memberId)!;
    const centerTrainers = trainersByCenter[member.centerId];
    if (!centerTrainers?.length) continue;
    const slotTrainerId = member.preferredTemplates[0]?.trainerId ?? null;
    trainerAssignments.push({ memberId: member.id, trainerId: slotTrainerId ?? pick(centerTrainers).id });
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

  // ---------- PAGO-1: ejemplos de ciclo de vida de suscripción (RB-PAGO-002/003/004/005/006) ----------
  const frozenSubs = subscriptions.filter((s) => s.status === SubscriptionStatus.FROZEN);
  if (frozenSubs.length > 0) {
    // Congelación con fecha de reanudación fija (el resto de FROZEN quedan indefinidas, pauseUntil=null).
    await prisma.subscription.update({ where: { id: frozenSubs[0].id }, data: { pauseUntil: addDays(TODAY, 21) } });
  }

  const activeSubs = subscriptions.filter((s) => s.status === SubscriptionStatus.ACTIVE);
  if (activeSubs.length > 0) {
    // Cancelación programada a futuro.
    await prisma.subscription.update({ where: { id: activeSubs[0].id }, data: { cancelAt: addDays(TODAY, 15) } });
  }

  const pendingPayments = payments.filter((p) => p.status === "PENDING");
  if (pendingPayments.length > 0) {
    // Cobro aplazado (RB-PAGO-002): dueDate futura, no debe contar como morosidad.
    await prisma.payment.update({ where: { id: pendingPayments[0].id }, data: { dueDate: addDays(TODAY, 10) } });
  }

  const refundablePayment = payments.find((p) => p.status === "PAID");
  if (refundablePayment) {
    // Devolución en modo registro local (D-2): stripeRefundId permanece null hasta PAGO-2b.
    await prisma.payment.update({
      where: { id: refundablePayment.id },
      data: { status: "REFUNDED", refundReason: "Baja anticipada acordada con el socio", refundedAt: TODAY },
    });
  }

  const oneOffMember = members.find((m) => m.state === MemberState.ACTIVE);
  if (oneOffMember) {
    // Venta puntual (RB-PAGO-005), fuera de cualquier suscripción.
    await prisma.payment.create({
      data: {
        id: id(),
        orgId,
        memberId: oneOffMember.id,
        amountCents: 1500,
        method: PaymentMethod.CASH,
        status: "PAID",
        date: TODAY,
        receiptNumber: `${receiptPrefix}-${receiptCounter++}`,
        notes: "Venta puntual: bono 5 sesiones sueltas",
        soldByUserId: sellerIds.length ? pick(sellerIds) : null,
      },
    });
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

  // ---------- Seguimiento y evolución (CC1-CC3) ----------
  // Serie de mediciones + fotos de seguimiento para los socios que han firmado
  // el consentimiento de imágenes. Las "fotos" son siluetas SVG generadas aquí
  // mismo (no hay ninguna persona real retratada ni material con derechos) y su
  // ancho de cintura/brazos sigue los datos de cada toma, así que el comparador
  // antes/después enseña un cambio real. El socio ancla se salta este bloque:
  // tiene su propia serie larga, con desglose Tanita, más abajo.
  const progressRows: Prisma.MemberProgressEntryCreateManyInput[] = [];
  for (const m of members) {
    if (m.isDemoAnchor || m.state === MemberState.PROSPECT) continue;
    if (!consentImagesByMember.get(m.id)) continue;
    const daysSinceJoin = Math.floor((TODAY.getTime() - m.joinedAt.getTime()) / DAY);
    if (daysSinceJoin < 45) continue;
    const takes = randInt(4, 7);
    const span = Math.min(daysSinceJoin, 150);
    // Punto de partida y mejora acumulada a lo largo de la serie.
    let weightKg = 60 + Math.random() * 32;
    let bodyFatPct = 20 + Math.random() * 15;
    let waistCm = 72 + Math.random() * 24;
    const stepW = (0.4 + Math.random() * 0.7) * (Math.random() < 0.82 ? 1 : -1);
    for (let k = 0; k < takes; k++) {
      const days = -Math.round(span - (span / (takes - 1)) * k);
      const measuredAt = addDays(TODAY, days);
      const isTanita = k === takes - 1 || k === 0;
      progressRows.push({
        id: id(),
        memberId: m.id,
        date: measuredAt,
        measuredAt: isTanita ? measuredAt : null,
        weightKg: Number(weightKg.toFixed(1)),
        bodyFatPct: Number(bodyFatPct.toFixed(1)),
        waistCm: Math.round(waistCm),
        muscleMassKg: Number((weightKg * (1 - bodyFatPct / 100) * 0.52).toFixed(1)),
        boneMassKg: Number((weightKg * 0.038).toFixed(1)),
        bodyWaterPct: Number((72 - bodyFatPct * 0.6).toFixed(1)),
        ...(isTanita
          ? {
              visceralFatRating: clamp(Math.round(bodyFatPct / 4), 1, 15),
              bmrKcal: Math.round(370 + 21.6 * weightKg * (1 - bodyFatPct / 100)),
              metabolicAge: clamp(Math.round(22 + bodyFatPct * 0.6), 18, 70),
              bmi: Number((weightKg / 1.72 ** 2).toFixed(1)),
              source: "TANITA" as const,
            }
          : { source: "MANUAL" as const }),
        photoFrontUrl: bodySilhouetteSvg({ view: "front", weightKg, bodyFatPct, waistCm }),
        photoSideUrl: bodySilhouetteSvg({ view: "side", weightKg, bodyFatPct, waistCm }),
        photoBackUrl: bodySilhouetteSvg({ view: "front", weightKg, bodyFatPct, waistCm }),
      });
      weightKg -= stepW;
      bodyFatPct -= stepW * 0.6;
      waistCm -= stepW * 0.9;
    }
  }
  for (let i = 0; i < progressRows.length; i += 500) {
    await prisma.memberProgressEntry.createMany({ data: progressRows.slice(i, i + 500) });
  }

  // ---------- Semáforo de Aptitud (G.2) ----------
  await prisma.aptitudeRule.createMany({
    data: APTITUDE_RULES.map((r) => ({ id: id(), orgId, injuryZone: r.injuryZone, blockArea: r.blockArea, light: r.light, adaptation: r.adaptation, editedByUserId: ownerId })),
  });

  // ---------- Rangos de referencia de composición corporal (CC2) ----------
  await prisma.referenceRange.createMany({
    data: [
      { metric: "bodyFatPct", sex: "M", min: 8, max: 19 },
      { metric: "bodyFatPct", sex: "F", min: 18, max: 28 },
      { metric: "bmi", sex: null, min: 18.5, max: 25 },
      { metric: "visceralFatRating", sex: null, min: 1, max: 9 },
      { metric: "bodyWaterPct", sex: "M", min: 50, max: 65 },
      { metric: "bodyWaterPct", sex: "F", min: 45, max: 60 },
    ].map((r) => ({ id: id(), orgId, editedByUserId: ownerId, ...r })),
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

  // ---------- RB-RRHH-005: panel del entrenador demo (Dani Herrero) ----------
  // El resto de la demo reparte trainerId/agenda al azar, lo que deja el nuevo
  // panel /trainer vacío o pobre según la suerte del run. Aquí se construyen a
  // propósito, para entrenador@trainingzone.es: agenda de hoy cubriendo toda
  // la franja horaria del centro, clientes de EP con historial real de
  // asistencia (adherencia + debriefs pendientes) y semáforo de aptitud en los
  // tres colores, y huecos de EP de la semana con tramos libres y reservados.
  if (cfg.slug === "training-zone") {
    const daniTrainer = staffUsers.find((u) => u.email === "entrenador@trainingzone.es");
    const daniCenterKey = cfg.staff.find((s) => s.email === "entrenador@trainingzone.es")?.centerKey ?? null;
    const daniCenterId = daniCenterKey ? centerIdByKey.get(daniCenterKey) : undefined;
    if (daniTrainer && daniCenterId) {
      // Agenda de hoy: una sesión ya generada por franja horaria del centro
      // pasa a ser suya, para que la línea de tiempo tenga contenido repartido
      // por la mañana y la tarde entre a la hora que se entre a la demo.
      const todayDaniByHour = new Map<string, (typeof sessions)[number]>();
      for (const s of sessions) {
        if (s.centerId !== daniCenterId || s.date.getTime() !== TODAY.getTime() || s.name.includes("(cancelada)")) continue;
        if (!todayDaniByHour.has(s.startTime)) todayDaniByHour.set(s.startTime, s);
      }
      const daniTodaySessionIds = [...todayDaniByHour.values()].map((s) => s.id);
      if (daniTodaySessionIds.length) {
        await prisma.classSession.updateMany({ where: { id: { in: daniTodaySessionIds } }, data: { trainerId: daniTrainer.id } });
      }

      // Si el reparto aleatorio de plantillas ha dejado la agenda de hoy floja
      // (según qué día de la semana caiga el seed), se completan franjas de
      // clase típicas para que la línea de tiempo tenga un recorrido completo
      // de mañana a noche, con socios reales de "centro" apuntados.
      const AGENDA_HOURS = [6, 12, 15, 16, 20];
      const GROUP_CLASS_TYPES = CLASS_TYPES.filter((c) => c !== "Personal Training");
      const missingHours = AGENDA_HOURS.filter((h) => !todayDaniByHour.has(fmtTime(h)));
      // Solo socios de bono de grupo: quien tiene EP entrena 1:1, no en clase.
      const daniCenterActiveMemberIds = members
        .filter((m) => m.centerId === daniCenterId && m.state === MemberState.ACTIVE && !m.planKey.startsWith("ep"))
        .map((m) => m.id);
      const fillCount = Math.max(0, 5 - daniTodaySessionIds.length);
      for (let i = 0; i < Math.min(fillCount, missingHours.length); i++) {
        const hour = missingHours[i];
        const classType = GROUP_CLASS_TYPES[i % GROUP_CLASS_TYPES.length];
        const fillSessionId = id();
        await prisma.classSession.create({
          data: {
            id: fillSessionId,
            orgId,
            centerId: daniCenterId,
            name: `${classType} ${fmtTime(hour)}`,
            classType,
            date: TODAY,
            startTime: fmtTime(hour),
            endTime: fmtTime(hour + 1),
            capacity: randInt(8, 12),
            room: "Sala Funcional",
            trainerId: daniTrainer.id,
            status: "SCHEDULED",
          },
        });
        const attendees = daniCenterActiveMemberIds.slice(i * 5, i * 5 + randInt(4, 8));
        if (attendees.length) {
          await prisma.booking.createMany({
            data: attendees.map((memberId) => ({ id: id(), sessionId: fillSessionId, memberId, status: BookingStatus.BOOKED, bookedAt: addDays(TODAY, -1) })),
          });
        }
      }

      const epWeekStart = startOfWeekMonday(new Date());
      const thisCalendarMonthStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

      type EpClientSpec = {
        firstName: string;
        lastName: string;
        emailLocal: string;
        weekday: number; // 1=lunes ... 6=sábado
        hour: number;
        planKey: DemoPlanKey;
        joinedAt: Date;
        weeksBack: number;
        noShowEvery: number; // cada cuántas sesiones falla (marca la adherencia)
        debriefEvery: number; // cada cuántas sesiones se queda sin debrief (pendientes)
        health?: { zone: string; desc: string; severity: HealthSeverity };
        note?: string;
        futureBooking: boolean;
      };
      const epClientSpecs: EpClientSpec[] = [
        {
          firstName: "Nacho",
          lastName: "Bermejo",
          emailLocal: "nacho.bermejo.demo",
          weekday: 2,
          hour: 18,
          planKey: "ep8",
          joinedAt: addDays(thisCalendarMonthStart, randInt(0, Math.max(0, TODAY.getDate() - 2))),
          weeksBack: 2,
          noShowEvery: 9,
          debriefEvery: 5,
          note: "Recién llegado de EP, viene con muchas ganas.",
          futureBooking: true,
        },
        {
          firstName: "Silvia",
          lastName: "Cortés",
          emailLocal: "silvia.cortes.demo",
          weekday: 3,
          hour: 9,
          planKey: "ep8",
          joinedAt: addDays(TODAY, -(8 * 7 + randInt(3, 10))),
          weeksBack: 8,
          noShowEvery: 4,
          debriefEvery: 3,
          health: { zone: "muñeca derecha", desc: "Lesión: muñeca derecha, sobrecarga muscular", severity: HealthSeverity.MEDIUM },
          note: "Usa muñequeras en empuje; ir progresiva con la carga.",
          futureBooking: true,
        },
        {
          firstName: "Bruno",
          lastName: "Casals",
          emailLocal: "bruno.casals.demo",
          weekday: 4,
          hour: 19,
          planKey: "ep12",
          joinedAt: addDays(TODAY, -(9 * 7 + randInt(3, 10))),
          weeksBack: 9,
          noShowEvery: 2,
          debriefEvery: 6,
          health: { zone: "rodilla derecha", desc: "Lesión: rodilla derecha, esguince leve", severity: HealthSeverity.HIGH },
          note: "Ha faltado varias veces seguidas — hacer seguimiento.",
          futureBooking: false,
        },
        {
          firstName: "Irene",
          lastName: "Salcedo",
          emailLocal: "irene.salcedo.demo",
          weekday: 5,
          hour: 10,
          planKey: "ep4",
          joinedAt: addDays(TODAY, -(12 * 7 + randInt(3, 10))),
          weeksBack: 12,
          noShowEvery: 8,
          debriefEvery: 4,
          note: "Muy motivada, objetivo puesto en una carrera en primavera.",
          futureBooking: true,
        },
        {
          firstName: "Teo",
          lastName: "Vallejo",
          emailLocal: "teo.vallejo.demo",
          weekday: 1,
          hour: 20,
          planKey: "ep12",
          joinedAt: addDays(TODAY, -(11 * 7 + randInt(3, 10))),
          weeksBack: 11,
          noShowEvery: 6,
          debriefEvery: 3,
          futureBooking: true,
        },
      ];

      for (const spec of epClientSpecs) {
        const plan = plansByKey[spec.planKey];
        const memberId = id();
        await prisma.member.create({
          data: {
            id: memberId,
            orgId,
            primaryCenterId: daniCenterId,
            firstName: spec.firstName,
            lastName: spec.lastName,
            email: `${spec.emailLocal}@example.com`,
            phone: faker.phone.number({ style: "national" }),
            birthDate: faker.date.birthdate({ min: 20, max: 60, mode: "age" }),
            state: MemberState.ACTIVE,
            joinedAt: spec.joinedAt,
            trainerId: daniTrainer.id,
            notes: spec.note ?? null,
            consentContract: true,
            consentHealth: true,
            consentImages: false,
            consentMarketing: true,
            consentContractAt: spec.joinedAt,
            consentHealthAt: spec.joinedAt,
            consentMarketingAt: spec.joinedAt,
            postalCode: weightedPick(MEMBER_POSTAL_CODES),
            occupation: pick(OCCUPATIONS),
            sex: pick([Sex.FEMALE, Sex.MALE]),
          },
        });
        await prisma.subscription.create({
          data: {
            id: id(),
            memberId,
            planId: plan.id,
            startDate: spec.joinedAt,
            endDate: null,
            status: SubscriptionStatus.ACTIVE,
            priceCents: plan.priceCents,
            sessionsRemaining: plan.sessionsIncluded ? Math.max(3, Math.round(plan.sessionsIncluded * 0.5)) : null,
          },
        });

        if (spec.health) {
          await prisma.healthRecord.create({
            data: {
              id: id(),
              memberId,
              type: HealthRecordType.INJURY,
              zone: spec.health.zone,
              description: spec.health.desc,
              severity: spec.health.severity,
              status: HealthStatus.ACTIVE,
              reportedByUserId: daniTrainer.id,
              reportedAt: addDays(spec.joinedAt, 14),
              consentSignedAt: spec.joinedAt,
            },
          });
        }

        // Historial semanal de sesiones 1:1 ya pasadas: asistencia + debriefs.
        let realizedCount = 0;
        for (let w = spec.weeksBack; w >= 1; w--) {
          const sessionDate = addDays(epWeekStart, -(w - 1) * 7 + (spec.weekday - 1));
          if (sessionDate < spec.joinedAt || sessionDate >= TODAY) continue;
          realizedCount++;
          const sessionId = id();
          await prisma.classSession.create({
            data: {
              id: sessionId,
              orgId,
              centerId: daniCenterId,
              name: `Personal Training ${fmtTime(spec.hour)}`,
              classType: "Personal Training",
              date: sessionDate,
              startTime: fmtTime(spec.hour),
              endTime: fmtTime(spec.hour + 1),
              capacity: 1,
              room: "Sala 2",
              trainerId: daniTrainer.id,
              status: "SCHEDULED",
            },
          });
          const isNoShow = realizedCount % spec.noShowEvery === 0;
          const bookingId = id();
          let checkedInAt: Date | null = null;
          if (!isNoShow) {
            checkedInAt = new Date(sessionDate);
            checkedInAt.setHours(spec.hour, randInt(-3, 5));
          }
          await prisma.booking.create({
            data: {
              id: bookingId,
              sessionId,
              memberId,
              status: isNoShow ? BookingStatus.NO_SHOW : BookingStatus.ATTENDED,
              bookedAt: addDays(sessionDate, -2),
              checkedInAt,
            },
          });
          if (!isNoShow && realizedCount % spec.debriefEvery !== 0) {
            await prisma.sessionDebrief.create({
              data: {
                id: id(),
                bookingId,
                feeling: weightedPick<DebriefFeeling>([[DebriefFeeling.GREEN, 70], [DebriefFeeling.AMBER, 22], [DebriefFeeling.RED, 8]]),
                rpe: randInt(5, 9),
                note: null,
              },
            });
          }
        }

        // Próxima cita reservada (esta semana o la siguiente si ya ha pasado).
        if (spec.futureBooking) {
          const thisWeekDate = addDays(epWeekStart, spec.weekday - 1);
          const futureDate = thisWeekDate >= TODAY ? thisWeekDate : addDays(thisWeekDate, 7);
          const futureSessionId = id();
          await prisma.classSession.create({
            data: {
              id: futureSessionId,
              orgId,
              centerId: daniCenterId,
              name: `Personal Training ${fmtTime(spec.hour)}`,
              classType: "Personal Training",
              date: futureDate,
              startTime: fmtTime(spec.hour),
              endTime: fmtTime(spec.hour + 1),
              capacity: 1,
              room: "Sala 2",
              trainerId: daniTrainer.id,
              selfBookable: true,
              status: "SCHEDULED",
            },
          });
          await prisma.booking.create({
            data: { id: id(), sessionId: futureSessionId, memberId, status: BookingStatus.BOOKED, bookedAt: addDays(TODAY, -1) },
          });
        }
      }

      // Huecos de EP libres (sin reservar) repartidos por la semana, para que
      // el gráfico de barras muestre tramos libres además de los reservados.
      const freeSlotWeekdays = [2, 3, 4, 5, 6]; // martes .. sábado
      for (const wd of freeSlotWeekdays) {
        await prisma.classSession.create({
          data: {
            id: id(),
            orgId,
            centerId: daniCenterId,
            name: `Personal Training ${fmtTime(11)}`,
            classType: "Personal Training",
            date: addDays(epWeekStart, wd - 1),
            startTime: fmtTime(11),
            endTime: fmtTime(12),
            capacity: 1,
            room: "Sala 2",
            trainerId: daniTrainer.id,
            selfBookable: true,
            status: "SCHEDULED",
          },
        });
      }

      // Huecos de EP ya reservados esta misma semana natural (no dependen de
      // si el día ya ha pasado dentro de la semana — el gráfico de barras no
      // filtra por fecha futura, solo por semana), para que el contraste
      // reservado/libre se vea siempre, caiga el seed el día que caiga.
      const epMemberPool = trainerAssignments
        .filter((t) => members.find((m) => m.id === t.memberId)?.centerId === daniCenterId)
        .map((t) => t.memberId);
      const reservedSlots = [
        { weekday: 1, hour: 15 },
        { weekday: 3, hour: 15 },
        { weekday: 5, hour: 15 },
      ];
      for (let i = 0; i < reservedSlots.length; i++) {
        const bookMemberId = epMemberPool[i % Math.max(1, epMemberPool.length)];
        if (!bookMemberId) break;
        const reservedSessionId = id();
        await prisma.classSession.create({
          data: {
            id: reservedSessionId,
            orgId,
            centerId: daniCenterId,
            name: `Personal Training ${fmtTime(reservedSlots[i].hour)}`,
            classType: "Personal Training",
            date: addDays(epWeekStart, reservedSlots[i].weekday - 1),
            startTime: fmtTime(reservedSlots[i].hour),
            endTime: fmtTime(reservedSlots[i].hour + 1),
            capacity: 1,
            room: "Sala 2",
            trainerId: daniTrainer.id,
            selfBookable: true,
            status: "SCHEDULED",
          },
        });
        await prisma.booking.create({
          data: { id: id(), sessionId: reservedSessionId, memberId: bookMemberId, status: BookingStatus.BOOKED, bookedAt: addDays(TODAY, -3) },
        });
      }
    }
  }

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
      postalCode: pick(LEAD_POSTAL_CODES),
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
      postalCode: pick(LEAD_POSTAL_CODES),
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
      postalCode: pick(LEAD_POSTAL_CODES),
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
      postalCode: pick(LEAD_POSTAL_CODES),
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
            postalCode: pick(LEAD_POSTAL_CODES),
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

  // ---------- F16: IA (rutinas), valoraciones y chat — foco en el socio demo ----------
  if (cfg.demoMember && demoMemberId && demoMemberUserId) {
    const demoCenterId = centerIdByKey.get(cfg.demoMember.centerKey)!;
    const demoTrainer = trainersByCenter[demoCenterId]?.[0];
    await prisma.member.update({ where: { id: demoMemberId }, data: { trainerId: demoTrainer?.id, heightCm: 170 } });

    // FB-2: un par de sesiones recientes ya asistidas y sin valorar, para que "Mi
    // plan" del socio demo muestre valoraciones pendientes (slider F16) nada más entrar.
    const pendingRatingSessions = [
      { daysAgo: 1, hour: 9, classType: "Funcional" },
      { daysAgo: 0, hour: 8, classType: "Fuerza" },
    ];
    for (const s of pendingRatingSessions) {
      const sessionDate = addDays(TODAY, -s.daysAgo);
      sessionDate.setHours(0, 0, 0, 0);
      const pendingSessionId = id();
      await prisma.classSession.create({
        data: {
          id: pendingSessionId,
          orgId,
          centerId: demoCenterId,
          name: `${s.classType} ${fmtTime(s.hour)}`,
          classType: s.classType,
          date: sessionDate,
          startTime: fmtTime(s.hour),
          endTime: fmtTime(s.hour + 1),
          capacity: 12,
          room: "Sala Funcional",
          trainerId: demoTrainer?.id ?? null,
          status: "SCHEDULED",
        },
      });
      const checkedInAt = new Date(sessionDate);
      checkedInAt.setHours(s.hour, randInt(0, 5));
      await prisma.booking.create({
        data: {
          id: id(),
          sessionId: pendingSessionId,
          memberId: demoMemberId,
          status: "ATTENDED",
          bookedAt: addDays(sessionDate, -2),
          checkedInAt,
        },
      });
    }

    // Fotos, evolución y composición corporal (F9/CC1-CC3): consentimiento de imágenes y de
    // salud ya firmados (ver arriba). 9 tomas a lo largo de ~5 meses (portal del socio +
    // ficha del entrenador necesitan una serie larga para que las gráficas de evolución y el
    // comparador antes/después se vean con datos reales en la demo). Las tomas Tanita
    // (docs/COMPOSICION_CORPORAL_TANITA.md) llegan "importadas" con desglose segmental para
    // poder demostrar ese flujo en el seed.
    await prisma.memberProgressEntry.createMany({
      data: [
        { days: -150, weightKg: 72.6, bodyFatPct: 30.8, waistCm: 90, muscleMassKg: 21.9, boneMassKg: 2.5, bodyWaterPct: 51.4, source: "MANUAL" },
        { days: -120, weightKg: 71.0, bodyFatPct: 29.6, waistCm: 88, muscleMassKg: 22.4, boneMassKg: 2.5, bodyWaterPct: 52.1, source: "MANUAL" },
        {
          days: -95,
          weightKg: 69.8,
          bodyFatPct: 28.7,
          waistCm: 86,
          muscleMassKg: 23.0,
          boneMassKg: 2.6,
          bodyWaterPct: 52.8,
          visceralFatRating: 6,
          bmrKcal: 1350,
          metabolicAge: 34,
          bmi: 24.1,
          source: "TANITA",
          segmental: { fatPct: { trunk: 30.4, armLeft: 21.8, armRight: 21.1, legLeft: 24.6, legRight: 23.9 }, muscleKg: { trunk: 12.1, armLeft: 1.7, armRight: 1.75, legLeft: 3.7, legRight: 3.75 }, muscleQuality: {} },
        },
        { days: -75, weightKg: 69.1, bodyFatPct: 28.0, waistCm: 85, muscleMassKg: 23.3, boneMassKg: 2.6, bodyWaterPct: 53.2, source: "MANUAL" },
        { days: -60, weightKg: 68.4, bodyFatPct: 27.5, waistCm: 82, muscleMassKg: 24.1, boneMassKg: 2.6, bodyWaterPct: 54.2, source: "MANUAL" },
        {
          days: -45,
          weightKg: 67.8,
          bodyFatPct: 26.9,
          waistCm: 81,
          muscleMassKg: 24.4,
          boneMassKg: 2.6,
          bodyWaterPct: 54.6,
          visceralFatRating: 5,
          bmrKcal: 1370,
          metabolicAge: 32,
          bmi: 23.5,
          source: "TANITA",
          segmental: { fatPct: { trunk: 28.6, armLeft: 20.3, armRight: 19.7, legLeft: 23.2, legRight: 22.5 }, muscleKg: { trunk: 12.7, armLeft: 1.82, armRight: 1.86, legLeft: 3.95, legRight: 3.98 }, muscleQuality: {} },
        },
        { days: -30, weightKg: 67.1, bodyFatPct: 26.1, waistCm: 80, muscleMassKg: 24.8, boneMassKg: 2.6, bodyWaterPct: 55.0, source: "MANUAL" },
        { days: -14, weightKg: 66.4, bodyFatPct: 25.3, waistCm: 79, muscleMassKg: 25.2, boneMassKg: 2.7, bodyWaterPct: 55.6, source: "MANUAL" },
        {
          days: -3,
          weightKg: 65.8,
          bodyFatPct: 24.6,
          waistCm: 78,
          muscleMassKg: 25.6,
          boneMassKg: 2.7,
          bodyWaterPct: 56.1,
          visceralFatRating: 4,
          bmrKcal: 1390,
          metabolicAge: 29,
          bmi: 22.9,
          source: "TANITA",
          segmental: { fatPct: { trunk: 27.1, armLeft: 19.2, armRight: 18.6, legLeft: 22.4, legRight: 21.3 }, muscleKg: { trunk: 13.2, armLeft: 1.9, armRight: 1.95, legLeft: 4.1, legRight: 4.15 }, muscleQuality: {} },
        },
      ].map(({ days, ...fields }) => {
        const { weightKg, bodyFatPct, waistCm, ...composition } = fields;
        const measuredAt = addDays(TODAY, days);
        return {
          id: id(),
          memberId: demoMemberId,
          date: measuredAt,
          measuredAt: composition.source === "TANITA" ? measuredAt : null,
          weightKg,
          bodyFatPct,
          waistCm,
          ...composition,
          photoFrontUrl: bodySilhouetteSvg({ view: "front", weightKg, bodyFatPct, waistCm }),
          photoSideUrl: bodySilhouetteSvg({ view: "side", weightKg, bodyFatPct, waistCm }),
          photoBackUrl: bodySilhouetteSvg({ view: "front", weightKg, bodyFatPct, waistCm }),
        };
      }),
    });

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

    // Conversation.memberId es @unique: con upsert este bloque aguanta que la
    // fila ya exista (relanzar el seed sobre una limpieza incompleta, o dos
    // pasadas sobre la misma base) en vez de romper con P2002.
    const conversation = await prisma.conversation.upsert({
      where: { memberId: demoMemberId },
      update: {},
      create: { orgId, memberId: demoMemberId },
    });
    await prisma.chatMessage.deleteMany({ where: { conversationId: conversation.id } });
    await prisma.chatMessage.createMany({
      data: [
        { id: id(), conversationId: conversation.id, senderKind: "TRAINER", senderUserId: demoTrainer?.id ?? null, body: "¡Hola! ¿Qué tal la rodilla esta semana?", createdAt: addDays(TODAY, -2) },
        { id: id(), conversationId: conversation.id, senderKind: "MEMBER", senderUserId: demoMemberUserId, body: "Mucho mejor, gracias. Ya sin molestias.", createdAt: addDays(TODAY, -2) },
        { id: id(), conversationId: conversation.id, senderKind: "AI", senderUserId: null, body: "Recuerda tu sesión de mañana a las 09:00 — ¡nos vemos!", createdAt: addDays(TODAY, -1) },
      ],
    });
  }

  // ---------- Feedback: contraste cliente vs. debrief del entrenador ----------
  // Página "Feedback" de Dirección (contraste de percepciones). Repartimos un
  // puñado de socios activos entre las 4 categorías de alineación (RB de la
  // página): punto ciego (el entrenador sobrestima), alineado, cliente +
  // positivo, y sin feedback todavía — para que el tablero muestre las 4
  // situaciones desde el primer arranque de la demo.
  {
    const trainerByMember = new Map(trainerAssignments.map((t) => [t.memberId, t.trainerId]));
    const activeMembersForFeedback = members.filter((m) => m.state === MemberState.ACTIVE);

    type FeedbackScenario = "ciego" | "alineado" | "cliente_positivo" | "sin_feedback";
    const scenarioPattern: FeedbackScenario[] = ["ciego", "alineado", "cliente_positivo", "sin_feedback", "alineado", "ciego"];
    const NOTES_BY_SCENARIO: Record<FeedbackScenario, string> = {
      ciego: "Sesión muy sólida técnicamente, se le ve con buena energía y cumple el plan sin problema.",
      alineado: "Buen ritmo, cumple el plan y se nota motivado/a. Todo en orden.",
      cliente_positivo: "Progresa despacio pero de forma constante; seguimos ajustando cargas poco a poco.",
      sin_feedback: "Sesión correcta, sin incidencias. Pendiente de que conteste la encuesta de satisfacción.",
    };
    const COMMENT_BY_SCENARIO: Record<Exclude<FeedbackScenario, "sin_feedback">, string> = {
      ciego: "La verdad es que últimamente vengo más por costumbre, no sé si le estoy sacando partido.",
      alineado: "Todo bien, contento con el plan y el trato del entrenador.",
      cliente_positivo: "Estoy muy contento, noto que voy mejorando semana a semana.",
    };

    // El socio ancla de la demo (Marta) es el caso de "punto ciego" principal
    // del handoff, para poder enseñarlo nada más entrar con dirección.
    const feedbackCandidates = activeMembersForFeedback.filter((m) => m.id !== demoMemberId).slice(0, 17);
    const anchor = demoMemberId ? activeMembersForFeedback.find((m) => m.id === demoMemberId) : undefined;
    if (anchor) feedbackCandidates.unshift(anchor);

    const clientFeedbackRows: ({ id: string; memberId: string; comment: string; submittedAt: Date } & FeedbackDims)[] = [];
    const trainerDebriefRows: ({ id: string; memberId: string; trainerId: string; note: string; debriefAt: Date } & FeedbackDims)[] = [];

    feedbackCandidates.forEach((m, i) => {
      const scenario = m.id === demoMemberId ? "ciego" : scenarioPattern[i % scenarioPattern.length];
      const trainerId = trainerByMember.get(m.id) ?? trainersByCenter[m.centerId]?.[0]?.id;
      if (!trainerId) return;

      const debriefAt = addDays(TODAY, -randInt(1, 6));
      let trainer: FeedbackDims;
      let client: FeedbackDims | null;
      switch (scenario) {
        case "ciego":
          trainer = { sat: randInt(7, 8), prog: randInt(6, 8), adher: randInt(6, 8), motiv: randInt(7, 8), esf: randInt(6, 8) };
          client = { sat: randInt(3, 4), prog: randInt(4, 5), adher: randInt(4, 5), motiv: randInt(3, 5), esf: randInt(5, 6) };
          break;
        case "cliente_positivo":
          trainer = { sat: randInt(5, 6), prog: randInt(5, 6), adher: randInt(5, 6), motiv: randInt(5, 6), esf: randInt(5, 6) };
          client = { sat: randInt(8, 9), prog: randInt(7, 9), adher: randInt(8, 9), motiv: randInt(8, 9), esf: randInt(7, 9) };
          break;
        case "sin_feedback":
          trainer = { sat: randInt(6, 8), prog: randInt(6, 8), adher: randInt(6, 8), motiv: randInt(6, 8), esf: randInt(6, 8) };
          client = null;
          break;
        case "alineado":
        default:
          trainer = { sat: randInt(7, 8), prog: randInt(7, 8), adher: randInt(7, 8), motiv: randInt(7, 8), esf: randInt(7, 8) };
          client = { sat: randInt(7, 8), prog: randInt(6, 8), adher: randInt(6, 8), motiv: randInt(7, 8), esf: randInt(6, 8) };
          break;
      }

      trainerDebriefRows.push({ id: id(), memberId: m.id, trainerId, ...trainer, note: NOTES_BY_SCENARIO[scenario], debriefAt });

      if (client) {
        clientFeedbackRows.push({
          id: id(),
          memberId: m.id,
          ...client,
          comment: COMMENT_BY_SCENARIO[scenario as Exclude<FeedbackScenario, "sin_feedback">],
          submittedAt: addDays(debriefAt, -randInt(0, 1)),
        });
      }
    });

    await prisma.trainerDebrief.createMany({ data: trainerDebriefRows });
    await prisma.clientFeedback.createMany({ data: clientFeedbackRows });
  }

  // ---------- D.1: Anuncios y banners del Dashboard del socio ----------
  const directorForAnnouncements = staffUsers.find((u) => u.role === "CENTER_DIRECTOR") ?? staffUsers.find((u) => u.role === "OWNER");
  await prisma.announcement.createMany({
    data: [
      {
        id: id(),
        orgId,
        centerId: null, // global
        title: "Quedada del club de running + desayuno",
        body: "Este sábado a las 9:00 nos vemos en la puerta para una salida suave de 5 km por la ribera del Ebro y desayuno después. ¡Apúntate en recepción!",
        imageUrl: stockPhoto("running"),
        category: "EVENT",
        audience: "ALL",
        tags: ["running", "club", "quedada"],
        pinned: true,
        startsAt: addDays(TODAY, -2),
        endsAt: addDays(TODAY, 6),
        createdById: directorForAnnouncements?.id ?? null,
      },
      {
        id: id(),
        orgId,
        centerId: null,
        title: "Promo: 20% en tu bono de 12 sesiones",
        body: "Durante todo el mes, renueva cualquier bono de 12 sesiones — Grupos reducidos o Entrenamiento personal — y llévate un 20% de descuento. Consulta condiciones en recepción.",
        imageUrl: stockPhoto("gym-weights"),
        category: "PROMO",
        audience: "MEMBERS",
        tags: ["promoción", "bonos"],
        pinned: false,
        startsAt: null,
        endsAt: addDays(TODAY, 20),
        createdById: directorForAnnouncements?.id ?? null,
      },
      {
        id: id(),
        orgId,
        centerId: null,
        title: "Nueva clase de Movilidad los sábados a las 11:00",
        body: "Añadimos una sesión de movilidad para cerrar la semana: trabajo de cadera, zona lumbar y hombro. Plazas limitadas, reserva desde la app.",
        imageUrl: stockPhoto("mobility-stretch"),
        category: "NEWS",
        audience: "ALL",
        tags: ["movilidad", "horario", "novedad"],
        pinned: false,
        startsAt: null,
        endsAt: null,
        createdById: directorForAnnouncements?.id ?? null,
      },
      // Uno por centro, para que el filtrado por centro se vea en la demo.
      ...centersData.map((c, i) =>
        i === 0
          ? {
              id: id(),
              orgId,
              centerId: c.id,
              title: `${c.name}: sala funcional cerrada el jueves por mantenimiento`,
              body: "El jueves de 14:00 a 16:00 la sala funcional estará cerrada por mantenimiento. Las clases de tarde se mantienen con normalidad.",
              imageUrl: stockPhoto("gym-empty"),
              category: "ALERT" as const,
              audience: "ALL" as const,
              tags: ["horario", "mantenimiento"],
              pinned: false,
              startsAt: null,
              endsAt: null, // sin expiración
              createdById: directorForAnnouncements?.id ?? null,
            }
          : {
              id: id(),
              orgId,
              centerId: c.id,
              title: `${c.name}: jornada de puertas abiertas`,
              body: "El próximo viernes puedes traer a un acompañante gratis a tu clase de grupo. Avísanos en recepción para reservarle plaza.",
              imageUrl: stockPhoto("group-class"),
              category: "EVENT" as const,
              audience: "ALL" as const,
              tags: ["evento", "invitados"],
              pinned: false,
              startsAt: addDays(TODAY, -1),
              endsAt: addDays(TODAY, 12),
              createdById: directorForAnnouncements?.id ?? null,
            }
      ),
    ],
  });

  // ---------- D.2: Biblioteca de entrenamientos online ----------
  const onlineWorkoutsSeed = [
    { title: "Movilidad de cadera 15'", description: "Rutina guiada para soltar cadera y zona lumbar antes de entrenar.", category: "Movilidad", level: "Principiante", durationMin: 15 },
    { title: "HIIT sin material 20'", description: "Intervalos de alta intensidad para hacer en casa, solo peso corporal.", category: "HIIT", level: "Intermedio", durationMin: 20 },
    { title: "Fuerza tren superior 30'", description: "Sesión de empuje y tracción con mancuernas o bandas.", category: "Fuerza", level: "Intermedio", durationMin: 30 },
    { title: "Core y estabilidad 12'", description: "Trabajo anti-extensión y anti-rotación para un core fuerte.", category: "Core", level: "Principiante", durationMin: 12 },
    { title: "Full body avanzado 40'", description: "Circuito completo de cuerpo entero para días con más energía.", category: "Fuerza", level: "Avanzado", durationMin: 40 },
    { title: "Estiramientos post-entreno 10'", description: "Vuelta a la calma para mejorar recuperación y flexibilidad.", category: "Movilidad", level: "Principiante", durationMin: 10 },
  ];
  await prisma.onlineWorkout.createMany({
    data: onlineWorkoutsSeed.map((w, i) => ({
      id: id(),
      orgId,
      title: w.title,
      description: w.description,
      category: w.category,
      level: w.level,
      durationMin: w.durationMin,
      videoUrl: "https://www.youtube.com/results?search_query=" + encodeURIComponent(w.title),
      thumbnailUrl: null,
      publishedAt: addDays(TODAY, -i * 3),
    })),
  });

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

  // ---------- Coherencia final de la agenda ----------
  // La parrilla semanal nace sin solapes, pero varios bloques posteriores montan
  // sesiones a medida encima (panel del entrenador demo, huecos de EP, sesiones
  // pendientes de feedback del socio ancla) y pueden dejar al mismo entrenador
  // en dos sitios a la vez. En vez de cuadrar a mano cada hora — frágil en
  // cuanto se toque cualquiera de esos bloques — se pasa una revisión al final:
  // el solape se reasigna a un compañero libre del mismo centro. Así lo que se
  // ve en /agenda siempre cuadra con lo que se ve en la ficha del entrenador.
  const scheduled = await prisma.classSession.findMany({
    where: { orgId, status: "SCHEDULED", trainerId: { not: null } },
    select: { id: true, centerId: true, date: true, startTime: true, endTime: true, trainerId: true, classType: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  // El 1:1 va primero: un cliente de EP entrena con SU entrenador, así que si
  // hay choque es la clase de grupo la que se cubre con un compañero.
  const allSessions = [
    ...scheduled.filter((s) => s.classType === "Personal Training"),
    ...scheduled.filter((s) => s.classType !== "Personal Training"),
  ];
  const busyByTrainer = new Map<string, { from: number; to: number }[]>();
  const asMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const fixes: { id: string; trainerId: string | null }[] = [];
  for (const s of allSessions) {
    const dayKey = s.date.toISOString().slice(0, 10);
    const from = asMin(s.startTime);
    const to = asMin(s.endTime);
    const free = (trainerId: string) =>
      !(busyByTrainer.get(`${trainerId}|${dayKey}`) ?? []).some((b) => from < b.to && b.from < to);
    const occupy = (trainerId: string) => {
      const key = `${trainerId}|${dayKey}`;
      busyByTrainer.set(key, [...(busyByTrainer.get(key) ?? []), { from, to }]);
    };
    if (free(s.trainerId!)) {
      occupy(s.trainerId!);
      continue;
    }
    const stand = (trainersByCenter[s.centerId] ?? []).find((t) => t.id !== s.trainerId && free(t.id));
    if (stand) {
      occupy(stand.id);
      fixes.push({ id: s.id, trainerId: stand.id });
    } else {
      // Sin nadie libre, la sesión se queda sin entrenador antes que mentir.
      fixes.push({ id: s.id, trainerId: null });
    }
  }
  for (const f of fixes) {
    await prisma.classSession.update({ where: { id: f.id }, data: { trainerId: f.trainerId } });
  }

  // ---------- Reservas futuras: cuadrar con las reglas de reserva ----------
  // Las reservas se generan recorriendo las franjas preferidas de cada socio a
  // lo largo de TODO el horizonte sembrado (60 días), pero el socio solo puede
  // reservar a 7 días vista (RB-RES-002) y con un máximo de 3 reservas activas
  // (RB-RES-004). Sin este ajuste el socio demo arrancaba con ~10 reservas
  // futuras: en su portal solo veía la que caía dentro de los 7 días y, al
  // intentar reservar otra, la app le respondía que ya tenía 3 activas.
  // Además se enlaza cada reserva viva con el bono del que salió, para que
  // cancelarla devuelva la sesión al saldo (RB-RES-006).
  const bookingWindowEnd = addDays(TODAY, 7);
  // Desde la BD, no desde los arrays en memoria: los clientes de EP de la demo
  // y sus bonos se crean aparte, y también tienen reservas futuras.
  const orgMembers = await prisma.member.findMany({ where: { orgId }, select: { id: true } });
  const orgActiveSubs = await prisma.subscription.findMany({
    where: { status: SubscriptionStatus.ACTIVE, member: { orgId } },
    select: { id: true, memberId: true, sessionsRemaining: true },
    orderBy: { startDate: "desc" },
  });
  const activeSubByMember = new Map(orgActiveSubs.map((s) => [s.memberId, s]));
  let prunedFutureBookings = 0;
  for (const { id: memberId } of orgMembers) {
    const live = await prisma.booking.findMany({
      where: {
        memberId,
        status: { in: [BookingStatus.BOOKED, BookingStatus.WAITLISTED] },
        session: { date: { gte: TODAY }, status: "SCHEDULED" },
      },
      select: { id: true, session: { select: { date: true, startTime: true, classType: true } } },
      orderBy: { session: { date: "asc" } },
    });

    const keep: string[] = [];
    const drop: string[] = [];
    for (const b of live) {
      const outOfWindow = b.session.date > bookingWindowEnd;
      if (outOfWindow || keep.length >= 3) drop.push(b.id);
      else keep.push(b.id);
    }
    if (drop.length) {
      await prisma.booking.deleteMany({ where: { id: { in: drop } } });
      prunedFutureBookings += drop.length;
    }

    // Solo los bonos por sesiones descuentan saldo; la cuota mensual/ilimitada no.
    const sub = activeSubByMember.get(memberId);
    if (sub?.sessionsRemaining != null && keep.length) {
      const groupBookingIds = live
        .filter((b) => keep.includes(b.id) && b.session.classType !== "Personal Training")
        .map((b) => b.id);
      if (groupBookingIds.length) {
        await prisma.booking.updateMany({ where: { id: { in: groupBookingIds } }, data: { subscriptionId: sub.id } });
      }
    }
  }

  console.log(
    `[${cfg.name}] ${centersData.length} centros · ${staffUsers.length} personal · ${memberships.length} imputaciones · ${members.length} socios · ${sessions.length} sesiones · ${bookings.length} reservas (${prunedFutureBookings} futuras podadas fuera de ventana/tope) · ${payments.length} pagos · ${healthRecords.length} salud · ${noteRows.length} notas · ${retentionAlerts.length} alertas · ${fixes.length} solapes corregidos`
  );
}

const ORGS: OrgSeedConfig[] = [
  {
    name: "TRAINING ZONE",
    slug: "training-zone",
    logoUrl: "/brand/tz-logo-black.png",
    historyDays: 210,
    futureDays: 60,
    centers: [
      // La Jota genera 5 socios aleatorios porque recibe además los 5 clientes
      // de EP construidos a medida para el panel del entrenador demo (ver
      // RB-RRHH-005 más abajo): 5 + 5 = los 10 socios del centro.
      { key: "lajota", name: "TRAINING ZONE La Jota", slug: "la-jota", address: "Av. de Cataluña 42, Zaragoza", capacityRange: [8, 12], memberCount: 5 },
      { key: "puertacarmen", name: "TRAINING ZONE Puerta del Carmen", slug: "puerta-del-carmen", address: "Paseo Pamplona 15, Zaragoza", capacityRange: [8, 12], memberCount: 10 },
    ],
    // Un único director de organización (OWNER, rol más alto), un director por
    // centro y tres entrenadores por centro. Recepción, RRHH y admin de
    // plataforma se mantienen porque sin ellos esos módulos no tienen con quién
    // demostrarse.
    staff: [
      { name: "Sergio Martín", email: "sergio@trainingzone.es", role: "OWNER", centerKey: null },
      { name: "Beatriz Ruiz", email: "direccion.lajota@trainingzone.es", role: "CENTER_DIRECTOR", centerKey: "lajota" },
      { name: "Rubén Castillo", email: "direccion.puertacarmen@trainingzone.es", role: "CENTER_DIRECTOR", centerKey: "puertacarmen" },
      { name: "Dani Herrero", email: "entrenador@trainingzone.es", role: "TRAINER", centerKey: "lajota" },
      { name: "Laura Gimeno", email: "laura.gimeno@trainingzone.es", role: "TRAINER", centerKey: "lajota" },
      { name: "Marcos Iglesias", email: "marcos.iglesias@trainingzone.es", role: "TRAINER", centerKey: "lajota" },
      { name: "Elena Vidal", email: "elena.vidal@trainingzone.es", role: "TRAINER", centerKey: "puertacarmen" },
      { name: "Javier Soto", email: "javier.soto@trainingzone.es", role: "TRAINER", centerKey: "puertacarmen" },
      { name: "Sara Ortiz", email: "sara.ortiz@trainingzone.es", role: "TRAINER", centerKey: "puertacarmen" },
      { name: "Ana Cabrera", email: "recepcion.lajota@trainingzone.es", role: "RECEPTION", centerKey: "lajota" },
      { name: "Óscar Bravo", email: "recepcion.puertacarmen@trainingzone.es", role: "RECEPTION", centerKey: "puertacarmen" },
      { name: "Cristina Molina", email: "rrhh@trainingzone.es", role: "HR_MANAGER", centerKey: null },
      { name: "Piensaenweb Admin", email: "admin@piensaenweb.dev", role: "PLATFORM_ADMIN", centerKey: null },
    ],
    extraImputaciones: [
      { email: "entrenador@trainingzone.es", centerKey: "puertacarmen", role: "TRAINER", allocationPct: 40, primaryAllocationPct: 60 },
    ],
    demoMember: { email: "socio@trainingzone.es", firstName: "Marta", lastName: "García López", centerKey: "lajota", planKey: "group12" },
  },
];

async function main() {
  console.log("Limpiando base de datos...");
  await prisma.$transaction([
    prisma.chatMessage.deleteMany(),
    prisma.announcementView.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.onlineWorkout.deleteMany(),
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
    prisma.memberProgressEntry.deleteMany(),
    prisma.clientFeedback.deleteMany(),
    prisma.trainerDebrief.deleteMany(),
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
    prisma.referenceRange.deleteMany(),
    // Lead <-> Member forman un ciclo de FKs (Lead.convertedMemberId / Member.originLeadId):
    // se rompe el ciclo antes de poder borrar cualquiera de las dos tablas.
    prisma.member.updateMany({ data: { originLeadId: null } }),
    prisma.lead.updateMany({ data: { convertedMemberId: null } }),
    prisma.lead.deleteMany(),
    prisma.leadChannel.deleteMany(),
    prisma.noCloseReason.deleteMany(),
    // Invitation referencia orgId/userId/memberId (RESTRICT): debe borrarse
    // antes de Member/User/Organization o la limpieza falla por FK.
    prisma.invitation.deleteMany(),
    prisma.member.deleteMany(),
    prisma.membershipPlan.deleteMany(),
    prisma.user.deleteMany(),
    prisma.center.deleteMany(),
    // StripeAccount referencia orgId (RESTRICT): igual que Invitation.
    prisma.stripeAccount.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.postalCodeArea.deleteMany(),
  ], { timeout: 30000, maxWait: 30000 });

  // Referencia CP completo→barrio (BI-3): no depende de ninguna org. De momento
  // solo cubre Zaragoza capital (primera puesta en preproducción); ver
  // postal-codes-zaragoza.ts para ampliar a otras ciudades.
  await prisma.postalCodeArea.createMany({
    data: Object.entries(ZARAGOZA_POSTAL_CODES).map(([code, v]) => ({ code, name: v.name, lat: v.lat, lng: v.lng })),
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  for (const cfg of ORGS) {
    await seedOrganization(cfg, passwordHash);
  }

  console.log("\nSeed completado.");
  console.log("TRAINING ZONE · centros: La Jota y Puerta del Carmen");
  console.log("Usuarios demo (contraseña: demo1234):");
  console.log("  Organización");
  console.log("    sergio@trainingzone.es                    Dirección de organización (Owner)");
  console.log("    rrhh@trainingzone.es                      RRHH");
  console.log("    admin@piensaenweb.dev                     Admin de plataforma");
  console.log("  La Jota");
  console.log("    direccion.lajota@trainingzone.es          Dirección de centro");
  console.log("    entrenador@trainingzone.es                Entrenador (Dani Herrero · panel /trainer)");
  console.log("    laura.gimeno@trainingzone.es              Entrenadora");
  console.log("    marcos.iglesias@trainingzone.es           Entrenador");
  console.log("    recepcion.lajota@trainingzone.es          Recepción");
  console.log("    socio@trainingzone.es                     Socio (Marta García López · bono 12 grupos)");
  console.log("  Puerta del Carmen");
  console.log("    direccion.puertacarmen@trainingzone.es    Dirección de centro");
  console.log("    elena.vidal@trainingzone.es               Entrenadora");
  console.log("    javier.soto@trainingzone.es               Entrenador");
  console.log("    sara.ortiz@trainingzone.es                Entrenadora");
  console.log("    recepcion.puertacarmen@trainingzone.es    Recepción");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
