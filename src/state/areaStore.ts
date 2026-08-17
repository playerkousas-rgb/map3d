import { create } from "zustand";

type AreaStore = {
  areas: any;
  center: {
    lat: number;
    lng: number;
  }[];

  appendAreas: (areas: any[]) => void;
  setCenter: (center: any[]) => void;
};

export const useAreaStore = create<AreaStore>((set) => ({
  areas: [],
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
  appendAreas: (areas) => set(() => ({ areas: [...areas] })),
  setCenter: (center) => set(() => ({ center: [...center] })),
}));
