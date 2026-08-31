#!/usr/bin/env python3
"""Line-delimited JSON bridge for the EVO Tauri shell.

The bridge only performs read-only local inspection in this scaffold. Release
deployment remains behind the explicit approval command and can be connected
to the real execution engine without changing the UI protocol.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from typing import Any


waiting_mission: str | None = None


def emit_event(event_type: str, **data: Any) -> None:
    payload = {"type": event_type, **data}
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def repository_evidence() -> list[str]:
    try:
        recent_commits = subprocess.check_output(
            ["git", "log", "-n", "3", "--oneline"],
            cwd=os.getcwd(),
            text=True,
            stderr=subprocess.STDOUT,
            timeout=5,
        ).strip()
        return [f"Recent commits: {recent_commits or 'none found'}"]
    except (OSError, subprocess.SubprocessError) as error:
        return [f"Repository inspection unavailable: {error}"]


def handle_mission(mission_id: str, prompt: str) -> None:
    global waiting_mission
    waiting_mission = mission_id
    emit_event(
        "MISSION_STARTED",
        mission_id=mission_id,
        step="Planning complete",
        status="running",
    )
    time.sleep(0.2)
    emit_event(
        "STEP_UPDATE",
        mission_id=mission_id,
        step="Checked repository",
        status="running",
        evidence=repository_evidence(),
    )
    time.sleep(0.2)
    emit_event(
        "STEP_UPDATE",
        mission_id=mission_id,
        step="Ran validation",
        status="running",
        evidence=["Validation harness ready", f"Prompt received: {prompt}"],
    )
    emit_event(
        "WAITING_APPROVAL",
        mission_id=mission_id,
        action="Deploy the approved release",
        reason="The release passed validation and no blocking issues were found.",
        risk_level="Low",
        status="waiting_approval",
    )


def handle_command(message: dict[str, Any]) -> None:
    global waiting_mission
    command = message.get("command")
    payload = message.get("payload") or {}
    mission_id = str(payload.get("mission_id") or "evo-prepare-my-project-release")

    if command == "START_MISSION":
        handle_mission(mission_id, str(payload.get("prompt") or ""))
    elif command == "APPROVE_STEP":
        if waiting_mission and mission_id != waiting_mission:
            emit_event("ERROR", error="Approval does not match the waiting mission.")
            return
        emit_event(
            "STEP_UPDATE",
            mission_id=mission_id,
            step="Deploying release",
            status="running",
        )
        time.sleep(0.4)
        emit_event(
            "MISSION_COMPLETED",
            mission_id=mission_id,
            status="completed",
            step="Release deployed",
            summary="Release deployed successfully.",
        )
        waiting_mission = None
    elif command == "CANCEL_MISSION":
        emit_event("STEP_UPDATE", mission_id=mission_id, step="Mission cancelled", status="cancelled")
        waiting_mission = None
    elif command == "GET_HEALTH":
        emit_event(
            "TELEMETRY",
            health={"status": "Operational", "workers": 1, "connectivity": "Connected"},
        )
    else:
        emit_event("ERROR", error=f"Unknown bridge command: {command}")


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
            if isinstance(message, dict):
                handle_command(message)
            else:
                emit_event("ERROR", error="Bridge commands must be JSON objects.")
        except (json.JSONDecodeError, TypeError) as error:
            emit_event("ERROR", error=f"Invalid bridge command: {error}")


if __name__ == "__main__":
    main()