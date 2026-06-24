"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
export default function AlunoPage() {
  const [studentId, setStudentId] = useState<string>("");
  const [studentName, setStudentName] = useState("Aluno");
  const [plans, setPlans] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState("");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [sendingQuestion, setSendingQuestion] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

  // Função para converter caminho relativo em URL absoluta
  const getImageUrl = (url?: string): string | null => {
    if (!url) return null;
    if (url.startsWith("/")) {
      if (typeof window !== "undefined") {
        return window.location.origin + url;
      }
      return url;
    }
    return url;
  };

  useEffect(() => { fetchStudentInfo(); }, []);
  useEffect(() => {
    if (studentId) {
      fetchPlans(studentId); fetchWorkouts(studentId);
      fetchNotices(studentId); fetchQuestions(studentId);
    }
  }, [studentId, currentMonth, currentYear]);
  async function fetchStudentInfo() {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const session = await res.json();
        const userName = session?.user?.name || session?.name || "";
        const r2 = await fetch("/api/student/me");
        if (r2.ok) {
          const data = await r2.json();
          setStudentId(data.id);
          setStudentName(data.name);
        } else if (userName) {
          setStudentName(userName);
        }
      }
    } catch {}
    setLoading(false);
  }
  async function fetchPlans(id: string) {
    try {
      const res = await fetch("/api/workout-plan?studentId=" + id);
      if (res.ok) {
        const data = await res.json();
        setPlans(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function fetchWorkouts(id: string) {
    try {
      const url = "/api/workout/mark-complete?studentId=" + id + "&month=" + (currentMonth + 1) + "&year=" + currentYear;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWorkouts(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function fetchNotices(id: string) {
    try {
      const res = await fetch("/api/notices/student/" + id);
      if (res.ok) {
        const data = await res.json();
        setNotices(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function fetchQuestions(id: string) {
    try {
      const res = await fetch("/api/aluno/questions?studentId=" + id);
      if (res.ok) {
        const data = await res.json();
        setQuestions(Array.isArray(data) ? data : []);
      }
    } catch {}
  }
  async function markAsComplete() {
    if (!selectedPlan || !studentId) return;
    setCompleting(true); setMessage(null);
    try {
      const res = await fetch("/api/workout/mark-complete", {
        method: "POST",
        headers: { "Content-Type": 
