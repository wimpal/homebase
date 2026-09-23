/**
 * T-076 helper: set Bilresa controlMode to shortcut so remotePressEvent fires.
 * Usage: npx tsx scripts/dirigera-set-shortcut.ts [deviceId...]
 * Default: Homebase dual-button pair (…_1 and …_2).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDirigeraClient } from "dirigera";

function loadDotEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function main() {
  loadDotEnv();
  if (!process.env.DIRIGERA_IP || !process.env.DIRIGERA_TOKEN) {
    console.error("FAIL: DIRIGERA_IP and DIRIGERA_TOKEN required");
    process.exit(1);
  }

  const defaultIds = [
    "f1833c72-58c7-46f1-978b-a56ad1fe26ae_1",
    "f1833c72-58c7-46f1-978b-a56ad1fe26ae_2",
  ];
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : defaultIds;

  const client = await createDirigeraClient({
    gatewayIP: process.env.DIRIGERA_IP,
    accessToken: process.env.DIRIGERA_TOKEN,
    rejectUnauthorized: false,
  });

  for (const id of ids) {
    try {
      await client.controllers.setControlMode({
        id,
        controlMode: "shortcut",
      });
      console.log(`OK: shortcut → ${id}`);
    } catch (err) {
      console.error(
        `FAIL: ${id} —`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const listed = await client.controllers.list();
  for (const c of listed.filter((x) => ids.some((id) => x.id === id || x.id.startsWith(id.split("_")[0]!)))) {
    const mode =
      (c.attributes as { controlMode?: string } | undefined)?.controlMode ??
      "?";
    console.log(
      `  ${c.attributes?.customName ?? c.id} | controlMode=${mode} | ${c.id}`,
    );
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
