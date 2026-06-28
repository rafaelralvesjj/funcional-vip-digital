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
    if (studentId) where.studentId = studentId;
    if (authorId) where.authorId = authorId;

    // Primeiro busca os avisos SEM o include de reads
    const notices = await prisma.notice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, role: true } },
        student: { select: { id: true, name: true } },
      },
    });

    // Depois busca as leituras separadamente
    let noticesWithReadStatus = notices;
    if (studentId) {
      try {
        const reads = await prisma.noticeRead.findMany({
          where: { studentId },
          select: { noticeId: true },
        });
        const readNoticeIds = new Set(reads.map((r: any) => r.noticeId));
        noticesWithReadStatus = notices.map((notice: any) => ({
          ...notice,
          readByStudent: readNoticeIds.has(notice.id),
        }));
      } catch {
        // Se a tabela notice_reads nao existir ou der erro, retorna sem status
        noticesWithReadStatus = notices.map((notice: any) => ({
          ...notice,
          readByStudent: false,
        }));
      }
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
