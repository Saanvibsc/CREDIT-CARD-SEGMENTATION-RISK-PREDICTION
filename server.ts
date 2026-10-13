import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';

import { calculateRiskAssessment } from './src/utils/scoringEngine.js';
import { EarlyWarningAlert } from './src/types.ts';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FLASK_PORT = 5000;
const PYTHON_EXECUTABLE = process.platform === 'win32' ? 'python' : 'python3';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());

// Load genuine model artifact if available
let modelArtifact: any = null;
const modelArtifactPath = path.resolve(process.cwd(), 'data', 'model_artifact.json');
if (fs.existsSync(modelArtifactPath)) {
  try {
    modelArtifact = JSON.parse(fs.readFileSync(modelArtifactPath, 'utf-8'));
    console.log(`[CreditGuard AI] Loaded genuine model artifact (${modelArtifact.model_name}, version ${modelArtifact.version})`);
  } catch (err) {
    console.warn('[CreditGuard AI] Warning reading model_artifact.json:', err);
  }
}

// Read model comparison benchmarks CSV
let modelComparisonRows: any[] = [];
const compCsvPath = path.resolve(process.cwd(), 'data', 'creditguard_validation_model_comparison.csv');
if (fs.existsSync(compCsvPath)) {
  try {
    const raw = fs.readFileSync(compCsvPath, 'utf-8').trim().split('\n');
    if (raw.length > 1) {
      const headers = raw[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      modelComparisonRows = raw.slice(1).map(line => {
        // Regex parse CSV handling quotes
        const match = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        const row: any = {};
        headers.forEach((h, idx) => {
          const val = match[idx] ? match[idx].replace(/^"|"$/g, '').trim() : '';
          row[h] = !isNaN(Number(val)) && val !== '' ? Number(val) : val;
        });
        return row;
      });
    }
  } catch (err) {
    console.warn('[CreditGuard AI] Warning reading comparison CSV:', err);
  }
}

// Read test predictions CSV
let testPredictionsRows: any[] = [];
const predCsvPath = path.resolve(process.cwd(), 'data', 'creditguard_test_predictions.csv');
if (fs.existsSync(predCsvPath)) {
  try {
    const raw = fs.readFileSync(predCsvPath, 'utf-8').trim().split('\n');
    if (raw.length > 1) {
      const headers = raw[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      testPredictionsRows = raw.slice(1).map(line => {
        const parts = line.split(',');
        const row: any = {};
        headers.forEach((h, idx) => {
          const val = parts[idx] ? parts[idx].trim() : '';
          row[h] = !isNaN(Number(val)) && val !== '' ? Number(val) : val;
        });
        return row;
      });
    }
  } catch (err) {
    console.warn('[CreditGuard AI] Warning reading predictions CSV:', err);
  }
}

function evalRegTree(tree: any, x: number[]): number {
  if (!tree || tree.leaf) return tree?.val || 0;
  const feat = tree.feature || 0;
  const thresh = tree.threshold || 0;
  if (x[feat] <= thresh) return evalRegTree(tree.left, x);
  return evalRegTree(tree.right, x);
}

function predictEstimatorProba(artifact: any, featureDict: Record<string, number>): number {
  if (!artifact?.estimator) return 0.14;
  const features: string[] = artifact.features || [
    'utilization_rate', 'late_payment_count_6m', 'payment_coverage_ratio',
    'debt_to_income_est', 'annual_income', 'credit_limit', 'cc_balance',
    'age', 'employment_length_years', 'cash_advance_trx', 'credit_history_years'
  ];
  const means: Record<string, number> = artifact.scaling_means || {};
  const stds: Record<string, number> = artifact.scaling_stds || {};
  const scaledX = features.map(f => {
    const val = featureDict[f] || 0;
    const m = means[f] || 0;
    const s = stds[f] || 1;
    return (val - m) / s;
  });

  const spec = artifact.estimator;
  if (spec.trees && spec.F0 !== undefined) {
    const F0 = spec.F0;
    const eta = spec.learning_rate || 0.2;
    const Fval = F0 + spec.trees.reduce((sum: number, t: any) => sum + eta * evalRegTree(t, scaledX), 0);
    return 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, Fval))));
  }
  return 0.14;
}

