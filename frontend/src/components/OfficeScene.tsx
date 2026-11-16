import { useMemo } from "react";
import type { OfficeAgent } from "../api";
import Office3D from "../office3d/Office3D";
import type { OfficeState, OfficeStation } from "../office3d/station";

function stateOf(status: OfficeAgent["status"]): OfficeState {
  switch (status) {
    case "working":
      return "Working";
    case "degraded":
      return "Reviewing";
    case "failed":
      return "Offline";
    default:
      return "Idle";
  }
}

function atDesk(status: OfficeAgent["status"]): boolean {
  return status === "working" || status === "degraded" || status === "failed";
}

export function OfficeScene({
  agents,
  onSelect,
  floor,
  onFloorChange,
}: {
  agents: OfficeAgent[];
  onSelect: (agent: OfficeAgent) => void;
  floor?: 1 | 2;
  onFloorChange?: (floor: 1 | 2) => void;
}) {
  const stations = useMemo<OfficeStation[]>(
    () =>
      agents.map((agent, index) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        room: atDesk(agent.status) ? "Workspace" : "Lounge",
        roomPosition: "desk",
        state: stateOf(agent.status),
        currentTask: agent.task,
        recentActivity: agent.summary,
        activity: agent.status === "working" ? agent.summary : "",
        seat: index + 1,
        provenance: "Agent API",
        freshness: agent.lastRunAt ?? "Belum pernah",
      })),
    [agents],
  );

  return (
    <div className="office-canvas-wrap" data-testid="office-scene">
      <Office3D
        stations={stations}
        floor={floor}
        onFloorChange={onFloorChange}
        onSelect={(station) => {
          const agent = agents.find((item) => item.id === station.id);
          if (agent) onSelect(agent);
        }}
      />
    </div>
  );
}
