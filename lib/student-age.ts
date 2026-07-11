export const MAX_STUDENT_AGE_YEARS = 120;

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseBirthDateInput(value: unknown): Date | null {
  const text = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const [yearText, monthText, dayText] = text.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!isValidDateParts(year, month, day)) return null;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function normalizeBirthDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const inputDate = parseBirthDateInput(value);
  if (inputDate) return inputDate;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calculateAgeYears(
  birthDateValue: Date | string | null | undefined,
  referenceDateValue: Date = new Date()
): number | null {
  const birthDate = normalizeBirthDate(birthDateValue);

  if (!birthDate || Number.isNaN(referenceDateValue.getTime())) return null;

  const referenceYear = referenceDateValue.getFullYear();
  const referenceMonth = referenceDateValue.getMonth();
  const referenceDay = referenceDateValue.getDate();

  const birthYear = birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();

  let age = referenceYear - birthYear;

  if (
    referenceMonth < birthMonth ||
    (referenceMonth === birthMonth && referenceDay < birthDay)
  ) {
    age -= 1;
  }

  return age;
}

export function formatBirthDateInput(
  value: Date | string | null | undefined
): string | null {
  const date = normalizeBirthDate(value);

  if (!date) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatBirthDatePtBr(
  value: Date | string | null | undefined
): string {
  const dateInput = formatBirthDateInput(value);

  if (!dateInput) return "Não informada";

  const [year, month, day] = dateInput.split("-");
  return `${day}/${month}/${year}`;
}

export function getTodayDateInput(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function validateBirthDateInput(
  value: unknown,
  options: { required?: boolean; referenceDate?: Date } = {}
): {
  birthDate: Date | null;
  ageYears: number | null;
  isMinor: boolean;
  error: string | null;
} {
  const required = options.required !== false;
  const referenceDate = options.referenceDate || new Date();
  const text = String(value ?? "").trim();

  if (!text) {
    return {
      birthDate: null,
      ageYears: null,
      isMinor: false,
      error: required ? "Informe a data de nascimento do aluno." : null,
    };
  }

  const birthDate = parseBirthDateInput(text);

  if (!birthDate) {
    return {
      birthDate: null,
      ageYears: null,
      isMinor: false,
      error: "Informe uma data de nascimento válida.",
    };
  }

  const todayAtEnd = new Date(referenceDate);
  todayAtEnd.setHours(23, 59, 59, 999);

  if (birthDate.getTime() > todayAtEnd.getTime()) {
    return {
      birthDate: null,
      ageYears: null,
      isMinor: false,
      error: "A data de nascimento não pode estar no futuro.",
    };
  }

  const ageYears = calculateAgeYears(birthDate, referenceDate);

  if (ageYears === null || ageYears < 0) {
    return {
      birthDate: null,
      ageYears: null,
      isMinor: false,
      error: "Não foi possível calcular a idade do aluno.",
    };
  }

  if (ageYears > MAX_STUDENT_AGE_YEARS) {
    return {
      birthDate: null,
      ageYears: null,
      isMinor: false,
      error: "Confira a data de nascimento informada.",
    };
  }

  return {
    birthDate,
    ageYears,
    isMinor: ageYears < 18,
    error: null,
  };
}
