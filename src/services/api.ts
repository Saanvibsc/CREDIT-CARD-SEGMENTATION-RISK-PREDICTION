import { 
  Customer, 
  EarlyWarningAlert, 
  AlertStatus, 
  RiskConfig, 
  ComputedRiskAssessment, 
  PredictionResponse, 
  PortfolioSummaryResponse, 
  DataSourceType,
  ApiConfig,
  EndpointContract
} from '../types';
import { INITIAL_CUSTOMERS, INITIAL_ALERTS, SEGMENTS_DATA } from '../data/mockData';
import { calculateRiskAssessment, DEFAULT_RISK_CONFIG } from '../utils/scoringEngine';

export const API_ENDPOINTS_DOCUMENTATION: EndpointContract[] = [
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
    "id": "CG-8041",
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
  "id": "CG-8041",
  "fullName": "Eleanor Vance",
  "creditLimit": 35000,
  "outstandingBalance": 3200,
  ...
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/risk/predict',
    description: 'Evaluate default risk prediction and calculate 0-100 risk score and calibrated PD % using Logistic Regression.',
    requestBodySchema: `{
  "customerId": "CG-8041",
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
    "engine": "Scikit-Learn LogisticRegression",
    "version": "1.4.2",
    "algorithm": "L2-Regularized Logistic Regression + CalibratedClassifierCV",
    "calibrated": true
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
    "customerId": "CG-9204",
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
  private config: ApiConfig = {
    mode: 'mock',
    baseUrl: 'http://localhost:8000',
    timeoutMs: 3000,
    connectionStatus: 'fallback',
  };

  // In-memory state for mock mode persistence
  private mockCustomers: Customer[] = [...INITIAL_CUSTOMERS];
  private mockAlerts: EarlyWarningAlert[] = [...INITIAL_ALERTS];

  public getConfig(): ApiConfig {
    return { ...this.config };
  }

  public setConfig(updated: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...updated };
  }

  /**
   * Helper: simulate network latency in mock mode
   */
  private async simulateLatency(ms = 120): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Healthcheck test against live backend URL
   */
  public async testBackendConnection(url: string): Promise<{ connected: boolean; latencyMs: number; message: string; version?: string }> {
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
        const data = await response.json();
        this.config.connectionStatus = 'connected';
        this.config.lastPing = new Date().toLocaleTimeString();
        this.config.latencyMs = latencyMs;
        return {
          connected: true,
          latencyMs,
          message: `Connected successfully to live Python backend (${data.version || 'v1.0.0'}).`,
          version: data.version,
        };
      } else {
        return {
          connected: false,
          latencyMs,
          message: `Backend returned HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (err: any) {
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
  public async getPortfolioSummary(riskConfig: RiskConfig = DEFAULT_RISK_CONFIG): Promise<PortfolioSummaryResponse> {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/portfolio/summary`);
        if (res.ok) {
          const data = await res.json();
          return { ...data, source: 'live-ml-backend' };
        }
      } catch (err) {
        console.warn('Live backend unreachable, falling back to mock dataset:', err);
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
  public async searchCustomers(query?: string, tier?: string, cardType?: string, riskConfig = DEFAULT_RISK_CONFIG): Promise<Customer[]> {
    if (this.config.mode === 'live') {
      try {
        const params = new URLSearchParams();
        if (query) params.append('q', query);
        if (tier && tier !== 'All') params.append('tier', tier);
        if (cardType && cardType !== 'All') params.append('cardType', cardType);
        
        const res = await fetch(`${this.config.baseUrl}/api/v1/customers?${params.toString()}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Live customers search failed, using fallback:', err);
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
  public async getCustomerById(id: string): Promise<Customer | null> {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/customers/${id}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Live getCustomerById failed, using fallback:', err);
      }
    }

    await this.simulateLatency(60);
    const found = this.mockCustomers.find((c) => c.id.toUpperCase() === id.toUpperCase());
    return found ? { ...found } : null;
  }

  /**
   * Endpoint 4: Predict Risk / Score Calculation
   */
  public async predictRisk(
    customerId: string,
    overrides?: { utilization?: number; delayedPayments?: number; annualIncome?: number },
    riskConfig: RiskConfig = DEFAULT_RISK_CONFIG
  ): Promise<PredictionResponse> {
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
          const latencyMs = Math.round(performance.now() - startTime);
          return {
            assessment: data.assessment,
            source: 'live-ml-backend',
            latencyMs,
            modelMeta: data.modelMeta || {
              engine: 'Python ML Engine',
              version: '1.4.2',
              algorithm: 'Scikit-Learn Logistic Regression (Calibrated)',
              calibrated: true,
            },
          };
        }
      } catch (err) {
        console.warn('Live predictRisk failed, falling back to local deterministic scoring engine:', err);
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
        engine: 'TypeScript Deterministic Underwriting Proxy',
        version: '1.0.0-demo',
        algorithm: 'Rule-Weighted Risk Index + Calibrated Sigmoid Logit',
        calibrated: false,
      },
    };
  }

  /**
   * Endpoint 5: Get Early-Warning Alerts
   */
  public async getAlerts(severity?: string, status?: string): Promise<EarlyWarningAlert[]> {
    if (this.config.mode === 'live') {
      try {
        const params = new URLSearchParams();
        if (severity && severity !== 'All') params.append('severity', severity);
        if (status && status !== 'All') params.append('status', status);

        const res = await fetch(`${this.config.baseUrl}/api/v1/alerts?${params.toString()}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Live getAlerts failed, using fallback:', err);
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
  public async updateAlertStatus(alertId: string, newStatus: AlertStatus): Promise<EarlyWarningAlert> {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/alerts/${alertId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Live updateAlertStatus failed, using local mutation:', err);
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
  public async getSegmentationData(): Promise<{ segments: typeof SEGMENTS_DATA; customers: Customer[] }> {
    if (this.config.mode === 'live') {
      try {
        const res = await fetch(`${this.config.baseUrl}/api/v1/segmentation/clusters`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Live getSegmentationData failed, using fallback:', err);
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
  public async generateReportData(
    customerId: string, 
    riskConfig: RiskConfig = DEFAULT_RISK_CONFIG
  ): Promise<{ customer: Customer; assessment: ComputedRiskAssessment; source: DataSourceType }> {
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
}

// Singleton API Client instance
export const api = new CreditGuardApiService();
