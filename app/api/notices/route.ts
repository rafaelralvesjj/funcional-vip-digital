export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { searchParams } = req.nextUrl;
    const studentId = searchParams.get("studentId") || undefined;
    const authorId = searchParams.get("authorId") || undefined;
    const where: any = {};
    
    // CORREÇÃO: se tem studentId, busca avisos DAQUELE aluno OU avisos GLOBAIS (studentId = null)
    if (studentId) {
      where.OR = [
        { studentId: studentId },
        { studentId: null }
      ];
    }
    if (authorId) where.authorId = authorId;
    
    const notices = await prisma.notice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
        reads: studentId ? {
          where: { studentId },
          select: { id: true },
        } : false,
      },
    });
    let noticesWithReadStatus = notices;
    if (studentId) {
      noticesWithReadStatus = notices.map((notice: any) => ({
        ...notice,
        readByStudent: notice.reads ? notice.reads.length > 0 : false,
        reads: undefined,
      }));
    }
    return NextResponse.json(noticesWithReadStatus);
  } catch (error) {
    console.error("Erro ao listar avisos:", error);
    return NextResponse.json(
      { error: "Erro ao listar avisos" },
      { status: 500 }
    );
  }
}
