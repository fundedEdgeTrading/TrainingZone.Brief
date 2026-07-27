"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addHealthRecord,
  resolveHealthRecordAction,
  addMemberNote,
  updateMemberData,
  deleteMember,
  resendMemberWelcome,
} from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

// Mismas clases que el control de field.tsx, para los <textarea> multilínea.
const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";

export function AddHealthRecordForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("INJURY");
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await addHealthRecord(fd);
          if (result.ok) {
            formRef.current?.reset();
            setType("INJURY");
            toast.success("Registro de salud guardado.");
          } else {
            toast.error(result.error);
          }
        })
      }
      className="border border-tz-linen rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end bg-tz-bone/40"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <Field label="Tipo">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="INJURY">Lesión</option>
          <option value="CHRONIC_CONDITION">Condición crónica</option>
          <option value="MEDICATION">Medicación</option>
          <option value="SURGERY">Cirugía</option>
          <option value="PREGNANCY">Embarazo</option>
          <option value="ALLERGY">Alergia</option>
        </Select>
      </Field>
      <Field
        label="Zona"
        hint={type === "INJURY" ? "Coincide con las reglas de aptitud (p.ej. hombro derecho)" : "Solo para lesiones"}
      >
        <Input name="zone" placeholder="p.ej. hombro derecho" disabled={type !== "INJURY"} />
      </Field>
      <Field label="Descripción" className="sm:col-span-2">
        <textarea
          name="description"
          required
          rows={2}
          className={CONTROL}
          placeholder="Detalle relevante para adaptar la sesión"
        />
      </Field>
      <Field label="Severidad">
        <Select name="severity">
          <option value="LOW">Baja</option>
          <option value="MEDIUM">Media</option>
          <option value="HIGH">Alta</option>
        </Select>
      </Field>
      <div className="sm:justify-self-end">
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

export function ResolveHealthButton({ recordId, memberId }: { recordId: string; memberId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveHealthRecordAction(recordId, memberId);
      if (result.ok) {
        toast.success("Registro marcado como resuelto.");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (confirming) {
    return (
      <button
        disabled={pending}
        onClick={handleResolve}
        className="text-xs font-semibold text-good hover:opacity-80 transition-opacity"
      >
        ¿Marcar resuelta?
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => setConfirming(true)}
      className="text-xs text-faint hover:text-good transition-colors duration-150"
    >
      Resolver
    </button>
  );
}

function fmtDate(d: string | null) {
  return d
    ? "Sí · " +
        new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    : "No";
}

const SECTION_TITLE = "font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-3.5";

export type MemberDataFormValues = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  birthDate: string | null;
  sex: string | null;
  occupation: string | null;
  emergencyContact: string | null;
  primaryCenterId: string;
  consentContractAt: string | null;
  consentHealthAt: string | null;
  consentImagesAt: string | null;
  consentMarketingAt: string | null;
};

export function MemberDataForm({
  member,
  centers,
}: {
  member: MemberDataFormValues;
  centers: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await updateMemberData(fd);
          if (result.ok) toast.success("Datos del socio guardados.");
          else toast.error(result.error);
        })
      }
      className="max-w-3xl"
    >
      <input type="hidden" name="memberId" value={member.id} />
      <div className={SECTION_TITLE}>Datos personales</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Field label="Nombre">
          <Input name="firstName" defaultValue={member.firstName} required />
        </Field>
        <Field label="Apellidos">
          <Input name="lastName" defaultValue={member.lastName} required />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input name="birthDate" type="date" defaultValue={member.birthDate ?? ""} />
        </Field>
        <Field label="Sexo">
          <Select name="sex" defaultValue={member.sex ?? ""}>
            <option value="">Sin especificar</option>
            <option value="FEMALE">Mujer</option>
            <option value="MALE">Hombre</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
        <Field label="Ocupación">
          <Input name="occupation" defaultValue={member.occupation ?? ""} />
        </Field>
        <Field label="Centro principal">
          <Select name="centerId" defaultValue={member.primaryCenterId}>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className={`${SECTION_TITLE} mt-6`}>Contacto</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Field label="Email">
          <Input name="email" type="email" defaultValue={member.email} required />
        </Field>
        <Field label="Teléfono">
          <Input name="phone" defaultValue={member.phone ?? ""} />
        </Field>
        <Field label="Contacto de emergencia" className="sm:col-span-2">
          <Input name="emergencyContact" defaultValue={member.emergencyContact ?? ""} />
        </Field>
      </div>

      <div className={`${SECTION_TITLE} mt-6`}>Dirección</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Field label="Dirección" className="sm:col-span-2">
          <Input name="address" defaultValue={member.address ?? ""} />
        </Field>
        <Field label="Dirección (línea 2)" className="sm:col-span-2">
          <Input name="addressLine2" defaultValue={member.addressLine2 ?? ""} />
        </Field>
        {/* El CP alimenta el mapa de calor del panel (RB-BI): 5 dígitos. */}
        <Field label="Código postal" hint="5 dígitos">
          <Input name="postalCode" defaultValue={member.postalCode ?? ""} inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="50001" />
        </Field>
        <Field label="Ciudad">
          <Input name="city" defaultValue={member.city ?? ""} />
        </Field>
        <Field label="Provincia">
          <Input name="province" defaultValue={member.province ?? ""} />
        </Field>
        <Field label="País">
          <Input name="country" defaultValue={member.country ?? ""} />
        </Field>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-6 max-w-lg">
        <dt className="text-muted">Consentimiento contrato</dt>
        <dd className="text-tz-black">{fmtDate(member.consentContractAt)}</dd>
        <dt className="text-muted">Consentimiento datos de salud</dt>
        <dd className="text-tz-black">{fmtDate(member.consentHealthAt)}</dd>
        <dt className="text-muted">Uso de imágenes (evolución)</dt>
        <dd className="text-tz-black">{fmtDate(member.consentImagesAt)}</dd>
        <dt className="text-muted">Consentimiento marketing</dt>
        <dd className="text-tz-black">{fmtDate(member.consentMarketingAt)}</dd>
      </dl>
      <div className="mt-5">
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

