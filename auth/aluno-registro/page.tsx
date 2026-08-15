"use client";

import BrandLogo from "@/components/BrandLogo";

import { useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateAgeYears, getTodayDateInput, validateBirthDateInput } from "@/lib/student-age";
import {
  buildTrainingResourceSummary,
  GYM_TYPE_OPTIONS,
  TRAINING_EQUIPMENT_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  type TrainingEquipmentValue,
  type TrainingLocationValue,
} from "@/lib/student-training-resources";
import {
  WORKOUT_DAY_OPTIONS,
  type WorkoutDayCode,
} from "@/lib/student-workout-days";

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
    preferredName: "",
    email: "",
    phone: "",
    birthDate: "",
    password: "",
    confirmPassword: "",
    objective: "",
    objectiveOther: "",
    activityLevel: "",
    trainingLocations: [] as TrainingLocationValue[],
    gymType: "",
    selectedEquipment: [] as TrainingEquipmentValue[],
    equipmentOther: "",
    gymUnavailableEquipment: "",
    timeAvailableMinutes: "",
    preferredWorkoutDays: [] as WorkoutDayCode[],
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const submitFeedbackRef = useRef<HTMLDivElement | null>(null);

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

  function toggleTrainingLocation(location: TrainingLocationValue) {
    setForm((current) => {
      const alreadySelected = current.trainingLocations.includes(location);
      const trainingLocations = alreadySelected
        ? current.trainingLocations.filter((item) => item !== location)
        : [...current.trainingLocations, location];

      return {
        ...current,
        trainingLocations,
        gymType: trainingLocations.includes("ACADEMIA") ? current.gymType : "",
        gymUnavailableEquipment: trainingLocations.includes("ACADEMIA")
          ? current.gymUnavailableEquipment
          : "",
        selectedEquipment:
          trainingLocations.includes("CASA") || trainingLocations.includes("AR_LIVRE")
            ? current.selectedEquipment
            : [],
        equipmentOther:
          trainingLocations.includes("CASA") || trainingLocations.includes("AR_LIVRE")
            ? current.equipmentOther
            : "",
      };
    });
  }

  function toggleEquipment(equipment: TrainingEquipmentValue) {
    setForm((current) => {
      if (equipment === "NONE") {
        const willSelectNone = !current.selectedEquipment.includes("NONE");

        return {
          ...current,
          selectedEquipment: willSelectNone ? ["NONE"] : [],
          equipmentOther: "",
        };
      }

      const withoutNone = current.selectedEquipment.filter((item) => item !== "NONE");
      const alreadySelected = withoutNone.includes(equipment);
      const selectedEquipment = alreadySelected
        ? withoutNone.filter((item) => item !== equipment)
        : [...withoutNone, equipment];

      return {
        ...current,
        selectedEquipment,
        equipmentOther: selectedEquipment.includes("OTHER")
          ? current.equipmentOther
          : "",
      };
    });
  }

  function togglePreferredWorkoutDay(day: WorkoutDayCode) {
    setForm((current) => {
      const alreadySelected = current.preferredWorkoutDays.includes(day);
      const preferredWorkoutDays = alreadySelected
        ? current.preferredWorkoutDays.filter((item) => item !== day)
        : [...current.preferredWorkoutDays, day];

      return {
        ...current,
        preferredWorkoutDays,
      };
    });
  }

  function getTrainingResources() {
    return buildTrainingResourceSummary({
      trainingLocations: form.trainingLocations,
      gymType: form.gymType,
      selectedEquipment: form.selectedEquipment,
      equipmentOther: form.equipmentOther,
      gymUnavailableEquipment: form.gymUnavailableEquipment,
    });
  }

  function showSubmitError(message: string) {
    setError(message);

    window.requestAnimationFrame(() => {
      submitFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    formData.append("folder", "cadastro-aluno");

    try {
      const res = await fetch("/api/upload-profile-photo", {
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

    const trainingResources = getTrainingResources();
    if (trainingResources.errors.length > 0) {
      missing.push(...trainingResources.errors);
    }

    if (!form.timeAvailableMinutes.trim()) missing.push("tempo disponível por treino");
    if (form.preferredWorkoutDays.length === 0) missing.push("dias disponíveis para treinar");
    if (!form.currentPain.trim()) missing.push("dor/desconforto atual");
    if (!form.medicalRestriction.trim()) missing.push("restrição médica ou física");

    if (missing.length === 0) return null;

    return `Preencha a ficha inicial para treino seguro: ${missing.join(", ")}.`;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);
    setError("");

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.birthDate || !form.password) {
      showSubmitError("Preencha nome, e-mail, telefone, data de nascimento e senha.");
      return;
    }

    const birthDateValidation = validateBirthDateInput(form.birthDate);

    if (birthDateValidation.error) {
      showSubmitError(birthDateValidation.error);
      return;
    }

    if (form.password.length < 6) {
      showSubmitError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      showSubmitError("As senhas não conferem.");
      return;
    }

    const profileError = validateInitialProfile();

    if (profileError) {
      showSubmitError(profileError);
      return;
    }

    const finalObjective = getFinalObjective();
    const trainingResources = getTrainingResources();

    if (trainingResources.errors.length > 0) {
      showSubmitError(trainingResources.errors[0]);
      return;
    }

    if (!finalObjective) {
      showSubmitError("Informe seu objetivo principal para continuar.");
      return;
    }

    if (!form.acceptedTerms) {
      showSubmitError("Para iniciar a experiência gratuita, aceite o termo de experiência.");
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
          preferredName: form.preferredName,
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
          trainingLocations: form.trainingLocations,
          gymType: form.gymType,
          selectedEquipment: form.selectedEquipment,
          equipmentOther: form.equipmentOther,
          gymUnavailableEquipment: form.gymUnavailableEquipment,
          trainingEnvironment: trainingResources.trainingEnvironment,
          availableEquipment: trainingResources.availableEquipment,
          timeAvailableMinutes: form.timeAvailableMinutes,
          preferredWorkoutDays: form.preferredWorkoutDays,
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
        showSubmitError(data?.error || "Erro ao criar conta.");
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
        showSubmitError("Conta criada, mas houve erro ao fazer login. Faça login manualmente.");
        router.push("/auth/signin");
      }
    } catch {
      showSubmitError("Não foi possível concluir o cadastro agora. Tente novamente. Se o problema continuar, fale com a equipe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <BrandLogo variant="full" size="lg" priority />
          </div>
          <h1 className="text-2xl font-bold text-[#00A19C]">
            Funcional UP Digital
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

          <div className="rounded-xl bg-[#00A19C]/10 border border-[#00A19C]/20 px-4 py-3">
            <p className="text-sm text-[#00A19C] font-semibold">
              Experiência gratuita de 1 mês
            </p>
            <p className="text-xs text-[#a1a1a1] mt-1">
              Seu cadastro ativa uma experiência grátis. Depois disso, a equipe irá vincular um professor para liberar seus primeiros treinos.
            </p>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-[#00A19C]">
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
                className="block w-full text-sm text-[#a1a1a1] file:mr-4 file:rounded-lg file:border-0 file:bg-[#00A19C] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#0a0a0a]"
              />

              {uploading && (
                <p className="text-xs text-[#00A19C] mt-1">Enviando foto...</p>
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Como você gosta de ser chamado? <span className="text-[#6b6b6b]">(opcional)</span>
              </label>
              <input
                name="preferredName"
                value={form.preferredName}
                onChange={handleChange}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                placeholder="Ex.: Rafa, Dê, Gabi"
                autoComplete="nickname"
                maxLength={40}
              />
              <p className="mt-1 text-xs text-[#8a8a8a]">Usaremos esse nome nos e-mails, avisos e mensagens. Se não preencher, usaremos seu primeiro nome.</p>
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                  placeholder="(61) 99999-9999"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#00A19C]/30 bg-[#00A19C]/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00A19C]/15 text-[#00A19C]">
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                autoComplete="bday"
              />
              <p className="text-[11px] text-[#6b6b6b] mt-1">
                A idade é calculada automaticamente e ajuda o professor e a IA a ajustar intensidade, volume, recuperação e progressão com mais segurança.
              </p>
              {calculatedAge !== null && calculatedAge >= 0 && (
                <p className="text-xs text-[#00A19C] mt-1 font-semibold">
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                  placeholder="Repita sua senha"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-[#ffffff10] pt-5">
            <div>
              <h2 className="text-base font-semibold text-[#00A19C]">
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                    className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                    placeholder="Ex: melhorar condicionamento para uma trilha, preparar para uma prova específica, voltar após uma pausa longa"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-1">
                Nível atual *
              </label>
              <select
                name="activityLevel"
                value={form.activityLevel}
                onChange={handleChange}
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
              >
                <option value="">Selecione...</option>
                <option value="Sedentário">Sedentário</option>
                <option value="Iniciante">Iniciante</option>
                <option value="Intermediário">Intermediário</option>
                <option value="Avançado">Avançado</option>
                <option value="Retomando após pausa">Retomando após pausa</option>
              </select>
            </div>

            <div className="rounded-xl border border-[#ffffff10] bg-[#0d0d0d] p-4">
              <div>
                <label className="block text-sm font-semibold text-[#f5f5f5]">
                  Onde você pretende treinar? *
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-[#8f8f8f]">
                  Você pode selecionar mais de um local. O professor e a IA usarão essa informação para montar treinos compatíveis com sua rotina.
                </p>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                {TRAINING_LOCATION_OPTIONS.map((option) => {
                  const selected = form.trainingLocations.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleTrainingLocation(option.value)}
                      aria-pressed={selected}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-[#00A19C] bg-[#00A19C]/10 shadow-[0_0_0_1px_rgba(0,161,156,0.15)]"
                          : "border-[#ffffff10] bg-[#151515] hover:border-[#00A19C]/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={selected ? "font-semibold text-[#00A19C]" : "font-semibold text-[#f5f5f5]"}>
                          {option.label}
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                            selected
                              ? "border-[#00A19C] bg-[#00A19C] text-[#0a0a0a]"
                              : "border-[#ffffff20] text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-[#8f8f8f]">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {form.trainingLocations.includes("ACADEMIA") && (
                <div className="mt-4 rounded-xl border border-[#00A19C]/20 bg-[#00A19C]/5 p-4">
                  <label className="block text-sm text-[#d6d6d6] mb-1">
                    Qual estrutura de academia estará disponível? *
                  </label>
                  <select
                    name="gymType"
                    value={form.gymType}
                    onChange={handleChange}
                    className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                  >
                    <option value="">Selecione...</option>
                    {GYM_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <div className="mt-3">
                    <label className="block text-sm text-[#d6d6d6] mb-1">
                      Falta algum equipamento ou existe alguma limitação nessa academia? <span className="text-[#6b6b6b]">(opcional)</span>
                    </label>
                    <textarea
                      name="gymUnavailableEquipment"
                      value={form.gymUnavailableEquipment}
                      onChange={handleChange}
                      rows={2}
                      className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                      placeholder="Ex: não possui leg press, não tem área livre, aparelhos de cardio limitados"
                    />
                  </div>
                </div>
              )}

              {(form.trainingLocations.includes("CASA") ||
                form.trainingLocations.includes("AR_LIVRE")) && (
                <div className="mt-4 rounded-xl border border-[#ffffff10] bg-[#151515] p-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#f5f5f5]">
                      Quais equipamentos ou recursos você possui? *
                    </label>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#8f8f8f]">
                      Marque tudo o que realmente poderá usar. Se não tiver nada, selecione “Nenhum equipamento”.
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {TRAINING_EQUIPMENT_OPTIONS.map((option) => {
                      const selected = form.selectedEquipment.includes(option.value);

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleEquipment(option.value)}
                          aria-pressed={selected}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs transition ${
                            selected
                              ? "border-[#00A19C] bg-[#00A19C]/10 text-[#f5f5f5]"
                              : "border-[#ffffff10] bg-[#101010] text-[#bdbdbd] hover:border-[#00A19C]/35"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                              selected
                                ? "border-[#00A19C] bg-[#00A19C] text-[#0a0a0a]"
                                : "border-[#ffffff20] text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {form.selectedEquipment.includes("OTHER") && (
                    <div className="mt-3">
                      <label className="block text-sm text-[#d6d6d6] mb-1">
                        Descreva o outro equipamento ou recurso *
                      </label>
                      <input
                        name="equipmentOther"
                        value={form.equipmentOther}
                        onChange={handleChange}
                        className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                        placeholder="Ex: saco de pancadas, trenó, cone, faixa específica"
                      />
                    </div>
                  )}
                </div>
              )}

              {form.trainingLocations.length > 0 && (
                <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-[11px] leading-relaxed text-emerald-200/80">
                    O treino será planejado somente com ambientes e equipamentos compatíveis com o que você informou. Mudou de local ou comprou algum equipamento? Atualize a gestão ou avise o professor pelo chat.
                  </p>
                </div>
              )}
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                  placeholder="Ex: 40"
                />
              </div>

              <div>
                <label className="block text-sm text-[#d6d6d6] mb-1">
                  Horário preferido <span className="text-[#6b6b6b]">(opcional)</span>
                </label>
                <input
                  name="preferredDays"
                  value={form.preferredDays}
                  onChange={handleChange}
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                  placeholder="Ex: à noite; antes das 8h; depois do trabalho"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#d6d6d6] mb-2">
                Em quais dias da semana você pode treinar? *
              </label>
              <p className="mb-3 text-[11px] leading-relaxed text-[#8a8a8a]">
                Marque os dias que funcionam para sua rotina. Se quiser dias fixos, marque somente esses dias. Se marcar mais opções do que a quantidade de treinos do plano, o sistema distribuirá os treinos entre elas para evitar concentração. Sábado e domingo também podem ser escolhidos.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WORKOUT_DAY_OPTIONS.map((option) => {
                  const selected = form.preferredWorkoutDays.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => togglePreferredWorkoutDay(option.value)}
                      className={
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition " +
                        (selected
                          ? "border-[#00A19C] bg-[#00A19C]/15 text-[#00A19C]"
                          : "border-[#ffffff10] bg-[#1a1a1a] text-[#a1a1a1] hover:border-[#00A19C]/50 hover:text-[#f5f5f5]")
                      }
                      aria-pressed={selected}
                    >
                      {option.shortLabel}
                    </button>
                  );
                })}
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                  className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
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
                className="w-full bg-[#1a1a1a] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#00A19C]"
                placeholder="Ex: prefiro treinos curtos; tenho pouco tempo; quero começar devagar"
              />
            </div>
          </section>

          <label className={`flex gap-3 rounded-xl border px-4 py-3 cursor-pointer ${
            submitAttempted && !form.acceptedTerms
              ? "border-red-500/40 bg-red-500/10"
              : "border-[#ffffff10] bg-[#1a1a1a]"
          }`}>
            <input
              name="acceptedTerms"
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={handleChange}
              className="mt-1 h-4 w-4 accent-[#00A19C]"
            />
            <span className="text-xs text-[#d6d6d6] leading-relaxed">
              Li e aceito o{" "}
              <strong className="text-[#00A19C]">
                Termo de Experiência Gratuita
              </strong>
              . Entendo que o período experimental tem duração limitada, não gera cobrança automática e que, para continuar após o período gratuito, será necessário contratar um plano.
            </span>
          </label>

          {submitAttempted && !form.acceptedTerms && (
            <p className="text-xs text-red-300">
              Marque o aceite do termo acima para concluir o cadastro.
            </p>
          )}

          {error && (
            <div
              ref={submitFeedbackRef}
              role="alert"
              aria-live="assertive"
              className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300"
            >
              <p className="font-semibold">Não foi possível concluir ainda.</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || uploading}
            aria-busy={loading}
            className="w-full rounded-xl bg-[#00A19C] px-4 py-3 font-semibold text-[#0a0a0a] hover:bg-[#008B87] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading
              ? "Aguarde o envio da foto..."
              : loading
                ? "Criando experiência..."
                : "Começar experiência gratuita"}
          </button>

          <p className="text-center text-sm text-[#a1a1a1]">
            Já tem conta?{" "}
            <Link href="/auth/signin" className="text-[#00A19C] hover:underline">
              Fazer login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
