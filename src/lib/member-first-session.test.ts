import test from "node:test";
import assert from "node:assert/strict";
import {
  ESSENTIAL_PROFILE_FIELDS,
  missingEssentialProfileFields,
  type EssentialProfileSource,
} from "./member-first-session";
import { memberInitialPartSchema, initialAssessmentSchema } from "./assessments/schemas";

/**
 * El muro de la primera sesión decide si un socio entra o se queda en la
 * puerta, así que lo que se prueba aquí es que no se pase de largo (dejar
 * entrar a alguien sin CP rompe el mapa de barrios en silencio) ni se pase de
 * frenada (bloquear a un socio que ya lo tiene todo es un bug muy caro: el
 * socio no puede hacer nada al respecto salvo llamar al centro).
 */

/** Socio con todo relleno; cada test rompe solo lo que quiere probar. */
const COMPLETO: EssentialProfileSource = {
  birthDate: new Date("1989-02-06"),
  phone: "+34655580450",
  postalCode: "50007",
  address: "Calle Mayor 1",
  city: "Zaragoza",
  province: "Zaragoza",
  emergencyContact: "Ana — 600111222",
};

test("un socio con todos los datos esenciales no ve el muro", () => {
  assert.deepEqual(missingEssentialProfileFields(COMPLETO), []);
});

test("detecta cada campo esencial que falte", () => {
  for (const field of ESSENTIAL_PROFILE_FIELDS) {
    const sinUno = { ...COMPLETO, [field.key]: null };
    assert.deepEqual(
      missingEssentialProfileFields(sinUno),
      [field.key],
      `no detecta que falta «${field.key}»`
    );
  }
});

test("una cadena en blanco no cuenta como dato", () => {
  // La importación escribe "" en el email cuando el CSV no lo trae, y el mismo
  // patrón puede llegar a cualquier columna de texto: un espacio no es un CP.
  assert.deepEqual(missingEssentialProfileFields({ ...COMPLETO, postalCode: "" }), ["postalCode"]);
  assert.deepEqual(missingEssentialProfileFields({ ...COMPLETO, city: "   " }), ["city"]);
});

test("un socio recién importado del CSV de referencia debe los datos de domicilio", () => {
  // Retrato de una fila real del export de MyWellness: trae nombre, email,
  // móvil y fecha de nacimiento, y deja en blanco todo el domicilio.
  const importado: EssentialProfileSource = {
    birthDate: new Date("1987-10-30"),
    phone: "+34610024105",
    postalCode: null,
    address: null,
    city: null,
    province: null,
    emergencyContact: null,
  };
  assert.deepEqual(missingEssentialProfileFields(importado), [
    "postalCode",
    "address",
    "city",
    "province",
    "emergencyContact",
  ]);
});

/**
 * La parte del socio tiene que seguir siendo un subconjunto ESTRICTO de la
 * valoración completa. Si alguien añadiera el screening aquí, el socio acabaría
 * autodiagnosticándose una patología cardiovascular desde el sofá y el PAR-Q
 * dejaría de significar lo que significa.
 */
const PARTE_DEL_SOCIO = {
  pesoKg: 68.5,
  dolorActual: 2,
  calidadSueno: 3,
  estres: 4,
  energia: 3,
  diasPorSemana: "2",
  perfil: {
    edad: 37,
    sexo: "MUJER",
    alturaCm: 165,
    objetivoPrincipal: "Volver a correr 10 km sin dolor de rodilla",
    objetivoSecundario: "",
    motivacionReal: "",
    queLeHariaAbandonar: "",
  },
  experiencia: {
    nivelActividad: "MEDIO",
    haEntrenadoAntes: true,
    anosExperiencia: 3,
    tecnicaBasicos: "MEDIA",
    ejerciciosNoTolera: "",
  },
};

test("la parte del socio se valida por su cuenta", () => {
  assert.equal(memberInitialPartSchema.safeParse(PARTE_DEL_SOCIO).success, true);
});

test("la parte del socio NO basta para cerrar la valoración inicial", () => {
  // Sin screening ni PAR-Q el esquema completo tiene que rechazarla: es lo que
  // impide que el borrador del socio se cuele como valoración cerrada y
  // propague registros de salud que nadie ha firmado.
  assert.equal(initialAssessmentSchema.safeParse(PARTE_DEL_SOCIO).success, false);
});

test("la parte del socio no acepta el screening aunque se lo cuelen", () => {
  const conScreening = {
    ...PARTE_DEL_SOCIO,
    screening: { cardiovascular: true, hipertension: false, diabetes: false },
  };
  const parsed = memberInitialPartSchema.safeParse(conScreening);
  assert.equal(parsed.success, true);
  // zod descarta lo que no declara: el screening no llega a `answers`, así que
  // el entrenador no puede encontrárselo ya contestado.
  assert.equal("screening" in parsed.data!, false);
});

test("el objetivo principal es obligatorio para el socio", () => {
  const sinObjetivo = { ...PARTE_DEL_SOCIO, perfil: { ...PARTE_DEL_SOCIO.perfil, objetivoPrincipal: "" } };
  assert.equal(memberInitialPartSchema.safeParse(sinObjetivo).success, false);
});

test("el borrador del socio encaja tal cual en la valoración completa", () => {
  // Lo que garantiza el prefill del entrenador: sus respuestas más el tramo
  // clínico tienen que formar una valoración válida, sin transformar nada.
  const completa = {
    ...PARTE_DEL_SOCIO,
    screening: {
      cardiovascular: false,
      hipertension: false,
      diabetes: false,
      medicacion: "",
      cirugias: "",
      lesionesActuales: "",
      zonasDolor: [],
    },
    marcas: [],
    cierre: { notasEntrenador: "", consentimientoParq: true, autorizacionImagen: false },
  };
  assert.equal(initialAssessmentSchema.safeParse(completa).success, true);
});
