import type { Metadata } from "next";
import Link from "next/link";
import AptaLogo from "@/components/apta-logo";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Registrar organización · Apta",
};

export default function SignupPage() {
  return (
    <div className="h-dvh flex bg-tz-bone overflow-y-auto">
      <div className="flex-1 min-w-0 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <AptaLogo variant="dark" className="text-4xl" />
          </div>
          <div className="mb-5">
            <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] text-tz-black">
              Da de alta tu gimnasio
            </h1>
            <p className="text-sm text-muted mt-1">
              Solo empresa y acceso de dirección. Centros, personal y socios se añaden después.
            </p>
          </div>
          <div className="bg-white border border-tz-linen rounded-card shadow-pop p-6 lg:p-8">
            <SignupForm />
          </div>
          <p className="text-center text-sm text-muted mt-6">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-tz-black underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
