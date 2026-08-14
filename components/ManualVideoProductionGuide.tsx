"use client";

import type { Brand } from "@prisma/client";
import { Check, Clipboard, Download, FileText, Film, Image as ImageIcon, Music2, Palette, Scissors, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { buildManualVideoGuide } from "@/lib/manual-video-guide";
import type { SmartPlanData, VideoProductionMode } from "@/lib/task-plan";

type ManualMode = Extract<VideoProductionMode, "ZSKY_CAPCUT" | "RECORDED_CAPCUT">;

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="manual-copy-block">
      <div className="row space-between">
        <strong>{label}</strong>
        <button type="button" className="button ghost compact" onClick={copy}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />} {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p>{value}</p>
    </div>
  );
}

export function ManualVideoProductionGuide({
  mode,
  taskId,
  taskTitle,
  brand,
  brandKey,
  plan,
  angle,
  promise,
  cta,
}: {
  mode: ManualMode;
  taskId: string;
  taskTitle: string;
  brand?: Brand | null;
  brandKey?: string | null;
  plan: SmartPlanData | null;
  angle?: string | null;
  promise?: string | null;
  cta?: string | null;
}) {
  const hasCounterCandidate = useMemo(() => (plan?.capture?.videoSegments || []).some((segment) => /(?:^|\D)(100|[1-9]?\d)\s*%/.test(`${segment.onScreen || ""} ${segment.spokenLine || ""}`)), [plan]);

  const kitBaseUrl = `/api/tasks/${taskId}/capcut-kit`;

  const guide = useMemo(() => buildManualVideoGuide({
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
    brandKey,
    capture: plan?.capture,
    destinations: plan?.destinations,
    title: taskTitle.replace("Preparar com IA: ", ""),
    angle,
    promise,
    cta,
    shopEnabled: Boolean(plan?.shop?.enabled),
  }), [angle, brand, brandKey, cta, mode, plan, promise, taskTitle]);

  return (
    <div className="manual-video-guide">
      {guide.zsky ? (
        <section className="manual-guide-card zsky-guide-card">
          <div className="manual-guide-heading"><Sparkles size={19} /><div><strong>Parte A · gerar os takes no ZSky.ai</strong><small>{guide.zsky.intro}</small></div></div>
          <ol className="manual-steps">
            {guide.zsky.settings.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <div className="zsky-scene-list">
            {guide.zsky.scenes.map((scene) => (
              <article key={scene.order} className="zsky-scene-card">
                <div className="row space-between"><strong>Cena {scene.order} · {scene.durationSeconds}s</strong><span className="manual-chip">Gerar separadamente</span></div>
                <p><strong>Objetivo:</strong> {scene.goal}</p>
                <CopyBlock label="Campo 1 · Prompt visual / Descreva a cena" value={scene.visualPrompt} />
                <CopyBlock label="Campo 2 · Som / música" value={scene.soundPrompt} />
                <div className="manual-reference-note"><ImageIcon size={16} /><span><strong>Imagem de referência:</strong> {scene.referenceImage}</span></div>
              </article>
            ))}
          </div>
          <div className="notice success"><Check size={16} /> {guide.zsky.downloadInstruction}</div>
        </section>
      ) : null}

      <section className="manual-guide-card capcut-guide-card">
        <div className="manual-guide-heading"><Scissors size={19} /><div><strong>{guide.zsky ? "Parte B · montar no CapCut" : "Montagem no CapCut"}</strong><small>{guide.capcut.intro}</small></div></div>

        <div className="capcut-kit-panel">
          <div className="row space-between capcut-kit-heading">
            <div>
              <strong>Kit CapCut pronto para esta postagem</strong>
              <small>O Meu Dia IA gera os arquivos com a identidade e os tempos desta tarefa. Baixe o ZIP completo ou somente o que precisar.</small>
            </div>
            <a className="button primary compact" href={`${kitBaseUrl}?file=zip`}><Download size={15} /> Baixar kit completo</a>
          </div>
          <div className="capcut-kit-files">
            <a className="capcut-kit-file" href={`${kitBaseUrl}?file=cube`}><Palette size={17} /><span><strong>LUT da marca .CUBE</strong><small>Tratamento visual pronto para importar no CapCut.</small></span><Download size={15} /></a>
            <a className="capcut-kit-file" href={`${kitBaseUrl}?file=srt`}><FileText size={17} /><span><strong>Legendas .SRT</strong><small>Texto e timing prontos. Depois aplique as animações indicadas.</small></span><Download size={15} /></a>
            <a className="capcut-kit-file" href={`${kitBaseUrl}?file=text-animations`}><Sparkles size={17} /><span><strong>Animações de texto</strong><small>Mapa cena a cena de entrada, saída e ênfase no CapCut.</small></span><Download size={15} /></a>
            <a className="capcut-kit-file" href={`${kitBaseUrl}?file=guide`}><Scissors size={17} /><span><strong>Passo a passo CapCut</strong><small>Timeline, cortes, transições, LUT, áudio e exportação.</small></span><Download size={15} /></a>
            {guide.zsky ? <a className="capcut-kit-file" href={`${kitBaseUrl}?file=zsky`}><Sparkles size={17} /><span><strong>Prompts ZSky.ai</strong><small>Campo 1 visual + Campo 2 som/música para cada take.</small></span><Download size={15} /></a> : null}
            {brand?.logoUrl ? <a className="capcut-kit-file" href={`${kitBaseUrl}?file=logo`}><ImageIcon size={17} /><span><strong>Logo oficial</strong><small>Arquivo original cadastrado para esta marca.</small></span><Download size={15} /></a> : null}
            {hasCounterCandidate ? <a className="capcut-kit-file" href={`${kitBaseUrl}?file=counter`}><FileText size={17} /><span><strong>Contador percentual .SRT</strong><small>Arquivo extra quando o roteiro contém um percentual animável.</small></span><Download size={15} /></a> : null}
          </div>
          <div className="notice capcut-kit-note"><Check size={16} /> O .CUBE é tratamento de cor (LUT). O .SRT leva texto + tempo; a animação visual é aplicada no CapCut seguindo o arquivo “Animações de texto”.</div>
        </div>

        <div className="manual-guide-subsection">
          <h4>1. Criar o projeto</h4>
          <ol className="manual-steps">{guide.capcut.projectSetup.map((item) => <li key={item}>{item}</li>)}</ol>
        </div>

        <div className="manual-guide-subsection">
          <h4>2. Montar a timeline</h4>
          <div className="capcut-scene-list">
            {guide.capcut.scenes.map((scene) => (
              <article key={scene.order} className="capcut-scene-card">
                <strong>Cena {scene.order} · alvo {scene.durationSeconds}s</strong>
                <p><Film size={14} /> <span><strong>Arquivo:</strong> {scene.source}</span></p>
                <p><Scissors size={14} /> <span><strong>Corte:</strong> {scene.trim}</span></p>
                <p><Sparkles size={14} /> <span><strong>Texto:</strong> {scene.text}</span></p>
                <p><span className="transition-dot" /> <span><strong>Depois desta cena:</strong> {scene.transitionAfter}</span></p>
              </article>
            ))}
          </div>
          <div className="notice"><ImageIcon size={16} /> {guide.capcut.photoRule}</div>
        </div>

        <div className="manual-guide-subsection">
          <h4>3. Identidade e texto</h4>
          <ul className="manual-bullets">{guide.capcut.textAndBrand.map((item) => <li key={item}>{item}</li>)}</ul>
          {brand?.logoUrl ? <a className="button secondary compact manual-logo-link" href={brand.logoUrl} target="_blank" rel="noreferrer">Abrir logo oficial de {brand.name}</a> : null}
        </div>

        <div className="manual-guide-subsection">
          <h4>4. Áudio e música</h4>
          <ul className="manual-bullets">{guide.capcut.audio.map((item) => <li key={item}><Music2 size={14} /> <span>{item}</span></li>)}</ul>
        </div>

        <div className="manual-guide-subsection">
          <h4>5. Exportar</h4>
          <ol className="manual-steps">{guide.capcut.export.map((item) => <li key={item}>{item}</li>)}</ol>
        </div>

        <div className="manual-final-check">
          <strong>Conferência antes de trazer o vídeo de volta</strong>
          <ul>{guide.capcut.finalChecklist.map((item) => <li key={item}><Check size={14} /> {item}</li>)}</ul>
        </div>
        <div className="notice success"><Check size={16} /> {guide.postingNote}</div>
      </section>
    </div>
  );
}
