// Importación de socios desde un CSV exportado de otra plataforma
// (p.ej. MyWellness/Technogym). Parte pura y sin dependencias: parsea el CSV,
// normaliza las cabeceras en español (con o sin acentos) y mapea cada fila a
// los campos de `Member`. El server action (members/import-actions.ts) se
// encarga del alta/actualización y del control de acceso (solo dirección).

import type { MemberState, Sex, ChurnRisk } from "@prisma/client";

export type ParsedMemberData = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: Date | null;
  sex: Sex | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  lastAccessAt: Date | null;
  lastInteractionAt: Date | null;
  joinedAt: Date | null;
  accountCreatedAt: Date | null;
  state: MemberState | null;
  churnRisk: ChurnRisk | null;
  primaryAspiration: string | null;
  secondaryAspiration: string | null;
  mywellnessAccount: string | null;
  externalId: string | null;
  externalRef: string | null;
};

/**
 * La cuota que el socio ya venía pagando en la plataforma anterior. Sin esto la
 * importación traía a la persona pero no su dinero: quedaba sin suscripción, no
 * entraba en previsiones de ingresos y el semáforo de retención lo leía como un
 * socio inactivo. El plan se resuelve por nombre en el server action, porque el
 * parser es puro y no habla con la base de datos.
 */
export type ParsedSubscriptionData = {
  /** Nombre del plan tal cual viene en el CSV; se casa contra MembershipPlan. */
  planName: string;
  /**
   * Precio realmente pactado, que a menudo NO es el de tarifa: en una migración
   * hay socios con precios históricos que hay que respetar o se les sube la
   * cuota sin avisar. Null = usar el precio del plan.
   */
  priceCents: number | null;
  /** Alta de la cuota. Null = cae a la fecha de inscripción del socio. */
  startDate: Date | null;
  /** Solo para bonos de sesiones: lo que le queda por consumir. */
  sessionsRemaining: number | null;
};

export type ParsedMemberRow = {
  /** 1-based, referido a la fila de datos (sin contar la cabecera). */
  rowNumber: number;
  data: ParsedMemberData;
  /** Null si el CSV no trae columna de plan o la fila la deja vacía. */
  subscription: ParsedSubscriptionData | null;
  errors: string[];
};

export type ParsedCsv = {
  rows: ParsedMemberRow[];
  /** Errores a nivel de fichero (cabecera ausente, sin filas...). */
  fatalError: string | null;
};

// ---------- Parser CSV (RFC 4180, con autodetección de separador) ----------

function detectDelimiter(headerLine: string): string {
  // Solo cuentan los separadores FUERA de comillas: una cabecera como
  // `nombre;"apellidos, y alias";email` tiene más comas que puntos y coma
  // dentro del campo entrecomillado, y se elegía la coma como separador,
  // partiendo mal el fichero entero.
  let semis = 0;
  let commas = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') {
      if (inQuotes && headerLine[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ";") semis++;
    else if (ch === ",") commas++;
    else if (ch === "\t") tabs++;
  }
  if (tabs > semis && tabs > commas) return "\t";
  return semis > commas ? ";" : ",";
}

/** Parseo campo a campo respetando comillas dobles y saltos de línea internos. */
export function parseCsvRecords(text: string): string[][] {
  // Quita el BOM inicial si existe.
  const clean = text.replace(/^\uFEFF/, "");
  const firstLineEnd = clean.search(/\r\n|\n|\r/);
  const headerLine = firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(headerLine);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Normaliza CRLF: al ver \r consume el \n siguiente.
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  // Último campo/registro si el fichero no termina en salto de línea.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

// ---------- Normalización de cabeceras y valores ----------

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[.\s]+/g, " ")
    .trim();
}

// Cabecera normalizada -> clave interna.
/** Claves que no van a `Member` sino a su suscripción. */
type SubscriptionKey = "planName" | "priceCents" | "subscriptionStartDate" | "sessionsRemaining";

