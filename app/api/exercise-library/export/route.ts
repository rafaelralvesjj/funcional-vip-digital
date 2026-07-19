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
  return (
    String(value || "exercicio")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "exercicio"
  );
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function getExtensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, "http://local").pathname;
    const ext = path.extname(pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
      ? ext
      : null;
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

async function readImage(
  url: string,
  origin: string
): Promise<{ buffer: Buffer; extension: string }> {
  const normalized = String(url || "").trim();
  if (!normalized) throw new Error("Imagem não informada.");

  if (normalized.startsWith("/")) {
    const publicPath = path.join(
      process.cwd(),
      "public",
      normalized.replace(/^\/+/, "")
    );

    try {
      const buffer = await fs.readFile(publicPath);
      return {
        buffer,
        extension: getExtensionFromUrl(normalized) || ".jpg",
      };
    } catch {
      // Em produção, o arquivo pode estar hospedado fora do filesystem da função.
    }
  }

  const absoluteUrl =
    normalized.startsWith("http://") || normalized.startsWith("https://")
      ? normalized
      : new URL(normalized, origin).toString();

  const response = await fetch(absoluteUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension =
    getExtensionFromUrl(absoluteUrl) ||
    getExtensionFromContentType(response.headers.get("content-type"));

  return { buffer, extension };
}

function compactText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNarration(exercise: {
  name: string;
  instructions: string | null;
  safetyNotes: string | null;
}): string {
  const instructions = compactText(exercise.instructions);
  const safety = compactText(exercise.safetyNotes);

  if (instructions && safety) {
    return `${instructions} ${safety}`;
  }

  if (instructions) return instructions;
  if (safety) return safety;

  return `Execute ${exercise.name} com postura estável, movimento controlado e respiração natural.`;
}

function buildVideoPrompt(exercise: {
  name: string;
  description: string;
  muscleGroup: string;
  equipmentTags: string | null;
  levelTags: string | null;
  instructions: string | null;
  commonMistakes: string | null;
  safetyNotes: string | null;
  contraindications: string | null;
  sequenceFramesCount: number | null;
  sequencePrompt: string | null;
}): string {
  const narration = buildNarration(exercise);

  return [
    `VÍDEO DO EXERCÍCIO: ${exercise.name}`,
    "",
    "Use a imagem principal como imagem de origem e a imagem de sequência apenas como referência técnica do movimento.",
    "Anime mantendo exatamente a mesma pessoa, rosto, roupa, equipamento, iluminação, cenário e identidade visual.",
    "Não altere anatomia, proporções corporais, mãos, pés, equipamento ou fundo.",
    "",
    "MOVIMENTO:",
    `- Exercício: ${exercise.name}`,
    `- Grupo muscular: ${compactText(exercise.muscleGroup) || "não informado"}`,
    `- Descrição: ${compactText(exercise.description) || "não informada"}`,
    `- Equipamento: ${compactText(exercise.equipmentTags) || "não informado"}`,
    `- Nível: ${compactText(exercise.levelTags) || "não informado"}`,
    `- Como executar: ${compactText(exercise.instructions) || "executar com controle"}`,
    `- Erros a evitar: ${compactText(exercise.commonMistakes) || "evitar compensações e movimentos bruscos"}`,
    `- Cuidados: ${compactText(exercise.safetyNotes) || "manter postura segura e amplitude confortável"}`,
    `- Atenções: ${compactText(exercise.contraindications) || "adaptar em caso de dor ou restrição individual"}`,
    "",
    "PADRÃO DO VÍDEO:",
    "- Duração entre 6 e 8 segundos.",
    "- Mostrar de 2 a 3 repetições controladas, quando o exercício for dinâmico.",
    "- Se o exercício for isométrico, mostrar entrada segura, sustentação e saída controlada.",
    "- Câmera estável e corpo inteiro visível.",
    "- Movimento contínuo, natural, didático e tecnicamente coerente.",
    "- Sem texto na tela, sem legendas, sem logotipo, sem música e sem efeitos exagerados.",
    "- Não inventar fases diferentes da execução correta.",
    "",
    "NARRAÇÃO:",
    '- Gerar voz em português brasileiro nativo, dicção clara, tom profissional de professor de educação física e sem sotaque estrangeiro.',
    `- Falar exatamente: "${narration}"`,
    "",
    "ENTREGA:",
    "- Entregar um único vídeo final com a narração sincronizada.",
    "- Preservar o visual premium escuro do Funcional VIP Digital.",
    "",
    exercise.sequencePrompt
      ? `REFERÊNCIA ADICIONAL CADASTRADA:\n${compactText(exercise.sequencePrompt)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canExport(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const includeInactive =
      req.nextUrl.searchParams.get("includeInactive") === "true";

    const exercises = await prisma.exerciseLibrary.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        muscleGroup: true,
        imageUrl: true,
        videoUrl: true,
        sequenceImageUrl: true,
        sequenceImageLabel: true,
        sequenceImageNotes: true,
        sequenceFramesCount: true,
        sequencePrompt: true,
        active: true,
        equipmentTags: true,
        levelTags: true,
        instructions: true,
        commonMistakes: true,
        safetyNotes: true,
        contraindications: true,
      },
    });

    const zip = new JSZip();
    const rootFolder = zip.folder("FUNCIONAL_VIP_EXPORT_IA");
    const imagesFolder = rootFolder?.folder("imagens");
    const promptsFolder = rootFolder?.folder("prompts");

    const manifestRows: string[][] = [
      [
        "ordem",
        "id",
        "nome",
        "slug",
        "grupo_muscular",
        "arquivo_principal",
        "status_principal",
        "arquivo_sequencia",
        "status_sequencia",
        "arquivo_prompt",
        "status_video_no_sistema",
        "video_url",
        "ativo",
        "equipamentos",
        "nivel",
        "descricao",
        "como_executar",
        "erros_comuns",
        "cuidados",
        "contraindicacoes",
      ],
    ];

    let principalExported = 0;
    let principalMissing = 0;
    let principalFailed = 0;
    let sequenceExported = 0;
    let sequenceMissing = 0;
    let sequenceFailed = 0;
    let promptsExported = 0;
    let videosRegistered = 0;

    for (let index = 0; index < exercises.length; index += 1) {
      const exercise = exercises[index];
      const order = String(index + 1).padStart(3, "0");
      const slug = slugify(exercise.name);

      let principalFileName = "";
      let principalStatus = "SEM_IMAGEM";

      if (!exercise.imageUrl) {
        principalMissing += 1;
      } else {
        try {
          const image = await readImage(exercise.imageUrl, req.nextUrl.origin);
          principalFileName = `${slug}__principal${image.extension}`;
          imagesFolder?.file(principalFileName, image.buffer);
          principalExported += 1;
          principalStatus = "EXPORTADA";
        } catch (error: any) {
          principalFailed += 1;
          principalStatus = `ERRO: ${String(
            error?.message || "falha ao baixar imagem principal"
          )}`;
        }
      }

      let sequenceFileName = "";
      let sequenceStatus = "SEM_IMAGEM";

      if (!exercise.sequenceImageUrl) {
        sequenceMissing += 1;
      } else {
        try {
          const image = await readImage(
            exercise.sequenceImageUrl,
            req.nextUrl.origin
          );
          sequenceFileName = `${slug}__sequencia${image.extension}`;
          imagesFolder?.file(sequenceFileName, image.buffer);
          sequenceExported += 1;
          sequenceStatus = "EXPORTADA";
        } catch (error: any) {
          sequenceFailed += 1;
          sequenceStatus = `ERRO: ${String(
            error?.message || "falha ao baixar imagem sequencial"
          )}`;
        }
      }

      const promptFileName = `${slug}.txt`;
      promptsFolder?.file(promptFileName, buildVideoPrompt(exercise));
      promptsExported += 1;

      if (exercise.videoUrl) videosRegistered += 1;

      manifestRows.push([
        order,
        exercise.id,
        exercise.name,
        slug,
        exercise.muscleGroup,
        principalFileName,
        principalStatus,
        sequenceFileName,
        sequenceStatus,
        promptFileName,
        exercise.videoUrl ? "VIDEO_CADASTRADO" : "VIDEO_PENDENTE",
        exercise.videoUrl || "",
        exercise.active ? "SIM" : "NAO",
        exercise.equipmentTags || "",
        exercise.levelTags || "",
        exercise.description || "",
        exercise.instructions || "",
        exercise.commonMistakes || "",
        exercise.safetyNotes || "",
        exercise.contraindications || "",
      ]);
    }

    const csv =
      "\uFEFF" +
      manifestRows.map((row) => row.map(csvCell).join(";")).join("\n");

    rootFolder?.file("manifesto.csv", csv);
    rootFolder?.file("status.csv", csv);

    rootFolder?.file(
      "LEIA-ME.txt",
      [
        "EXPORTAÇÃO PARA GERAÇÃO DE VÍDEOS — FUNCIONAL VIP DIGITAL",
        "",
        `Exercícios encontrados: ${exercises.length}`,
        `Imagens principais exportadas: ${principalExported}`,
        `Imagens principais ausentes: ${principalMissing}`,
        `Falhas nas imagens principais: ${principalFailed}`,
        `Imagens sequenciais exportadas: ${sequenceExported}`,
        `Imagens sequenciais ausentes: ${sequenceMissing}`,
        `Falhas nas imagens sequenciais: ${sequenceFailed}`,
        `Prompts de vídeo gerados: ${promptsExported}`,
        `Vídeos já cadastrados no sistema: ${videosRegistered}`,
        "",
        "ESTRUTURA DO PACOTE",
        "- imagens/: contém a imagem principal e a sequência de cada exercício.",
        "- prompts/: contém um prompt individual para gerar o vídeo no CapCut.",
        "- manifesto.csv e status.csv: mostram o que foi exportado e o que ainda está pendente.",
        "",
        "COMO USAR NO CAPCUT",
        "1. Abra a pasta imagens.",
        "2. Escolha o arquivo terminado em __principal como imagem de origem.",
        "3. Consulte o arquivo terminado em __sequencia para conferir a execução.",
        "4. Abra o TXT de mesmo nome dentro da pasta prompts.",
        "5. Copie e cole o prompt na ferramenta de imagem para vídeo.",
        "6. Salve o vídeo com o nome do exercício, por exemplo: agachamento-livre.mp4.",
        "",
        "OBSERVAÇÃO",
        "O CapCut normalmente gera um exercício por vez. O ZIP organiza o trabalho, mas não envia todos os exercícios automaticamente para o CapCut.",
      ].join("\n")
    );

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const date = new Date().toISOString().slice(0, 10);

    const zipArrayBuffer = new ArrayBuffer(zipBuffer.byteLength);
    new Uint8Array(zipArrayBuffer).set(zipBuffer);

    return new NextResponse(zipArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="funcional-vip-export-ia-${date}.zip"`,
        "Cache-Control": "no-store",
        "X-Principal-Exported": String(principalExported),
        "X-Principal-Missing": String(principalMissing),
        "X-Sequence-Exported": String(sequenceExported),
        "X-Sequence-Missing": String(sequenceMissing),
        "X-Prompts-Exported": String(promptsExported),
      },
    });
  } catch (error: any) {
    console.error("GET /api/exercise-library/export error:", error);

    return NextResponse.json(
      {
        error: "Não foi possível exportar a biblioteca para IA.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
