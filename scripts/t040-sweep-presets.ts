/**
 * Sweep hue on a KAJPLATS RGB lamp and record unique colours the hub snaps to.
 * Usage: npx tsx scripts/t040-sweep-presets.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDirigeraClient } from "dirigera";
import { hueSaturationToHex } from "../src/domain/smarthome/color";

const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
for (const line of content.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  let k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const client = await createDirigeraClient({
    gatewayIP: process.env.DIRIGERA_IP!,
    accessToken: process.env.DIRIGERA_TOKEN!,
    rejectUnauthorized: false,
  });

  // paarse lamp — RGB KAJPLATS
  const id = "e47ca80f-4d4c-4317-9e94-48ce765131d9_1";

  const seen = new Map<string, { hue: number; sat: number; hex: string; from: number }>();

  // Fine sweep at sat=1
  for (let hue = 0; hue < 360; hue += 5) {
    await client.devices.setAttributes({
      id,
      attributes: { colorHue: hue, colorSaturation: 1 },
    });
    await sleep(400);
    const d = await client.devices.get({ id });
    const a = d.attributes as {
      colorHue?: number;
      colorSaturation?: number;
      colorMode?: string;
    };
    if (a.colorHue == null || a.colorSaturation == null) continue;
    const hex = hueSaturationToHex(a.colorHue, a.colorSaturation);
    const key = `${a.colorHue.toFixed(2)}:${a.colorSaturation.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.set(key, {
        hue: a.colorHue,
        sat: a.colorSaturation,
        hex,
        from: hue,
      });
      console.log(`NEW from ${hue} → hue=${a.colorHue} sat=${a.colorSaturation} ${hex}`);
    }
  }

  // Also try a few lower saturations (pastel row in app?)
  for (const sat of [0.25, 0.5, 0.75]) {
    for (let hue = 0; hue < 360; hue += 15) {
      await client.devices.setAttributes({
        id,
        attributes: { colorHue: hue, colorSaturation: sat },
      });
      await sleep(350);
      const d = await client.devices.get({ id });
      const a = d.attributes as {
        colorHue?: number;
        colorSaturation?: number;
      };
      if (a.colorHue == null || a.colorSaturation == null) continue;
      const hex = hueSaturationToHex(a.colorHue, a.colorSaturation);
      const key = `${a.colorHue.toFixed(2)}:${a.colorSaturation.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.set(key, {
          hue: a.colorHue,
          sat: a.colorSaturation,
          hex,
          from: hue,
        });
        console.log(
          `NEW sat=${sat} from ${hue} → hue=${a.colorHue} sat=${a.colorSaturation} ${hex}`,
        );
      }
    }
  }

  console.log(`\nTOTAL unique snap points: ${seen.size}`);
  console.log(JSON.stringify([...seen.values()], null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
