/**
 * E10-07 · Región de despliegue, verificada en arranque y documentada en un
 * único sitio (decisión D-C1: la base de datos YA está en la UE; esta historia
 * la documenta y la blinda para que no se pierda en el siguiente despliegue).
 *
 * El problema no era estar fuera de la UE: era que nada lo comprobaba. Una
 * base de datos con `HealthRecord` movida a Oregón en un `render.yaml` de
 * madrugada es una transferencia internacional de datos de salud sin declarar,
 * y el sistema arrancaría igual de contento.
 *
 * Aquí viven tres cosas, a propósito juntas:
 * 1. `DECLARED_DATA_REGION`, la región que la política de privacidad y el
 *    registro de actividades AFIRMAN. Es la fuente única.
 * 2. `checkDataRegion`, que compara lo declarado con lo realmente configurado.
 * 3. `THIRD_PARTY_PROCESSORS`, la ubicación y el mecanismo de transferencia de
 *    cada proveedor.
 *
 * Consecuencia buscada: mover la base de datos obliga a tocar ESTE fichero, y
 * tocarlo cambia a la vez el arranque y el texto publicado en `/privacidad`.
 * No hay forma de mover la región y dejar la documentación mintiendo.
 */

export type DataRegion = {
  /** Código tal y como lo nombra el proveedor de infraestructura. */
  code: string;
  label: string;
  country: string;
  /** ¿Dentro del EEE? Si no, hay transferencia internacional que declarar. */
  eu: boolean;
};

/**
 * Regiones conocidas. La lista incluye a propósito regiones de fuera del EEE:
 * una allowlist sin contraejemplos no distingue "no es de la UE" de "no la
 * conozco", y las dos tienen que fallar, pero por motivos distintos.
 */
export const KNOWN_DATA_REGIONS: DataRegion[] = [
  { code: "frankfurt", label: "Fráncfort", country: "Alemania", eu: true },
  { code: "eu-central-1", label: "Fráncfort", country: "Alemania", eu: true },
  { code: "eu-west-1", label: "Dublín", country: "Irlanda", eu: true },
  { code: "eu-west-3", label: "París", country: "Francia", eu: true },
  { code: "eu-south-2", label: "Aragón", country: "España", eu: true },
  { code: "oregon", label: "Oregón", country: "Estados Unidos", eu: false },
  { code: "ohio", label: "Ohio", country: "Estados Unidos", eu: false },
  { code: "virginia", label: "Virginia", country: "Estados Unidos", eu: false },
  { code: "us-east-1", label: "Virginia", country: "Estados Unidos", eu: false },
  { code: "singapore", label: "Singapur", country: "Singapur", eu: false },
];

/**
 * Región declarada en la política de privacidad y en el registro de
 * actividades. Cambiarla es un cambio de documentación, no de configuración:
 * si el despliegue real no coincide, el arranque se para.
 */
export const DECLARED_DATA_REGION = "frankfurt";

