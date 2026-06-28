import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";

export async function POST(request: NextRequest) {
  try {
    // Detecta se é FormData ou JSON
    const contentType = request.headers.get("content-type") || "";

    let studentId: string | null = null;
    let content: string | null = null;
    let imageUrl: string | null = null;
    let videoUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      // É FormData (vindo do frontend do aluno)
      const form = await request.formData();
      studentId = form.get("studentId") as string | null;
      content = form.get("content") as string | null;
      const file = form.get("file") as File | null;

      // Se tiver arquivo, converte para base64
      if (file) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString("base64");
        const mimeType = file.type;

        if (mimeType.startsWith("video/")) {
          videoUrl = `data:${mimeType};base64,${base64}`;
        } else {
          imageUrl = `data:${mimeType};base64,${base64}`;
        }
      }
    } else {
      // É JSON
      const body = await request.json();
      studentId = body.studentId;
      content = body.content;
      videoUrl = body.videoUrl || null;
      imageUrl = body.imageUrl || null;
    }

    if (!studentId || !content) {
      return NextResponse.json(
        { error: "studentId e content são obrigatórios." },
        { status: 400 }
      );
    }

    const question = await prisma.question.create({
      data: {
        studentId,
        content,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null,
      },
      include: {
        answeredBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar dúvida:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const studentId = searchParams.get("studentId");

    const where: any = {};
    if (studentId) where.studentId = studentId;

    const questions = await prisma.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        answeredBy: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(questions);
  } catch (error) {
    console.error("Erro ao listar dúvidas:", error);
    return NextResponse.json(
      { error: "Erro ao listar dúvidas" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const { id, answer } = body;

    if (!id || !answer) {
      return NextResponse.json(
        { error: "ID e resposta são obrigatórios" },
        { status: 400 }
      );
    }

    const question = await prisma.question.update({
      where: { id },
      data: {
        answer,
        answeredAt: new Date(),
        answeredById: userId,
      },
      include: {
        answeredBy: { select: { id: true, name: true } },
        student: { select: { id: true, name: true, email: true } },
      },
    });

    // Tenta enviar e-mail de resposta
    try {
      if (question.student?.email) {
        await fetch(new URL("/api/send-email", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: question.student.email,
            subject: "Sua dúvida foi respondida!",
            html: `
              <h2>Sua dúvida foi respondida!</h2>
              <p><strong>Pergunta:</strong> ${question.content}</p>
              <p><strong>Resposta:</strong> ${answer}</p>
              <p>Acesse o sistema para mais detalhes.</p>
            `,
          }),
        });
      }
    } catch {}

    return NextResponse.json(question);
  } catch (error) {
    console.error("Erro ao responder dúvida:", error);
    return NextResponse.json(
      { error: "Erro ao responder dúvida" },
      { status: 500 }
    );
  }
}
