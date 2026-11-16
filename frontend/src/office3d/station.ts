export type OfficeState =
  | "Idle"
  | "Working"
  | "Reviewing"
  | "Collaborating"
  | "Offline"
  | "Unknown";

export type OfficeRoom = "Workspace" | "Lounge";

export interface OfficeStation {
  id: string;
  privacy?: "locked" | "unlocked";
  name: string;
  role: string;
  room: OfficeRoom;
  roomPosition: string;
  state: OfficeState;
  currentTask: string;
  recentActivity: string;
  activity: string;
  seat: number;
  provenance: string;
  freshness: string;
}
