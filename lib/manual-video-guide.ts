import type { CaptureBrief, PlannedDestination, VideoProductionMode } from "@/lib/task-plan";

export type ManualVideoScope = "CORRIDA" | "FUNCIONAL" | "SHOP" | "GREG";

export type ManualBrandProfile = {
  key: string;
  name: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  visualDirection?: string | null;
};

export type ZskySceneGuide = {
  order: number;
  durationSeconds: number;
  goal: string;
  visualPrompt: string;
  soundPrompt: string;
  referenceImage: string;
};

export type CapCutSceneGuide = {
  order: number;
  durationSeconds: number;
  source: string;
  trim: string;
  text: string;
  transitionAfter: string;
};

export type ManualVideoGuide = {
  scope: ManualVideoScope;
  mode: Extract<VideoProductionMode, "ZSKY_CAPCUT" | "RECORDED_CAPCUT">;
  zsky?: {
    intro: string;
    settings: string[];
    scenes: ZskySceneGuide[];
    downloadInstruction: string;
  };
  capcut: {
    intro: string;
    projectSetup: string[];
    scenes: CapCutSceneGuide[];
    photoRule: string;
    textAndBrand: string[];
    audio: string[];
    export: string[];
    finalChecklist: string[];
  };
  postingNote: string;
};

type Input = {
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
};

function scopeFor(input: Input): ManualVideoScope {
  if (input.shopEnabled) return "SHOP";
  if (input.brandKey === "FUNCIONAL_UP") return "FUNCIONAL";
  if (input.brandKey === "GREG") return "GREG";
  return "CORRIDA";
}

function palette(input: Input): string {
  const brand = input.brand;
  if (!brand) {
    if (input.brandKey === "FUNCIONAL_UP") return "preto/grafite, branco e verde-turquesa oficial do Funcional UP";
    if (input.brandKey === "GREG") return "roxo suave, branco e tons afetivos do Greg";
    return "preto, branco e laranja editorial da Corrida de Carreira";
  }
  return [brand.primaryColor, brand.secondaryColor, brand.backgroundColor, brand.textColor, brand.accentColor].filter(Boolean).join(" · ");
}

function visualStyle(scope: ManualVideoScope): string {
  if (scope === "FUNCIONAL") return "campanha esportiva premium, realista, alto contraste, luz fria controlada, movimento atlético legível, sem estética de template";
  if (scope === "SHOP") return "vídeo comercial vertical moderno, produto real em destaque, demonstração objetiva, close funcional, ritmo rápido e limpo";
  if (scope === "GREG") return "vídeo pet realista, espontâneo, afetivo e divertido, comportamento natural do mesmo gato, luz doméstica natural";
  return "vídeo editorial humano e inspirador, corrida de rua realista, energia natural, cinematográfico leve, sensação de progresso e confiança";
}

function soundStyle(scope: ManualVideoScope): string {
  if (scope === "FUNCIONAL") return "Som ambiente de treino/academia discreto, impactos e respiração naturais quando fizerem sentido, trilha instrumental esportiva premium de 105–125 BPM, energética sem competir com fala, sem letra dominante.";
  if (scope === "SHOP") return "Sons reais de manuseio e uso do produto, trilha moderna e rítmica de 110–130 BPM, limpa e comercial, sem voz dominante e sem mascarar a demonstração.";
  if (scope === "GREG") return "Som ambiente doméstico natural, preservar miado ou pequenos ruídos reais quando houver, trilha instrumental leve, curiosa e divertida de 90–115 BPM, sem infantilizar.";
  return "Som ambiente realista do momento, como passos, vento e respiração quando fizer sentido, com trilha instrumental inspiradora e crescente de 95–115 BPM, emocional sem ser dramática e sem letra dominante.";
}

function referenceInstruction(scope: ManualVideoScope): string {
  if (scope === "GREG") return "Se a cena mostrar o Greg, suba uma foto real dele como imagem de referência. Preserve pelagem, rosto, corpo e identidade; não gere outro gato para representá-lo.";
  if (scope === "SHOP") return "Se a cena mostrar o produto, suba uma foto real do item como referência. Preserve marca, formato, cor e características; não invente detalhes.";
  if (scope === "FUNCIONAL" || scope === "CORRIDA") return "Se a cena precisar mostrar a Denize, suba uma foto real dela como referência. Preserve rosto, corpo e aparência; se não houver referência adequada, prefira enquadramento não identificável em vez de criar uma sósia.";
  return "Imagem de referência opcional quando precisar preservar uma pessoa, animal ou produto real.";
}

