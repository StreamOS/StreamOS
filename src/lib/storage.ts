import { defaultWorkspace, STORAGE_KEY } from "@/data/defaultWorkspace";
import type { WorkspaceState } from "@/types/streamos";

function cloneDefaultWorkspace(): WorkspaceState {
  return structuredClone(defaultWorkspace);
}

export function loadWorkspaceState(): WorkspaceState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return cloneDefaultWorkspace();
    }

    return {
      ...cloneDefaultWorkspace(),
      ...JSON.parse(stored)
    };
  } catch {
    return cloneDefaultWorkspace();
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetWorkspaceState(): WorkspaceState {
  localStorage.removeItem(STORAGE_KEY);
  return cloneDefaultWorkspace();
}

export function seedWorkspaceState(): WorkspaceState {
  const nextState = cloneDefaultWorkspace();
  saveWorkspaceState(nextState);
  return nextState;
}
