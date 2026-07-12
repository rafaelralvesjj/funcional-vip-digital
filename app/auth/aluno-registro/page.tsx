"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateAgeYears, getTodayDateInput, validateBirthDateInput } from "@/lib/student-age";

const OTHER_OBJECTIVE = "Outro";

const OBJECTIVE_OPTIONS = [
  "Emagrecimento",
  "Ganho de massa muscular / hipertrofia",
  "Condicionamento físico geral",
  "Saúde e qualidade de vida",
  "Melhora da mobilidade e flexibilidade",
  "Fortalecimento muscular",
  "Definição corporal",
  "Preparação para corrida",
  "Começar a correr",
  "Melhorar desempenho na corrida",
  "Fortalecimento para corrida",
  "Prevenção de lesões na corrida",
  "Retorno aos treinos após lesão",
  "Treinamento por prescrição médica",
  "Reabilitação / retomada com cuidado",
  "Melhora de performance esportiva",
  "Atleta de alta performance",
  "Preparação física para luta ou arte marcial",
  "Preparação física para esporte específico",
  "Redução de dores e melhora funcional",
  OTHER_OBJECTIVE,
];

export default function AlunoRegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    birthDate: "",
    password: "",
    confirmPassword: "",
    objective: "",
    objectiveOther: "",
    activityLevel: "",
    trainingEnvironment: "",
    availableEquipment: "",
    timeAvailableMinutes: "",
    preferredDays: "",
    currentPain: "",
    medicalRestriction: "",
    trainingHistory: "",
    weightKg: "",
    heightCm: "",
    notes: "",
    acceptedTerms: false,
  });

  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const todayDateInput = getTodayDateInput();
  const calculatedAge = form.birthDate ? calculateAgeYears(form.birthDate) : null;

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const target = event.target;
    const { name, value } = target;
    const fieldValue =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : value;

    setForm((current) => {
      if (name === "objective" && value !== OTHER_OBJECTIVE) {
        return {
          ...current,
          objective: value,
          objectiveOther: "",
        };
      }

      return {
        ...current,
        [name]: fieldValue,
      };
    });
  }

  function getFinalObjective() {
    if (form.objective === OTHER_OBJECTIVE) {
      const otherObjective = form.objectiveOther.trim();

      if (!otherObjective) {
        return "";
      }

      return `${OTHER_OBJECTIVE}: ${otherObjective}`;
    }

    return form.objective.trim();
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
      } else {
        const err = await res.json().catch(() => null);
        alert(`Erro ao enviar imagem: ${err?.error || "tente novamente."}`);
      }
    } catch {
      alert("Erro ao conectar com o servidor");
    } finally {
      setUploading(false);
    }
  }

  function validateInitialProfile(): string | null {
    const missing: string[] = [];

    if (!form.objective.trim()) missing.push("objetivo principal");
    if (form.objective === OTHER_OBJECTIVE && !form.objectiveOther.trim()) {
      missing.push("descrição do objetivo");
    }
    if (!form.activityLevel.trim()) missing.push("nível atual");
    if (!form.trainingEnvironment.trim()) missing.push("local de treino");
    if (!form.availableEquipment.trim()) missing.push("equipamentos disponíveis");
    if (!form.timeAvailableMinutes.trim()) missing.push("tempo disponível por treino");
    if (!form.currentPain.trim()) missing.push("dor/desconforto atual");
    if (!form.medicalRestriction.trim()) missing.push("restrição médica ou física");

    if (missing.length === 0) return null;

    return `Preencha a ficha inicial para treino seguro: ${missing.join(", ")}.`;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!form.name || !form.email || !form.phone || !form.birthDate || !form.password) {
      setError("Preencha nome, e-mail, telefone, data de nascimento e senha.");
      return;
    }

    const birthDateValidation = validateBirthDateInput(form.birthDate);

    if (birthDateValidation.error) {
      setError(birthDateValidation.error);
      return;
    }

    if (form.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }

    const profileError = validateInitialProfile();

    if (profileError) {
      setError(profileError);
      return;
    }

    const finalObjective = getFinalObjective();

    if (!finalObjective) {
      setError("Informe seu objetivo principal para continuar.");
      return;
    }

    if (!form.acceptedTerms) {
      setError("Para iniciar a experiência gratuita, aceite o termo de experiência.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/aluno/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          birthDate: form.birthDate,
          password: form.password,
          confirmPassword: form.confirmPassword,
          imageUrl: imageUrl || null,
          acceptedTerms: form.acceptedTerms,
          source: "LANDING_PAGE",
          objective: finalObjective,
          primaryGoal: form.objective,
          primaryGoalOtherDescription:
            form.objective === OTHER_OBJECTIVE ? form.objectiveOther.trim() : null,
          activityLevel: form.activityLevel,
          trainingEnvironment: form.trainingEnvironment,
          availableEquipment: form.availableEquipment,
          timeAvailableMinutes: form.timeAvailableMinutes,
          preferredDays: form.preferredDays,
          currentPain: form.currentPain,
          medicalRestriction: form.medicalRestriction,
          trainingHistory: form.trainingHistory,
          weightKg: form.weightKg,
          heightCm: form.heightCm,
          notes: form.notes,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Erro ao criar conta.");
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.ok) {
        router.push("/aluno");
      } else {
        setError("Conta criada, mas houve erro ao fazer login. Faça login manualmente.");
        router.push("/auth/signin");
      }
    } catch {
      setError("Erro interno do servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#D4A373]">
            Funcional Vip Digital
          </h1>
          <p className="text-sm text-[#a1a1a1] mt-2">
            Crie sua conta para iniciar sua experiência gratuita
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#111] border border-[#ffffff10] rounded-2xl p-6 space-y-5"
        >
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-xl bg-[#D4A373]/10 border border-[#D4A373]/20 px-4 py-3">
            <p className="text-sm text-[#D4A373] font-semibold">
              Experiência gratuita de 1 mês
            </p>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Seu cadastro ativa uma experiência grátis. Depois disso, a equipe irá vincular um professor para liberar seus primeiros treinos.
            </p>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#D4A373]">
                1. Dados de acesso
              </h2>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Use um e-mail que você acessa no celular e um WhatsApp válido para manter seu acompanhamento atualizado.
              </p>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Sua foto <span className="text-[#6b6b6b]">(opcional)</span>
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-[#a1a1a1] file:mr-4 file:rounded-lg file:border-0 file:bg-[#D4A373] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0a0a0a]"
              />

              {uploading && (
                <p className="text-xs text-[#D4A373] mt-1">Enviando foto...</p>
              )}

              {imageUrl && !uploading && (
                <p className="text-xs text-green-400 mt-1">✅ Foto enviada!</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Nome completo *
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  E-mail *
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="voce@email.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  WhatsApp *
                </label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="(61) 99999-9999"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#D4A373]/30 bg-[#D4A373]/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D4A373]/15 text-[#D4A373]">
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-18 8V6a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#f5f5f5]">
                    Ative as notificações do seu e-mail
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#d4d4d4]">
                    Liberações de treino, avisos da gestão e outras atualizações importantes
                    serão enviadas para este endereço. Mantenha as notificações do aplicativo
                    de e-mail ativas no celular e confira também Spam, Lixo eletrônico e Promoções.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Data de nascimento *
              </label>
              <input
                name="birthDate"
                type="date"
                value={form.birthDate}
                onChange={handleChange}
                max={todayDateInput}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                autoComplete="bday"
              />
              <p className="text-[11px] text-[#6b6b6b] mt-1">
                A idade é calculada automaticamente e ajuda o professor e a IA a ajustar intensidade, volume, recuperação e progressão com mais segurança.
              </p>
              {calculatedAge !== null && calculatedAge >= 0 && (
                <p className="text-xs text-[#D4A373] mt-1 font-semibold">
                  Idade calculada: {calculatedAge} ano{calculatedAge === 1 ? "" : "s"}
                  {calculatedAge < 18 ? " · aluno menor de idade" : ""}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Senha *
                </label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Confirmar senha *
                </label>
                <input
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="Repita sua senha"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-[#ffffff10] pt-5">
            <div>
              <h2 className="text-base font-semibold text-[#D4A373]">
                2. Ficha inicial para treino seguro
              </h2>
              <p className="text-xs text-[#a1a1a1] mt-1">
                Essas informações ajudam o professor a montar um treino inicial mais seguro e adequado para sua rotina.
              </p>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Qual é seu objetivo principal? *
              </label>
              <select
                name="objective"
                value={form.objective}
                onChange={handleChange}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
              >
                <option value="">Selecione...</option>
                {OBJECTIVE_OPTIONS.map((objective) => (
                  <option key={objective} value={objective}>
                    {objective}
                  </option>
                ))}
              </select>

              {form.objective === OTHER_OBJECTIVE && (
                <div className="mt-3">
                  <label className="block text-sm text-[#d6d6d6] mb-1">
                    Descreva seu objetivo *
                  </label>
                  <textarea
                    name="objectiveOther"
                    value={form.objectiveOther}
                    onChange={handleChange}
                    rows={3}
                    className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                    placeholder="Ex: melhorar condicionamento para uma trilha, preparar para uma prova específica, voltar após uma pausa longa"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Nível atual *
                </label>
                <select
                  name="activityLevel"
                  value={form.activityLevel}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                >
                  <option value="">Selecione...</option>
                  <option value="Sedentário">Sedentário</option>
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediário">Intermediário</option>
                  <option value="Avançado">Avançado</option>
                  <option value="Retomando após pausa">Retomando após pausa</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Onde você pretende treinar? *
                </label>
                <select
                  name="trainingEnvironment"
                  value={form.trainingEnvironment}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                >
                  <option value="">Selecione...</option>
                  <option value="Academia">Academia</option>
                  <option value="Casa">Casa</option>
                  <option value="Condomínio">Condomínio</option>
                  <option value="Parque / ao ar livre">Parque / ao ar livre</option>
                  <option value="Misto">Misto</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Equipamentos ou materiais disponíveis *
              </label>
              <textarea
                name="availableEquipment"
                value={form.availableEquipment}
                onChange={handleChange}
                rows={3}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                placeholder="Ex: halteres, elástico, colchonete, academia completa, nenhum equipamento"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Tempo disponível por treino *
                </label>
                <input
                  name="timeAvailableMinutes"
                  type="number"
                  min="10"
                  max="180"
                  value={form.timeAvailableMinutes}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 40"
                />
              </div>

              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Dias ou horários preferidos <span className="text-[#6b6b6b]">(opcional)</span>
                </label>
                <input
                  name="preferredDays"
                  value={form.preferredDays}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="Ex: segunda e quarta à noite"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Sente alguma dor ou desconforto hoje? *
              </label>
              <textarea
                name="currentPain"
                value={form.currentPain}
                onChange={handleChange}
                rows={2}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                placeholder="Ex: não sinto dores; dor leve no joelho; desconforto na lombar"
              />
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Possui restrição médica ou física? *
              </label>
              <textarea
                name="medicalRestriction"
                value={form.medicalRestriction}
                onChange={handleChange}
                rows={2}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                placeholder="Ex: nenhuma; liberação médica com restrição; evitar impacto; problema no ombro"
              />
              <p className="text-[11px] text-[#6b6b6b] mt-1">
                Em caso de condição médica, o professor poderá solicitar liberação/orientação profissional antes de evoluir intensidade.
              </p>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Histórico de treino <span className="text-[#6b6b6b]">(opcional)</span>
              </label>
              <textarea
                name="trainingHistory"
                value={form.trainingHistory}
                onChange={handleChange}
                rows={3}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                placeholder="Ex: já treinei musculação por 1 ano; estou parado há 6 meses; nunca treinei"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Peso em kg <span className="text-[#6b6b6b]">(opcional)</span>
                </label>
                <input
                  name="weightKg"
                  value={form.weightKg}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 72"
                />
              </div>

              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Altura em cm <span className="text-[#6b6b6b]">(opcional)</span>
                </label>
                <input
                  name="heightCm"
                  value={form.heightCm}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                  placeholder="Ex: 168"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Algo mais que o professor precisa saber? <span className="text-[#6b6b6b]">(opcional)</span>
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4A373]"
                placeholder="Ex: prefiro treinos curtos; tenho pouco tempo; quero começar devagar"
              />
            </div>
          </section>

          <label className="flex gap-3 rounded-xl bg-[#1a1a1a] border border-[#ffffff10] px-4 py-3 cursor-pointer">
            <input
              name="acceptedTerms"
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={handleChange}
              className="mt-1 h-4 w-4 accent-[#D4A373]"
            />
            <span className="text-xs text-[#d6d6d6] leading-relaxed">
              Li e aceito o{" "}
              <strong className="text-[#D4A373]">
                Termo de Experiência Gratuita
              </strong>
              . Entendo que o período experimental tem duração limitada, não gera cobrança automática e que, para continuar após o período gratuito, será necessário contratar um plano.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !form.acceptedTerms}
            className="w-full rounded-xl bg-[#D4A373] px-4 py-3 font-semibold text-[#0a0a0a] hover:bg-[#c49563] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Criando experiência..." : "Começar experiência gratuita"}
          </button>

          <p className="text-center text-sm text-[#a1a1a1]">
            Já tem conta?{" "}
            <Link href="/auth/signin" className="text-[#D4A373] hover:underline">
              Fazer login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
