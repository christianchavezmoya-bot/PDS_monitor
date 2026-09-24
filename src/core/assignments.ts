import { invoke } from "@tauri-apps/api/core";
export interface PadAssignment {
  padId: number;
  name: string;
  employeeId?: string;
  notes?: string;
}

export interface MachineAssignment {
  controllerId: number;
  machineId: string;
  machineName?: string;
  notes?: string;
}

export type LabelMode = "id" | "name" | "both";

const PAD_KEY = "shr-pds-pad-assignments";
const MACHINE_KEY = "shr-pds-machine-assignments";
const LABEL_KEY = "shr-pds-label-modes";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (
      typeof fallback === "object" && fallback !== null &&
      typeof parsed === "object" && parsed !== null &&
      !Array.isArray(fallback) && !Array.isArray(parsed)
    ) {
      return { ...fallback, ...parsed };
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function loadPadAssignments(): Record<number, PadAssignment> { return read(PAD_KEY, {}); }
export function loadMachineAssignments(): Record<number, MachineAssignment> { return read(MACHINE_KEY, {}); }

export function savePadAssignment(item: PadAssignment): void {
  const all = loadPadAssignments();
  all[item.padId] = item;
  localStorage.setItem(PAD_KEY, JSON.stringify(all));
  if ("__TAURI_INTERNALS__" in window) void invoke("save_pad_assignment", { item });
}

export function saveMachineAssignment(item: MachineAssignment): void {
  const all = loadMachineAssignments();
  all[item.controllerId] = item;
  localStorage.setItem(MACHINE_KEY, JSON.stringify(all));
  if ("__TAURI_INTERNALS__" in window) void invoke("save_machine_assignment", { item });
}

export function loadLabelModes(): { pad: LabelMode; machine: LabelMode } {
  return read(LABEL_KEY, { pad: "both", machine: "both" });
}

export function saveLabelModes(modes: { pad: LabelMode; machine: LabelMode }): void {
  localStorage.setItem(LABEL_KEY, JSON.stringify(modes));
}

export function formatPadLabel(id: number, assignment: PadAssignment | undefined, mode: LabelMode): string {
  const name = assignment?.name?.trim();
  if (!name || mode === "id") return `PAD ${id}`;
  if (mode === "name") return name;
  return `${name} · PAD ${id}`;
}

export function formatMachineLabel(id: number, assignment: MachineAssignment | undefined, mode: LabelMode): string {
  const name = assignment?.machineName?.trim() || assignment?.machineId?.trim();
  if (!name || mode === "id") return `Controller ${id}`;
  if (mode === "name") return name;
  return `${name} · Controller ${id}`;
}

export async function hydrateAssignmentsFromSqlite(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const [pads, machines] = await Promise.all([
    invoke<PadAssignment[]>("list_pad_assignments"),
    invoke<MachineAssignment[]>("list_machine_assignments"),
  ]);
  const localPads = loadPadAssignments();
  const localMachines = loadMachineAssignments();
  for (const item of pads) localPads[item.padId] = item;
  for (const item of machines) localMachines[item.controllerId] = item;
  localStorage.setItem(PAD_KEY, JSON.stringify(localPads));
  localStorage.setItem(MACHINE_KEY, JSON.stringify(localMachines));
  for (const item of Object.values(localPads)) await invoke("save_pad_assignment", { item });
  for (const item of Object.values(localMachines)) await invoke("save_machine_assignment", { item });
}
