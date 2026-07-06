import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import * as bcrypt from "bcryptjs";

type BodySource = FormData | Record<string, any>;

function getValue(source: BodySource, keys: string[]): any {
  if (source instanceof FormData) {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null && value !== undefined) return value;
    }

    return null;
  }

  for (const key of keys) {
    const value = source?.[key];
    if (value !== null && value !== undefined) return value;
  }

  return null;
}

function getString(source: BodySource, keys: string[]): string {
  const value = getValue(source, keys);

  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();

  return String(value).trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getOptionalImage(source: BodySource): Promise<string | null> {
  if (!(source instanceof FormData)) return null;

  const fileValue =
    source.get("image") ||
    source.get("foto") ||
    source.get("photo") ||
    source.get("avatar");

  if (!fileValue || typeof fileValue === "string") return null;

  const file = fileValue as File;

  if (!file.size || !file.type?.startsWith("image/")) return null;

  /*
   * Evita quebrar o cadastro por upload grande.
   * Na primeira versão, guardamos uma imagem pequena como data URL.
   * Depois podemos evoluir para storage próprio.
   */
  const maxBytes = 1.5 * 1024 * 1024;

  if (file.size > maxBytes) {
    return null;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    const body: BodySource = contentType.includes("multipart/form-data")
      ? await req.formData()
      : await req.json();

    const name = getString(body, ["name", "nome", "fullName", "aluno"]);
    const email = normalizeEmail(getString(body, ["email", "mail"]));
    const phone = getString(body, ["phone", "telefone", "whatsapp", "celular"]);
    const password = getString(body, ["password", "senha"]);
    const confirmPassword = getString(body, ["confirmPassword", "confirmarSenha", "passwordConfirmation"]);
    const notes = getString(body, ["notes", "observacoes", "observations"]) || null;
    const image = await getOptionalImage(body);

    if (!name) {
      return NextResponse.json(
        { error: "Informe o nome do aluno." },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Informe o e-mail do aluno." },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json(
        { error: "As senhas não conferem." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Já existe uma conta cadastrada com este e-mail." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const authUser = await tx.user.create({
        data: {
          name,
          email,
          phone: phone || null,
          image,
          password: passwordHash,
          role: "ALUNO",
          active: true,
        },
      });

      const student = await tx.student.create({
        data: {
          name,
          email,
          phone: phone || null,
          image,
          notes,
          active: true,
          onboardingCompleto: false,
          commercialStatus: "SEM_CONTRATO_ATIVO",
          contractedTrainingDaysPerMonth: null,
          userAuthId: authUser.id,
          /*
           * Cadastro público NÃO deve vincular automaticamente a professor.
           * Como student.userId é obrigatório no modelo atual, usamos o próprio
           * usuário do aluno como responsável técnico temporário.
           *
           * O vínculo real com professor e o contrato ativo serão feitos depois,
           * pelo Financeiro / Vincular Alunos.
           */
          userId: authUser.id,
        },
      });

      return {
        userId: authUser.id,
        studentId: student.id,
        studentName: student.name,
        email: authUser.email,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "Conta de aluno criada com sucesso.",
      ...result,
    });
  } catch (error: any) {
    console.error("POST /api/aluno/register error:", error);

    const message = String(error?.message || "");

    if (message.includes("commercial_status")) {
      return NextResponse.json(
        {
          error:
            "A base de dados ainda não recebeu a coluna commercial_status. Rode o SQL da Fase 1 no mesmo banco usado pela Vercel.",
          message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Erro interno do servidor.",
        message,
      },
      { status: 500 }
    );
  }
}
