import { Prisma, TaskStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { readAssetMetadata } from "@/lib/asset-metadata";
import { prisma } from "@/lib/prisma";
import { readSmartPlanData } from "@/lib/task-plan";
import { adaptCtaForPublication, limitHashtagsForPlatform, mergeCaptionWithCta } from "@/lib/publication-copy";
import { normalizeHashtags } from "@/lib/utils";

export const runtime = "nodejs";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}


function manualMusicRecommendation(plan: ReturnType<typeof readSmartPlanData>, brandKey: string | null, platform: string) {
  const scope = plan?.shop?.enabled ? "SHOP" : brandKey === "FUNCIONAL_UP" ? "FUNCIONAL" : brandKey === "GREG" ? "GREG" : "CORRIDA";
  const base = scope === "SHOP"
    ? { searchQuery: `modern product demo 115-130 bpm ${platform}`, why: "Ritmo moderno para apoiar demonstração e CTA sem esconder o produto.", alternative: "upbeat product demo · clean beat · commercial" }
    : scope === "FUNCIONAL"
      ? { searchQuery: `workout premium motivation 105-125 bpm ${platform}`, why: "Energia esportiva premium, com ritmo suficiente para cortes de movimento sem competir com orientação de treino.", alternative: "sport premium · workout motivation · clean instrumental" }
      : scope === "GREG"
        ? { searchQuery: `cute curious playful cat instrumental ${platform}`, why: "Trilha leve e curiosa para reforçar espontaneidade sem mascarar sons reais do Greg.", alternative: "playful pet · curious · light groove" }
        : { searchQuery: `inspirational running confidence 95-115 bpm ${platform}`, why: "Clima inspirador e crescente para conectar corrida, confiança e narrativa humana.", alternative: "cinematic light · running motivation · confidence" };
  return {
    track: "",
    artist: "",
    searchQuery: base.searchQuery,
    why: base.why,
    section: "Escolha o trecho com entrada clara e crescimento compatível com os cortes do vídeo.",
    volume: "Com fala: 8–12%. Sem fala: 20–30%.",
    addAtPosting: true,
    alternative: base.alternative,
    rightsNote: "Pesquise e adicione pela biblioteca licenciada da própria plataforma. A disponibilidade de faixas muda por conta, região e tipo de publicação.",
  };
}

function manualModeExplanation(mode: string): string {
  if (mode === "ZSKY_CAPCUT") return "takes gerados no ZSky.ai e edição final feita manualmente no CapCut";
  if (mode === "RECORDED_CAPCUT") return "gravação real e edição final feita manualmente no CapCut";
  if (mode === "AI") return "gerado por IA";
  if (mode === "RECORDED") return "gravado pelo usuário e editado pela IA externa";
  return "misto com gravações reais e IA externa";
}

