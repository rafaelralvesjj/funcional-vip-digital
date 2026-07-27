import { NextResponse } from "next/server";

// 🔥 Tipos MIME permitidos
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

// 🔥 Tamanho máximo: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folderRaw = String(formData.get("folder") || "").trim();

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // 🔥 Validação de tipo de arquivo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Tipo de arquivo não permitido: ${file.type || "desconhecido"}. Aceitamos imagens, vídeos, PDF, Word e TXT.`,
        },
        { status: 400 }
      );
    }

    // 🔥 Validação de tamanho máximo
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). O limite é de 50MB.`,
        },
        { status: 400 }
      );
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!token || !owner || !repo) {
      return NextResponse.json({ error: "GitHub não configurado" }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const content = buffer.toString("base64");

    const originalName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();

    const safeFolder = folderRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();

    const allowedFolders = ["", "biblioteca", "sequencias", "videos", "chat", "documentos", "perfil"];
    const folder = allowedFolders.includes(safeFolder) ? safeFolder : "biblioteca";
    const uniqueName = `${Date.now()}-${originalName}`;
    const relativePath = folder ? `${folder}/${uniqueName}` : uniqueName;
    const path = `public/images/exercices/${relativePath}`;

    // Verifica se já existe
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    let sha: string | undefined;
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    const body = {
      message: sha ? `Update ${path}` : `Add ${path}`,
      content,
      ...(sha && { sha }),
    };

    const putRes = await fetch(getUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      return NextResponse.json(
        { error: `Erro no GitHub: ${err.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: `/images/exercices/${relativePath}`,
      fileName: uniqueName,
      originalName: file.name,
      mimeType: file.type,
      kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document",
    });
  } catch {
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
 }
