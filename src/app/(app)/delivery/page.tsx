import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDeliveries, createDelivery, updateDeliveryStatus } from "@/modules/social/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Package, ExternalLink } from "lucide-react";

const statuses = ["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"] as const;

export default async function DeliveryPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.DELIVERY);
  const deliveries = await getDeliveries();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delivery Tracking</h1>
        <p className="text-zinc-500">Track packages and get arrival alerts</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add Package</CardTitle></CardHeader>
        <CardContent>
          <form action={createDelivery} className="grid gap-3 md:grid-cols-2">
            <div><Label>Description</Label><Input name="description" placeholder="Amazon order" /></div>
            <div><Label>Carrier</Label><Input name="carrier" placeholder="UPS, FedEx..." /></div>
            <div><Label>Tracking number</Label><Input name="trackingNumber" /></div>
            <div><Label>Tracking URL</Label><Input name="trackingUrl" type="url" /></div>
            <div><Label>Expected date</Label><Input name="expectedDate" type="date" /></div>
            <div><Label>Earliest delivery time</Label><Input name="earliestTime" type="datetime-local" /></div>
            <div><Label>Latest delivery time</Label><Input name="latestTime" type="datetime-local" /></div>
            <Button type="submit">Add Package</Button>
          </form>
        </CardContent>
      </Card>

      {deliveries.map((d) => (
        <Card key={d.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <Package className="h-4 w-4" />
                {d.description || "Package"}
              </p>
              <p className="text-sm text-zinc-500">
                {d.carrier} {d.trackingNumber && `· ${d.trackingNumber}`}
              </p>
              {d.expectedDate && (
                <p className="text-sm">Expected: {new Date(d.expectedDate).toLocaleDateString()}</p>
              )}
              {d.earliestTime && (
                <p className="text-xs text-zinc-400">
                  Window: {new Date(d.earliestTime).toLocaleTimeString()}
                  {d.latestTime && ` - ${new Date(d.latestTime).toLocaleTimeString()}`}
                </p>
              )}
              <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                {d.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {d.trackingUrl && (
                <a href={d.trackingUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-1 h-3 w-3" /> Track
                  </Button>
                </a>
              )}
              <form action={updateDeliveryStatus} className="flex gap-1">
                <input type="hidden" name="id" value={d.id} />
                <select name="status" className="rounded border px-2 text-xs">
                  {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
                <Button type="submit" size="sm" variant="ghost">Update</Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
