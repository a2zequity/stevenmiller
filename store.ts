import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Investor, Deal } from "./types";

// Sample initial data
const initialInvestors: Investor[] = [
  { id: "gp1", name: "Abhi", isGP: true, gpCarryPercentage: 50, commitment: 0 },
  { id: "gp2", name: "Ovi", isGP: true, gpCarryPercentage: 50, commitment: 0 },
  { id: "lp1", name: "Family Office", isGP: false, commitment: 1000000 },
  { id: "lp2", name: "Angel Investor", isGP: false, commitment: 500000 },
];

const initialDeals: Deal[] = [
  {
    id: "deal1",
    name: "Property Alpha",
    isActive: true,
    participants: [
      { investorId: "lp1", amount: 750000 },
      { investorId: "lp2", amount: 250000 },
    ],
    projectedAnnualReturn: 10,
    actualAnnualReturns: [15, 18, 25, 30, 10],
    managementFee: 0,
    timelineYears: 5,
    preferredReturn: 8,
    gpCatchUp: { applies: true, percentage: 100, hurdle: 10 },
    firstTier: { split: { lp: 80, gp: 20 }, hurdle: 15 },
    secondTier: { split: { lp: 60, gp: 40 } },
  },
];

interface AppState {
  investors: Investor[];
  deals: Deal[];
  isHydrated: boolean;

  // Actions
  setInvestors: (investors: Investor[]) => void;
  setDeals: (deals: Deal[]) => void;
  addInvestor: (investor: Investor) => void;
  updateInvestor: (id: string, updates: Partial<Investor>) => void;
  removeInvestor: (id: string) => void;
  addDeal: (deal: Deal) => void;
  updateDeal: (id: string, updates: Partial<Deal>) => void;
  removeDeal: (id: string) => void;
  toggleDealActive: (id: string) => void;
  resetToDefaults: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      investors: initialInvestors,
      deals: initialDeals,
      isHydrated: false,

      setInvestors: (investors) => set({ investors }),
      setDeals: (deals) => set({ deals }),

      addInvestor: (investor) =>
        set((state) => ({
          investors: [...state.investors, investor],
        })),

      updateInvestor: (id, updates) =>
        set((state) => ({
          investors: state.investors.map((investor) =>
            investor.id === id ? { ...investor, ...updates } : investor
          ),
        })),

      removeInvestor: (id) =>
        set((state) => ({
          investors: state.investors.filter((investor) => investor.id !== id),
          deals: state.deals.map((deal) => ({
            ...deal,
            participants: deal.participants.filter(
              (participant) => participant.investorId !== id
            ),
          })),
        })),

      addDeal: (deal) =>
        set((state) => ({
          deals: [...state.deals, deal],
        })),

      updateDeal: (id, updates) =>
        set((state) => ({
          deals: state.deals.map((deal) =>
            deal.id === id ? { ...deal, ...updates } : deal
          ),
        })),

      removeDeal: (id) =>
        set((state) => ({
          deals: state.deals.filter((deal) => deal.id !== id),
        })),

      toggleDealActive: (id) =>
        set((state) => ({
          deals: state.deals.map((deal) =>
            deal.id === id ? { ...deal, isActive: !deal.isActive } : deal
          ),
        })),

      resetToDefaults: () =>
        set({
          investors: initialInvestors,
          deals: initialDeals,
        }),

      setHydrated: (hydrated) => set({ isHydrated: hydrated }),
    }),
    {
      name: "waterfall-calculator-storage",
      partialize: (state) => ({
        investors: state.investors,
        deals: state.deals,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
        }
      },
    }
  )
);
