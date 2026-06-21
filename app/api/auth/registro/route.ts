import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, email, phone, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Verifica se email já existe
    const emailExiste = await prisma.user.findUnique({ where: { email } });
    if (emailExiste) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 400 }
      );
    }

    // Cria o usuário (role ALUNO)
    const hashedPassword = await hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: "ALUNO",
      },
    });

    // Cria o Student vinculado, com onboardingCompleto false
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        name,
        email,
        phone,
        onboardingCompleto: false,
        userAuthId: user.id,
      },
    });

    return NextResponse.json(
      {
        message: "Conta criada com sucesso!",
        studentId: student.id,
        userId: user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro no registro:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
