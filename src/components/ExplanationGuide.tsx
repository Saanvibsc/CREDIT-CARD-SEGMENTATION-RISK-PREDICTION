import React, { useState } from 'react';
import { 
  ArrowRight, 
  HelpCircle, 
  CheckCircle2, 
  SlidersHorizontal, 
  ShieldAlert, 
  Sparkles, 
  Layers, 
  Cpu, 
  Users, 
  Activity, 
  ChevronRight,
  BookOpen,
  Info
} from 'lucide-react';
import { Customer, RiskConfig, NavPage } from '../types';
import { calculateRiskAssessment, getCalibratedScore10, getCalibratedCategory } from '../utils/scoringEngine';

interface ExplanationGuideProps {
  customers: Customer[];
  config: RiskConfig;
  onSelectCustomer: (id: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const ExplanationGuide: React.FC<ExplanationGuideProps> = ({
  customers,
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [selectedId, setSelectedId] = useState<string>(customers[0]?.id || 'CUST000001');
  const [activeStep, setActiveStep] = useState<number>(1);

  const activeCustomer = customers.find(c => c.id === selectedId) || customers[0] || null;
  const assessment = activeCustomer ? calculateRiskAssessment(activeCustomer, config) : null;
  const score10 = assessment ? getCalibratedScore10(assessment.riskScore) : 1;
  const catInfo = getCalibratedCategory(score10);

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="border-b border-slate-200 pb-5">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#4338ca] mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Interactive Guide &amp; Architecture</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-[#14213d] tracking-tight">
            How CreditGuard AI Works: Step-by-Step
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl leading-relaxed">
            Follow the complete credit risk analytics pipeline from a cardholder&apos;s raw statements to machine learning predictions, explainable SHAP factors, and final underwriting decisions.
          </p>
        </div>
      </header>

      {/* Customer Pipeline Walkthrough Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-[#4338ca] flex items-center justify-center font-bold text-sm">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Cardholder Walkthrough</h2>
            <p className="text-sm font-bold text-slate-900">
              {activeCustomer ? `${activeCustomer.fullName} (${activeCustomer.id})` : 'Select a customer'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">Test with profile:</span>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              onSelectCustomer(e.target.value);
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {customers.slice(0, 15).map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.fullName} ({c.cardType} · {c.segment})
              </option>
            ))}
          </select>

          <button
            onClick={() => onNavigate('prediction')}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Open in ML Simulator →
          </button>
        </div>
      </div>

      {/* PIPELINE CARDS CONTAINER (Matching user image style) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4.5 h-4.5 text-[#4338ca]" />
            <span>End-to-End Decision Pipeline Diagram</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">5 Sequential Stages</span>
        </div>

        {/* Horizontal Flow Container with Scroll */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
          
          {/* STEP 1: New Customer's Features (Faithfully formatted like user's uploaded image) */}
          <div 
            onClick={() => setActiveStep(1)}
            className={`border rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between transition-all cursor-pointer relative ${
              activeStep === 1 ? 'border-[#4338ca] ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              {/* Header: Circle with number and title */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  1
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">
                    New customer&apos;s features
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Raw Behavioral Inputs</span>
                </div>
              </div>

              {/* Bullet points list */}
              <ul className="space-y-2 text-xs text-slate-700 mb-6 pl-1">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>High credit utilisation</strong> ({activeCustomer?.creditUtilization?.toFixed(1) || '35.0'}%)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Repeated payment delays</strong> ({activeCustomer?.delayedPayments6M || 0} in 6M)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Irregular repayment behaviour</strong> ({activeCustomer?.paymentToMinRatio || 1}x min due)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Spending patterns</strong> (${Math.round(activeCustomer?.monthlyAverageSpend || 0).toLocaleString()}/mo)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Other available features</strong> (Cash draws, income, tenure)</span>
                </li>
              </ul>
            </div>

            {/* Bottom pill from image */}
            <div className="pt-2">
              <div className="w-full py-1.5 px-3 rounded-full border border-slate-300 bg-slate-100 text-slate-700 text-[11px] font-semibold text-center">
                default outcome not yet known
              </div>
            </div>
          </div>

          {/* STEP 2: Customer Segmentation */}
          <div 
            onClick={() => setActiveStep(2)}
            className={`border rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between transition-all cursor-pointer relative ${
              activeStep === 2 ? 'border-[#4338ca] ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  2
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">
                    Customer Segmentation
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-0.5">K-Means Peer Clustering</span>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-slate-700 mb-6 pl-1">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>K-Means clustering algorithm</strong> groups similar borrowers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Assigned segment</strong>: <span className="font-bold text-indigo-700">{activeCustomer?.segment}</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Quadrant mapping</strong>: Balance vs Utilization</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Identifies peer group risk benchmarks</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <div className="w-full py-1.5 px-3 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-800 text-[11px] font-semibold text-center">
                segment cohort identified
              </div>
            </div>
          </div>

          {/* STEP 3: Default Risk Prediction */}
          <div 
            onClick={() => setActiveStep(3)}
            className={`border rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between transition-all cursor-pointer relative ${
              activeStep === 3 ? 'border-[#4338ca] ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  3
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">
                    Default Risk Prediction
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Trained ML Model</span>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-slate-700 mb-6 pl-1">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Gradient Boosting Classifier</strong> (Primary ML model)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Evaluates historical default patterns</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Estimated PD</strong>: <span className="font-bold text-slate-900">{assessment?.defaultProbability || 14.0}%</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Calibrated probability with zero leakage</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <div className="w-full py-1.5 px-3 rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-[11px] font-semibold text-center">
                default probability (PD) estimated
              </div>
            </div>
          </div>

          {/* STEP 4: SHAP Explainability */}
          <div 
            onClick={() => setActiveStep(4)}
            className={`border rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between transition-all cursor-pointer relative ${
              activeStep === 4 ? 'border-[#4338ca] ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  4
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">
                    SHAP Explainability
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Transparent AI Reasons</span>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-slate-700 mb-6 pl-1">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Unpacks the AI decision into clear drivers</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Utilization impact</strong>: {activeCustomer && activeCustomer.creditUtilization <= 30 ? 'Favorable (-pts)' : 'Risk Driver (+pts)'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Late payment penalty</strong>: {activeCustomer && activeCustomer.delayedPayments6M > 0 ? 'Negative impact' : 'Pristine history'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Compliant with bank lending regulations</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <div className="w-full py-1.5 px-3 rounded-full border border-purple-200 bg-purple-50 text-purple-800 text-[11px] font-semibold text-center">
                reasons for decision explained
              </div>
            </div>
          </div>

          {/* STEP 5: 1-10 Risk Score & Policy */}
          <div 
            onClick={() => setActiveStep(5)}
            className={`border rounded-2xl p-5 bg-white shadow-xs flex flex-col justify-between transition-all cursor-pointer relative ${
              activeStep === 5 ? 'border-[#4338ca] ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  5
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">
                    1–10 Risk Score &amp; Policy
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Actionable Decision</span>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-slate-700 mb-6 pl-1">
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Calibrated Rating</strong>: <span className="font-bold text-indigo-700">Grade {score10} / 10</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span><strong>Category</strong>: <span className={`px-1.5 py-0.2 rounded font-bold ${catInfo.badgeClass}`}>{catInfo.label}</span></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Automated credit line policy recommendation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <span>Surveillance alerts logged to workout desk</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <div className="w-full py-1.5 px-3 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-semibold text-center">
                final underwriting decision
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* DETAIL BREAKDOWN PANEL FOR SELECTED STEP */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              {activeStep}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {activeStep === 1 && "Step 1 in Plain English: Collecting New Customer's Behavioral Features"}
                {activeStep === 2 && "Step 2 in Plain English: K-Means Customer Clustering & Segmentation"}
                {activeStep === 3 && "Step 3 in Plain English: How Machine Learning Predicts Default Risk"}
                {activeStep === 4 && "Step 4 in Plain English: Explainable AI & SHAP Feature Attributions"}
                {activeStep === 5 && "Step 5 in Plain English: Calibrated 1–10 Risk Scores & Credit Policy"}
              </h2>
              <p className="text-xs text-slate-500">
                Understanding the business and mathematical logic behind this phase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((step) => (
              <button
                key={step}
                onClick={() => setActiveStep(step)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeStep === step
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {step}
              </button>
            ))}
          </div>
        </div>

        {/* Narrative Content per step */}
        {activeStep === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-sm text-slate-700">
            <div className="lg:col-span-7 space-y-4">
              <p>
                When a cardholder opens an account or uses their credit card, their actual future default outcome is not yet known. The bank can only observe their <strong>financial actions and billing statements</strong> over time.
              </p>
              <div className="space-y-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">1. Credit Utilization Rate:</span>
                  <p className="text-xs text-slate-600 mt-0.5">
                    How much of the credit limit is being borrowed. For {activeCustomer?.fullName}, utilization is <strong>{activeCustomer?.creditUtilization}%</strong>. Usage above 80% is the #1 early-warning sign of debt strain.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">2. Payment Delinquency History:</span>
                  <p className="text-xs text-slate-600 mt-0.5">
                    How many billing cycles had delayed payments in the past 6 months ({activeCustomer?.delayedPayments6M || 0} cycles). Repeated late payments indicate acute cash-flow shortages.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">3. Repayment Coverage Ratio:</span>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Whether the customer pays off their full balance or only makes the bare minimum payment. Paying only the minimum causes finance charges to compound rapidly.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] block">
                Active Cardholder Inputs ({activeCustomer?.id})
              </span>
              <div className="divide-y divide-slate-200 font-mono">
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Credit Limit:</span>
                  <span className="font-bold text-slate-900">${activeCustomer?.creditLimit.toLocaleString()}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Current Balance:</span>
                  <span className="font-bold text-slate-900">${activeCustomer?.outstandingBalance.toLocaleString()}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Annual Income:</span>
                  <span className="font-bold text-slate-900">${activeCustomer?.annualIncome.toLocaleString()}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-slate-600">Emergency Cash Draws (6M):</span>
                  <span className="font-bold text-slate-900">{activeCustomer?.cashAdvanceCount6M || 0} transactions</span>
                </div>
              </div>
              <button
                onClick={() => onNavigate('customer-dashboard')}
                className="w-full mt-2 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors cursor-pointer text-center"
              >
                Inspect Cardholder Profile →
              </button>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-sm text-slate-700">
            <div className="lg:col-span-7 space-y-4">
              <p>
                Instead of treating every customer in isolation, the system uses <strong>K-Means Clustering</strong> to identify natural behavioral groups across the portfolio.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="font-bold text-emerald-900">Prime Transactors</span>
                  <p className="text-emerald-700 mt-1">
                    Low credit utilization (&lt;20%), pristine payment track records, and high liquidity. Safe for credit expansions.
                  </p>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="font-bold text-blue-900">Revolving Balances</span>
                  <p className="text-blue-700 mt-1">
                    Carries balances month-to-month but makes regular payments. Bank&apos;s main interest-generating segment.
                  </p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="font-bold text-amber-900">Elevated Leverage</span>
                  <p className="text-amber-700 mt-1">
                    High balance-to-income ratios and sensitivity to macroeconomic inflation or rate increases.
                  </p>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <span className="font-bold text-rose-900">Delinquency Watchlist</span>
                  <p className="text-rose-700 mt-1">
                    Multiple missed payments and near-maxed credit cards. High concentration of potential defaults.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3 text-xs">
              <span className="font-bold uppercase tracking-wider text-indigo-900 text-[11px] block">
                Cluster Assignment
              </span>
              <p className="text-indigo-950 font-medium">
                {activeCustomer?.fullName} belongs to the <strong>{activeCustomer?.segment}</strong> cohort based on multidimensional centroid distance.
              </p>
              <button
                onClick={() => onNavigate('segment-dashboard')}
                className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors cursor-pointer text-center"
              >
                Explore Segment &amp; Matrix Dashboard →
              </button>
            </div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-sm text-slate-700">
            <div className="lg:col-span-7 space-y-4">
              <p>
                A suite of machine learning models is trained on thousands of historical credit card records to predict the <strong>Default Probability (PD)</strong> — the likelihood of a cardholder missing 90+ days of payments.
              </p>
              <div className="space-y-2.5 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Gradient Boosting (Primary Model):</span>
                  <p className="text-slate-600 mt-0.5">
                    Builds sequential decision trees that learn from previous errors. Achieved the highest discrimination accuracy (ROC-AUC 0.8621, KS Stat 64.2%).
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Zero-Data Leakage Validation:</span>
                  <p className="text-slate-600 mt-0.5">
                    Evaluated through 5-Fold Stratified Cross-Validation, ensuring the model never sees test data during scaling or tree building.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] block">
                Model Inference Output
              </span>
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="text-gray-500 text-[10px] uppercase font-bold">Estimated Default Probability</div>
                <div className="text-2xl font-serif font-bold text-slate-900 mt-1">
                  {assessment?.defaultProbability.toFixed(1)}%
                </div>
                <p className="text-gray-500 text-[11px] mt-1">
                  Baseline risk assessment evaluated live through model.pkl
                </p>
              </div>
              <button
                onClick={() => onNavigate('prediction')}
                className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors cursor-pointer text-center"
              >
                Compare All 4 ML Models →
              </button>
            </div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-sm text-slate-700">
            <div className="lg:col-span-7 space-y-4">
              <p>
                Modern banking regulations (e.g. Basel II, Fair Lending) prohibit &quot;black box&quot; models. <strong>SHAP (Shapley Additive Explanations)</strong> breaks down exactly which factors increased or decreased the customer&apos;s score.
              </p>
              <div className="space-y-2 text-xs">
                {assessment?.factorContributions.map((factor, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{factor.factor}</span>
                      <p className="text-slate-500 text-[11px] mt-0.5">{factor.description}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                      factor.impact === 'positive' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {factor.impact === 'positive' ? 'Protective Factor' : 'Risk Driver'} ({factor.weightScore > 0 ? `+${factor.weightScore}` : factor.weightScore})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-3 text-xs">
              <span className="font-bold uppercase tracking-wider text-purple-900 text-[11px] block">
                Explainability Takeaway
              </span>
              <p className="text-purple-950">
                Loan officers can provide applicants with clear, legally sound adverse action notices or guidance on how paying down balances will lower their risk score.
              </p>
              <button
                onClick={() => onNavigate('reports')}
                className="w-full mt-2 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors cursor-pointer text-center"
              >
                Download Formal Audit Workpaper →
              </button>
            </div>
          </div>
        )}

        {activeStep === 5 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-sm text-slate-700">
            <div className="lg:col-span-7 space-y-4">
              <p>
                The predicted default probability is calibrated and transformed into an intuitive <strong>1–10 Risk Score</strong> and concrete credit policy recommendations.
              </p>
              <div className="space-y-2.5 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Grades 1–2 (Minimal Risk):</span>
                  <p className="text-slate-600 mt-0.5">Approve automatic limit increases and market premium rewards cards.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Grades 3–4 (Low Risk):</span>
                  <p className="text-slate-600 mt-0.5">Standard account operations with normal quarterly reviews.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Grades 5–6 (Moderate Risk):</span>
                  <p className="text-slate-600 mt-0.5">Automated SMS payment reminders sent 4 days before due date.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Grades 7–8 (Elevated Risk):</span>
                  <p className="text-slate-600 mt-0.5">Freeze speculative limit expansion and cap ATM cash advance draws to 10%.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="font-bold text-slate-900">Grades 9–10 (Severe Risk):</span>
                  <p className="text-slate-600 mt-0.5">Route account to Workout Desk for structured repayment assistance.</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] block">
                Current Account Policy Decision
              </span>
              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Calibrated Grade:</span>
                  <span className="font-mono font-bold text-indigo-700 text-base">Grade {score10} / 10</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-500">Risk Category:</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${catInfo.badgeClass}`}>
                    {catInfo.label}
                  </span>
                </div>
                <div className="mt-3 text-slate-600 text-[11px]">
                  {catInfo.description}
                </div>
              </div>

              <button
                onClick={() => onNavigate('alerts')}
                className="w-full mt-2 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors cursor-pointer text-center"
              >
                View Surveillance Alerts Desk →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PLAIN ENGLISH GLOSSARY SECTION */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-4.5 h-4.5 text-[#4338ca]" />
            <span>Plain-English Glossary of Credit Terms</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Simple explanations for banking and machine learning terminology used across this platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900">Default Probability (PD)</span>
            <p className="text-slate-600 leading-relaxed">
              The estimated percentage chance (0% to 100%) that a cardholder will miss scheduled payments for 90 days or more.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900">Credit Utilization Rate</span>
            <p className="text-slate-600 leading-relaxed">
              How much of your approved credit card limit is being used. E.g., a $4,000 balance on a $10,000 limit = 40% utilization.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900">Revolving Balance</span>
            <p className="text-slate-600 leading-relaxed">
              The portion of your credit card balance that is carried over from month to month instead of being paid off in full.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900">Payment-to-Minimum Ratio</span>
            <p className="text-slate-600 leading-relaxed">
              How much money you pay compared to the bare minimum due. A ratio of 3x means you paid triple the minimum required.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900">Debt-to-Income (DTI)</span>
            <p className="text-slate-600 leading-relaxed">
              Compares your total credit card debt to your declared annual income. Lower ratios mean you have more financial breathing room.
            </p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900">ROC-AUC Score</span>
            <p className="text-slate-600 leading-relaxed">
              A standard measure of model accuracy between 0.5 (random guess) and 1.0 (perfect). A score of 0.86 means high accuracy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
