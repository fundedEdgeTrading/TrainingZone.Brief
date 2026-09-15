import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { isPublicPath } from "@/lib/public-paths";
import { TOKEN_PATHS } from "@/lib/seo";
import { CONSENT_VERSION, LEAD_CONSENT_VERSION } from "@/lib/consent";
import {
  MEMBER_FORM_PUBLIC_PATH,
  MEMBER_FORM_TTL_DAYS,
  getMemberFormStatus,
  hasFilledMemberForm,
  listUnfilledMemberFormInvites,
  memberFormExpiry,
  memberFormStateOf,
  memberFormUrlFor,
  resolveMemberFormInvite,
  sendMemberForm,
  submitMemberForm,
} from "@/lib/member-forms";

/**
 * M5 · Formularios que rellena el cliente (E14-18, E14-19, E14-20).
 *
 * Un test por escenario de las tres historias, en su orden, más las
 * invariantes que esta pista toca: el dato de salud no se guarda sin
 * consentimiento explícito, el formulario no enciende el semáforo de aptitud
 * por su cuenta, y el control de edad es el mismo de `minors.ts` y no una copia
 * «espejo».
 */

const SLUG = "e14-m5-formularios";

let orgId = "";
let centerId = "";
let memberId = "";
let leadId = "";
let receptionId = "";

