import JSZip from "jszip";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { buildCapCutKit, type CapCutKitFileKey } from "@/lib/capcut-kit";
import { prisma } from "@/lib/prisma";
import { isManualCapCutVideoMode, readSmartPlanData } from "@/lib/task-plan";

function safeFileName(value: string): string {
  return value.replace(/[\r\n"\\]/g, "-");
}

function fileResponse(content: string | Uint8Array, fileName: string, contentType: string) {
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeFileName(fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession();
    const task = await prisma.task.findUnique({ where: { id: params.id } });
    if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

    const plan = readSmartPlanData(task.planData);
    const mode = plan?.videoWorkflow?.productionMode;
    if (!plan || plan.stage !== "PRODUCTION" || !isManualCapCutVideoMode(mode)) {
      return NextResponse.json({ error: "Escolha um dos modos de produção com CapCut antes de baixar o kit." }, { status: 400 });
    }

    const brand = task.brandKey ? await prisma.brand.findUnique({ where: { key: task.brandKey } }) : null;
    const kit = buildCapCutKit({
      taskId: task.id,
      mode,
      brand: brand ? {
        key: brand.key,
        name: brand.name,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        backgroundColor: brand.backgroundColor,
        textColor: brand.textColor,
        accentColor: brand.accentColor,
        visualDirection: brand.visualDirection,
      } : null,
      brandKey: task.brandKey,
      capture: plan.capture,
      destinations: plan.destinations,
      title: task.title.replace("Preparar com IA: ", ""),
      angle: task.contentAngle,
      promise: task.contentPromise,
      cta: task.contentCta,
      shopEnabled: Boolean(plan.shop?.enabled),
      logoUrl: brand?.logoUrl,
    });

    const url = new URL(request.url);
    const requested = (url.searchParams.get("file") || "zip") as CapCutKitFileKey | "zip" | "logo";

    if (requested === "logo") {
      if (!brand?.logoUrl) return NextResponse.json({ error: "Esta marca ainda não possui logo cadastrada." }, { status: 404 });
      const logoResponse = await fetch(brand.logoUrl, { cache: "no-store" });
      if (!logoResponse.ok) return NextResponse.json({ error: "Não foi possível baixar a logo cadastrada." }, { status: 502 });
      const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
      const logoName = brand.logoFileName || `logo-${kit.scope.toLowerCase()}.png`;
      return fileResponse(logoBytes, logoName, logoResponse.headers.get("content-type") || "application/octet-stream");
    }

    if (requested !== "zip") {
      const selected = requested === "counter" ? kit.counterFile : kit.files.find((file) => file.key === requested);
      if (!selected) return NextResponse.json({ error: "Este arquivo não é necessário para esta postagem." }, { status: 404 });
      return fileResponse(selected.content, selected.fileName, selected.mimeType);
    }

    const zip = new JSZip();
    for (const file of kit.files) zip.file(file.fileName, file.content);
    if (kit.counterFile) zip.file(kit.counterFile.fileName, kit.counterFile.content);
    let logoIncluded = false;
    if (brand?.logoUrl) {
      try {
        const logoResponse = await fetch(brand.logoUrl, { cache: "no-store" });
        if (logoResponse.ok) {
          const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
          zip.file(brand.logoFileName || `logo-${kit.scope.toLowerCase()}.png`, logoBytes);
          logoIncluded = true;
        }
      } catch (error) {
        console.warn("Não foi possível incluir a logo no Kit CapCut:", error);
      }
    }
    const indexLines = [
      "MEU DIA IA — KIT CAPCUT PRONTO",
      "",
      ...kit.files.map((file) => `- ${file.fileName}: ${file.description}`),
      ...(kit.counterFile ? [`- ${kit.counterFile.fileName}: ${kit.counterFile.description}`] : []),
      ...(logoIncluded ? [`- ${brand?.logoFileName || `logo-${kit.scope.toLowerCase()}.png`}: logo oficial cadastrada no Meu Dia IA.`] : []),
      "",
      "Comece pelo arquivo roteiro-capcut-*.txt.",
    ];
    zip.file("00-LEIA-PRIMEIRO.txt", `${indexLines.join("\n")}\n`);
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return fileResponse(bytes, `kit-capcut-${kit.slug}.zip`, "application/zip");
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    console.error("Erro ao gerar Kit CapCut:", error);
    return NextResponse.json({ error: "Não foi possível gerar o Kit CapCut." }, { status: 500 });
  }
}
