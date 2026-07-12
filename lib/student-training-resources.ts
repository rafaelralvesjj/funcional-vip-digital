export const TRAINING_LOCATION_OPTIONS = [
  {
    value: "ACADEMIA",
    label: "Academia",
    description: "Musculação, cardio e aparelhos do local.",
  },
  {
    value: "CASA",
    label: "Casa",
    description: "Treino adaptado ao espaço e aos materiais que você possui.",
  },
  {
    value: "AR_LIVRE",
    label: "Ao ar livre",
    description: "Parque, praça, pista, quadra ou outro espaço externo.",
  },
] as const;

export type TrainingLocationValue =
  (typeof TRAINING_LOCATION_OPTIONS)[number]["value"];

export const GYM_TYPE_OPTIONS = [
  {
    value: "COMPLETA",
    label: "Academia completa",
  },
  {
    value: "BASICA_CONDOMINIO",
    label: "Academia básica ou de condomínio",
  },
  {
    value: "STUDIO_FUNCIONAL",
    label: "Studio de treinamento funcional",
  },
  {
    value: "NAO_SEI",
    label: "Não sei informar a estrutura",
  },
] as const;

export type GymTypeValue = (typeof GYM_TYPE_OPTIONS)[number]["value"];

export const TRAINING_EQUIPMENT_OPTIONS = [
  { value: "NONE", label: "Nenhum equipamento" },
  { value: "MAT", label: "Colchonete ou tapete" },
  { value: "DUMBBELLS", label: "Halteres" },
  { value: "KETTLEBELL", label: "Kettlebell" },
  { value: "LONG_BAND", label: "Elástico longo" },
  { value: "MINI_BAND", label: "Mini bands" },
  { value: "JUMP_ROPE", label: "Corda de pular" },
  { value: "ANKLE_WEIGHTS", label: "Caneleiras" },
  { value: "BENCH_CHAIR_STEP", label: "Banco, cadeira ou step" },
  { value: "BOX", label: "Caixa ou caixote" },
  { value: "SWISS_BALL", label: "Bola suíça" },
  { value: "MEDICINE_BALL", label: "Medicine ball" },
  { value: "SUSPENSION", label: "TRX ou fita de suspensão" },
  { value: "PULL_UP_BAR", label: "Barra fixa" },
  { value: "STATIONARY_BIKE", label: "Bicicleta ergométrica" },
  { value: "TREADMILL", label: "Esteira" },
  { value: "OUTDOOR_BENCH", label: "Banco de praça" },
  { value: "STAIRS", label: "Escadas" },
  { value: "TRACK_COURT", label: "Pista ou quadra" },
  { value: "PUBLIC_GYM", label: "Aparelhos públicos de parque" },
  { value: "OTHER", label: "Outro equipamento ou recurso" },
] as const;

export type TrainingEquipmentValue =
  (typeof TRAINING_EQUIPMENT_OPTIONS)[number]["value"];

type TrainingResourceInput = {
  trainingLocations?: unknown;
  gymType?: unknown;
  selectedEquipment?: unknown;
  equipmentOther?: unknown;
  gymUnavailableEquipment?: unknown;
  legacyTrainingEnvironment?: unknown;
  legacyAvailableEquipment?: unknown;
};

type TrainingResourceSummary = {
  trainingLocations: TrainingLocationValue[];
  gymType: GymTypeValue | "";
  selectedEquipment: TrainingEquipmentValue[];
  trainingEnvironment: string;
  availableEquipment: string;
  errors: string[];
};

const locationLabelByValue = new Map(
  TRAINING_LOCATION_OPTIONS.map((option) => [option.value, option.label])
);

