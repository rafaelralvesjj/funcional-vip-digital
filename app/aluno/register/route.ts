import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { name, email, phone, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este e-mail já está cadastrado." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone: phone || null,
          password: hashedPassword,
          role: "ALUNO",
        },
      });

      await tx.student.create({
        data: {
          userId: user.id,
          name,
          email,
          phone: phone || null,
          userAuthId: user.id,
        },
      });

      return user;
    });

    return NextResponse.json(
      {
        message: "Conta criada com sucesso!",
        user: {
          id: result.id,
          name: result.name,
          email: result.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao cadastrar aluno:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
