import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder so `prisma generate` / Docker npm ci work without a live .env.
    // Runtime always requires a real DATABASE_URL.
    url:
      process.env.DATABASE_URL ??
      "postgresql://build:build@127.0.0.1:5432/build",
  },
});
