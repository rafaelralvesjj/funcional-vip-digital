"use client";

import { signOut } from "next-auth/react";

export default function SairButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/auth/signin" })}
      className="text-xs text-[#a1a1a1] hover:text-red-400 transition"
    >
      Sair
    </button>
  );
}
