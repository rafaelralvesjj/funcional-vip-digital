import type { CaptureBrief, PlannedDestination, VideoProductionMode } from "@/lib/task-plan";
import { buildManualVideoGuide, type ManualBrandProfile, type ManualVideoScope } from "@/lib/manual-video-guide";

export type CapCutKitInput = {
  taskId: string;
  mode: Extract<VideoProductionMode, "ZSKY_CAPCUT" | "RECORDED_CAPCUT">;
  brand?: ManualBrandProfile | null;
  brandKey?: string | null;
  capture?: CaptureBrief;
  destinations?: PlannedDestination[];
  title: string;
  angle?: string | null;
  promise?: string | null;
  cta?: string | null;
  shopEnabled?: boolean;
  logoUrl?: string | null;
};

export type CapCutKitFileKey = "cube" | "srt" | "text-animations" | "guide" | "zsky" | "manifest" | "counter";

export type CapCutKitFile = {
  key: CapCutKitFileKey;
  fileName: string;
  mimeType: string;
  content: string;
  label: string;
  description: string;
  optional?: boolean;
};

export type CapCutKit = {
  slug: string;
  scope: ManualVideoScope;
  files: CapCutKitFile[];
  counterFile?: CapCutKitFile;
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "video";
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function colorTransform(scope: ManualVideoScope, r: number, g: number, b: number): [number, number, number] {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let contrast = 1.07;
  let saturation = 1.02;
  let exposure = 0;
  let redShift = 0;
  let greenShift = 0;
  let blueShift = 0;

  if (scope === "CORRIDA") {
    contrast = 1.09;
    saturation = 1.03;
    exposure = 0.006;
    redShift = 0.018;
    greenShift = 0.003;
    blueShift = -0.012;
  } else if (scope === "FUNCIONAL") {
    contrast = 1.11;
    saturation = 1.035;
    exposure = 0.004;
    redShift = -0.006;
    greenShift = 0.009;
    blueShift = 0.016;
  } else if (scope === "SHOP") {
    contrast = 1.08;
    saturation = 1.075;
    exposure = 0.012;
    redShift = 0.006;
    greenShift = 0.004;
    blueShift = 0.004;
  } else if (scope === "GREG") {
    contrast = 1.055;
    saturation = 1.045;
    exposure = 0.008;
    redShift = 0.018;
    greenShift = 0.007;
    blueShift = -0.012;
  }

  const applyContrast = (channel: number) => (channel - 0.5) * contrast + 0.5 + exposure;
  let rr = applyContrast(r);
  let gg = applyContrast(g);
  let bb = applyContrast(b);
  const lumAfter = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
  rr = lumAfter + (rr - lumAfter) * saturation;
  gg = lumAfter + (gg - lumAfter) * saturation;
  bb = lumAfter + (bb - lumAfter) * saturation;

  // Cor shift is intentionally subtle and stronger in midtones than highlights.
  const midtoneWeight = 1 - Math.min(1, Math.abs(luminance - 0.5) * 1.7);
  rr += redShift * midtoneWeight;
  gg += greenShift * midtoneWeight;
  bb += blueShift * midtoneWeight;

  // Gentle highlight roll-off to reduce clipping after contrast.
  const roll = (channel: number) => channel > 0.88 ? 0.88 + (channel - 0.88) * 0.72 : channel;
  return [clamp(roll(rr)), clamp(roll(gg)), clamp(roll(bb))];
}

function buildCube(scope: ManualVideoScope, title: string): string {
  const size = 17;
  const lines = [
    `TITLE "Meu Dia IA - ${title.replace(/"/g, "'")}"`,
    "# LUT 3D gerada automaticamente para uso no CapCut Desktop.",
    "# Aplique como ponto de partida e ajuste a intensidade conforme o guia do kit.",
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];

  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        const [rr, gg, bb] = colorTransform(scope, red / (size - 1), green / (size - 1), blue / (size - 1));
        lines.push(`${rr.toFixed(6)} ${gg.toFixed(6)} ${bb.toFixed(6)}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function srtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function wrapCaption(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 42) return clean;
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current || `${current} ${word}`.length <= 38) current = current ? `${current} ${word}` : word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).join("\n");
}

function fallbackSegments(input: CapCutKitInput) {
  if (input.capture?.videoSegments?.length) return input.capture.videoSegments;
  return [
    { order: 1, durationSeconds: 4, shot: "Gancho visual e contextualização rápida.", onScreen: input.angle || input.title },
    { order: 2, durationSeconds: 5, shot: "Desenvolvimento visual da ideia principal.", onScreen: input.promise || input.title },
    { order: 3, durationSeconds: 4, shot: "Fechamento coerente com a mensagem.", onScreen: input.cta || "Fechamento e chamada para ação." },
  ];
}

function captionText(segment: ReturnType<typeof fallbackSegments>[number], input: CapCutKitInput): string {
  if (segment.onScreen?.trim()) return segment.onScreen.trim();
  if (segment.spokenLine?.trim()) return segment.spokenLine.trim();
  if (segment.order === 1) return input.angle || input.title;
  if (segment.order === 2) return input.promise || input.title;
  return input.cta || "Continue construindo constância.";
}

function buildSrt(input: CapCutKitInput): { content: string; entries: Array<{ index: number; start: number; end: number; text: string }> } {
  const segments = fallbackSegments(input);
  let cursor = 0;
  const entries = segments.map((segment, index) => {
    const duration = Math.max(1, Number(segment.durationSeconds) || 4);
    const start = cursor + (index === 0 ? 0.15 : 0.05);
    const end = cursor + duration - 0.12;
    cursor += duration;
    return { index: index + 1, start, end: Math.max(start + 0.6, end), text: wrapCaption(captionText(segment, input)) };
  });
  const content = entries.map((entry) => `${entry.index}\n${srtTime(entry.start)} --> ${srtTime(entry.end)}\n${entry.text}\n`).join("\n");
  return { content, entries };
}

function textAnimation(scope: ManualVideoScope, index: number): string {
  if (scope === "SHOP") return index % 2 === 0
    ? "Entrada: Pop Up/Pop curto (0,2–0,3s). Saída: Fade curto. Destaque a palavra-chave com escala 100%→108% e volte a 100%."
    : "Entrada: Slide Up rápido (0,2–0,3s). Saída: Fade. Se houver preço/benefício, use punch-in curto no número.";
  if (scope === "GREG") return index % 2 === 0
    ? "Entrada: Pop Up suave. Saída: Fade. Uma pequena escala 100%→105% pode acompanhar a reação, sem excesso de stickers."
    : "Entrada: Slide Up curto. Se houver punchline, use Bounce/Pop apenas nela; mantenha o restante limpo.";
  if (scope === "FUNCIONAL") return index % 2 === 0
    ? "Entrada: Slide Up limpa (0,25–0,35s). Saída: Fade curto. Use escala muito discreta 100%→103% na palavra principal."
    : "Entrada: Fade In + deslocamento vertical leve. Saída: Fade. Evite bounce forte; estética esportiva premium.";
  return index % 2 === 0
    ? "Entrada: Fade In + Slide Up suave (0,3–0,4s). Saída: Fade curto. Dê ênfase à palavra principal com escala 100%→104%."
    : "Entrada: Typewriter curto ou Fade/Slide suave, conforme o ritmo. Evite efeitos chamativos; a história deve continuar sendo o foco.";
}

function lutIntensity(scope: ManualVideoScope): string {
  if (scope === "FUNCIONAL") return "60–70%";
  if (scope === "SHOP") return "55–65%";
  if (scope === "GREG") return "45–55%";
  return "50–60%";
}

function buildTextAnimationGuide(input: CapCutKitInput, scope: ManualVideoScope, entries: ReturnType<typeof buildSrt>["entries"]): string {
  const brandName = input.brand?.name || (scope === "FUNCIONAL" ? "Funcional UP" : scope === "GREG" ? "Greg" : "Corrida de Carreira");
  const lines = [
    "MEU DIA IA — MAPA DE ANIMAÇÃO DOS TEXTOS NO CAPCUT",
    `Projeto: ${brandName}`,
    `Vídeo: ${input.title}`,
    "",
    "IMPORTANTE",
    "O arquivo .SRT importa texto + tempo. A animação visual não fica embutida no SRT.",
    "Depois de importar o SRT, aplique as animações abaixo no CapCut. Se a sua versão mostrar nomes ligeiramente diferentes, use o efeito equivalente mais próximo.",
    "",
  ];
  entries.forEach((entry, index) => {
    lines.push(`LEGENDA ${entry.index} — ${srtTime(entry.start)} até ${srtTime(entry.end)}`);
    lines.push(entry.text.replace(/\n/g, " / "));
    lines.push(textAnimation(scope, index));
    lines.push("Posição: área segura, sem cobrir rosto, produto ou execução. Mantenha margem para botões de TikTok/Reels/Shorts.");
    lines.push("");
  });
  lines.push("DICA DE CONSISTÊNCIA");
  lines.push("Escolha uma lógica principal de entrada e repita-a. Use um efeito diferente apenas no gancho, número, benefício ou CTA que realmente precise de ênfase.");
  return `${lines.join("\n")}\n`;
}

function buildCounterSrt(input: CapCutKitInput): CapCutKitFile | undefined {
  const segments = fallbackSegments(input);
  let cursor = 0;
  for (const segment of segments) {
    const duration = Math.max(1, Number(segment.durationSeconds) || 4);
    const text = captionText(segment, input);
    const match = text.match(/(?:^|\D)(100|[1-9]?\d)\s*%/);
    if (match) {
      const target = Number(match[1]);
      if (target > 0 && target <= 100) {
        const usable = Math.max(1.2, duration - 0.4);
        const interval = Math.max(0.035, Math.min(0.1, usable / (target + 1)));
        const startBase = cursor + 0.15;
        const blocks: string[] = [];
        for (let value = 0; value <= target; value += 1) {
          const start = startBase + value * interval;
          const end = start + Math.max(0.03, interval - 0.005);
          blocks.push(`${value + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${value}%\n`);
        }
        const slug = slugify(input.title);
        return {
          key: "counter",
          fileName: `contador-0-a-${target}-${slug}.srt`,
          mimeType: "application/x-subrip; charset=utf-8",
          content: `${blocks.join("\n")}\n`,
          label: `Contador 0–${target}% (.srt)`,
          description: "Arquivo opcional detectado porque o roteiro contém percentual. Importe como legenda separada para criar a contagem progressiva.",
          optional: true,
        };
      }
    }
    cursor += duration;
  }
  return undefined;
}

function buildZskyGuide(input: CapCutKitInput): string {
  const guide = buildManualVideoGuide(input);
  if (!guide.zsky) return "Este modo não usa ZSky.ai.\n";
  const lines = [
    "MEU DIA IA — PROMPTS ZSKY.AI",
    `Vídeo: ${input.title}`,
    "",
    ...guide.zsky.settings.map((item, index) => `${index + 1}. ${item}`),
    "",
  ];
  guide.zsky.scenes.forEach((scene) => {
    lines.push(`CENA ${scene.order} · ${scene.durationSeconds}s`);
    lines.push(`OBJETIVO: ${scene.goal}`);
    lines.push("CAMPO 1 — PROMPT VISUAL");
    lines.push(scene.visualPrompt);
    lines.push("CAMPO 2 — SOM / MÚSICA");
    lines.push(scene.soundPrompt);
    lines.push(`IMAGEM DE REFERÊNCIA: ${scene.referenceImage}`);
    lines.push("");
  });
  lines.push(guide.zsky.downloadInstruction);
  return `${lines.join("\n")}\n`;
}

function buildMainGuide(input: CapCutKitInput, scope: ManualVideoScope): string {
  const guide = buildManualVideoGuide(input);
  const lines = [
    "MEU DIA IA — KIT CAPCUT",
    `Vídeo: ${input.title}`,
    `Modo: ${input.mode === "ZSKY_CAPCUT" ? "ZSky.ai → CapCut" : "Gravação real → CapCut"}`,
    `Projeto: ${input.brand?.name || input.brandKey || scope}`,
    "",
    "ARQUIVOS DO KIT",
    "1. look-*.cube — tratamento de cor (LUT) para importar no CapCut.",
    "2. legendas-*.srt — texto com os tempos do vídeo.",
    "3. animacoes-texto-*.txt — mapa exato das animações a aplicar depois de importar o SRT.",
    "4. identidade-*.txt — identidade, logo e canais do projeto.",
    input.mode === "ZSKY_CAPCUT" ? "5. prompts-zsky-*.txt — prompts separados para os dois campos do ZSky.ai." : "5. roteiro-capcut-*.txt — este passo a passo completo.",
    "",
    "ORDEM RECOMENDADA NO CAPCUT",
    ...guide.capcut.projectSetup.map((item, index) => `${index + 1}. ${item}`),
    `5. Importe a LUT .CUBE em Ajustes/Adjustment > LUT e comece com intensidade ${lutIntensity(scope)}. Se pele, produto ou pelagem perder naturalidade, reduza a intensidade.`,
    "6. Importe o arquivo .SRT em Texto/Legendas > Importar legendas. Depois abra o arquivo animacoes-texto-*.txt e aplique os movimentos indicados.",
    "",
    "TIMELINE",
  ];
  guide.capcut.scenes.forEach((scene) => {
    lines.push(`CENA ${scene.order} · ${scene.durationSeconds}s`);
    lines.push(`Arquivo: ${scene.source}`);
    lines.push(`Corte: ${scene.trim}`);
    lines.push(`Texto: ${scene.text}`);
    lines.push(`Transição: ${scene.transitionAfter}`);
    lines.push("");
  });
  lines.push("FOTOS");
  lines.push(guide.capcut.photoRule);
  lines.push("");
  lines.push("IDENTIDADE E TEXTO");
  guide.capcut.textAndBrand.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("ÁUDIO E MÚSICA");
  guide.capcut.audio.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push("EXPORTAÇÃO");
  guide.capcut.export.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  lines.push("");
  lines.push("CONFERÊNCIA FINAL");
  guide.capcut.finalChecklist.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  lines.push(guide.postingNote);
  return `${lines.join("\n")}\n`;
}

function buildIdentity(input: CapCutKitInput, scope: ManualVideoScope): string {
  const brand = input.brand;
  const lines = [
    "MEU DIA IA — IDENTIDADE DA POSTAGEM",
    `Projeto: ${brand?.name || input.brandKey || scope}`,
    `Vídeo: ${input.title}`,
    `Cor primária: ${brand?.primaryColor || "seguir identidade definida no sistema"}`,
    `Cor secundária: ${brand?.secondaryColor || "seguir identidade definida no sistema"}`,
    `Fundo: ${brand?.backgroundColor || "seguir identidade definida no sistema"}`,
    `Texto: ${brand?.textColor || "seguir identidade definida no sistema"}`,
    `Acento: ${brand?.accentColor || "seguir identidade definida no sistema"}`,
    `Direção visual: ${brand?.visualDirection || "seguir direção criativa do projeto"}`,
    `Logo oficial: ${input.logoUrl || "usar a logo aprovada na biblioteca do Meu Dia IA"}`,
    "",
    "DESTINOS",
    ...(input.destinations?.length ? input.destinations.map((item) => `- ${item.platform} · ${item.placement} · ${item.format}`) : ["- seguir os destinos planejados na agenda"]),
  ];
  return `${lines.join("\n")}\n`;
}

export function buildCapCutKit(input: CapCutKitInput): CapCutKit {
  const guide = buildManualVideoGuide(input);
  const slug = slugify(input.title);
  const srt = buildSrt(input);
  const files: CapCutKitFile[] = [
    {
      key: "cube",
      fileName: `look-${guide.scope.toLowerCase()}-${slug}.cube`,
      mimeType: "text/plain; charset=utf-8",
      content: buildCube(guide.scope, `${guide.scope} - ${input.title}`),
      label: "Tratamento visual (.cube)",
      description: `LUT pronta para importar no CapCut. Comece com intensidade ${lutIntensity(guide.scope)} e refine se necessário.`,
    },
    {
      key: "srt",
      fileName: `legendas-${slug}.srt`,
      mimeType: "application/x-subrip; charset=utf-8",
      content: srt.content,
      label: "Legendas sincronizadas (.srt)",
      description: "Texto + tempo prontos para importar. O arquivo não carrega animação visual; use o mapa de animações do kit.",
    },
    {
      key: "text-animations",
      fileName: `animacoes-texto-${slug}.txt`,
      mimeType: "text/plain; charset=utf-8",
      content: buildTextAnimationGuide(input, guide.scope, srt.entries),
      label: "Mapa de animações de texto",
      description: "Diz qual entrada, saída e ênfase aplicar em cada legenda depois de importar o SRT.",
    },
    {
      key: "guide",
      fileName: `roteiro-capcut-${slug}.txt`,
      mimeType: "text/plain; charset=utf-8",
      content: buildMainGuide(input, guide.scope),
      label: "Passo a passo CapCut",
      description: "Ordem completa de importação, cortes, transições, LUT, texto, áudio e exportação.",
    },
    {
      key: "manifest",
      fileName: `identidade-${slug}.txt`,
      mimeType: "text/plain; charset=utf-8",
      content: buildIdentity(input, guide.scope),
      label: "Identidade da postagem",
      description: "Cores, direção visual, logo e canais corretos para esta tarefa.",
    },
  ];
  if (input.mode === "ZSKY_CAPCUT") {
    files.push({
      key: "zsky",
      fileName: `prompts-zsky-${slug}.txt`,
      mimeType: "text/plain; charset=utf-8",
      content: buildZskyGuide(input),
      label: "Prompts ZSky.ai",
      description: "Cena por cena: Campo 1 visual, Campo 2 som/música e instrução de imagem de referência.",
    });
  }
  const counterFile = buildCounterSrt(input);
  return { slug, scope: guide.scope, files, counterFile };
}
