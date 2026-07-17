"use client";

import { signOut } from "next-auth/react";

export default function UserMenu({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-700">{name}</span>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
