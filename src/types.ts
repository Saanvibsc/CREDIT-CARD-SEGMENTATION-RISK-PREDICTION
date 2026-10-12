/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NavPage =
  | 'customer-dashboard'
  | 'segment-dashboard'
  | 'dashboard'
  | 'search'
  | 'assessment'
  | 'alerts'
  | 'segmentation'
  | 'reports'
  | 'upload-report';

export type RiskTier = 'Low' | 'Medium' | 'High';

export type AlertSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type AlertStatus = 'New' | 'Under Review' | 'Resolved';

export type DataSourceType = 'demo-proxy' | 'live-ml-backend' | string;

export type CustomerSegment =
  | 'Prime Transactors'
  | 'Revolving Balances'
  | 'High-Risk Revolvers'
  | 'Low-Activity Cardholders'
  | 'Near-Prime Emerging'
  | string;

export interface RepaymentRecord {
  month: string;
  status: 'on-time' | 'late' | string;
  daysDelayed: number | null;
  paymentAmount: number;
  minPaymentDue: number;
  balance: number;
}

export interface Customer {
  id: string;
  fullName: string;
  email: string;
  age: number;
  employmentStatus: string;
  employerCategory: string;
  annualIncome: number;
  cardType: string;
  creditLimit: number;
  outstandingBalance: number;
  creditUtilization: number;
  repaymentHistory: RepaymentRecord[];
  delayedPayments6M: number;
  paymentToMinRatio: number;
  cashAdvanceCount6M: number;
  monthlyAverageSpend: number;
  creditHistoryYears: number;
  inquiriesLast6M: number | null;
  segment: CustomerSegment;
  joinedDate: string;
  lastAssessmentDate: string;
}

export interface RiskConfig {
  lowRiskUpperBound: number;
  highRiskLowerBound: number;
  utilizationAlertThreshold: number;
  consecutiveLateAlertThreshold: number;
}

export interface FactorContribution {
  factor: string;
  category: string;
  impact: 'positive' | 'neutral' | 'negative';
  weightScore: number;
  description: string;
}

export interface ComputedRiskAssessment {
  riskScore: number;
  defaultProbability: number;
  riskTier: RiskTier;
  factorContributions: FactorContribution[];
  positiveIndicators: string[];
  negativeIndicators: string[];
  recommendedActions: string[];
  assessedAt: string;
  confidenceScore: number;
}

export interface PredictionResponse {
  assessment: ComputedRiskAssessment;
  source: DataSourceType;
  latencyMs?: number;
  modelMeta?: {
    engine: string;
    version: string;
    algorithm: string;
    calibrated: boolean;
  };
}

export interface EarlyWarningAlert {
  id: string;
  customerId: string;
  customerName?: string;
  triggerReason: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggerDate?: string;
  detectedDate?: string;
  metricValue?: string;
  suggestedAction?: string;
  reviewedBy?: string;
  reviewedDate?: string;
  metricsSnapshot?: {
    utilization?: number;
    latePayments?: number;
    cashAdvances?: number;
  };
}

export interface PortfolioSummaryResponse {
  summary: {
    totalCustomers: number;
    overallDefaultRate: number;
    highRiskPercentage: number;
    mediumRiskPercentage: number;
    lowRiskPercentage: number;
    totalCreditExposure: number;
    totalCreditLimit: number;
    averageUtilization: number;
    criticalAlertsCount: number;
  };
  tierBreakdown: {
    lowCount: number;
    medCount: number;
    highCount: number;
    lowExposure: number;
    lowLimit: number;
    medExposure: number;
    medLimit: number;
    highExposure: number;
    highLimit: number;
  };
  source: DataSourceType;
}
