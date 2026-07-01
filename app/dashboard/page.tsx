"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Send,
  MessageSquare,
  Inbox,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
  Search,
  Filter,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserLite {
  id: string;
  name: string | null;
  email: string | null;
}

interface QuestionChild {
  id: string;
  content: string;
  senderRole: "GESTOR" | "TEACHER";
  createdAt: string;
  answeredBy?: UserLite | null;
  answer?: string | null;
}

interface Question {
  id: string;
  content: string;
  senderRole: "GESTOR" | "TEACHER";
  createdAt: string;
  answered?: boolean | null;
  answer?: string | null;
  answeredBy?: UserLite | null;
  answeredAt?: string | null;
  sender?: UserLite | null;
  recipient?: UserLite | null;
  children?: QuestionChild[];
}

interface Teacher {
  id: string;
  name: string | null;
  email: string | null;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("received");

  const [receivedMessages, setReceivedMessages] = useState<Question[]>([]);
  const [sentMessages, setSentMessages] = useState<Question[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [loadingReceived, setLoadingReceived] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  const [searchReceived, setSearchReceived] = useState("");
  const [searchSent, setSearchSent] = useState("");

  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});

  const [newMessageRecipient, setNewMessageRecipient] = useState("");
  const [newMessageText, setNewMessageText] = useState("");
  const [newMessageSending, setNewMessageSending] = useState(false);

  const userRole = (session?.user?.role as "GESTOR" | "TEACHER") || "TEACHER";
  const userName = session?.user?.name || "Usuário";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchReceived();
      fetchSent();
      if (userRole === "GESTOR") {
        fetchTeachers();
      }
    }
  }, [status, userRole]);

  async function fetchReceived() {
    try {
      setLoadingReceived(true);
      const res = await fetch("/api/questions?direction=received");
      if (!res.ok) throw new Error("Erro ao buscar mensagens recebidas");
      const data = await res.json();
      setReceivedMessages(Array.isArray(data) ? data : data.questions || []);
    } catch (err) {
      toast.error("Não foi possível carregar as mensagens recebidas.");
    } finally {
      setLoadingReceived(false);
    }
  }

  async function fetchSent() {
    try {
      setLoadingSent(true);
      const res = await fetch("/api/questions?direction=sent");
      if (!res.ok) throw new Error("Erro ao buscar mensagens enviadas");
      const data = await res.json();
      setSentMessages(Array.isArray(data) ? data : data.questions || []);
    } catch (err) {
      toast.error("Não foi possível carregar as mensagens enviadas.");
    } finally {
      setLoadingSent(false);
    }
  }

  async function fetchTeachers() {
    try {
      setLoadingTeachers(true);
      const res = await fetch("/api/teachers");
      if (!res.ok) throw new Error("Erro ao buscar professores");
      const data = await res.json();
      setTeachers(Array.isArray(data) ? data : data.teachers || []);
    } catch (err) {
      toast.error("Não foi possível carregar a lista de professores.");
    } finally {
      setLoadingTeachers(false);
    }
  }

  async function handleSendReply(questionId: string) {
    const content = (replyText[questionId] || "").trim();
    if (!content) {
      toast.error("Digite uma resposta antes de enviar.");
      return;
    }

    try {
      setReplySending((prev) => ({ ...prev, [questionId]: true }));
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: questionId,
          senderRole: "TEACHER",
          content,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao enviar resposta");
      }

      toast.success("Resposta enviada com sucesso!");
      setReplyText((prev) => ({ ...prev, [questionId]: "" }));
      setReplyOpenId(null);
      await fetchReceived();
      await fetchSent();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar resposta.");
    } finally {
      setReplySending((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  async function handleSendNewMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = newMessageText.trim();
    if (!newMessageRecipient) {
      toast.error("Selecione um professor destinatário.");
      return;
    }
    if (!content) {
      toast.error("Digite o conteúdo da mensagem.");
      return;
    }

    try {
      setNewMessageSending(true);
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: newMessageRecipient,
          senderRole: "GESTOR",
          content,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao enviar mensagem");
      }

      toast.success("Mensagem enviada com sucesso!");
      setNewMessageRecipient("");
      setNewMessageText("");
      await fetchSent();
      setActiveTab("sent");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem.");
    } finally {
      setNewMessageSending(false);
    }
  }

  const filteredReceived = receivedMessages.filter((msg) =>
    msg.content.toLowerCase().includes(searchReceived.toLowerCase())
  );

  const filteredSent = sentMessages.filter((msg) =>
    msg.content.toLowerCase().includes(searchSent.toLowerCase())
  );

  const hasTeacherReply = (msg: Question) => {
    const teacherReplies = msg.children?.filter((c) => c.senderRole === "TEACHER") || [];
    return teacherReplies.length > 0;
  };

  const getLastTeacherReply = (msg: Question) => {
    const teacherReplies = msg.children?.filter((c) => c.senderRole === "TEACHER") || [];
    return teacherReplies.length > 0 ? teacherReplies[teacherReplies.length - 1] : null;
  };

  function formatDate(dateString?: string | null) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getInitials(name?: string | null) {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  if (status === "loading") {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <Skeleton className="h-48 w-full mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Bem-vindo, {userName}. Gerencie suas mensagens e comunicações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { fetchReceived(); fetchSent(); }}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total recebidas</CardDescription>
              <CardTitle className="text-3xl">{receivedMessages.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Mensagens da gestão direcionadas a você
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total enviadas</CardDescription>
              <CardTitle className="text-3xl">{sentMessages.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Mensagens que você enviou para professores
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Respondidas</CardDescription>
              <CardTitle className="text-3xl">
                {sentMessages.filter((m) => hasTeacherReply(m)).length}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground">
                Mensagens enviadas com resposta do professor
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid">
            <TabsTrigger value="received" className="gap-2">
              <Inbox className="h-4 w-4" />
              Mensagens da Gestão
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Send className="h-4 w-4" />
              Mensagens Enviadas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Mensagens da Gestão</CardTitle>
                <CardDescription>
                  Mensagens recebidas da gestão escolar. Responda quando necessário.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar mensagens..."
                    value={searchReceived}
                    onChange={(e) => setSearchReceived(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {loadingReceived ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : filteredReceived.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Nenhuma mensagem recebida</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Você ainda não recebeu mensagens da gestão. Quando houver novas comunicações,
                      elas aparecerão aqui.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-4">
                      {filteredReceived.map((msg) => {
                        const teacherReplies =
                          msg.children?.filter((c) => c.senderRole === "TEACHER") || [];
                        const hasReply = teacherReplies.length > 0;
                        const isOpen = replyOpenId === msg.id;

                        return (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-lg border bg-card p-4 shadow-sm"
                          >
                            <div className="flex items-start gap-4">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {getInitials(msg.sender?.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <p className="font-medium truncate">
                                      {msg.sender?.name || "Gestão"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(msg.createdAt)}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={hasReply ? "default" : "secondary"}
                                    className="w-fit"
                                  >
                                    {hasReply ? (
                                      <>
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Respondida
                                      </>
                                    ) : (
                                      <>
                                        <Clock className="mr-1 h-3 w-3" />
                                        Aguardando
                                      </>
                                    )}
                                  </Badge>
                                </div>

                                <div className="mt-3 rounded-md bg-muted p-3">
                                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                </div>

                                {hasReply && (
                                  <div className="mt-3 rounded-md border-l-4 border-primary bg-primary/5 p-3">
                                    <p className="text-sm font-medium text-primary mb-1">
                                      Resposta enviada ✓
                                    </p>
                                    {teacherReplies.map((reply) => (
                                      <p
                                        key={reply.id}
                                        className="text-sm text-muted-foreground whitespace-pre-wrap"
                                      >
                                        {reply.content}
                                      </p>
                                    ))}
                                    <p className="text-xs text-muted-foreground mt-2">
                                      {formatDate(
                                        teacherReplies[teacherReplies.length - 1].createdAt
                                      )}
                                    </p>
                                  </div>
                                )}

                                {!hasReply && (
                                  <div className="mt-4">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setReplyOpenId((id) => (id === msg.id ? null : msg.id))
                                      }
                                    >
                                      <MessageSquare className="mr-2 h-4 w-4" />
                                      {isOpen ? "Cancelar resposta" : "Responder"}
                                      {isOpen ? (
                                        <ChevronUp className="ml-2 h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="ml-2 h-4 w-4" />
                                      )}
                                    </Button>

                                    <AnimatePresence>
                                      {isOpen && (
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: "auto" }}
                                          exit={{ opacity: 0, height: 0 }}
                                          className="overflow-hidden"
                                        >
                                          <div className="pt-3 space-y-3">
                                            <Textarea
                                              placeholder="Digite sua resposta..."
                                              value={replyText[msg.id] || ""}
                                              onChange={(e) =>
                                                setReplyText((prev) => ({
                                                  ...prev,
                                                  [msg.id]: e.target.value,
                                                }))
                                              }
                                              rows={4}
                                            />
                                            <div className="flex justify-end gap-2">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setReplyOpenId(null)}
                                              >
                                                Cancelar
                                              </Button>
                                              <Button
                                                size="sm"
                                                onClick={() => handleSendReply(msg.id)}
                                                disabled={replySending[msg.id]}
                                              >
                                                {replySending[msg.id] ? (
                                                  <>
                                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                                    Enviando...
                                                  </>
                                                ) : (
                                                  <>
                                                    <Send className="mr-2 h-4 w-4" />
                                                    Enviar resposta
                                                  </>
                                                )}
                                              </Button>
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sent" className="space-y-6">
            {userRole === "GESTOR" && (
              <Card>
                <CardHeader>
                  <CardTitle>Nova mensagem para professor</CardTitle>
                  <CardDescription>
                    Envie uma nova mensagem para um professor da instituição.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendNewMessage} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Destinatário</label>
                        <select
                          value={newMessageRecipient}
                          onChange={(e) => setNewMessageRecipient(e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <option value="">Selecione um professor</option>
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {teacher.name || teacher.email || teacher.id}
                            </option>
                          ))}
                        </select>
                        {loadingTeachers && (
                          <p className="text-xs text-muted-foreground">Carregando professores...</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Mensagem</label>
                      <Textarea
                        placeholder="Digite o conteúdo da mensagem..."
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={newMessageSending}>
                        {newMessageSending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Enviar mensagem
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Mensagens enviadas para professores</CardTitle>
                <CardDescription>
                  Acompanhe o status das mensagens que você enviou para os professores.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar mensagens enviadas..."
                    value={searchSent}
                    onChange={(e) => setSearchSent(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {loadingSent ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : filteredSent.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Send className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Nenhuma mensagem enviada</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Você ainda não enviou mensagens para professores. Use o formulário acima
                      para iniciar uma comunicação.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-4">
                      {filteredSent.map((msg) => {
                        const teacherReplies =
                          msg.children?.filter((c) => c.senderRole === "TEACHER") || [];
                        const hasReply = teacherReplies.length > 0;
                        const lastReply = teacherReplies[teacherReplies.length - 1] || null;

                        return (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-lg border bg-card p-4 shadow-sm"
                          >
                            <div className="flex items-start gap-4">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-secondary/10 text-secondary-foreground">
                                  <User className="h-5 w-5" />
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div>
                                    <p className="font-medium truncate">
                                      Para: {msg.recipient?.name || "Professor"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Enviada em {formatDate(msg.createdAt)}
                                    </p>
                                  </div>
                                  <Badge
                                    variant={hasReply ? "default" : "secondary"}
                                    className="w-fit"
                                  >
                                    {hasReply ? (
                                      <>
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Respondida
                                      </>
                                    ) : (
                                      <>
                                        <Clock className="mr-1 h-3 w-3" />
                                        Aguardando resposta
                                      </>
                                    )}
                                  </Badge>
                                </div>

                                <div className="mt-3 rounded-md bg-muted p-3">
                                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                </div>

                                {hasReply && lastReply && (
                                  <div className="mt-4 rounded-md border-l-4 border-green-500 bg-green-50 p-4 dark:bg-green-950/20">
                                    <div className="flex items-center gap-2 mb-2">
                                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                                        Resposta do professor
                                      </p>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap text-foreground">
                                      {lastReply.content}
                                    </p>
                                    <div className="mt-3 flex items-center justify-between">
                                      <p className="text-xs text-muted-foreground">
                                        Respondido por{" "}
                                        <span className="font-medium">
                                          {lastReply.answeredBy?.name || "Professor"}
                                        </span>
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatDate(lastReply.createdAt)}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {!hasReply && (
                                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                                    <AlertCircle className="h-4 w-4" />
                                    Aguardando resposta do professor.
                                  </div>
                                )}
                              </div>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => fetchSent()}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Atualizar status
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
