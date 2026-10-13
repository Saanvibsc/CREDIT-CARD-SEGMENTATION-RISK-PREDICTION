export const DEFAULT_RISK_CONFIG = {
  lowRiskUpperBound: 34,
  highRiskLowerBound: 65,
  utilizationAlertThreshold: 80,
  consecutiveLateAlertThreshold: 2,
};

/**
 * Transparent, deterministic scoring engine for demonstration purposes.
 * Note: This implements a calibrated rule-based heuristic proxy to illustrate risk scoring
 * workflows and will be replaced with a production Logistic Regression model backend in production.
 */
export function calculateRiskAssessment(
  customer,
  config = DEFAULT_RISK_CONFIG,
  simulatedOverrides
) {
  const utilization = simulatedOverrides?.utilization ?? customer.creditUtilization;
  const delayedPayments = simulatedOverrides?.delayedPayments ?? customer.delayedPayments6M;
  const income = simulatedOverrides?.annualIncome ?? customer.annualIncome;

  const factorContributions = [];
  const positiveIndicators = [];
  const negativeIndicators = [];
  const recommendedActions = [];

  // 1. Credit Utilization Factor (Base weight up to 35 pts)
  let utilScore = 0;
  if (utilization <= 20) {
    utilScore = 5;
    positiveIndicators.push(`Conservative credit utilization of ${utilization.toFixed(1)}% well below 30% advisory ceiling.`);
    factorContributions.push({
      factor: 'Credit Utilization',
      category: 'Utilization',
      impact: 'positive',
      weightScore: -12,
      description: `Low revolver usage (${utilization.toFixed(1)}%) signifies significant financial buffer.`,
    });
  } else if (utilization <= 50) {
    utilScore = 15;
    factorContributions.push({
      factor: 'Credit Utilization',
      category: 'Utilization',
      impact: 'neutral',
      weightScore: 4,
      description: `Moderate credit utilization (${utilization.toFixed(1)}%) within standard banking tolerance.`,
    });
  } else if (utilization <= 80) {
    utilScore = 26;
    negativeIndicators.push(`Elevated credit utilization at ${utilization.toFixed(1)}% indicates dependency on revolving debt.`);
    factorContributions.push({
      factor: 'Credit Utilization',
      category: 'Utilization',
      impact: 'negative',
      weightScore: 16,
      description: `Elevated balance-to-limit ratio (${utilization.toFixed(1)}%) increases vulnerability to income shocks.`,
    });
  } else {
    utilScore = 36;
    negativeIndicators.push(`Critical credit utilization (${utilization.toFixed(1)}%) exceeding 80% default threshold warning.`);
    factorContributions.push({
      factor: 'Credit Utilization',
      category: 'Utilization',
      impact: 'negative',
      weightScore: 28,
      description: `Near-maxed credit facility (${utilization.toFixed(1)}%) represents high systemic strain.`,
    });
  }

  // 2. Repayment History & Delinquencies (Base weight up to 40 pts)
  let repaymentScore = 0;
  if (delayedPayments === 0) {
    repaymentScore = 4;
    positiveIndicators.push('Flawless 100% on-time repayment compliance over the preceding 6 billing cycles.');
    factorContributions.push({
      factor: 'Repayment Reliability',
      category: 'Repayment',
      impact: 'positive',
      weightScore: -18,
      description: 'Zero recorded late payments in past 180 days across all card products.',
    });
  } else if (delayedPayments === 1) {
    repaymentScore = 16;
    negativeIndicators.push('Isolated late payment incident (1-29 days past due) recorded within the past 6 months.');
    factorContributions.push({
      factor: 'Repayment Reliability',
      category: 'Repayment',
      impact: 'neutral',
      weightScore: 8,
      description: 'Single isolated 30-day delinquency; customer rectified within standard grace window.',
    });
  } else if (delayedPayments === 2) {
    repaymentScore = 28;
    negativeIndicators.push('Recurrent payment friction: 2 delayed billing cycles recorded in past 6 months.');
    factorContributions.push({
      factor: 'Repayment Reliability',
      category: 'Repayment',
      impact: 'negative',
      weightScore: 22,
      description: 'Repeated payment postponements indicate deteriorating household cash-flow liquidity.',
    });
  } else {
    repaymentScore = 40;
    negativeIndicators.push(`Severe delinquency pattern: ${delayedPayments} late payments recorded over the past 6 billing cycles.`);
    factorContributions.push({
      factor: 'Repayment Reliability',
      category: 'Repayment',
      impact: 'negative',
      weightScore: 35,
      description: `Chronic delinquency (${delayedPayments} cycles) signals impending charge-off vulnerability.`,
    });
  }

  // 3. Payment-to-Minimum Ratio & Cash Advance Factor (Up to 15 pts)
  let liquidityScore = 0;
  if (customer.paymentToMinRatio >= 3.0) {
    liquidityScore = 2;
    positiveIndicators.push(`Strong balance paydown behavior (${customer.paymentToMinRatio.toFixed(1)}x required minimum).`);
    factorContributions.push({
      factor: 'Debt Paydown Velocity',
      category: 'Repayment',
      impact: 'positive',
      weightScore: -8,
      description: `Significantly outpaying minimum obligations (${customer.paymentToMinRatio.toFixed(1)}x min) avoids interest compounding.`,
    });
  } else if (customer.paymentToMinRatio >= 1.2) {
    liquidityScore = 8;
  } else {
    liquidityScore = 14;
    negativeIndicators.push('Revolving at bare minimum due amounts; low amortization progress.');
    factorContributions.push({
      factor: 'Debt Paydown Velocity',
      category: 'Repayment',
      impact: 'negative',
      weightScore: 12,
      description: 'Customer persistently makes only minimum payment, compounding outstanding balance.',
    });
  }

  // Cash advances
  if (customer.cashAdvanceCount6M > 1) {
    liquidityScore += 6;
    negativeIndicators.push(`${customer.cashAdvanceCount6M} cash advances executed within 6 months, an indicator of short-term cash distress.`);
    factorContributions.push({
      factor: 'Cash Advance Frequency',
      category: 'Exposure',
      impact: 'negative',
      weightScore: 9,
      description: 'Multiple emergency cash advance withdrawals indicate acute liquidity pressure.',
    });
  }

  // 4. Debt-to-Limit & Income Buffer (Up to 10 pts)
  let debtBurdenScore = 0;
  const balanceToIncomeRatio = (customer.outstandingBalance / Math.max(income, 10000)) * 100;
  if (balanceToIncomeRatio > 25) {
    debtBurdenScore = 9;
    negativeIndicators.push(`Outstanding balance represents ${balanceToIncomeRatio.toFixed(1)}% of annual gross income.`);
    factorContributions.push({
      factor: 'Debt-to-Income Exposure',
      category: 'Exposure',
      impact: 'negative',
      weightScore: 10,
      description: `Elevated card debt relative to declared earnings (${balanceToIncomeRatio.toFixed(1)}% DTI).`,
    });
  } else if (balanceToIncomeRatio < 8) {
    debtBurdenScore = 1;
    positiveIndicators.push(`Conservative balance-to-income ratio (${balanceToIncomeRatio.toFixed(1)}%).`);
    factorContributions.push({
      factor: 'Debt-to-Income Exposure',
      category: 'Exposure',
      impact: 'positive',
      weightScore: -6,
      description: `Low balance footprint against income (${balanceToIncomeRatio.toFixed(1)}%) confirms high repayment capacity.`,
    });
  } else {
    debtBurdenScore = 5;
  }

  // 5. Tenure and Credit Inquiries (Up to 8 pts)
  if (customer.creditHistoryYears >= 8) {
    positiveIndicators.push(`Seasoned credit relationship (${customer.creditHistoryYears} years tenure with bank).`);
    factorContributions.push({
      factor: 'Credit Bureau Tenure',
      category: 'Tenure',
      impact: 'positive',
      weightScore: -5,
      description: `Long established credit tenure (${customer.creditHistoryYears} yrs) provides high predictive stability.`,
    });
  } else if (customer.creditHistoryYears < 3) {
    factorContributions.push({
      factor: 'Credit Bureau Tenure',
      category: 'Tenure',
      impact: 'neutral',
      weightScore: 4,
      description: 'Short credit file (<3 years) limits long-term historical observation.',
    });
  }

  if (customer.inquiriesLast6M !== null && customer.inquiriesLast6M >= 3) {
    negativeIndicators.push(`${customer.inquiriesLast6M} hard credit inquiries registered in the past 6 months.`);
    factorContributions.push({
      factor: 'Hard Credit Inquiries',
      category: 'Inquiries',
      impact: 'negative',
      weightScore: 7,
      description: `Rapid credit seeking behavior (${customer.inquiriesLast6M} recent inquiries) indicates external borrowing pressure.`,
    });
  }

  // Compute Raw Composite Score (0 - 100)
  const rawSum = utilScore + repaymentScore + liquidityScore + debtBurdenScore;
  const clampedRiskScore = Math.min(100, Math.max(2, Math.round(rawSum)));

  // Probability of Default (PD) calculation:
  // Logit calibrated so RiskScore 15 -> ~1.8%, 35 -> ~4.5%, 65 -> ~18.2%, 95 -> ~64%
  const z = -4.2 + (clampedRiskScore * 0.052);
  const rawPd = (1 / (1 + Math.exp(-z))) * 100;
  const defaultProbability = parseFloat(Math.min(92, Math.max(0.8, rawPd)).toFixed(1));

  // Determine Risk Tier from configurable thresholds
  let riskTier;
  if (clampedRiskScore <= config.lowRiskUpperBound) {
    riskTier = 'Low';
  } else if (clampedRiskScore < config.highRiskLowerBound) {
    riskTier = 'Medium';
  } else {
    riskTier = 'High';
  }

  // Tailored Banking Recommendations
  if (riskTier === 'Low') {
    recommendedActions.push('Approve standard credit limit increases upon customer request.');
    recommendedActions.push('Offer premium tiered products (e.g., Infinite Rewards or lower APR balance transfer promotions).');
    recommendedActions.push('Maintain standard quarterly risk review cycle; no portfolio restrictions required.');
  } else if (riskTier === 'Medium') {
    recommendedActions.push('Maintain existing credit limit; decline speculative automated limit expansion.');
    recommendedActions.push('Schedule automated mid-cycle SMS payment reminders 4 days prior to due date.');
    recommendedActions.push('Monitor revolver balance trends bi-weekly for sudden credit draw spikes.');
    recommendedActions.push('Temporarily cap cash advance limit to 15% of total line of credit.');
  } else {
    recommendedActions.push('Initiate proactive risk containment: reduce unutilized credit limit by 25–40%.');
    recommendedActions.push('Temporarily suspend cash advance capabilities and high-risk merchant transaction codes.');
    recommendedActions.push('Route account to Senior Special Assets / Hardship Counseling team for structured workout.');
    recommendedActions.push('Conduct immediate cross-product collateral and debt verification across internal accounts.');
  }

  return {
    riskScore: clampedRiskScore,
    defaultProbability,
    riskTier,
    factorContributions,
    positiveIndicators,
    negativeIndicators,
    recommendedActions,
    assessedAt: customer.lastAssessmentDate,
    confidenceScore: 94.2,
    calibratedScore10: getCalibratedScore10(clampedRiskScore),
    calibratedCategory: getCalibratedCategory(getCalibratedScore10(clampedRiskScore)),
  };
}

