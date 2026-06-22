"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { signOut } from "next-auth/react";

export default function AlunoDashboardPage() {
  const params = useParams();
  const studentId = params.id as string;

  const [plans, setPlans] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [notices, setNotices] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [message, setMessage] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [studentName, setStudentName] = useState("Aluno");

  useEffect(() => {
    if (studentId) {
      fetchPlans();
      fetchWorkouts();
      fetchNotices();
      fetchStudent();
    }
  }, [studentId, currentMonth, currentYear]);

  async function fetchStudent() {
    try {
      const res = await fetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        const students = Array.isArray(data) ? data : data.students || data || [];
        const found = students.find((s) => s.id === studentId);
        if (found) setStudentName(found.name);
      }
    } catch {}
  }

  async function fetchPlans() {
    try {
      const res = await fetch("/api/workout-plan?studentId=" + studentId);
      if (res.ok) {
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedPlan(data[0]);
        }
      }
    } catch {}
  }

  async function fetchWorkouts() {
    try {
      const url = "/api/workout/mark-complete?studentId=" + studentId + "&month=" + (currentMonth + 1) + "&year=" + currentYear;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWorkouts(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function fetchNotices() {
    try {
      const res = await fetch("/api/notices/student/" + studentId);
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function markAsComplete(planId) {
    setCompleting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutPlanId: planId, studentId: studentId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.alreadyDone) {
          setMessage({ type: "info", text: "Voce ja concluiu este treino hoje!" });
        } else {
          setMessage({ type: "success", text: "Treino concluido!" });
          fetchWorkouts();
        }
      }
    } catch {}
    setCompleting(false);
    setTimeout(() => setMessage(null), 4000);
  }

  function getDaysInMonth(month, year) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(month, year) {
    return new Date(year, month, 1).getDay();
  }

  function isToday(day) {
    var today = new Date();
    return day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
  }

  var daysInMonth = getDaysInMonth(currentMonth, currentYear);
  var firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  var diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  var meses = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  function isPlanCompletedOnDate(planId, day) {
    var dateStr = currentYear + "-" + String(currentMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    return workouts.some(function(w) {
      return w.workoutPlanId === planId && w.date.startsWith(dateStr) && w.status === "CONCLUIDO";
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a" }}>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "#111", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#D4A373", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a0a0a", fontWeight: "bold" }}>F</div>
          <span style={{ color: "#D4A373", fontWeight: "bold" }}>Funcional Vip Digital</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ color: "#a1a1a1", fontSize: "14px" }}>{studentName}</span>
          <button onClick={() => signOut({ callbackUrl: "/" })} style={{ fontSize: "12px", color: "#525252", background: "none", border: "none", cursor: "pointer" }}>Sair</button>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ color: "#f5f5f5", fontSize: "24px", fontWeight: "bold" }}>Ola, {studentName}!</h1>
        <p style={{ color: "#a1a1a1", fontSize: "14px", marginTop: "4px" }}>Bem-vindo a sua area do aluno</p>

        {message && (
          <div style={{ padding: "12px", borderRadius: "8px", marginTop: "16px", fontSize: "14px", background: message.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(59,130,246,0.1)", border: "1px solid " + (message.type === "success" ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)"), color: message.type === "success" ? "#22c55e" : "#3b82f6" }}>
            {message.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px", marginTop: "24px" }}>
          {/* Calendario */}
          <div style={{ background: "#111", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ color: "#f5f5f5", fontSize: "18px", fontWeight: "600" }}>Meus Treinos</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); } else { setCurrentMonth(currentMonth - 1); } }}
                  style={{ color: "#a1a1a1", background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>&larr;</button>
                <span style={{ color: "#f5f5f5", fontSize: "14px" }}>{meses[currentMonth]} {currentYear}</span>
                <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); } else { setCurrentMonth(currentMonth + 1); } }}
                  style={{ color: "#a1a1a1", background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>&rarr;</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
              {diasSemana.map(function(dia) {
                return <div key={dia} style={{ textAlign: "center", fontSize: "12px", color: "#525252", padding: "8px 0" }}>{dia}</div>;
              })}
              {Array.from({ length: firstDay }).map(function(_, i) {
                return <div key={"e" + i} style={{ aspectRatio: "1" }} />;
              })}
              {Array.from({ length: daysInMonth }).map(function(_, i) {
                var day = i + 1;
                var hoje = isToday(day);
                var sel = selectedDay === day;
                var completed = plans.some(function(p) { return isPlanCompletedOnDate(p.id, day); });
                var bg = "transparent";
                var border = "transparent";
                var color = "#a1a1a1";
                if (sel) { bg = "rgba(212,163,115,0.2)"; border = "#D4A373"; color = "#D4A373"; }
                else if (hoje) { border = "rgba(212,163,115,0.5)"; color = "#D4A373"; }
                
                return (
                  <button key={day} onClick={() => setSelectedDay(day)}
                    style={{ aspectRatio: "1", borderRadius: "8px", border: "1px solid " + border, background: bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: color, fontSize: "14px", fontWeight: hoje ? "bold" : "normal", transition: "all 0.2s", position: "relative" }}>
                    <span>{day}</span>
                    {completed && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", marginTop: "2px" }} />}
                    {hoje && !completed && plans.length > 0 && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#D4A373", marginTop: "2px" }} />}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "16px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: "12px", color: "#525252" }}>
              <span><span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", marginRight: "4px" }} /> Completo</span>
              <span><span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#D4A373", marginRight: "4px" }} /> Hoje</span>
            </div>
          </div>

          {/* Detalhe do treino */}
          {plans.length > 0 && selectedPlan ? (
            <div style={{ background: "#111", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ color: "#f5f5f5", fontSize: "18px", fontWeight: "600" }}>{selectedPlan.name}</h3>
                  {selectedPlan.description && <p style={{ color: "#a1a1a1", fontSize: "14px", marginTop: "4px" }}>{selectedPlan.description}</p>}
                </div>
                {selectedDay !== null && isToday(selectedDay) && (
                  <button onClick={() => markAsComplete(selectedPlan.id)} disabled={completing}
                    style={{ background: "#D4A373", color: "#0a0a0a", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "600", fontSize: "14px", cursor: "pointer" }}>
                    {completing ? "Salvando..." : "Concluir treino"}
                  </button>
                )}
              </div>
              {selectedPlan.exercises && selectedPlan.exercises.sort(function(a, b) { return a.order - b.order; }).map(function(ex, idx) {
                return (
                  <div key={ex.id || idx} style={{ background: "#1a1a1a", borderRadius: "8px", padding: "12px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "rgba(212,163,115,0.2)", color: "#D4A373", fontSize: "12px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
                      <span style={{ color: "#f5f5f5", fontWeight: "500", fontSize: "14px" }}>{ex.name}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", fontSize: "13px", color: "#a1a1a1" }}>
                      <span>{ex.series}x{ex.reps}</span>
                      {ex.weight && <span>| {ex.weight}</span>}
                      {ex.restTime && <span>| Descanso: {ex.restTime}</span>}
                    </div>
                    {ex.notes && <p style={{ color: "#6b6b6b", fontSize: "12px", marginTop: "4px" }}>{ex.notes}</p>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ background: "#111", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", padding: "40px", textAlign: "center" }}>
              <p style={{ color: "#a1a1a1", fontSize: "14px" }}>Seu professor ainda nao montou seus treinos personalizados.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
