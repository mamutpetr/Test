import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __swaplyPrisma?: PrismaClient };

export const prisma: PrismaClient =
  g.__swaplyPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") g.__swaplyPrisma = prisma;
