import { defineConfig } from "drizzle-kit";

// Migrations are generated, never hand-edited. Schema is the source of truth.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "" },
  strict: true,
  verbose: true,
});