function checklistComplete(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ["format", "audio", "text", "brand", "cta", "cuts"].every((key) => record[key] === true);
}

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const body = await request.json();
    const taskId = String(body.taskId || "");
    const assetId = String(body.assetId || "");
    const productionMode = String(body.productionMode || "");
    if (!taskId || !assetId || !["AI", "RECORDED", "MIXED", "ZSKY_CAPCUT", "RECORDED_CAPCUT"].includes(productionMode)) {
      return NextResponse.json({ error: "Dados do vídeo final incompletos." }, { status: 400 });
    }
    if (!checklistComplete(body.checklist)) {
      return NextResponse.json({ error: "Conclua a conferência do vídeo antes de importar." }, { status: 400 });
    }

    const [task, asset] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId } }),
      prisma.asset.findUnique({ where: { id: assetId } }),
    ]);
    if (!task || !asset) return NextResponse.json({ error: "Tarefa ou vídeo não encontrado." }, { status: 404 });

    const plan = readSmartPlanData(task.planData);
    if (!plan || plan.stage !== "PRODUCTION" || !task.brandKey) {
      return NextResponse.json({ error: "Esta tarefa não possui planejamento de vídeo válido." }, { status: 400 });
    }
    const metadata = readAssetMetadata(asset.tags);
    if (!metadata.taskIds.includes(task.id) || metadata.videoRole !== "FINAL") {
      return NextResponse.json({ error: "O arquivo selecionado não é o vídeo final desta tarefa." }, { status: 400 });
    }

    const destinations = plan.destinations || [];
    if (!destinations.length) return NextResponse.json({ error: "A tarefa não possui destino de publicação." }, { status: 400 });

    const caption = String(body.caption || task.contentPromise || "").trim();
    const hashtags = normalizeHashtags(String(body.hashtags || ""));
    const cta = String(body.cta || task.contentCta || "").trim();
    const warnings: string[] = [];
    if (metadata.videoOrientation !== "vertical" && destinations.some((item) => item.height > item.width)) {
      warnings.push("O vídeo final não está na vertical, mas existe destino vertical. Confira antes de aprovar.");
    }
    if (!caption) warnings.push("A legenda não foi informada. Você poderá acrescentá-la antes da publicação.");

    const manualProduction = productionMode === "ZSKY_CAPCUT" || productionMode === "RECORDED_CAPCUT";
    const latestJob = manualProduction ? null : await prisma.aiJob.findFirst({ where: { taskId: task.id }, orderBy: { createdAt: "desc" } });
    const aiJob = latestJob || await prisma.aiJob.create({
      data: {
        taskId: task.id,
        title: task.title.replace("Preparar com IA: ", ""),
        brandKey: task.brandKey,
        contentType: task.contentType || "video",
        objective: task.objective,
        planningContext: json({ videoProductionMode: productionMode, capture: plan.capture, manualProduction }),
        destinations: json(destinations),
        selectedAssetIds: json([asset.id]),
        prompt: manualProduction
          ? "Vídeo produzido com guia do Meu Dia IA e editado manualmente no CapCut; arquivo final importado para preparar as postagens."
          : "Vídeo final importado diretamente pelo fluxo de produção do Meu Dia IA.",
        status: "IMPORTED",
      },
    });

    const manifest = {
      version: "1.1-video",
      jobId: aiJob.id,
      title: task.title.replace("Preparar com IA: ", ""),
      brandKey: task.brandKey,
      strategyExplanation: `Vídeo produzido com ${manualModeExplanation(productionMode)}, importado como arquivo final e submetido à validação humana.`,
      items: destinations.map((destination, index) => ({
        title: `${task.title.replace("Preparar com IA: ", "")} · ${destination.platform} ${index + 1}`,
        platform: destination.platform,
        accountName: destination.accountName,
        placement: destination.placement,
        format: destination.format,
        width: destination.width,
        height: destination.height,
        file: asset.fileName,
        previewFile: asset.fileName,
        caption: mergeCaptionWithCta(caption, cta, destination.platform, destination.placement),
        hashtags: limitHashtagsForPlatform(hashtags, destination.platform),
        cta: adaptCtaForPublication(cta, destination.platform, destination.placement),
        musicRecommendation: manualMusicRecommendation(plan, task.brandKey, destination.platform),
        instructions: [
          "Confira o vídeo completo com som antes de aprovar.",
          "Publique manualmente na conta e no local indicados.",
          "Use o arquivo final importado; o material bruto permanece separado.",
          "Adicione a música sugerida pela biblioteca da própria plataforma quando o master tiver sido exportado limpo.",
        ],
        scheduledAt: destination.scheduledAt,
        publishMode: "manual",
      })),
    };

    const createdPackage = await prisma.$transaction(async (tx) => {
      const itemPackage = await tx.aiPackage.create({
        data: {
          aiJobId: aiJob.id,
          title: manifest.title,
          brandKey: task.brandKey!,
          manifest: json(manifest),
          strategyExplanation: manifest.strategyExplanation,
          status: "NEEDS_REVIEW",
          validationWarnings: json(warnings),
        },
      });

      for (const [index, destination] of destinations.entries()) {
        const scheduledAt = new Date(destination.scheduledAt);
        await tx.contentItem.create({
          data: {
            packageId: itemPackage.id,
            title: `${manifest.title} · ${destination.platform} ${index + 1}`,
            platform: destination.platform,
            accountName: destination.accountName,
            placement: destination.placement,
            format: destination.format,
            width: destination.width,
            height: destination.height,
            fileName: asset.fileName,
            assetUrl: asset.url,
            downloadUrl: asset.downloadUrl,
            previewUrl: asset.url,
            caption: manifest.items[index]?.caption || caption,
            hashtags: manifest.items[index]?.hashtags || hashtags,
            cta: manifest.items[index]?.cta || cta,
            instructions: json(manifest.items[index]?.instructions || [
              "Confira o vídeo completo com som antes de aprovar.",
              "Publique manualmente na conta e no local indicados.",
            ]),
            musicRecommendation: json(manifest.items[index]?.musicRecommendation || manualMusicRecommendation(plan, task.brandKey, destination.platform)),
            scheduledAt: Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt,
            publishMode: "manual",
          },
        });
      }

      const updatedPlan = {
        ...plan,
        videoWorkflow: {
          ...(plan.videoWorkflow || {}),
          productionMode,
          finalAssetId: asset.id,
          finalFileName: asset.fileName,
          finalDurationSeconds: metadata.durationSeconds,
          finalWidth: metadata.width,
          finalHeight: metadata.height,
          finalOrientation: metadata.videoOrientation,
          validatedAt: new Date().toISOString(),
        },
      };
      await tx.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.WAITING_VALIDATION, planData: json(updatedPlan) },
      });
      await tx.aiJob.update({ where: { id: aiJob.id }, data: { status: "IMPORTED" } });
      return itemPackage;
    });

    return NextResponse.json({ id: createdPackage.id, warnings }, { status: 201 });
  } catch (error) {
    console.error("Erro ao importar vídeo final:", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    return NextResponse.json({ error: "Não foi possível importar o vídeo final." }, { status: 500 });
  }
}
