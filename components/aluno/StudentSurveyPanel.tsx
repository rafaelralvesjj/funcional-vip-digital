"use client";

import { useEffect, useMemo, useState } from "react";

type Survey = {
  id: string;
  surveyType: "TRIAL_END" | "PAID_START" | "PAID_30_DAYS";
  surveyLabel: string;
  status: string;
  dueDate?: string | null;
};

type SurveyAnswers = {
  nps: string;
  overallRating: string;
  easeRating: string;
  workoutFitRating: string;
  supportRating: string;
  evolutionRating: string;
  continueIntention: string;
  mainDifficulty: string;
  favoritePoint: string;
  improvementSuggestion: string;
  openFeedback: string;
};

const emptyAnswers: SurveyAnswers = {
  nps: "",
  overallRating: "",
  easeRating: "",
  workoutFitRating: "",
  supportRating: "",
  evolutionRating: "",
  continueIntention: "",
  mainDifficulty: "",
  favoritePoint: "",
  improvementSuggestion: "",
  openFeedback: "",
};

function getSurveyIntro(type: string) {
  if (type === "TRIAL_END") {
    return "Sua experiência inicial ajuda a gente a entender se o treino, o sistema e o acompanhamento fizeram sentido para você.";
  }

  if (type === "PAID_START") {
    return "Agora que você virou aluno(a), queremos entender melhor sua rotina, objetivo e o que espera do acompanhamento.";
  }

  if (type === "PAID_30_DAYS") {
    return "Você completou o primeiro mês de acompanhamento pago. Conte como está se sentindo para ajustarmos o próximo ciclo.";
  }

  return "Sua resposta ajuda o professor e a equipe a melhorar seu acompanhamento.";
}