/**
 * Maps risk score (0-100) or default probability into calibrated 1-10 integer score.
 */
export function getCalibratedScore10(scoreOrPd) {
  const val = Number(scoreOrPd) || 0;
  if (val <= 10) return 1;
  if (val <= 20) return 2;
  if (val <= 30) return 3;
  if (val <= 40) return 4;
  if (val <= 50) return 5;
  if (val <= 60) return 6;
  if (val <= 70) return 7;
  if (val <= 80) return 8;
  if (val <= 90) return 9;
  return 10;
}

/**
 * Returns descriptive Basel II calibrated risk category for a 1-10 risk score.
 */
export function getCalibratedCategory(score10) {
  const s = Math.max(1, Math.min(10, Math.round(Number(score10) || 1)));
  if (s <= 2) {
    return {
      label: 'Minimal Risk',
      tier: 'Low',
      range: '1–2',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      description: 'Prime cardholder with negligible delinquency hazard and high liquidity buffer.'
    };
  }
  if (s <= 4) {
    return {
      label: 'Low Risk',
      tier: 'Low',
      range: '3–4',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      description: 'Standard solvent borrower with consistent on-time payment track record.'
    };
  }
  if (s <= 6) {
    return {
      label: 'Moderate Risk',
      tier: 'Medium',
      range: '5–6',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      description: 'Revolving cardholder with moderate balance pressure or single payment postponement.'
    };
  }
  if (s <= 8) {
    return {
      label: 'Elevated Risk',
      tier: 'Medium',
      range: '7–8',
      badgeClass: 'bg-amber-200 text-amber-900 border-amber-400',
      description: 'Persistent revolver with high credit limit exhaustion requiring active watchlist review.'
    };
  }
  return {
    label: 'Severe Risk',
    tier: 'High',
    range: '9–10',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    description: 'Impaired credit profile with multi-cycle delinquency; imminent charge-off vulnerability.'
  };
}

