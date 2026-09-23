import { isDemoModeActive } from "@/lib/platform-plans";

/**
 * Usuarios sembrados por `prisma/seed.ts` (uno por rol) para el panel de acceso
 * rápido del login en modo demo.
 *
 * PROD-01: esto vivía como constante del componente de CLIENTE `login-form.tsx`,
 * así que emails y contraseña compartida viajaban en el JS público de todos los
 * entornos, producción incluida, aunque el panel no se pintara. Ahora solo lo
 * importa la página (componente de servidor) y solo lo pasa al cliente cuando
 * `isDemoModeActive()`.
 */
export type DemoUser = { email: string; label: string; desc: string };
export type DemoAccess = { users: DemoUser[]; password: string };

const DEMO_USERS: DemoUser[] = [
  {
    email: "direccion@trainingzone.es",
    label: "Carmen — Dirección",
    desc: "Ámbito global, todos los centros",
  },
  {
    email: "direccion.lajota@trainingzone.es",
    label: "Dirección de centro",
    desc: "P&L y operativa de su centro",
  },
  {
    email: "entrenador@trainingzone.es",
    label: "Dani — Entrenador",
    desc: "Agenda, Session Brief y Debrief",
  },
  {
    email: "marcos.iglesias@trainingzone.es",
    label: "Marcos — Entrenador Admin",
    desc: "Entrenador con aforo del centro y ajuste de bonos",
  },
  {
    email: "laura.gimeno@trainingzone.es",
    label: "Laura — Entrenadora",
    desc: "Otro entrenador, mismo centro (La Jota)",
  },
  {
    email: "recepcion.lajota@trainingzone.es",
    label: "Recepción",
    desc: "Socios, agenda y cobros (sin datos de salud)",
  },
  {
    email: "socio@trainingzone.es",
    label: "Marta — Socia",
    desc: "Bono de grupos + bono de EP (uno de cada)",
  },
  {
    email: "socio.grupos@trainingzone.es",
    label: "Nuria — Socia",
    desc: "Solo bono de grupos reducidos",
  },
  {
    email: "socio.ep@trainingzone.es",
    label: "Álvaro — Socio",
    desc: "Solo bono de entrenamiento personal",
  },
  {
    email: "sergio@trainingzone.es",
    label: "Sergio — Admin plataforma",
    desc: "Soporte de Apta: organizaciones, anuncios y auditoría",
  },
];

const DEMO_PASSWORD = "demo1234";

/** `null` con el modo demo apagado: al cliente no llega ni la lista ni la contraseña. */
export function demoAccessForLogin(demoModeActive: boolean = isDemoModeActive()): DemoAccess | null {
  return demoModeActive ? { users: DEMO_USERS, password: DEMO_PASSWORD } : null;
}
