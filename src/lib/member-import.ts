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
  state: MemberState;
  churnRisk: ChurnRisk | null;
  primaryAspiration: string | null;
  secondaryAspiration: string | null;
  mywellnessAccount: string | null;
  externalId: string | null;
  externalRef: string | null;
};

export type ParsedMemberRow = {
  /** 1-based, referido a la fila de datos (sin contar la cabecera). */
  rowNumber: number;
  data: ParsedMemberData;
  errors: string[];
};

export type ParsedCsv = {
  rows: ParsedMemberRow[];
  /** Errores a nivel de fichero (cabecera ausente, sin filas...). */
  fatalError: string | null;
};

// ---------- Parser CSV (RFC 4180, con autodetección de separador) ----------

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
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
const HEADER_MAP: Record<string, keyof ParsedMemberData | "mobile" | "ignore"> = {
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
    const raw: Partial<Record<keyof ParsedMemberData | "mobile", string | null>> = {};
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
      state: mapEnum(raw.state ?? null, STATE_MAP) ?? "PROSPECT",
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

    rows.push({ rowNumber: r, data, errors });
  }

  return { rows, fatalError: null };
}
