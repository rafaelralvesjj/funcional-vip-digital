import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

function normalizeRole(value?: string | null): string {
  const role = String(value || "").toUpperCase();

  if (role === "PROFESSOR") return "TEACHER";
  if (role === "ALUNO") return "STUDENT";

  return role;
}

function canManageDidYouKnow(role: string): boolean {
  return role === "GESTOR" || role === "ADMIN";
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim();
}

async function requireManager() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as any;
  const role = normalizeRole(sessionUser?.role);

  if (!sessionUser?.id) {
    return {
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
      userId: null,
      role,
    };
  }

  if (!canManageDidYouKnow(role)) {
    return {
      error: NextResponse.json({ error: "Acesso restrito à gestão" }, { status: 403 }),
      userId: String(sessionUser.id),
      role,
    };
  }

  return {
    error: null,
    userId: String(sessionUser.id),
    role,
  };
}

export async function GET() {
  try {
    const auth = await requireManager();

    if (auth.error) return auth.error;

    const contents = await prisma.didYouKnowContent.findMany({
      orderBy: [
        { active: "desc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ contents });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao listar conteúdos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireManager();

    if (auth.error) return auth.error;

    const body = await request.json();
    const title = cleanText(body.title);
    const content = cleanText(body.content);
    const category = cleanText(body.category || "GERAL").toUpperCase();
    const priority = Number(body.priority || 0);

    if (!title || !content) {
      return NextResponse.json(
        { error: "Título e conteúdo são obrigatórios" },
        { status: 400 }
      );
    }

    const created = await prisma.didYouKnowContent.create({
      data: {
        title,
        content,
        category,
        priority: Number.isFinite(priority) ? priority : 0,
        active: body.active === false ? false : true,
      },
    });

    return NextResponse.json({ content: created });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao criar conteúdo" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireManager();

    if (auth.error) return auth.error;

    const body = await request.json();
    const id = cleanText(body.id);

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    const data: any = {};

    if (body.title !== undefined) data.title = cleanText(body.title);
    if (body.content !== undefined) data.content = cleanText(body.content);
    if (body.category !== undefined) data.category = cleanText(body.category).toUpperCase();
    if (body.priority !== undefined) {
      const priority = Number(body.priority);
      data.priority = Number.isFinite(priority) ? priority : 0;
    }
    if (body.active !== undefined) data.active = Boolean(body.active);

    if (data.title !== undefined && !data.title) {
      return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
    }

    if (data.content !== undefined && !data.content) {
      return NextResponse.json({ error: "Conteúdo obrigatório" }, { status: 400 });
    }

    const updated = await prisma.didYouKnowContent.update({
      where: { id },
      data,
    });

    return NextResponse.json({ content: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar conteúdo" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireManager();

    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = cleanText(searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
    }

    /*
     * Para preservar histórico de envios, não apagamos de verdade.
     * O conteúdo fica inativo e não entra mais no sorteio semanal.
     */
    const updated = await prisma.didYouKnowContent.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ content: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao inativar conteúdo" },
      { status: 500 }
    );
  }
}
