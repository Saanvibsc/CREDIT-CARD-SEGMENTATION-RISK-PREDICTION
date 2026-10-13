import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cpu, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  User, 
  DollarSign, 
  Percent, 
  SlidersHorizontal,
  ChevronRight,
  Info,
  BarChart3,
  Award,
  Layers,
  FileCheck
} from 'lucide-react';
import { Customer, RiskConfig, PredictionResponse, FactorContribution, NavPage, ModelBenchmark } from '../types';
import { api } from '../services/api';
import { getCalibratedScore10, getCalibratedCategory } from '../utils/scoringEngine';

interface PredictionViewProps {
  selectedCustomerId: string;
  customers: Customer[];
  config: RiskConfig;
  onSelectCustomer: (id: string) => void;
  onNavigate?: (page: NavPage) => void;
}

const CONFUSION_MATRICES: Record<string, {
  name: string;
  type: string;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
  description: string;
}> = {
  'Gradient Boosting Classifier': {
    name: 'Gradient Boosting Classifier',
    type: 'Production Primary (30 Trees, Depth 2, LR 0.20)',
    tp: 14,
    tn: 166,
    fp: 6,
    fn: 14,
    accuracy: 90.0,
    precision: 70.0,
    recall: 50.0,
    specificity: 96.5,
    f1: 0.5833,
    description: 'Conservative, high-precision production estimator. Produces only 6 false alarms across 172 non-defaulting accounts (96.5% specificity) with the lowest Brier calibration error (0.0805) and 64.2% KS separation.'
  },
  'Random Forest Classifier': {
    name: 'Random Forest Classifier',
    type: 'Challenger (24 Trees, Depth 3)',
    tp: 16,
    tn: 167,
    fp: 5,
    fn: 12,
    accuracy: 91.5,
    precision: 76.2,
    recall: 57.1,
    specificity: 97.1,
    f1: 0.6531,
    description: 'Highest raw accuracy (91.5%) and catches 16 of 28 defaulters with only 5 false positives. However, exhibited higher fold-to-fold cross-validation variance (ROC-AUC std ±0.1427).'
  },
  'Gaussian Naive Bayes': {
    name: 'Gaussian Naive Bayes',
    type: 'Challenger (Probabilistic Likelihoods)',
    tp: 19,
    tn: 152,
    fp: 20,
    fn: 9,
    accuracy: 85.5,
    precision: 48.7,
    recall: 67.9,
    specificity: 88.4,
    f1: 0.5672,
    description: 'Aggressive recall strategy: catches 19 out of 28 defaulters (67.9% recall), but incurs 20 false positives on creditworthy customers (higher underwriting friction).'
  },
  'Regularized Logistic Regression': {
    name: 'Regularized Logistic Regression',
    type: 'Basel II Benchmark (L2 Ridge Regularization)',
    tp: 18,
    tn: 153,
    fp: 19,
    fn: 10,
    accuracy: 85.5,
    precision: 48.6,
    recall: 64.3,
    specificity: 89.0,
    f1: 0.5538,
    description: 'Traditional Basel II linear benchmark with log-odds scoring. Catches 18 defaulters while generating 19 false alarms, yielding 85.5% accuracy.'
  }
};

