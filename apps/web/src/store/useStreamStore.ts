import { create } from "zustand";

type StreamState = {
  selectedPlatform: string;
  setSelectedPlatform: (platform: string) => void;
};

export const useStreamStore = create<StreamState>((set) => ({
  selectedPlatform: "all",
  setSelectedPlatform: (platform) => set({ selectedPlatform: platform })
}));
