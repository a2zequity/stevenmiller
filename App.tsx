import React, { useMemo } from "react";
import { Projections } from "./types";
import { InputPanel } from "./components/InputPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { calculateProjections } from "./services/calculator";
import { Briefcase, RotateCcw } from "lucide-react";
import { useAppStore } from "./store";

const App: React.FC = () => {
  const { investors, deals, isHydrated, resetToDefaults } = useAppStore();

  const results = useMemo((): Projections | null => {
    const activeDeals = deals.filter((deal) => deal.isActive);
    if (investors.length === 0 || activeDeals.length === 0) {
      return null;
    }
    try {
      return calculateProjections(investors, activeDeals);
    } catch (error) {
      console.error("Calculation Error:", error);
      return null; // Handle potential errors in calculation
    }
  }, [investors, deals]);

  if (!isHydrated) {
    return (
      <div className="bg-slate-100 min-h-screen font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading saved data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-100 min-h-screen font-sans">
      <header className="bg-white shadow-sm p-4 border-b border-slate-200 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Briefcase className="text-blue-600" size={32} />
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                Deal-by-Deal Waterfall Calculator
              </h1>
              <p className="text-sm text-slate-500">
                Model deal-level private equity profit distributions.
              </p>
            </div>
          </div>
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
            title="Reset to default data"
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </header>
      <main className="flex flex-col md:flex-row h-[calc(100vh-73px)]">
        <div className="w-full md:w-1/3 lg:w-2/5 border-r border-slate-200">
          <InputPanel />
        </div>
        <div className="w-full md:w-2/3 lg:w-3/5">
          <ResultsPanel results={results} />
        </div>
      </main>
    </div>
  );
};

export default App;
