import { getDevices, getDirigeraLights, getSensorReadings } from "@/modules/smarthome/actions";
import { SmartHomeClient } from "./SmartHomeClient";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function SmartHomePage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.SMART_HOME);
  const [devices, readings, dirigera] = await Promise.all([
    getDevices(),
    getSensorReadings(),
    getDirigeraLights(),
  ]);
  return (
    <SmartHomeClient devices={devices} readings={readings} dirigera={dirigera} />
  );
}