function transitionPlan(scope: ManualVideoScope, index: number, last: boolean): string {
  if (last) return "Nenhuma. Termine com 0,2–0,4s de respiro; use fade out curto só se combinar com o fechamento.";
  if (scope === "SHOP") return index % 2 === 0 ? "Use corte por movimento/match cut; se houver movimento forte, teste whip curto de cerca de 0,2s." : "Use corte no beat ou speed ramp leve; evite dissolve lento.";
  if (scope === "GREG") return index % 2 === 0 ? "Use jump cut curto ou punch-in discreto no timing da reação." : "Use corte seco no timing do Greg; freeze de 0,2–0,4s apenas se houver graça real.";
  if (scope === "FUNCIONAL") return index % 2 === 0 ? "Use match cut do movimento ou transição com motion blur curta, cerca de 0,2–0,3s." : "Use cross-dissolve curto, cerca de 0,3–0,4s, apenas se houver mudança de momento.";
  return index % 2 === 0 ? "Use cross-dissolve suave de cerca de 0,3–0,5s se a ideia mudar de emoção; se o movimento continuar, prefira match cut." : "Use push/zoom suave de cerca de 0,2–0,4s ou corte por movimento. Não use apagão para preto entre cenas internas.";
}

function brandTextRules(scope: ManualVideoScope, input: Input): string[] {
  const brandName = input.brand?.name || (scope === "FUNCIONAL" ? "Funcional UP" : scope === "GREG" ? "Greg" : "Corrida de Carreira");
  const rules = [
    `Use a identidade de ${brandName}. Paleta: ${palette(input)}.`,
    "No CapCut, use Texto / Text > Adicionar texto para inserir cada frase. Mantenha texto curto e grande, dentro da área segura vertical; não cubra rosto, produto ou execução do exercício.",
    "Use uma única família tipográfica limpa e forte; mantenha consistência de tamanho, alinhamento e animação ao longo do vídeo. Se animar a entrada do texto, use a mesma lógica em todas as cenas.",
  ];
  if (scope === "FUNCIONAL") rules.push("Importe a logo oficial do Funcional UP como sobreposição. Use-a nítida e sem redesenhar; assinatura discreta na abertura/fechamento ou canto seguro. Não use laranja, dourado ou amarelo como cor principal.");
  else if (scope === "CORRIDA") rules.push("Use o laranja da Corrida de Carreira como acento editorial. Se usar logo, mantenha-a discreta e sem competir com a história.");
  else if (scope === "SHOP") rules.push("A identidade da Corrida de Carreira apoia o vídeo, mas o produto real continua sendo o foco. Não cubra o produto com logo ou texto.");
  else rules.push("A identidade deve apoiar, não competir com o Greg. Evite excesso de stickers e molduras.");
  return rules;
}

function capcutAudio(scope: ManualVideoScope): string[] {
  const base = [
    "Primeiro ajuste o áudio original na timeline: mantenha fala e sons importantes claros; corte ruídos ou trechos inúteis.",
    "O Kit CapCut desta tarefa já traz um arquivo .SRT. Importe-o primeiro em Texto/Legendas > Importar legendas. Se houver fala espontânea que não esteja no roteiro, use Legendas automáticas apenas para complementar e revise manualmente.",
    "Para trilha dentro do CapCut, abra Áudio / Audio > Música / Music. Coloque a música em uma faixa abaixo do vídeo e alinhe batidas/viradas com as trocas de cena quando isso ajudar.",
    "Se o mesmo master for usado em TikTok, Instagram e YouTube, prefira exportar uma versão limpa sem música comercial protegida e adicionar a música recomendada na própria plataforma na hora de postar.",
    "Se o conteúdo tiver somente um destino e você decidir colocar trilha dentro do CapCut, mantenha-a baixa quando houver fala (aprox. 8–12%) e mais presente quando não houver fala (aprox. 20–30%).",
  ];
  if (scope === "GREG") base.push("Não esconda miado, ronronado ou ruído espontâneo que seja parte da graça.");
  if (scope === "SHOP") base.push("Sons de produto/manuseio podem ficar acima da trilha em trechos de demonstração.");
  return base;
}

