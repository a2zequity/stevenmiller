
import { Investor, Deal, Projections, CalculationOutput, LPPerformance, LPDealPerformance } from '../types';

const MAX_IRR_ITERATIONS = 100;
const IRR_TOLERANCE = 1e-6;

// IRR calculation using the Newton-Raphson method
const calculateIRR = (cashflows: number[]): number => {
    if (cashflows.length === 0 || cashflows[0] >= 0) {
        return NaN; // No investment or no cashflows
    }

    let guess = 0.1;

    for (let i = 0; i < MAX_IRR_ITERATIONS; i++) {
        let npv = 0;
        let dNpv = 0;
        for (let j = 0; j < cashflows.length; j++) {
            npv += cashflows[j] / Math.pow(1 + guess, j);
            dNpv += -j * cashflows[j] / Math.pow(1 + guess, j + 1);
        }

        if (Math.abs(npv) < IRR_TOLERANCE) {
            return guess;
        }
        if (dNpv === 0) {
            break;
        }
        guess = guess - npv / dNpv;
    }

    // Check if the final NPV is close enough, otherwise it didn't converge
    let finalNpv = 0;
    for (let j = 0; j < cashflows.length; j++) {
        finalNpv += cashflows[j] / Math.pow(1 + guess, j);
    }
    if (Math.abs(finalNpv) < IRR_TOLERANCE * 100) { // a bit more lenient check
        return guess;
    }

    return NaN; // Failed to converge
};


