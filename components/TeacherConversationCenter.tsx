"use client";

import { useState } from "react";
import DashboardConversationList from "@/components/DashboardConversationList";
import TeacherConversationComposer from "@/components/TeacherConversationComposer";

type TeacherStudentOption = {
  id: string;
  name: string;
  email?: string | null;
};

type PendingAdjustmentWorkout = {
  workoutId: string;
  workoutPlanId: string | null;
  name: string;
  date: string;
  status: string;
};

type ConversationAdjustmentRequest = {
  preferenceId: string;
  category: string;
  summary: string;
  originalMessage: string;
  pendingWorkouts: PendingAdjustmentWorkout[];
};

type ConversationReply = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
  answeredById?: string | null;
  authorId?: string | null;
};

type ConversationItem = {
  id: string;
  studentId?: string | null;
  teacherId?: string | null;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  senderRole: string;
  createdAt: string;
  resolvedAt?: string | null;
  authorName: string;
  targetLabel: string;
  children: ConversationReply[];
  answeredById?: string | null;
  authorId?: string | null;
  openedById?: string | null;
  adjustmentRequest?: ConversationAdjustmentRequest | null;
};

type Props = {
  teacherId: string;
  students: TeacherStudentOption[];
  studentConversations: ConversationItem[];
  managementConversations: ConversationItem[];
  initialConversationId?: string | null;
};

type ActiveTab = "students" | "management";

export default function TeacherConversationCenter({
  teacherId,
  students,
  studentConversations,
  managementConversations,
  initialConversationId = null,
}: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("students");

  const isStudentsTab = activeTab === "students";

  return (
    <section className="space-y-8">
      <div className="border-b border-[#ffffff10]">
        <div className="flex gap-8">
          <button
            type="button"
            onClick={() => setActiveTab("students")}
            className={`border-b-2 px-4 py-4 text-sm font-medium transition ${
              isStudentsTab
                ? "border-[#22D3EE] text-[#22D3EE]"
                : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Alunos
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("management")}
            className={`border-b-2 px-4 py-4 text-sm font-medium transition ${
              !isStudentsTab
                ? "border-[#22D3EE] text-[#22D3EE]"
                : "border-transparent text-[#a1a1a1] hover:text-[#f5f5f5]"
            }`}
          >
            Gestão
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-[#ffffff10] bg-[#111111] p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[#f5f5f5]">
            {isStudentsTab ? "Nova conversa com aluno" : "Nova conversa com a gestão"}
          </h2>

          <p className="mt-2 text-sm leading-relaxed text-[#a1a1a1]">
            {isStudentsTab
              ? "Selecione um aluno vinculado e inicie uma orientação sem precisar esperar que ele escreva primeiro."
              : "Use este canal para pedir apoio, registrar impedimentos ou tratar assuntos administrativos com a gestão."}
          </p>

          <div className="mt-5">
            <TeacherConversationComposer
              teacherId={teacherId}
              students={students}
              fixedTarget={isStudentsTab ? "STUDENT" : "MANAGEMENT"}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#f5f5f5]">
                {isStudentsTab
                  ? "Conversas com meus alunos"
                  : "Conversas com a gestão"}
              </h2>

              <p className="mt-1 text-sm text-[#a1a1a1]">
                {isStudentsTab
                  ? "Histórico de conversas iniciadas por você ou pelos seus alunos."
                  : "Histórico de conversas entre você e a equipe de gestão."}
              </p>
            </div>

            <span className="text-xs text-[#6b6b6b]">
              {isStudentsTab
                ? `${studentConversations.length} conversa(s)`
                : `${managementConversations.length} conversa(s)`}
            </span>
          </div>

          <DashboardConversationList
            conversations={
              isStudentsTab ? studentConversations : managementConversations
            }
            currentUserId={teacherId}
            currentRole="TEACHER"
            emptyMessage={
              isStudentsTab
                ? "Nenhuma conversa com aluno encontrada."
                : "Nenhuma conversa com a gestão encontrada."
            }
            allowReply={true}
            initialExpandedConversationId={
              isStudentsTab ? initialConversationId : null
            }
          />
        </div>
      </div>
    </section>
  );
}
