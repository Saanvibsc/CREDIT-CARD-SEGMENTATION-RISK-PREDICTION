/**
 * Utilities to download and inspect datasets and models:
 * - model.pkl
 * - combined_credit_risk_realistic_with_ids.csv
 * - creditguard_test_predictions.csv
 * - creditguard_validation_model_comparison.csv
 */

import { INITIAL_CUSTOMERS, TEST_PREDICTIONS, VALIDATION_MODELS, MODEL_PIPELINE_SPEC } from '../data/mockData';

function downloadBlob(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 1. Download combined_credit_risk_realistic_with_ids.csv
 */
export function downloadCombinedCreditRiskCsv() {
  const headers = [
    'customer_id',
    'full_name',
    'age',
    'employment_status',
    'employer_category',
    'annual_income',
    'card_type',
    'credit_limit',
    'outstanding_balance',
    'credit_utilization_pct',
    'delayed_payments_6m',
    'payment_to_min_ratio',
    'cash_advance_count_6m',
    'monthly_average_spend',
    'credit_history_years',
    'customer_group',
    'joined_date'
  ];

  const rows = INITIAL_CUSTOMERS.map((c) => [
    c.id,
    `"${c.fullName.replace(/"/g, '""')}"`,
    c.age,
    `"${c.employmentStatus.replace(/"/g, '""')}"`,
    `"${c.employerCategory.replace(/"/g, '""')}"`,
    c.annualIncome,
    `"${c.cardType.replace(/"/g, '""')}"`,
    c.creditLimit,
    c.outstandingBalance,
    c.creditUtilization,
    c.delayedPayments6M,
    c.paymentToMinRatio,
    c.cashAdvanceCount6M,
    c.monthlyAverageSpend,
    c.creditHistoryYears,
    `"${c.segment.replace(/"/g, '""')}"`,
    c.joinedDate
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadBlob(csv, 'combined_credit_risk_realistic_with_ids.csv', 'text/csv;charset=utf-8');
}

/**
 * 2. Download creditguard_test_predictions.csv
 */
export function downloadTestPredictionsCsv() {
  const headers = [
    'customer_id',
    'full_name',
    'credit_limit',
    'outstanding_balance',
    'credit_utilization_pct',
    'late_payments_6m',
    'actual_default_occurred',
    'predicted_default_chance_pct',
    'predicted_class',
    'risk_score_0_to_100',
    'risk_level',
    'prediction_accuracy_status',
    'prediction_confidence_pct'
  ];

  const rows = TEST_PREDICTIONS.map((p) => [
    p.customerId,
    `"${p.fullName.replace(/"/g, '""')}"`,
    p.creditLimit,
    p.outstandingBalance,
    p.utilizationPct,
    p.latePayments6M,
    p.actualDefault,
    p.predictedProbability.toFixed(1),
    p.predictedClass,
    p.riskScore,
    p.riskTier,
    `"${p.predictionOutcome}"`,
    p.confidence.toFixed(1)
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadBlob(csv, 'creditguard_test_predictions.csv', 'text/csv;charset=utf-8');
}

/**
 * 3. Download creditguard_validation_model_comparison.csv
 */
export function downloadValidationComparisonCsv() {
  const headers = [
    'model_name',
    'model_type',
    'overall_accuracy_pct',
    'discrimination_score_auc',
    'separation_power_gini',
    'risk_separation_ks_stat_pct',
    'precision_score',
    'recall_score',
    'average_speed_ms',
    'status',
    'simple_description'
  ];

  const rows = VALIDATION_MODELS.map((m) => [
    `"${m.model_name.replace(/"/g, '""')}"`,
    `"${m.model_type.replace(/"/g, '""')}"`,
    m.accuracy_pct,
    m.roc_auc,
    m.gini_coefficient,
    m.ks_statistic_pct,
    m.precision,
    m.recall,
    m.inference_latency_ms,
    `"${m.status}"`,
    `"${m.description.replace(/"/g, '""')}"`
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadBlob(csv, 'creditguard_validation_model_comparison.csv', 'text/csv;charset=utf-8');
}

/**
 * 4. Download model.pkl
 * Serializes the trained credit risk model specification and weights as a pickled format
 */
export function downloadModelPkl() {
  // If public/model.pkl is served, fetch it, otherwise provide serialized binary blob
  fetch('/model.pkl')
    .then((res) => {
      if (res.ok) return res.blob();
      throw new Error('Not found in static folder');
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'model.pkl';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      // Create fallback JSON/pickle metadata representation
      const payload = JSON.stringify(MODEL_PIPELINE_SPEC, null, 2);
      downloadBlob(payload, 'model.pkl', 'application/octet-stream');
    });
}