const gymLabelByValue = new Map(
  GYM_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

const equipmentLabelByValue = new Map(
  TRAINING_EQUIPMENT_OPTIONS.map((option) => [option.value, option.label])
);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseUnknownList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value !== "string") return [];

  const text = value.trim();
  if (!text) return [];

  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
      }
    } catch {
      // Continua para os separadores simples.
    }
  }

  return text
    .split(/[|,;]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueAllowed<T extends string>(
  values: string[],
  allowed: readonly T[]
): T[] {
  const allowedSet = new Set<string>(allowed);
  return Array.from(new Set(values.filter((value) => allowedSet.has(value)))) as T[];
}

function getGymBaseDescription(gymType: GymTypeValue | ""): string {
  switch (gymType) {
    case "COMPLETA":
      return "Academia completa (base considerada): halteres, barras, anilhas, bancos, polias, máquinas guiadas, leg press, cadeira extensora, cadeira flexora, puxada, remada, esteira, bicicleta ergométrica, elíptico e acessórios funcionais comuns";
    case "BASICA_CONDOMINIO":
      return "Academia básica ou de condomínio (base considerada): halteres, banco, estação de musculação ou polias, esteira e bicicleta ergométrica, conforme disponibilidade do local";
    case "STUDIO_FUNCIONAL":
      return "Studio de treinamento funcional (base considerada): halteres, kettlebells, elásticos, mini bands, colchonetes, steps ou caixas, cordas, medicine balls e fita de suspensão, conforme disponibilidade do local";
    case "NAO_SEI":
      return "Academia com estrutura não confirmada: o professor deve confirmar os equipamentos antes de prescrever exercícios dependentes de aparelhos";
    default:
      return "";
  }
}

export function buildTrainingResourceSummary(
  input: TrainingResourceInput
): TrainingResourceSummary {
  const allowedLocations = TRAINING_LOCATION_OPTIONS.map((option) => option.value);
  const allowedGymTypes = GYM_TYPE_OPTIONS.map((option) => option.value);
  const allowedEquipment = TRAINING_EQUIPMENT_OPTIONS.map((option) => option.value);

  const trainingLocations = uniqueAllowed(
    parseUnknownList(input.trainingLocations),
    allowedLocations
  );
  const rawGymType = cleanText(input.gymType);
  const gymType = allowedGymTypes.includes(rawGymType as GymTypeValue)
    ? (rawGymType as GymTypeValue)
    : "";
  let selectedEquipment = uniqueAllowed(
    parseUnknownList(input.selectedEquipment),
    allowedEquipment
  );

  const equipmentOther = cleanText(input.equipmentOther);
  const gymUnavailableEquipment = cleanText(input.gymUnavailableEquipment);
  const legacyTrainingEnvironment = cleanText(input.legacyTrainingEnvironment);
  const legacyAvailableEquipment = cleanText(input.legacyAvailableEquipment);

  if (trainingLocations.length === 0 && legacyTrainingEnvironment) {
    return {
      trainingLocations: [],
      gymType: "",
      selectedEquipment: [],
      trainingEnvironment: legacyTrainingEnvironment,
      availableEquipment:
        legacyAvailableEquipment || "Equipamentos não detalhados pelo aluno",
      errors: legacyAvailableEquipment
        ? []
        : ["Informe os equipamentos ou recursos disponíveis."],
    };
  }

  const errors: string[] = [];
  const hasGym = trainingLocations.includes("ACADEMIA");
  const needsPersonalEquipment =
    trainingLocations.includes("CASA") || trainingLocations.includes("AR_LIVRE");

  if (trainingLocations.length === 0) {
    errors.push("Selecione pelo menos um local onde pretende treinar.");
  }

  if (hasGym && !gymType) {
    errors.push("Informe qual é o tipo de academia ou estrutura disponível.");
  }

  if (selectedEquipment.includes("NONE") && selectedEquipment.length > 1) {
    selectedEquipment = selectedEquipment.filter((value) => value !== "NONE");
  }

  if (needsPersonalEquipment && selectedEquipment.length === 0) {
    errors.push(
      "Selecione os equipamentos disponíveis para treinar em casa ou ao ar livre, inclusive a opção 'Nenhum equipamento'."
    );
  }

  if (selectedEquipment.includes("OTHER") && !equipmentOther) {
    errors.push("Descreva o outro equipamento ou recurso selecionado.");
  }

  const environmentParts = trainingLocations.map((location) => {
    if (location === "ACADEMIA") {
      const gymLabel = gymType ? gymLabelByValue.get(gymType) : "tipo não informado";
      return `Academia — ${gymLabel}`;
    }

    return locationLabelByValue.get(location) || location;
  });

  const equipmentParts: string[] = [];

  if (hasGym && gymType) {
    const gymBase = getGymBaseDescription(gymType);
    if (gymBase) equipmentParts.push(gymBase);

    if (gymUnavailableEquipment) {
      equipmentParts.push(
        `Equipamentos ausentes, limitações ou observações da academia: ${gymUnavailableEquipment}`
      );
    }
  }

  if (needsPersonalEquipment) {
    if (selectedEquipment.includes("NONE")) {
      equipmentParts.push(
        "Casa/ao ar livre: nenhum equipamento disponível; priorizar exercícios com peso corporal e recursos seguros do ambiente"
      );
    } else {
      const labels = selectedEquipment.reduce<string[]>((items, value) => {
        if (value === "OTHER") return items;

        const label = equipmentLabelByValue.get(value);
        if (label) items.push(label);

        return items;
      }, []);

      if (equipmentOther) labels.push(equipmentOther);

      equipmentParts.push(
        labels.length > 0
          ? `Casa/ao ar livre: ${labels.join(", ")}`
          : "Casa/ao ar livre: recursos ainda não detalhados"
      );
    }
  }

  return {
    trainingLocations,
    gymType,
    selectedEquipment,
    trainingEnvironment: environmentParts.join("; "),
    availableEquipment: equipmentParts.join(" | "),
    errors,
  };
}
