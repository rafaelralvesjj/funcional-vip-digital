import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  Watch,
} from "lucide-react";
import BrandLogo from "../../components/BrandLogo";

export const metadata: Metadata = {
  title: "Política de Privacidade | Funcional UP Digital",
  description:
    "Saiba como o Funcional UP Digital trata dados pessoais, dados de treino e dados provenientes de integrações como o Garmin Connect.",
};

const updatedAt = "21 de outubro de 2026";

const sections = [
  {
    title: "1. Quem somos e a quem esta política se aplica",
    body: [
      "O Funcional UP Digital é uma plataforma digital de treinamento físico personalizado. Esta Política de Privacidade explica como tratamos dados pessoais de alunos, visitantes e usuários dos nossos recursos digitais.",
      "O tratamento de dados observa a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018) e outras normas aplicáveis. Esta política deve ser lida em conjunto com os termos e avisos apresentados no momento em que um recurso específico é utilizado.",
    ],
  },
  {
    title: "2. Dados que podemos tratar",
    body: [
      "Podemos tratar dados de cadastro e contato, informações necessárias para autenticação e atendimento, dados de contratação e pagamento, preferências de treino, registros de execução, evolução, adesão, disponibilidade, equipamentos e objetivos informados pelo usuário.",
      "Também podemos tratar informações relacionadas à saúde ou ao bem-estar quando o próprio usuário as fornece para personalização e segurança do treinamento, como histórico relevante, dor, desconforto, limitações, orientações profissionais e percepções de esforço. Quando esses dados forem considerados dados pessoais sensíveis, adotamos as salvaguardas e bases legais aplicáveis à LGPD.",
    ],
  },
  {
    title: "3. Para que usamos os dados",
    body: [
      "Usamos os dados para criar e adaptar treinos, acompanhar a execução, disponibilizar histórico, permitir comunicação entre aluno e professor, manter a conta segura, prestar suporte, administrar a contratação, cumprir obrigações legais e melhorar a experiência do serviço.",
      "Não usamos dados pessoais para finalidades incompatíveis com aquelas informadas ao usuário sem fornecer a transparência e, quando necessário, obter a autorização adequada.",
    ],
  },
  {
    title: "4. Compartilhamento e operadores",
    body: [
      "Podemos utilizar prestadores de serviço necessários ao funcionamento da plataforma, incluindo Vercel para hospedagem e execução da aplicação, Neon para infraestrutura de banco de dados PostgreSQL e prestadores de pagamento e comunicação quando esses serviços forem utilizados.",
      "Esses fornecedores recebem somente os dados necessários para executar suas funções e estão sujeitos às regras, contratos e medidas de segurança aplicáveis. Dados pessoais podem ser tratados em outros países quando a infraestrutura do fornecedor envolver processamento internacional, observadas as salvaguardas exigidas pela legislação aplicável.",
    ],
  },
];