/** Respuestas completas del socio: cada test rompe solo lo que quiere probar. */
function respuestasDeSocio(extra: Record<string, unknown> = {}) {
  return {
    pesoKg: 71.5,
    dolorActual: 2,
    calidadSueno: 4,
    estres: 3,
    energia: 4,
    diasPorSemana: "3",
    perfil: {
      edad: 34,
      sexo: "MUJER",
      alturaCm: 168,
      objetivoPrincipal: "Volver a correr 10 km sin dolor de rodilla",
      objetivoSecundario: "",
      motivacionReal: "",
      queLeHariaAbandonar: "",
    },
    experiencia: {
      nivelActividad: "MEDIO",
      haEntrenadoAntes: true,
      anosExperiencia: 2,
      tecnicaBasicos: "MEDIA",
      ejerciciosNoTolera: "Sentadilla profunda",
    },
    ...extra,
  };
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.memberFormInvite.deleteMany({ where: { orgId: org.id } });
  await prisma.notification.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.assessmentCustomQuestion.deleteMany({ where: { orgId: org.id } });
  await prisma.assessment.deleteMany({ where: { orgId: org.id } });
  await prisma.healthRecord.deleteMany({ where: { OR: [{ member: { orgId: org.id } }, { lead: { orgId: org.id } }] } });
  await prisma.leadNote.deleteMany({ where: { orgId: org.id } });
  await prisma.lead.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Formularios M5", slug: SLUG } });
  orgId = org.id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro M5", slug: `${SLUG}-c1` } })).id;

  const identity = await prisma.identity.create({
    data: { email: `${SLUG}-recepcion@example.com`, passwordHash: "no-se-usa-en-este-test" },
  });
  receptionId = (
    await prisma.user.create({
      data: { identityId: identity.id, orgId, centerId, name: "Recepción", email: identity.email, role: "RECEPTION" },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.memberFormInvite.deleteMany({ where: { orgId } });
  await prisma.notification.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.assessment.deleteMany({ where: { orgId } });
  await prisma.assessmentCustomQuestion.deleteMany({ where: { orgId } });
  await prisma.healthRecord.deleteMany({ where: { OR: [{ member: { orgId } }, { lead: { orgId } }] } });
  await prisma.lead.deleteMany({ where: { orgId } });
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.organization.update({ where: { id: orgId }, data: { allowsMinors: false, minimumAgeYears: 18 } });

  memberId = (
    await prisma.member.create({
      data: {
        orgId,
        primaryCenterId: centerId,
        firstName: "Marta",
        lastName: "Socia",
        email: `${SLUG}-socia@example.com`,
        state: "ACTIVE",
      },
    })
  ).id;

  leadId = (
    await prisma.lead.create({
      data: {
        orgId,
        centerId,
        firstName: "Iván",
        lastName: "Interesado",
        phone: "600000000",
        email: `${SLUG}-lead@example.com`,
        postalCode: "50014",
        occupation: "Comercial",
        goals: "Ponerme en forma",
        hasTrainedBefore: false,
        channel: "Instagram",
      },
    })
  ).id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Token del último envío: los tests no lo ven, igual que no lo ve la app. */
async function tokenDelUltimoEnvio() {
  const invite = await prisma.memberFormInvite.findFirstOrThrow({
    where: { orgId },
    orderBy: { sentAt: "desc" },
    select: { token: true },
  });
  return invite.token;
}

// ---------------------------------------------------------------------------
// E14-18 · Enviar el formulario a quien todavía no tiene cuenta
// ---------------------------------------------------------------------------

test("E14-18 · se manda desde la ficha del socio y desde la del lead", async () => {
  const alSocio = await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  assert.equal(alSocio.ok, true);

  const alLead = await sendMemberForm({ orgId, target: { kind: "lead", leadId }, sentByUserId: receptionId });
  assert.equal(alLead.ok, true);

  const envios = await prisma.memberFormInvite.findMany({ where: { orgId }, select: { memberId: true, leadId: true } });
  assert.equal(envios.length, 2);
  assert.ok(envios.some((e) => e.memberId === memberId && e.leadId === null));
  assert.ok(envios.some((e) => e.leadId === leadId && e.memberId === null));
});

test("E14-18 · el enlace lleva token de un solo uso, con caducidad", async () => {
  const enviado = await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  assert.equal(enviado.ok, true);
  if (!enviado.ok) return;

  const invite = await prisma.memberFormInvite.findFirstOrThrow({ where: { orgId }, select: { token: true, expiresAt: true } });
  assert.equal(enviado.url, memberFormUrlFor(invite.token));
  // 64 caracteres hexadecimales: los mismos 32 bytes aleatorios que
  // `generateInvitationToken`, no un identificador adivinable.
  assert.match(invite.token, /^[0-9a-f]{64}$/);

  const dias = Math.round((invite.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  assert.equal(dias, MEMBER_FORM_TTL_DAYS);

  // De un solo uso: contestado una vez, el mismo enlace ya no abre.
  const primera = await submitMemberForm({
    token: invite.token,
    answers: respuestasDeSocio(),
    birthDate: "1991-04-10",
    consents: { health: true },
  });
  assert.equal(primera.ok, true);

  const segunda = await submitMemberForm({
    token: invite.token,
    answers: respuestasDeSocio(),
    birthDate: "1991-04-10",
    consents: { health: true },
  });
  assert.equal(segunda.ok, false);
});

test("E14-18 · la URL no habla: ni id de socio, ni de valoración, ni dato de salud", async () => {
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();
  const url = memberFormUrlFor(token);

  assert.ok(!url.includes(memberId), "el id del socio no puede viajar en la URL");
  assert.ok(!url.includes(orgId));
  assert.ok(!url.includes(centerId));
  assert.ok(url.startsWith(`${new URL(url).origin}${MEMBER_FORM_PUBLIC_PATH}/`));

  // Y lo que la página pública sabe de la persona es su nombre de pila: ni
  // apellidos, ni email, ni una sola respuesta anterior.
  const resuelto = await resolveMemberFormInvite(token);
  assert.equal(resuelto.ok, true);
  if (!resuelto.ok) return;
  const serializado = JSON.stringify(resuelto.context);
  assert.ok(serializado.includes("Marta"));
  assert.ok(!serializado.includes("Socia"));
  assert.ok(!serializado.includes(`${SLUG}-socia@example.com`));
  assert.ok(!serializado.includes(memberId));
});

test("E14-18 · la ruta del formulario es pública y está fuera del índice", () => {
  assert.ok(isPublicPath(`${MEMBER_FORM_PUBLIC_PATH}/abc123`), "sin esto el proxy la rebota a /login");
  assert.ok(
    (TOKEN_PATHS as readonly string[]).includes(MEMBER_FORM_PUBLIC_PATH),
    "un enlace con token indexado es acceso sin contraseña (E9-02)",
  );
});

test("E14-18 · es repetible: alta, seis meses y aniversario conviven, y reenviar revoca el anterior", async () => {
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, milestoneKey: "M6", sentByUserId: receptionId });
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, milestoneKey: "Y1", sentByUserId: receptionId });

  const vivos = await prisma.memberFormInvite.findMany({ where: { orgId, memberId, revokedAt: null } });
  assert.equal(vivos.length, 3, "Invitation no valía justamente por esto: su memberId es @unique");

  // Reenviar el mismo hito deja UN solo enlace vivo.
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, milestoneKey: "M6", sentByUserId: receptionId });
  const deM6 = await prisma.memberFormInvite.findMany({ where: { orgId, memberId, kind: "M6" } });
  assert.equal(deM6.length, 2);
  assert.equal(deM6.filter((i) => i.revokedAt === null).length, 1);
});