export const PredictionView: React.FC<PredictionViewProps> = ({
  selectedCustomerId,
  customers,
  config,
  onSelectCustomer,
  onNavigate
}) => {
  // Navigation / View Tab
  const [activeTab, setActiveTab] = useState<'simulator' | 'benchmarks'>('simulator');
  const [benchmarks, setBenchmarks] = useState<ModelBenchmark[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState<boolean>(false);
  const [selectedMatrixModel, setSelectedMatrixModel] = useState<string>('Gradient Boosting Classifier');

  // Underwriting Decision State (consolidated from RiskAssessment)
  const [committeeAction, setCommitteeAction] = useState<string>('Approve Standard Line');
  const [committeeNote, setCommitteeNote] = useState<string>('');
  const [decisionLogged, setDecisionLogged] = useState<boolean>(false);

  // Active selected customer
  const currentCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  // Editable financial inputs (What-If form state)
  const [utilization, setUtilization] = useState<number>(35);
  const [delayedPayments, setDelayedPayments] = useState<number>(0);
  const [annualIncome, setAnnualIncome] = useState<number>(65000);
  const [creditLimit, setCreditLimit] = useState<number>(15000);
  const [outstandingBalance, setOutstandingBalance] = useState<number>(5000);
  const [cashAdvances, setCashAdvances] = useState<number>(0);
  const [creditHistoryYears, setCreditHistoryYears] = useState<number>(4.5);
  const [age, setAge] = useState<number>(35);

  // Prediction states
  const [baselinePrediction, setBaselinePrediction] = useState<PredictionResponse | null>(null);
  const [predictionResult, setPredictionResult] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string>('');
  const [isModified, setIsModified] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Load Model Comparison Benchmarks
  useEffect(() => {
    setBenchmarksLoading(true);
    api.getValidationModels()
      .then((data: ModelBenchmark[]) => {
        setBenchmarks(data);
      })
      .catch((err) => {
        console.warn('Could not load validation model benchmarks:', err);
      })
      .finally(() => {
        setBenchmarksLoading(false);
      });
  }, []);

  // Sync inputs when customer selection changes
  useEffect(() => {
    if (currentCustomer) {
      const util = currentCustomer.creditUtilization || 35.0;
      const delays = currentCustomer.delayedPayments6M || 0;
      const inc = currentCustomer.annualIncome || 65000;
      const lim = currentCustomer.creditLimit || 15000;
      const bal = currentCustomer.outstandingBalance || 0;
      const cash = currentCustomer.cashAdvanceCount6M || 0;
      const hist = currentCustomer.creditHistoryYears || 4.5;
      const cAge = currentCustomer.age || 35;

      setUtilization(util);
      setDelayedPayments(delays);
      setAnnualIncome(inc);
      setCreditLimit(lim);
      setOutstandingBalance(bal);
      setCashAdvances(cash);
      setCreditHistoryYears(hist);
      setAge(cAge);
      setIsModified(false);

      // Fetch baseline prediction for this customer
      fetchBaselineAndPrediction(currentCustomer.id, {
        utilization: util,
        delayedPayments: delays,
        annualIncome: inc,
        creditLimit: lim,
        outstandingBalance: bal
      });
    }
  }, [currentCustomer?.id]);

  const fetchBaselineAndPrediction = async (cid: string, overrides?: Record<string, number>) => {
    setIsLoading(true);
    setApiError('');
    try {
      // 1. Fetch baseline
      const baseRes = await api.predictRisk(cid, undefined, config);
      setBaselinePrediction(baseRes);

      // 2. Fetch current prediction (if overrides differ)
      if (overrides) {
        const simRes = await api.predictRisk(cid, overrides, config);
        setPredictionResult(simRes);
      } else {
        setPredictionResult(baseRes);
      }
    } catch (err: unknown) {
      console.error('Prediction API call failed:', err);
      setApiError(err instanceof Error ? err.message : 'Error connecting to Flask prediction API');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePredictRisk = async () => {
    if (!currentCustomer) return;
    setIsLoading(true);
    setApiError('');

    const overrides = {
      utilization,
      delayedPayments,
      annualIncome,
      creditLimit,
      outstandingBalance
    };

    try {
      const res = await api.predictRisk(currentCustomer.id, overrides, config);
      setPredictionResult(res);
      setIsModified(true);
    } catch (err: unknown) {
      console.error('Error during predict risk:', err);
      setApiError(err instanceof Error ? err.message : 'Prediction request failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetToBaseline = () => {
    if (!currentCustomer) return;
    const util = currentCustomer.creditUtilization || 35.0;
    const delays = currentCustomer.delayedPayments6M || 0;
    const inc = currentCustomer.annualIncome || 65000;
    const lim = currentCustomer.creditLimit || 15000;
    const bal = currentCustomer.outstandingBalance || 0;
    const cash = currentCustomer.cashAdvanceCount6M || 0;
    const hist = currentCustomer.creditHistoryYears || 4.5;
    const cAge = currentCustomer.age || 35;

    setUtilization(util);
    setDelayedPayments(delays);
    setAnnualIncome(inc);
    setCreditLimit(lim);
    setOutstandingBalance(bal);
    setCashAdvances(cash);
    setCreditHistoryYears(hist);
    setAge(cAge);
    setIsModified(false);

    if (baselinePrediction) {
      setPredictionResult(baselinePrediction);
    } else {
      fetchBaselineAndPrediction(currentCustomer.id);
    }
  };

  // What-if scenario presets
  const applyPreset = (preset: 'stress' | 'prime' | 'expand') => {
    if (!currentCustomer) return;
    setIsModified(true);

    if (preset === 'stress') {
      setUtilization(95.0);
      setDelayedPayments(4);
      setOutstandingBalance(Math.round(creditLimit * 0.95));
      setAnnualIncome(Math.round(annualIncome * 0.8));
    } else if (preset === 'prime') {
      setUtilization(12.0);
      setDelayedPayments(0);
      setOutstandingBalance(Math.round(creditLimit * 0.12));
    } else if (preset === 'expand') {
      const newLimit = Math.round(creditLimit * 1.5);
      setCreditLimit(newLimit);
      setUtilization(parseFloat(((outstandingBalance / newLimit) * 100).toFixed(1)));
    }
  };

  // Filtered customer list for switcher
  const filteredCustomers = useMemo(() => {
    if (!searchFilter.trim()) return customers;
    const q = searchFilter.toLowerCase();
    return customers.filter(c => c.id.toLowerCase().includes(q) || c.fullName.toLowerCase().includes(q));
  }, [customers, searchFilter]);

  // Risk styling helpers
  const getTierColor = (tier?: string) => {
    switch (tier) {
      case 'Low':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          badge: 'bg-emerald-600 text-white',
          text: 'text-emerald-700',
          indicator: 'bg-emerald-500'
        };
      case 'Medium':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          badge: 'bg-amber-600 text-white',
          text: 'text-amber-700',
          indicator: 'bg-amber-500'
        };
      case 'High':
      default:
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          badge: 'bg-rose-600 text-white',
          text: 'text-rose-700',
          indicator: 'bg-rose-500'
        };
    }
  };

  const assessment = predictionResult?.assessment;
  const baseAssessment = baselinePrediction?.assessment;
  const tierColor = getTierColor(assessment?.riskTier);

  // Compute what-if delta
  const pdDelta = assessment && baseAssessment 
    ? parseFloat((assessment.defaultProbability - baseAssessment.defaultProbability).toFixed(1))
    : null;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="mono text-xs font-bold uppercase tracking-wider text-[#4338ca] bg-indigo-50 px-2 py-0.5 rounded-sm border border-indigo-200">
              Live Estimator Engine
            </span>
            <span className="text-xs text-gray-500 font-mono">
              model.pkl · 5-Fold Stratified CV
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#14213d] tracking-tight">
            Credit Risk Prediction & What-If Simulator
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">
            Evaluate live default probabilities, score adjustments, and feature explanations using the trained Gradient Boosting estimator connected to the Flask API.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-right shadow-2xs">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono">Model Algorithm</div>
            <div className="text-xs font-bold text-[#14213d]">Gradient Boosting Classifier</div>
          </div>
        </div>
      </div>

      {/* Primary Workspace View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 border border-gray-200 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-[#14213d] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>What-If Scenario Simulator & Underwriting</span>
          </button>

          <button
            onClick={() => setActiveTab('benchmarks')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'benchmarks'
                ? 'bg-[#4338ca] text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Multi-Model Evaluation & Benchmarks ({benchmarks.length || 4} Algorithms)</span>
          </button>
        </div>

        {activeTab === 'simulator' && (
          <div className="text-xs text-gray-500 font-mono pr-2">
            Cardholder: <span className="font-bold text-gray-800">{currentCustomer?.id}</span> ({currentCustomer?.fullName})
          </div>
        )}
      </div>

      {apiError && (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Prediction Request Error: </span>
            {apiError}
          </div>
        </div>
      )}

      {/* Main Grid: Customer & Inputs on Left, Results on Right */}
      {activeTab === 'simulator' ? (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Customer Selector & Financial Inputs (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card 1: Customer Selection */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <label htmlFor="customer-select" className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                <User className="w-4 h-4 text-[#4338ca]" />
                Select Customer Account
              </label>
              <span className="text-xs font-mono text-gray-500">
                {customers.length} Accounts
              </span>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Search by ID (e.g. CUST000001) or name..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#4338ca] bg-gray-50"
              />

              <select
                id="customer-select"
                value={selectedCustomerId}
                onChange={(e) => onSelectCustomer(e.target.value)}
                className="w-full text-sm font-medium px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4338ca] focus:border-[#4338ca] bg-white text-[#14213d]"
              >
                {filteredCustomers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.fullName} ({c.cardType} · Util: {c.creditUtilization}%)
                  </option>
                ))}
              </select>

              {currentCustomer && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Cardholder:</span>
                    <span className="font-semibold text-gray-900">{currentCustomer.fullName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Card Type / Segment:</span>
                    <span className="font-mono text-indigo-700 font-medium">{currentCustomer.cardType} · {currentCustomer.segment}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Historical Defaults:</span>
                    <span className={`font-mono font-bold ${currentCustomer.actualDefault === 1 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {currentCustomer.actualDefault === 1 ? '1 (Defaulted)' : '0 (Non-Default)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Editable Financial Inputs (What-If Variables) */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-2xs space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#4338ca]" />
                <h3 className="text-sm font-bold text-[#14213d]">Editable Financial Inputs</h3>
              </div>
              <button
                type="button"
                onClick={handleResetToBaseline}
                className="text-xs font-semibold text-gray-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                title="Reset all inputs back to customer baseline"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Baseline
              </button>
            </div>

            {/* Presets */}
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block mb-2">
                Quick Scenario Presets:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('stress')}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors text-center cursor-pointer"
                >
                  Stress Test
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('prime')}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-center cursor-pointer"
                >
                  Prime Scenario
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('expand')}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-center cursor-pointer"
                >
                  +50% Limit
                </button>
              </div>
            </div>

            {/* Input Controls */}
            <div className="space-y-4 pt-1">
              
              {/* Credit Utilization */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-gray-700 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-gray-400" />
                    Credit Utilization Rate
                  </span>
                  <span className="font-mono font-bold text-gray-900">{utilization}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={utilization}
                  onChange={(e) => {
                    const u = parseFloat(e.target.value);
                    setUtilization(u);
                    setOutstandingBalance(Math.round(creditLimit * (u / 100)));
                    setIsModified(true);
                  }}
                  className="w-full accent-[#4338ca] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-0.5">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Delayed Payments */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-semibold text-gray-700">Delayed Payments (Past 6 Months)</span>
                  <span className="font-mono font-bold text-gray-900">{delayedPayments} cycles</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setDelayedPayments(num);
                        setIsModified(true);
                      }}
                      className={`py-1.5 text-xs font-mono font-bold rounded border transition-colors cursor-pointer ${
                        delayedPayments === num
                          ? 'bg-[#14213d] text-white border-[#14213d]'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Annual Income */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Annual Income ($)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-xs">$</span>
                  <input
                    type="number"
                    min="10000"
                    step="5000"
                    value={annualIncome}
                    onChange={(e) => {
                      setAnnualIncome(Math.max(1000, Number(e.target.value)));
                      setIsModified(true);
                    }}
                    className="w-full pl-7 pr-3 py-2 text-xs font-mono font-medium border border-gray-300 rounded-lg focus:outline-none focus:border-[#4338ca]"
                  />
                </div>
              </div>

              {/* Credit Limit & Balance in 2 cols */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Credit Limit ($)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={creditLimit}
                    onChange={(e) => {
                      const lim = Math.max(500, Number(e.target.value));
                      setCreditLimit(lim);
                      setUtilization(parseFloat(((outstandingBalance / lim) * 100).toFixed(1)));
                      setIsModified(true);
                    }}
                    className="w-full px-3 py-2 text-xs font-mono font-medium border border-gray-300 rounded-lg focus:outline-none focus:border-[#4338ca]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Revolving Balance ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={outstandingBalance}
                    onChange={(e) => {
                      const bal = Math.max(0, Number(e.target.value));
                      setOutstandingBalance(bal);
                      setUtilization(parseFloat(((bal / Math.max(creditLimit, 1)) * 100).toFixed(1)));
                      setIsModified(true);
                    }}
                    className="w-full px-3 py-2 text-xs font-mono font-medium border border-gray-300 rounded-lg focus:outline-none focus:border-[#4338ca]"
                  />
                </div>
              </div>

              {/* Debt-to-Income Indicator */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs flex justify-between items-center">
                <span className="text-gray-600 font-medium">Estimated Card DTI Ratio:</span>
                <span className="font-mono font-bold text-gray-900">
                  {((outstandingBalance / Math.max(annualIncome, 10000)) * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* PREDICT RISK BUTTON */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handlePredictRisk}
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-[#4338ca] hover:bg-[#3730a3] disabled:bg-indigo-300 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Evaluating ML Estimator...</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-4.5 h-4.5" />
                    <span>Predict Risk</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Actual Default Probability, Risk Score, Category & Explanations (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Prediction Output Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <span className="text-xs uppercase font-mono tracking-wider text-gray-400">Model Inference Output</span>
                <h2 className="text-lg font-bold text-[#14213d] flex items-center gap-2">
                  <span>Actual Credit Risk Assessment</span>
                  {predictionResult?.latencyMs !== undefined && (
                    <span className="text-[11px] font-normal font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-sm">
                      {predictionResult.latencyMs}ms response
                    </span>
                  )}
                </h2>
              </div>

              {isModified && (
                <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>What-If Simulated Prediction</span>
                </div>
              )}
            </div>

            {/* Core Output Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* Metric 1: Default Probability */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="text-[11px] uppercase font-bold text-gray-500 tracking-wider">
                    Default Probability (Chance of Missing Payments)
                  </div>
                  <div className="text-3xl font-serif font-bold text-[#14213d] mt-2">
                    {assessment ? `${assessment.defaultProbability.toFixed(1)}%` : '—'}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Chance this cardholder misses 90+ days of bills
                  </p>
                </div>

                {pdDelta !== null && isModified && (
                  <div className="mt-2 text-xs flex items-center gap-1 font-mono">
                    {pdDelta > 0 ? (
                      <span className="text-rose-600 flex items-center font-bold">
                        <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                        +{pdDelta}% vs baseline
                      </span>
                    ) : pdDelta < 0 ? (
                      <span className="text-emerald-600 flex items-center font-bold">
                        <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                        {pdDelta}% vs baseline
                      </span>
                    ) : (
                      <span className="text-gray-500">No change</span>
                    )}
                  </div>
                )}
              </div>

              {/* Metric 2: Calibrated 1-10 Risk Score */}
              {(() => {
                const score10 = getCalibratedScore10(assessment?.riskScore || 20);
                const catInfo = getCalibratedCategory(score10);
                return (
                  <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="text-[11px] uppercase font-bold text-indigo-900 tracking-wider flex items-center justify-between">
                        <span>Risk Grade (1–10 Scale)</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-bold ${catInfo.badgeClass}`}>
                          {catInfo.label}
                        </span>
                      </div>
                      <div className="text-3xl font-mono font-bold text-[#4338ca] mt-2 flex items-baseline gap-1">
                        <span>Grade {score10}</span>
                        <span className="text-xs text-indigo-500 font-normal"> / 10</span>
                      </div>
                      <p className="text-[11px] text-indigo-900/70 mt-1">
                        1 = Safest cardholder · 10 = Immediate default
                      </p>
                    </div>

                    {/* 10-step segmented bar */}
                    <div className="mt-3">
                      <div className="grid grid-cols-10 gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((step) => (
                          <div
                            key={step}
                            className={`h-2 rounded-xs transition-all ${
                              step <= score10
                                ? step <= 4 ? 'bg-emerald-500' : step <= 7 ? 'bg-amber-500' : 'bg-rose-500'
                                : 'bg-indigo-200/50'
                            }`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-gray-500 mt-1">
                        <span>1 Safe</span>
                        <span>10 High Danger</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Metric 3: Risk Category / Tier */}
              <div className={`p-4 border rounded-xl flex flex-col justify-between ${tierColor.bg}`}>
                <div>
                  <div className="text-[11px] uppercase font-bold tracking-wider opacity-80">
                    Risk Band &amp; Health Category
                  </div>
                  <div className="text-2xl font-bold mt-2 flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${tierColor.indicator}`} />
                    <span>{assessment?.riskTier || '—'} Risk</span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-1">
                    {assessment?.riskTier === 'Low' ? 'Prime cardholder; eligible for limit expansion.' :
                     assessment?.riskTier === 'Medium' ? 'Moderate exposure; keep credit line steady.' :
                     'High exposure; requires proactive payment reminders.'}
                  </p>
                </div>

                <div className="mt-2 text-[11px] font-mono opacity-80">
                  Raw Score: {assessment?.riskScore || 0}/100
                </div>
              </div>
            </div>

            {/* Model-Based Explanations: Factor Contributions */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#14213d] flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-[#4338ca]" />
                  SHAP Factor Attributions & Risk Drivers
                </h3>
                <span className="text-[11px] text-gray-500 font-mono">
                  Gradient Boosting Feature Weighting
                </span>
              </div>

              {assessment?.factorContributions && assessment.factorContributions.length > 0 ? (
                <div className="space-y-2.5">
                  {assessment.factorContributions.map((factor: FactorContribution, idx: number) => {
                    const isPositive = factor.impact === 'positive';
                    return (
                      <div 
                        key={idx}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#14213d]">{factor.factor}</span>
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-xs bg-gray-200 text-gray-700">
                              {factor.category}
                            </span>
                          </div>
                          <p className="text-gray-600">{factor.description}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-sm ${
                            isPositive 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isPositive ? 'Favorable' : 'Risk Driver'} ({factor.weightScore > 0 ? `+${factor.weightScore}` : factor.weightScore})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-gray-50 text-gray-400 text-xs text-center rounded-lg">
                  No factor contributions returned by estimator.
                </div>
              )}
            </div>

            {/* Underwriting Committee Decision Log (Consolidated from RiskAssessment) */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#14213d] flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  Credit Underwriting Committee Decision Log
                </h3>
                {decisionLogged && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                    Audit Logged ✓
                  </span>
                )}
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Action Recommendation
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      'Approve Standard Line',
                      'Maintain on Watchlist',
                      'Contract Line by 25-40%'
                    ].map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => {
                          setCommitteeAction(action);
                          setDecisionLogged(false);
                        }}
                        className={`py-2 px-2.5 rounded-lg font-bold text-[11px] border text-center transition-all cursor-pointer ${
                          committeeAction === action
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Underwriter Rationale / Surveillance Note
                  </label>
                  <textarea
                    rows={2}
                    value={committeeNote}
                    onChange={(e) => {
                      setCommitteeNote(e.target.value);
                      setDecisionLogged(false);
                    }}
                    placeholder="Enter supervisory notes for Credit Committee audit file (e.g., Verified paydown behavior; debt-to-income remains manageable)..."
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Credit Risk Desk · Timestamp: {new Date().toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDecisionLogged(true)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    Log Decision
                  </button>
                </div>
              </div>
            </div>

            {/* Recommended Underwriting & Credit Actions */}
            {assessment?.recommendedActions && assessment.recommendedActions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <h3 className="text-sm font-bold text-[#14213d]">
                  Model Recommended Actions
                </h3>
                <ul className="space-y-1.5">
                  {assessment.recommendedActions.map((action: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-gray-700">
                      <ChevronRight className="w-4 h-4 text-[#4338ca] shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Estimator Provenance Footer */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-gray-500 font-mono">
              <div>
                <span>Source: </span>
                <span className="text-indigo-700 font-semibold">{predictionResult?.source || 'live-python-backend'}</span>
                <span> · Endpoint: </span>
                <span className="text-gray-800">/api/v1/risk/predict</span>
              </div>
              <div>
                <span>Confidence: </span>
                <span className="font-bold text-gray-800">{assessment?.confidenceScore || 85}%</span>
              </div>
            </div>
          </div>
        </div>

      </div>
      ) : (
        /* VIEW B: MULTI-MODEL EVALUATION BENCHMARKS */
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                Model Selection & Validation
              </span>
              <h2 className="text-lg font-bold text-[#14213d]">
                Multi-Model Cross-Validation & Benchmark Comparison Suite
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Evaluated across 5-Fold Stratified Cross-Validation on the cardholder ledger.
              The primary production model (Gradient Boosting) outperforms challenger models on ROC-AUC, Gini coefficient, and Kolmogorov-Smirnov (KS) discrimination.
            </p>
          </div>

          {/* Model Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-gray-200 rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-gray-200">
                  <th className="py-3 px-4">Model Candidate</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">ROC-AUC</th>
                  <th className="py-3 px-3 text-right">Gini</th>
                  <th className="py-3 px-3 text-right">KS Stat (%)</th>
                  <th className="py-3 px-3 text-right">Brier Score</th>
                  <th className="py-3 px-3 text-right">Precision</th>
                  <th className="py-3 px-3 text-right">Recall</th>
                  <th className="py-3 px-3 text-right">F1 Score</th>
                  <th className="py-3 px-3 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {benchmarks.map((m, idx) => {
                  const isPrimary = m.status?.includes('Primary') || idx === 0;
                  return (
                    <tr
                      key={idx}
                      className={isPrimary ? 'bg-indigo-50/50 font-semibold' : 'hover:bg-gray-50/70'}
                    >
                      <td className="py-3 px-4 font-sans font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          {isPrimary && <Award className="w-4 h-4 text-amber-500 shrink-0" />}
                          <div>
                            <div>{m.model_name}</div>
                            <div className="text-[10px] font-normal text-gray-500">{m.model_type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isPrimary 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          {m.status || (isPrimary ? 'Primary' : 'Challenger')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#4338ca]">
                        {Number(m.roc_auc).toFixed(4)}
                        {m.roc_auc_std ? <span className="text-[10px] text-gray-400 font-normal"> ±{Number(m.roc_auc_std).toFixed(2)}</span> : ''}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-800">{Number(m.gini_coefficient || 0).toFixed(4)}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">{Number(m.ks_statistic_pct || 0).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right text-emerald-700">{Number(m.brier_score || 0).toFixed(4)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{Number(m.precision || 0).toFixed(3)}</td>
                      <td className="py-3 px-3 text-right text-gray-700">{Number(m.recall || 0).toFixed(3)}</td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900">{Number(m.f1_score || 0).toFixed(3)}</td>
                      <td className="py-3 px-3 text-right text-gray-800">{Number(m.accuracy_pct || 0).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Visual ROC-AUC Comparison */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              ROC-AUC Discriminative Power Comparison
            </h4>
            <div className="space-y-2">
              {benchmarks.map((m, idx) => {
                const aucPct = Math.round((Number(m.roc_auc) || 0.8) * 100);
                const isPrimary = m.status?.includes('Primary') || idx === 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-800">{m.model_name}</span>
                      <span className="font-mono font-bold text-slate-900">{Number(m.roc_auc).toFixed(4)}</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPrimary ? 'bg-[#4338ca]' : 'bg-slate-500'
                        }`}
                        style={{ width: `${aucPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* INTERACTIVE CONFUSION MATRIX & CLASSIFICATION AUDIT */}
          {(() => {
            const currentMatrix = CONFUSION_MATRICES[selectedMatrixModel] || CONFUSION_MATRICES['Gradient Boosting Classifier'];
            const total = currentMatrix.tp + currentMatrix.tn + currentMatrix.fp + currentMatrix.fn;
            const actualDefaults = currentMatrix.tp + currentMatrix.fn;
            const actualNonDefaults = currentMatrix.tn + currentMatrix.fp;

            return (
              <div className="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 font-mono">
                        Validation Audit
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        Interactive Confusion Matrix (Out-of-Fold 200 Accounts)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Audits genuine prediction outcomes against verified 90-day defaults on held-out folds.
                    </p>
                  </div>

                  {/* Model Selector Pill Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                    {Object.keys(CONFUSION_MATRICES).map((modelKey) => (
                      <button
                        key={modelKey}
                        onClick={() => setSelectedMatrixModel(modelKey)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedMatrixModel === modelKey
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                      >
                        {modelKey.split(' ')[0]} {modelKey.split(' ')[1] || ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-950">{currentMatrix.name}</span>
                    <span className="text-indigo-800"> — {currentMatrix.type}: </span>
                    <span className="text-slate-700">{currentMatrix.description}</span>
                  </div>
                </div>

                {/* 2x2 Matrix & Metrics Summary Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column: 2x2 Heatmap Table (7 cols) */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                      <span>Total Test Cohort: <strong>{total} cardholders</strong></span>
                      <span>Defaults: <strong>{actualDefaults} ({((actualDefaults/total)*100).toFixed(0)}%)</strong> · Non-Defaults: <strong>{actualNonDefaults} ({((actualNonDefaults/total)*100).toFixed(0)}%)</strong></span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 text-xs">
                      {/* Matrix Header */}
                      <div className="grid grid-cols-12 bg-slate-100 font-bold text-slate-700 text-center py-2.5 border-b border-slate-200">
                        <div className="col-span-4 text-left pl-3 text-slate-500 font-normal">Ground Truth ↓ / Pred →</div>
                        <div className="col-span-4 text-emerald-800">Predicted Non-Default (0)</div>
                        <div className="col-span-4 text-rose-800">Predicted Default (1)</div>
                      </div>

                      {/* Row 1: Actual Non-Default */}
                      <div className="grid grid-cols-12 border-b border-slate-200 items-stretch">
                        <div className="col-span-4 bg-slate-100/70 p-3 flex flex-col justify-center border-r border-slate-200">
                          <span className="font-bold text-slate-800">Actual Non-Default (0)</span>
                          <span className="text-[10px] text-slate-500 font-mono">{actualNonDefaults} accounts</span>
                        </div>

                        {/* Top-Left: True Negative (TN) */}
                        <div className="col-span-4 p-4 bg-emerald-50/80 border-r border-slate-200 text-center flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">True Negative (TN)</span>
                          <span className="text-2xl font-black text-emerald-900 font-mono my-0.5">{currentMatrix.tn}</span>
                          <span className="text-[10px] text-emerald-600 font-medium">Safe accounts approved</span>
                          <span className="text-[9px] text-emerald-700 font-mono mt-0.5 bg-emerald-100 px-1.5 py-0.2 rounded font-bold">
                            {((currentMatrix.tn / actualNonDefaults) * 100).toFixed(1)}% of clean
                          </span>
                        </div>

                        {/* Top-Right: False Positive (FP) */}
                        <div className="col-span-4 p-4 bg-amber-50/80 text-center flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">False Positive (FP)</span>
                          <span className="text-2xl font-black text-amber-900 font-mono my-0.5">{currentMatrix.fp}</span>
                          <span className="text-[10px] text-amber-700 font-medium">False alarms (friction)</span>
                          <span className="text-[9px] text-amber-800 font-mono mt-0.5 bg-amber-100 px-1.5 py-0.2 rounded font-bold">
                            {((currentMatrix.fp / actualNonDefaults) * 100).toFixed(1)}% error rate
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Actual Default */}
                      <div className="grid grid-cols-12 items-stretch">
                        <div className="col-span-4 bg-slate-100/70 p-3 flex flex-col justify-center border-r border-slate-200">
                          <span className="font-bold text-rose-900">Actual Default (1)</span>
                          <span className="text-[10px] text-slate-500 font-mono">{actualDefaults} accounts</span>
                        </div>

                        {/* Bottom-Left: False Negative (FN) - Critical Risk */}
                        <div className="col-span-4 p-4 bg-rose-50/90 border-r border-slate-200 text-center flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">False Negative (FN)</span>
                          <span className="text-2xl font-black text-rose-900 font-mono my-0.5">{currentMatrix.fn}</span>
                          <span className="text-[10px] text-rose-700 font-medium">Missed defaults (Loss)</span>
                          <span className="text-[9px] text-rose-800 font-mono mt-0.5 bg-rose-100 px-1.5 py-0.2 rounded font-bold">
                            {((currentMatrix.fn / actualDefaults) * 100).toFixed(1)}% leakage
                          </span>
                        </div>

                        {/* Bottom-Right: True Positive (TP) - Defaulters Caught */}
                        <div className="col-span-4 p-4 bg-indigo-50/80 text-center flex flex-col items-center justify-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">True Positive (TP)</span>
                          <span className="text-2xl font-black text-indigo-900 font-mono my-0.5">{currentMatrix.tp}</span>
                          <span className="text-[10px] text-indigo-600 font-medium">Defaults caught</span>
                          <span className="text-[9px] text-indigo-700 font-mono mt-0.5 bg-indigo-100 px-1.5 py-0.2 rounded font-bold">
                            {((currentMatrix.tp / actualDefaults) * 100).toFixed(1)}% recall
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Diagnostic Ratios & Interpretation (5 cols) */}
                  <div className="lg:col-span-5 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Diagnostic Performance Ratios
                    </h4>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Accuracy</span>
                        <span className="text-lg font-mono font-bold text-slate-900">{currentMatrix.accuracy.toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-500 block">({currentMatrix.tp + currentMatrix.tn} / {total} correct)</span>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Precision</span>
                        <span className="text-lg font-mono font-bold text-slate-900">{currentMatrix.precision.toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-500 block">({currentMatrix.tp} / {currentMatrix.tp + currentMatrix.fp} flagged real)</span>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Recall (Sensitivity)</span>
                        <span className="text-lg font-mono font-bold text-slate-900">{currentMatrix.recall.toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-500 block">({currentMatrix.tp} / {actualDefaults} defaults caught)</span>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Specificity</span>
                        <span className="text-lg font-mono font-bold text-slate-900">{currentMatrix.specificity.toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-500 block">({currentMatrix.tn} / {actualNonDefaults} clean kept)</span>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-1 text-amber-900">
                      <span className="font-bold block">Credit Risk Implication:</span>
                      <p className="text-[11px] leading-relaxed text-amber-800">
                        In card lending, <strong>False Negatives (FN)</strong> result in principal charge-offs (~$5,000–$15,000 loss per account), whereas <strong>False Positives (FP)</strong> create customer friction or lower interest income. The production Gradient Boosting model maintains only <strong>{currentMatrix.fp} false alarms</strong> while catching high-severity delinquents.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* Plain English Metrics Glossary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>What Do These Machine Learning Numbers Mean? (Plain-English Guide)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900">ROC-AUC (Prediction Power):</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Measures how accurately the AI ranks risky borrowers above safe ones. 0.5 is guessing; <strong>0.8621</strong> means the AI is extremely reliable.
                </p>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900">Gini (Credit Discrimination):</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  A classic banking score from 0 to 1. A score of <strong>0.7243</strong> indicates top-tier ability to separate safe cardholders from high-risk accounts.
                </p>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900">KS Statistic (Separation Gap):</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Measures the gap between good and bad customer curves. <strong>64.2%</strong> allows underwriters to catch defaults months before they happen.
                </p>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900">Brier Score (Calibration Error):</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  How close the predicted percentage matches real life. Lower is better. <strong>0.0805</strong> means predicted probabilities are realistic.
                </p>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900">Precision &amp; Recall:</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Precision means few false alarms. Recall means catching real defaulters so the bank doesn&apos;t lose money.
                </p>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <span className="font-bold text-slate-900">Accuracy (90.0%):</span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Out of 100 cardholders, the model correctly predicts the financial outcome for 90 of them.
                </p>
              </div>
            </div>
          </div>

          {/* Regulatory & Methodology Card */}
          <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-1.5 text-amber-900">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <span>Model Risk Governance &amp; Methodology Note</span>
            </div>
            <p className="text-amber-800">
              All models were cross-validated using fold-isolated standard scalers to guarantee zero data leakage. 
              The Gradient Boosting pipeline achieved the lowest Brier Score (0.0805) and highest KS Statistic (64.2%), ensuring both superior probability calibration and separation between defaulting and non-defaulting cardholders.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
