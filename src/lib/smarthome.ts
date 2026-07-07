export function getWindowRecommendation(reading: {
  temperature?: number | null;
  humidity?: number | null;
  airQuality?: number | null;
}) {
  if (reading.temperature != null && reading.temperature > 24 && reading.humidity != null && reading.humidity < 60) {
    return "Open windows for fresh air - temperature is warm and humidity is moderate.";
  }
  if (reading.airQuality != null && reading.airQuality > 100) {
    return "Air quality is poor - open windows or run ventilation.";
  }
  if (reading.humidity != null && reading.humidity > 70) {
    return "High humidity - open windows briefly to ventilate.";
  }
  return "Conditions look good - windows can stay closed.";
}
