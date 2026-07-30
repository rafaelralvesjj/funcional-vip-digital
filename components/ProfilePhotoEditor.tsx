"use client";

import { useRef, useState } from "react";

type ProfilePhotoEditorProps = {
  name?: string | null;
  initialImageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  onUpdated?: (imageUrl: string) => void;
};

function getInitials(name?: string | null): string {
  const cleanName = String(name || "Usuário").trim();

  if (!cleanName) return "U";

  const parts = cleanName.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";

  return `${first}${second}`.toUpperCase();
}

function normalizeImageUrl(value?: string | null): string | null {
  const url = String(value || "").trim();

  if (!url) return null;

  return url;
}

function getSizeClasses(size: "sm" | "md" | "lg") {
  if (size === "sm") {
    return {
      avatar: "h-12 w-12",
      initials: "text-sm",
      button: "h-6 w-6 text-[9px]",
    };
  }

  if (size === "md") {
    return {
      avatar: "h-14 w-14",
      initials: "text-sm",
      button: "h-7 w-7 text-[10px]",
    };
  }

  return {
    avatar: "h-16 w-16",
    initials: "text-lg",
    button: "h-7 w-7 text-[10px]",
  };
}

export default function ProfilePhotoEditor({
  name,
  initialImageUrl,
  size = "md",
  onUpdated,
}: ProfilePhotoEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(normalizeImageUrl(initialImageUrl));
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const classes = getSizeClasses(size);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setMessage(null);
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Envie uma imagem válida.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("A imagem precisa ter até 5MB.");
      event.target.value = "";
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
    formData.append("folder", "perfil");

      const uploadResponse = await fetch("/api/upload-profile-photo", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json().catch(() => null);

      if (!uploadResponse.ok || !uploadData?.url) {
        throw new Error(uploadData?.error || "Não foi possível enviar a imagem.");
      }

      const saveResponse = await fetch("/api/profile/photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl: uploadData.url,
        }),
      });

      const saveData = await saveResponse.json().catch(() => null);

      if (!saveResponse.ok || !saveData?.ok) {
        throw new Error(saveData?.error || "Imagem enviada, mas não foi possível salvar no perfil.");
      }

      const savedImageUrl = String(saveData.imageUrl || uploadData.url);

      setImageUrl(savedImageUrl);
      setMessage("Foto atualizada.");
      onUpdated?.(savedImageUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível atualizar a foto.");
    } finally {
      setUploading(false);
      event.target.value = "";
      setTimeout(() => {
        setMessage(null);
        setError(null);
      }, 3500);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative group">
        <div className={`${classes.avatar} shrink-0 overflow-hidden rounded-full border border-[#00A19C]/30 bg-[#1a1a1a] flex items-center justify-center shadow-lg shadow-black/20`}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Foto de ${name || "perfil"}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className={`${classes.initials} font-bold text-[#00A19C]`}>
              {getInitials(name)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${classes.button} absolute -bottom-1 -right-1 rounded-full bg-[#00A19C] text-[#0a0a0a] font-bold border border-[#0a0a0a] shadow-lg hover:bg-[#008B87] disabled:opacity-60`}
          title="Alterar foto"
          aria-label="Alterar foto"
        >
          {uploading ? "..." : "✎"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {(message || error) && (
        <p className={`max-w-[110px] text-center text-[9px] leading-tight ${error ? "text-red-300" : "text-green-300"}`}>
          {error || message}
        </p>
      )}
    </div>
  );
}
