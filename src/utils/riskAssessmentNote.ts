import { ComputedRiskAssessment, Customer } from '../types';

export interface RiskNoteProfile {
  utilization: number;
  latePayments: number;
  annualIncome: number;
}

export function generateLocalRiskNote(
  customer: Customer,
  assessment: ComputedRiskAssessment,
  profile: RiskNoteProfile,
): string {
  const segment = customer.segment ? ` in the ${customer.segment} segment` : '';
  const strongestSignal = assessment.factorContributions
    .filter((factor) => factor.impact === 'negative' || factor.impact === 'positive')
    .sort((left, right) => Math.abs(right.weightScore) - Math.abs(left.weightScore))[0];
  const signalText = strongestSignal
    ? `The strongest model signal is ${strongestSignal.factor.toLowerCase()}: ${strongestSignal.description}`
    : 'The model did not return a single dominant risk factor.';
  const action = assessment.recommendedActions[0];
  const actionText = action ? ` Suggested follow-up: ${action}` : '';

  return `${customer.fullName}${segment} has a ${assessment.riskTier.toLowerCase()}-risk assessment (score ${assessment.riskScore}/100; estimated default probability ${assessment.defaultProbability.toFixed(1)}%). The profile reports ${profile.utilization.toFixed(1)}% credit utilization, ${profile.latePayments} late payment${profile.latePayments === 1 ? '' : 's'} in six months, and annual income of $${Math.round(profile.annualIncome).toLocaleString('en-US')}. ${signalText}${actionText}`;
}
