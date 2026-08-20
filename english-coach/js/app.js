import { CURRICULUM, TEACHER_NAME } from "./curriculum.js";
import { loadState, saveState, recordItemResult, getDueReviewItems, markDayComplete, getStreak } from "./srs.js";
import { speak, stopSpeaking, listen, sttAvailable } from "./speech.js";

const state = loadState();

const el = (id) => document.getElementById(id);
const screens = {
  home: el("screen-home"),
  lesson: el("screen-lesson"),
  done: el("screen-done")
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

// --- Controle de pausa / pular, usado durante a aula ---
let paused = false;
let skipCurrentStep = null;
let currentReplay = null;

function setPauseUI() {
  el("btn-pause").textContent = paused ? "▶" : "⏸";
}

el("btn-pause").addEventListener("click", () => {
  paused = !paused;
  if (paused) window.speechSynthesis?.pause();
  else window.speechSynthesis?.resume();
  setPauseUI();
});

el("btn-skip").addEventListener("click", () => {
  if (skipCurrentStep) skipCurrentStep();
});

el("btn-repeat").addEventListener("click", () => {
  if (currentReplay) currentReplay();
});

el("btn-exit").addEventListener("click", () => {
  stopSpeaking();
  showScreen("home");
  renderHome();
});

async function waitWhilePaused() {
  while (paused) {
    await new Promise(r => setTimeout(r, 200));
  }
}

// Executa uma etapa (função async) permitindo que "Pular" a interrompa.
function runStep(taskFn) {
  return new Promise((resolve) => {
    let finished = false;
    skipCurrentStep = () => {
      if (finished) return;
      finished = true;
      stopSpeaking();
      resolve();
    };
    taskFn().then(() => {
      if (finished) return;
      finished = true;
      resolve();
    });
  });
}

async function say(text, opts) {
  await waitWhilePaused();
  await speak(text, opts);
  await waitWhilePaused();
}

function setCaption(pt, en) {
  el("caption-pt").textContent = pt || "";
  el("caption-en").textContent = en || "";
}

function setFeedback(text) {
  el("feedback").textContent = text || "";
}

function setMic(on) {
  el("mic-indicator").classList.toggle("hidden", !on);
}

const PHASES = ["Aquecimento", "Aula de hoje", "Prática", "Resumo"];
function setPhase(index) {
  el("phase-label").textContent = PHASES[index];
  const dots = el("progress-dots");
  dots.innerHTML = "";
  PHASES.forEach((_, i) => {
    const dot = document.createElement("span");
    if (i < index) dot.classList.add("filled");
    if (i === index) dot.classList.add("active");
    dots.appendChild(dot);
  });
}

function nextDay() {
  return CURRICULUM.find(d => d.id === state.currentDay) || null;
}

function renderHome() {
  const streak = getStreak(state);
  el("streak-badge").textContent = `🔥 ${streak}`;
  el("stt-hint").textContent = sttAvailable
    ? ""
    : "Seu navegador não reconhece fala automaticamente — a prática vira 'repita comigo', sem correção automática.";

  const day = nextDay();
  if (!day) {
    el("home-greeting").textContent = `Uau! Você terminou todos os dias disponíveis, ${TEACHER_NAME} está impressionada.`;
    el("home-day-title").textContent = "Volte em breve por mais dias 🎉";
    el("home-day-sub").textContent = "Enquanto isso, use 'Rever dias concluídos' para praticar de novo.";
    el("btn-start").classList.add("hidden");
    return;
  }
  el("btn-start").classList.remove("hidden");
  el("home-greeting").textContent = day.id === 1
    ? `Oi, eu sou a ${TEACHER_NAME}. Pronta para sua primeira aula?`
    : "Oi! Pronta para a aula de hoje?";
  el("home-day-title").textContent = `Dia ${day.id} · ${day.title}`;
  el("home-day-sub").textContent = "~20 minutos · fone no ouvido, sem precisar olhar pra tela";
}

el("btn-start").addEventListener("click", () => {
  const day = nextDay();
  if (day) startLesson(day, false);
});

el("btn-review").addEventListener("click", () => {
  const completed = CURRICULUM.filter(d => state.completedDays.includes(d.id));
  if (completed.length === 0) {
    setFeedbackHome("Você ainda não concluiu nenhum dia.");
    return;
  }
  const list = completed.map(d => `${d.id}. ${d.title}`).join("\n");
  const pick = window.prompt(`Qual dia revisar? Digite o número:\n${list}`);
  const dayId = Number(pick);
  const day = CURRICULUM.find(d => d.id === dayId);
  if (day) startLesson(day, true);
});

function setFeedbackHome(msg) {
  el("stt-hint").textContent = msg;
}

async function startLesson(day, isReview) {
  paused = false;
  setPauseUI();
  showScreen("lesson");
  await runWarmup();
  await runNewLesson(day);
  await runPractice(day);
  await runWrapup(day, isReview);
}

async function runWarmup() {
  setPhase(0);
  setMic(false);
  const dueItems = getDueReviewItems(state, CURRICULUM, 4);
  if (dueItems.length === 0) {
    setCaption("Aquecimento", "Sem revisão hoje — direto para a aula nova!");
    await runStep(() => say("No review today. Let's dive into today's lesson!", { lang: "en-US" }));
    return;
  }
  await runStep(() => say("Vamos relembrar rapidinho antes de começar.", { lang: "pt-BR" }));
  for (const item of dueItems) {
    setCaption(item.prompt_pt, "");
    setFeedback("");
    currentReplay = () => say(item.prompt_pt, { lang: "pt-BR" });
    await runStep(() => say(item.prompt_pt, { lang: "pt-BR" }));

    setMic(true);
    const result = await runStep(() => listen(item.target_en, { timeoutMs: 6000 }));
    setMic(false);

    if (result && result.supported && result.matched) {
      setFeedback("✅ Muito bem!");
      recordItemResult(state, item.id, true);
      await runStep(() => say("Great job!", { lang: "en-US" }));
    } else if (result && result.supported) {
      setFeedback(`A resposta era: "${item.target_en}"`);
      recordItemResult(state, item.id, false);
      await runStep(() => say(item.target_en, { lang: "en-US" }));
    } else {
      setCaption(item.prompt_pt, item.target_en);
      setFeedback("Repita em voz alta.");
      await runStep(() => say(item.target_en, { lang: "en-US" }));
    }
  }
}

async function runNewLesson(day) {
  setPhase(1);
  setMic(false);
  setCaption(day.title, "");
  setFeedback("");
  currentReplay = () => say(day.intro_pt, { lang: "pt-BR" });
  await runStep(() => say(day.intro_pt, { lang: "pt-BR" }));

  for (const v of day.vocab) {
    setCaption(v.pt, v.en);
    setFeedback(v.note_pt || "");
    currentReplay = () => say(v.en, { lang: "en-US" });
    await runStep(() => say(v.en, { lang: "en-US" }));
    await runStep(() => say(v.pt, { lang: "pt-BR" }));
  }

  setFeedback("Diálogo:");
  for (const line of day.dialogue) {
    setCaption(line.pt, line.en);
    currentReplay = () => say(line.en, { lang: "en-US", role: line.speaker });
    await runStep(() => say(line.en, { lang: "en-US", role: line.speaker }));
  }
}

async function runPractice(day) {
  setPhase(2);
  setFeedback("");
  await runStep(() => say("Agora é sua vez de praticar.", { lang: "pt-BR" }));

  for (const p of day.practice) {
    setCaption(p.prompt_pt, "");
    setFeedback("");
    currentReplay = () => say(p.prompt_pt, { lang: "pt-BR" });
    await runStep(() => say(p.prompt_pt, { lang: "pt-BR" }));

    setMic(true);
    const result = await runStep(() => listen(p.target_en, { timeoutMs: 6000 }));
    setMic(false);

    if (result && result.supported && result.matched) {
      setFeedback("✅ Perfeito!");
      recordItemResult(state, p.id, true);
      await runStep(() => say("Perfect!", { lang: "en-US" }));
    } else if (result && result.supported) {
      setCaption(p.prompt_pt, p.target_en);
      setFeedback(`Quase lá! A frase é: "${p.target_en}"`);
      recordItemResult(state, p.id, false);
      await runStep(() => say(p.target_en, { lang: "en-US" }));
    } else {
      setCaption(p.prompt_pt, p.target_en);
      setFeedback("Repita em voz alta.");
      await runStep(() => say(p.target_en, { lang: "en-US" }));
    }
  }
}

async function runWrapup(day, isReview) {
  setPhase(3);
  setMic(false);
  setCaption("", "");
  setFeedback("");
  await runStep(() => say(day.recap_pt, { lang: "pt-BR" }));

  if (!isReview) {
    markDayComplete(state, day.id);
  } else {
    saveState(state);
  }

  const streak = getStreak(state);
  el("done-title").textContent = isReview ? "Revisão concluída!" : "Aula concluída!";
  el("done-streak").textContent = `Sequência: ${streak} dia${streak === 1 ? "" : "s"}`;
  el("done-recap").textContent = day.recap_pt;
  showScreen("done");
}

el("btn-back-home").addEventListener("click", () => {
  showScreen("home");
  renderHome();
});

renderHome();