// ---------------------------------------------------------------------------
// E14-19 · Relleno sin cuenta, con los consentimientos de E10
// ---------------------------------------------------------------------------

test("E14-19 · sin consentimiento de salud no se guarda nada", async () => {
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const resultado = await submitMemberForm({
    token,
    answers: respuestasDeSocio(),
    birthDate: "1991-04-10",
    consents: { health: false, marketing: true },
  });
  assert.equal(resultado.ok, false);

  const assessments = await prisma.assessment.count({ where: { orgId } });
  assert.equal(assessments, 0, "todo el cuestionario es dato del art. 9: sin consentimiento no se guarda ni la mitad");

  const socio = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(socio.consentHealth, false);
  assert.equal(socio.consentMarketing, false, "el comercial no se cuela cuando el envío se rechaza");

  const invite = await prisma.memberFormInvite.findFirstOrThrow({ where: { orgId } });
  assert.equal(invite.completedAt, null);
});

test("E14-19 · el comercial va aparte, es opcional y se guarda cuándo y con qué versión", async () => {
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const antes = new Date();
  const resultado = await submitMemberForm({
    token,
    answers: respuestasDeSocio(),
    birthDate: "1991-04-10",
    consents: { health: true, marketing: true },
  });
  assert.equal(resultado.ok, true);

  const socio = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(socio.consentMarketing, true);
  assert.ok(socio.consentMarketingAt && socio.consentMarketingAt >= antes, "hace falta la FECHA, no solo la bandera");
  assert.equal(socio.consentVersion, CONSENT_VERSION, "y la versión del texto que tenía delante");
  // Sin esto, los flujos de E2/E3 no se pueden encender: no habría a quién
  // escribir con base jurídica.
  assert.equal(socio.consentHealth, true);
  assert.ok(socio.consentHealthAt);

  const traza = await prisma.auditLog.findFirstOrThrow({
    where: { orgId, action: "MEMBER_FORM_CONSENTS_RECORDED" },
  });
  const metadata = traza.metadata as Record<string, unknown>;
  assert.equal(metadata.marketing, true);
  assert.equal(metadata.consentVersion, CONSENT_VERSION);
});

test("E14-19 · el «no» al comercial consta y NO retira lo que ya estaba dado", async () => {
  await prisma.member.update({
    where: { id: memberId },
    data: { consentImages: true, consentImagesAt: new Date("2026-01-01T10:00:00.000Z") },
  });
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  // Lo ya otorgado ni siquiera se le vuelve a preguntar.
  const resuelto = await resolveMemberFormInvite(token);
  assert.equal(resuelto.ok, true);
  if (!resuelto.ok) return;
  assert.ok(!resuelto.context.consents.some((c) => c.kind === "images"));
  assert.ok(resuelto.context.consents.some((c) => c.kind === "health" && c.required));
  assert.ok(resuelto.context.consents.some((c) => c.kind === "marketing" && !c.required));

  await submitMemberForm({
    token,
    answers: respuestasDeSocio(),
    birthDate: "1991-04-10",
    consents: { health: true, marketing: false },
  });

  const socio = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(socio.consentMarketing, false);
  assert.equal(socio.consentImages, true, "un formulario de alta no retira consentimientos: eso es /preferencias");
  assert.equal(socio.consentImagesAt?.toISOString(), "2026-01-01T10:00:00.000Z");

  const traza = await prisma.auditLog.findFirstOrThrow({ where: { orgId, action: "MEMBER_FORM_CONSENTS_RECORDED" } });
  assert.equal((traza.metadata as Record<string, unknown>).marketing, false, "el «no» también se prueba (art. 7.1)");
});

