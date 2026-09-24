"use server";

import { requireAdmin } from "@/core/auth/session";
import {
  applyImport,
  getImportTarget,
  IMPORT_MAX_BYTES,
  listImportTargets,
  parseCsvHeaders,
  previewImport,
  type ColumnMap,
  type ImportSummary,
} from "@/domain/import";
import { isDomainError } from "@/domain/error";
import {
  failResult,
  fromDomainError,
  okResult,
  type ActionResult,
} from "@/lib/action-result";
import { revalidatePath } from "next/cache";

function parseColumnMap(formData: FormData): Partial<ColumnMap> | null {
  if (
    !formData.has("columnName") &&
    !formData.has("columnCategory") &&
    !formData.has("columnDescription")
  ) {
    return null;
  }

  const name = formData.get("columnName");
  const category = formData.get("columnCategory");
  const description = formData.get("columnDescription");

  return {
    name: typeof name === "string" && name.trim() ? name.trim() : null,
    category:
      typeof category === "string" && category.trim()
        ? category.trim()
        : null,
    description:
      typeof description === "string" && description.trim()
        ? description.trim()
        : null,
  };
}

async function readCsvFromForm(
  formData: FormData,
): Promise<string | ActionResult<never>> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return failResult("CSV file is required.", "import_file_required");
  }
  if (file.size === 0) {
    return failResult("CSV file is empty.", "import_csv_empty");
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return failResult(
      `CSV exceeds ${IMPORT_MAX_BYTES} bytes.`,
      "import_file_too_large",
    );
  }
  return await file.text();
}

export async function listImportTargetsAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      enabled: boolean;
      disabledReason?: string;
    }>
  >
> {
  await requireAdmin();
  return okResult(
    listImportTargets().map((t) => ({
      id: t.id,
      enabled: t.enabled,
      disabledReason: t.disabledReason,
    })),
  );
}

export async function parseImportHeadersAction(
  formData: FormData,
): Promise<ActionResult<{ headers: string[] }>> {
  await requireAdmin();
  const csvText = await readCsvFromForm(formData);
  if (typeof csvText !== "string") return csvText;

  const parsed = parseCsvHeaders(csvText);
  if (isDomainError(parsed)) return fromDomainError(parsed);
  return okResult(parsed);
}

export async function previewImportAction(
  formData: FormData,
): Promise<ActionResult<ImportSummary>> {
  const { householdId } = await requireAdmin();
  const csvText = await readCsvFromForm(formData);
  if (typeof csvText !== "string") return csvText;

  const target = String(formData.get("target") ?? "");
  const def = getImportTarget(target);
  if (!def) {
    return failResult("Unknown import target.", "import_unknown_target");
  }
  if (!def.enabled) {
    return failResult(
      def.disabledReason ?? "Target disabled.",
      "import_target_disabled",
    );
  }

  const result = await previewImport({
    householdId,
    target,
    csvText,
    columnMap: parseColumnMap(formData),
    markNeeded: false,
  });
  if (isDomainError(result)) return fromDomainError(result);
  return okResult(result);
}

export async function applyImportAction(
  formData: FormData,
): Promise<ActionResult<ImportSummary>> {
  const { householdId } = await requireAdmin();
  const csvText = await readCsvFromForm(formData);
  if (typeof csvText !== "string") return csvText;

  const target = String(formData.get("target") ?? "");
  const def = getImportTarget(target);
  if (!def) {
    return failResult("Unknown import target.", "import_unknown_target");
  }
  if (!def.enabled) {
    return failResult(
      def.disabledReason ?? "Target disabled.",
      "import_target_disabled",
    );
  }

  const markNeeded = formData.get("markNeeded") === "true";

  const result = await applyImport({
    householdId,
    target,
    csvText,
    columnMap: parseColumnMap(formData),
    markNeeded,
  });
  if (isDomainError(result)) return fromDomainError(result);

  revalidatePath("/settings");
  revalidatePath("/shopping");
  revalidatePath("/inventory");
  return okResult(result);
}