const calculateSingleScenario = (
    investors: Investor[],
    deals: Deal[],
    useProjected: boolean
): CalculationOutput => {
    const lps = investors.filter(inv => !inv.isGP);
    const gps = investors.filter(inv => inv.isGP);
    const totalGpCarrySum = gps.reduce((sum, gp) => sum + (gp.gpCarryPercentage || 0), 0);
    const maxTimeline = Math.max(0, ...deals.map(d => d.timelineYears));

    // Initialize result accumulators
    const lpPerformanceData: { [lpId: string]: {
        name: string;
        cashflows: number[];
        allocated: number;
        dealBreakdown: { [dealId: string]: { dealName: string; investment: number; distribution: number; } };
    }} = {};
    lps.forEach(lp => {
        lpPerformanceData[lp.id] = {
            name: lp.name,
            cashflows: Array(maxTimeline + 1).fill(0),
            allocated: 0,
            dealBreakdown: {}
        };
    });

    deals.forEach(deal => {
        deal.participants.forEach(p => {
            const lp = lps.find(l => l.id === p.investorId);
            if (lp && lpPerformanceData[lp.id]) {
                lpPerformanceData[lp.id].allocated += p.amount;
                lpPerformanceData[lp.id].dealBreakdown[deal.id] = {
                    dealName: deal.name,
                    investment: p.amount,
                    distribution: 0
                };
            }
        });
    });

    lps.forEach(lp => {
        lpPerformanceData[lp.id].cashflows[0] = -lpPerformanceData[lp.id].allocated;
    });
    
    const gpYearlyManagementFees: { [key: string]: number[] } = {};
    const gpYearlyCarriedInterest: { [key: string]: number[] } = {};
    gps.forEach(gp => {
        gpYearlyManagementFees[gp.id] = Array(maxTimeline + 1).fill(0);
        gpYearlyCarriedInterest[gp.id] = Array(maxTimeline + 1).fill(0);
    });
    
    const overallYearlyBreakdown: { year: number, grossReturn: number, lpDistributions: number, gpEarnings: number }[] = [];
    const annualDistributionChartData: { year: number, lpPref: number, lpProfitShare: number, gpCatchUp: number, gpProfitShare: number, gpMgmtFee: number }[] = [];

    for (let year = 1; year <= maxTimeline; year++) {
        let yearGrossReturn = 0;
        let yearLPDistributions = 0;
        let yearGPEarnings = 0;
        let yearChartData = { year, lpPref: 0, lpProfitShare: 0, gpCatchUp: 0, gpProfitShare: 0, gpMgmtFee: 0 };
        
        const lpDistributionsThisYear: { [key: string]: number } = {};
        lps.forEach(lp => lpDistributionsThisYear[lp.id] = 0);
        
        const gpMgmtFeesThisYear: { [key: string]: number } = {};
        const gpCarryThisYear: { [key: string]: number } = {};
        gps.forEach(gp => {
            gpMgmtFeesThisYear[gp.id] = 0;
            gpCarryThisYear[gp.id] = 0;
        });

        for (const deal of deals) {
            if (year > deal.timelineYears) continue;

            const dealInvestment = deal.participants.reduce((sum, p) => sum + p.amount, 0);
            if (dealInvestment === 0) continue;

            const annualReturnPercent = useProjected
                ? deal.projectedAnnualReturn
                : (deal.actualAnnualReturns[year - 1] ?? 0);

            const annualProfit = dealInvestment * (annualReturnPercent / 100);
            yearGrossReturn += annualProfit;

            let profitForWaterfall = annualProfit;

            // 1. Management Fee
            const managementFeeAmount = dealInvestment * (deal.managementFee / 100);
            profitForWaterfall -= managementFeeAmount;
            yearChartData.gpMgmtFee += managementFeeAmount;
            
            gps.forEach(gp => {
                const gpShare = totalGpCarrySum > 0 ? (gp.gpCarryPercentage || 0) / totalGpCarrySum : 1 / gps.length;
                const feeShare = managementFeeAmount * gpShare;
                gpMgmtFeesThisYear[gp.id] += feeShare;
            });

            deal.unpaidPref = deal.unpaidPref || 0;

            // 2. LP Preferred Return
            const prefAccruedThisYear = dealInvestment * (deal.preferredReturn / 100);
            deal.unpaidPref += prefAccruedThisYear;

            const prefToPay = Math.min(profitForWaterfall, deal.unpaidPref);
            if (prefToPay > 0) {
                deal.participants.forEach(p => {
                    const proRataShare = dealInvestment > 0 ? p.amount / dealInvestment : 0;
                    const lpShare = prefToPay * proRataShare;
                    lpDistributionsThisYear[p.investorId] = (lpDistributionsThisYear[p.investorId] || 0) + lpShare;
                    if(lpPerformanceData[p.investorId]?.dealBreakdown[deal.id]) {
                       lpPerformanceData[p.investorId].dealBreakdown[deal.id].distribution += lpShare;
                    }
                });
                deal.unpaidPref -= prefToPay;
                profitForWaterfall -= prefToPay;
                yearChartData.lpPref += prefToPay;
            }

            let distributableProfit = profitForWaterfall;

            if (distributableProfit > 0) {
                // 3. GP Catch-up
                if (deal.gpCatchUp.applies) {
                    const prefHurdleAmount = dealInvestment * (deal.preferredReturn / 100);
                    const catchUpHurdleAmount = dealInvestment * (deal.gpCatchUp.hurdle / 100);
                    const catchUpBandSize = catchUpHurdleAmount - prefHurdleAmount;
                    
                    if (catchUpBandSize > 0) {
                        const profitForCatchupBand = Math.min(distributableProfit, catchUpBandSize / (1 - (deal.firstTier.split.gp / 100)));
                        const totalCatchupProfitAvailable = Math.min(distributableProfit, profitForCatchupBand);
                        
                        const gpGets = totalCatchupProfitAvailable * (deal.gpCatchUp.percentage / 100);
                        const lpGets = totalCatchupProfitAvailable - gpGets;
                        
                        gps.forEach(gp => {
                           const gpShare = totalGpCarrySum > 0 ? (gp.gpCarryPercentage || 0) / totalGpCarrySum : 1 / gps.length;
                           gpCarryThisYear[gp.id] += gpGets * gpShare;
                        });
                        deal.participants.forEach(p => {
                            const proRataShare = dealInvestment > 0 ? p.amount / dealInvestment : 0;
                            const lpShare = lpGets * proRataShare;
                            lpDistributionsThisYear[p.investorId] = (lpDistributionsThisYear[p.investorId] || 0) + lpShare;
                             if(lpPerformanceData[p.investorId]?.dealBreakdown[deal.id]) {
                                lpPerformanceData[p.investorId].dealBreakdown[deal.id].distribution += lpShare;
                            }
                        });

                        distributableProfit -= totalCatchupProfitAvailable;
                        yearChartData.gpCatchUp += gpGets;
                        yearChartData.lpProfitShare += lpGets;
                    }
                }

                // 4. First Tier Split
                if (distributableProfit > 0) {
                    const currentHurdle = deal.gpCatchUp.applies ? deal.gpCatchUp.hurdle : deal.preferredReturn;
                    const tier1BandSize = dealInvestment * ((deal.firstTier.hurdle - currentHurdle) / 100);

                    if (tier1BandSize > 0) {
                        const profitForBand = Math.min(distributableProfit, tier1BandSize);
                        const gpGets = profitForBand * (deal.firstTier.split.gp / 100);
                        const lpGets = profitForBand * (deal.firstTier.split.lp / 100);

                        gps.forEach(gp => {
                           const gpShare = totalGpCarrySum > 0 ? (gp.gpCarryPercentage || 0) / totalGpCarrySum : 1 / gps.length;
                           gpCarryThisYear[gp.id] += gpGets * gpShare;
                        });
                        deal.participants.forEach(p => {
                            const proRataShare = dealInvestment > 0 ? p.amount / dealInvestment : 0;
                            const lpShare = lpGets * proRataShare;
                            lpDistributionsThisYear[p.investorId] = (lpDistributionsThisYear[p.investorId] || 0) + lpShare;
                             if(lpPerformanceData[p.investorId]?.dealBreakdown[deal.id]) {
                                lpPerformanceData[p.investorId].dealBreakdown[deal.id].distribution += lpShare;
                            }
                        });
                        distributableProfit -= profitForBand;
                        yearChartData.gpProfitShare += gpGets;
                        yearChartData.lpProfitShare += lpGets;
                    }
                }

                // 5. Second Tier Split
                if (distributableProfit > 0) {
                    const gpGets = distributableProfit * (deal.secondTier.split.gp / 100);
                    const lpGets = distributableProfit * (deal.secondTier.split.lp / 100);

                    gps.forEach(gp => {
                        const gpShare = totalGpCarrySum > 0 ? (gp.gpCarryPercentage || 0) / totalGpCarrySum : 1 / gps.length;
                        gpCarryThisYear[gp.id] += gpGets * gpShare;
                    });
                    deal.participants.forEach(p => {
                        const proRataShare = dealInvestment > 0 ? p.amount / dealInvestment : 0;
                        const lpShare = lpGets * proRataShare;
                        lpDistributionsThisYear[p.investorId] = (lpDistributionsThisYear[p.investorId] || 0) + lpShare;
                         if(lpPerformanceData[p.investorId]?.dealBreakdown[deal.id]) {
                            lpPerformanceData[p.investorId].dealBreakdown[deal.id].distribution += lpShare;
                        }
                    });
                    
                    yearChartData.gpProfitShare += gpGets;
                    yearChartData.lpProfitShare += lpGets;
                }
            }
            
            // 6. Return of Capital in final year
            if (year === deal.timelineYears) {
                deal.participants.forEach(p => {
                    const roc = p.amount;
                    lpDistributionsThisYear[p.investorId] = (lpDistributionsThisYear[p.investorId] || 0) + roc;
                    if(lpPerformanceData[p.investorId]?.dealBreakdown[deal.id]) {
                       lpPerformanceData[p.investorId].dealBreakdown[deal.id].distribution += roc;
                    }
                });
            }
        }
        
        lps.forEach(lp => {
            const totalDistribution = lpDistributionsThisYear[lp.id] || 0;
            lpPerformanceData[lp.id].cashflows[year] = totalDistribution;
            yearLPDistributions += totalDistribution;
        });

        gps.forEach(gp => {
            const mgmtFee = gpMgmtFeesThisYear[gp.id] || 0;
            const carry = gpCarryThisYear[gp.id] || 0;
            gpYearlyManagementFees[gp.id][year] = mgmtFee;
            gpYearlyCarriedInterest[gp.id][year] = carry;
            yearGPEarnings += mgmtFee + carry;
        });

        overallYearlyBreakdown.push({ year, grossReturn: yearGrossReturn, lpDistributions: yearLPDistributions, gpEarnings: yearGPEarnings });
        annualDistributionChartData.push(yearChartData);
    }

    // Calculate performance metrics
    const lpPerformance: LPPerformance[] = lps.map(lp => {
        const data = lpPerformanceData[lp.id];
        const distributions = data.cashflows.slice(1).reduce((s, v) => s + (v || 0), 0);
        const moic = data.allocated > 0 ? distributions / data.allocated : 0;
        const irr = calculateIRR(data.cashflows);
        return {
            investorId: lp.id,
            name: data.name,
            allocated: data.allocated,
            distributions,
            moic,
            irr,
            dealBreakdown: Object.entries(data.dealBreakdown).map(([dealId, d]) => ({ dealId, ...d })),
        };
    });

    const gpPerformance = gps.map(gp => {
        const managementFees = gpYearlyManagementFees[gp.id].reduce((s, v) => s + (v || 0), 0);
        const carriedInterest = gpYearlyCarriedInterest[gp.id].reduce((s, v) => s + (v || 0), 0);
        return { investorId: gp.id, name: gp.name, managementFees, carriedInterest, totalEarnings: managementFees + carriedInterest };
    });

    // Finalize summary metrics
    const totalLPDistributions = lpPerformance.reduce((s, p) => s + p.distributions, 0);
    const totalLPAllocated = lpPerformance.reduce((s, p) => s + p.allocated, 0);
    const summaryMetrics = {
        totalLPDistributions,
        totalGPEarnings: gpPerformance.reduce((s, p) => s + p.totalEarnings, 0),
        overallLPMOIC: totalLPAllocated > 0 ? totalLPDistributions / totalLPAllocated : 0,
        totalGPCarriedInterest: gpPerformance.reduce((s, p) => s + p.carriedInterest, 0)
    };
    
    // Create cumulative charts
    const cumulativeTierChartData = annualDistributionChartData.reduce((acc, current) => {
        const last = acc.length > 0 ? acc[acc.length - 1] : { year: 0, lpPref: 0, lpProfitShare: 0, gpCatchUp: 0, gpProfitShare: 0, gpMgmtFee: 0 };
        acc.push({
            year: current.year,
            lpPref: last.lpPref + current.lpPref,
            lpProfitShare: last.lpProfitShare + current.lpProfitShare,
            gpCatchUp: last.gpCatchUp + current.gpCatchUp,
            gpProfitShare: last.gpProfitShare + current.gpProfitShare,
            gpMgmtFee: last.gpMgmtFee + current.gpMgmtFee,
        });
        return acc;
    }, [] as typeof annualDistributionChartData);

    const yearlyBreakdown = overallYearlyBreakdown.map(y => ({
        ...y,
        totalDistribution: y.lpDistributions + y.gpEarnings,
    }));
    
    deals.forEach(d => delete d.unpaidPref);

    return {
        summaryMetrics,
        annualDistributionChartData,
        cumulativeTierChartData,
        lpPerformance,
        gpPerformance,
        yearlyBreakdown,
        cumulativeReturnChartData: []
    };
};

