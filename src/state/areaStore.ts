import { create } from "zustand";

type AreaStore = {
  areas: any;
  /** true once buildings were fetched for a user-selected area */
  areasLoaded: boolean;
  center: {
    lat: number;
    lng: number;
  }[];

  appendAreas: (areas: any[]) => void;
  setCenter: (center: any[]) => void;
};

export const useAreaStore = create<AreaStore>((set) => ({
  areas: [],
  areasLoaded: false,
  center: [
    {
      lat: 22.34,
      lng: 114.15,
    },
    {
      lat: 22.30,
      lng: 114.20,
    },
  ],
  appendAreas: (areas) => set(() => ({ areas: [...areas], areasLoaded: true })),
  setCenter: (center) => set(() => ({ center: [...center] })),
}));