export function resolveDataRegion(code: string | undefined | null): DataRegion | null {
  if (!code) return null;
  const normalized = code.trim().toLowerCase();
  return KNOWN_DATA_REGIONS.find((r) => r.code === normalized) ?? null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db", "postgres"]);

/**
 * ¿La base de datos es la del portátil o la del contenedor de pruebas? Sin
 * esto, exigir `DATA_REGION` en desarrollo obligaría a declarar la región de
 * un Postgres que vive en `localhost` y no sale de la máquina.
 */
export function isLocalDatabase(databaseUrl: string | undefined | null): boolean {
  if (!databaseUrl) return false;
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase();
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

export type DataRegionCheck =
  | { ok: true; region: DataRegion | null; local: boolean }
  | {
      ok: false;
      reason: "sin_declarar" | "desconocida" | "fuera_de_la_ue" | "no_coincide_con_lo_documentado";
      message: string;
    };

/**
 * Verificación de arranque. Falla cerrado en los cuatro casos que importan, y
 * el mensaje dice qué hacer: un fallo de cumplimiento que solo diga "error" se
 * arregla poniendo la variable a lo que sea con tal de que arranque.
 */
export function checkDataRegion(env: {
  DATA_REGION?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
}): DataRegionCheck {
  const configured = env.DATA_REGION?.trim();
  const local = isLocalDatabase(env.DATABASE_URL);

  if (!configured) {
    // Una base de datos local no sale de la máquina y no hay región que
    // declarar. Cualquier otra sin declarar es una base de datos en un sitio
    // que nadie ha escrito en ninguna parte, que es exactamente el hallazgo.
    if (local && env.NODE_ENV !== "production") return { ok: true, region: null, local: true };
    return {
      ok: false,
      reason: "sin_declarar",
      message:
        "DATA_REGION no está definida. Declara la región donde vive la base de datos " +
        `(la documentada es "${DECLARED_DATA_REGION}") antes de arrancar.`,
    };
  }

  const region = resolveDataRegion(configured);
  if (!region) {
    return {
      ok: false,
      reason: "desconocida",
      message:
        `DATA_REGION="${configured}" no está en la lista de regiones conocidas de src/lib/data-region.ts. ` +
        "Añádela indicando su país y si está en el EEE, y actualiza la documentación en el mismo cambio.",
    };
  }

  if (!region.eu) {
    return {
      ok: false,
      reason: "fuera_de_la_ue",
      message:
        `DATA_REGION="${region.code}" está en ${region.country}, fuera del EEE. La base de datos guarda ` +
        "datos de salud (art. 9 RGPD): moverla ahí es una transferencia internacional que exige su propio " +
        "análisis y sus garantías declaradas. El arranque se detiene a propósito.",
    };
  }

  if (region.code !== DECLARED_DATA_REGION) {
    return {
      ok: false,
      reason: "no_coincide_con_lo_documentado",
      message:
        `DATA_REGION="${region.code}" no coincide con la región documentada ("${DECLARED_DATA_REGION}"). ` +
        "Mover la base de datos exige actualizar DECLARED_DATA_REGION en src/lib/data-region.ts, que es lo " +
        "que publica /privacidad y lo que cita el registro de actividades.",
    };
  }

  return { ok: true, region, local };
}

/** Envoltorio que lanza. Lo llama `src/instrumentation.ts` al arrancar. */
export function assertEuDataRegion(env: NodeJS.ProcessEnv = process.env): DataRegion | null {
  const result = checkDataRegion({
    DATA_REGION: env.DATA_REGION,
    DATABASE_URL: env.DATABASE_URL,
    NODE_ENV: env.NODE_ENV,
  });
  if (!result.ok) throw new Error(`[E10-07] Región de datos no conforme: ${result.message}`);
  return result.region;
}

export type ProcessorDeclaration = {
  name: string;
  purpose: string;
  /** Dónde se tratan los datos. */
  location: string;
  /** Mecanismo del capítulo V RGPD, o por qué no hace falta. */
  transferMechanism: string;
};

/**
 * Los seis proveedores reales, con su ubicación y su mecanismo de
 * transferencia. Es lo que exige el escenario "los demás proveedores" y lo que
 * alimenta la tabla de subencargados del expediente
 * (`docs/legal/02-SUBENCARGADOS-Y-TRANSFERENCIAS.md`).
 *
 * No es asesoramiento jurídico: es la declaración de lo que el código hace, que
 * es la mitad que le toca a esta pista. El mecanismo lo confirma el despacho.
 */
export const THIRD_PARTY_PROCESSORS: ProcessorDeclaration[] = [
  {
    name: "Anthropic (Claude API)",
    purpose: "Propuestas de mesociclo a partir de datos seudonimizados (F6).",
    location: "Estados Unidos",
    transferMechanism:
      "Cláusulas contractuales tipo y Marco de Privacidad de Datos UE-EEUU. Hasta que el contrato de encargo esté firmado, la IA no trata datos de un socio real (decisión D-C5).",
  },
  {
    name: "Stripe",
    purpose: "Cobro de cuotas y bonos, y suscripción de plataforma.",
    location: "Irlanda (Stripe Payments Europe) con tratamiento en Estados Unidos",
    transferMechanism: "Cláusulas contractuales tipo del contrato de encargo de Stripe.",
  },
  {
    name: "Brevo",
    purpose: "Correo transaccional y de servicio.",
    location: "Unión Europea (Francia y Alemania)",
    transferMechanism: "Sin transferencia internacional: el tratamiento se queda en el EEE.",
  },
  {
    name: "Expo (EAS)",
    purpose: "Compilación y distribución de la app nativa, y envío de notificaciones push.",
    location: "Estados Unidos",
    transferMechanism:
      "Cláusulas contractuales tipo. No trata datos de salud: por el canal push solo viajan identificador de dispositivo y el texto del aviso.",
  },
  {
    name: "Microsoft (Entra ID)",
    purpose: "Inicio de sesión corporativo del equipo del centro, cuando el centro lo activa.",
    location: "Unión Europea (EU Data Boundary) con soporte desde Estados Unidos",
    transferMechanism: "Cláusulas contractuales tipo del Data Protection Addendum de Microsoft.",
  },
  {
    name: "Google",
    purpose: "Inicio de sesión con cuenta de Google del equipo del centro, cuando el centro lo activa.",
    location: "Estados Unidos",
    transferMechanism: "Cláusulas contractuales tipo y Marco de Privacidad de Datos UE-EEUU.",
  },
];
