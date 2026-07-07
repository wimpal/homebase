import { getRecipes } from "@/modules/recipes/actions";
import { RecipesClient } from "./RecipesClient";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function RecipesPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.RECIPES);
  const recipes = await getRecipes();
  return <RecipesClient recipes={recipes} />;
}
