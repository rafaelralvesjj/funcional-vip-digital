import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "../components/BrandLogo";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Dumbbell,
  Heart,
  Home as HomeIcon,
  MapPin,
  MessageCircle,
  Shield,
  Target,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Treinamento funcional personalizado | Funcional Vip Digital",
  description:
    "Comece seu período experimental com treinamento funcional personalizado para seu objetivo, nível, idade, rotina, local e equipamentos disponíveis.",
};

const primaryCta = "/auth/aluno-registro";

const goals = [
  {
    icon: Target,
    title: "Emagrecimento e definição",
    description:
      "Treinos funcionais para elevar o gasto energético, fortalecer o corpo e evoluir com consistência.",
  },
  {
    icon: Dumbbell,
    title: "Força e hipertrofia",
    description:
      "Progressões alinhadas ao seu nível, à sua estrutura de treino e ao objetivo de ganhar força e massa muscular.",
  },
  {
    icon: Heart,
    title: "Saúde e qualidade de vida",
    description:
      "Mais disposição, mobilidade, condicionamento e autonomia para a rotina.",
  },
  {
    icon: TrendingUp,
    title: "Corrida e performance",
    description:
      "Fortalecimento para começar a correr, melhorar o desempenho e sustentar sua evolução.",
  },
  {
    icon: Shield,
    title: "Retorno com cuidado",
    description:
      "Uma retomada progressiva, considerando histórico, desconfortos, restrições e orientação profissional.",
  },
  {
    icon: Activity,
    title: "Esporte e alta performance",
    description:
      "Preparação física para corrida, luta, arte marcial e outros esportes específicos.",
  },
];

const benefits = [
  {
    icon: UserCheck,
    title: "Treino realmente personalizado",
    description:
      "Seu objetivo, nível, idade, rotina, histórico e disponibilidade entram na construção do treino.",
  },
  {
    icon: HomeIcon,
    title: "Para o local onde você treina",
    description:
      "Academia, casa, studio ou ao ar livre, usando apenas os equipamentos que você informou.",
  },
  {
    icon: MessageCircle,
    title: "Acompanhamento próximo",
    description:
      "Use o chat para dúvidas e registre como se sentiu. Seu professor acompanha essas informações.",
  },
  {
    icon: TrendingUp,
    title: "Evolução que orienta o próximo treino",
    description:
      "Dificuldades, desconfortos e resultados ajudam a tornar as próximas semanas mais coerentes com você.",
  },
];

const steps = [
  {
    number: "01",
    title: "Conte seu objetivo",
    description:
      "Preencha um cadastro guiado com seu nível, idade, rotina, local, equipamentos e cuidados importantes.",
  },
  {
    number: "02",
    title: "Receba seu treino semanal",
    description:
      "O professor prepara uma semana de treino organizada, com exercícios e orientações visuais.",
  },
  {
    number: "03",
    title: "Treine e registre sua experiência",
    description:
      "Ao concluir, conte como foi e informe qualquer dor, incômodo ou dificuldade.",
  },
  {
    number: "04",
    title: "Evolua com acompanhamento",
    description:
      "Seus registros chegam ao professor e impactam diretamente os próximos ajustes.",
  },
];