function getPrimaryQuestion(type: string) {
  if (type === "TRIAL_END") return "De 0 a 10, como foi sua experiência inicial?";
  if (type === "PAID_START") return "De 0 a 10, o quanto você sente clareza sobre seu plano daqui para frente?";
  if (type === "PAID_30_DAYS") return "De 0 a 10, quanto você percebe evolução neste primeiro mês?";
  return "De 0 a 10, como está sua experiência?";
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function RatingSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold text-[#a1a1a1]">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#f5f5f5] outline-none focus:border-[#00A19C]"
      >
        <option value="">Selecione...</option>
        {Array.from({ length: 11 }).map((_, index) => (
          <option key={index} value={String(index)}>
            {index}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function StudentSurveyPanel() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>(emptyAnswers);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedSurvey = useMemo(
    () => surveys.find((survey) => survey.id === selectedSurveyId) || surveys[0] || null,
    [surveys, selectedSurveyId]
  );

  useEffect(() => {
    fetchSurveys();
  }, []);

  async function fetchSurveys() {
    setLoading(true);

    try {
      const res = await fetch("/api/student-surveys?status=PENDING", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        const list = Array.isArray(data?.surveys) ? data.surveys : [];
        setSurveys(list);
        setSelectedSurveyId(list[0]?.id || null);
      }
    } catch {}

    setLoading(false);
  }

  function updateAnswer(field: keyof SurveyAnswers, value: string) {
    setAnswers((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setAnswers(emptyAnswers);
    setSelectedSurveyId(null);
  }

  async function submitSurvey() {
    if (!selectedSurvey) return;

    if (!answers.overallRating) {
      setMessage("Informe pelo menos a nota geral antes de enviar.");
      setTimeout(() => setMessage(null), 4000);
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/student-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId: selectedSurvey.id,
          nps: answers.nps || null,
          overallRating: answers.overallRating || null,
          easeRating: answers.easeRating || null,
          workoutFitRating: answers.workoutFitRating || null,
          supportRating: answers.supportRating || null,
          evolutionRating: answers.evolutionRating || null,
          continueIntention: answers.continueIntention || null,
          mainDifficulty: answers.mainDifficulty || null,
          favoritePoint: answers.favoritePoint || null,
          improvementSuggestion: answers.improvementSuggestion || null,
          openFeedback: answers.openFeedback || null,
          answers,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setMessage(data?.message || "Pesquisa enviada. Obrigado por responder!");
        resetForm();
        await fetchSurveys();
      } else {
        setMessage(data?.error || "Não foi possível enviar a pesquisa agora.");
      }
    } catch {
      setMessage("Não foi possível enviar a pesquisa agora.");
    }

    setSubmitting(false);
    setTimeout(() => setMessage(null), 5000);
  }

  if (loading || surveys.length === 0) {
    return null;
  }

  const dueDate = formatDate(selectedSurvey?.dueDate || null);

  return (
    <div className="rounded-xl border border-[#00A19C]/25 bg-[#00A19C]/10 p-4 space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#00A19C] font-semibold">
            Sua opinião importa
          </p>
          <h2 className="mt-1 text-sm font-bold text-[#f5f5f5]">
            {selectedSurvey?.surveyLabel || "Pesquisa do aluno"}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[#d4d4d4]">
            {getSurveyIntro(selectedSurvey?.surveyType || "")}
          </p>
          {dueDate && (
            <p className="mt-1 text-[10px] text-[#a1a1a1]">
              Sugestão de resposta até {dueDate}.
            </p>
          )}
        </div>

        {surveys.length > 1 && (
          <select
            value={selectedSurvey?.id || ""}
            onChange={(event) => setSelectedSurveyId(event.target.value)}
            className="rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-[11px] text-[#f5f5f5] outline-none"
          >
            {surveys.map((survey) => (
              <option key={survey.id} value={survey.id}>
                {survey.surveyLabel}
              </option>
            ))}
          </select>
        )}
      </div>

      {message && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] text-blue-300">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RatingSelect
          label={getPrimaryQuestion(selectedSurvey?.surveyType || "")}
          value={answers.overallRating}
          onChange={(value) => updateAnswer("overallRating", value)}
        />

        <RatingSelect
          label="De 0 a 10, qual a chance de você indicar para alguém?"
          value={answers.nps}
          onChange={(value) => updateAnswer("nps", value)}
        />

        <RatingSelect
          label="Foi fácil usar o sistema?"
          value={answers.easeRating}
          onChange={(value) => updateAnswer("easeRating", value)}
        />

        <RatingSelect
          label="Você se sentiu acompanhado(a)?"
          value={answers.supportRating}
          onChange={(value) => updateAnswer("supportRating", value)}
        />

        <RatingSelect
          label="Os treinos pareceram adequados para você?"
          value={answers.workoutFitRating}
          onChange={(value) => updateAnswer("workoutFitRating", value)}
        />

        {selectedSurvey?.surveyType === "PAID_30_DAYS" && (
          <RatingSelect
            label="Você percebe evolução desde que começou?"
            value={answers.evolutionRating}
            onChange={(value) => updateAnswer("evolutionRating", value)}
          />
        )}

        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] font-semibold text-[#a1a1a1]">
            O que mais gostou até aqui?
          </label>
          <textarea
            value={answers.favoritePoint}
            onChange={(event) => updateAnswer("favoritePoint", event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
            placeholder="Ex: acompanhamento, treinos, clareza, facilidade de uso..."
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] font-semibold text-[#a1a1a1]">
            O que mais dificultou sua experiência?
          </label>
          <textarea
            value={answers.mainDifficulty}
            onChange={(event) => updateAnswer("mainDifficulty", event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
            placeholder="Ex: tempo, dúvida no exercício, rotina, sistema, intensidade..."
          />
        </div>

        {selectedSurvey?.surveyType === "PAID_START" && (
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-semibold text-[#a1a1a1]">
              O que você espera do acompanhamento daqui para frente?
            </label>
            <textarea
              value={answers.continueIntention}
              onChange={(event) => updateAnswer("continueIntention", event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
              placeholder="Conte como quer se sentir nos próximos 30/60 dias."
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] font-semibold text-[#a1a1a1]">
            O que você gostaria que fosse ajustado ou melhorado?
          </label>
          <textarea
            value={answers.improvementSuggestion}
            onChange={(event) => updateAnswer("improvementSuggestion", event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
            placeholder="Sua resposta ajuda o professor e a equipe a ajustar o acompanhamento."
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-[10px] font-semibold text-[#a1a1a1]">
            Comentário livre
          </label>
          <textarea
            value={answers.openFeedback}
            onChange={(event) => updateAnswer("openFeedback", event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[#ffffff10] bg-[#1a1a1a] px-3 py-2 text-xs text-[#f5f5f5] placeholder-[#6b6b6b] outline-none focus:border-[#00A19C]"
            placeholder="Escreva algo que não apareceu nas perguntas anteriores."
          />
        </div>
      </div>

      <button
        type="button"
        onClick={submitSurvey}
        disabled={submitting || !selectedSurvey}
        className="w-full rounded-lg bg-[#00A19C] px-4 py-2.5 text-xs font-bold text-[#0a0a0a] transition hover:bg-[#008B87] disabled:opacity-50"
      >
        {submitting ? "Enviando..." : "Enviar minha resposta"}
      </button>

      <p className="text-[9px] leading-relaxed text-[#6b6b6b]">
        Suas respostas são usadas para melhorar o acompanhamento, ajustar o treino e identificar pontos de atenção. Não é uma cobrança de performance.
      </p>
    </div>
  );
}
