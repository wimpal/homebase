export type WindowRecommendationKey = "warmAir" | "poorAir" | "highHumidity" | "good";

export function getWindowRecommendationKey(reading: {
  temperature?: number | null;
  humidity?: number | null;
  airQuality?: number | null;
}): WindowRecommendationKey {
  if (reading.temperature != null && reading.temperature > 24 && reading.humidity != null && reading.humidity < 60) {
    return "warmAir";
  }
  if (reading.airQuality != null && reading.airQuality > 100) {
    return "poorAir";
  }
  if (reading.humidity != null && reading.humidity > 70) {
    return "highHumidity";
  }
  return "good";
}
