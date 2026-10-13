import React, { useState, useEffect } from 'react';
import { 
  Search, 
  AlertCircle, 
  ArrowRight, 
  FileText, 
  RefreshCw,
  Download
} from 'lucide-react';
import { Customer, RiskConfig, RiskTier, PredictionResponse, RepaymentRecord } from '../types';
import { api } from '../services/api';
import { NavPage } from './Sidebar';

interface CustomerSearchProps {
  config: RiskConfig;
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const CustomerSearch: React.FC<CustomerSearchProps> = ({
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<'All' | RiskTier>('All');
  const [selectedCardFilter, setSelectedCardFilter] = useState<string>('All');
  const [activeCustomerId, setActiveCustomerId] = useState<string>('CUST000001');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activePrediction, setActivePrediction] = useState<PredictionResponse | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Load customer list via API service
  const fetchCustomerList = async () => {
    setLoadingList(true);
    try {
      const data = await api.searchCustomers(
        searchTerm, 
        selectedTierFilter, 
        selectedCardFilter, 
        config
      );
      setCustomers(data);
      if (data.length > 0 && !data.some((c: Customer) => c.id === activeCustomerId)) {
        setActiveCustomerId(data[0].id);
      }
    } catch (err) {
      console.error('Customer search API error:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchCustomerList();
  }, [searchTerm, selectedTierFilter, selectedCardFilter, config]);

  // Load active customer prediction via API service
  useEffect(() => {
    if (!activeCustomerId) return;
    let isCancelled = false;
    setLoadingPreview(true);

    api.predictRisk(activeCustomerId, undefined, config)
      .then((pred) => {
        if (!isCancelled) {
          setActivePrediction(pred);
        }
      })
      .catch((err) => {
        console.error('Failed to predict risk for preview:', err);
      })
      .finally(() => {
        if (!isCancelled) setLoadingPreview(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeCustomerId, config]);

  const activeCustomer = customers.find((c) => c.id === activeCustomerId);

  const handleTestIdClick = (id: string) => {
    setSearchTerm(id);
    setActiveCustomerId(id);
  };

  const handleDownloadDatasetCsv = () => {
    if (customers.length === 0) return;
    const headers = [
      'customer_id',
      'full_name',
      'age',
      'annual_income',
      'card_type',
      'credit_limit',
      'outstanding_balance',
      'credit_utilization_pct',
      'delayed_payments_6m',
      'payment_to_min_ratio',
      'monthly_average_spend',
      'credit_history_years',
      'segment',
      'joined_date'
    ];

    const rows = customers.map((c) => [
      c.id,
      `"${c.fullName}"`,
      c.age,
      c.annualIncome,
      `"${c.cardType}"`,
      c.creditLimit,
      c.outstandingBalance,
      c.creditUtilization,
      c.delayedPayments6M,
      c.paymentToMinRatio,
      c.monthlyAverageSpend,
      c.creditHistoryYears,
      `"${c.segment}"`,
      c.joinedDate
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'combined_credit_risk_realistic_with_ids.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isInvalidSearch = searchTerm.trim().length > 0 && customers.length === 0 && !loadingList;

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-10">
      {/* Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Customer Directory — 200 Card Accounts</div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-semibold text-[#1a1a1a] tracking-tight">
            Customer Search &amp; Details
          </h1>
          <p className="text-xs text-gray-500 font-sans mt-1">
            Search 200 customer profiles. Click any cardholder to view balances, past payments, and default risk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadDatasetCsv}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
            title="Download combined_credit_risk_realistic_with_ids.csv"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Dataset CSV</span>
          </button>
        </div>
      </header>

      {/* Quick Chips & Filter Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-3 border-y border-[#e5e7eb] text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="meta">Sample Customers:</span>
          {[
            { id: 'CUST000001', label: 'Safe Spender (CUST000001)' },
            { id: 'CUST000003', label: 'Late Payments (CUST000003)' },
            { id: 'CUST000005', label: 'Carrying Balance (CUST000005)' },
            { id: 'CUST000010', label: 'Near Card Limit (CUST000010)' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleTestIdClick(id)}
              className={`mono text-[11px] px-2 py-0.5 border transition-colors cursor-pointer ${
                activeCustomerId === id
                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                  : 'bg-white border-[#e5e7eb] hover:border-[#1a1a1a] text-[#1a1a1a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dropdowns */}
        <div className="flex items-center gap-3">
          <select
            value={selectedTierFilter}
            onChange={(e) => setSelectedTierFilter(e.target.value as any)}
            className="bg-white border border-[#e5e7eb] py-1.5 px-3 text-xs text-[#1a1a1a] font-mono outline-none"
          >
            <option value="All">All Risk Levels</option>
            <option value="Low">Low Risk (Safe)</option>
            <option value="Medium">Medium Risk (Watch)</option>
            <option value="High">High Risk (Warning)</option>
          </select>

          <select
            value={selectedCardFilter}
            onChange={(e) => setSelectedCardFilter(e.target.value)}
            className="bg-white border border-[#e5e7eb] py-1.5 px-3 text-xs text-[#1a1a1a] font-mono outline-none"
          >
            <option value="All">All Card Products</option>
            <option value="Not recorded">Not recorded in dataset</option>
          </select>
        </div>
      </div>

      {isInvalidSearch && (
        <div className="p-4 border border-[#be123c] bg-rose-50/50 text-[#be123c] text-xs mono">
          <span className="font-bold">NO MATCH: </span>
          No customer found matching "{searchTerm}". Please choose from the sample customer buttons above or clear the search.
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Table of Customers (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1a1a1a]">
            <h2 className="text-xl font-serif font-semibold text-[#1a1a1a]">
              Customer Accounts ({customers.length})
            </h2>
            <span className="meta">Click row to view profile</span>
          </div>

          <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#fdfcf9] z-10">
                <tr className="border-b-2 border-[#1a1a1a]">
                  <th className="py-2.5 px-2 meta">Customer ID &amp; Name</th>
                  <th className="py-2.5 px-2 meta">Current Balance &amp; Limit</th>
                  <th className="py-2.5 px-2 meta">Card Used (%)</th>
                  <th className="py-2.5 px-2 meta">Payment Track</th>
                  <th className="py-2.5 px-2 meta text-right">Card Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e7eb]">
                {customers.map((c) => {
                  const isSelected = c.id === activeCustomerId;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setActiveCustomerId(c.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-white border-l-2 border-[#4338ca]' : 'hover:bg-white'
                      }`}
                    >
                      <td className="py-3 px-2">
                        <span className="mono font-bold text-[#1a1a1a]">{c.id}</span>
                        <span className="block text-[11px] text-gray-500 font-sans">{c.fullName}</span>
                      </td>
                      <td className="py-3 px-2 mono">
                        <span className="text-[#1a1a1a] font-bold">${Number(c.outstandingBalance || 0).toLocaleString('en-US')}</span>
                        <span className="block text-[10px] text-gray-400">limit ${Number(c.creditLimit || 0).toLocaleString('en-US')}</span>
                      </td>
                      <td className="py-3 px-2 mono">
                        <span className={(Number(c.creditUtilization) || 0) > 80 ? 'text-[#be123c] font-bold' : 'text-[#1a1a1a]'}>
                          {(Number(c.creditUtilization) || 0).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        {c.delayedPayments6M === 0 ? (
                          <span className="meta text-emerald-700">0 delays</span>
                        ) : (
                          <span className="meta text-[#be123c]">{c.delayedPayments6M} late</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-600 text-[11px]">
                        {c.cardType}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Customer Dossier Card (5 cols) */}
        {activeCustomer && (
          <div className="lg:col-span-5 bg-white border border-[#e5e7eb] p-6 sm:p-8 space-y-6 sticky top-24">
            {/* Dossier Header */}
            <div className="border-b border-[#1a1a1a] pb-4 flex items-start justify-between">
              <div>
                <span className="meta text-[#4338ca]">Customer Profile</span>
                <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] mt-1">
                  {activeCustomer.fullName}
                </h3>
                <span className="mono text-xs text-gray-500">{activeCustomer.id} · {activeCustomer.cardType}</span>
              </div>

              <div className="text-right">
                <span className="meta">Risk Score</span>
                <div className="text-3xl font-serif font-bold text-[#1a1a1a]">
                  {loadingPreview ? '...' : activePrediction?.assessment.riskScore || '—'}
                  <span className="text-xs font-normal text-gray-400">/100</span>
                </div>
                {activePrediction && (
                  <span className="meta text-[#4338ca] block">
                    Default Risk: {activePrediction.assessment.defaultProbability.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Financial Details Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border-b border-[#e5e7eb] pb-2">
                <span className="meta">Credit Limit</span>
                <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">
                  ${Number(activeCustomer.creditLimit || 0).toLocaleString('en-US')}
                </div>
              </div>

              <div className="border-b border-[#e5e7eb] pb-2">
                <span className="meta">Current Balance</span>
                <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">
                  ${Number(activeCustomer.outstandingBalance || 0).toLocaleString('en-US')}
                </div>
              </div>

              <div className="border-b border-[#e5e7eb] pb-2">
                <span className="meta">Annual Income</span>
                <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">
                  ${Number(activeCustomer.annualIncome || 0).toLocaleString('en-US')}
                </div>
              </div>

              <div className="border-b border-[#e5e7eb] pb-2">
                <span className="meta">Monthly Payment Habit</span>
                <div className="mono font-bold text-sm text-[#1a1a1a] mt-0.5">
                  {activeCustomer.paymentToMinRatio.toFixed(1)}x required min
                </div>
              </div>
            </div>

            {/* 6-Month Repayment Cycle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="meta">6-Month Payment Track</span>
                <span className="mono text-[10px] text-gray-400">{activeCustomer.delayedPayments6M} delays total</span>
              </div>
              <div className="grid grid-cols-6 gap-1 text-center">
                {activeCustomer.repaymentHistory.map((rep: RepaymentRecord, idx: number) => (
                  <div
                    key={idx}
                    className={`py-1.5 px-0.5 border mono text-[9px] ${
                      rep.status === 'on-time'
                        ? 'border-[#e5e7eb] bg-gray-50 text-emerald-800'
                        : 'border-[#be123c] bg-rose-50 text-[#be123c] font-bold'
                    }`}
                  >
                    <div className="text-[8px] text-gray-400">{rep.month.split(' ')[0]}</div>
                    <div className="mt-0.5">{rep.status === 'on-time' ? 'OK' : `${rep.daysDelayed}d late`}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
              <button
                onClick={() => {
                  onSelectCustomer(activeCustomer.id);
                  onNavigate('customer-dashboard');
                }}
                className="w-full sm:flex-1 py-2.5 px-3 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Cardholder Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  onSelectCustomer(activeCustomer.id);
                  onNavigate('prediction');
                }}
                className="w-full sm:flex-1 py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 mono text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>ML Prediction</span>
              </button>

              <button
                onClick={() => {
                  onSelectCustomer(activeCustomer.id);
                  onNavigate('reports');
                }}
                className="w-full sm:w-auto py-2.5 px-3 border border-gray-300 hover:border-gray-900 text-gray-700 mono text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
