export type PersonRole = "ALUNO" | "PROFESSOR" | "TEACHER" | "GESTOR" | "ADMIN" | string | null | undefined;

function cleanName(value?: string | null): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function getFirstName(name?: string | null, fallback = ""): string {
  const cleaned = cleanName(name);
  return cleaned ? cleaned.split(" ")[0] : fallback;
}

export function getStudentDisplayName(student?: { name?: string | null; preferredName?: string | null } | null, fallback = "Aluno"): string {
  const preferred = cleanName(student?.preferredName);
  if (preferred) return preferred;
  return getFirstName(student?.name, fallback);
}

export function getProfessionalDisplayName(user?: { name?: string | null } | null, fallback = "Professor"): string {
  return getFirstName(user?.name, fallback);
}

export function getDisplayName(person?: { name?: string | null; preferredName?: string | null; role?: PersonRole } | null, fallback = "Pessoa"): string {
  const role = String(person?.role || "").toUpperCase();
  if (role === "ALUNO") return getStudentDisplayName(person, fallback);
  return getProfessionalDisplayName(person, fallback);
}
