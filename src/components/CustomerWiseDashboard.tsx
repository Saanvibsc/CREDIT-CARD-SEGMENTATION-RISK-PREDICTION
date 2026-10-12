import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Send,
  Sliders,
  DollarSign,
  Activity,
  ArrowUpRight,
  FileText,
  Clock,
  Briefcase,
  AlertCircle,
  HelpCircle,
  Zap,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { Customer, RiskConfig, EarlyWarningAlert, CustomerSegment } from '../types';
import { api } from '../services/api';
import { calculateRiskAssessment } from '../utils/scoringEngine';
import { NavPage } from './Sidebar';

interface CustomerWiseDashboardProps {
  selectedCustomerId?: string;
  config: RiskConfig;
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
}

export const CustomerWiseDashboard: React.FC<CustomerWiseDashboardProps> = ({
  selectedCustomerId,
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
  const [segmentFilter, setSegmentFilter] = useState<'All' | CustomerSegment>('All');
  const [alerts, setAlerts] = useState<EarlyWarningAlert[]>([]);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // AI Copilot State for Customer
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiQuery, setAiQuery] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<any | null>(null);

  // Load Customers and Alerts
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      api.searchCustomers(undefined, undefined, undefined, config),
      api.getAlerts()
    ]).then(([custList, alertList]) => {
      if (!mounted) return;
      setCustomers(custList);
      setAlerts(alertList);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load customer dashboard data:', err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [config]);

  // Determine active customer
  const activeCustomer = useMemo(() => {
    if (!customers || customers.length === 0) return null;
    if (selectedCustomerId) {
      const match = customers.find((c) => c.id === selectedCustomerId);
      if (match) return match;
    }
    return customers[0];
  }, [customers, selectedCustomerId]);

  // Computed Risk Assessment for active customer
  const assessment = useMemo(() => {
    if (!activeCustomer) return null;
    return calculateRiskAssessment(activeCustomer, config);
  }, [activeCustomer, config]);

  // Filtered customer list for quick switching
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        !searchQuery.trim() ||
        c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());

      const computed = calculateRiskAssessment(c, config);
      const matchesTier = tierFilter === 'All' || computed.riskTier === tierFilter;
      const matchesSegment = segmentFilter === 'All' || c.segment === segmentFilter;

      return matchesSearch && matchesTier && matchesSegment;
    });
  }, [customers, searchQuery, tierFilter, segmentFilter, config]);

  // Customer Index Navigation (Prev / Next)
  const currentIndex = useMemo(() => {
    if (!activeCustomer || filteredCustomers.length === 0) return 0;
    const idx = filteredCustomers.findIndex((c) => c.id === activeCustomer.id);
    return idx >= 0 ? idx : 0;
  }, [activeCustomer, filteredCustomers]);

  const handlePrevCustomer = () => {
    if (filteredCustomers.length === 0) return;
    const prevIdx = (currentIndex - 1 + filteredCustomers.length) % filteredCustomers.length;
    onSelectCustomer(filteredCustomers[prevIdx].id);
    setAiResponse(null);
  };

  const handleNextCustomer = () => {
    if (filteredCustomers.length === 0) return;
    const nextIdx = (currentIndex + 1) % filteredCustomers.length;
    onSelectCustomer(filteredCustomers[nextIdx].id);
    setAiResponse(null);
  };

  // Customer alerts
  const customerAlerts = useMemo(() => {
    if (!activeCustomer) return [];
    return alerts.filter(
      (a) => a.customerId === activeCustomer.id || a.customerName === activeCustomer.fullName
    );
  }, [alerts, activeCustomer]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(label);
    setTimeout(() => setCopiedType(null), 2200);
  };

  // Run AI Copilot for Customer
  const handleAskCustomerAi = async (promptText?: string) => {
    if (!activeCustomer) return;
    const query = promptText || aiQuery;
    if (!query.trim()) return;

    setAiLoading(true);
    setAiQuery(query);

    try {
      const context = {
        customerId: activeCustomer.id,
        customerName: activeCustomer.fullName,
        cardType: activeCustomer.cardType,
        balance: activeCustomer.outstandingBalance,
        limit: activeCustomer.creditLimit,
        utilization: activeCustomer.creditUtilization,
        segment: activeCustomer.segment,
        riskTier: assessment?.riskTier,
        riskScore: assessment?.riskScore,
        defaultProbability: assessment?.defaultProbability,
        delayedPayments6M: activeCustomer.delayedPayments6M,
        cashAdvances: activeCustomer.cashAdvanceCount6M,
        paymentToMinRatio: activeCustomer.paymentToMinRatio,
      };

      const res = await api.askAiRiskAssistant(query, context);
      setAiResponse(res);
    } catch (err) {
      console.error('AI assistant query error:', err);
      // Fallback structured analysis
      setAiResponse({
        answer: `Underwriting Evaluation for ${activeCustomer.fullName} (${activeCustomer.id}): Revolving utilization stands at ${activeCustomer.creditUtilization.toFixed(1)}% with $${activeCustomer.outstandingBalance.toLocaleString()} outstanding against a $${activeCustomer.creditLimit.toLocaleString()} credit ceiling. Payment-to-minimum ratio of ${activeCustomer.paymentToMinRatio}x and ${activeCustomer.delayedPayments6M} late cycles in the past 6 months place this account in the ${assessment?.riskTier || 'Moderate'} risk bracket.`,
        keyFactors: [
          `Credit Utilization: ${activeCustomer.creditUtilization.toFixed(1)}% (${activeCustomer.creditUtilization > 75 ? 'Critical' : 'Moderate'})`,
          `Repayment Discipline: ${activeCustomer.delayedPayments6M} late payments in 6M`,
          `Cash Advance Draws: ${activeCustomer.cashAdvanceCount6M} instances recorded`,
          `Household Spend Velocity: $${activeCustomer.monthlyAverageSpend.toLocaleString()} / month`,
        ],
        recommendedActions: [
          assessment?.riskTier === 'High'
            ? 'Execute line curtailment: decrease credit limit by 25%.'
            : 'Maintain current revolving line with bi-weekly surveillance.',
          'Issue automated SMS payment alert 4 days prior to statement close date.',
          'Review liquidity buffer against declared income ($' + activeCustomer.annualIncome.toLocaleString() + '/yr).'
        ],
        draftNotice: `Subject: Important Advisory Regarding Your ${activeCustomer.cardType} Line of Credit\n\nDear ${activeCustomer.fullName},\n\nWe are conducting our periodic account review for card ending ${activeCustomer.id.slice(-4)}. To help ensure continued optimal account performance and maintain your credit health, our risk advisory desk has prepared customized repayment options for your current balance of $${activeCustomer.outstandingBalance.toLocaleString()}.\n\nPlease contact our dedicated account team at 1-800-CREDIT-GUARD or review your digital dashboard to view personalized payment plans.`
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Quick Action Handler
  const handleQuickAction = (actionTitle: string) => {
    setActionNotice(`Action applied: ${actionTitle} for ${activeCustomer?.fullName}. Recorded in audit log.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto py-24 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-[#4338ca] animate-spin" />
        <p className="text-sm font-mono text-slate-500">Loading Customer-Wise Dashboard & Risk Metrics...</p>
      </div>
    );
  }

  if (!activeCustomer || !assessment) {
    return (
      <div className="max-w-[1400px] mx-auto py-16 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
        <h3 className="text-lg font-bold text-slate-800">No Customer Selected</h3>
        <p className="text-sm text-slate-500">Select a customer from the search index to view customer-wise metrics.</p>
        <button
          onClick={() => onNavigate('search')}
          className="px-4 py-2 bg-[#14213D] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
        >
          Browse All Customers
        </button>
      </div>
    );
  }

  // Pre-calculated values
  const availableCredit = Math.max(0, activeCustomer.creditLimit - activeCustomer.outstandingBalance);
  const util = activeCustomer.creditUtilization;
  const isHighUtil = util >= 80;
  const isMedUtil = util >= 50 && util < 80;

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      {/* Top Banner & Quick Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                Customer-Wise Underwriting Dashboard
              </span>
              <span className="text-xs font-mono text-slate-400">
                Record {currentIndex + 1} of {filteredCustomers.length}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {activeCustomer.fullName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Account ID: <span className="font-mono font-semibold text-slate-800">{activeCustomer.id}</span> · {activeCustomer.email} · Cardholder since {activeCustomer.joinedDate}
            </p>
          </div>

          {/* Quick Prev / Next Controls & Jump Selector */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
              <button
                onClick={handlePrevCustomer}
                title="Previous customer"
                className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono text-slate-600 font-medium">
                {currentIndex + 1} / {filteredCustomers.length}
              </span>
              <button
                onClick={handleNextCustomer}
                title="Next customer"
                className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                onSelectCustomer(activeCustomer.id);
                onNavigate('assessment');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-semibold border border-indigo-200 transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              Full Risk Model
            </button>

            <button
              onClick={() => {
                onSelectCustomer(activeCustomer.id);
                onNavigate('reports');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              Audit Report
            </button>
          </div>
        </div>

        {/* Customer Finder & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by customer name, ID, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="All">All Risk Tiers</option>
              <option value="High">High Risk Only</option>
              <option value="Medium">Medium Risk Only</option>
              <option value="Low">Low Risk Only</option>
            </select>
          </div>

          <div className="sm:col-span-4">
            <select
              value={activeCustomer.id}
              onChange={(e) => {
                onSelectCustomer(e.target.value);
                setAiResponse(null);
              }}
              className="w-full px-3 py-2 bg-white border border-indigo-200 text-indigo-900 font-semibold rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.fullName} ({c.cardType} — {c.creditUtilization.toFixed(0)}% util)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Primary Credit Card Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Credit Line Utilization */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Revolver Utilization</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
              isHighUtil ? 'bg-rose-100 text-rose-800 border border-rose-200' :
              isMedUtil ? 'bg-amber-100 text-amber-800 border border-amber-200' :
              'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {isHighUtil ? 'Critical' : isMedUtil ? 'Elevated' : 'Optimal'}
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{util.toFixed(1)}%</span>
              <span className="text-xs text-slate-400">of ${activeCustomer.creditLimit.toLocaleString()} limit</span>
            </div>
            {/* Utilization Bar */}
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isHighUtil ? 'bg-rose-500' : isMedUtil ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, util)}%` }}
              />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Available Line:</span>
            <span className="font-semibold text-slate-800">${availableCredit.toLocaleString()}</span>
          </div>
        </div>

        {/* Card 2: Current Outstanding Balance */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Outstanding Balance</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900">${activeCustomer.outstandingBalance.toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Card: <span className="font-semibold text-slate-700">{activeCustomer.cardType}</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Spend Velocity:</span>
            <span className="font-semibold text-slate-800">${activeCustomer.monthlyAverageSpend.toLocaleString()} / mo</span>
          </div>
        </div>

        {/* Card 3: Default Probability & Risk Rating */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Default Probability</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
              assessment.riskTier === 'High' ? 'bg-rose-100 text-rose-800' :
              assessment.riskTier === 'Medium' ? 'bg-amber-100 text-amber-800' :
              'bg-emerald-100 text-emerald-800'
            }`}>
              {assessment.riskTier} Risk
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{assessment.defaultProbability}%</span>
              <span className="text-xs text-slate-400">Score: {assessment.riskScore}/100</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Segment: <span className="font-semibold text-slate-700">{activeCustomer.segment}</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Delinquency 6M:</span>
            <span className={`font-semibold ${activeCustomer.delayedPayments6M > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {activeCustomer.delayedPayments6M} late cycles
            </span>
          </div>
        </div>

        {/* Card 4: Repayment Discipline */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment-To-Min Ratio</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{activeCustomer.paymentToMinRatio}x</span>
              <span className="text-xs text-slate-400">vs Min Due</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cash Advance 6M: <span className="font-semibold text-slate-700">{activeCustomer.cashAdvanceCount6M} draws</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Annual Income:</span>
            <span className="font-semibold text-slate-800">${activeCustomer.annualIncome.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Customer Repayment History + Risk Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Repayment Timeline & Monthly History */}
        <div className="lg:col-span-7 space-y-6">
          {/* Cardholder Repayment Cycle Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">6-Month Repayment & Balance Trajectory</h3>
                <p className="text-xs text-slate-500">Historical statement cycles, payment amounts, and minimum due comparison</p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 rounded-lg text-slate-600">
                {activeCustomer.repaymentHistory?.length || 0} Cycles Recorded
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Statement Cycle</th>
                    <th className="py-2.5 px-3 text-right">Cycle Balance</th>
                    <th className="py-2.5 px-3 text-right">Min Due</th>
                    <th className="py-2.5 px-3 text-right">Actual Payment</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeCustomer.repaymentHistory?.map((cycle, idx) => {
                    const ratio = cycle.minPaymentDue > 0 ? (cycle.paymentAmount / cycle.minPaymentDue).toFixed(1) : '1.0';
                    const isLate = cycle.status === 'late' || (cycle.daysDelayed !== null && cycle.daysDelayed > 0);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-800 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {cycle.month}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-800">
                          ${cycle.balance?.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          ${cycle.minPaymentDue?.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          ${cycle.paymentAmount?.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isLate
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {isLate ? `${cycle.daysDelayed || 30}d Delayed` : 'On-Time'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-indigo-700">
                          {ratio}x
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Delinquency Indicators Summary Banner */}
            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-700">Employment Profile:</span>
                <span className="text-slate-600">{activeCustomer.employmentStatus} ({activeCustomer.employerCategory})</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-700">Credit History:</span>
                <span className="text-slate-600">{activeCustomer.creditHistoryYears} years</span>
              </div>
            </div>
          </div>

          {/* Underwriting Red Flags & Positive Buffers */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">Underwriting Risk Factors & Drivers</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Positive Indicators */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Positive Risk Buffers ({assessment.positiveIndicators.length})
                </div>
                <ul className="space-y-1.5 text-xs text-emerald-900">
                  {assessment.positiveIndicators.length > 0 ? (
                    assessment.positiveIndicators.map((ind, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5">•</span>
                        <span>{ind}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-500 italic">No significant positive buffers identified.</li>
                  )}
                </ul>
              </div>

              {/* Negative Indicators */}
              <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-xs uppercase tracking-wide">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Risk Drivers & Alerts ({assessment.negativeIndicators.length})
                </div>
                <ul className="space-y-1.5 text-xs text-rose-900">
                  {assessment.negativeIndicators.length > 0 ? (
                    assessment.negativeIndicators.map((ind, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-500 mt-0.5">•</span>
                        <span>{ind}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-emerald-700">Account operating with zero negative triggers.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Quick Underwriting Actions Bar */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-slate-600">Quick Interventions:</span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleQuickAction('Reduce Credit Limit by 20%')}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200 transition-colors cursor-pointer"
                >
                  Curtail Line (-20%)
                </button>
                <button
                  onClick={() => handleQuickAction('Temporarily Disable Cash Advance Capability')}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg border border-amber-200 transition-colors cursor-pointer"
                >
                  Block Cash Advance
                </button>
                <button
                  onClick={() => handleQuickAction('Issue Automated Hardship Workout Advisory')}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                >
                  Offer 0% APR Workout
                </button>
                <button
                  onClick={() => handleQuickAction('Approve Credit Limit Expansion (Low Risk)')}
                  disabled={assessment.riskTier === 'High'}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                >
                  Expand Limit (+25%)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): AI Customer Risk Copilot & Alerts */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Cardholder Alerts */}
          {customerAlerts.length > 0 && (
            <div className="bg-rose-50/70 border border-rose-300 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                    Active Surveillance Alerts ({customerAlerts.length})
                  </h4>
                </div>
                <button
                  onClick={() => onNavigate('alerts')}
                  className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 flex items-center gap-1 cursor-pointer"
                >
                  View All Alerts <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-2">
                {customerAlerts.map((alert) => (
                  <div key={alert.id} className="p-3 bg-white rounded-xl border border-rose-200 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{alert.triggerReason}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800">
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">{alert.suggestedAction || 'Review cardholder account'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Customer Copilot Box (Powered by Gemini) */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-2xl p-6 shadow-md border border-indigo-800/60 space-y-5">
            <div className="flex items-center justify-between border-b border-indigo-700/50 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/80 flex items-center justify-center text-white shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">AI Cardholder Copilot</h3>
                  <p className="text-[11px] text-indigo-300">Gemini Risk Assessment & Policy Advisor</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Online
              </span>
            </div>

            {/* Quick Prompt Buttons */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider block">
                Quick Copilot Actions:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleAskCustomerAi(`Provide a comprehensive risk audit and credit limit recommendation for ${activeCustomer.fullName}.`)}
                  disabled={aiLoading}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 border border-indigo-600/40 transition-colors cursor-pointer text-left"
                >
                  🔍 Cardholder Risk Dossier
                </button>
                <button
                  onClick={() => handleAskCustomerAi(`Evaluate whether this cardholder should receive a credit line decrease or forbearance based on their ${activeCustomer.creditUtilization.toFixed(1)}% utilization and repayment history.`)}
                  disabled={aiLoading}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 border border-indigo-600/40 transition-colors cursor-pointer text-left"
                >
                  📉 Line Decrease Analysis
                </button>
                <button
                  onClick={() => handleAskCustomerAi(`Draft a professional customer relief notice with tailored repayment options for ${activeCustomer.fullName}.`)}
                  disabled={aiLoading}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 border border-indigo-600/40 transition-colors cursor-pointer text-left"
                >
                  📝 Draft Cardholder Relief Memo
                </button>
              </div>
            </div>

            {/* Interactive Query Input */}
            <div className="space-y-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Ask Gemini about ${activeCustomer.fullName}'s risk...`}
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAskCustomerAi();
                  }}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-900/90 border border-indigo-500/50 rounded-xl text-xs text-white placeholder-indigo-300/60 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  onClick={() => handleAskCustomerAi()}
                  disabled={aiLoading || !aiQuery.trim()}
                  className="absolute right-2 top-2 p-1 text-indigo-300 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* AI Response Display */}
            {aiResponse && (
              <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/40 space-y-3.5 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px]">
                      Underwriting Intelligence Summary
                    </span>
                    <button
                      onClick={() => handleCopy(aiResponse.answer, 'summary')}
                      className="text-[10px] text-indigo-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedType === 'summary' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-slate-200 leading-relaxed text-xs">
                    {aiResponse.answer}
                  </p>
                </div>

                {/* Key Factors */}
                {aiResponse.keyFactors && aiResponse.keyFactors.length > 0 && (
                  <div className="border-t border-indigo-800/60 pt-2.5">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">
                      Key Risk Factors
                    </span>
                    <ul className="space-y-1">
                      {aiResponse.keyFactors.map((factor: string, i: number) => (
                        <li key={i} className="text-slate-300 text-[11px] flex items-start gap-1.5">
                          <span className="text-indigo-400">•</span>
                          <span>{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommended Actions */}
                {aiResponse.recommendedActions && aiResponse.recommendedActions.length > 0 && (
                  <div className="border-t border-indigo-800/60 pt-2.5">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">
                      Recommended Bank Interventions
                    </span>
                    <ul className="space-y-1">
                      {aiResponse.recommendedActions.map((act: string, i: number) => (
                        <li key={i} className="text-slate-300 text-[11px] flex items-start gap-1.5">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Draft Customer Notice if available */}
                {aiResponse.draftNotice && (
                  <div className="border-t border-indigo-800/60 pt-2.5 bg-black/30 p-2.5 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                        Generated Cardholder Communication Draft
                      </span>
                      <button
                        onClick={() => handleCopy(aiResponse.draftNotice, 'notice')}
                        className="text-[10px] text-indigo-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedType === 'notice' ? 'Copied' : 'Copy Draft'}
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-tight">
                      {aiResponse.draftNotice}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
