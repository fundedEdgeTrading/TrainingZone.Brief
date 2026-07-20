import type { Metadata } from "next";
import RegisterWizard from "./register-wizard";

export const metadata: Metadata = {
  title: "Registrar organización · Training Zone",
};

export default function RegisterPage() {
  return <RegisterWizard />;
}
