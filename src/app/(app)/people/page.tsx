import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { getPeople } from "@/modules/people/actions";
import { ModuleId } from "@prisma/client";
import { PeopleClient } from "./PeopleClient";

export default async function PeoplePage() {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.PEOPLE);
  const people = await getPeople();
  const canMutate = role !== "GUEST";

  return <PeopleClient people={people} canMutate={canMutate} />;
}
