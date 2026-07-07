import { getDevices, getSensorReadings } from "@/modules/smarthome/actions";
import { SmartHomeClient } from "./SmartHomeClient";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function SmartHomePage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.SMART_HOME);
  const [devices, readings] = await Promise.all([getDevices(), getSensorReadings()]);
  return <SmartHomeClient devices={devices} readings={readings} />;
}
