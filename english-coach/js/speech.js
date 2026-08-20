// Wrapper de voz: TTS (SpeechSynthesis) sempre disponível em navegadores modernos.
// STT (SpeechRecognition) só existe de fato no Chrome/Android — em navegadores sem
// suporte (ex.: Safari/iOS) caímos para um modo "repita comigo" sem verificação,
// para nunca travar a aula.

const synth = window.speechSynthesis;
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

export const sttAvailable = !!SpeechRecognitionAPI;

let voicesCache = [];
function loadVoices() {
  voicesCache = synth ? synth.getVoices() : [];
}
if (synth) {
  loadVoices();
  synth.onvoiceschanged = loadVoices;
}

function pickVoice(lang, preferFemale) {
  const candidates = voicesCache.filter(v => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (candidates.length === 0) return null;
  if (preferFemale) {
    const female = candidates.find(v => /female|woman|samantha|joanna|salli|zira/i.test(v.name));
    if (female) return female;
  }
  return candidates[0];
}

// speak: fala um texto e resolve quando terminar. role define timbre (teacher/colleague/pt).
export function speak(text, { lang = "en-US", role = "teacher" } = {}) {
  return new Promise((resolve) => {
    if (!synth) { resolve(); return; }
    synth.cancel(); // evita fila acumulada se ela tocar/pausar rápido
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    const voice = pickVoice(lang.split("-")[0], role !== "colleague");
    if (voice) utter.voice = voice;
    utter.rate = lang.startsWith("pt") ? 1.0 : 0.95;
    utter.pitch = role === "colleague" ? 0.85 : 1.05;
    utter.onend = resolve;
    utter.onerror = resolve;
    synth.speak(utter);
  });
}

export function stopSpeaking() {
  if (synth) synth.cancel();
}

// listen: tenta reconhecer fala em inglês por até `timeoutMs`.
// Retorna { supported, transcript, matched } — quando não suportado, resolve
// imediatamente com supported:false após o timeout, simulando o tempo de fala
// (modo "shadow practice": ela fala, mas não é avaliada).
export function listen(targetPhrase, { timeoutMs = 6000 } = {}) {
  if (!sttAvailable) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ supported: false, transcript: "", matched: null }), timeoutMs);
    });
  }
  return new Promise((resolve) => {
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { recognition.stop(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => finish({ supported: true, transcript: "", matched: false }), timeoutMs);

    recognition.onresult = (event) => {
      const alternatives = Array.from(event.results[0]).map(r => r.transcript);
      const matched = alternatives.some(alt => fuzzyMatch(alt, targetPhrase));
      finish({ supported: true, transcript: alternatives[0] || "", matched });
    };
    recognition.onerror = () => finish({ supported: true, transcript: "", matched: false });
    recognition.onend = () => finish({ supported: true, transcript: "", matched: false });

    try {
      recognition.start();
    } catch {
      finish({ supported: true, transcript: "", matched: false });
    }
  });
}

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function fuzzyMatch(said, target) {
  const a = normalize(said);
  const b = normalize(target);
  if (!a) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = b.split(/\s+/);
  const hits = wordsB.filter(w => wordsA.has(w)).length;
  return hits / wordsB.length >= 0.6;
}