test("E10-12 · un centro que no admite menores no deja completar el formulario a uno", async () => {
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const hoy = new Date();
  const nacimientoDeUnMenor = `${hoy.getUTCFullYear() - 15}-01-01`;
  const resultado = await submitMemberForm({
    token,
    answers: respuestasDeSocio({ perfil: { ...respuestasDeSocio().perfil, edad: 15 } }),
    birthDate: nacimientoDeUnMenor,
    consents: { health: true },
  });
  assert.equal(resultado.ok, false);
  if (resultado.ok) return;
  assert.match(resultado.error, /mayores de 18/);
  assert.equal(await prisma.assessment.count({ where: { orgId } }), 0);
});

test("E10-12 · si el centro admite menores, sin tutor no se completa y con tutor queda acreditado", async () => {
  await prisma.organization.update({ where: { id: orgId }, data: { allowsMinors: true, minimumAgeYears: 14 } });
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const hoy = new Date();
  const nacimiento = `${hoy.getUTCFullYear() - 16}-01-01`;
  const respuestas = respuestasDeSocio({ perfil: { ...respuestasDeSocio().perfil, edad: 16 } });

  const sinTutor = await submitMemberForm({ token, answers: respuestas, birthDate: nacimiento, consents: { health: true } });
  assert.equal(sinTutor.ok, false);
  if (!sinTutor.ok) assert.match(sinTutor.error, /tutor legal/);

  const conTutor = await submitMemberForm({
    token,
    answers: respuestas,
    birthDate: nacimiento,
    consents: { health: true },
    guardian: {
      name: "Carmen Tutora",
      email: "tutora@example.com",
      phone: "600111222",
      idDocument: "12345678Z",
      declared: true,
    },
  });
  assert.equal(conTutor.ok, true);

  const socio = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  // Las cuatro cosas del art. 7.2 LOPDGDD: quién, con qué documento, cuándo y
  // con qué justificante.
  assert.equal(socio.guardianName, "Carmen Tutora");
  assert.equal(socio.guardianIdDocument, "12345678Z");
  assert.ok(socio.guardianConsentAt);
  assert.ok(socio.guardianEvidence);
});