const faqs = [
  {
    question: "Preciso já praticar atividade física?",
    answer:
      "Não. O cadastro identifica seu nível atual, inclusive se você está sedentário, começando agora ou retomando depois de uma pausa.",
  },
  {
    question: "Posso treinar em casa ou ao ar livre?",
    answer:
      "Sim. Você informa onde pretende treinar e marca os equipamentos que possui. Também existe a opção de treinar sem nenhum equipamento.",
  },
  {
    question: "O treino serve para corredores?",
    answer:
      "Sim. A plataforma contempla quem quer começar a correr, melhorar o desempenho, fortalecer para a corrida ou complementar a preparação esportiva.",
  },
  {
    question: "O que faço se sentir dor ou desconforto?",
    answer:
      "Registre no próprio treino qualquer incômodo, dor ou desconforto. Em caso de dúvida antes de continuar, use o chat da plataforma para falar com o professor.",
  },
  {
    question: "Preciso informar cartão para começar?",
    answer:
      "Não. O cadastro do período experimental não solicita cartão de crédito.",
  },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <BrandLogo variant="symbol" size="md" priority />
      <div className="leading-none">
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white sm:text-base">
          Funcional UP
        </div>
        <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.42em] text-[#ff7a00]">
          Digital
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={primaryCta}
      className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#22D3EE] px-5 py-3 text-center text-sm font-black text-[#0a0a0a] shadow-[0_18px_50px_-18px_rgba(212,163,115,0.8)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#e0b184] focus:outline-none focus:ring-2 focus:ring-[#22D3EE] focus:ring-offset-2 focus:ring-offset-[#0a0a0a] ${className}`}
    >
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070707] pb-24 text-[#f5f5f5] selection:bg-[#22D3EE] selection:text-[#0a0a0a] md:pb-0">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#070707]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Funcional Vip Digital — início">
            <BrandMark />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
            <a
              href="#objetivos"
              className="text-sm font-medium text-neutral-300 transition hover:text-[#22D3EE]"
            >
              Objetivos
            </a>
            <a
              href="#como-funciona"
              className="text-sm font-medium text-neutral-300 transition hover:text-[#22D3EE]"
            >
              Como funciona
            </a>
            <a
              href="#beneficios"
              className="text-sm font-medium text-neutral-300 transition hover:text-[#22D3EE]"
            >
              Acompanhamento
            </a>
            <a
              href="#duvidas"
              className="text-sm font-medium text-neutral-300 transition hover:text-[#22D3EE]"
            >
              Dúvidas
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/auth/signin"
              className="rounded-lg px-3 py-2 text-xs font-bold text-neutral-300 transition hover:bg-white/5 hover:text-white sm:text-sm"
            >
              Entrar
            </Link>
            <PrimaryButton label="Começar grátis" className="hidden sm:inline-flex" />
          </div>
        </div>
      </header>

      <section className="relative px-4 pb-20 pt-28 sm:px-6 sm:pb-24 sm:pt-36 lg:px-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[-420px] h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[#22D3EE]/10 blur-[120px]" />
          <div className="absolute right-[-180px] top-40 h-80 w-80 rounded-full bg-[#8f4f23]/10 blur-[100px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
        </div>

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#e6bd94] sm:text-xs">
              <Zap className="h-3.5 w-3.5" />
              Treinamento funcional com acompanhamento real
            </div>

            <h1 className="max-w-4xl text-4xl font-black leading-[1.03] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl xl:text-7xl">
              Treinamento funcional para{" "}
              <span className="text-[#22D3EE]">o seu objetivo</span>, no seu
              momento.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg sm:leading-8">
              Da saúde e qualidade de vida ao emagrecimento, hipertrofia,
              corrida, performance e retomada com cuidado. Você recebe um treino
              pensado a partir do seu nível, idade, rotina, local e equipamentos.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryButton
                label="Começar período experimental"
                className="w-full sm:w-auto sm:px-7"
              />
              <a
                href="#como-funciona"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white transition hover:border-[#22D3EE]/35 hover:bg-[#22D3EE]/5 sm:w-auto"
              >
                Entender como funciona
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-neutral-400 sm:text-sm">
              {[
                "Cadastro gratuito",
                "Sem cartão de crédito",
                "Para todos os níveis",
              ].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22D3EE]/12 text-[#22D3EE]">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-6 rounded-[40px] bg-[#22D3EE]/8 blur-3xl" />
            <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#0e0e0e] p-4 shadow-2xl sm:p-6">
              <div className="rounded-2xl border border-[#22D3EE]/25 bg-[linear-gradient(145deg,rgba(212,163,115,0.13),rgba(255,255,255,0.02))] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22D3EE]">
                      Seu treino considera
                    </p>
                    <h2 className="mt-2 text-xl font-black text-white sm:text-2xl">
                      Você por inteiro
                    </h2>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#22D3EE]/25 bg-[#22D3EE]/10 text-[#22D3EE]">
                    <UserCheck className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Objetivo principal", Target],
                    ["Nível e idade", Activity],
                    ["Local de treino", MapPin],
                    ["Equipamentos", Dumbbell],
                    ["Histórico e rotina", TrendingUp],
                    ["Dores e cuidados", Shield],
                  ].map(([label, Icon]) => {
                    const IconComponent = Icon as typeof Target;

                    return (
                      <div
                        key={label as string}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 p-3.5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-[#22D3EE]">
                          <IconComponent className="h-4 w-4" />
                        </span>
                        <span className="text-xs font-semibold text-neutral-200 sm:text-sm">
                          {label as string}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  ["1", "Cadastro"],
                  ["2", "Professor"],
                  ["3", "Treino"],
                  ["4", "Evolução"],
                ].map(([number, label], index) => (
                  <div
                    key={label}
                    className="relative rounded-xl border border-white/[0.07] bg-white/[0.025] px-2 py-3 text-center"
                  >
                    <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#22D3EE] text-[11px] font-black text-black">
                      {number}
                    </div>
                    <div className="mt-2 text-[9px] font-bold uppercase tracking-wide text-neutral-400 sm:text-[10px]">
                      {label}
                    </div>
                    {index < 3 && (
                      <span className="absolute -right-2 top-[25px] z-10 hidden h-px w-4 bg-[#22D3EE]/35 sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-white/[0.018] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-3">
          {[
            {
              title: "Não é treino genérico",
              description: "O plano parte das informações que você cadastra.",
            },
            {
              title: "Não precisa ter academia",
              description: "É possível treinar em casa, no studio ou ao ar livre.",
            },
            {
              title: "Você não fica sem orientação",
              description: "Treino, registros e chat ficam organizados na plataforma.",
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22D3EE]/10 text-[#22D3EE]">
                <Check className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-400">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="objetivos" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#22D3EE]">
              Para diferentes objetivos
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
              Um treino funcional para o seu momento de vida
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-400 sm:text-lg">
              O programa não parte de um perfil único. Ele considera o que você
              quer alcançar e o ponto em que está começando.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => {
              const Icon = goal.icon;

              return (
                <article
                  key={goal.title}
                  className="group rounded-2xl border border-white/[0.08] bg-[#0e0e0e] p-6 transition duration-200 hover:-translate-y-1 hover:border-[#22D3EE]/35 hover:bg-[#12100e]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/10 text-[#22D3EE] transition group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-black text-white">
                    {goal.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-400">
                    {goal.description}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <PrimaryButton label="Quero um treino para o meu objetivo" />
          </div>
        </div>
      </section>

      <section id="beneficios" className="scroll-mt-24 bg-[#0b0b0b] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#22D3EE]">
              Acompanhamento de verdade
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">
              Mais do que uma lista de exercícios
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-400">
              Você recebe uma experiência organizada para entender o treino,
              executar com mais segurança e manter o professor informado sobre
              sua evolução.
            </p>

            <div className="mt-7 rounded-2xl border border-[#22D3EE]/25 bg-[#22D3EE]/8 p-5">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#22D3EE]" />
                <p className="text-sm leading-6 text-neutral-300">
                  Qualquer dor, incômodo ou desconforto deve ser registrado no
                  treino ou informado pelo chat. Essa informação impacta
                  diretamente os próximos ajustes.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article
                  key={benefit.title}
                  className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 sm:p-7"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#22D3EE] text-black">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-black text-white">
                    {benefit.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-400">
                    {benefit.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#22D3EE]">
              Como funciona
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
              Do cadastro ao próximo treino
            </h2>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-4">
            {steps.map((step, index) => (
              <article
                key={step.number}
                className="relative rounded-2xl border border-white/[0.08] bg-[#0e0e0e] p-6"
              >
                <div className="text-4xl font-black text-[#22D3EE]/25">
                  {step.number}
                </div>
                <h3 className="mt-5 text-lg font-black text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-400">
                  {step.description}
                </p>
                {index < steps.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 rounded-full bg-[#070707] p-1 text-[#22D3EE] lg:block" />
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-[#22D3EE]/25 bg-[radial-gradient(circle_at_top_right,rgba(212,163,115,0.18),transparent_38%),linear-gradient(145deg,#15110e,#0c0c0c_65%)] p-6 sm:p-10 lg:p-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#e6bd94]">
                <Zap className="h-3.5 w-3.5" />
                Período experimental
              </div>
              <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
                Descubra como é treinar com um plano pensado para você
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-300">
                Faça seu cadastro gratuitamente, informe seu objetivo e conheça
                a experiência do Funcional Vip Digital sem inserir cartão de
                crédito.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold text-neutral-300">
                {[
                  "Cadastro guiado",
                  "Treino personalizado",
                  "Acompanhamento na plataforma",
                ].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/20 px-3 py-2"
                  >
                    <Check className="h-3.5 w-3.5 text-[#22D3EE]" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-w-full lg:min-w-[280px]">
              <PrimaryButton
                label="Começar meu período experimental"
                className="w-full px-7 py-4"
              />
              <p className="mt-3 text-center text-[11px] leading-5 text-neutral-500">
                Você será direcionado ao cadastro do aluno.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="duvidas" className="scroll-mt-24 bg-[#0b0b0b] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#22D3EE]">
              Dúvidas frequentes
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">
              Antes de começar
            </h2>
          </div>

          <div className="mt-10 divide-y divide-white/[0.08] rounded-2xl border border-white/[0.08] bg-[#101010] px-5 sm:px-7">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left text-sm font-black text-white sm:text-base">
                  {faq.question}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#22D3EE] transition group-open:rotate-90">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </summary>
                <p className="max-w-3xl pb-1 pt-4 text-sm leading-6 text-neutral-400">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-8 text-center">
            <PrimaryButton label="Estou pronto para começar" />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.07] bg-black px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark />
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-neutral-500">
            <Link href="/auth/signin" className="transition hover:text-[#22D3EE]">
              Entrar
            </Link>
            <a href="#objetivos" className="transition hover:text-[#22D3EE]">
              Objetivos
            </a>
            <a href="#como-funciona" className="transition hover:text-[#22D3EE]">
              Como funciona
            </a>
            <a href="#duvidas" className="transition hover:text-[#22D3EE]">
              Dúvidas
            </a>
          </div>
          <p className="text-xs text-neutral-600">
            © 2026 Funcional Vip Digital
          </p>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#090909]/95 p-3 backdrop-blur-xl md:hidden">
        <PrimaryButton
          label="Começar período experimental"
          className="w-full"
        />
      </div>
    </main>
  );
}
