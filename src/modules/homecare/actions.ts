"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { updatePlantWateringSchedule } from "@/core/scheduler";
import { revalidatePath } from "next/cache";
import { saveUpload } from "@/core/uploads/service";

export async function getPlants() {
  const { householdId } = await requireHousehold();
  return prisma.plant.findMany({
    where: { householdId },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 3 } },
    orderBy: { name: "asc" },
  });
}

export async function createPlant(formData: FormData) {
  const { householdId } = await requireHousehold();
  const name = formData.get("name") as string;
  const species = (formData.get("species") as string) || undefined;
  const wateringDays = parseInt((formData.get("wateringDays") as string) || "7", 10);
  const notes = (formData.get("notes") as string) || undefined;

  await prisma.plant.create({
    data: {
      householdId,
      name,
      species,
      wateringDays,
      notes,
      nextWatering: new Date(),
    },
  });
  revalidatePath("/plants");
}

export async function waterPlant(formData: FormData) {
  const { userId } = await requireHousehold();
  const plantId = formData.get("plantId") as string;
  const notes = (formData.get("notes") as string) || undefined;
  const photo = formData.get("photo") as File | null;

  let photoUrl: string | undefined;
  if (photo && photo.size > 0) {
    photoUrl = await saveUpload(photo, "plants");
  }

  await prisma.plantLog.create({
    data: { plantId, userId, notes, photoUrl },
  });
  await updatePlantWateringSchedule(plantId);
  revalidatePath("/plants");
}

export async function getPets() {
  const { householdId } = await requireHousehold();
  return prisma.pet.findMany({
    where: { householdId },
    include: {
      appointments: { orderBy: { date: "asc" } },
      feedingRoutines: true,
    },
  });
}

export async function createPet(formData: FormData) {
  const { householdId } = await requireHousehold();
  await prisma.pet.create({
    data: {
      householdId,
      name: formData.get("name") as string,
      species: (formData.get("species") as string) || undefined,
      breed: (formData.get("breed") as string) || undefined,
      birthDate: formData.get("birthDate")
        ? new Date(formData.get("birthDate") as string)
        : undefined,
      notes: (formData.get("notes") as string) || undefined,
    },
  });
  revalidatePath("/pets");
}

export async function addPetAppointment(formData: FormData) {
  const petId = formData.get("petId") as string;
  await prisma.petAppointment.create({
    data: {
      petId,
      title: formData.get("title") as string,
      date: new Date(formData.get("date") as string),
      location: (formData.get("location") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    },
  });
  revalidatePath("/pets");
}

export async function addFeedingRoutine(formData: FormData) {
  const petId = formData.get("petId") as string;
  await prisma.feedingRoutine.create({
    data: {
      petId,
      name: formData.get("name") as string,
      timeOfDay: formData.get("timeOfDay") as string,
      amount: (formData.get("amount") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    },
  });
  revalidatePath("/pets");
}

export async function getPetStats(petId: string) {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    include: {
      appointments: true,
      feedingRoutines: true,
    },
  });
  if (!pet) return null;

  const upcomingAppointments = pet.appointments.filter(
    (a) => a.date >= new Date()
  ).length;
  const age = pet.birthDate
    ? Math.floor((Date.now() - pet.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return {
    feedingRoutines: pet.feedingRoutines.length,
    upcomingAppointments,
    totalAppointments: pet.appointments.length,
    age,
  };
}
