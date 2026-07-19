import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import JSZip from "jszip";
import path from "node:path";
import { promises as fs } from "node:fs";
import { authOptions } from "@/app/api/auth/[...nextauth]/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normalizeRole(role?: string | null): string {
  const value = String(role || "").toUpperCase();
  if (value === "PROFESSOR") return "TEACHER";
  if (value === "ALUNO") return "STUDENT";
  return value;
}

function canExport(role?: string | null): boolean {
  return ["GESTOR", "ADMIN"].includes(normalizeRole(role));
}

function slugify(value: string): string {
  return String(value || "exercicio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "exercicio";
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function getExtensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, "http://local").pathname;
    const ext = path.extname(pathname).toLowerCase();
