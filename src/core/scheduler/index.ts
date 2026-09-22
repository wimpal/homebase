import { ModuleId, NotificationType } from "@prisma/client";
import cron from "node-cron";
import { prisma } from "@/core/db";
import { notify, purgeOldNotifications } from "@/core/notifications/service";
import {
  adjustSunsetLinkedAutomations,
  evaluateLightAutomations,
} from "@/domain/automations";
import { markProductNeeded } from "@/domain/shopping";
import { addDays, isBefore, subMinutes } from "date-fns";

/** Local YYYY-MM-DD for once-per-day dedupe keys (worker container TZ). */
function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startScheduler() {
  cron.schedule("*/15 * * * *", () => {
    void checkLowStock();
  });
  cron.schedule("0 8 * * *", () => {
    void checkExpiringProducts();
  });
  cron.schedule("0 7 * * *", () => {
    void checkPlantWatering();
  });
  cron.schedule("*/5 * * * *", () => {
    void checkChoreDeadlines();
  });
  cron.schedule("*/5 * * * *", () => {
    void checkCalendarReminders();
  });
  cron.schedule("*/5 * * * *", () => {
    void checkDeliveryAlerts();
  });
  cron.schedule("15 3 * * *", () => {
    void runNotificationRetention();
  });
  // T-087: rewrite sunset-linked Automation clocks before evening fire.
  cron.schedule("0 4 * * *", () => {
    void runSunsetAdjust();
  });
  cron.schedule("* * * * *", () => {
    void checkLightAutomations();
  });
  console.log("[scheduler] Background jobs started");
  // Catch-up after missed 04:00 / worker restart (idempotent per local day).
  void runSunsetAdjust();
}

async function runSunsetAdjust() {
  try {
    const summary = await adjustSunsetLinkedAutomations();
    if (
      summary.considered > 0 ||
      summary.rewritten > 0 ||
      summary.failed > 0
    ) {
      console.log(
        `[scheduler] sunset-adjust: considered=${summary.considered} rewritten=${summary.rewritten} skipped=${summary.skipped} failed=${summary.failed}`,
      );
    }
  } catch (err) {
    console.error(
      "[scheduler] sunset-adjust failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function runNotificationRetention() {
  try {
    const result = await purgeOldNotifications();
    if (result.readPurged > 0 || result.stalePurged > 0) {
      console.log(
        `[scheduler] notification retention: read=${result.readPurged} stale=${result.stalePurged}`,
      );
    }
  } catch (err) {
    console.error(
      "[scheduler] notification retention failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function checkLightAutomations() {
  try {
    const summary = await evaluateLightAutomations();
    if (summary.matched > 0 || summary.claimed > 0) {
      console.log(
        `[scheduler] automations: matched=${summary.matched} claimed=${summary.claimed} applied=${summary.applied} failed=${summary.failed}`,
      );
    }
  } catch (err) {
    console.error(
      "[scheduler] automations failed:",
      err instanceof Error ? err.message : err,
    );
  }
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
        await notify({
          householdId: household.id,
          type: NotificationType.LOW_STOCK,
          title: `Low stock: ${product.name}`,
          message: `${product.name} has ${totalQty} left (threshold: ${product.lowStockAt})`,
          link: "/inventory",
          dedupeKey: `low-stock:${product.id}`,
        });

        const list = await prisma.shoppingList.findFirst({
          where: { householdId: household.id },
        });
        if (list && product.autoAddWhenLowStock) {
          await markProductNeeded(household.id, {
            productId: product.id,
            shopping_list_id: list.id,
            autoAdded: true,
          });
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

      await notify({
        householdId: household.id,
        type: NotificationType.EXPIRY,
        title: `Expiring: ${item.product.name}`,
        message: `${item.product.name} expires on ${item.expiryDate?.toLocaleDateString()}.${recipeHint}`,
        link: "/recipes",
        dedupeKey: `expiry:${item.id}`,
      });
    }
  }
}

async function checkPlantWatering() {
  const plants = await prisma.plant.findMany({
    where: {
      OR: [{ nextWatering: { lte: new Date() } }, { nextWatering: null }],
    },
  });

  const day = localDateKey();
  for (const plant of plants) {
    await notify({
      householdId: plant.householdId,
      type: NotificationType.REMINDER,
      title: `Water ${plant.name}`,
      message: `${plant.name} needs watering today.`,
      link: "/plants",
      dedupeKey: `plant:${plant.id}:water:${day}`,
    });
  }
}

async function checkChoreDeadlines() {
  const chores = await prisma.chore.findMany({
    where: {
      deadline: { lte: addDays(new Date(), 1), gte: new Date() },
    },
  });

  const day = localDateKey();
  for (const chore of chores) {
    await notify({
      householdId: chore.householdId,
      type: NotificationType.TASK,
      title: `Chore due: ${chore.title}`,
      message: `Deadline: ${chore.deadline?.toLocaleString()}`,
      link: "/tasks",
      dedupeKey: `chore:${chore.id}:due:${day}`,
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
      const items =
        event.itemsNeeded.length > 0
          ? ` Items needed: ${event.itemsNeeded.join(", ")}`
          : "";

      await notify({
        householdId: event.householdId,
        type: NotificationType.REMINDER,
        title: `Upcoming: ${event.title}`,
        message: `Starts at ${event.startAt.toLocaleString()}.${items}`,
        link: "/calendar",
        dedupeKey: `calendar:${event.id}`,
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
      await notify({
        householdId: delivery.householdId,
        type: NotificationType.DELIVERY,
        title: "Delivery arriving soon",
        message: `${delivery.description || "Package"} expected around ${delivery.earliestTime.toLocaleTimeString()}`,
        link: "/delivery",
        dedupeKey: `delivery:${delivery.id}:${delivery.earliestTime.toISOString()}`,
      });
    }
  }
}

export async function updatePlantWateringSchedule(
  plantId: string,
  householdId: string,
) {
  const plant = await prisma.plant.findFirst({
    where: { id: plantId, householdId },
  });
  if (!plant) return;

  await prisma.plant.updateMany({
    where: { id: plantId, householdId },
    data: {
      lastWatered: new Date(),
      nextWatering: addDays(new Date(), plant.wateringDays),
    },
  });
}

export function getAverageChoreDuration(
  completions: { durationMin: number | null }[],
) {
  const withDuration = completions.filter((c) => c.durationMin != null);
  if (withDuration.length === 0) return null;
  const total = withDuration.reduce((s, c) => s + (c.durationMin || 0), 0);
  return Math.round(total / withDuration.length);
}
