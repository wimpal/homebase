import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { getMealPlanWeek } from "@/modules/meal-plan/actions";
import { ModuleId } from "@prisma/client";
import { MealPlanClient } from "./MealPlanClient";

export default async function MealPlanPage() {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.MEAL_PLAN);
  const data = await getMealPlanWeek();
  const canMutate = role !== "GUEST";

  return <MealPlanClient data={data} canMutate={canMutate} />;
}
