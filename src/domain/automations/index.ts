export { applyAutomationAction } from "./apply";
export {
  createAutomation,
  deleteAutomation,
  setAutomationEnabled,
  updateAutomation,
} from "./mutate";
export { getAutomation, listAutomations } from "./list";
export {
  claimAutomationSlot,
  evaluateLightAutomations,
  getLocalScheduleParts,
  slotKey,
} from "./schedule";
export type {
  EvaluateLightAutomationsResult,
  LocalScheduleParts,
} from "./schedule";
export { isWithinActiveWindow } from "./active-window";
export {
  claimSensorCooldown,
  clearSensorDebounceState,
  handleSensorEdge,
  handleSensorRisingEdge,
  shouldDebounceRisingEdge,
  shouldDebounceSensorEdge,
} from "./sensor";
export type {
  HandleSensorEdgeResult,
  HandleSensorRisingEdgeResult,
} from "./sensor";
export {
  AUTOMATION_TIMEZONE_V1,
  LAST_RUN_RESULT_MAX,
  SENSOR_COOLDOWN_MS,
  SENSOR_DEBOUNCE_MS,
  SENSOR_EDGE_ATTRIBUTES,
  SENSOR_EDGE_POLARITIES,
  TOGGLE_SESSIONS,
  normalizeToggleSession,
} from "./types";
export type {
  ApplyAutomationOptions,
  ApplyAutomationResult,
  AutomationWriteInput,
  LightAutomationDto,
  LightAutomationTargetDto,
  LightAutomationTriggerKind,
  SensorEdgeAttribute,
  SensorEdgePolarity,
  ToggleSession,
} from "./types";
