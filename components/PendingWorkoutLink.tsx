"use client";

import Link from "next/link";

interface Props {
  studentId: string;
  date: string;
  week: "current" | "next";
  children: React.ReactNode;
  className?: string;
}

export default function PendingWorkoutLink({
  studentId,
  date,
  week,
  children,
  className,
}: Props) {
  const href = `/dashboard/montar-treino?studentId=${encodeURIComponent(
    studentId
  )}&date=${encodeURIComponent(date)}&week=${week}`;

  function rememberContext() {
    try {
      window.sessionStorage.setItem(
        "pendingWorkoutContext",
        JSON.stringify({ studentId, date, week })
      );
    } catch {
      // A URL já carrega os mesmos dados; o sessionStorage é apenas fallback.
    }
  }

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={rememberContext}
      className={className}
    >
      {children}
    </Link>
  );
}
