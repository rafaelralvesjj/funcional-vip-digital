import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const exercises = await prisma.exerciseLibrary.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(exercises);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { name, description, muscleGroup, imageUrl } = await req.json();

  if (!name || !description || !muscleGroup) {
    return NextResponse.json(
      { error: "name, description e muscleGroup são obrigatórios" },
      { status: 400 }
    );
  }

  const exercise = await prisma.exerciseLibrary.create({
    data: { name, description, muscleGroup, imageUrl },
  });

  return NextResponse.json(exercise, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await req.json();
  await prisma.exerciseLibrary.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
