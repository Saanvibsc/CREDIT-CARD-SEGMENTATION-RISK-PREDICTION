export type RiskTier = 'Low' | 'Medium' | 'High';

export type AlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type AlertStatus = 'New' | 'Under Review' | 'Resolved';

export type CustomerSegment = string;

export interface MonthlyRepaymentRecord {
  month: string;
  status: 'on-time' | 'late-1-29d' | 'late-30-59d' | 'late-60d+';
  daysDelayed: number | null;
  paymentAmount: number;
  minPaymentDue: number;
  balance: number;
}

export interface RiskFactorItem {
  factor: string;
  category: 'Repayment' | 'Exposure' | 'Utilization' | 'Tenure' | 'Inquiries';
  impact: 'positive' | 'negative' | 'neutral';
  weightScore: number; // e.g. -15 to +25
  description: string;
}

export interface ComputedRiskAssessment {
  riskScore: number; // 0 (lowest) to 100 (highest)
  defaultProbability: number; // e.g. 2.4% to 68.9%
  riskTier: RiskTier;
  factorContributions: RiskFactorItem[];
  positiveIndicators: string[];
  negativeIndicators: string[];
  recommendedActions: string[];
  assessedAt: string;
  confidenceScore: number | null;
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
  creditUtilization: number; // 0 to 100
  repaymentHistory: MonthlyRepaymentRecord[]; // 6 months
  delayedPayments6M: number;
  paymentToMinRatio: number; // average ratio paid / minimum
  cashAdvanceCount6M: number;
  monthlyAverageSpend: number;
  creditHistoryYears: number;
  inquiriesLast6M: number | null;
  segment: CustomerSegment;
  joinedDate: string;
  lastAssessmentDate: string;
}

export interface EarlyWarningAlert {
  id: string;
  customerId: string;
  customerName: string;
  triggerReason: string;
  triggerCategory: 'High Utilization' | 'Late Payments' | 'Large Balance' | 'Repayment Trend' | 'Cash Advance Spike';
  severity: AlertSeverity;
  status: AlertStatus;
  detectedDate: string;
  metricValue: string;
  suggestedAction: string;
  reviewedBy?: string;
  reviewedDate?: string;
}

export interface PortfolioSummary {
  totalCustomers: number;
  overallDefaultRate: number; // percentage
  highRiskPercentage: number;
  mediumRiskPercentage: number;
  lowRiskPercentage: number;
  totalCreditExposure: number;
  totalCreditLimit: number;
  averageUtilization: number;
  criticalAlertsCount: number;
}

export interface RiskConfig {
  lowRiskUpperBound: number; // default 35
  highRiskLowerBound: number; // default 65
  utilizationAlertThreshold: number; // default 80%
  consecutiveLateAlertThreshold: number; // default 2
}

export type DataSourceType = 'demo-proxy' | 'live-ml-backend';

export interface ApiConfig {
  mode: 'mock' | 'live';
  baseUrl: string;
  timeoutMs: number;
  connectionStatus: 'connected' | 'fallback' | 'checking' | 'offline';
  lastPing?: string;
  latencyMs?: number;
}

export interface PredictionResponse {
  assessment: ComputedRiskAssessment;
  source: DataSourceType;
  latencyMs: number;
  modelMeta: {
    engine: string;
    version: string;
    algorithm: string;
    calibrated: boolean;
  };
}

export interface PortfolioSummaryResponse {
  summary: PortfolioSummary;
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

export interface EndpointContract {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  description: string;
  requestBodySchema?: string;
  responseSchema: string;
}

export interface TestPredictionItem {
  customerId: string;
  fullName: string;
  creditLimit: number;
  outstandingBalance: number;
  utilizationPct: number;
  latePayments6M: number;
  actualDefault: number;
  predictedProbability: number;
  predictedClass: number;
  riskScore: number;
  riskTier: RiskTier;
  predictionOutcome: 'True Positive' | 'True Negative' | 'False Positive' | 'False Negative';
  brierResidual: number;
  confidence: number;
}

export interface ValidationModelComparisonItem {
  model_name: string;
  model_type: string;
  roc_auc: number;
  gini_coefficient: number;
  ks_statistic_pct: number;
  brier_score: number;
  precision: number;
  recall: number;
  f1_score: number;
  accuracy_pct: number;
  fpr_at_90_recall: number;
  inference_latency_ms: number;
  status: string;
  description: string;
}

export interface ModelPipelineSpec {
  model_name: string;
  version: string;
  algorithm: string;
  calibrated: boolean;
  feature_names_in_: string[];
  hyperparameters: Record<string, string | number | boolean>;
  feature_importances_: Record<string, number>;
  metrics: {
    roc_auc: number;
    ks_stat: number;
    brier_score: number;
  };
}
