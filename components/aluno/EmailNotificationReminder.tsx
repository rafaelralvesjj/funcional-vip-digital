"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fvd-email-notification-reminder-dismissed-v1";

export default function EmailNotificationReminder() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
      setVisible(!dismissed);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismissReminder() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // O aviso ainda pode ser fechado quando o navegador bloqueia o armazenamento.
    }

    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="rounded-xl border border-[#00A19C]/30 bg-[#00A19C]/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00A19C]/15 text-[#00A19C]">
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 11-6 0m2.5-11.75V3.5m-5.3 2.1L4.9 4.3m12.9 1.3l1.3-1.3"
            />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#f5f5f5]">
            Não perca os avisos da sua experiência
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[#d4d4d4]">
            Liberações de treino, avisos da gestão e outras atualizações importantes serão
            enviadas ao e-mail cadastrado. Mantenha as notificações do aplicativo de e-mail
            ativas no celular e confira também as pastas Spam, Lixo eletrônico e Promoções.
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-[#a1a1a1]">
            Continue acompanhando também o painel e o chat da plataforma para não perder
            nenhuma orientação do seu professor.
          </p>
        </div>

        <button
          type="button"
          onClick={dismissReminder}
          className="shrink-0 rounded-lg border border-[#00A19C]/30 px-2.5 py-1.5 text-[10px] font-semibold text-[#00A19C] transition hover:bg-[#00A19C]/10"
        >
          Entendi
        </button>
      </div>
    </section>
  );
}
