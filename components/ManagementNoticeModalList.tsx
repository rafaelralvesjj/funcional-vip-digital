"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReadStatusVariant = "read" | "pending" | "neutral";

type ManagementNoticeItem = {
  id: string;
  title: string;
  content: string;
  type?: string | null;
  createdAt: string;
  authorName: string;
  authorRole?: string | null;
  targetLabel: string;
  readByCurrentUser?: boolean;
  readStatusLabel?: string;
  readStatusVariant?: ReadStatusVariant;
  readStatusDescription?: string;
};

type Props = {
  notices: ManagementNoticeItem[];
  emptyMessage?: string;
  markAsReadOnClose?: boolean;
  showReadStatus?: boolean;
};

function formatDate(dateStr: string): string {
  if (!dateStr) return "--/--/----";

  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getRoleLabel(role?: string | null): string {
  const normalizedRole = String(role || "").toUpperCase();

  if (normalizedRole === "GESTOR" || normalizedRole === "ADMIN") {
    return "GESTOR";
  }

  if (normalizedRole === "PROFESSOR" || normalizedRole === "TEACHER") {
    return "PROFESSOR";
  }

  return normalizedRole || "GESTOR";
}

function getRoleBadgeClass(role?: string | null): string {
  const normalizedRole = String(role || "").toUpperCase();

  if (normalizedRole === "GESTOR" || normalizedRole === "ADMIN") {
    return "bg-amber-900/30 text-amber-400 border border-amber-500/20";
  }

  if (normalizedRole === "PROFESSOR" || normalizedRole === "TEACHER") {
    return "bg-emerald-900/30 text-emerald-400 border border-emerald-500/20";
  }

  return "bg-zinc-800 text-zinc-400 border border-zinc-700";
}

export default function ManagementNoticeModalList({
  notices,
  emptyMessage = "Nenhum aviso da gestão.",
  markAsReadOnClose = false,
  showReadStatus = false,
}: Props) {
  const router = useRouter();
  const [selectedNotice, setSelectedNotice] = useState<ManagementNoticeItem | null>(null);
  const [closing, setClosing] = useState(false);
  const [readNoticeIds, setReadNoticeIds] = useState<Set<string>>(
    () => new Set(notices.filter((notice) => notice.readByCurrentUser).map((notice) => notice.id))
  );

  function isRead(notice: ManagementNoticeItem): boolean {
    return readNoticeIds.has(notice.id) || Boolean(notice.readByCurrentUser);
  }

  function getStatusLabel(notice: ManagementNoticeItem): string {
    if (markAsReadOnClose) {
      return isRead(notice) ? "Lido" : "Pendente";
    }

    return notice.readStatusLabel || (isRead(notice) ? "Lido" : "Pendente");
  }

  function getStatusVariant(notice: ManagementNoticeItem): ReadStatusVariant {
    if (markAsReadOnClose) {
      return isRead(notice) ? "read" : "pending";
    }

    return notice.readStatusVariant || (isRead(notice) ? "read" : "pending");
  }

  function getStatusClass(notice: ManagementNoticeItem): string {
    const variant = getStatusVariant(notice);

    if (variant === "read") {
      return "bg-emerald-500/10 text-emerald-400";
    }

    if (variant === "neutral") {
      return "bg-zinc-500/10 text-zinc-400";
    }

    return "bg-amber-500/10 text-amber-400";
  }

  async function closeModal() {
    if (!selectedNotice || closing) return;

    setClosing(true);

    try {
      if (markAsReadOnClose && !isRead(selectedNotice)) {
        await fetch("/api/notices/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noticeId: selectedNotice.id }),
        });

        setReadNoticeIds((current) => {
          const updated = new Set(current);
          updated.add(selectedNotice.id);
          return updated;
        });
      }
    } finally {
      setSelectedNotice(null);
      setClosing(false);

      if (markAsReadOnClose) {
        router.refresh();
      }
    }
  }

  if (notices.length === 0) {
    return <p className="text-[#a1a1a1]">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="bg-[#111111] border border-[#ffffff10] rounded-xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setSelectedNotice(notice)}
              className="w-full p-4 text-left hover:bg-[#0a0a0a] transition-colors"
            >
              <div className="flex justify-between items-start gap-4 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRoleBadgeClass(notice.authorRole)}`}>
                    {getRoleLabel(notice.authorRole)}
                  </span>

                  <span className="text-sm font-bold text-[#f5f5f5] truncate">
                    {notice.authorName || "Gestão"}
                  </span>
                </div>

                <span className="text-[10px] text-[#a1a1a1] shrink-0">
                  {formatDate(notice.createdAt)}
                </span>
              </div>

              <p className="text-sm text-[#f5f5f5] mb-3 whitespace-pre-wrap">
                {notice.title || "Aviso da gestão"}
              </p>

              <p className="text-xs text-[#a1a1a1] mb-3">
                Para:{" "}
                <span className="text-[#D4A373]">
                  {notice.targetLabel || "Não informado"}
                </span>
              </p>

              <div className="flex justify-between items-center gap-4">
                {showReadStatus ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded ${getStatusClass(notice)}`}>
                    {getStatusLabel(notice)}
                  </span>
                ) : (
                  <span className="text-[10px] text-[#a1a1a1]">
                    Aviso
                  </span>
                )}

                <span className="text-xs text-[#D4A373]">
                  Abrir aviso
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>

      {selectedNotice && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-[#111111] border border-[#ffffff10] rounded-2xl w-full max-w-lg shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#ffffff10] p-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRoleBadgeClass(selectedNotice.authorRole)}`}>
                    {getRoleLabel(selectedNotice.authorRole)}
                  </span>

                  <span className="text-sm font-bold text-[#f5f5f5]">
                    {selectedNotice.authorName || "Gestão"}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-[#f5f5f5]">
                  {selectedNotice.title || "Aviso da gestão"}
                </h3>

                <p className="text-xs text-[#a1a1a1] mt-1">
                  {formatDate(selectedNotice.createdAt)}
                </p>

                <p className="text-xs text-[#a1a1a1] mt-2">
                  Para:{" "}
                  <span className="text-[#D4A373]">
                    {selectedNotice.targetLabel || "Não informado"}
                  </span>
                </p>

                {showReadStatus && (
                  <span className={`inline-flex mt-2 px-2 py-0.5 rounded text-[10px] ${getStatusClass(selectedNotice)}`}>
                    {getStatusLabel(selectedNotice)}
                  </span>
                )}

                {showReadStatus && selectedNotice.readStatusDescription && (
                  <p className="text-[11px] text-[#a1a1a1] mt-2">
                    {selectedNotice.readStatusDescription}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={closing}
                className="text-[#a1a1a1] hover:text-white text-xl leading-none disabled:opacity-50"
                aria-label="Fechar aviso"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-[#f5f5f5] whitespace-pre-wrap">
                {selectedNotice.content}
              </p>
            </div>

            <div className="p-4 border-t border-[#ffffff10]">
              <button
                type="button"
                onClick={closeModal}
                disabled={closing}
                className="w-full bg-[#D4A373] text-black font-bold py-2 rounded-lg hover:bg-[#b88b5d] transition-colors disabled:opacity-50"
              >
                {closing ? "Fechando..." : "Fechar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
