import React from "react";

export default function Home() {
  const features = [
    {
      icon: "📊",
      title: "Dashboard completo",
      description: "Métricas em tempo real de alunos, treinos e check-ins.",
    },
    {
      icon: "📋",
      title: "Gestão de alunos",
      description: "Perfis completos com histórico, evolução e observações.",
    },
    {
      icon: "🏋️",
      title: "Biblioteca de exercícios",
      description: "Catálogo com séries, repetições e descanso.",
    },
    {
      icon: "📅",
      title: "Planejamento semanal",
      description: "Organize turmas, horários e professores.",
    },
    {
      icon: "✅",
      title: "Check-in integrado",
      description: "Feedback diário dos alunos sobre cada treino.",
    },
    {
      icon: "📈",
      title: "Relatórios e feedback",
      description: "Acompanhamento de resultados e evolução semanal.",
    },
  ];

  const plans = [
    {
      name: "Turma",
      price: "Grátis",
      period: "",
      description: "Ideal para começar com turmas pequenas.",
      features: [
        "Até 10 alunos",
        "Dashboard básico",
        "Biblioteca de exercícios",
        "Suporte por e-mail",
      ],
      highlighted: false,
      popular: false,
    },
    {
      name: "Semi-personal",
      price: "R$ 97",
      period: "/mês",
      description: "Para quem quer mais controle e automação.",
      features: [
        "Até 50 alunos",
        "Gestão de alunos completa",
        "Planejamento semanal",
        "Check-in integrado",
        "Relatórios semanais",
        "Suporte prioritário",
      ],
      highlighted: true,
      popular: true,
    },
    {
      name: "Personal Trainer",
      price: "R$ 197",
      period: "/mês",
      description: "A solução completa para profissionais de alto desempenho.",
      features: [
        "Alunos ilimitados",
        "Todos os recursos",
        "Relatórios avançados",
        "Integração com WhatsApp",
        "Múltiplos professores",
        "Suporte VIP",
      ],
      highlighted: false,
      popular: false,
    },
  ];

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="text-[#D4A373] font-bold text-xl tracking-tight">
            Funcional Vip Digital
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#recursos"
              className="text-sm text-gray-300 hover:text-[#D4A373] transition-colors"
            >
              Recursos
            </a>
            <a
              href="#planos"
              className="text-sm text-gray-300 hover:text-[#D4A373] transition-colors"
            >
              Preços
            </a>
            <a
              href="/auth/signin"
              className="text-sm text-gray-300 hover:text-[#D4A373] transition-colors"
            >
              Login
            </a>
            <a
              href="/auth/register"
              className="text-sm bg-[#D4A373] text-[#0a0a0a] font-semibold px-4 py-2 rounded-lg hover:bg-[#b88a5e] transition-colors"
            >
              Começar agora
            </a>
          </nav>
          <button className="md:hidden text-gray-300 hover:text-[#D4A373]">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight text-white mb-6">
            Gestão inteligente.{" "}
            <span className="text-[#D4A373]">Resultados reais.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto mb-10">
            Plataforma completa para gestão de treinos, evolução de alunos e
            comunicação integrada.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <a
              href="#"
              className="w-full sm:w-auto bg-[#D4A373] text-[#0a0a0a] font-semibold px-8 py-4 rounded-xl text-lg hover:bg-[#b88a5e] transition-colors"
            >
              Começar agora
            </a>
            <a
              href="#"
              className="w-full sm:w-auto bg-white/5 border border-white/10 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:bg-white/10 transition-colors"
            >
              Ver demonstração
            </a>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex -space-x-3">
              <div className="w-10 h-10 rounded-full bg-[#D4A373] flex items-center justify-center text-[#0a0a0a] font-bold text-sm border-2 border-[#0a0a0a]">
                MS
              </div>
              <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center text-white font-bold text-sm border-2 border-[#0a0a0a]">
                JP
              </div>
              <div className="w-10 h-10 rounded-full bg-stone-600 flex items-center justify-center text-white font-bold text-sm border-2 border-[#0a0a0a]">
                AL
              </div>
            </div>
            <p className="text-gray-400 text-sm">
              Mais de <span className="text-white font-semibold">500 alunos</span>{" "}
              já utilizam
            </p>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Ferramentas pensadas para simplificar o dia a dia de academias,
              estudios e personal trainers.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-[#111111] border border-white/10 rounded-2xl p-6 hover:border-[#D4A373]/30 transition-colors"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimento */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0f0f0f]">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-[#111111] border border-white/10 rounded-3xl p-8 sm:p-12 text-center">
            <div className="text-[#D4A373] text-6xl font-serif leading-none mb-6">
              “
            </div>
            <p className="text-xl sm:text-2xl text-gray-300 italic leading-relaxed mb-8">
              Antes da Funcional Vip Digital, eu perdia horas organizando planilhas
              e respondendo mensagens no WhatsApp. Hoje consigo acompanhar a
              evolução de cada aluno, montar treinos semanais e manter a
              comunicação em um só lugar. O resultado? Mais produtividade, menos
              estresse e alunos muito mais engajados.
            </p>
            <div className="text-[#D4A373] text-6xl font-serif leading-none rotate-180 mb-6">
              “
            </div>
            <p className="text-white font-semibold text-lg">
              — Maria Souza, proprietária do StudioCorpo
            </p>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Planos para cada momento do seu negócio
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Escolha o plano que faz sentido para você e comece a transformar
              sua gestão hoje.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "bg-[#111111] border-2 border-[#D4A373]"
                    : "bg-[#111111] border border-white/10"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#D4A373] text-[#0a0a0a] text-sm font-semibold px-4 py-1 rounded-full">
                    Popular
                  </div>
                )}
                <h3 className="text-2xl font-bold text-white mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-400 mb-6">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-grow">
                  {plan.features.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="flex items-start gap-3 text-gray-300"
                    >
                      <span className="text-[#D4A373] mt-1">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#"
                  className={`block text-center font-semibold py-3 rounded-xl transition-colors ${
                    plan.highlighted
                      ? "bg-[#D4A373] text-[#0a0a0a] hover:bg-[#b88a5e]"
                      : "bg-white/5 text-white border border-white/10 hover:bg-white/10"
                  }`}
                >
                  Começar agora
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto bg-[#D4A373] rounded-3xl p-8 sm:p-16 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#0a0a0a] mb-4">
            Pronto para transformar sua gestão?
          </h2>
          <p className="text-[#0a0a0a]/80 text-lg sm:text-xl max-w-2xl mx-auto mb-8">
            Junte-se a centenas de profissionais de fitness que já economizam
            tempo e entregam mais resultados.
          </p>
          <a
            href="#"
            className="inline-block bg-[#0a0a0a] text-white font-semibold px-8 py-4 rounded-xl text-lg hover:bg-[#1a1a1a] transition-colors"
          >
            Começar agora grátis
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="text-[#D4A373] font-bold text-xl mb-4">
                Funcional Vip Digital
              </div>
              <p className="text-gray-400 leading-relaxed">
                Plataforma premium de gestão fitness para profissionais que
                querem crescer com organização e inteligência.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Produto</h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#recursos"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    Recursos
                  </a>
                </li>
                <li>
                  <a
                    href="#planos"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    Preços
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    FAQ
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Suporte</h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    Central de ajuda
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    Contato
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-gray-400 hover:text-[#D4A373] transition-colors"
                  >
                    Status
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Redes</h4>
              <div className="flex gap-4">
                <a
                  href="#"
                  className="text-gray-400 hover:text-[#D4A373] transition-colors"
                >
                  Instagram
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-[#D4A373] transition-colors"
                >
                  WhatsApp
                </a>
                <a
                  href="#"
                  className="text-gray-400 hover:text-[#D4A373] transition-colors"
                >
                  YouTube
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8">
            <p className="text-gray-500 text-center text-sm">
              © 2026 Funcional Vip Digital. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