export const calculateProjections = (investors: Investor[], deals: Deal[]): Projections => {
    const dealsCopy1 = JSON.parse(JSON.stringify(deals));
    const dealsCopy2 = JSON.parse(JSON.stringify(deals));
    
    const projected = calculateSingleScenario(investors, dealsCopy1, true);
    const valuation = calculateSingleScenario(investors, dealsCopy2, false);

    const maxTimeline = Math.max(
        0,
        ...deals.map(d => d.timelineYears)
    );
    
    const cumulativeReturnChartData: any[] = [];
    let cumulativeProjected = 0;
    let cumulativeValuation = 0;
    
    const valuationHasData = deals.some(d => d.actualAnnualReturns.some(r => r !== null && r !== undefined));

    for (let year = 1; year <= maxTimeline; year++) {
        const projYearData = projected.yearlyBreakdown.find(y => y.year === year);
        const valYearData = valuation.yearlyBreakdown.find(y => y.year === year);
        
        cumulativeProjected += projYearData?.lpDistributions || 0;
        cumulativeValuation += valYearData?.lpDistributions || 0;

        cumulativeReturnChartData.push({
            year,
            projected: cumulativeProjected,
            valuation: valuationHasData ? cumulativeValuation : null,
        });
    }

    projected.cumulativeReturnChartData = cumulativeReturnChartData;
    valuation.cumulativeReturnChartData = cumulativeReturnChartData;

    return { projected, valuation };
};
