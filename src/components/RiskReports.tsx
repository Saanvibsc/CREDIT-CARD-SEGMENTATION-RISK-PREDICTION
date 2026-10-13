import React, { useState, useEffect } from 'react';
import { 
  Download, 
  CheckCircle2, 
  ArrowRight
} from 'lucide-react';
import { Customer, RiskConfig, ComputedRiskAssessment, DataSourceType, FactorContribution } from '../types';
import { api } from '../services/api';
import { NavPage } from './Sidebar';

interface RiskReportsProps {
  selectedCustomerId: string;
  customers: Customer[];
  config: RiskConfig;
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const RiskReports: React.FC<RiskReportsProps> = ({
  selectedCustomerId,
  customers,
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [reportData, setReportData] = useState<{
    customer: Customer;
    assessment: ComputedRiskAssessment;
    source: DataSourceType;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await api.generateReportData(selectedCustomerId, config);
      setReportData(data);
    } catch (err) {
      console.error('Failed to generate report via API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedCustomerId, config]);

  const handleDownload = async () => {
    if (!reportData) return;
    setDownloadError('');
    try {
      const { generateRiskReportPDF } = await import('../utils/pdfGenerator');
      generateRiskReportPDF(reportData.customer, reportData.assessment);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (error) {
      console.error('Failed to generate risk report PDF:', error);
      setDownloadError('Could not generate the PDF report. Please try again.');
    }
  };

  if (loading || !reportData) {
    return (
      <div className="space-y-12 max-w-4xl mx-auto py-8 animate-pulse">
        <div className="h-16 bg-gray-100 border-l-4 border-[#4338ca] pl-6 w-1/3" />
        <div className="h-[600px] bg-gray-100" />
      </div>
    );
  }

  const { customer, assessment, source } = reportData;
  const isLive = source === 'live-ml-backend';
  const keySignals = assessment.factorContributions
    .filter((factor) => factor.impact !== 'neutral')
    .sort((left, right) => Math.abs(right.weightScore) - Math.abs(left.weightScore))
    .slice(0, 2);
  const riskInterpretation =
    assessment.riskTier === 'Low'
      ? `The model places this account in the low-risk band (score at or below ${config.lowRiskUpperBound}). Current indicators suggest lower estimated repayment risk relative to the configured bands.`
      : assessment.riskTier === 'Medium'
        ? `The model places this account in the medium-risk band (score ${config.lowRiskUpperBound + 1} to ${config.highRiskLowerBound - 1}). The account warrants routine monitoring under the configured risk bands.`
        : `The model places this account in the high-risk band (score at or above ${config.highRiskLowerBound}). Review the account indicators and recommended actions before making a credit decision.`;

  return (
    <div className="max-w-4xl mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Customer Audit &amp; Assessment Records</div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
            Credit Risk Summary Report
          </h1>
          <p className="text-xs text-gray-500 font-sans mt-1">
            Complete formal credit risk report with card limit, payment history, and recommended next steps.
          </p>
        </div>

        {/* Customer Selector & Download Action */}
        <div className="flex items-center gap-3">
          <select
            value={customer.id}
            onChange={(e) => onSelectCustomer(e.target.value)}
            className="bg-white border border-[#e5e7eb] py-2 px-3 text-xs mono text-[#1a1a1a] outline-none"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.fullName}
              </option>
            ))}
          </select>

          <button
            onClick={handleDownload}
            className="py-2 px-5 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </header>

      {downloadSuccess && (
        <div className="p-3 border border-emerald-700 bg-emerald-50 text-emerald-900 mono text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            Report generated and saved: <strong>CreditGuard_Risk_Report_{customer.id}.pdf</strong>
          </span>
        </div>
      )}
      {downloadError && (
        <div role="alert" className="border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {downloadError}
        </div>
      )}

      {/* Editorial Paper Document Preview */}
      <div className="bg-white border border-[#1a1a1a] p-8 sm:p-12 space-y-8 shadow-xs">
        {/* Document Masthead */}
        <div className="border-b-2 border-[#1a1a1a] pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3.5 h-3.5 border-2 border-[#1a1a1a] rotate-45" />
              <span className="mono font-bold text-xs">CREDITGUARD AI PLATFORM</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#1a1a1a]">
              Credit Risk Assessment Report
            </h2>
            <div className="meta text-gray-500 mt-1">
              Internal Bank Credit Record · Confidential
            </div>
          </div>

          <div className="text-left sm:text-right mono text-xs space-y-0.5 text-gray-600">
            <div>REF: CG-AUDIT-{customer.id}</div>
            <div>DATE: {assessment.assessedAt}</div>
            <div className="text-[#4338ca] font-bold">LEVEL: {assessment.riskTier.toUpperCase()} RISK</div>
          </div>
        </div>

        {/* Section 1: Cardholder Profile */}
        <section className="space-y-3">
          <div className="border-b border-[#e5e7eb] pb-1 flex items-center justify-between">
            <h3 className="meta font-bold text-[#1a1a1a]">
              1. Customer Information &amp; Card Facility
            </h3>
            <span className="meta">Verified Account</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 text-xs">
            <div>
              <span className="meta">Customer ID</span>
              <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">{customer.id}</div>
            </div>
            <div>
              <span className="meta">Full Name</span>
              <div className="font-semibold text-sm text-[#1a1a1a] mt-0.5">{customer.fullName}</div>
            </div>
            <div>
              <span className="meta">Annual Income</span>
              <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">${Number(customer.annualIncome || 0).toLocaleString('en-US')}</div>
            </div>
            <div>
              <span className="meta">Card Type</span>
              <div className="text-sm text-[#1a1a1a] mt-0.5">{customer.cardType}</div>
            </div>

            <div>
              <span className="meta">Credit Card Limit</span>
              <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">${Number(customer.creditLimit || 0).toLocaleString('en-US')}</div>
            </div>
            <div>
              <span className="meta">Current Balance</span>
              <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">${Number(customer.outstandingBalance || 0).toLocaleString('en-US')}</div>
            </div>
            <div>
              <span className="meta">Card Limit Used (%)</span>
              <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">{(Number(customer.creditUtilization) || 0).toFixed(1)}%</div>
            </div>
            <div>
              <span className="meta">Customer Group</span>
              <div className="mono font-bold text-sm text-[#4338ca] mt-0.5">{customer.segment}</div>
            </div>
          </div>
        </section>

        <section className="space-y-3 border-l-4 border-[#4338ca] bg-[#fdfcf9] p-5">
          <div>
            <h3 className="meta font-bold text-[#4338ca]">Assessment narrative</h3>
            <p className="mt-2 text-sm leading-6 text-[#1a1a1a]">
              {customer.fullName} holds a {customer.cardType} account in the {customer.segment || 'unassigned'} segment.
              The current balance is ${Number(customer.outstandingBalance || 0).toLocaleString('en-US')} against a
              ${Number(customer.creditLimit || 0).toLocaleString('en-US')} limit ({(Number(customer.creditUtilization) || 0).toFixed(1)}% utilization).
              The assessment estimates a {assessment.defaultProbability.toFixed(1)}% default probability and assigns
              a risk score of {assessment.riskScore}/100.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#1a1a1a]">{riskInterpretation}</p>
            {keySignals.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="meta">Most influential returned assessment factors</p>
                {keySignals.map((factor) => (
                  <p key={factor.factor} className="text-xs leading-5 text-gray-600">
                    <strong className={factor.impact === 'negative' ? 'text-[#be123c]' : 'text-[#4338ca]'}>
                      {factor.factor}:
                    </strong>{' '}
                    {factor.description}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                The assessment did not return factor-level details for this report.
              </p>
            )}
            <p className="mt-3 text-[11px] leading-5 text-gray-500">
              This narrative summarizes the profile fields and model response shown in this report; it is not a substitute for analyst review.
            </p>
          </div>
        </section>

        {/* Section 2: Predictive Scores */}
        <section className="space-y-3">
          <div className="border-b border-[#e5e7eb] pb-1 flex items-center justify-between">
            <h3 className="meta font-bold text-[#1a1a1a]">
              2. Risk Score &amp; Estimated Default Chance
            </h3>
            <span className="meta">AI Model Score</span>
          </div>

          <div className="grid grid-cols-3 gap-6 py-2">
            <div className="border border-[#e5e7eb] p-4 text-center">
              <span className="meta">Risk Score (0–100)</span>
              <div className="text-4xl font-serif font-bold text-[#1a1a1a] mt-1">
                {assessment.riskScore}
              </div>
              <span className="meta mt-1 block">0 is safe, 100 is high risk</span>
            </div>

            <div className="border border-[#e5e7eb] p-4 text-center">
              <span className="meta">Chance of Default (%)</span>
              <div className="text-4xl font-serif font-bold text-[#4338ca] mt-1">
                {assessment.defaultProbability.toFixed(1)}%
              </div>
              <span className="meta mt-1 block">Next 90 Days</span>
            </div>

            <div className="border border-[#e5e7eb] p-4 text-center">
              <span className="meta">Risk Level</span>
              <div className="text-xl font-serif font-bold text-[#1a1a1a] mt-2">
                {assessment.riskTier.toUpperCase()} RISK
              </div>
              <span className="meta mt-1 block">Overall Assessment</span>
            </div>
          </div>
        </section>

        {/* Section 3: Risk Factors */}
        <section className="space-y-3">
          <div className="border-b border-[#e5e7eb] pb-1">
            <h3 className="meta font-bold text-[#1a1a1a]">
              3. Key Factors Behind This Score
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            {assessment.factorContributions.length === 0 ? (
              <p className="text-gray-500">
                Calculated directly from credit utilization and recent repayment records.
              </p>
            ) : assessment.factorContributions.map((item: FactorContribution, idx: number) => (
              <div key={idx} className="p-2.5 border border-[#e5e7eb] flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#1a1a1a]">{item.factor}</span>
                  <span className="text-gray-500 text-[11px] block mt-0.5">{item.description}</span>
                </div>
                <span className={`mono font-bold shrink-0 ml-4 ${
                  item.impact === 'positive' ? 'text-[#4338ca]' : item.impact === 'negative' ? 'text-[#be123c]' : 'text-gray-500'
                }`}>
                  {item.weightScore > 0 ? `+${item.weightScore} pts risk` : `${item.weightScore} pts safe`}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Section 4: Recommended Actions */}
        <section className="space-y-3">
          <div className="border-b border-[#e5e7eb] pb-1">
            <h3 className="meta font-bold text-[#1a1a1a]">
              4. Recommended Banking Actions &amp; Next Steps
            </h3>
          </div>

          <ol className="space-y-1.5 list-decimal list-inside text-xs text-[#1a1a1a] font-medium leading-relaxed">
            {assessment.recommendedActions.map((action: string, idx: number) => (
              <li key={idx} className="py-1 border-b border-gray-100">
                {action}
              </li>
            ))}
          </ol>
        </section>

        {/* Disclaimer */}
        <div className="border-t border-[#e5e7eb] pt-4 mono text-[10px] text-gray-500 leading-relaxed">
          NOTE: Default probabilities are estimated using historical credit card repayment patterns and machine learning modeling. This report is designed to assist banking officers and risk managers in reviewing accounts.
        </div>

        {/* Download Footer */}
        <div className="border-t-2 border-[#1a1a1a] pt-4 flex items-center justify-between text-xs">
          <span className="meta">CreditGuard AI · Confidential Workpaper</span>
          <button
            onClick={handleDownload}
            className="meta text-[#4338ca] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Save Offline PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
