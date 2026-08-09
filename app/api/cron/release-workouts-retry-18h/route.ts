import { NextRequest } from "next/server";
import { GET as releaseWorkoutWeek } from "../release-workouts/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Recuperação automática de liberação: domingo 18h (Brasília).
// A rota principal mantém a autenticação e a trava contra aviso/e-mail duplicado.
export async function GET(request: NextRequest) {
  return releaseWorkoutWeek(request);
}
