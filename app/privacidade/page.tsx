import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "../../components/BrandLogo";

export const metadata: Metadata = {
  title: "Política de Privacidade | Funcional UP Digital",
  description:
    "Política de Privacidade do Funcional UP Digital, incluindo tratamento de dados pessoais, LGPD e integração com Garmin Connect.",
};

const sections = [
  {
    title: "1. Quem somos e escopo desta política",
    body: [
      "O Funcional UP Digital é uma plataforma de acompanhamento de treinos e condicionamento físico. Esta Política de Privacidade explica como dados pessoais são tratados quando você utiliza o site, a área do aluno, recursos de acompanhamento e integrações opcionais, incluindo Garmin Connect.",
      "O tratamento de dados observa a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018) e os princípios de finalidade, adequação, necessidade, segurança, transparência e livre acesso.",
    ],
  },
  {
    title: "2. Dados que podemos tratar",
    body: [
      "Podemos tratar dados de cadastro e contato, informações necessárias à contratação e ao suporte, preferências de treino, registros de execução, feedbacks, dúvidas e dados fornecidos voluntariamente para personalização do acompanhamento.",
      "Quando você informar dados relacionados à saúde, limitações, desconfortos, histórico físico ou outras informações sensíveis, esses dados serão utilizados apenas quando necessários para oferecer o serviço, aumentar a segurança do acompanhamento e cumprir obrigações legais ou regulatórias aplicáveis.",
    ],
  },
  {
    title: "3. Finalidades do tratamento",
    body: [
      "Usamos os dados para criar e disponibilizar treinos, acompanhar adesão e evolução, permitir comunicação com o professor e a gestão, prestar suporte, administrar contratos e pagamentos, prevenir fraudes, melhorar a experiência da plataforma e cumprir obrigações legais.",
      "Não vendemos dados pessoais e não utilizamos dados de saúde ou dados provenientes do Garmin para publicidade comportamental.",
    ],
  },
  {
    title: "4. Bases legais e consentimento",
    body: [
      "Dependendo do dado e da finalidade, o tratamento poderá se basear na execução de contrato ou de procedimentos preliminares, no cumprimento de obrigação legal ou regulatória, no exercício regular de direitos, no legítimo interesse quando aplicável e no consentimento quando exigido pela LGPD.",
      "Integrações opcionais com serviços de terceiros, como Garmin Connect, somente serão ativadas após uma ação voluntária do usuário e a autorização exigida pelo próprio serviço conectado.",
    ],
  },
  {
    title: "5. Garmin Connect",
    body: [
      "A integração com Garmin Connect será opcional. Quando disponível, o usuário poderá conectar sua própria conta Garmin por meio de autorização OAuth, sem compartilhar a senha da conta Garmin com o Funcional UP Digital.",
      "Mediante autorização do usuário, poderemos utilizar a Activity API para receber atividades registradas, a Health API para receber métricas de saúde e bem-estar disponibilizadas pela Garmin e a Training API para enviar treinos estruturados do Funcional UP Digital para dispositivos Garmin compatíveis.",
      "Esses dados serão utilizados para apoiar o acompanhamento de treino, adesão, atividade, recuperação e personalização da experiência. O acesso será limitado às permissões autorizadas pelo usuário e às finalidades descritas nesta política.",
      "O usuário poderá revogar a autorização do Garmin Connect pelos mecanismos disponibilizados pela Garmin e, quando o recurso estiver disponível na plataforma, também poderá solicitar a desconexão pelo Funcional UP Digital. A revogação impede novos acessos, sem afetar tratamentos realizados legitimamente antes da revogação.",
    ],
  },
  {
    title: "6. Compartilhamento e fornecedores",
    body: [
      "Podemos utilizar fornecedores de infraestrutura e tecnologia estritamente necessários para operar o serviço, como hospedagem em nuvem, banco de dados, autenticação, armazenamento, comunicação e processamento de pagamentos. Atualmente, a aplicação utiliza infraestrutura da Vercel e banco de dados PostgreSQL hospedado na Neon, entre outros fornecedores necessários ao funcionamento da plataforma.",
      "Esses fornecedores recebem apenas os dados necessários para executar suas funções e devem observar obrigações de segurança e confidencialidade aplicáveis. Caso dados provenientes do Garmin venham a ser processados por novos terceiros relevantes, esta política será atualizada antes da utilização correspondente quando isso for necessário.",
    ],
  },
  {
    title: "7. Segurança e retenção",
    body: [
      "Adotamos medidas técnicas e administrativas razoáveis para proteger dados pessoais contra acesso não autorizado, perda, alteração, divulgação ou destruição indevida. Nenhum ambiente digital é totalmente isento de riscos, mas buscamos aplicar controles compatíveis com a natureza dos dados tratados.",
      "Os dados são mantidos pelo período necessário para cumprir as finalidades desta política, executar o serviço, atender obrigações legais, regulatórias e contratuais, resolver disputas e exercer direitos. Quando não houver mais fundamento para retenção, os dados poderão ser eliminados ou anonimizados, conforme aplicável.",
    ],
  },
  {
    title: "8. Direitos do titular",
    body: [
      "Nos termos da LGPD, você poderá solicitar, quando aplicável, confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio, eliminação de dados desnecessários ou tratados em desconformidade, portabilidade, informação sobre compartilhamentos, revisão de decisões automatizadas e informações sobre consentimento.",
      "Quando o tratamento depender de consentimento, você poderá revogá-lo. Pedidos de exclusão serão analisados considerando também eventuais obrigações legais de retenção e a necessidade de preservar registros para exercício regular de direitos.",
    ],
  },
  {
    title: "9. Como solicitar acesso, correção ou exclusão",
    body: [
      "Para exercer seus direitos, solicitar exclusão de dados, esclarecer dúvidas sobre privacidade ou tratar de uma conexão Garmin, utilize os canais oficiais de atendimento disponíveis dentro da plataforma. Um canal específico de privacidade poderá ser divulgado nesta página futuramente.",
      "Para proteger o titular, poderemos solicitar informações razoáveis para confirmar a identidade antes de atender determinados pedidos.",
    ],
  },
  {
    title: "10. Atualizações desta política",
    body: [
      "Esta política poderá ser atualizada para refletir mudanças legais, técnicas ou nos recursos da plataforma. Alterações relevantes serão publicadas nesta página, com indicação da data da versão vigente.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#070707] text-[#f5f5f5]">
      <header className="border-b border-white/[0.07] bg-[#070707]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Voltar ao início">
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
            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-neutral-300 transition hover:border-[#00A19C]/40 hover:text-[#00A19C] sm:text-sm"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <section className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[28px] border border-[#00A19C]/25 bg-[radial-gradient(circle_at_top_right,rgba(0,161,156,0.15),transparent_35%),linear-gradient(145deg,#101515,#0b0b0b_68%)] p-6 sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#00A19C]">
              Privacidade e proteção de dados
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] text-white sm:text-5xl">
              Política de Privacidade
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-neutral-300 sm:text-base">
              Esta página explica como o Funcional UP Digital trata dados pessoais e dados relacionados ao uso da plataforma, incluindo integrações opcionais com serviços como Garmin Connect.
            </p>
            <p className="mt-4 text-xs font-semibold text-neutral-500">
              Última atualização: 21 de outubro de 2026
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-white/[0.08] bg-[#101010] p-5 sm:p-7"
              >
                <h2 className="text-lg font-black text-white sm:text-xl">{section.title}</h2>
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7 text-neutral-400 sm:text-[15px]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-[#00A19C]/25 bg-[#00A19C]/8 p-5 sm:p-7">
            <h2 className="text-base font-black text-white">Resumo sobre Garmin</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-300">
              Conectar Garmin será opcional. O acesso ocorrerá via OAuth e somente após sua autorização. Activity API, Health API e Training API serão utilizadas apenas para recursos de acompanhamento e sincronização de treino. Você poderá revogar a conexão e solicitar exclusão dos dados nos termos desta política e da LGPD.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
