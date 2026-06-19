import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

interface RegisterBody {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: string;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: RegisterBody = await request.json();
    const { name, email, password, phone, role } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "O nome é obrigatório" },
        { status: 400 }
      );
    }

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "O e-mail é obrigatório" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "O e-mail informado não é válido" },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: "A senha é obrigatória" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "E-mail já cadastrado" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        phone: phone || null,
        role: role || "GESTOR",
      },
    });

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        message: "Usuário cadastrado com sucesso",
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