function defaultSegments(input: Input) {
  return input.capture?.videoSegments?.length
    ? input.capture.videoSegments
    : [
        { order: 1, durationSeconds: 4, shot: "Gancho visual e contextualização rápida.", onScreen: input.angle || input.title },
        { order: 2, durationSeconds: 5, shot: "Desenvolvimento visual da ideia principal.", onScreen: input.promise || input.title },
        { order: 3, durationSeconds: 4, shot: "Fechamento coerente com a mensagem.", onScreen: input.cta || "Fechamento e chamada para ação." },
      ];
}

export function buildManualVideoGuide(input: Input): ManualVideoGuide {
  const scope = scopeFor(input);
  const segments = defaultSegments(input);
  const sceneGuides = segments.map((segment, index) => ({
    order: segment.order,
    durationSeconds: segment.durationSeconds,
    source: input.mode === "ZSKY_CAPCUT"
      ? `Use o take ${segment.order} gerado no ZSky. Objetivo: ${segment.whatToFilm || segment.shot}`
      : `Use sua gravação da cena ${segment.order}. ${segment.whatToFilm || segment.shot}`,
    trim: `Na timeline, corte este bloco para aproximadamente ${segment.durationSeconds}s. Preserve o melhor momento e deixe a ação começar rápido, sem sobra de preparação. Para a transição, abra Transições / Transitions e aplique somente entre este clipe e o seguinte.`,
    text: segment.onScreen || (segment.spokenLine ? `Se houver fala, destaque a ideia: “${segment.spokenLine}”.` : "Use somente texto curto que ajude a entender a cena."),
    transitionAfter: transitionPlan(scope, index, index === segments.length - 1),
  }));

  const zsky = input.mode === "ZSKY_CAPCUT"
    ? {
        intro: "O ZSky entra como gerador dos takes, não como editor final. Gere cada cena separadamente e leve os MP4s para o CapCut.",
        settings: [
          "Abra o gerador em Vídeo e use formato vertical 9:16.",
          "Gere um take por cena. Use a duração mais próxima da duração pedida; se o plano pedir 5s, escolha 5s.",
          "No campo principal de cena, cole o Prompt visual abaixo. No campo de som, cole o Prompt de som correspondente.",
          "Quando precisar preservar Denize, Greg ou produto, envie uma imagem real no campo de referência antes de gerar.",
          "Não peça texto, legenda ou logo dentro do take gerado. Esses elementos entram depois no CapCut, onde ficam mais controláveis e fiéis à marca.",
        ],
        scenes: segments.map((segment) => ({
          order: segment.order,
          durationSeconds: segment.durationSeconds,
          goal: segment.whatToFilm || segment.shot,
          visualPrompt: [
            `Vídeo vertical 9:16, duração aproximada de ${segment.durationSeconds} segundos.`,
            visualStyle(scope) + ".",
            `Cena: ${segment.whatToFilm || segment.shot}`,
            segment.howToFilm ? `Direção de câmera: ${segment.howToFilm}` : "Câmera natural, movimento suave e realista, composição limpa e foco claro na ação principal.",
            `Contexto editorial: ${input.angle || input.title}. Mensagem central: ${input.promise || input.title}.`,
            segment.onScreen ? `Deixe área visual segura para inserir depois no CapCut a mensagem: ${segment.onScreen}` : "Deixe área segura para texto se a composição permitir.",
            referenceInstruction(scope),
            "Sem texto gerado na imagem, sem legenda, sem logo, sem watermark, sem interface de aplicativo, sem deformação de rosto/corpo/produto.",
          ].join(" "),
          soundPrompt: `${soundStyle(scope)} Gere som coerente especificamente com esta cena: ${segment.whatToFilm || segment.shot} Evite narração sintética, salvo se o roteiro pedir fala explícita.`,
          referenceImage: referenceInstruction(scope),
        })),
        downloadInstruction: "Depois de aprovar cada take, baixe todos os MP4s e nomeie na ordem: cena-01, cena-02, cena-03... Isso deixa a montagem no CapCut praticamente mecânica.",
      }
    : undefined;

  return {
    scope,
    mode: input.mode,
    zsky,
    capcut: {
      intro: input.mode === "ZSKY_CAPCUT"
        ? "Agora transforme os takes do ZSky em um único vídeo final no CapCut."
        : "Depois de gravar os takes seguindo o Diretor de Gravação, monte tudo no CapCut nesta ordem.",
      projectSetup: [
        "Baixe primeiro o Kit CapCut desta tarefa. Ele traz LUT .CUBE, legendas .SRT, mapa de animações de texto, identidade e o passo a passo desta postagem.",
        "Abra o CapCut Desktop e clique em Novo projeto / Create project.",
        "Em Mídia / Media, clique em Importar / Import e selecione todos os vídeos e fotos. Se veio do ZSky, importe os takes cena-01, cena-02, cena-03... Se foi gravado por você, importe os arquivos originais.",
        "No canvas/projeto, escolha proporção 9:16 vertical. Centralize o assunto e mantenha rosto, produto e textos longe das bordas onde ficam os botões das redes sociais.",
        "Arraste os arquivos para a timeline na ordem das cenas abaixo. Primeiro feche a sequência e as durações; só depois coloque transições, LUT, texto, logo e música.",
        "Depois da timeline básica, importe o arquivo .CUBE em Ajustes/LUT e o arquivo .SRT em Texto/Legendas. Use o arquivo de animações de texto do kit para aplicar entradas, saídas e ênfases sem precisar inventar a edição.",
      ],
      scenes: sceneGuides,
      photoRule: "Se uma foto entrar por mais de 0,7s, não deixe parada: no CapCut use keyframes ou animação de foto para criar zoom/pan suave. Como referência, faça algo próximo de 100% → 106–110% durante o plano e/ou um deslocamento leve do enquadramento, sem deformar a pessoa, o Greg ou o produto.",
      textAndBrand: brandTextRules(scope, input),
      audio: capcutAudio(scope),
      export: [
        "Assista do início ao fim em velocidade normal antes de exportar. Confira se nenhuma transição parece um apagão acidental e se fotos realmente se movem.",
        "Exporte em MP4 vertical 1080×1920. Use 30 fps como padrão quando os arquivos de origem estiverem em 30 fps; se todo o material original estiver em 60 fps e o movimento se beneficiar disso, mantenha 60 fps.",
        "Não deixe watermark de outra plataforma no master. Salve o arquivo final com nome claro para depois importar no Meu Dia IA.",
      ],
      finalChecklist: [
        "Formato 9:16 e enquadramento correto.",
        "Cortes e transições vistos de verdade no vídeo final.",
        "Fotos com movimento perceptível quando usadas.",
        "Texto legível e dentro da identidade da marca.",
        "Logo correta quando obrigatória.",
        "Áudio/fala claros e música tratada conforme a estratégia de publicação.",
        `CTA coerente: ${input.cta || "seguir o CTA planejado da tarefa"}.`,
      ],
    },
    postingNote: `Destinos desta produção: ${(input.destinations || []).map((item) => `${item.platform} · ${item.placement}`).join(" | ") || "seguir os canais planejados na agenda"}. Depois de editar, importe o MP4 final no Meu Dia IA. O sistema continuará separando as instruções de cada postagem e a recomendação de música por canal.`,
  };
}

export function defaultManualHashtags(scope: ManualVideoScope): string {
  if (scope === "FUNCIONAL") return "#FuncionalUP #Treino #Corrida #Fortalecimento #Saúde";
  if (scope === "SHOP") return "#TikTokShop #Achadinhos #Produto #Dica #CorridaDeCarreira";
  if (scope === "GREG") return "#Greg #Gato #CatTok #Pet #GatosDoTikTok";
  return "#CorridaDeCarreira #Corrida #Carreira #Constância #Desenvolvimento";
}
