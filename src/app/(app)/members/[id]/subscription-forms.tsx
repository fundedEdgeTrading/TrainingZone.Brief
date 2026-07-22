"use client";

import { useRef, useState, useTransition } from "react";
import {
  freezeSubscription,
  resumeSubscription,
  scheduleCancellation,
  cancelScheduledCancellation,
  updateSubscriptionPrice,
  addOneOffProduct,
} from "@/app/(app)/billing/subscription-actions";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** RB-PAGO-004: congelar/reanudar suscripción activa. */
export function FreezeSubscriptionForm({ subscriptionId }: { subscriptionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await freezeSubscription(fd);
          if (result.ok) {
            toast.success("Suscripción congelada.");
            formRef.current?.reset();
          } else toast.error(result.error);
        })
      }
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
    >
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Field label="Reanudar el (opcional)" hint="Vacío = congelación indefinida">
        <Input name="pauseUntil" type="date" />
      </Field>
      <Field label="Motivo" className="sm:col-span-2">
        <Input name="reason" required placeholder="Motivo de la congelación" />
      </Field>
      <div className="sm:col-span-3 flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          Congelar suscripción
        </Button>
      </div>
    </form>
  );
}

export function ResumeSubscriptionButton({ subscriptionId, memberId }: { subscriptionId: string; memberId: string }) {
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
          const result = await resumeSubscription(subscriptionId, memberId);
          if (result.ok) toast.success("Suscripción reanudada.");
          else toast.error(result.error);
        })
      }
    >
      {pending && <ButtonSpinner />}
      Reanudar suscripción
    </Button>
  );
}

/** RB-PAGO-006: programar cancelación — destructiva, doble confirmación + motivo obligatorio. */
export function ScheduleCancellationForm({ subscriptionId }: { subscriptionId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelAt, setCancelAt] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("subscriptionId", subscriptionId);
      fd.append("cancelAt", cancelAt);
      fd.append("reason", reason);
      const result = await scheduleCancellation(fd);
      if (result.ok) {
        toast.success("Cancelación programada.");
        setConfirming(false);
        setCancelAt("");
        setReason("");
      } else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <Field label="Fecha de baja">
        <Input type="date" value={cancelAt} onChange={(e) => setCancelAt(e.target.value)} />
      </Field>
      <Field label="Motivo" className="sm:col-span-2">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la cancelación" />
      </Field>
      <div className="sm:col-span-3 flex justify-end items-center gap-2">
        {confirming && <span className="text-xs text-critical">¿Confirmar programación de baja?</span>}
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={!cancelAt || !reason.trim() || pending}
          onClick={() => (confirming ? submit() : setConfirming(true))}
        >
          {pending && <ButtonSpinner />}
          {confirming ? "Sí, programar baja" : "Programar cancelación"}
        </Button>
        {confirming && (
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-faint">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export function CancelScheduledCancellationButton({ subscriptionId, memberId }: { subscriptionId: string; memberId: string }) {
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
          const result = await cancelScheduledCancellation(subscriptionId, memberId);
          if (result.ok) toast.success("Cancelación programada eliminada.");
          else toast.error(result.error);
        })
      }
    >
      {pending && <ButtonSpinner />}
      Anular baja programada
    </Button>
  );
}

/** RB-PAGO-007: cambio de precio con efecto desde el próximo ciclo (no retroactivo). */
export function UpdateSubscriptionPriceForm({ subscriptionId }: { subscriptionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await updateSubscriptionPrice(fd);
          if (result.ok) {
            toast.success("Precio actualizado desde el próximo ciclo.");
            formRef.current?.reset();
          } else toast.error(result.error);
        })
      }
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
    >
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Field label="Nuevo precio (€)">
        <Input name="newPriceCents" type="number" min="0" step="0.01" required />
      </Field>
      <Field label="Motivo" className="sm:col-span-2">
        <Input name="reason" required placeholder="Motivo del cambio de precio" />
      </Field>
      <div className="sm:col-span-3 flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          Actualizar precio
        </Button>
      </div>
    </form>
  );
}

/** RB-PAGO-005: venta puntual (producto/servicio fuera de suscripción). */
export function AddOneOffProductForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await addOneOffProduct(fd);
          if (result.ok) {
            toast.success("Venta puntual registrada.");
            formRef.current?.reset();
          } else toast.error(result.error);
        })
      }
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <Field label="Descripción" className="sm:col-span-2">
        <Input name="description" required placeholder="p.ej. Bono 5 sesiones sueltas" />
      </Field>
      <Field label="Importe (€)">
        <Input name="priceCents" type="number" min="0" step="0.01" required />
      </Field>
      <div className="sm:col-span-3 flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          Registrar venta puntual
        </Button>
      </div>
    </form>
  );
}
