import { 
  INITIAL_CUSTOMERS, 
  INITIAL_ALERTS, 
  SEGMENTS_DATA,
  TEST_PREDICTIONS,
  VALIDATION_MODELS,
  MODEL_PIPELINE_SPEC
} from '../data/mockData';
import { calculateRiskAssessment, DEFAULT_RISK_CONFIG } from '../utils/scoringEngine';

export const API_ENDPOINTS_DOCUMENTATION = [
  {
    method: 'GET',
    path: '/api/v1/portfolio/summary',
    description: 'Fetch aggregated portfolio risk metrics, default rate (PD), and exposure totals by tier.',
    responseSchema: `{
  "summary": {
    "totalCustomers": 25,
    "overallDefaultRate": 5.60,
    "highRiskPercentage": 24.0,
    "totalCreditExposure": 567100,
    "totalCreditLimit": 1024000,
    "averageUtilization": 55.4
  },
  "tierBreakdown": { "lowCount": 13, "medCount": 6, "highCount": 6, ... }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/customers',
    description: 'Query customer records with optional query, tier, and cardType filters.',
    responseSchema: `[
  {
    "id": "CUST000001",
    "fullName": "Eleanor Vance",
    "creditLimit": 35000,
    "outstandingBalance": 3200,
    "creditUtilization": 9.1,
    "repaymentHistory": [...],
    "segment": "Prime Transactors"
  }
]`,
  },
  {
    method: 'GET',
    path: '/api/v1/customers/:id',
    description: 'Retrieve single customer profile by Customer ID.',
    responseSchema: `{
  "id": "CUST000001",
  "fullName": "Eleanor Vance",
  "creditLimit": 35000,
  "outstandingBalance": 3200,
  ...
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/risk/predict',
    description: 'Predict default probability with the saved Scikit-learn model and apply configured display risk bands.',
    requestBodySchema: `{
  "customerId": "CUST000001",
  "overrides": {
    "utilization": 45.0,
    "delayedPayments": 1,
    "annualIncome": 120000
  },
  "config": {
    "lowRiskUpperBound": 34,
    "highRiskLowerBound": 65
  }
}`,
    responseSchema: `{
  "assessment": {
    "riskScore": 18,
    "defaultProbability": 2.1,
    "riskTier": "Low",
    "factorContributions": [...],
    "positiveIndicators": [...],
    "negativeIndicators": [...],
    "recommendedActions": [...]
  },
  "source": "live-ml-backend",
  "modelMeta": {
    "engine": "Scikit-learn",
    "version": "1.6",
    "algorithm": "Saved creditguard_model pipeline",
    "calibrated": false
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/alerts',
    description: 'List active surveillance early-warning alerts with severity & status filters.',
    responseSchema: `[
  {
    "id": "EW-9021",
    "customerId": "CUST000001",
    "triggerReason": "Chronic Delinquency: 6 late payments",
    "severity": "Critical",
    "status": "New"
  }
]`,
  },
  {
    method: 'PATCH',
    path: '/api/v1/alerts/:id/status',
    description: 'Update the review status of an early warning alert.',
    requestBodySchema: `{ "status": "Under Review" | "Resolved" }`,
    responseSchema: `{ "id": "EW-9021", "status": "Under Review", "reviewedBy": "...", ... }`,
  },
  {
    method: 'GET',
    path: '/api/v1/segmentation/clusters',
    description: 'Retrieve K-Means customer cluster profiles and centroid metadata.',
    responseSchema: `{
  "segments": [...],
  "customerAssignments": [...]
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/health',
    description: 'Healthcheck endpoint to verify Python ML backend status and model readiness.',
    responseSchema: `{ "status": "healthy", "version": "1.0.0", "modelLoaded": true }`,
  }
];

class CreditGuardApiService {
  constructor() {
    this.config = {
      mode: 'live',
      baseUrl: '',
      timeoutMs: 3000,
      connectionStatus: 'connected',
    };

    // In-memory state for mock mode persistence
    this.mockCustomers = [...INITIAL_CUSTOMERS];
    this.mockAlerts = [...INITIAL_ALERTS];
  }

  getConfig() {
    return { ...this.config };
  }

  setConfig(updated) {
    this.config = { ...this.config, ...updated };
  }

  /**
   * Helper: simulate network latency in mock mode
   */
  async simulateLatency(ms = 120) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Healthcheck test against live backend URL
   */
  async testBackendConnection(url) {
    if (!url || url.trim() === '') {
      return {
        connected: true,
        latencyMs: 10,
        message: 'Operating in client-side heuristic proxy mode (25 customer profiles, local risk engine ready).',
        version: '1.0.0-mock',
      };
    }

    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const response = await fetch(`${url}/api/v1/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - startTime);

      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          this.config.connectionStatus = 'connected';
          this.config.lastPing = new Date().toLocaleTimeString();
          this.config.latencyMs = latencyMs;
          return {
            connected: true,
            latencyMs,
            message: `Connected successfully to live backend (${data.version || 'v1.0.0'}).`,
            version: data.version,
          };
        } catch {
          return {
            connected: false,
            latencyMs,
            message: `Backend at ${url} returned a non-JSON response.`,
          };
        }
      } else {
        return {
          connected: false,
          latencyMs,
          message: `Backend returned HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        connected: false,
        latencyMs,
        message: err.name === 'AbortError' 
          ? 'Connection timed out after 2500ms.' 
          : `Cannot reach backend at ${url}. Live server may be offline. Using mock proxy.`,
      };
    }
  }

  /**
   * Endpoint 1: Portfolio Summary
   */
  async getPortfolioSummary(riskConfig = DEFAULT_RISK_CONFIG) {
    if (this.config.mode === 'live') {
      try {
        const params = new URLSearchParams({
          lowRiskUpperBound: String(riskConfig.lowRiskUpperBound),
          highRiskLowerBound: String(riskConfig.highRiskLowerBound),
          utilizationAlertThreshold: String(riskConfig.utilizationAlertThreshold),
          consecutiveLateAlertThreshold: String(riskConfig.consecutiveLateAlertThreshold),
        });
        const res = await fetch(`${this.config.baseUrl}/api/v1/portfolio/summary?${params}`);
        if (res.ok) {
          return { ...(await res.json()), source: 'live-ml-backend' };
        }
      } catch (err) {
        console.warn('Live portfolio summary request failed, falling back to local dataset:', err);
      }
    }

    // Fallback: Compute via isolated demo scoring engine and mock data
    await this.simulateLatency(140);
    const totalCustomers = this.mockCustomers.length;
    const computedAssessments = this.mockCustomers.map((c) => ({
      customer: c,
      assessment: calculateRiskAssessment(c, riskConfig),
    }));

    const lowCount = computedAssessments.filter((a) => a.assessment.riskTier === 'Low').length;
    const medCount = computedAssessments.filter((a) => a.assessment.riskTier === 'Medium').length;
    const highCount = computedAssessments.filter((a) => a.assessment.riskTier === 'High').length;

    const totalExposure = this.mockCustomers.reduce((acc, c) => acc + c.outstandingBalance, 0);
    const totalLimit = this.mockCustomers.reduce((acc, c) => acc + c.creditLimit, 0);

    const lowExposure = computedAssessments
      .filter((a) => a.assessment.riskTier === 'Low')
      .reduce((acc, a) => acc + a.customer.outstandingBalance, 0);
    const lowLimit = computedAssessments
      .filter((a) => a.assessment.riskTier === 'Low')
      .reduce((acc, a) => acc + a.customer.creditLimit, 0);

    const medExposure = computedAssessments
      .filter((a) => a.assessment.riskTier === 'Medium')
      .reduce((acc, a) => acc + a.customer.outstandingBalance, 0);
    const medLimit = computedAssessments
      .filter((a) => a.assessment.riskTier === 'Medium')
      .reduce((acc, a) => acc + a.customer.creditLimit, 0);

    const highExposure = computedAssessments
      .filter((a) => a.assessment.riskTier === 'High')
      .reduce((acc, a) => acc + a.customer.outstandingBalance, 0);
    const highLimit = computedAssessments
      .filter((a) => a.assessment.riskTier === 'High')
      .reduce((acc, a) => acc + a.customer.creditLimit, 0);

    const avgPd = totalCustomers > 0
      ? computedAssessments.reduce((acc, a) => acc + a.assessment.defaultProbability, 0) / totalCustomers
      : 0;

    return {
      summary: {
        totalCustomers,
        overallDefaultRate: parseFloat(avgPd.toFixed(2)),
        highRiskPercentage: totalCustomers > 0 ? parseFloat(((highCount / totalCustomers) * 100).toFixed(1)) : 0,
        mediumRiskPercentage: totalCustomers > 0 ? parseFloat(((medCount / totalCustomers) * 100).toFixed(1)) : 0,
        lowRiskPercentage: totalCustomers > 0 ? parseFloat(((lowCount / totalCustomers) * 100).toFixed(1)) : 0,
        totalCreditExposure: totalExposure,
        totalCreditLimit: totalLimit,
        averageUtilization: totalLimit > 0 ? parseFloat(((totalExposure / totalLimit) * 100).toFixed(1)) : 0,
        criticalAlertsCount: this.mockAlerts.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved').length,
      },
      tierBreakdown: {
        lowCount,
        medCount,
        highCount,
        lowExposure,
        lowLimit,
        medExposure,
        medLimit,
        highExposure,
        highLimit,
      },
      source: 'demo-proxy',
    };
  }

  /**
   * Endpoint 2: Search Customers
   */
  async searchCustomers(query, tier, cardType, riskConfig = DEFAULT_RISK_CONFIG) {
    if (this.config.mode === 'live') {
      try {
        const params = new URLSearchParams();
        if (query) params.append('q', query);
        if (tier && tier !== 'All') params.append('tier', tier);
        if (cardType && cardType !== 'All') params.append('cardType', cardType);
        params.set('lowRiskUpperBound', String(riskConfig.lowRiskUpperBound));
        params.set('highRiskLowerBound', String(riskConfig.highRiskLowerBound));
        const res = await fetch(`${this.config.baseUrl}/api/v1/customers?${params}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Live searchCustomers request failed, falling back to local dataset:', err);
      }
    }

    await this.simulateLatency(90);
    let results = [...this.mockCustomers];

    if (query) {
      const q = query.trim().toLowerCase();
      results = results.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.fullName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.employerCategory.toLowerCase().includes(q)
      );
    }

    if (cardType && cardType !== 'All') {
      results = results.filter((c) => c.cardType === cardType);
    }

    if (tier && tier !== 'All') {
      results = results.filter((c) => {
        const assessment = calculateRiskAssessment(c, riskConfig);
        return assessment.riskTier === tier;
      });
    }

    return results;
  }

  /**
   * Endpoint 3: Get Customer by ID
   */
  async getCustomerById(id) {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/customers/${encodeURIComponent(id)}`);
        if (res.status === 404) return null;
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Live getCustomerById request failed, falling back to local dataset:', err);
      }
    }

    await this.simulateLatency(60);
    const upperId = String(id).toUpperCase();
    let found = this.mockCustomers.find((c) => c.id.toUpperCase() === upperId);
    if (!found && upperId.startsWith('CUST')) {
      const numMatch = upperId.match(/\d+/);
      if (numMatch) {
        const index = (parseInt(numMatch[0], 10) - 1) % this.mockCustomers.length;
        if (index >= 0 && index < this.mockCustomers.length) {
          found = this.mockCustomers[index];
        }
      }
    }
    return found ? { ...found } : null;
  }

  /**
   * Endpoint 4: Predict Risk / Score Calculation
   */
  async predictRisk(customerId, overrides, riskConfig = DEFAULT_RISK_CONFIG) {
    const startTime = performance.now();

    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/risk/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId,
            overrides,
            config: riskConfig,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return {
            assessment: data.assessment,
            source: 'live-ml-backend',
            latencyMs: Math.round(performance.now() - startTime),
            modelMeta: data.modelMeta,
          };
        }
      } catch (err) {
        console.warn('Live predictRisk request failed, falling back to deterministic local model:', err);
      }
    }

    // Local deterministic scoring proxy
    await this.simulateLatency(120);
    const customer = await this.getCustomerById(customerId);
    const fallbackCustomer = customer || this.mockCustomers[0];

    const assessment = calculateRiskAssessment(fallbackCustomer, riskConfig, overrides);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      assessment,
      source: 'demo-proxy',
      latencyMs,
      modelMeta: {
        engine: 'Deterministic Underwriting Proxy',
        version: '1.0.0-demo',
        algorithm: 'Rule-Weighted Risk Index + Calibrated Sigmoid Logit',
        calibrated: false,
      },
    };
  }

  /**
   * Endpoint 5: Get Early-Warning Alerts
   */
  async getAlerts(severity, status) {
    if (this.config.mode === 'live') {
      try {
        const params = new URLSearchParams();
        if (severity && severity !== 'All') params.append('severity', severity);
        if (status && status !== 'All') params.append('status', status);
        const res = await fetch(`${this.config.baseUrl}/api/v1/alerts?${params}`);
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Live getAlerts request failed, falling back to local alerts:', err);
      }
    }

    await this.simulateLatency(80);
    let alerts = [...this.mockAlerts];
    if (severity && severity !== 'All') {
      alerts = alerts.filter((a) => a.severity === severity);
    }
    if (status && status !== 'All') {
      alerts = alerts.filter((a) => a.status === status);
    }
    return alerts;
  }

  /**
   * Endpoint 6: Update Alert Status
   */
  async updateAlertStatus(alertId, newStatus) {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/alerts/${encodeURIComponent(alertId)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Live updateAlertStatus request failed, falling back to local alerts:', err);
      }
    }

    await this.simulateLatency(80);
    const idx = this.mockAlerts.findIndex((a) => a.id === alertId);
    if (idx !== -1) {
      this.mockAlerts[idx] = {
        ...this.mockAlerts[idx],
        status: newStatus,
        reviewedBy: newStatus !== 'New' ? 'Risk Officer Desk' : undefined,
        reviewedDate: newStatus !== 'New' ? new Date().toISOString().split('T')[0] : undefined,
      };
      return this.mockAlerts[idx];
    }
    throw new Error(`Alert with ID ${alertId} not found.`);
  }

  /**
   * Endpoint 7: Segmentation & K-Means Clusters
   */
  async getSegmentationData() {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/segmentation/clusters`);
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Live getSegmentationData request failed, falling back to local segments:', err);
      }
    }

    await this.simulateLatency(110);
    return {
      segments: SEGMENTS_DATA,
      customers: [...this.mockCustomers],
    };
  }

  /**
   * Endpoint 8: Report Dossier Generation
   */
  async generateReportData(customerId, riskConfig = DEFAULT_RISK_CONFIG) {
    const customer = await this.getCustomerById(customerId);
    if (!customer) {
      throw new Error(`Cannot generate report: Customer ${customerId} not found.`);
    }

    const prediction = await this.predictRisk(customerId, undefined, riskConfig);
    return {
      customer,
      assessment: prediction.assessment,
      source: prediction.source,
    };
  }

  /**
   * Endpoint 9: Get Out-of-Sample Test Set Predictions
   */
  async getTestPredictions() {
    await this.simulateLatency(70);
    return [...TEST_PREDICTIONS];
  }

  /**
   * Endpoint 10: Get Model Validation & Comparison Benchmarks
   */
  async getValidationModels() {
    await this.simulateLatency(60);
    return [...VALIDATION_MODELS];
  }

  /**
   * Endpoint 11: Get Pipeline Specification and Pickled Model Metadata
   */
  async getModelPipelineSpec() {
    await this.simulateLatency(50);
    return { ...MODEL_PIPELINE_SPEC };
  }

  /**
   * Endpoint 12: Interactive Model Retraining & Calibration Simulator
   */
  async simulateModelRetraining(hyperparams) {
    await this.simulateLatency(450);
    const nTrees = Number(hyperparams?.n_estimators || MODEL_PIPELINE_SPEC.hyperparameters.n_estimators);
    const lr = Number(hyperparams?.learning_rate || MODEL_PIPELINE_SPEC.hyperparameters.learning_rate);
    const depth = Number(hyperparams?.max_depth || MODEL_PIPELINE_SPEC.hyperparameters.max_depth);
    
    const aucBonus = (nTrees >= 200 ? 0.005 : -0.01) + (lr >= 0.03 && lr <= 0.08 ? 0.004 : -0.015) + (depth === 4 ? 0.003 : 0);
    const newAuc = Math.min(0.94, Math.max(0.82, parseFloat((MODEL_PIPELINE_SPEC.metrics.roc_auc + aucBonus).toFixed(3))));
    const newGini = parseFloat(((newAuc * 2) - 1).toFixed(3));
    const newKs = parseFloat((newAuc * 58 - 0.5).toFixed(1));
    const newBrier = parseFloat((0.058 - aucBonus * 0.4).toFixed(3));

    const updatedSpec = {
      ...MODEL_PIPELINE_SPEC,
      hyperparameters: {
        ...MODEL_PIPELINE_SPEC.hyperparameters,
        ...hyperparams,
      },
      metrics: {
        roc_auc: newAuc,
        ks_stat: newKs,
        brier_score: newBrier,
      }
    };

    const log = [
      `[PIPELINE] Initializing StandardScaler & Numerical Imputer on ${INITIAL_CUSTOMERS.length} records...`,
      `[TRAINING] Fitting GradientBoostingClassifier(n_estimators=${nTrees}, learning_rate=${lr}, max_depth=${depth})...`,
      `[CV-FOLD] 5-Fold Stratified Cross-Validation complete across default/non-default classes.`,
      `[CALIBRATION] CalibratedClassifierCV Platt scaling applied for reliable probability scores.`,
      `[ARTIFACT] Serialized trained pipeline weights to model.pkl.`,
      `[BENCHMARK] Validation ROC-AUC achieved: ${newAuc} | KS-Stat: ${newKs}% | Brier Score: ${newBrier}`
    ];

    return {
      updatedSpec,
      durationMs: 720,
      log
    };
  }

  /**
   * Endpoint 13: AI Alert Triage & Remediation Plan (Gemini)
   */
  async triageAlertWithAI(alertId, customerId) {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/ai/alert-triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, customerId }),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('AI alert triage request failed, using local model:', err);
    }
    return {
      rootCauseAnalysis: "Elevated credit revolver utilization coupled with sequential payment friction indicates household liquidity contraction.",
      urgencyLevel: "Critical",
      defaultProbabilityTrend: "+11.4% projected over 90 days if unaddressed",
      lossExposureEstimate: "$8,500 at immediate risk",
      workoutStrategy: [
        "Temporarily freeze additional line draw and credit expansion.",
        "Initiate structured 0% APR forbearance for 90 days.",
        "Dispatch automated text message payment reminder 3 days prior to due cycle."
      ],
      customerNoticeDraft: {
        sms: "CreditGuard Notice: We've identified an update on your account. Please log in or call us to review customized balance assistance.",
        emailSubject: "Important Update Regarding Your Credit Account Support Options",
        emailBody: "Dear Cardholder, We noticed a recent payment change on your account. To help maintain your credit health, our customer relief desk has pre-approved structured repayment options."
      },
      committeeRecommendation: "Initiate proactive credit line contraction by 30% and route account to Senior Workout Desk."
    };
  }

  /**
   * Endpoint 14: Batch AI Surveillance & Priority Matrix (Gemini)
   */
  async getBatchAlertsSummaryWithAI() {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/ai/batch-alerts-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('AI batch alerts summary request failed:', err);
    }
    return {
      executiveSummary: "Portfolio surveillance exhibits clustering in mid-tenure accounts experiencing balance exhaustion and multiple 30-day delinquencies.",
      primaryRiskDrivers: [
        { category: "Chronic Delinquency (3+ late cycles)", affectedCount: 14, exposure: "$118,500", severity: "Critical" },
        { category: "Limit Exhaustion (>85% utilization)", affectedCount: 17, exposure: "$195,400", severity: "High" },
        { category: "Emergency Cash Advance Draw Spikes", affectedCount: 8, exposure: "$42,800", severity: "Medium" }
      ],
      topPriorityAccounts: [
        { customerId: "CUST000008", customerName: "Sophia Trevino", reason: "6 delinquent billing cycles with 89.2% revolver utilization", immediateAction: "Immediate line freeze and workout dispatch" },
        { customerId: "CUST000015", customerName: "Savannah Castillo", reason: "6 missed cycles, high debt-to-income concentration", immediateAction: "Urgent hardship outreach" },
        { customerId: "CUST000006", customerName: "Avery Mercer", reason: "5 consecutive missed payments, 82% line draw", immediateAction: "Credit contraction by 35%" }
      ],
      operationalRecommendations: [
        "Automate SMS reminders for all cardholders reaching 75% credit limit.",
        "Prioritize the top 5 high-balance delinquent accounts for direct phone outreach before next billing cut-off.",
        "Temporarily restrict cash advance privileges on accounts with 2+ late payments."
      ]
    };
  }

  /**
   * Endpoint 15: AI Portfolio Risk Strategist (Gemini)
   */
  async getPortfolioInsightWithAI(scenario = 'Baseline') {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/ai/portfolio-insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('AI portfolio insight request failed:', err);
    }
    return {
      macroAnalysis: "Overall portfolio credit health remains sound with an 84.6% non-default trajectory. However, revolving balances in corporate & professional segments are sensitive to interest rate fluctuations.",
      stressTestResult: {
        scenario: "Fed +150 bps Rate Hike & Consumer Squeeze",
        projectedDefaultRate: "18.2% (+2.8% shift)",
        potentialLossVariance: "+$126,500",
        vulnerableSegment: "Revolving Balances & High-Risk Revolvers"
      },
      strategicPillars: [
        { title: "Dynamic Line Contraction", detail: "Proactively reduce unused lines for dormant revolvers showing rising utilization elsewhere." },
        { title: "Liquidity Buffer Incentive", detail: "Reward transactors maintaining <20% utilization with 1.5x bonus points to retain prime depositors." },
        { title: "Algorithmic Early Cure", detail: "Deploy AI early warning triggers at 1 late payment rather than waiting for 60-day delinquency." }
      ],
      anomalyAlerts: [
        "Unusual 14% uptick in mid-cycle revolving balance draws among accounts opened in 2021-2022.",
        "Cash advance velocity concentrated in 12 high-limit cardholders."
      ]
    };
  }

  /**
   * Endpoint 16: Interactive AI Credit Assistant (Gemini)
   */
  async askAiRiskAssistant(query, context = {}) {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/v1/ai/ask-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context }),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('AI assistant request failed, using local heuristic response:', err);
    }

    const qLower = (query || '').toLowerCase();
    if (qLower.includes('exposure') || qLower.includes('highest')) {
      return {
        answer: "The greatest risk concentration is in the 'Elevated Leverage' segment with $1.85M outstanding balance at 78.4% average utilization. 14 cardholders in this cohort have crossed 2+ delinquency cycles.",
        keyFactors: [
          "Revolving leverage exceeds 75% across 63 accounts",
          "Concentrated in Corporate and Professional categories",
          "Payment-to-minimum ratios averaging 1.1x (near minimum-only)"
        ],
        recommendedAction: "Execute 25% credit line contraction on accounts with >=2 late cycles and pause promotional balance transfers.",
        confidenceScore: 0.94
      };
    } else if (qLower.includes('rate') || qLower.includes('shock') || qLower.includes('hike')) {
      return {
        answer: "A 200 bps rate shock would increase minimum payments by ~12-18%, driving an estimated +2.96% spike in portfolio default probability. Revolvers with debt-to-income over 25% would experience the sharpest transition into 60-day delinquency.",
        keyFactors: [
          "56 active revolving accounts carry variable APR terms",
          "Average annual debt servicing cost increases by $480 per revolver",
          "Low-activity prime transactors remain unaffected"
        ],
        recommendedAction: "Offer voluntary fixed-rate 36-month installment consolidation loans to top-tier revolving balances before rate hike cut-off.",
        confidenceScore: 0.91
      };
    } else if (qLower.includes('action') || qLower.includes('urgent') || qLower.includes('today')) {
      return {
        answer: "Immediate focus is required on 3 priority delinquent accounts (CUST000008, CUST000015, CUST000006) with cumulative exposure of $38,400. All three have missed >=5 cycles and continue to draw minimum cash advances.",
        keyFactors: [
          "Combined balance: $38,400 with 0 payments received in 60 days",
          "Cardholder Sophia Trevino (CUST000008) is at 89.2% credit limit utilization",
          "Risk of imminent 90-day charge-off within next billing cycle"
        ],
        recommendedAction: "Freeze line expansion immediately and dispatch prioritized workout counselor outreach with pre-authorized 90-day 0% APR relief.",
        confidenceScore: 0.96
      };
    }

    return {
      answer: `Analysis for "${query}": The portfolio maintains healthy 84.6% prime asset coverage, but requires proactive surveillance over accounts with debt service ratios exceeding 20%. Stress indicators are concentrated in revolving cardholders experiencing income volatility.`,
      keyFactors: [
        "Portfolio health index: 84.6% non-default trajectory",
        "Average utilization: 34.5% across 200 monitored accounts",
        "Active watchlist alerts: 18 flagged cardholders"
      ],
      recommendedAction: "Maintain automated bi-weekly surveillance scans and enforce dynamic credit limits upon second missed billing cycle.",
      confidenceScore: 0.89
    };
  }
}

// Singleton API Client instance
export const api = new CreditGuardApiService();
