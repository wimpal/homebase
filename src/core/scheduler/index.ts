import { ModuleId } from "@prisma/client";
import cron from "node-cron";
import { prisma } from "@/core/db";
import { createNotification } from "@/core/notifications/service";
import { NotificationType } from "@prisma/client";
import { addDays, differenceInDays, isBefore, subMinutes } from "date-fns";

export function startScheduler() {
  cron.schedule("*/15 * * * *", checkLowStock);
  cron.schedule("0 8 * * *", checkExpiringProducts);
  cron.schedule("0 7 * * *", checkPlantWatering);
  cron.schedule("*/5 * * * *", checkChoreDeadlines);
  cron.schedule("*/5 * * * *", checkCalendarReminders);
  cron.schedule("*/5 * * * *", checkDeliveryAlerts);
  console.log("[scheduler] Background jobs started");
}

async function checkLowStock() {
  const households = await prisma.household.findMany();
  for (const household of households) {
    const enabled = await prisma.moduleSetting.findUnique({
      where: {
        householdId_moduleId: {
          householdId: household.id,
          moduleId: ModuleId.INVENTORY,
        },
      },
    });
    if (enabled && !enabled.enabled) continue;

    const products = await prisma.product.findMany({
      where: { householdId: household.id },
      include: { stockItems: true },
    });

    for (const product of products) {
      const totalQty = product.stockItems.reduce((s, i) => s + i.quantity, 0);
      if (totalQty <= product.lowStockAt) {
        const existing = await prisma.notification.findFirst({
          where: {
            householdId: household.id,
            title: `Low stock: ${product.name}`,
            read: false,
            createdAt: { gte: addDays(new Date(), -1) },
          },
        });
        if (existing) continue;

        await createNotification({
          householdId: household.id,
          type: NotificationType.LOW_STOCK,
          title: `Low stock: ${product.name}`,
          message: `${product.name} has ${totalQty} left (threshold: ${product.lowStockAt})`,
          link: "/inventory",
        });

        const list = await prisma.shoppingList.findFirst({
          where: { householdId: household.id },
        });
        if (list) {
          const alreadyOnList = await prisma.shoppingItem.findFirst({
            where: {
              shoppingListId: list.id,
              name: product.name,
              checked: false,
            },
          });
          if (!alreadyOnList) {
            await prisma.shoppingItem.create({
              data: {
                shoppingListId: list.id,
                productId: product.id,
                name: product.name,
                autoAdded: true,
              },
            });
          }
        }
      }
    }
  }
}

async function checkExpiringProducts() {
  const households = await prisma.household.findMany();
  const soon = addDays(new Date(), 3);

  for (const household of households) {
    const items = await prisma.stockItem.findMany({
      where: {
        householdId: household.id,
        expiryDate: { lte: soon, gte: new Date() },
      },
      include: { product: true },
    });

    for (const item of items) {
      const recipes = await prisma.recipe.findMany({
        where: {
          householdId: household.id,
          ingredients: {
            some: { productId: item.productId },
          },
        },
        take: 2,
      });

      const recipeHint =
        recipes.length > 0
          ? ` Try: ${recipes.map((r) => r.title).join(", ")}`
          : "";

      await createNotification({
        householdId: household.id,
        type: NotificationType.EXPIRY,
        title: `Expiring: ${item.product.name}`,
        message: `${item.product.name} expires on ${item.expiryDate?.toLocaleDateString()}.${recipeHint}`,
        link: "/recipes",
      });
    }
  }
}

async function checkPlantWatering() {
  const plants = await prisma.plant.findMany({
    where: {
      OR: [
        { nextWatering: { lte: new Date() } },
        { nextWatering: null },
      ],
    },
    include: { household: true },
  });

  for (const plant of plants) {
    await createNotification({
      householdId: plant.householdId,
      type: NotificationType.REMINDER,
      title: `Water ${plant.name}`,
      message: `${plant.name} needs watering today.`,
      link: "/plants",
    });
  }
}

async function checkChoreDeadlines() {
  const chores = await prisma.chore.findMany({
    where: {
      deadline: { lte: addDays(new Date(), 1), gte: new Date() },
    },
  });

  for (const chore of chores) {
    await createNotification({
      householdId: chore.householdId,
      type: NotificationType.TASK,
      title: `Chore due: ${chore.title}`,
      message: `Deadline: ${chore.deadline?.toLocaleString()}`,
      link: "/tasks",
    });
  }
}

async function checkCalendarReminders() {
  const events = await prisma.calendarEvent.findMany({
    where: { startAt: { gte: new Date() } },
  });

  const now = new Date();
  for (const event of events) {
    const reminderAt = subMinutes(event.startAt, event.reminderMinutes);
    if (isBefore(reminderAt, now) && isBefore(now, event.startAt)) {
      const existing = await prisma.notification.findFirst({
        where: {
          householdId: event.householdId,
          title: `Upcoming: ${event.title}`,
          createdAt: { gte: subMinutes(now, event.reminderMinutes) },
        },
      });
      if (existing) continue;

      const items =
        event.itemsNeeded.length > 0
          ? ` Items needed: ${event.itemsNeeded.join(", ")}`
          : "";

      await createNotification({
        householdId: event.householdId,
        type: NotificationType.REMINDER,
        title: `Upcoming: ${event.title}`,
        message: `Starts at ${event.startAt.toLocaleString()}.${items}`,
        link: "/calendar",
      });
    }
  }
}

async function checkDeliveryAlerts() {
  const deliveries = await prisma.deliveryPackage.findMany({
    where: {
      status: { in: ["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY"] },
      earliestTime: { not: null },
    },
  });

  const now = new Date();
  for (const delivery of deliveries) {
    if (!delivery.earliestTime) continue;
    const alertTime = subMinutes(delivery.earliestTime, 5);
    if (isBefore(alertTime, now) && isBefore(now, delivery.earliestTime)) {
      await createNotification({
        householdId: delivery.householdId,
        type: NotificationType.DELIVERY,
        title: "Delivery arriving soon",
        message: `${delivery.description || "Package"} expected around ${delivery.earliestTime.toLocaleTimeString()}`,
        link: "/delivery",
      });
    }
  }
}

export async function updatePlantWateringSchedule(plantId: string) {
  const plant = await prisma.plant.findUnique({ where: { id: plantId } });
  if (!plant) return;

  await prisma.plant.update({
    where: { id: plantId },
    data: {
      lastWatered: new Date(),
      nextWatering: addDays(new Date(), plant.wateringDays),
    },
  });
}

export function getAverageChoreDuration(completions: { durationMin: number | null }[]) {
  const withDuration = completions.filter((c) => c.durationMin != null);
  if (withDuration.length === 0) return null;
  const total = withDuration.reduce((s, c) => s + (c.durationMin || 0), 0);
  return Math.round(total / withDuration.length);
}
