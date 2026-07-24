"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { signupAction } from "./actions";

export default function SignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [taxId, setTaxId] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signupAction(null, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.redirectTo === "/login") {
        router.push("/login?callbackUrl=%2Factivar");
        return;
      }
      router.push("/activar");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Nombre de la empresa">
        <Input name="orgName" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Mi gimnasio S.L." />
      </Field>
      <Field label="NIF/CIF" hint="Opcional, para la factura">
        <Input name="taxId" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="B12345678" />
      </Field>
      <Field label="Tu nombre">
        <Input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" />
      </Field>
      <Field label="Tu email">
        <Input type="email" name="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.com" />
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres">
        <Input type="password" name="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <ButtonSpinner />}
        {pending ? "Creando cuenta..." : "Crear mi cuenta →"}
      </Button>
    </form>
  );
}