test("E10-12 · a un lead menor no se le completa por internet: no hay dónde acreditar al tutor", async () => {
  await prisma.organization.update({ where: { id: orgId }, data: { allowsMinors: true, minimumAgeYears: 14 } });
  await sendMemberForm({ orgId, target: { kind: "lead", leadId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const hoy = new Date();
  const resultado = await submitMemberForm({
    token,
    answers: { perfil: { objetivoPrincipal: "Jugar mejor al baloncesto" }, experiencia: {} },
    birthDate: `${hoy.getUTCFullYear() - 15}-01-01`,
    consents: { health: true },
    guardian: {
      name: "Carmen Tutora",
      email: "tutora@example.com",
      phone: "600111222",
      idDocument: "12345678Z",
      declared: true,
    },
  });
  assert.equal(resultado.ok, false);
  const invite = await prisma.memberFormInvite.findFirstOrThrow({ where: { orgId } });
  assert.equal(invite.completedAt, null);
});

// ---------------------------------------------------------------------------
// E14-20 · Entrada automática en la ficha y estado visible
// ---------------------------------------------------------------------------

test("E14-20 · lo respondido cae en Assessment.answers, con custom[clave] y memberPartAt", async () => {
  await prisma.assessmentCustomQuestion.create({
    data: { orgId, key: "cafes_al_dia", label: "¿Cuántos cafés al día?", type: "NUMBER", scope: "ALL" },
  });

  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const resultado = await submitMemberForm({
    token,
    answers: respuestasDeSocio({ custom: { cafes_al_dia: 3 } }),
    birthDate: "1991-04-10",
    consents: { health: true },
  });
  assert.equal(resultado.ok, true);

  const assessment = await prisma.assessment.findFirstOrThrow({ where: { orgId, memberId } });
  assert.equal(assessment.kind, "INITIAL");
  assert.ok(assessment.memberPartAt, "memberPartAt es la marca de que esta mitad ya está");
  assert.equal(assessment.completedAt, null, "la valoración sigue abierta: el screening y el PAR-Q son del entrenador");
  assert.equal(assessment.filledByUserId, null, "no la firma nadie de la casa: la rellenó el propio socio");

  const answers = assessment.answers as Record<string, unknown>;
  assert.equal(answers.pesoKg, 71.5);
  assert.equal((answers.perfil as Record<string, unknown>).objetivoPrincipal, "Volver a correr 10 km sin dolor de rodilla");
  assert.equal((answers.custom as Record<string, unknown>).cafes_al_dia, 3);

  // Y la altura sube a la ficha porque allí estaba vacía (base del IMC).
  const socio = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(socio.heightCm, 168);
  assert.equal(socio.sex, "FEMALE");

  // No hay tabla paralela: el envío apunta a la valoración que quedó rellena.
  const invite = await prisma.memberFormInvite.findFirstOrThrow({ where: { orgId } });
  assert.equal(invite.assessmentId, assessment.id);
});

test("E14-20 · no es un dato verificado: no toca el semáforo y deja tarea al entrenador", async () => {
  await sendMemberForm({ orgId, target: { kind: "member", memberId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  await submitMemberForm({
    token,
    // Dolor alto y un ejercicio que no tolera: si esto encendiera el semáforo
    // por su cuenta, lo haría con un dato que nadie ha verificado.
    answers: respuestasDeSocio({ dolorActual: 8 }),
    birthDate: "1991-04-10",
    consents: { health: true },
  });

  const registros = await prisma.healthRecord.count({ where: { memberId } });
  assert.equal(registros, 0, "el screening lo firma el entrenador con el socio delante (F3 §4.2)");

  const tarea = await prisma.notification.findFirstOrThrow({ where: { orgId, entityType: "Member", entityId: memberId } });
  assert.equal(tarea.recipientUserId, receptionId, "la tarea es para quien lo mandó");
  assert.equal(tarea.kind, "TASK");
  assert.match(tarea.body ?? "", /no es un dato verificado/i);
});

test("E14-20 · en la ficha se ve enviado, abierto y relleno, con su fecha", async () => {
  const target = { kind: "member", memberId } as const;
  assert.equal((await getMemberFormStatus(orgId, target)).state, "NO_ENVIADO");

  await sendMemberForm({ orgId, target, sentByUserId: receptionId });
  const enviado = await getMemberFormStatus(orgId, target);
  assert.equal(enviado.state, "ENVIADO");
  assert.ok(enviado.sentAt);

  const token = await tokenDelUltimoEnvio();
  await resolveMemberFormInvite(token); // abrir el enlace
  assert.equal((await getMemberFormStatus(orgId, target)).state, "ABIERTO");

  await submitMemberForm({ token, answers: respuestasDeSocio(), birthDate: "1991-04-10", consents: { health: true } });
  const relleno = await getMemberFormStatus(orgId, target);
  assert.equal(relleno.state, "RELLENO");
  assert.ok(relleno.completedAt);
  assert.ok(relleno.assessmentId);
});

test("E14-20 · «¿lo rellenó?» y «¿quién lleva dos días sin rellenarlo?» son funciones de member-forms", async () => {
  const target = { kind: "member", memberId } as const;
  await sendMemberForm({ orgId, target, sentByUserId: receptionId });
  assert.equal(await hasFilledMemberForm(orgId, target), false);

  // A los dos días sin contestar, el flujo 1 de E3 levanta la tarea. Se
  // envejece el envío en vez de esperar dos días.
  await prisma.memberFormInvite.updateMany({
    where: { orgId, memberId },
    data: { sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  });
  const pendientes = await listUnfilledMemberFormInvites({ orgId, days: 2 });
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].memberId, memberId);

  const token = await tokenDelUltimoEnvio();
  await submitMemberForm({ token, answers: respuestasDeSocio(), birthDate: "1991-04-10", consents: { health: true } });

  assert.equal(await hasFilledMemberForm(orgId, target), true);
  assert.equal((await listUnfilledMemberFormInvites({ orgId, days: 2 })).length, 0);
  // Y acotado en el tiempo, que es lo que evita que un formulario de hace dos
  // años dé por respondida la bienvenida de esta semana.
  const dentroDeUnAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  assert.equal(await hasFilledMemberForm(orgId, target, { since: dentroDeUnAno }), false);
});

test("E14-20 · el lead recibe en su ficha lo que su ficha puede guardar, y su consentimiento queda probado", async () => {
  await sendMemberForm({ orgId, target: { kind: "lead", leadId }, sentByUserId: receptionId });
  const token = await tokenDelUltimoEnvio();

  const resultado = await submitMemberForm({
    token,
    answers: {
      perfil: { objetivoPrincipal: "Perder 8 kilos", motivacionReal: "La boda de mi hermana" },
      experiencia: { haEntrenadoAntes: true, ejerciciosNoTolera: "Correr" },
    },
    birthDate: "1988-06-02",
    sex: "MALE",
    consents: { health: true, marketing: true },
  });
  assert.equal(resultado.ok, true);

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.match(lead.goals, /Perder 8 kilos/);
  assert.equal(lead.hasTrainedBefore, true);
  assert.equal(lead.sex, "MALE");
  assert.equal(lead.birthDate?.toISOString().slice(0, 10), "1988-06-02");

  // El mismo `action` que usa la captación pública: el alta lee de ahí el
  // consentimiento comercial, y dos nombres serían dos sitios donde buscarlo.
  const comercial = await prisma.auditLog.findFirstOrThrow({
    where: { orgId, action: "LEAD_MARKETING_CONSENT_RECORDED", entityId: leadId },
  });
  const metadata = comercial.metadata as Record<string, unknown>;
  assert.equal(metadata.granted, true);
  assert.equal(metadata.consentVersion, LEAD_CONSENT_VERSION);

  // Y nada del cuestionario de salud aterriza en la bitácora, que recepción lee
  // sin pasar por health-access.ts.
  const notas = await prisma.leadNote.findMany({ where: { orgId, leadId } });
  assert.equal(notas.length, 0);
});

// ---------------------------------------------------------------------------
// Estado del envío · función pura, sin base de datos
// ---------------------------------------------------------------------------

test("el estado de un envío sale de sus marcas de tiempo, y «relleno» gana a «caducado»", () => {
  const base = {
    id: "i1",
    sentAt: new Date("2026-09-01T10:00:00.000Z"),
    openedAt: null,
    completedAt: null,
    expiresAt: new Date("2026-09-15T10:00:00.000Z"),
    revokedAt: null,
    assessmentId: null,
  };
  const ahora = new Date("2026-09-05T10:00:00.000Z");

  assert.equal(memberFormStateOf(base, ahora), "ENVIADO");
  assert.equal(memberFormStateOf({ ...base, openedAt: ahora }, ahora), "ABIERTO");
  assert.equal(memberFormStateOf({ ...base, revokedAt: ahora }, ahora), "CADUCADO");
  assert.equal(memberFormStateOf(base, new Date("2026-10-01T10:00:00.000Z")), "CADUCADO");
  // Contestado antes de caducar: que el enlace expirara después no deshace lo
  // contestado.
  assert.equal(
    memberFormStateOf({ ...base, completedAt: ahora }, new Date("2026-10-01T10:00:00.000Z")),
    "RELLENO",
  );
});

test("la caducidad se calcula sobre el momento del envío", () => {
  const ahora = new Date("2026-09-15T08:00:00.000Z");
  assert.equal(memberFormExpiry(ahora).toISOString(), "2026-09-29T08:00:00.000Z");
});