export function ResendWelcomeButton({ memberId }: { memberId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resendMemberWelcome(memberId);
          if (result.ok) toast.success("Email de bienvenida reenviado.");
          else toast.error(result.error);
        })
      }
    >
      {pending && <ButtonSpinner />}
      {pending ? "Enviando..." : "Reenviar bienvenida"}
    </Button>
  );
}

// Baja definitiva del socio: siempre con confirmación previa. Si tiene una
// suscripción viva el modal explica por qué no se puede borrar y no ofrece
// confirmar (el servidor vuelve a comprobarlo en deleteMember).
export function DeleteMemberButton({
  memberId,
  memberName,
  activeSubscriptionPlan,
}: {
  memberId: string;
  memberName: string;
  activeSubscriptionPlan: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const blockedReason = activeSubscriptionPlan
    ? `No se puede eliminar: el socio tiene la suscripción «${activeSubscriptionPlan}» en vigor. Cancélala desde la pestaña «Contratación» y vuelve a intentarlo.`
    : null;

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteMember(memberId);
      if (result.ok) {
        toast.success("Socio eliminado.");
        setOpen(false);
        router.replace("/members");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Eliminar socio
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
        pending={pending}
        blockedReason={blockedReason}
        kicker="Eliminar socio"
        title={`¿Eliminar a ${memberName}?`}
        description={
          <>
            Se borrarán de forma permanente su ficha, reservas, cobros, evolución, bitácora, datos de salud y su acceso
            al portal. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Sí, eliminar"
        pendingLabel="Eliminando..."
      />
    </>
  );
}

export function AddNoteForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await addMemberNote(fd);
          if (result.ok) {
            formRef.current?.reset();
            toast.success("Nota añadida a la bitácora.");
          } else {
            toast.error(result.error);
          }
        })
      }
      className="space-y-2"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <textarea
        name="body"
        required
        rows={3}
        className={CONTROL}
        placeholder="Añadir observación de bitácora (visible para todo el staff)..."
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Añadir a la bitácora"}
        </Button>
      </div>
    </form>
  );
}
