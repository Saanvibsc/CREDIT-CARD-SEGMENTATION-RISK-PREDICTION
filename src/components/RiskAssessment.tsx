import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  FileText, 
  Sliders, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  Server,
  Cpu
} from 'lucide-react';
import { Customer, RiskConfig, PredictionResponse } from '../types';
import { api } from '../services/api';
import { RiskScoreGauge } from './charts/RiskCharts';
import { NavPage } from './Sidebar';

interface RiskAssessmentProps {
  customer: Customer;
  allCustomers: Customer[];
  config: RiskConfig;
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const RiskAssessment: React.FC<RiskAssessmentProps> = ({
  customer,
  allCustomers,
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simUtilization, setSimUtilization] = useState(customer.creditUtilization);
  const [simDelays, setSimDelays] = useState(customer.delayedPayments6M);
  const [simIncomeFactor, setSimIncomeFactor] = useState(0);
  const [committeeNote, setCommitteeNote] = useState('');
  const [decisionLogged, setDecisionLogged] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const [baselinePrediction, setBaselinePrediction] = useState<PredictionResponse | null>(null);
  const [simPrediction, setSimPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    api.predictRisk(customer.id, undefined, config)
      .then((res) => {
        if (!isCancelled) {
          setBaselinePrediction(res);
          setSimPrediction(res);
          setSimUtilization(customer.creditUtilization);
          setSimDelays(customer.delayedPayments6M);
          setSimIncomeFactor(0);
          setIsSimulating(false);
        }
      })
      .catch((err) => {
        console.error('API risk prediction failed:', err);
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [customer.id, config]);

  useEffect(() => {
    if (!isSimulating) return;

    const timer = setTimeout(() => {
      const simulatedIncome = Math.round(customer.annualIncome * (1 + simIncomeFactor / 100));
      api.predictRisk(customer.id, {
        utilization: simUtilization,
        delayedPayments: simDelays,
        annualIncome: simulatedIncome,
      }, config).then((res) => {
        setSimPrediction(res);
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [isSimulating, simUtilization, simDelays, simIncomeFactor, customer.id, config]);

  const handleResetSimulation = () => {
    setSimUtilization(customer.creditUtilization);
    setSimDelays(customer.delayedPayments6M);
    setSimIncomeFactor(0);
    setIsSimulating(false);
    if (baselinePrediction) {
      setSimPrediction(baselinePrediction);
    }
  };

  const activePrediction = isSimulating && simPrediction ? simPrediction : baselinePrediction;
  const assessment = activePrediction?.assessment;

  const handleDownloadReport = async () => {
    if (!assessment) return;
    setDownloadError('');
    try {
      const { generateRiskReportPDF } = await import('../utils/pdfGenerator');
      generateRiskReportPDF(customer, assessment);
    } catch (error) {
      console.error('Failed to generate risk assessment PDF:', error);
      setDownloadError('Could not generate the PDF report. Please try again.');
    }
  };

  const handleLogCommitteeAction = (e: React.FormEvent) => {
    e.preventDefault();
    setDecisionLogged(true);
    setTimeout(() => setDecisionLogged(false), 4000);
  };

  if (loading || !assessment) {
    return (
      <div className="space-y-12 max-w-[1400px] mx-auto py-8 animate-pulse">
        <div className="h-16 bg-gray-100 border-l-4 border-[#4338ca] pl-6 w-1/3" />
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-5 h-80 bg-gray-100" />
          <div className="col-span-7 h-80 bg-gray-100" />
        </div>
      </div>
    );
  }

  const isLiveBackend = activePrediction?.source === 'live-ml-backend';

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate('search')}
            className="p-2 border border-[#e5e7eb] hover:border-[#1a1a1a] transition-colors"
            title="Back to Customer Directory"
          >
            <ArrowLeft className="w-4 h-4 text-[#1a1a1a]" />
          </button>
          <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
            <div className="meta mb-2">Customer Profile &amp; Risk Review — {customer.id}</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
              {customer.fullName}
            </h1>
            <p className="text-xs text-gray-500 font-sans mt-1">
              Detailed credit risk breakdown, payment timeline, and interactive what-if testing.
            </p>
          </div>
        </div>

        {/* Account Selector & Actions */}
        <div className="flex items-center gap-3">
          <select
            value={customer.id}
            onChange={(e) => {
              onSelectCustomer(e.target.value);
              handleResetSimulation();
            }}
            className="bg-white border border-[#e5e7eb] py-2 px-3 text-xs mono text-[#1a1a1a] outline-none"
          >
            {allCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.fullName}
              </option>
            ))}
          </select>

          <button
            onClick={handleDownloadReport}
            className="py-2 px-4 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors flex items-center gap-2"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download Report (PDF)</span>
          </button>
        </div>
      </header>

      {downloadError && (
        <div role="alert" className="border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {downloadError}
        </div>
      )}

      {/* Engine Status Strip */}
      <div className="flex items-center justify-between py-2.5 px-4 border border-[#e5e7eb] bg-white text-xs">
        <div className="flex items-center gap-3">
          <span className="meta">Credit Risk Assessment:</span>
          <span className="mono font-bold text-[#1a1a1a]">
            Calibrated CreditGuard Model
          </span>
          <span className="meta text-gray-400">· Evaluated across 10 financial metrics</span>
        </div>

        <span className="mono text-[10px] uppercase text-[#4338ca]">
          Live Risk Score
        </span>
      </div>

      {/* Primary Metrics Grid: Gauge + Score + Probabilities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Metric 1: Risk Gauge (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-[#e5e7eb] p-6 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-2">
            <div>
              <span className="meta">Risk Rating</span>
              <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">Overall Risk Score (0–100)</h3>
            </div>
            {isSimulating && (
              <span className="mono text-[10px] px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                SIMULATION ACTIVE
              </span>
            )}
          </div>

          <div className="py-4">
            <RiskScoreGauge
              score={assessment.riskScore}
              tier={assessment.riskTier}
              size={220}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#e5e7eb] text-center">
            <div className="p-2 border border-[#e5e7eb]">
              <span className="meta text-[#4338ca]">Safe</span>
              <div className="mono font-bold text-xs mt-0.5 text-[#1a1a1a]">Score 0 – {config.lowRiskUpperBound}</div>
              <div className="text-[10px] text-gray-400">Pays on time</div>
            </div>
            <div className="p-2 border border-[#e5e7eb]">
              <span className="meta text-[#b45309]">Moderate</span>
              <div className="mono font-bold text-xs mt-0.5 text-[#1a1a1a]">{config.lowRiskUpperBound + 1} – {config.highRiskLowerBound - 1}</div>
              <div className="text-[10px] text-gray-400">Watch balance</div>
            </div>
            <div className="p-2 border border-[#e5e7eb]">
              <span className="meta text-[#be123c]">High Risk</span>
              <div className="mono font-bold text-xs mt-0.5 text-[#1a1a1a]">&ge; {config.highRiskLowerBound}</div>
              <div className="text-[10px] text-gray-400">Needs review</div>
            </div>
          </div>
        </div>

        {/* Metric 2: Predicted PD & Financial Standing (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-[#e5e7eb] p-6 space-y-6 flex flex-col justify-between">
          <div className="border-b border-[#e5e7eb] pb-2 flex items-center justify-between">
            <div>
              <span className="meta">Payment Outlook</span>
              <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">
                Likelihood of Missing a Payment &amp; Card Balances
              </h3>
            </div>
            <span className="meta">Next 3 Months</span>
          </div>

          {/* 3 Metric Blocks */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-[#e5e7eb] p-4">
              <span className="meta">Chance of Default</span>
              <div className="text-3xl font-serif font-bold text-[#1a1a1a] mt-1">
                {assessment.defaultProbability.toFixed(1)}%
              </div>
              <span className="mono text-[10px] text-gray-500 mt-1 block">
                {assessment.defaultProbability < 5 ? 'Very low risk' : assessment.defaultProbability < 20 ? 'Moderate risk' : 'High chance of missed payment'}
              </span>
            </div>

            <div className="border border-[#e5e7eb] p-4">
              <span className="meta">Credit Card Used</span>
              <div className="text-3xl font-serif font-bold text-[#1a1a1a] mt-1">
                {(isSimulating ? simUtilization : customer.creditUtilization).toFixed(1)}%
              </div>
              <span className="mono text-[10px] text-gray-500 mt-1 block">
                ${customer.outstandingBalance.toLocaleString('en-US')} of ${customer.creditLimit.toLocaleString('en-US')} limit
              </span>
            </div>

            <div className="border border-[#e5e7eb] p-4">
              <span className="meta">Late Payments (6 Mos)</span>
              <div className="text-3xl font-serif font-bold text-[#1a1a1a] mt-1">
                {isSimulating ? simDelays : customer.delayedPayments6M}
              </div>
              <span className="mono text-[10px] text-gray-500 mt-1 block">
                {customer.paymentToMinRatio.toFixed(1)}x paid vs minimum
              </span>
            </div>
          </div>

          {/* Metadata Row */}
          <div className="grid grid-cols-4 gap-4 pt-4 border-t border-[#e5e7eb] text-xs">
            <div>
              <span className="meta">Annual Income</span>
              <span className="mono font-bold text-[#1a1a1a] block mt-1">
                ${Math.round(customer.annualIncome * (1 + simIncomeFactor / 100)).toLocaleString('en-US')}
              </span>
            </div>
            <div>
              <span className="meta">Credit History</span>
              <span className="mono font-bold text-[#1a1a1a] block mt-1">
                {customer.creditHistoryYears} Years
              </span>
            </div>
            <div>
              <span className="meta">Card Type</span>
              <span className="mono font-bold text-[#1a1a1a] block mt-1">
                {customer.cardType}
              </span>
            </div>
            <div>
              <span className="meta">Customer Group</span>
              <span className="mono font-bold text-[#4338ca] block mt-1">
                {customer.segment}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6-Month Timeline & Factor Attributions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Repayment History (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-[#e5e7eb] p-6 space-y-4">
          <div className="border-b border-[#e5e7eb] pb-2">
            <span className="meta">Recent Payments</span>
            <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">
              Last 6 Months Payment History
            </h3>
          </div>

          <div className="space-y-2">
            {customer.repaymentHistory.map((rec, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 border border-[#e5e7eb] text-xs">
                <div>
                  <span className="font-semibold text-[#1a1a1a]">{rec.month}</span>
                  <span className="mono text-[10px] text-gray-400 block">
                    Balance: ${rec.balance.toLocaleString('en-US')} · Min Due: ${rec.minPaymentDue}
                  </span>
                </div>

                <div className="text-right">
                  <div className="mono font-bold text-[#1a1a1a]">
                    Paid: ${rec.paymentAmount.toLocaleString('en-US')}
                  </div>
                  <span className={`meta ${rec.status === 'on-time' ? 'text-emerald-700' : 'text-[#be123c]'}`}>
                    {rec.status === 'on-time' ? 'PAID ON TIME' : rec.daysDelayed === null ? 'LATE PAYMENT' : `${rec.daysDelayed} DAYS LATE`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Factor Attributions (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-[#e5e7eb] p-6 space-y-4">
          <div className="border-b border-[#e5e7eb] pb-2">
            <span className="meta">Why This Score?</span>
            <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">
              Top Factors Affecting Risk
            </h3>
          </div>

          <div className="space-y-2.5">
            {assessment.factorContributions.length === 0 ? (
              <p className="text-xs text-gray-500">
                Calculated directly from credit utilization and payment records.
              </p>
            ) : assessment.factorContributions.map((item, idx) => {
              const isPositive = item.impact === 'positive';
              const isNegative = item.impact === 'negative';
              return (
                <div key={idx} className="p-3 border border-[#e5e7eb] text-xs flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1a1a1a]">{item.factor}</span>
                      <span className="meta">({item.category})</span>
                    </div>
                    <p className="text-[#6b7280] text-[11px] mt-0.5 leading-relaxed">{item.description}</p>
                  </div>

                  <span className={`mono font-bold shrink-0 ${
                    isPositive ? 'text-[#4338ca]' : isNegative ? 'text-[#be123c]' : 'text-gray-500'
                  }`}>
                    {item.weightScore > 0 ? `+${item.weightScore} pts risk` : `${item.weightScore} pts safe`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recommended Actions */}
      <div className="bg-white border border-[#e5e7eb] p-6 sm:p-8 space-y-4">
        <div className="border-b border-[#1a1a1a] pb-2 flex items-center justify-between">
          <div>
            <span className="meta">Suggested Next Steps</span>
            <h3 className="text-xl font-serif font-semibold text-[#1a1a1a]">
              Recommended Action Plan ({assessment.riskTier} Risk Level)
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {assessment.recommendedActions.map((action, idx) => (
            <div key={idx} className="p-3 border border-[#e5e7eb] text-xs flex items-start gap-3">
              <span className="mono font-bold text-[#4338ca] shrink-0">0{idx + 1}.</span>
              <span className="text-[#1a1a1a] font-medium leading-relaxed">{action}</span>
            </div>
          ))}
        </div>

        {/* Action Note Logger */}
        <form onSubmit={handleLogCommitteeAction} className="pt-4 border-t border-[#e5e7eb] flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Write a note about this customer (e.g. called to offer payment plan)..."
            value={committeeNote}
            onChange={(e) => setCommitteeNote(e.target.value)}
            className="flex-1 bg-[#fdfcf9] border border-[#e5e7eb] py-2 px-3 text-xs font-sans text-[#1a1a1a] outline-none"
          />
          <button
            type="submit"
            className="py-2 px-5 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors shrink-0"
          >
            Save Note
          </button>
        </form>
        {decisionLogged && (
          <div className="meta text-emerald-700">✓ Note saved successfully to customer history.</div>
        )}
      </div>

      {/* What-If Stress Simulator */}
      <div className="bg-[#1a1a1a] text-white p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
          <div>
            <div className="meta text-gray-400">Interactive Simulation</div>
            <h2 className="text-2xl font-serif font-semibold text-white mt-1">
              "What-If" Scenario Tester
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Move the sliders below to see how paying off debt or missing a payment would change this customer's score in real time.
            </p>
          </div>

          {isSimulating && (
            <button
              onClick={handleResetSimulation}
              className="mono text-xs px-3 py-1.5 border border-gray-700 hover:border-white text-gray-200 transition-colors"
            >
              Reset to Actual Values
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs">
          {/* Slider 1 */}
          <div className="space-y-2">
            <div className="flex justify-between mono">
              <span className="text-gray-400">Card Limit Used:</span>
              <span className="text-[#bfdbfe] font-bold">{simUtilization.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={simUtilization}
              onChange={(e) => {
                setSimUtilization(parseFloat(e.target.value));
                setIsSimulating(true);
              }}
              className="w-full accent-[#4338ca] cursor-pointer"
            />
            <div className="flex justify-between meta text-gray-500 text-[9px]">
              <span>0% (Paid off)</span>
              <span>Current: {customer.creditUtilization.toFixed(0)}%</span>
              <span>100% (Maxed out)</span>
            </div>
          </div>

          {/* Slider 2 */}
          <div className="space-y-2">
            <div className="flex justify-between mono">
              <span className="text-gray-400">Missed Payments (6 Mos):</span>
              <span className="text-[#bfdbfe] font-bold">{simDelays}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              value={simDelays}
              onChange={(e) => {
                setSimDelays(parseInt(e.target.value, 10));
                setIsSimulating(true);
              }}
              className="w-full accent-[#4338ca] cursor-pointer"
            />
            <div className="flex justify-between meta text-gray-500 text-[9px]">
              <span>0 Delays</span>
              <span>Current: {customer.delayedPayments6M}</span>
              <span>6 Months Late</span>
            </div>
          </div>

          {/* Slider 3 */}
          <div className="space-y-2">
            <div className="flex justify-between mono">
              <span className="text-gray-400">Income Change:</span>
              <span className="text-[#bfdbfe] font-bold">{simIncomeFactor > 0 ? `+${simIncomeFactor}%` : `${simIncomeFactor}%`}</span>
            </div>
            <input
              type="range"
              min="-50"
              max="50"
              step="5"
              value={simIncomeFactor}
              onChange={(e) => {
                setSimIncomeFactor(parseInt(e.target.value, 10));
                setIsSimulating(true);
              }}
              className="w-full accent-[#4338ca] cursor-pointer"
            />
            <div className="flex justify-between meta text-gray-500 text-[9px]">
              <span>-50% Job loss/cut</span>
              <span>Current Income</span>
              <span>+50% Raise</span>
            </div>
          </div>
        </div>

        {isSimulating && baselinePrediction && (
          <div className="p-4 border border-gray-800 bg-[#242424] flex items-center justify-between mono text-xs">
            <div>
              <span className="text-gray-400">Original Risk Score: </span>
              <span className="text-white font-bold">{baselinePrediction.assessment.riskScore}</span>
              <span className="text-gray-500 mx-2">→ Simulated Score:</span>
              <span className={`font-bold text-sm ${
                assessment.riskScore > baselinePrediction.assessment.riskScore ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                {assessment.riskScore}
              </span>
            </div>

            <div>
              <span className="text-gray-400">Original Default Chance: </span>
              <span className="text-white font-bold">{baselinePrediction.assessment.defaultProbability.toFixed(1)}%</span>
              <span className="text-gray-500 mx-2">→ Simulated Chance:</span>
              <span className={`font-bold text-sm ${
                assessment.defaultProbability > baselinePrediction.assessment.defaultProbability ? 'text-rose-400' : 'text-emerald-400'
              }`}>
                {assessment.defaultProbability.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
