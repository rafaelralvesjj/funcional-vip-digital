import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type UserPayload = {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  document?: string;
  birthDate?: string;
  cref?: string;
  specialty?: string;
  education?: string;
  experience?: string;
  bio?: string;
  active?: boolean;
};

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function sanitizeText(value?: string | null): string | null {
  const text = String(value || "").trim();

  return text ? text : null;
}

function sanitizeEmail(value?: string | null): string | null {
  const text = String(value || "").trim().toLowerCase();

  return text ? text : null;
}

function parseBirthDate(value?: string | null): Date | null {
  const text = String(value || "").trim();

  if (!text) return null;

  const date = new Date(text + "T12:00:00");

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function normalizeUser(user: any) {
  return {
    id: user.id,
    name: user.name || user.email || "Professor",
    email: user.email,
    phone: user.phone,
    document: user.document,
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    cref: user.cref,
    specialty: user.specialty,
    education: user.education,
    experience: user.experience,
    bio: user.bio,
    active: user.active,
    role: user.role,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
  };
}

async function ensureManagerAccess() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const role = normalizeRole(user?.role);

  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  if (role !== "GESTOR" && role !== "ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    user,
  };
}

export async function GET(request: NextRequest) {
  try {
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "true";

    const where: any = {
      role: {
        in: ["PROFESSOR", "TEACHER"],
      },
    };

    if (!includeInactive) {
      where.active = true;
    }

    const teachers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        birthDate: true,
        cref: true,
        specialty: true,
        education: true,
        experience: true,
        bio: true,
        active: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        {
          active: "desc",
        },
        {
          name: "asc",
        },
      ],
    });

    const normalizedTeachers = teachers.map(normalizeUser);

    return NextResponse.json(
      {
        teachers: normalizedTeachers,
        professores: normalizedTeachers,
        items: normalizedTeachers,
        data: normalizedTeachers,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/teachers error:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar professores",
        message: error?.message,
        teachers: [],
        professores: [],
        items: [],
        data: [],
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await ensureManagerAccess();

    if (!access.ok) return access.response;

    const body = (await request.json()) as UserPayload;

    const name = sanitizeText(body.name);
    const email = sanitizeEmail(body.email);
    const password = String(body.password || "").trim();

    if (!name) {
      return NextResponse.json({ error: "Nome completo é obrigatório." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "E-mail é obrigatório." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Senha obrigatória com pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Já existe um usuário cadastrado com este e-mail." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        phone: sanitizeText(body.phone),
        document: sanitizeText(body.document),
        birthDate: parseBirthDate(body.birthDate),
        cref: sanitizeText(body.cref),
        specialty: sanitizeText(body.specialty),
        education: sanitizeText(body.education),
        experience: sanitizeText(body.experience),
        bio: sanitizeText(body.bio),
        active: body.active ?? true,
        role: "TEACHER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        birthDate: true,
        cref: true,
        specialty: true,
        education: true,
        experience: true,
        bio: true,
        active: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      teacher: normalizeUser(created),
    });
  } catch (error: any) {
    console.error("POST /api/teachers error:", error);

    return NextResponse.json(
      {
        error: "Erro ao cadastrar professor.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await ensureManagerAccess();

    if (!access.ok) return access.response;

    const body = (await request.json()) as UserPayload;
    const id = sanitizeText(body.id);

    if (!id) {
      return NextResponse.json({ error: "ID do professor é obrigatório." }, { status: 400 });
    }

    const name = sanitizeText(body.name);
    const email = sanitizeEmail(body.email);
    const password = String(body.password || "").trim();

    if (!name) {
      return NextResponse.json({ error: "Nome completo é obrigatório." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "E-mail é obrigatório." }, { status: 400 });
    }

    const existingEmail = await prisma.user.findFirst({
      where: {
        email,
        NOT: {
          id,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "Já existe outro usuário cadastrado com este e-mail." },
        { status: 409 }
      );
    }

    const data: any = {
      name,
      email,
      phone: sanitizeText(body.phone),
      document: sanitizeText(body.document),
      birthDate: parseBirthDate(body.birthDate),
      cref: sanitizeText(body.cref),
      specialty: sanitizeText(body.specialty),
      education: sanitizeText(body.education),
      experience: sanitizeText(body.experience),
      bio: sanitizeText(body.bio),
      active: body.active ?? true,
      role: "TEACHER",
    };

    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "A nova senha precisa ter pelo menos 6 caracteres." },
          { status: 400 }
        );
      }

      data.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: {
        id,
      },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        birthDate: true,
        cref: true,
        specialty: true,
        education: true,
        experience: true,
        bio: true,
        active: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      teacher: normalizeUser(updated),
    });
  } catch (error: any) {
    console.error("PUT /api/teachers error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar professor.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await ensureManagerAccess();

    if (!access.ok) return access.response;

    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID do professor é obrigatório." }, { status: 400 });
    }

    /*
     * Desativação em vez de exclusão física.
     * Isso evita apagar histórico de alunos, treinos, dúvidas e avisos vinculados ao professor.
     */
    const updated = await prisma.user.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
      },
    });

    return NextResponse.json({
      ok: true,
      teacher: updated,
      message: "Professor desativado com segurança.",
    });
  } catch (error: any) {
    console.error("DELETE /api/teachers error:", error);

    return NextResponse.json(
      {
        error: "Erro ao desativar professor.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