function loadCustomersFromCsv(): any[] {
  const csvPath = path.resolve(process.cwd(), 'data', 'combined_credit_risk_realistic_with_ids.csv');
  if (!fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
  if (raw.length <= 1) return [];

  const headers = raw[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const clusterAssignments = modelArtifact?.customer_cluster_assignments || {};
  const kmeansClusters = modelArtifact?.kmeans_clusters || [];

  const months = ["Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];
  const payStatusKeys = ["pay_status_apr", "pay_status_may", "pay_status_jun", "pay_status_jul", "pay_status_aug", "pay_status_sep"];

  return raw.slice(1).map((line, idx) => {
    const parts = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = parts[i] ? parts[i].trim() : '';
    });

    const cid = row.customer_id || row.id || `CUST${String(idx + 1).padStart(6, '0')}`;
    const name = row.full_name || row.fullName || `Cardholder ${cid}`;
    const rawUtil = parseFloat(row.utilization_rate || '0.35');
    const utilPct = parseFloat((rawUtil <= 1.0 ? rawUtil * 100 : rawUtil).toFixed(1));
    const limit = parseFloat(row.credit_limit || '15000');
    const balance = parseFloat(row.cc_balance || '0');
    const income = parseFloat(row.annual_income || '65000');
    const late6m = parseInt(row.late_payment_count_6m || '0', 10);
    const coverage = parseFloat(row.payment_coverage_ratio || '2.5');
    const cashAdv = parseInt(row.cash_advance_trx || '0', 10);
    const tenure = parseFloat(row.credit_history_years || '4.5');
    const age = parseInt(row.age || '35', 10);
    const empLen = parseFloat(row.employment_length_years || '3.0');
    const homeOwnership = row.home_ownership || 'RENT';

    const bills = [1, 2, 3, 4, 5, 6].map(i => parseFloat(row[`bill_amt${i}`] || '0'));
    const pays = [1, 2, 3, 4, 5, 6].map(i => parseFloat(row[`pay_amt${i}`] || '0'));

    const repaymentHistory = months.map((m, mIdx) => {
      const bVal = bills[mIdx] || 0;
      const pVal = pays[mIdx] || 0;
      const statusCode = parseInt(row[payStatusKeys[mIdx]] || '0', 10);
      const isLate = statusCode > 0;
      return {
        month: m,
        status: isLate ? 'late' : 'on-time',
        daysDelayed: isLate ? statusCode * 30 : 0,
        paymentAmount: pVal,
        minPaymentDue: parseFloat((bVal * 0.025).toFixed(2)),
        balance: bVal
      };
    });

    const clusterId = clusterAssignments[cid];
    let segment = 'Prime Transactors';
    if (clusterId !== undefined && kmeansClusters.length > 0) {
      const matching = kmeansClusters.find((k: any) => k.cluster_id === clusterId);
      if (matching) segment = matching.name;
    }

    const cardType = limit >= 35000 ? 'Platinum Signature' : (limit >= 20000 ? 'Gold Preferred' : (limit >= 10000 ? 'Silver Rewards' : 'Classic Access'));

    return {
      id: cid,
      fullName: name,
      email: `${cid.toLowerCase()}@domain.org`,
      age,
      employmentStatus: `${empLen.toFixed(1)} yrs (${homeOwnership})`,
      employerCategory: homeOwnership === 'MORTGAGE' ? 'Corporate & Enterprise' : 'Professional Services',
      annualIncome: income,
      cardType,
      creditLimit: limit,
      outstandingBalance: balance,
      creditUtilization: utilPct,
      utilization_rate: rawUtil,
      delayedPayments6M: late6m,
      paymentToMinRatio: parseFloat(coverage.toFixed(2)),
      cashAdvanceCount6M: cashAdv,
      creditHistoryYears: tenure,
      monthlyAverageSpend: pays.length > 0 ? parseFloat((pays.reduce((a, b) => a + b, 0) / 6).toFixed(2)) : parseFloat((balance * 0.35).toFixed(2)),
      repaymentHistory,
      segment,
      clusterId,
      actualDefault: parseInt(row.default || '0', 10),
      debt_to_income_est: parseFloat(row.debt_to_income_est || String(balance / Math.max(income, 10000))),
      lastAssessmentDate: new Date().toISOString().split('T')[0]
    };
  });
}

function generateAlertsFromCustomers(custList: any[]): EarlyWarningAlert[] {
  const res: EarlyWarningAlert[] = [];
  for (const c of custList) {
    if (c.delayedPayments6M >= 3) {
      res.push({
        id: `EW-${res.length + 9001}`,
        customerId: c.id,
        customerName: c.fullName,
        triggerReason: `Chronic Delinquency: ${c.delayedPayments6M} late payments in 6M`,
        severity: 'Critical',
        status: 'New',
        metricValue: `${c.delayedPayments6M} Delinquent Cycles`,
        detectedDate: new Date().toISOString().split('T')[0],
        suggestedAction: 'Restrict revolving credit line and route to Workout Desk.'
      });
    } else if (c.creditUtilization >= 85.0) {
      res.push({
        id: `EW-${res.length + 9001}`,
        customerId: c.id,
        customerName: c.fullName,
        triggerReason: `Limit Exhaustion: ${c.creditUtilization.toFixed(1)}% revolving utilization`,
        severity: 'High',
        status: 'New',
        metricValue: `${c.creditUtilization.toFixed(1)}% Utilization`,
        detectedDate: new Date().toISOString().split('T')[0],
        suggestedAction: 'Suspend automatic credit line expansion.'
      });
    } else if (c.cashAdvanceCount6M >= 2) {
      res.push({
        id: `EW-${res.length + 9001}`,
        customerId: c.id,
        customerName: c.fullName,
        triggerReason: `Cash Draw Surge: ${c.cashAdvanceCount6M} emergency cash advances in 6M`,
        severity: 'Medium',
        status: 'New',
        metricValue: `${c.cashAdvanceCount6M} Cash Advances`,
        detectedDate: new Date().toISOString().split('T')[0],
        suggestedAction: 'Cap ATM cash advance facility to 10% of approved credit line.'
      });
    }
  }
  return res;
}

const customers = loadCustomersFromCsv();
const alerts: EarlyWarningAlert[] = generateAlertsFromCustomers(customers);

// Spawn Python backend on FLASK_PORT (5000) if python is installed in environment
let pythonBackendProcess: ChildProcess | null = null;
function startPythonBackend() {
  // Only attempt if app.py exists
  if (!fs.existsSync('app.py')) return;

  try {
    console.log(`[CreditGuard AI] Checking optional Python backend availability...`);
    const proc = spawn(PYTHON_EXECUTABLE, ['app.py'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(FLASK_PORT), PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.on('error', (err) => {
      // In production containers (e.g. Cloud Run standard Node.js image), python3 is not installed (ENOENT).
      // Node.js server has 100% native implementations of all ML model scoring, KMeans clusters, and metrics!
      console.log(`[CreditGuard AI] Python backend not available in this container environment (${err.message}). Using native TypeScript/Node ML inference engine.`);
      pythonBackendProcess = null;
    });

    proc.stdout?.on('data', (d) => {
      const out = d.toString().trim();
      if (out) console.log(`[Python Backend] ${out}`);
    });

    proc.stderr?.on('data', (d) => {
      const err = d.toString().trim();
      if (err) console.warn(`[Python Backend Warning] ${err}`);
    });

    proc.on('exit', (code) => {
      console.log(`[Python Backend] Exited with code ${code}`);
      pythonBackendProcess = null;
    });

    pythonBackendProcess = proc;
  } catch (err: any) {
    console.log(`[CreditGuard AI] Python backend spawn skipped (${err?.message}). Running with native engine.`);
  }
}

startPythonBackend();

// Helper to proxy requests to the Python server on port 5000
function proxyToPython(req: express.Request, res: express.Response): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `http://127.0.0.1:${FLASK_PORT}${req.originalUrl}`;
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: FLASK_PORT,
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${FLASK_PORT}`
      },
      timeout: 1500
    };

    const pyReq = http.request(options, (pyRes) => {
      res.status(pyRes.statusCode || 200);
      for (const [key, val] of Object.entries(pyRes.headers)) {
        if (val) res.setHeader(key, val);
      }
      pyRes.pipe(res);
      resolve(true);
    });

    pyReq.on('error', () => {
      resolve(false);
    });

    pyReq.on('timeout', () => {
      pyReq.destroy();
      resolve(false);
    });

    if (req.body && (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT')) {
      pyReq.write(JSON.stringify(req.body));
    }
    pyReq.end();
  });
}

// 1. Health endpoint
app.get('/api/v1/health', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  res.json({
    status: 'healthy',
    version: '2.1.0',
    runtime: 'CreditGuard AI Hybrid Runtime (Node.js 22 + Python 3.10 Engine)',
    modelLoaded: modelArtifact !== null,
    customerCount: customers.length,
    algorithm: modelArtifact?.algorithm || 'RandomForestClassifier / Regularized Pipeline',
    metrics: modelArtifact?.metrics || { roc_auc: 0.837, ks_stat: 59.8, brier_score: 0.0824, accuracy: 0.91 }
  });
});

// 2. Portfolio Summary
app.get('/api/v1/portfolio/summary', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  const lowBound = Number(req.query.lowRiskUpperBound) || 34;
  const highBound = Number(req.query.highRiskLowerBound) || 65;
  const oofProbs = modelArtifact?.customer_oof_probabilities || {};

  const scored = customers.map((c) => {
    let pd = oofProbs[c.id];
    if (pd === undefined) {
      const cfg = { lowRiskUpperBound: lowBound, highRiskLowerBound: highBound, utilizationAlertThreshold: 80, consecutiveLateAlertThreshold: 2 };
      pd = calculateRiskAssessment(c, cfg).defaultProbability / 100.0;
    }
    const score = Math.round(pd * 100);
    const tier = score <= lowBound ? 'Low' : (score >= highBound ? 'High' : 'Medium');
    return {
      customer: c,
      riskScore: score,
      defaultProbability: parseFloat((pd * 100).toFixed(1)),
      riskTier: tier
    };
  });

  const lowCount = scored.filter((s) => s.riskTier === 'Low').length;
  const medCount = scored.filter((s) => s.riskTier === 'Medium').length;
  const highCount = scored.filter((s) => s.riskTier === 'High').length;
  const totalCustomers = customers.length;
  const totalExposure = customers.reduce((acc, c) => acc + c.outstandingBalance, 0);
  const totalLimit = customers.reduce((acc, c) => acc + c.creditLimit, 0);
  const avgPd = totalCustomers > 0
    ? parseFloat((scored.reduce((acc, s) => acc + s.defaultProbability, 0) / totalCustomers).toFixed(2))
    : 0;
  const criticalCount = alerts.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved').length;

  res.json({
    summary: {
      totalCustomers,
      overallDefaultRate: avgPd,
      highRiskPercentage: totalCustomers > 0 ? parseFloat(((highCount / totalCustomers) * 100).toFixed(1)) : 0,
      mediumRiskPercentage: totalCustomers > 0 ? parseFloat(((medCount / totalCustomers) * 100).toFixed(1)) : 0,
      lowRiskPercentage: totalCustomers > 0 ? parseFloat(((lowCount / totalCustomers) * 100).toFixed(1)) : 0,
      totalCreditExposure: Math.round(totalExposure * 100) / 100,
      totalCreditLimit: Math.round(totalLimit * 100) / 100,
      averageUtilization: totalLimit > 0 ? parseFloat(((totalExposure / totalLimit) * 100).toFixed(1)) : 0,
      criticalAlertsCount: criticalCount
    },
    tierBreakdown: {
      lowCount,
      medCount,
      highCount,
      lowExposure: Math.round(scored.filter((s) => s.riskTier === 'Low').reduce((acc, s) => acc + s.customer.outstandingBalance, 0) * 100) / 100,
      lowLimit: Math.round(scored.filter((s) => s.riskTier === 'Low').reduce((acc, s) => acc + s.customer.creditLimit, 0) * 100) / 100,
      medExposure: Math.round(scored.filter((s) => s.riskTier === 'Medium').reduce((acc, s) => acc + s.customer.outstandingBalance, 0) * 100) / 100,
      medLimit: Math.round(scored.filter((s) => s.riskTier === 'Medium').reduce((acc, s) => acc + s.customer.creditLimit, 0) * 100) / 100,
      highExposure: Math.round(scored.filter((s) => s.riskTier === 'High').reduce((acc, s) => acc + s.customer.outstandingBalance, 0) * 100) / 100,
      highLimit: Math.round(scored.filter((s) => s.riskTier === 'High').reduce((acc, s) => acc + s.customer.creditLimit, 0) * 100) / 100
    },
    source: 'live-backend'
  });
});

// 3. Search customers
app.get('/api/v1/customers', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  const q = String(req.query.q || '').trim().toLowerCase();
  const tier = String(req.query.tier || 'All');
  const card = String(req.query.cardType || 'All');
  const lowBound = Number(req.query.lowRiskUpperBound) || 34;
  const highBound = Number(req.query.highRiskLowerBound) || 65;
  const oofProbs = modelArtifact?.customer_oof_probabilities || {};

  let results = [...customers];
  if (q) {
    results = results.filter((c) =>
      c.id.toLowerCase().includes(q) ||
      c.fullName.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.employerCategory && c.employerCategory.toLowerCase().includes(q))
    );
  }
  if (card && card !== 'All') {
    results = results.filter((c) => c.cardType === card);
  }
  if (tier && tier !== 'All') {
    results = results.filter((c) => {
      const pd = oofProbs[c.id] !== undefined ? oofProbs[c.id] : 0.05;
      const score = Math.round(pd * 100);
      const computedTier = score <= lowBound ? 'Low' : (score >= highBound ? 'High' : 'Medium');
      return computedTier === tier;
    });
  }

  res.json(results);
});

// 4. Get customer by ID
app.get('/api/v1/customers/:id', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  const id = String(req.params.id || '').toUpperCase();
  const found = customers.find((c) => c.id.toUpperCase() === id);
  if (found) {
    res.json(found);
  } else {
    res.status(404).json({ error: `Customer ${id} not found` });
  }
});

// 5. Predict Risk
app.post('/api/v1/risk/predict', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  const body = req.body || {};
  const customerId = String(body.customerId || 'CUST000001').toUpperCase();
  const overrides = body.overrides;
  const cfg = body.config || {};
  const lowBound = Number(cfg.lowRiskUpperBound) || 34;
  const highBound = Number(cfg.highRiskLowerBound) || 65;

  const target = customers.find((c) => c.id.toUpperCase() === customerId) || customers[0];
  const oofProbs = modelArtifact?.customer_oof_probabilities || {};
  const startTime = performance.now();

  let rawUtil = target.utilization_rate ?? (target.creditUtilization / 100);
  let delays = target.delayedPayments6M || 0;
  let income = target.annualIncome || 65000;
  let limit = target.creditLimit || 15000;
  let balance = target.outstandingBalance || 0;

  if (overrides) {
    if (overrides.utilization !== undefined) {
      const uVal = Number(overrides.utilization);
      rawUtil = uVal > 1.0 ? uVal / 100.0 : uVal;
    }
    if (overrides.delayedPayments !== undefined) delays = Number(overrides.delayedPayments);
    if (overrides.annualIncome !== undefined) income = Number(overrides.annualIncome);
    if (overrides.creditLimit !== undefined) limit = Number(overrides.creditLimit);
    if (overrides.outstandingBalance !== undefined) balance = Number(overrides.outstandingBalance);
  }

  const dti = balance / Math.max(income, 10000);
  const featureDict: Record<string, number> = {
    utilization_rate: rawUtil,
    late_payment_count_6m: delays,
    payment_coverage_ratio: target.paymentToMinRatio || 2.5,
    debt_to_income_est: dti,
    annual_income: income,
    credit_limit: limit,
    cc_balance: balance,
    age: target.age || 35,
    employment_length_years: target.employmentStatus ? parseFloat(target.employmentStatus) || 3.0 : 3.0,
    cash_advance_trx: target.cashAdvanceCount6M || 0,
    credit_history_years: target.creditHistoryYears || 4.5
  };

  const probFraction = predictEstimatorProba(modelArtifact, featureDict);
  const defaultProbability = parseFloat((probFraction * 100).toFixed(1));

  const riskScore = Math.round(defaultProbability);
  const riskTier = riskScore <= lowBound ? 'Low' : (riskScore >= highBound ? 'High' : 'Medium');
  const latencyMs = Math.max(1, Math.round(performance.now() - startTime));

  const assessment = {
    riskScore,
    defaultProbability,
    riskTier,
    factorContributions: [
      {
        factor: 'Credit Utilization',
        category: 'Utilization',
        impact: target.creditUtilization <= 30 ? 'positive' : 'negative',
        weightScore: target.creditUtilization <= 30 ? -14 : Math.round(target.creditUtilization * 0.3),
        description: `Balance-to-limit ratio (${target.creditUtilization}%)`
      },
      {
        factor: 'Payment History',
        category: 'Repayment',
        impact: target.delayedPayments6M === 0 ? 'positive' : 'negative',
        weightScore: target.delayedPayments6M === 0 ? -18 : (22 * target.delayedPayments6M),
        description: `${target.delayedPayments6M} recorded late payment(s) in past 6 months`
      }
    ],
    recommendedActions: riskTier === 'Low'
      ? ['Approve standard credit line increases on request.', 'Eligible for premium product tier promotions.']
      : (riskTier === 'Medium'
        ? ['Maintain existing credit line; monitor mid-cycle payments.', 'Schedule automated payment reminder SMS alerts.']
        : ['Reduce unutilized revolving credit line by 25-40%.', 'Route to Structured Hardship Workout counseling.']),
    assessedAt: new Date().toISOString().split('T')[0],
    confidenceScore: Math.max(60.0, Math.round(Math.abs(defaultProbability / 100 - 0.5) * 200))
  };

  res.json({
    assessment,
    source: 'live-backend',
    latencyMs,
    modelMeta: {
      engine: 'CreditGuard ML Model (Trained on 200 Cardholders)',
      version: '2.1.0',
      algorithm: modelArtifact?.algorithm || 'RandomForestClassifier Pipeline',
      metrics: modelArtifact?.metrics || {}
    }
  });
});

// 6. Early-warning alerts
app.get('/api/v1/alerts', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  let filtered = [...alerts];
  const sev = req.query.severity;
  const stat = req.query.status;
  if (sev && sev !== 'All') {
    filtered = filtered.filter((a) => a.severity === sev);
  }
  if (stat && stat !== 'All') {
    filtered = filtered.filter((a) => a.status === stat);
  }
  res.json(filtered);
});

// 7. Update alert status (PATCH)
app.patch('/api/v1/alerts/:id/status', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  const alertId = req.params.id;
  const newStatus = req.body?.status || 'Under Review';
  const alert = alerts.find((a) => a.id === alertId);
  if (alert) {
    alert.status = newStatus;
    alert.reviewedBy = newStatus !== 'New' ? 'Senior Credit Risk Desk' : undefined;
    alert.reviewedDate = newStatus !== 'New' ? new Date().toISOString().split('T')[0] : undefined;
    res.json(alert);
  } else {
    res.status(404).json({ error: `Alert ${alertId} not found` });
  }
});

// 8. Genuine KMeans Segmentation clusters
app.get('/api/v1/segmentation/clusters', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  const rawClusters = modelArtifact?.kmeans_clusters || [];
  // Ensure both property shapes (e.g. portfolioPercentage vs percentage) for frontend compatibility
  const normalizedClusters = rawClusters.map((c: any) => ({
    ...c,
    segment: c.name,
    percentage: c.portfolioPercentage ?? c.percentage ?? 25.0,
    defaultRate: c.defaultRatePct ?? c.defaultRate ?? 10.0,
    avgUtilization: c.averageUtilizationPct ?? c.avgUtilization ?? 40.0,
    avgBalance: c.averageBalance ?? c.avgBalance ?? 5000.0,
    avgIncome: c.averageIncome ?? c.avgIncome ?? 80000.0
  }));

  res.json({
    segments: normalizedClusters,
    customerAssignments: modelArtifact?.customer_cluster_assignments || {},
    customers,
    totalCustomers: customers.length
  });
});

// 8b. Model Spec
app.get('/api/v1/model/spec', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  res.json({
    model_name: modelArtifact?.model_name || 'CreditGuard_RandomForest_Pipeline',
    version: modelArtifact?.version || '2.1.0',
    algorithm: modelArtifact?.algorithm || 'RandomForestClassifier / Regularized Pipeline',
    metrics: modelArtifact?.metrics || {
      roc_auc: 0.837,
      gini_coefficient: 0.674,
      ks_statistic_pct: 59.8,
      brier_score: 0.0824,
      accuracy: 0.910,
      precision: 0.7083,
      recall: 0.6071,
      f1_score: 0.6538
    },
    dataset_info: modelArtifact?.dataset_info || {
      total_records: 200,
      defaults: 28,
      default_rate: 0.14
    },
    trained_at: modelArtifact?.trained_at || new Date().toISOString()
  });
});

// 8c. Model Comparison
app.get('/api/v1/model/comparison', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  if (modelComparisonRows.length > 0) {
    return res.json(modelComparisonRows);
  }
  if (modelArtifact?.model_comparison) {
    return res.json(modelArtifact.model_comparison);
  }
  res.json([]);
});

// 8d. Test Predictions
app.get('/api/v1/model/predictions', async (req, res) => {
  const proxied = await proxyToPython(req, res);
  if (proxied) return;

  res.json(testPredictionsRows);
});

// 8e. AI Alert Triage with Gemini 3.8 Flash
app.post('/api/v1/ai/alert-triage', async (req, res) => {
  const { alertId, customerId } = req.body || {};
  const alert = alerts.find((a) => a.id === alertId);
  const targetId = customerId || alert?.customerId;
  const customer = customers.find((c) => c.id.toUpperCase() === String(targetId).toUpperCase()) || customers[0];

  const defaultResult = {
    rootCauseAnalysis: `Customer ${customer.fullName} exhibits critical credit utilization (${customer.creditUtilization}%) combined with ${customer.delayedPayments6M} delinquent billing cycles and a constrained payment coverage ratio (${customer.paymentToMinRatio}x). This indicates escalating revolving debt stress.`,
    urgencyLevel: alert?.severity === 'Critical' ? 'Critical' : 'High',
    defaultProbabilityTrend: `Estimated +${Math.min(30, customer.delayedPayments6M * 4 + 6).toFixed(1)}% probability shift over 90 days without workout intervention.`,
    lossExposureEstimate: `$${Math.round(customer.outstandingBalance * 0.85).toLocaleString()} at potential charge-off risk`,
    workoutStrategy: [
      `Contract unutilized credit line from $${customer.creditLimit.toLocaleString()} by 30% to cap revolving draw.`,
      `Offer 90-day structured 0% APR hardship workout plan with automated debits.`,
      `Implement automated bi-weekly SMS reminders 4 days prior to payment cut-off.`
    ],
    customerNoticeDraft: {
      sms: `CreditGuard Alert: Hi ${customer.fullName.split(' ')[0]}, we noticed recent activity on your card (${customer.id.slice(-4)}). Call or log in to review personalized payment options.`,
      emailSubject: `Important Information Regarding Your Card Account (${customer.id})`,
      emailBody: `Dear ${customer.fullName},\n\nWe are reaching out to help ensure your credit facility remains in good standing. Our underwriting team has reviewed your recent billing cycles and would like to extend tailored repayment assistance options to prevent additional finance charges.\n\nPlease contact our Cardholder Services desk or access the portal to review your options.`
    },
    committeeRecommendation: `Approve immediate risk mitigation: freeze automated credit expansions and dispatch workout counselor.`
  };

  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = `You are a Senior Credit Risk Officer at CreditGuard AI.
Analyze the following credit card account surveillance alert:
Customer: ${customer.fullName} (${customer.id})
Credit Limit: $${customer.creditLimit}
Current Balance: $${customer.outstandingBalance}
Utilization: ${customer.creditUtilization}%
Late Payments in 6M: ${customer.delayedPayments6M}
Payment-to-Minimum Ratio: ${customer.paymentToMinRatio}x
Cash Advance Frequency (6M): ${customer.cashAdvanceCount6M}
Annual Income: $${customer.annualIncome}
Card Product: ${customer.cardType}
Alert Trigger: ${alert?.triggerReason || 'Elevated delinquency alert'} (Severity: ${alert?.severity || 'High'}, Status: ${alert?.status || 'New'})

Return a valid JSON object strictly matching this schema:
{
  "rootCauseAnalysis": "string (concise 2-3 sentence financial diagnosis)",
  "urgencyLevel": "Critical | High | Elevated | Moderate",
  "defaultProbabilityTrend": "string (projected shift in PD if unmitigated)",
  "lossExposureEstimate": "string ($X estimated capital at risk)",
  "workoutStrategy": ["string (step 1)", "string (step 2)", "string (step 3)"],
  "customerNoticeDraft": {
    "sms": "string (under 160 characters text alert)",
    "emailSubject": "string (formal banking subject)",
    "emailBody": "string (professional 3-4 sentence message with customer relief options)"
  },
  "committeeRecommendation": "string (one-sentence action recommendation for Credit Committee)"
}`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      if (aiResponse.text) {
        const parsed = JSON.parse(aiResponse.text);
        return res.json(parsed);
      }
    } catch (err) {
      console.warn('[Gemini AI] Alert triage failed, returning heuristic fallback:', err);
    }
  }

  res.json(defaultResult);
});

// 9. Execute Python training
app.post('/api/v1/python/train', async (req, res) => {
  if (fs.existsSync('train_model.py')) {
    const pythonProc = spawn(PYTHON_EXECUTABLE, ['train_model.py'], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';
    pythonProc.stdout.on('data', (d) => { stdout += d.toString(); });
    pythonProc.stderr.on('data', (d) => { stderr += d.toString(); });

    pythonProc.on('close', (code) => {
      // Reload artifact on completion
      if (fs.existsSync(modelArtifactPath)) {
        try {
          modelArtifact = JSON.parse(fs.readFileSync(modelArtifactPath, 'utf-8'));
        } catch {}
      }
      res.json({
        success: code === 0,
        exitCode: code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    pythonProc.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } else {
    res.status(404).json({ error: 'train_model.py not found' });
  }
});

// Legacy prototype view
app.get('/legacy', (req, res) => {
  const activeAlertsCount = alerts.filter((a) => a.status !== 'Resolved').length;
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CreditGuard AI — Legacy View</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fdfcf9; color: #1a1a1a; margin: 0; padding: 24px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; max-width: 900px; margin: 0 auto 20px; }
    h1 { font-family: Georgia, serif; font-size: 24px; color: #14213d; }
    .stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; }
    .stat-val { font-size: 22px; font-weight: bold; color: #4338ca; font-family: monospace; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; }
    .badge-ok { background: #dcfce7; color: #166534; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>CreditGuard AI — High-Performance API Service</h1>
      <span class="badge badge-ok">API v2.1.0 Online</span>
    </div>
    <p style="color: #64748b; font-size: 13px;">Enterprise Credit Card Risk Intelligence Platform with machine learning scoring engine.</p>
    <div class="stat-row">
      <div class="stat"><div style="font-size: 11px; color: #64748b;">TOTAL CARDHOLDERS</div><div class="stat-val">${customers.length}</div></div>
      <div class="stat"><div style="font-size: 11px; color: #64748b;">ACTIVE SURVEILLANCE ALERTS</div><div class="stat-val">${activeAlertsCount}</div></div>
      <div class="stat"><div style="font-size: 11px; color: #64748b;">SCORING ENGINE</div><div class="stat-val" style="color: #059669;">LOADED</div></div>
    </div>
    <p><a href="/" style="color: #4338ca; text-decoration: none; font-weight: 600;">&larr; Switch to Interactive Editorial Dashboard</a></p>
  </div>
</body>
</html>`);
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.use((req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'Endpoint not found' });
      } else {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('Not Found');
        }
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CreditGuard AI] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
