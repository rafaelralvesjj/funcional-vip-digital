import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || undefined;
  const muscleGroup = searchParams.get("muscleGroup") || undefined;

  const where: {
    AND?: Array<
      | { name: { contains: string; mode: "insensitive" } }
      | { muscleGroup: { contains: string; mode: "insensitive" } }
      | { muscleGroup: string }
    >;
  } = {};

  const filters: typeof where.AND = [];

  if (search) {
    filters.push({
      name: { contains: search, mode: "insensitive" },
    });
    filters.push({
      muscleGroup: { contains: search, mode: "insensitive" },
    });
  }

  if (muscleGroup) {
    filters.push({
      muscleGroup: muscleGroup,
    });
  }

  if (filters.length > 0) {
    where.AND = filters;
  }

  const exercises = await prisma.exerciseLibrary.findMany({
    where,
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json({ exercises });
}