function Header() {
  return (
    <header className="border-b border-white/[0.07] bg-[#080808]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="Voltar para o Funcional UP Digital">
          <BrandLogo variant="symbol" size="md" priority />
          <div className="leading-none">
            <div className="text-sm font-black uppercase tracking-[0.16em] text-white sm:text-base">
              Funcional UP
            </div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.42em] text-[#00A19C]">
              Digital
            </div>
          </div>
        </Link>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-neutral-300 transition hover:border-[#00A19C]/40 hover:text-[#00A19C] sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>
    </header>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#070707] text-[#f5f5f5] selection:bg-[#00A19C] selection:text-[#0a0a0a]">
      <Header />

      <section className="relative overflow-hidden px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-360px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[#00A19C]/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00A19C]/30 bg-[#00A19C]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#7FE2DE] sm:text-xs">
              <ShieldCheck className="h-4 w-4" />
              Privacidade e proteção de dados
            </div>

            <h1 className="mt-6 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
              Política de Privacidade
            </h1>
            <p className="mt-5 text-base leading-7 text-neutral-300 sm:text-lg sm:leading-8">
              Transparência sobre como o Funcional UP Digital trata seus dados pessoais, incluindo dados de treino e integrações opcionais com dispositivos e serviços de terceiros.
            </p>
            <p className="mt-4 text-sm text-neutral-500">Última atualização: {updatedAt}.</p>
          </div>

          <div className="mt-12 space-y-5">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/[0.08] bg-[#101010] p-6 sm:p-8"
              >
                <h2 className="text-xl font-black text-white sm:text-2xl">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-300 sm:text-base">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className="mt-5 overflow-hidden rounded-3xl border border-[#00A19C]/35 bg-[linear-gradient(145deg,rgba(0,161,156,0.13),rgba(255,255,255,0.025))]">
            <div className="border-b border-[#00A19C]/20 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#00A19C] text-black">
                  <Watch className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7FE2DE]">
                    Integração opcional
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    5. Garmin Connect
                  </h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-neutral-300 sm:text-base">
                Quando a integração Garmin Connect estiver disponível, ela será opcional. O usuário decidirá se deseja conectar sua conta e autorizar o Funcional UP Digital por meio do fluxo oficial de autorização OAuth. Não solicitaremos a senha da conta Garmin do usuário.
              </p>
            </div>

            <div className="grid gap-px bg-[#00A19C]/15 md:grid-cols-3">
              {[
                {
                  title: "Activity API",
                  description:
                    "Poderá ser usada para receber atividades autorizadas pelo usuário, como treinos e registros de atividade física, para acompanhamento de adesão e histórico.",
                },
                {
                  title: "Health API",
                  description:
                    "Poderá ser usada para receber métricas autorizadas de saúde e bem-estar, como frequência cardíaca, passos, sono e outros indicadores disponibilizados pela Garmin.",
                },
                {
                  title: "Training API",
                  description:
                    "Poderá ser usada para enviar treinos estruturados do Funcional UP Digital para a conta Garmin Connect e dispositivos compatíveis do usuário.",
                },
              ].map((item) => (
                <article key={item.title} className="bg-[#0d1211] p-6 sm:p-7">
                  <h3 className="font-black text-[#7FE2DE]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">{item.description}</p>
                </article>
              ))}
            </div>

            <div className="space-y-6 p-6 sm:p-8">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                  <div className="flex items-center gap-3">
                    <KeyRound className="h-5 w-5 text-[#00A19C]" />
                    <h3 className="font-black text-white">Autorização e finalidade</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">
                    O acesso ocorre somente depois da autorização explícita do usuário e será limitado às permissões necessárias para sincronizar treinos, acompanhar atividade, adesão e indicadores úteis à experiência de treinamento.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-[#00A19C]" />
                    <h3 className="font-black text-white">Uso e armazenamento</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-300">
                    Dados provenientes da Garmin poderão ser armazenados junto aos registros do usuário pelo tempo necessário para prestar o serviço, manter o histórico autorizado e atender obrigações aplicáveis. Não vendemos dados Garmin nem os utilizamos para publicidade direcionada.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5 sm:p-6">
                <h3 className="font-black text-white">Uso por inteligência artificial</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-300">
                  Na integração inicial, dados obtidos diretamente do Garmin Connect não serão enviados a plataformas externas de inteligência artificial para treinamento de modelos ou publicidade. Se esse uso mudar no futuro, esta política e os avisos de privacidade serão atualizados antes da nova finalidade, com as medidas e autorizações cabíveis.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <Trash2 className="h-5 w-5 text-[#00A19C]" />
                  <h3 className="font-black text-white">Desconexão, revogação e exclusão</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-300">
                  O usuário poderá revogar a autorização do Garmin Connect pelos controles disponibilizados pela Garmin e, quando disponível, também pelos controles do Funcional UP Digital. A revogação interrompe novos acessos à conta Garmin. O usuário também poderá solicitar a exclusão dos dados importados, ressalvados registros cuja manutenção seja necessária para cumprimento de obrigação legal, regulatória ou exercício regular de direitos.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#101010] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-[#00A19C]" />
              <div>
                <h2 className="text-xl font-black text-white sm:text-2xl">6. Segurança, retenção e seus direitos</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-300 sm:text-base">
                  <p>
                    Adotamos medidas técnicas e organizacionais compatíveis com a natureza dos dados tratados, incluindo controles de acesso, autenticação e proteção da infraestrutura. Nenhum sistema é totalmente imune a riscos, por isso revisamos continuamente nossas práticas de segurança.
                  </p>
                  <p>
                    Mantemos dados pelo período necessário às finalidades descritas nesta política, à prestação do serviço e às obrigações legais aplicáveis. Depois disso, os dados podem ser eliminados ou anonimizados quando cabível.
                  </p>
                  <p>
                    Nos termos da LGPD, o titular pode solicitar, conforme aplicável, confirmação de tratamento, acesso, correção, informações sobre compartilhamento, portabilidade quando cabível, anonimização, bloqueio ou eliminação, além de revogação do consentimento e revisão das escolhas de privacidade.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#101010] p-6 sm:p-8">
            <h2 className="text-xl font-black text-white sm:text-2xl">7. Contato e atualizações</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-300 sm:text-base">
              <p>
                Para exercer direitos de privacidade, solicitar exclusão de dados ou esclarecer dúvidas, utilize o canal oficial de atendimento disponibilizado pelo Funcional UP Digital. Um canal específico de privacidade poderá ser acrescentado a esta página conforme a estrutura de atendimento evoluir.
              </p>
              <p>
                Esta política pode ser atualizada para refletir mudanças no serviço, novas integrações, requisitos legais ou práticas de segurança. Quando a alteração for relevante, adotaremos meios razoáveis para informar os usuários.
              </p>
            </div>
          </section>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/[0.08] pt-8 sm:flex-row sm:items-center">
            <p className="text-xs text-neutral-600">© 2026 Funcional UP Digital</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold text-[#00A19C] transition hover:text-[#7FE2DE]"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao início
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
