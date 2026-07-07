"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createDevice, addSensorReading, controlHueLight } from "@/modules/smarthome/actions";
import { getWindowRecommendation } from "@/lib/smarthome";
import { Thermometer, Wind, Lightbulb, Camera } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface Device {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: unknown;
}

interface Reading {
  id: string;
  temperature: number | null;
  humidity: number | null;
  airQuality: number | null;
  createdAt: Date;
}

export function SmartHomeClient({
  devices,
  readings,
}: {
  devices: Device[];
  readings: Reading[];
}) {
  const [hueStatus, setHueStatus] = useState<Record<string, string>>({});

  const latest = readings[0];
  const recommendation = latest
    ? getWindowRecommendation(latest)
    : "Add sensor readings to get recommendations.";

  const chartData = [...readings].reverse().map((r) => ({
    time: new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    temp: r.temperature,
    humidity: r.humidity,
    aqi: r.airQuality,
  }));

  async function toggleLight(deviceId: string, on: boolean) {
    const result = await controlHueLight(deviceId, on);
    setHueStatus((prev) => ({
      ...prev,
      [deviceId]: result.success ? (on ? "On" : "Off") : result.error || "Failed",
    }));
  }

  const lights = devices.filter((d) => d.type === "LIGHT");
  const cameras = devices.filter((d) => d.type === "CAMERA");
  const sensors = devices.filter((d) => d.type === "SENSOR");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Smart Home</h1>
        <p className="text-zinc-500">Sensors, lights, and cameras</p>
      </div>

      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="flex items-center gap-3 p-4">
          <Wind className="h-5 w-5 text-blue-600" />
          <p className="text-sm">{recommendation}</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="sensors">
        <TabsList>
          <TabsTrigger value="sensors">Sensors</TabsTrigger>
          <TabsTrigger value="lights">Hue Lights</TabsTrigger>
          <TabsTrigger value="cameras">Cameras</TabsTrigger>
        </TabsList>

        <TabsContent value="sensors" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Log Reading</CardTitle></CardHeader>
            <CardContent>
              <form action={addSensorReading} className="flex flex-wrap gap-2">
                <Input name="temperature" type="number" step="0.1" placeholder="Temp °C" className="w-28" />
                <Input name="humidity" type="number" step="0.1" placeholder="Humidity %" className="w-28" />
                <Input name="airQuality" type="number" step="0.1" placeholder="AQI" className="w-28" />
                <Button type="submit">Log</Button>
              </form>
            </CardContent>
          </Card>

          {latest && (
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4 text-center">
                <Thermometer className="mx-auto h-5 w-5 text-red-500" />
                <p className="text-2xl font-bold">{latest.temperature ?? "—"}°</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-zinc-500">Humidity</p>
                <p className="text-2xl font-bold">{latest.humidity ?? "—"}%</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <p className="text-xs text-zinc-500">Air Quality</p>
                <p className="text-2xl font-bold">{latest.airQuality ?? "—"}</p>
              </CardContent></Card>
            </div>
          )}

          {chartData.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Trends</CardTitle></CardHeader>
              <CardContent className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="temp" stroke="#ef4444" dot={false} />
                    <Line type="monotone" dataKey="humidity" stroke="#3b82f6" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="lights" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Hue Light</CardTitle></CardHeader>
            <CardContent>
              <form action={createDevice} className="flex gap-2">
                <input type="hidden" name="type" value="LIGHT" />
                <Input name="name" placeholder="Living room lamp" required />
                <Input name="config" placeholder='{"lightId": 1}' />
                <Button type="submit">Add</Button>
              </form>
            </CardContent>
          </Card>

          {lights.map((light) => (
            <Card key={light.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  <span>{light.name}</span>
                  {hueStatus[light.id] && <span className="text-xs text-zinc-500">{hueStatus[light.id]}</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toggleLight(light.id, true)}>On</Button>
                  <Button size="sm" variant="outline" onClick={() => toggleLight(light.id, false)}>Off</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="cameras" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Camera</CardTitle></CardHeader>
            <CardContent>
              <form action={createDevice} className="flex gap-2">
                <input type="hidden" name="type" value="CAMERA" />
                <Input name="name" placeholder="Front door" required />
                <Input name="config" placeholder='{"streamUrl": "http://..."}' />
                <Button type="submit">Add</Button>
              </form>
            </CardContent>
          </Card>

          {cameras.map((cam) => {
            const config = cam.config as { streamUrl?: string } | null;
            return (
              <Card key={cam.id}>
                <CardContent className="p-4">
                  <p className="mb-2 flex items-center gap-2 font-medium">
                    <Camera className="h-4 w-4" /> {cam.name}
                  </p>
                  {config?.streamUrl ? (
                    <img src={config.streamUrl} alt={cam.name} className="max-h-48 rounded" />
                  ) : (
                    <p className="text-sm text-zinc-500">Configure stream URL in device settings</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
