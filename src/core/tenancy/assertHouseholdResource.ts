import { prisma } from "@/core/db";

function notFound(resource: string): never {
  throw new Error(`${resource} not found`);
}

export async function assertProduct(householdId: string, id: string) {
  const resource = await prisma.product.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Product");
}

export async function assertLocation(householdId: string, id: string) {
  const resource = await prisma.location.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Location");
}

export async function assertShoppingList(householdId: string, id: string) {
  const resource = await prisma.shoppingList.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Shopping list");
}

export async function assertStore(householdId: string, id: string) {
  const resource = await prisma.store.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Store");
}

export async function assertChore(householdId: string, id: string) {
  const resource = await prisma.chore.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Chore");
}

export async function assertProject(householdId: string, id: string) {
  const resource = await prisma.project.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Project");
}

export async function assertPlant(householdId: string, id: string) {
  const resource = await prisma.plant.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Plant");
}

export async function assertPet(householdId: string, id: string) {
  const resource = await prisma.pet.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Pet");
}

export async function assertRoutine(householdId: string, id: string) {
  const resource = await prisma.routine.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Routine");
}

export async function assertRoutineTemplate(householdId: string, id: string) {
  const resource = await prisma.routineTemplate.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Routine template");
}

export async function assertRoutineTask(householdId: string, id: string) {
  const resource = await prisma.routineTask.findFirst({
    where: { id, routine: { householdId } },
  });
  return resource ?? notFound("Routine task");
}

export async function assertRecipe(householdId: string, id: string) {
  const resource = await prisma.recipe.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Recipe");
}

export async function assertBudget(householdId: string, id: string) {
  const resource = await prisma.budget.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Budget");
}

export async function assertDelivery(householdId: string, id: string) {
  const resource = await prisma.deliveryPackage.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Delivery");
}

export async function assertRequest(householdId: string, id: string) {
  const resource = await prisma.request.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Request");
}

export async function assertDevice(householdId: string, id: string) {
  const resource = await prisma.device.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Device");
}

export async function assertNotification(householdId: string, id: string) {
  const resource = await prisma.notification.findFirst({ where: { id, householdId } });
  return resource ?? notFound("Notification");
}
