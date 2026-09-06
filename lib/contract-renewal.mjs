function assertValidDate(date, fieldName) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} inválida.`);
  }
}

function safeDurationMonths(value) {
  const months = Number(value);
  if (!Number.isFinite(months) || months <= 0) {
    throw new Error("Duração do contrato precisa ser maior que zero.");
  }
  return Math.trunc(months);
}

export function buildRenewalSchedule({ currentEndDate, durationMonths }) {
  assertValidDate(currentEndDate, "Data final do contrato atual");
  const months = safeDurationMonths(durationMonths);

  const startDate = new Date(
    Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate() + 1,
      12,
      0,
      0,
      0
    )
  );

  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + months);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  endDate.setUTCHours(23, 59, 59, 999);

  return {
    startDate,
    endDate,
    dueDate: new Date(startDate),
  };
}

export function isRenewablePaidContract(contract) {
  return String(contract?.type || "").toUpperCase() === "PAID" && String(contract?.status || "").toUpperCase() === "ACTIVE";
}
