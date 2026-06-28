  async function markAsComplete() {
    if (!selectedPlan || !studentId || selectedDay === null) return;
    setCompleting(true); setMessage(null);
    try {
      // Envia a data do dia selecionado no calendário, não a data de hoje
      const planDate = new Date(currentYear, currentMonth, selectedDay);
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutPlanId: selectedPlan.id,
          studentId,
          date: planDate.toISOString(),
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Treino concluido!" });
        fetchWorkouts(studentId);
        setShowWorkoutModal(false);
      }
    } catch {}
    setCompleting(false);
    setTimeout(() => setMessage(null), 3000);
  }
