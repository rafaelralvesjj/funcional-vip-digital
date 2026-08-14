export type PlannedDestination = {
  platform: string;
  accountName: string;
  placement: string;
  format: string;
  width: number;
  height: number;
  scheduledAt: string;
};

export type VideoCaptureSegment = {
  order: number;
  durationSeconds: number;
  shot: string;
  whatToFilm?: string;
  howToFilm?: string;
  onScreen?: string;
  spokenLine?: string | null;
};

export type CaptureBrief = {
  required: boolean;
  kind: "PHOTO" | "VIDEO" | "NONE";
  subject: "DENIZE" | "GREG" | "PRODUCT" | "OTHER";
  title: string;
  quantity: number;
  orientation: string;
  instructions: string[];
  videoSegments?: VideoCaptureSegment[];
};

export type VideoProductionMode = "AI" | "RECORDED" | "MIXED" | "ZSKY_CAPCUT" | "RECORDED_CAPCUT";

export type VideoWorkflowData = {
  productionMode?: VideoProductionMode;
  finalAssetId?: string;
  finalFileName?: string;
  finalDurationSeconds?: number;
  finalWidth?: number;
  finalHeight?: number;
  finalOrientation?: "vertical" | "horizontal" | "square";
  validatedAt?: string;
};

export type SmartPlanData = {
  version: 1;
  stage: "PRODUCTION" | "PUBLICATION" | "RELATIONSHIP" | "ANALYSIS" | "PERSONAL" | "FARM";
  slotKey?: string;
  sourcePlanKey?: string;
  destinations?: PlannedDestination[];
  capture?: CaptureBrief;
  shop?: {
    enabled: boolean;
    productCategory: string;
    angle: string;
    productNameOptional: boolean;
  };
  workflow?: string[];
  publicationInstruction?: string;
  activity?: {
    activityId: string;
    area: "PERSONAL" | "FARM";
    frequency: "DAILY" | "WEEKLY" | "ONCE";
    period: "MORNING" | "AFTERNOON" | "EVENING";
    effort: "LIGHT" | "MEDIUM" | "HEAVY";
    durationMinutes: number;
    urgent?: boolean;
  };
  videoWorkflow?: VideoWorkflowData;
  contentStrategy?: {
    scopeKey: "CORRIDA" | "FUNCIONAL" | "SHOP" | "GREG";
    angle: string;
    promise: string;
    cta: string;
    variantKey: string;
    historyWindowDays: number;
    comparedItems: number;
    similarity: number;
  };
};

export function readSmartPlanData(value: unknown): SmartPlanData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<SmartPlanData>;
  if (candidate.version !== 1 || !candidate.stage) return null;
  return candidate as SmartPlanData;
}

export function isExternalAiVideoMode(mode?: VideoProductionMode): boolean {
  return mode === "AI" || mode === "RECORDED" || mode === "MIXED";
}

export function isManualCapCutVideoMode(mode?: VideoProductionMode): mode is "ZSKY_CAPCUT" | "RECORDED_CAPCUT" {
  return mode === "ZSKY_CAPCUT" || mode === "RECORDED_CAPCUT";
}
