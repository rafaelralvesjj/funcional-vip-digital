  // 🟢 Verde = aluno enviou pergunta sem resposta (professor precisa responder)
  // 🔵 Azul = professor ja respondeu (aguardando aluno)
  function getThreadStatus(q: any): "pending" | "answered" {
    const messages = [q, ...(q.children || [])];
    const last = messages[messages.length - 1];
    // Ultima mensagem NAO tem resposta → aluno aguardando professor → 🟢
    // Ultima mensagem TEM resposta → professor respondeu → 🔵
    return !last.answer ? "pending" : "answered";
  }

  async function handleAnswerFromModal(questionId: string) {
    if (!answerText.trim()) return;
    setSendingAnswer(true);
    try {
      const res = await fetch("/api/aluno/questions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: questionId, answer: answerText.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Recarrega todas as perguntas para garantir estado consistente
        const questionsRes = await fetch("/api/aluno/questions?studentId=" + studentId);
        if (questionsRes.ok) {
          const data = await questionsRes.json();
          setQuestions(Array.isArray(data) ? data : []);
        }
        setAnswerText("");
        setSelectedQuestion(null);
      }
    } catch {}
    setSendingAnswer(false);
  }