const HEADER_MAP: Record<string, keyof ParsedMemberData | "mobile" | "ignore" | SubscriptionKey> = {
  nombre: "firstName",
  apellidos: "lastName",
  email: "email",
  telefono: "phone",
  movil: "mobile",
  "fecha de nacimiento": "birthDate",
  sexo: "sex",
  "direccion 1": "address",
  "direccion 2": "addressLine2",
  pais: "country",
  ciudad: "city",
  "c p": "postalCode",
  cp: "postalCode",
  provincia: "province",
  "ultimo acceso": "lastAccessAt",
  "ultima interaccion": "lastInteractionAt",
  "fecha de inscripcion": "joinedAt",
  "tipo de contacto": "state",
  "riesgo de abandono": "churnRisk",
  "aspiracion principal": "primaryAspiration",
  "aspiracion secundaria": "secondaryAspiration",
  "cuenta mywellness": "mywellnessAccount",
  "fecha de creacion de la cuenta": "accountCreatedAt",
  "id externo": "externalId",
  "identificador de la nube": "externalRef",
  // Cuota que el socio ya pagaba. Se aceptan varios rótulos porque cada
  // plataforma de origen los llama distinto y el CSV lo prepara el gimnasio a
  // mano: obligar a un nombre exacto solo genera importaciones fallidas.
  plan: "planName",
  tarifa: "planName",
  "plan actual": "planName",
  cuota: "priceCents",
  precio: "priceCents",
  "importe cuota": "priceCents",
  "fecha de alta de la cuota": "subscriptionStartDate",
  "alta de la cuota": "subscriptionStartDate",
  "sesiones restantes": "sessionsRemaining",
  // Columnas conocidas del export que no mapeamos (por ahora) — se ignoran sin ruido.
  "instructor fitness": "ignore",
  "entrenador personal": "ignore",
  entrenador: "ignore",
  "permanent token": "ignore",
};

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

const SEX_MAP: Record<string, Sex> = { mujer: "FEMALE", hombre: "MALE", otro: "OTHER" };
const RISK_MAP: Record<string, ChurnRisk> = { baja: "LOW", media: "MEDIUM", alta: "HIGH" };
// "Tipo de contacto" del origen -> estado del socio.
const STATE_MAP: Record<string, MemberState> = {
  miembro: "ACTIVE",
  "ex cliente": "CANCELLED",
  "cliente potencial": "PROSPECT",
};

function mapEnum<T>(raw: string | null, table: Record<string, T>): T | null {
  if (!raw) return null;
  return table[raw.toLowerCase().trim()] ?? null;
}

