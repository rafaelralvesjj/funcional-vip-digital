import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();

  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";

  return value;
}

function canManageExerciseLibrary(role?: string | null): boolean {
  const normalized = normalizeRole(role);

  return ["GESTOR", "ADMIN", "TEACHER"].includes(normalized);
}

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

function cleanNullableText(value: unknown): string | null {
  const text = cleanText(value);

  return text.length > 0 ? text : null;
}

function cleanTagText(value: unknown): string | null {
  if (Array.isArray(value)) {
    const text = value
      .map((item) => cleanText(item))
      .filter(Boolean)
      .join(", ");

    return text || null;
  }

  return cleanNullableText(value);
}

function getSearchParam(searchParams: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value && value.trim()) return value.trim();
  }

  return null;
}

function buildContainsFilter(field: string, value: string) {
  return {
    [field]: {
      contains: value,
      mode: "insensitive",
    },
  };
}

function buildExerciseLibraryWhere(searchParams: URLSearchParams) {
  const andFilters: any[] = [];

  const active = searchParams.get("active");
  const includeInactive = active === "all" || active === "false";

  if (!includeInactive) {
    andFilters.push({ active: true });
  } else if (active === "false") {
    andFilters.push({ active: false });
  }

  const search = getSearchParam(searchParams, ["search", "q", "query"]);

  if (search) {
    andFilters.push({
      OR: [
        buildContainsFilter("name", search),
        buildContainsFilter("description", search),
        buildContainsFilter("muscleGroup", search),
        buildContainsFilter("objectiveTags", search),
        buildContainsFilter("locationTags", search),
        buildContainsFilter("equipmentTags", search),
        buildContainsFilter("restrictionTags", search),
        buildContainsFilter("levelTags", search),
        buildContainsFilter("instructions", search),
        buildContainsFilter("safetyNotes", search),
        buildContainsFilter("sequenceImageLabel", search),
        buildContainsFilter("sequenceImageNotes", search),
        buildContainsFilter("sequencePrompt", search),
      ],
    });
  }

  const muscleGroup = getSearchParam(searchParams, ["muscleGroup", "grupoMuscular"]);
  if (muscleGroup) {
    andFilters.push(buildContainsFilter("muscleGroup", muscleGroup));
  }

  const objective = getSearchParam(searchParams, ["objective", "objetivo", "goal"]);
  if (objective) {
    andFilters.push(buildContainsFilter("objectiveTags", objective));
  }

  const location = getSearchParam(searchParams, ["location", "local", "trainingEnvironment", "ambiente"]);
  if (location) {
    andFilters.push(buildContainsFilter("locationTags", location));
  }

  const equipment = getSearchParam(searchParams, ["equipment", "equipamento", "availableEquipment"]);
  if (equipment) {
    andFilters.push(buildContainsFilter("equipmentTags", equipment));
  }

  const restriction = getSearchParam(searchParams, ["restriction", "restricao", "pain", "dor"]);
  if (restriction) {
    andFilters.push(buildContainsFilter("restrictionTags", restriction));
  }

  const level = getSearchParam(searchParams, ["level", "nivel", "activityLevel"]);
  if (level) {
    andFilters.push(buildContainsFilter("levelTags", level));
  }

  const intensity = getSearchParam(searchParams, ["intensity", "intensidade"]);
  if (intensity) {
    andFilters.push(buildContainsFilter("intensity", intensity));
  }

  return andFilters.length > 0 ? { AND: andFilters } : {};
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      const exercise = await prisma.exerciseLibrary.findUnique({ where: { id } });
      if (!exercise) return NextResponse.json({ error: "Exercício não encontrado." }, { status: 404 });
      return NextResponse.json({ exercise });
    }

    const where = buildExerciseLibraryWhere(searchParams);
    const takeParam = Number(searchParams.get("limit") || searchParams.get("take") || 0);
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(takeParam, 200) : undefined;
    const pickerView = searchParams.get("view") === "picker";

    const exercises = await prisma.exerciseLibrary.findMany({
      where,
      orderBy: { name: "asc" },
      ...(take ? { take } : {}),
      ...(pickerView ? { select: { id: true, name: true, muscleGroup: true } } : {}),
    });

    return NextResponse.json({
      exercises,
      count: exercises.length,
      emptyLibrary: exercises.length === 0,
    });
  } catch (error: any) {
    console.error("GET /api/exercise-library error:", error);

    return NextResponse.json(
      {
        error: "Erro ao buscar biblioteca de exercícios.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canManageExerciseLibrary(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await req.json();
    const name = cleanText(body?.name || body?.nome);
    const description = cleanText(body?.description || body?.descricao);
    const muscleGroup = cleanText(body?.muscleGroup || body?.grupoMuscular);

    if (!name) {
      return NextResponse.json({ error: "Informe o nome do exercício." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: "Informe a descrição do exercício." }, { status: 400 });
    }

    if (!muscleGroup) {
      return NextResponse.json({ error: "Informe o grupo muscular." }, { status: 400 });
    }

    const exercise = await prisma.exerciseLibrary.create({
      data: {
        name,
        description,
        muscleGroup,
        imageUrl: cleanNullableText(body?.imageUrl || body?.imagemUrl || body?.fotoUrl),
        videoUrl: cleanNullableText(body?.videoUrl || body?.video_url),
        sequenceImageUrl: cleanNullableText(body?.sequenceImageUrl || body?.sequence_image_url || body?.imagemSequencialUrl),
        sequenceImageLabel: cleanNullableText(body?.sequenceImageLabel || body?.sequence_image_label || body?.tituloSequencia),
        sequenceImageNotes: cleanNullableText(body?.sequenceImageNotes || body?.sequence_image_notes || body?.observacoesSequencia),
        sequenceFramesCount:
          body?.sequenceFramesCount !== undefined || body?.sequence_frames_count !== undefined || body?.quadrosSequencia !== undefined
            ? Math.max(Number(body?.sequenceFramesCount || body?.sequence_frames_count || body?.quadrosSequencia || 0), 0)
            : 0,
        sequenceGeneratedByAi: Boolean(body?.sequenceGeneratedByAi || body?.sequence_generated_by_ai || body?.geradoPorIa),
        sequencePrompt: cleanNullableText(body?.sequencePrompt || body?.sequence_prompt || body?.promptSequencia),
        active: body?.active === false ? false : true,
        objectiveTags: cleanTagText(body?.objectiveTags || body?.objetivos || body?.objective),
        locationTags: cleanTagText(body?.locationTags || body?.locais || body?.trainingEnvironment),
        equipmentTags: cleanTagText(body?.equipmentTags || body?.equipamentos || body?.availableEquipment),
        restrictionTags: cleanTagText(body?.restrictionTags || body?.restricoes || body?.cuidados),
        levelTags: cleanTagText(body?.levelTags || body?.niveis || body?.activityLevel),
        intensity: cleanNullableText(body?.intensity || body?.intensidade),
        instructions: cleanNullableText(body?.instructions || body?.instrucoes),
        commonMistakes: cleanNullableText(body?.commonMistakes || body?.errosComuns),
        substitutions: cleanNullableText(body?.substitutions || body?.substituicoes),
        safetyNotes: cleanNullableText(body?.safetyNotes || body?.observacoesSeguranca),
        contraindications: cleanNullableText(body?.contraindications || body?.contraindicacoes),
      },
    });

    return NextResponse.json({ ok: true, exercise }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/exercise-library error:", error);

    return NextResponse.json(
      {
        error: "Erro ao criar exercício na biblioteca.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canManageExerciseLibrary(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await req.json();
    const id = cleanText(body?.id);

    if (!id) {
      return NextResponse.json({ error: "Informe o id do exercício." }, { status: 400 });
    }

    const existing = await prisma.exerciseLibrary.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Exercício não encontrado." }, { status: 404 });
    }

    const data: any = {};

    if (body?.name !== undefined || body?.nome !== undefined) data.name = cleanText(body?.name || body?.nome);
    if (body?.description !== undefined || body?.descricao !== undefined) data.description = cleanText(body?.description || body?.descricao);
    if (body?.muscleGroup !== undefined || body?.grupoMuscular !== undefined) data.muscleGroup = cleanText(body?.muscleGroup || body?.grupoMuscular);
    if (body?.imageUrl !== undefined || body?.imagemUrl !== undefined || body?.fotoUrl !== undefined) data.imageUrl = cleanNullableText(body?.imageUrl || body?.imagemUrl || body?.fotoUrl);
    if (body?.videoUrl !== undefined || body?.video_url !== undefined) data.videoUrl = cleanNullableText(body?.videoUrl || body?.video_url);
    if (body?.sequenceImageUrl !== undefined || body?.sequence_image_url !== undefined || body?.imagemSequencialUrl !== undefined) data.sequenceImageUrl = cleanNullableText(body?.sequenceImageUrl || body?.sequence_image_url || body?.imagemSequencialUrl);
    if (body?.sequenceImageLabel !== undefined || body?.sequence_image_label !== undefined || body?.tituloSequencia !== undefined) data.sequenceImageLabel = cleanNullableText(body?.sequenceImageLabel || body?.sequence_image_label || body?.tituloSequencia);
    if (body?.sequenceImageNotes !== undefined || body?.sequence_image_notes !== undefined || body?.observacoesSequencia !== undefined) data.sequenceImageNotes = cleanNullableText(body?.sequenceImageNotes || body?.sequence_image_notes || body?.observacoesSequencia);
    if (body?.sequenceFramesCount !== undefined || body?.sequence_frames_count !== undefined || body?.quadrosSequencia !== undefined) data.sequenceFramesCount = Math.max(Number(body?.sequenceFramesCount || body?.sequence_frames_count || body?.quadrosSequencia || 0), 0);
    if (body?.sequenceGeneratedByAi !== undefined || body?.sequence_generated_by_ai !== undefined || body?.geradoPorIa !== undefined) data.sequenceGeneratedByAi = Boolean(body?.sequenceGeneratedByAi || body?.sequence_generated_by_ai || body?.geradoPorIa);
    if (body?.sequencePrompt !== undefined || body?.sequence_prompt !== undefined || body?.promptSequencia !== undefined) data.sequencePrompt = cleanNullableText(body?.sequencePrompt || body?.sequence_prompt || body?.promptSequencia);
    if (body?.active !== undefined) data.active = Boolean(body.active);
    if (body?.objectiveTags !== undefined || body?.objetivos !== undefined || body?.objective !== undefined) data.objectiveTags = cleanTagText(body?.objectiveTags || body?.objetivos || body?.objective);
    if (body?.locationTags !== undefined || body?.locais !== undefined || body?.trainingEnvironment !== undefined) data.locationTags = cleanTagText(body?.locationTags || body?.locais || body?.trainingEnvironment);
    if (body?.equipmentTags !== undefined || body?.equipamentos !== undefined || body?.availableEquipment !== undefined) data.equipmentTags = cleanTagText(body?.equipmentTags || body?.equipamentos || body?.availableEquipment);
    if (body?.restrictionTags !== undefined || body?.restricoes !== undefined || body?.cuidados !== undefined) data.restrictionTags = cleanTagText(body?.restrictionTags || body?.restricoes || body?.cuidados);
    if (body?.levelTags !== undefined || body?.niveis !== undefined || body?.activityLevel !== undefined) data.levelTags = cleanTagText(body?.levelTags || body?.niveis || body?.activityLevel);
    if (body?.intensity !== undefined || body?.intensidade !== undefined) data.intensity = cleanNullableText(body?.intensity || body?.intensidade);
    if (body?.instructions !== undefined || body?.instrucoes !== undefined) data.instructions = cleanNullableText(body?.instructions || body?.instrucoes);
    if (body?.commonMistakes !== undefined || body?.errosComuns !== undefined) data.commonMistakes = cleanNullableText(body?.commonMistakes || body?.errosComuns);
    if (body?.substitutions !== undefined || body?.substituicoes !== undefined) data.substitutions = cleanNullableText(body?.substitutions || body?.substituicoes);
    if (body?.safetyNotes !== undefined || body?.observacoesSeguranca !== undefined) data.safetyNotes = cleanNullableText(body?.safetyNotes || body?.observacoesSeguranca);
    if (body?.contraindications !== undefined || body?.contraindicacoes !== undefined) data.contraindications = cleanNullableText(body?.contraindications || body?.contraindicacoes);

    const exercise = await prisma.exerciseLibrary.update({
      where: { id },
      data,
    });

    return NextResponse.json({ ok: true, exercise });
  } catch (error: any) {
    console.error("PUT /api/exercise-library error:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar exercício da biblioteca.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    if (!sessionUser?.id || !canManageExerciseLibrary(sessionUser?.role)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Informe o id do exercício." }, { status: 400 });
    }

    const exercise = await prisma.exerciseLibrary.update({
      where: { id },
      data: {
        active: false,
      },
    });

    return NextResponse.json({ ok: true, exercise, message: "Exercício desativado." });
  } catch (error: any) {
    console.error("DELETE /api/exercise-library error:", error);

    return NextResponse.json(
      {
        error: "Erro ao desativar exercício da biblioteca.",
        message: error?.message,
      },
      { status: 500 }
    );
  }
}
