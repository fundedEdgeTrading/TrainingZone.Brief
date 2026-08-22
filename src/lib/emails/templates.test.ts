import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {
  renderMemberWelcomeEmail,
  renderBirthdayEmail,
  renderSessionVacancyEmail,
  renderStaffInviteEmail,
  renderPasswordResetEmail,
} from "./templates";

/**
 * Lo que se comprueba aquí no es la maqueta (eso se mira con el ojo en
 * `handoff/preview/emails.html`), sino las tres cosas del rediseño que, si se
 * rompen en silencio, no las ve nadie hasta que llega la reclamación: que el
 * pie del correo prescindible lleva la baja, que no queda marca Apta, y que un
 * nombre con HTML no se cuela dentro de la plantilla.
 */

const BASE = {
  memberFirstName: "Lucía",
  orgName: "Training Zone",
  orgLogoUrl: "https://example.test/brand/tz-logo-white.png",
  centerName: "TZ La Jota",
  onboardingUrl: "https://example.test/onboarding/abc",
};

test("el correo al socio lleva baja y preferencias cuando se le pasa su token", () => {
  const html = renderMemberWelcomeEmail({ ...BASE, prefsToken: "tok-123" });
  assert.match(html, /\/preferencias\/tok-123/);
  assert.match(html, /\/baja\/tok-123/);
  assert.match(html, /Darme de baja/);
});

test("sin token no se pinta un enlace de baja que no llevaría a ninguna parte", () => {
  const html = renderMemberWelcomeEmail(BASE);
  assert.doesNotMatch(html, /\/baja\//);
  assert.match(html, /\/privacidad/);
});

test("el correo al personal no ofrece baja: es estrictamente transaccional", () => {
  const html = renderStaffInviteEmail({
    staffFirstName: "Marcos",
    orgName: "Training Zone",
    orgLogoUrl: BASE.orgLogoUrl,
    roleLabel: "Entrenador",
    onboardingUrl: BASE.onboardingUrl,
  });
  assert.doesNotMatch(html, /\/baja\//);
  assert.doesNotMatch(html, /Darme de baja/);
});

test("el aviso de plaza y la felicitación etiquetan su propia baja", () => {
  const vacancy = renderSessionVacancyEmail({
    recipientFirstName: "Lucía",
    brandName: "Training Zone",
    brandLogoUrl: BASE.orgLogoUrl,
    sessionName: "Funcional",
    dateLabel: "martes 3 de marzo",
    startTime: "18:30",
    centerName: BASE.centerName,
    agendaUrl: "https://example.test/portal/agenda",
    prefsToken: "tok-abc",
  });
  assert.match(vacancy, /Dejar de recibir avisos de plazas/);

  const birthday = renderBirthdayEmail({
    memberFirstName: "Lucía",
    brandName: "Training Zone",
    brandLogoUrl: BASE.orgLogoUrl,
    portalUrl: "https://example.test/portal",
    prefsToken: "tok-abc",
  });
  assert.match(birthday, /No felicitarme más/);
});

test("ninguna plantilla firma ya como Apta", () => {
  const templates = [
    renderMemberWelcomeEmail({ ...BASE, prefsToken: "t" }),
    renderBirthdayEmail({
      memberFirstName: "Lucía",
      brandName: "Training Zone",
      brandLogoUrl: BASE.orgLogoUrl,
      portalUrl: "https://example.test/portal",
    }),
    renderPasswordResetEmail({
      recipientFirstName: "Lucía",
      brandName: "Training Zone",
      brandLogoUrl: BASE.orgLogoUrl,
      resetUrl: "https://example.test/recuperar-clave/x",
    }),
  ];
  for (const html of templates) assert.doesNotMatch(html, /Apta/);
});

test("un nombre con HTML se escapa en vez de romper la plantilla", () => {
  const html = renderMemberWelcomeEmail({
    ...BASE,
    memberFirstName: '<script>alert("x")</script>',
    centerName: "Gimnasio & Co",
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Gimnasio &amp; Co/);
});

test("el pie lleva dirección postal y motivo del envío", () => {
  const html = renderMemberWelcomeEmail({ ...BASE, postalAddress: "C/ Falsa 1, Zaragoza" });
  assert.match(html, /C\/ Falsa 1, Zaragoza/);
  assert.match(html, /Recibes este email porque tu centro ha creado tu cuenta de socio\./);
});