/** Acepta "YYYY-MM-DD" (formato del export) y "DD/MM/YYYY". Devuelve medianoche UTC. */
export function parseImportDate(raw: string | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (iso) {
    y = +iso[1];
    m = +iso[2];
    d = +iso[3];
  } else if (dmy) {
    d = +dmy[1];
    m = +dmy[2];
    y = +dmy[3];
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Mapeo de fichero a filas ----------

/**
 * Importe a céntimos. El CSV lo prepara el gimnasio desde su hoja de cálculo,
 * así que llega en formato español («45,00 €», «1.234,56») tanto como en el
 * anglosajón («45.00»). Distinguir uno de otro es el único punto delicado: en
 * «1.234,56» el punto es separador de millar y en «1234.56» es decimal, y
 * confundirlos cobra mil veces de más.
 */
export function parseImportPriceCents(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.replace(/[^\d.,-]/g, "").trim();
  if (!t) return null;

  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let normalized: string;
  if (lastComma === -1 && lastDot === -1) {
    normalized = t;
  } else {
    // El separador decimal es el que aparece MÁS A LA DERECHA; el otro, si lo
    // hay, es de millares y sobra.
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = t.split(thousandSep).join("").replace(decimalSep, ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function parseMembersCsv(text: string): ParsedCsv {
  const records = parseCsvRecords(text).filter((r) => r.some((c) => c.trim().length));
  if (records.length === 0) {
    return { rows: [], fatalError: "El archivo está vacío." };
  }

  const rawHeaders = records[0].map(normalizeHeader);
  const keys = rawHeaders.map((h) => HEADER_MAP[h] ?? null);

  if (!keys.includes("firstName") || !keys.includes("lastName")) {
    return {
      rows: [],
      fatalError:
        "No se reconoce la cabecera del CSV: faltan las columnas obligatorias «Nombre» y «Apellidos».",
    };
  }

  const rows: ParsedMemberRow[] = [];

  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    const raw: Partial<Record<keyof ParsedMemberData | "mobile" | SubscriptionKey, string | null>> = {};
    for (let c = 0; c < keys.length; c++) {
      const key = keys[c];
      if (!key || key === "ignore") continue;
      raw[key] = clean(cells[c]);
    }

    const errors: string[] = [];
    const firstName = raw.firstName ?? "";
    const lastName = raw.lastName ?? "";
    if (!firstName) errors.push("Falta el nombre.");
    if (!lastName) errors.push("Faltan los apellidos.");

    const email = raw.email ? raw.email.toLowerCase() : null;
    if (email && !EMAIL_RE.test(email)) errors.push(`Email con formato no válido: «${email}».`);

    // El teléfono usa "Teléfono"; si viene vacío, cae al "Móvil".
    const phone = raw.phone ?? raw.mobile ?? null;

    const externalRef = raw.externalRef ?? null;
    if (!externalRef && !email) {
      errors.push(
        "Sin «Identificador de la nube» ni email: no hay clave estable para importar esta fila."
      );
    }

    const data: ParsedMemberData = {
      firstName,
      lastName,
      email,
      phone,
      birthDate: parseImportDate(raw.birthDate ?? null),
      sex: mapEnum(raw.sex ?? null, SEX_MAP),
      address: raw.address ?? null,
      addressLine2: raw.addressLine2 ?? null,
      city: raw.city ?? null,
      province: raw.province ?? null,
      postalCode: raw.postalCode ?? null,
      country: raw.country ?? null,
      lastAccessAt: parseImportDate(raw.lastAccessAt ?? null),
      lastInteractionAt: parseImportDate(raw.lastInteractionAt ?? null),
      joinedAt: parseImportDate(raw.joinedAt ?? null),
      accountCreatedAt: parseImportDate(raw.accountCreatedAt ?? null),
      // null si la columna falta o trae un valor no reconocido: en la
      // actualización de un socio existente no debe pisar su estado actual.
      state: mapEnum(raw.state ?? null, STATE_MAP),
      churnRisk: mapEnum(raw.churnRisk ?? null, RISK_MAP),
      primaryAspiration:
        raw.primaryAspiration && raw.primaryAspiration.toLowerCase() !== "none"
          ? raw.primaryAspiration
          : null,
      secondaryAspiration:
        raw.secondaryAspiration && raw.secondaryAspiration.toLowerCase() !== "none"
          ? raw.secondaryAspiration
          : null,
      mywellnessAccount: raw.mywellnessAccount ?? null,
      externalId: raw.externalId ?? null,
      externalRef,
    };

    // El plan es lo que decide si esta fila trae cuota: sin nombre de plan no
    // hay nada que suscribir, y un precio suelto sin plan no significa nada.
    let subscription: ParsedSubscriptionData | null = null;
    const planName = raw.planName ?? null;
    if (planName) {
      const priceRaw = raw.priceCents ?? null;
      const priceCents = parseImportPriceCents(priceRaw);
      if (priceRaw && priceCents === null) {
        errors.push(`Importe de cuota no válido: «${priceRaw}».`);
      }

      const sessionsRaw = raw.sessionsRemaining ?? null;
      let sessionsRemaining: number | null = null;
      if (sessionsRaw) {
        const n = Number(sessionsRaw.replace(",", "."));
        if (!Number.isInteger(n) || n < 0) {
          errors.push(`Sesiones restantes no válidas: «${sessionsRaw}».`);
        } else {
          sessionsRemaining = n;
        }
      }

      subscription = {
        planName,
        priceCents,
        startDate: parseImportDate(raw.subscriptionStartDate ?? null),
        sessionsRemaining,
      };
    }

    rows.push({ rowNumber: r, data, subscription, errors });
  }

  return { rows, fatalError: null };
}
