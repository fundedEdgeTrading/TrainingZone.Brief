/**
 * Preferencias de correo del socio y baja (pie de todas las plantillas de
 * `emails/templates.ts`).
 *
 * Dos capas, a propósito:
 *
 *  - **Baja global** (`Member.emailOptOutAt`): para de golpe todo el correo
 *    prescindible. Es lo que ejerce el enlace "Darme de baja" y lo que exige
 *    el Art. 21 RGPD / Art. 21 LSSI — un medio sencillo y gratuito de oponerse.
 *  - **Interruptores por tipo** (`notifyVacancies`, `notifyBirthday`,
 *    `notifyAssessments`, `consentMarketing`): quien no quiere que le avisen
 *    de plazas pero sí que le recuerden la valoración no tiene que elegir
 *    entre todo o nada.
 *
 * Este módulo es PURO a propósito (ni Prisma ni `crypto`): lo importan tanto
 * los jobs del servidor como el formulario de `/preferencias/[token]`, que es
 * un componente de cliente. Todo lo que toca la base de datos o firma tokens
 * vive en `email-preferences-queries.ts`.
 *
 * Lo que NUNCA se puede desactivar es el correo estrictamente transaccional:
 * alta de cuenta, restablecer contraseña, enlace de gestión de cuota y aviso
 * de cobro fallido. No son comunicaciones comerciales sino la ejecución del
 * servicio contratado, y silenciarlas dejaría al socio sin poder entrar ni
 * pagar. Por eso `MemberEmailKind` no los incluye.
 */
export type MemberEmailKind = "vacancy" | "birthday" | "assessment" | "marketing";

export const MEMBER_EMAIL_KIND_LABEL: Record<MemberEmailKind, string> = {
  vacancy: "Avisos de plaza liberada",
  birthday: "Felicitación de cumpleaños",
  assessment: "Recordatorios de valoración",
  marketing: "Novedades y ofertas del centro",
};

export const MEMBER_EMAIL_KIND_HELP: Record<MemberEmailKind, string> = {
  vacancy: "Cuando alguien cancela y queda un hueco en una sesión para la que tienes bono activo.",
  birthday: "Un correo al año, el día de tu cumpleaños.",
  assessment: "Cuando te toca una valoración periódica con tu entrenador.",
  marketing: "Ofertas, novedades y campañas del centro. Nunca es imprescindible.",
};

/** Campos de `Member` que deciden si un correo prescindible puede salir. */
export type MemberEmailPreferences = {
  notifyVacancies: boolean;
  notifyBirthday: boolean;
  notifyAssessments: boolean;
  consentMarketing: boolean;
  emailOptOutAt: Date | null;
};

export const MEMBER_EMAIL_PREFERENCES_SELECT = {
  notifyVacancies: true,
  notifyBirthday: true,
  notifyAssessments: true,
  consentMarketing: true,
  emailOptOutAt: true,
} as const;

/**
 * Única puerta de salida del correo prescindible. La baja global gana siempre:
 * si el socio se dio de baja de todo, da igual que su interruptor de plazas
 * siguiera en `true` de antes.
 */
export function canSendMemberEmail(kind: MemberEmailKind, prefs: MemberEmailPreferences): boolean {
  if (prefs.emailOptOutAt) return false;
  switch (kind) {
    case "vacancy":
      return prefs.notifyVacancies;
    case "birthday":
      return prefs.notifyBirthday;
    case "assessment":
      return prefs.notifyAssessments;
    case "marketing":
      return prefs.consentMarketing;
  }
}

/** Valor de cada interruptor tal y como lo pinta la pantalla de preferencias. */
export function preferenceValue(kind: MemberEmailKind, prefs: MemberEmailPreferences): boolean {
  switch (kind) {
    case "vacancy":
      return prefs.notifyVacancies;
    case "birthday":
      return prefs.notifyBirthday;
    case "assessment":
      return prefs.notifyAssessments;
    case "marketing":
      return prefs.consentMarketing;
  }
}
