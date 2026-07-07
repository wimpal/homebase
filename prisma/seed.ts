import { PrismaClient, ModuleId } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@homebase.local" },
    update: {},
    create: {
      name: "Demo Admin",
      email: "demo@homebase.local",
      passwordHash,
      memberships: {
        create: {
          role: "ADMIN",
          household: {
            create: { name: "Demo Household" },
          },
        },
      },
    },
    include: { memberships: { include: { household: true } } },
  });

  const householdId = user.memberships[0].householdId;

  for (const moduleId of Object.values(ModuleId)) {
    await prisma.moduleSetting.upsert({
      where: { householdId_moduleId: { householdId, moduleId } },
      create: { householdId, moduleId, enabled: true },
      update: {},
    });
  }

  await prisma.shoppingList.upsert({
    where: { id: "seed-shopping-list" },
    update: {},
    create: { id: "seed-shopping-list", householdId, name: "Main Shopping List" },
  });

  await prisma.location.createMany({
    data: [
      { householdId, name: "Pantry" },
      { householdId, name: "Fridge" },
      { householdId, name: "Freezer" },
    ],
    skipDuplicates: true,
  });

  await prisma.routineTemplate.create({
    data: {
      householdId,
      name: "Morning Routine",
      description: "Start the day right",
      tasks: {
        create: [
          { title: "Make bed", recurrence: "daily", order: 0 },
          { title: "Breakfast", recurrence: "daily", order: 1 },
          { title: "Check calendar", recurrence: "daily", order: 2 },
        ],
      },
    },
  });

  await prisma.badge.createMany({
    data: [
      { name: "First Task", description: "Complete your first routine task", icon: "star" },
      { name: "Week Streak", description: "Maintain a 7-day streak", icon: "flame" },
      { name: "Green Thumb", description: "Water 10 plants", icon: "leaf" },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete!");
  console.log("Login: demo@homebase.local / demo1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
