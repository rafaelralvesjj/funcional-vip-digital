import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { mergeAssetMetadata } from "@/lib/asset-metadata";
import { prisma } from "@/lib/prisma";
import { readSmartPlanData } from "@/lib/task-plan";

export const runtime = "nodejs";

type VideoRole = "RAW" | "FINAL";
type ProductionMode = "AI" | "RECORDED" | "MIXED" | "ZSKY_CAPCUT" | "RECORDED_CAPCUT";
type MediaKind = "VIDEO" | "PHOTO";

function validMediaBlob(value: string): URL {
  const url = new URL(value);
  const validHost = url.hostname.endsWith(".public.blob.vercel-storage.com");
  const validPath = url.pathname.startsWith("/meu-dia-ia/videos/");
  if (url.protocol !== "https:" || !validHost || !validPath) throw new Error("INVALID_MEDIA_BLOB");
  return url;
}

function orientation(width: number, height: number): "vertical" | "horizontal" | "square" {
  if (width === height) return "square";
  return height > width ? "vertical" : "horizontal";
}

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const body = await request.json();
    const taskId = String(body.taskId || "");
    const role = String(body.role || "RAW") as VideoRole;
    const productionMode = String(body.productionMode || "RECORDED") as ProductionMode;
    const mediaKind = String(body.mediaKind || "VIDEO") as MediaKind;
    if (!taskId || !["RAW", "FINAL"].includes(role) || !["AI", "RECORDED", "MIXED", "ZSKY_CAPCUT", "RECORDED_CAPCUT"].includes(productionMode) || !["VIDEO", "PHOTO"].includes(mediaKind)) {
      return NextResponse.json({ error: "Dados do arquivo incompletos." }, { status: 400 });
    }
    if (role === "FINAL" && mediaKind !== "VIDEO") {
      return NextResponse.json({ error: "O arquivo final deste fluxo precisa ser um vídeo." }, { status: 400 });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    const plan = readSmartPlanData(task.planData);
    const subject = plan?.capture?.subject && ["DENIZE", "GREG", "PRODUCT", "OTHER"].includes(plan.capture.subject)
      ? plan.capture.subject
      : "OTHER";

    const url = validMediaBlob(String(body.url || ""));
    const width = Number(body.width || 0);
    const height = Number(body.height || 0);
    const durationSeconds = Number(body.durationSeconds || 0);
    const fileName = String(body.fileName || url.pathname.split("/").pop() || (mediaKind === "VIDEO" ? "video.mp4" : "foto.jpg"));
    const mimeType = String(body.mimeType || (mediaKind === "VIDEO" ? "video/mp4" : "image/jpeg"));
    const size = Number(body.size || 0);
    const roleLabel = role === "FINAL" ? "Vídeo final" : mediaKind === "VIDEO" ? "Vídeo bruto" : "Foto real para o vídeo";

    const asset = await prisma.asset.create({
      data: {
        title: `${roleLabel} · ${task.title.replace("Preparar com IA: ", "")}`,
        fileName,
        url: url.toString(),
        downloadUrl: typeof body.downloadUrl === "string" ? body.downloadUrl : null,
        mimeType,
        size: Number.isFinite(size) ? Math.max(0, Math.round(size)) : 0,
        assetType: mediaKind === "VIDEO" ? "VIDEO" : "PHOTO",
        subject,
        brandKey: task.brandKey,
        notes: role === "FINAL" ? "Arquivo final pronto para validação." : mediaKind === "VIDEO" ? "Material original sem edição." : "Foto real vinculada ao fluxo de vídeo misto.",
        tags: mergeAssetMetadata(null, {
          taskIds: [task.id],
          taskTitle: task.title,
          source: role === "FINAL" ? "VIDEO_FINAL" : mediaKind === "VIDEO" ? "VIDEO_RAW" : "VIDEO_MIXED_REFERENCE",
          purposeKey: task.planKey || task.id,
          purposeLabel: task.contentTheme || task.title,
          videoRole: mediaKind === "VIDEO" ? role : undefined,
          videoProductionMode: productionMode,
          originalFileName: fileName,
          durationSeconds: mediaKind === "VIDEO" && Number.isFinite(durationSeconds) ? durationSeconds : undefined,
          width: Number.isInteger(width) && width > 0 ? width : undefined,
          height: Number.isInteger(height) && height > 0 ? height : undefined,
          videoOrientation: mediaKind === "VIDEO" && width > 0 && height > 0 ? orientation(width, height) : undefined,
        }),
      },
    });

    if (role === "RAW") {
      const captureSubtasks = await prisma.subtask.findMany({ where: { taskId: task.id } });
      const ids = captureSubtasks.filter((item) => /v[ií]deo|clipe|grava|foto|material/i.test(item.title)).map((item) => item.id);
      if (ids.length) await prisma.subtask.updateMany({ where: { id: { in: ids } }, data: { completed: true } });
    }

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Erro ao registrar mídia do vídeo:", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    if (error instanceof Error && error.message === "INVALID_MEDIA_BLOB") return NextResponse.json({ error: "O arquivo precisa ser enviado pelo próprio Meu Dia IA." }, { status: 400 });
    return NextResponse.json({ error: "Não foi possível vincular o arquivo à tarefa." }, { status: 500 });
  }
}
