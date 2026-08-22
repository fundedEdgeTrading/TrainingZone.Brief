import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { Card } from "@/components/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Field, Input } from "@/components/ui/field";
import { ImageDropzone } from "@/components/ui/dropzone";
import { ActionForm } from "@/components/ui/action-form";
import { ConsentToggle } from "./consent-toggle";
import { EmailPreferenceToggle } from "./email-preference-toggle";
import { updateMyProfileAction } from "./actions";

export default async function PortalProfilePage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-4">
      <PageHeader description="Tus datos de contacto, tu foto y tus consentimientos — solo tú puedes cambiarlos aquí." />

      <Card title="Datos de contacto">
        <ActionForm action={updateMyProfileAction} successMessage="Datos actualizados." className="flex flex-col gap-4">
          <ImageDropzone name="photoUrl" label="Foto de perfil" shape="circle" sizeClassName="w-24 h-24" defaultValue={member.photoUrl} />

          <Field label="Teléfono">
            <Input name="phone" type="tel" defaultValue={member.phone ?? ""} placeholder="+34 600 000 000" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Dirección">
              <Input name="address" defaultValue={member.address ?? ""} />
            </Field>
            <Field label="Dirección 2" hint="Piso, puerta...">
              <Input name="addressLine2" defaultValue={member.addressLine2 ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

          <Field label="Contacto de emergencia">
            <Input name="emergencyContact" defaultValue={member.emergencyContact ?? ""} placeholder="Nombre y teléfono" />
          </Field>

          <button
            type="submit"
            className="self-start bg-brand-ink text-tz-bone rounded-[11px] px-6 py-3 font-display font-extrabold text-sm uppercase tracking-[.03em] transition-transform duration-150 hover:-translate-y-0.5 active:scale-[.98]"
          >
            Guardar cambios
          </button>
        </ActionForm>
      </Card>

      <div id="consentimientos" className="scroll-mt-6">
      <Card title="Tus consentimientos" meta="RGPD">
        <p className="text-[13px] text-brand-muted -mt-3 mb-2">
          Puedes retirarlos en cualquier momento. Retirar datos de salud o imágenes no borra lo ya registrado, pero
          deja de permitir que se capture nueva información de ese tipo.
        </p>
        <ConsentToggle
          kind="health"
          label="Datos de salud (Art. 9 RGPD)"
          description="Lesiones, patologías y composición corporal que tu entrenador usa para adaptar tu entrenamiento."
          granted={member.consentHealth}
          grantedAt={member.consentHealthAt}
        />
        <ConsentToggle
          kind="images"
          label="Uso de imágenes"
          description="Fotos de evolución en tu ficha y tu portal."
          granted={member.consentImages}
          grantedAt={member.consentImagesAt}
        />
        <ConsentToggle
          kind="ai"
          label="Propuestas con inteligencia artificial"
          description="Tus datos, seudonimizados, se tratan con sistemas de IA de proveedores que actúan como encargados del tratamiento para preparar propuestas de programación que revisa tu entrenador. Oponerte no afecta a tu acceso al servicio."
          granted={member.consentAI}
          grantedAt={member.consentAIAt}
        />
        <ConsentToggle
          kind="marketing"
          label="Comunicaciones de marketing"
          description="Promociones y novedades del centro."
          granted={member.consentMarketing}
          grantedAt={member.consentMarketingAt}
        />
      </Card>
      </div>

      <Card title="Correos que recibes">
        <p className="text-[13px] text-brand-muted -mt-3 mb-2">
          Los correos de tu cuenta y de tu cuota —acceso, contraseña y cobros— no se pueden desactivar: son parte del
          servicio. Estos otros los eliges tú, aquí o desde el pie de cualquiera de nuestros correos.
        </p>
        <EmailPreferenceToggle
          kind="vacancy"
          label="Avisos de plaza liberada"
          description="Cuando alguien cancela y queda un hueco en una sesión para la que tienes bono activo."
          enabled={member.notifyVacancies}
        />
        <EmailPreferenceToggle
          kind="assessment"
          label="Recordatorios de valoración"
          description="Cuando te toca una valoración periódica con tu entrenador."
          enabled={member.notifyAssessments}
        />
        <EmailPreferenceToggle
          kind="birthday"
          label="Felicitación de cumpleaños"
          description="Un correo al año, el día de tu cumpleaños."
          enabled={member.notifyBirthday}
        />
        {member.emailOptOutAt && (
          <p className="text-[12px] text-brand-muted border-t border-tz-sand pt-3 mt-3">
            Te diste de baja de todos los correos prescindibles el{" "}
            {member.emailOptOutAt.toLocaleDateString("es-ES")}. Activa cualquiera de los de arriba para volver a
            recibirlo.
          </p>
        )}
      </Card>

      <Card title="Tus datos" meta="RGPD">
        <p className="text-[13px] text-brand-muted -mt-3 mb-3">
          Descarga una copia de los datos que nos has aportado: perfil, suscripciones, pagos, reservas, progreso y
          más — en un archivo que puedes guardar o llevarte a otro sitio.
        </p>
        <a
          href="/api/portal/export-data"
          download
          className="inline-flex items-center gap-2 bg-white text-brand-text border border-brand-border rounded-[11px] px-5 py-3 font-display font-bold text-sm hover:bg-tz-bone transition-colors duration-150"
        >
          Descargar mis datos →
        </a>
      </Card>
    </div>
  );
}
