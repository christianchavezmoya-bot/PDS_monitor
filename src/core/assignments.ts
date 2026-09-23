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
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
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
}

export function saveMachineAssignment(item: MachineAssignment): void {
  const all = loadMachineAssignments();
  all[item.controllerId] = item;
  localStorage.setItem(MACHINE_KEY, JSON.stringify(all));
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
