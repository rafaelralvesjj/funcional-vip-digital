import type { Prisma } from "@prisma/client";

export type AssetSource = "LIBRARY" | "WEEKLY_CAPTURE" | "TASK_CAPTURE" | "VIDEO_RAW" | "VIDEO_FINAL" | "SYSTEM" | string;
export type VideoAssetRole = "RAW" | "FINAL";
export type VideoProductionMode = "AI" | "RECORDED" | "MIXED" | "ZSKY_CAPCUT" | "RECORDED_CAPCUT";

export type AssetMetadata = {
  sha256?: string;
  originalFileName?: string;
  taskIds: string[];
  taskTitle?: string;
  source?: AssetSource;
  purposeKey?: string;
  purposeLabel?: string;
  captureTitle?: string;
  orientation?: string;
  weekKey?: string;
  uploadBatchId?: string;
  uploadIndex?: number;
  uploadCount?: number;
  videoRole?: VideoAssetRole;
  videoProductionMode?: VideoProductionMode;
  durationSeconds?: number;
  width?: number;
  height?: number;
  videoOrientation?: "vertical" | "horizontal" | "square";
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function enumText<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : undefined;
}

export function readAssetMetadata(value: unknown): AssetMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { taskIds: [] };
  const record = value as Record<string, unknown>;
  return {
    sha256: text(record.sha256),
    originalFileName: text(record.originalFileName),
    taskIds: Array.isArray(record.taskIds)
      ? record.taskIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [],
    taskTitle: text(record.taskTitle),
    source: text(record.source),
    purposeKey: text(record.purposeKey),
    purposeLabel: text(record.purposeLabel),
    captureTitle: text(record.captureTitle),
    orientation: text(record.orientation),
    weekKey: text(record.weekKey),
    uploadBatchId: text(record.uploadBatchId),
    uploadIndex: integer(record.uploadIndex),
    uploadCount: integer(record.uploadCount),
    videoRole: enumText(record.videoRole, ["RAW", "FINAL"] as const),
    videoProductionMode: enumText(record.videoProductionMode, ["AI", "RECORDED", "MIXED", "ZSKY_CAPCUT", "RECORDED_CAPCUT"] as const),
    durationSeconds: positiveNumber(record.durationSeconds),
    width: integer(record.width),
    height: integer(record.height),
    videoOrientation: enumText(record.videoOrientation, ["vertical", "horizontal", "square"] as const),
  };
}

export function mergeAssetMetadata(current: unknown, next: Partial<AssetMetadata>): Prisma.InputJsonValue {
  const previous = readAssetMetadata(current);
  const merged: AssetMetadata = {
    sha256: next.sha256 || previous.sha256,
    originalFileName: next.originalFileName || previous.originalFileName,
    taskIds: Array.from(new Set([...(previous.taskIds || []), ...(next.taskIds || [])])),
    taskTitle: next.taskTitle || previous.taskTitle,
    source: next.source || previous.source,
    purposeKey: next.purposeKey || previous.purposeKey,
    purposeLabel: next.purposeLabel || previous.purposeLabel,
    captureTitle: next.captureTitle || previous.captureTitle,
    orientation: next.orientation || previous.orientation,
    weekKey: next.weekKey || previous.weekKey,
    uploadBatchId: next.uploadBatchId || previous.uploadBatchId,
    uploadIndex: next.uploadIndex ?? previous.uploadIndex,
    uploadCount: next.uploadCount ?? previous.uploadCount,
    videoRole: next.videoRole || previous.videoRole,
    videoProductionMode: next.videoProductionMode || previous.videoProductionMode,
    durationSeconds: next.durationSeconds ?? previous.durationSeconds,
    width: next.width ?? previous.width,
    height: next.height ?? previous.height,
    videoOrientation: next.videoOrientation || previous.videoOrientation,
  };

  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonValue;
}

export function assetMatchesTask(tags: unknown, taskId: string): boolean {
  return readAssetMetadata(tags).taskIds.includes(taskId);
}

export function displayAssetPurpose(tags: unknown): string | null {
  const metadata = readAssetMetadata(tags);
  return metadata.purposeLabel || metadata.captureTitle || null;
}
