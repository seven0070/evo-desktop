import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type MissionStepUpdate = {
  missionId?: string;
  mission_id?: string;
  step?: string;
  status?: string;
  evidence?: string[];
};

export type SystemHealthUpdate = {
  status?: string;
  workers?: number;
  connectivity?: string;
};

export type AgentEvent = MissionStepUpdate & {
  type: "STEP_UPDATE" | "MISSION_STARTED" | "WAITING_APPROVAL" | "MISSION_COMPLETED" | "TELEMETRY" | "ERROR";
  action?: string;
  reason?: string;
  risk_level?: string;
  summary?: string;
  error?: string;
  health?: SystemHealthUpdate;
};

export type BridgeCommand =
  | "START_MISSION"
  | "APPROVE_STEP"
  | "CANCEL_MISSION"
  | "GET_HEALTH";

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startAgentBridge() {
  if (!isTauriRuntime()) return;
  await invoke("start_agent_bridge");
}

export async function sendBridgeCommand(
  command: BridgeCommand,
  payload: Record<string, unknown> = {},
) {
  if (!isTauriRuntime()) return;
  await invoke("send_bridge_command", { command, payload });
}

export async function sendPrompt(missionId: string, promptText: string) {
  await sendBridgeCommand("START_MISSION", {
    mission_id: `evo-${missionId.toLowerCase().replaceAll(" ", "-")}`,
    prompt: promptText,
  });
}

export async function approveAction(missionId: string, actionName: string) {
  await sendBridgeCommand("APPROVE_STEP", {
    mission_id: missionId,
    action: actionName,
  });
}

export function subscribeToAgentEvents(
  handler: (event: AgentEvent) => void,
) {
  if (!isTauriRuntime()) {
    return Promise.resolve<UnlistenFn>(() => undefined);
  }

  return listen<string>("agent-event", (event) => {
    try {
      const parsed = JSON.parse(event.payload) as AgentEvent;
      if (parsed && typeof parsed.type === "string") handler(parsed);
    } catch {
      handler({
        type: "ERROR",
        error: "The agent bridge sent an invalid event.",
      });
    }
  });
}