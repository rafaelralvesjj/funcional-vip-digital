import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import JSZip from "jszip";
import path from "node:path";
import { promises as fs } from "node:fs";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

function canExport(role?: string | null): boolean {
  return ["GESTOR", "ADMIN"].includes(normalizeRole(role));
}

function slugify(value: string): string {
  return String(value || "exercicio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "exercicio";
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function getExtensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, "http://local").pathname;
    const ext = path.extname(pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : null;
  } catch {
    return null;
  }
}

function getExtensionFromContentType(contentType: string | null): string {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".jpg";
}

async function readImage(url: string, origin: string): Promise<{ buffer: Buffer; extension: string }> {
  const normalized = String(url || "").trim();
  if (!normalized) throw new Error("Imagem não informada.");

  if (normalized.startsWith("/")) {
    const publicPath = path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
    try {
      const buffer = await fs.readFile(publicPath);
      return { buffer, extension: getExtensionFromUrl(normalized) || ".jpg" };
    } catch {
      // Em produção, a imagem pode estar publicada fora do filesystem da função.
    }
  }

  const absoluteUrl = normalized.startsWith("http://") || normalized.startsWith("https://")
    ? normalized
    : new URL(normalized, origin).toString();

  const response = await fetch(absoluteUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = getExtensionFromUrl(absoluteUrl) || getExtensionFromContentType(response.headers.get("content-type"));
  return { buffer, extension };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canExport(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
    const exercises = await prisma.exerciseLibrary.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        muscleGroup: true,
        imageUrl: true,
        active: true,
        equipmentTags: true,
        levelTags: true,
        instructions: true,
        safetyNotes: true,
      },
    });

    const zip = new JSZip();
    const imagesFolder = zip.folder("imagens");
    const manifestRows: string[][] = [[
      "ordem",
      "id",
      "nome",
      "grupo_muscular",
      "arquivo_imagem",
      "imagem_original",
      "status_exportacao",
      "ativo",
      "equipamentos",
      "nivel",
      "descricao",
      "como_executar",
      "cuidados",
    ]];

    let exported = 0;
    let missing = 0;
    let failed = 0;

    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      const order = String(index + 1).padStart(3, "0");
      const baseName = `${order}_${slugify(exercise.name)}`;
      let fileName = "";
      let status = "SEM_IMAGEM";

      if (!exercise.imageUrl) {
        missing += 1;
      } else {
        try {
          const image = await readImage(exercise.imageUrl, req.nextUrl.origin);
          fileName = `${baseName}${image.extension}`;
          imagesFolder?.file(fileName, image.buffer);
          exported += 1;
          status = "EXPORTADA";
        } catch (error: any) {
          failed += 1;
          status = `ERRO: ${String(error?.message || "falha ao baixar imagem")}`;
        }
      }

      manifestRows.push([
        order,
        exercise.id,
        exercise.name,
        exercise.muscleGroup,
        fileName,
        exercise.imageUrl || "",
        status,
        exercise.active ? "SIM" : "NAO",
        exercise.equipmentTags || "",
        exercise.levelTags || "",
        exercise.description || "",
        exercise.instructions || "",
        exercise.safetyNotes || "",
      ]);
    }

    const csv = "\uFEFF" + manifestRows.map((row) => row.map(csvCell).join(";")).join("\n");
    zip.file("manifesto_biblioteca.csv", csv);
    zip.file(
      "LEIA-ME.txt",
      [
        "EXPORTAÇÃO DA BIBLIOTECA DE EXERCÍCIOS — FUNCIONAL VIP DIGITAL",
        "",
        `Exercícios encontrados: ${exercises.length}`,
        `Imagens exportadas: ${exported}`,
        `Exercícios sem imagem: ${missing}`,
        `Falhas ao baixar imagem: ${failed}`,
        "",
        "A pasta 'imagens' contém uma imagem de capa por exercício, numerada na mesma ordem do arquivo CSV.",
        "Use essas imagens individualmente no CapCut para gerar os vídeos.",
        "O arquivo manifesto_biblioteca.csv ajuda a relacionar cada imagem ao exercício correto e guarda os dados técnicos da biblioteca.",
      ].join("\n")
    );

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="biblioteca-exercicios-para-ia-${date}.zip"`,
        "Cache-Control": "no-store",
        "X-Exported-Images": String(exported),
        "X-Missing-Images": String(missing),
        "X-Failed-Images": String(failed),
      },
    });
  } catch (error: any) {
    console.error("GET /api/exercise-library/export error:", error);
    return NextResponse.json(
      {
        error: "Não foi possível exportar a biblioteca.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
