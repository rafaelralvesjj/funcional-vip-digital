import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
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
      .replace(/\s+/g, "-")
      .toLowerCase();

    const path = `public/images/exercices/${originalName}`;

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
      url: `/images/exercices/${originalName}`,
      fileName: originalName,
    });
  } catch {
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
