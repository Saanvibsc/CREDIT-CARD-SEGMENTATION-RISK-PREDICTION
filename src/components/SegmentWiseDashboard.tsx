import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Users,
  CreditCard,
  DollarSign,
  Sparkles,
  Sliders,
  Send,
  Copy,
  ExternalLink,
  ChevronRight,
  Filter,
  RefreshCw,
  Eye,
  Info
} from 'lucide-react';
import { Customer, RiskConfig, CustomerSegment, RiskTier } from '../types';
import { api } from '../services/api';
import { calculateRiskAssessment } from '../utils/scoringEngine';
import { NavPage } from './Sidebar';

interface SegmentWiseDashboardProps {
  config: RiskConfig;
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
}

const SEGMENT_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  'Prime Transactors': { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: '#10b981', border: 'border-emerald-200' },
  'Revolving Balances': { bg: 'bg-blue-50', text: 'text-blue-800', dot: '#3b82f6', border: 'border-blue-200' },
  'Elevated Leverage': { bg: 'bg-amber-50', text: 'text-amber-800', dot: '#f59e0b', border: 'border-amber-200' },
  'Delinquency Watchlist': { bg: 'bg-rose-50', text: 'text-rose-800', dot: '#ef4444', border: 'border-rose-200' },
  'Emerging Young Borrowers': { bg: 'bg-purple-50', text: 'text-purple-800', dot: '#8b5cf6', border: 'border-purple-200' },
};

const DEFAULT_SEGMENT_COLOR = { bg: 'bg-slate-50', text: 'text-slate-800', dot: '#64748b', border: 'border-slate-200' };

export const SegmentWiseDashboard: React.FC<SegmentWiseDashboardProps> = ({
  config,
  onSelectCustomer,
  onNavigate,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [segmentsData, setSegmentsData] = useState<any[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<'All' | string>('All');
  const [loading, setLoading] = useState<boolean>(true);
  const [hoveredCustomer, setHoveredCustomer] = useState<Customer | null>(null);
  const [selectedDotCustomer, setSelectedDotCustomer] = useState<Customer | null>(null);
  const [showValueLabels, setShowValueLabels] = useState<boolean>(false);

  // Policy Simulator States
  const [limitAdjustmentPct, setLimitAdjustmentPct] = useState<number>(0);
  const [minPaymentPct, setMinPaymentPct] = useState<number>(2.5);
  const [restrictCashAdvance, setRestrictCashAdvance] = useState<boolean>(false);
  const [matrixRiskFilter, setMatrixRiskFilter] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');

  // AI Segment Strategist States
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiQuery, setAiQuery] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<any | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.searchCustomers(undefined, undefined, undefined, config),
      api.getSegmentationData()
    ]).then(([custList, segData]) => {
      if (!mounted) return;
      setCustomers(custList);
      setSegmentsData(segData.segments || []);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load segment dashboard data:', err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [config]);

  // Available unique segments
  const uniqueSegments = useMemo(() => {
    const list = Array.from(new Set(customers.map((c) => c.segment).filter(Boolean)));
    return list.length > 0 ? list : [
      'Prime Transactors',
      'Revolving Balances',
      'Elevated Leverage',
      'Delinquency Watchlist',
      'Emerging Young Borrowers'
    ];
  }, [customers]);

  // Filtered customers for active segment and risk filter
  const activeCustomers = useMemo(() => {
    let list = selectedSegment === 'All' ? customers : customers.filter((c) => c.segment === selectedSegment);
    if (matrixRiskFilter !== 'All') {
      list = list.filter((c) => {
        const assessment = calculateRiskAssessment(c, config);
        return assessment.riskTier === matrixRiskFilter;
      });
    }
    return list;
  }, [customers, selectedSegment, matrixRiskFilter, config]);

  // Combined Segment x Risk Cross-Analysis Matrix
  const segmentRiskCrossMatrix = useMemo(() => {
    return uniqueSegments.map((seg) => {
      const segCusts = customers.filter((c) => c.segment === seg);
      const total = segCusts.length;

      const scored = segCusts.map((c) => ({
        customer: c,
        assessment: calculateRiskAssessment(c, config),
      }));

      const low = scored.filter((s) => s.assessment.riskTier === 'Low');
      const med = scored.filter((s) => s.assessment.riskTier === 'Medium');
      const high = scored.filter((s) => s.assessment.riskTier === 'High');

      const lowExposure = low.reduce((sum, s) => sum + (s.customer.outstandingBalance || 0), 0);
      const medExposure = med.reduce((sum, s) => sum + (s.customer.outstandingBalance || 0), 0);
      const highExposure = high.reduce((sum, s) => sum + (s.customer.outstandingBalance || 0), 0);
      const totalExposure = lowExposure + medExposure + highExposure;

      const avgPd = total > 0
        ? scored.reduce((sum, s) => sum + s.assessment.defaultProbability, 0) / total
        : 0;

      return {
        segment: seg,
        total,
        totalExposure,
        avgPd,
        low: {
          count: low.length,
          pct: total > 0 ? (low.length / total) * 100 : 0,
          exposure: lowExposure,
        },
        med: {
          count: med.length,
          pct: total > 0 ? (med.length / total) * 100 : 0,
          exposure: medExposure,
        },
        high: {
          count: high.length,
          pct: total > 0 ? (high.length / total) * 100 : 0,
          exposure: highExposure,
        },
      };
    });
  }, [customers, uniqueSegments, config]);

  // Aggregate metrics for active segment
  const segmentStats = useMemo(() => {
    const totalCount = activeCustomers.length;
    if (totalCount === 0) {
      return {
        totalCount: 0,
        totalExposure: 0,
        totalLimit: 0,
        avgUtilization: 0,
        avgBalance: 0,
        avgDefaultRate: 0,
        avgIncome: 0,
        highRiskCount: 0,
        totalMonthlySpend: 0,
      };
    }

    let totalExposure = 0;
    let totalLimit = 0;
    let totalIncome = 0;
    let totalSpend = 0;
    let sumDefaultRate = 0;
    let highRiskCount = 0;

    activeCustomers.forEach((c) => {
      totalExposure += c.outstandingBalance ?? 0;
      totalLimit += c.creditLimit ?? 0;
      totalIncome += c.annualIncome ?? 0;
      totalSpend += c.monthlyAverageSpend ?? (c.outstandingBalance * 0.35);

      const assessment = calculateRiskAssessment(c, config);
      sumDefaultRate += assessment.defaultProbability;
      if (assessment.riskTier === 'High') highRiskCount++;
    });

    return {
      totalCount,
      totalExposure,
      totalLimit,
      avgUtilization: totalLimit > 0 ? (totalExposure / totalLimit) * 100 : 0,
      avgBalance: totalExposure / totalCount,
      avgDefaultRate: sumDefaultRate / totalCount,
      avgIncome: totalIncome / totalCount,
      highRiskCount,
      totalMonthlySpend: totalSpend,
    };
  }, [activeCustomers, config]);

  // Simulated Policy Impact
  const simulatedImpact = useMemo(() => {
    const impactedCount = activeCustomers.length;
    if (impactedCount === 0) return { capitalSaved: 0, defaultRateDrop: 0 };

    const limitChange = (segmentStats.totalLimit * limitAdjustmentPct) / 100;
    const paymentBuffer = minPaymentPct > 2.5 ? (minPaymentPct - 2.5) * 1.8 : 0;
    const cashAdvancePenalty = restrictCashAdvance ? 2.4 : 0;

    // Projected default rate improvement
    const defaultReduction = Math.max(0, -limitAdjustmentPct * 0.15 + paymentBuffer + cashAdvancePenalty);
    const capitalSaved = Math.max(0, -limitChange * 0.45 + (segmentStats.totalExposure * (defaultReduction / 100)));

    return {
      capitalSaved,
      defaultRateDrop: Math.min(segmentStats.avgDefaultRate, defaultReduction),
    };
  }, [activeCustomers, segmentStats, limitAdjustmentPct, minPaymentPct, restrictCashAdvance]);

  // AI Segment Strategist query
  const handleAskSegmentAi = async (promptText?: string) => {
    const query = promptText || aiQuery;
    if (!query.trim()) return;

    setAiLoading(true);
    setAiQuery(query);

    try {
      const context = {
        segment: selectedSegment,
        customerCount: segmentStats.totalCount,
        totalExposure: segmentStats.totalExposure,
        avgUtilization: segmentStats.avgUtilization.toFixed(1) + '%',
        avgDefaultRate: segmentStats.avgDefaultRate.toFixed(1) + '%',
        highRiskCount: segmentStats.highRiskCount,
        totalMonthlySpend: segmentStats.totalMonthlySpend,
      };

      const res = await api.askAiRiskAssistant(query, context);
      setAiResponse(res);
    } catch (err) {
      console.error('AI segment query error:', err);
      setAiResponse({
        answer: `Segment Diagnostic for [${selectedSegment}]: Comprising ${segmentStats.totalCount} cardholders with $${segmentStats.totalExposure.toLocaleString()} in aggregate revolving exposure. Average credit utilization is ${segmentStats.avgUtilization.toFixed(1)}% with an average default probability of ${segmentStats.avgDefaultRate.toFixed(1)}%. Accounts under surveillance exhibit sensitivity to interest rate spikes and cash advance restrictions.`,
        keyFactors: [
          `Portfolio Exposure: $${segmentStats.totalExposure.toLocaleString()} across ${segmentStats.totalCount} active accounts`,
          `Average Utilization: ${segmentStats.avgUtilization.toFixed(1)}%`,
          `High-Risk Concentration: ${segmentStats.highRiskCount} cardholders flagged for priority review`,
          `Average Annual Cardholder Income: $${Math.round(segmentStats.avgIncome).toLocaleString()}`,
        ],
        recommendedActions: [
          'Enforce segment-wide limit curtailment of 15% on accounts with utilization >80%.',
          'Deploy automated mid-cycle billing reminders 4 days prior to due dates.',
          'Cap cash advance facilities to 15% of total line on elevated leverage cohorts.',
        ],
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2200);
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto py-24 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-[#4338ca] animate-spin" />
        <p className="text-sm font-mono text-slate-500">Loading Segment-Wise Dashboard & Clusters...</p>
      </div>
    );
  }

  // Scatter plot constants
  const maxBalance = 25000;
  const maxUtil = 100;

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20">
      {/* Top Header & Segment Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                Segment-Wise Portfolio Dashboard
              </span>
              <span className="text-xs font-mono text-slate-400">
                Credit Card Cohort Intelligence & Scatter Analysis
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {selectedSegment === 'All' ? 'Complete Portfolio Segmentation' : selectedSegment}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Analyzing <span className="font-bold text-slate-800">{segmentStats.totalCount}</span> credit card accounts · ${segmentStats.totalExposure.toLocaleString()} outstanding revolving exposure
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('customer-dashboard')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer"
            >
              Switch to Customer-Wise View
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Segment Pill Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSelectedSegment('All');
              setSelectedDotCustomer(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedSegment === 'All'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Segments ({customers.length})
          </button>

          {uniqueSegments.map((seg) => {
            const isSelected = selectedSegment === seg;
            const count = customers.filter((c) => c.segment === seg).length;
            const color = SEGMENT_COLORS[seg] || DEFAULT_SEGMENT_COLOR;

            return (
              <button
                key={seg}
                onClick={() => {
                  setSelectedSegment(seg);
                  setSelectedDotCustomer(null);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color.dot }}
                />
                <span>{seg}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Primary Segment KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Segment Exposure */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Segment Exposure</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              ${segmentStats.totalExposure.toLocaleString()}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Avg Balance: <span className="font-semibold text-slate-800">${Math.round(segmentStats.avgBalance).toLocaleString()}</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Total Credit Limit:</span>
            <span className="font-semibold text-slate-800">${segmentStats.totalLimit.toLocaleString()}</span>
          </div>
        </div>

        {/* Metric 2: Average Line Utilization */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Average Utilization</span>
            <BarChart3 className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              {segmentStats.avgUtilization.toFixed(1)}%
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${
                  segmentStats.avgUtilization > 75 ? 'bg-rose-500' :
                  segmentStats.avgUtilization > 40 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, segmentStats.avgUtilization)}%` }}
              />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Spend Velocity:</span>
            <span className="font-semibold text-slate-800">${(segmentStats.totalMonthlySpend ?? 0).toLocaleString()}/mo</span>
          </div>
        </div>

        {/* Metric 3: Default Probability */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Projected Default Rate</span>
            <TrendingUp className="w-4 h-4 text-rose-500" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              {segmentStats.avgDefaultRate.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-500 mt-1">
              High Risk Accounts: <span className="font-bold text-rose-600">{segmentStats.highRiskCount}</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Risk Composition:</span>
            <span className="font-semibold text-slate-800">
              {((segmentStats.highRiskCount / Math.max(1, segmentStats.totalCount)) * 100).toFixed(0)}% High Tier
            </span>
          </div>
        </div>

        {/* Metric 4: Cardholder Count & Income */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Segment Accounts</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              {segmentStats.totalCount}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Avg Income: <span className="font-semibold text-slate-800">${Math.round(segmentStats.avgIncome).toLocaleString()}</span>
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Share of Portfolio:</span>
            <span className="font-semibold text-slate-800">
              {((segmentStats.totalCount / Math.max(1, customers.length)) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* CENTERPIECE: Interactive Segment Scatter Plot & Quadrant Visualizer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <h2 className="text-lg font-black text-slate-900">
                Customer Scatter Map: Card Usage vs. Total Balance
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Every dot is a cardholder. Left-to-right shows percentage of credit limit used (0% to 100%). Bottom-to-top shows current unpaid balance ($0 to $25k).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Show Value Labels Toggle */}
            <button
              onClick={() => setShowValueLabels(!showValueLabels)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                showValueLabels
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{showValueLabels ? '✓ Showing Value Tags' : '+ Show Value Tags'}</span>
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Prime
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Revolver
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> High Debt
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Danger
              </span>
            </div>
          </div>
        </div>

        {/* Selected Dot Quick Popover Drawer */}
        {selectedDotCustomer && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{selectedDotCustomer.fullName}</span>
                <span className="font-mono text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-bold">
                  {selectedDotCustomer.id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-slate-700 font-semibold">
                  {selectedDotCustomer.cardType}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Balance: <span className="font-bold text-slate-900">${Number(selectedDotCustomer?.outstandingBalance || 0).toLocaleString()}</span> ·
                Utilization: <span className="font-bold text-slate-900">{(Number(selectedDotCustomer?.creditUtilization) || 0).toFixed(1)}%</span> ·
                Credit Limit: <span className="font-semibold text-slate-800">${Number(selectedDotCustomer?.creditLimit || 0).toLocaleString()}</span> ·
                Segment: <span className="font-semibold text-indigo-900">{selectedDotCustomer?.segment || 'Standard'}</span> ·
                Delinquency 6M: <span className="font-semibold text-slate-800">{selectedDotCustomer?.delayedPayments6M ?? 0} late cycles</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onSelectCustomer(selectedDotCustomer.id);
                  onNavigate('customer-dashboard');
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer"
              >
                Open in Customer Dashboard <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSelectedDotCustomer(null)}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* The SVG Scatter Plot Container */}
        <div className="relative w-full h-[480px] bg-white border border-slate-200 rounded-xl overflow-hidden p-2 select-none">
          {/* Quadrant Background Watermarks (Positioned inside the chart boundaries: Left 8% to 92%, Top 8% to 86%) */}
          <div className="absolute left-[8%] right-[8%] top-[8%] bottom-[14%] grid grid-cols-2 grid-rows-2 pointer-events-none">
            {/* Top-Left Quadrant */}
            <div className="border-r border-b border-dashed border-slate-200/80 p-3 bg-indigo-50/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700/80 bg-indigo-100/70 px-2 py-0.5 rounded">
                Quadrant II: High-Income Borrowers (High Debt, Low % Used)
              </span>
            </div>
            {/* Top-Right Quadrant */}
            <div className="border-b border-dashed border-slate-200/80 p-3 text-right bg-rose-50/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700/80 bg-rose-100/70 px-2 py-0.5 rounded">
                Quadrant I: Critical Danger Zone (Maxed Out &amp; High Debt)
              </span>
            </div>
            {/* Bottom-Left Quadrant */}
            <div className="border-r border-dashed border-slate-200/80 p-3 flex items-end bg-emerald-50/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80 bg-emerald-100/70 px-2 py-0.5 rounded">
                Quadrant III: Safe Prime Spenders (Low Debt, Low Card Usage)
              </span>
            </div>
            {/* Bottom-Right Quadrant */}
            <div className="p-3 flex items-end justify-end bg-amber-50/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80 bg-amber-100/70 px-2 py-0.5 rounded">
                Quadrant IV: Overextended Low-Limit (High % Used, Low Limit)
              </span>
            </div>
          </div>

          {/* Glitch-Free SVG Canvas with Fixed Coordinate ViewBox and Native Percentages */}
          <svg className="w-full h-full relative z-10 overflow-visible">
            {/* HORIZONTAL GRID LINES & Y-AXIS LABELS */}
            {[
              { val: 25000, label: '$25,000', yPct: 8 },
              { val: 20000, label: '$20,000', yPct: 23.6 },
              { val: 15000, label: '$15,000', yPct: 39.2 },
              { val: 10000, label: '$10,000', yPct: 54.8 },
              { val: 5000,  label: '$5,000',  yPct: 70.4 },
              { val: 0,     label: '$0',      yPct: 86 }
            ].map((tick) => (
              <g key={`y-${tick.val}`}>
                <line
                  x1="8%"
                  y1={`${tick.yPct}%`}
                  x2="92%"
                  y2={`${tick.yPct}%`}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text
                  x="7.2%"
                  y={`${tick.yPct}%`}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="text-[10px] font-mono font-medium fill-slate-400"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* VERTICAL GRID LINES & X-AXIS LABELS */}
            {[
              { val: 0,   label: '0%',   xPct: 8 },
              { val: 20,  label: '20%',  xPct: 24.8 },
              { val: 40,  label: '40%',  xPct: 41.6 },
              { val: 60,  label: '60%',  xPct: 58.4 },
              { val: 80,  label: '80%',  xPct: 75.2 },
              { val: 100, label: '100%', xPct: 92 }
            ].map((tick) => (
              <g key={`x-${tick.val}`}>
                <line
                  x1={`${tick.xPct}%`}
                  y1="8%"
                  x2={`${tick.xPct}%`}
                  y2="86%"
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text
                  x={`${tick.xPct}%`}
                  y="90.5%"
                  textAnchor="middle"
                  className="text-[10px] font-mono font-medium fill-slate-400"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* 30% Utilization Prime Ceiling Guide */}
            <line
              x1={`${8 + (30 / 100) * 84}%`}
              y1="8%"
              x2={`${8 + (30 / 100) * 84}%`}
              y2="86%"
              stroke="#10b981"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <text
              x={`${8 + (30 / 100) * 84}%`}
              y="6%"
              textAnchor="middle"
              className="text-[9px] font-bold fill-emerald-600 uppercase tracking-wider"
            >
              30% Prime Limit
            </text>

            {/* 75% Critical Threshold Line */}
            <line
              x1={`${8 + (75 / 100) * 84}%`}
              y1="8%"
              x2={`${8 + (75 / 100) * 84}%`}
              y2="86%"
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <text
              x={`${8 + (75 / 100) * 84}%`}
              y="6%"
              textAnchor="middle"
              className="text-[9px] font-bold fill-rose-600 uppercase tracking-wider"
            >
              75% Danger Line
            </text>

            {/* Chart Outer Axes */}
            <line x1="8%" y1="86%" x2="92%" y2="86%" stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1="8%" y1="8%" x2="8%" y2="86%" stroke="#cbd5e1" strokeWidth="1.5" />

            {/* Axis Titles */}
            <text x="50%" y="97%" textAnchor="middle" className="text-[11px] font-bold fill-slate-600 tracking-wide uppercase">
              Credit Card Utilization Rate (% of Card Limit) →
            </text>
            <text x="2%" y="4%" className="text-[11px] font-bold fill-slate-600 tracking-wide uppercase">
              ↑ Current Unpaid Balance ($)
            </text>

            {/* DYNAMIC CROSSHAIR LINES FOR HOVERED OR SELECTED CUSTOMER */}
            {hoveredCustomer && (() => {
              const hx = 8 + (Math.min(100, Math.max(0, hoveredCustomer.creditUtilization)) / 100) * 84;
              const hy = 86 - (Math.min(25000, Math.max(0, hoveredCustomer.outstandingBalance)) / 25000) * 78;
              return (
                <g pointerEvents="none">
                  {/* Vertical line to X-axis */}
                  <line
                    x1={`${hx}%`}
                    y1={`${hy}%`}
                    x2={`${hx}%`}
                    y2="86%"
                    stroke="#4338ca"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {/* Horizontal line to Y-axis */}
                  <line
                    x1="8%"
                    y1={`${hy}%`}
                    x2={`${hx}%`}
                    y2={`${hy}%`}
                    stroke="#4338ca"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {/* Highlight Pill on X Axis */}
                  <rect
                    x={`${hx - 3.5}%`}
                    y="87%"
                    width="7%"
                    height="16"
                    rx="4"
                    fill="#4338ca"
                  />
                  <text
                    x={`${hx}%`}
                    y="90.5%"
                    textAnchor="middle"
                    className="text-[10px] font-bold fill-white font-mono"
                  >
                    {hoveredCustomer.creditUtilization.toFixed(1)}%
                  </text>
                  {/* Highlight Pill on Y Axis */}
                  <rect
                    x="0.5%"
                    y={`${hy - 2}%`}
                    width="7.2%"
                    height="16"
                    rx="4"
                    fill="#4338ca"
                  />
                  <text
                    x="4.1%"
                    y={`${hy}%`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-[9px] font-bold fill-white font-mono"
                  >
                    ${Number(hoveredCustomer.outstandingBalance).toLocaleString()}
                  </text>
                </g>
              );
            })()}

            {/* RENDER SCATTER DOTS: Separate hit target from visual dot to guarantee zero flickering! */}
            {activeCustomers.map((c) => {
              const cxPct = 8 + (Math.min(100, Math.max(0, c.creditUtilization)) / 100) * 84;
              const cyPct = 86 - (Math.min(25000, Math.max(0, c.outstandingBalance)) / 25000) * 78;
              const colorInfo = SEGMENT_COLORS[c.segment] || DEFAULT_SEGMENT_COLOR;
              const isSelected = selectedDotCustomer?.id === c.id;
              const isHovered = hoveredCustomer?.id === c.id;

              return (
                <g key={c.id}>
                  {/* Focus outer ring on hover/selected */}
                  {(isSelected || isHovered) && (
                    <circle
                      cx={`${cxPct}%`}
                      cy={`${cyPct}%`}
                      r={13}
                      fill="none"
                      stroke={colorInfo.dot}
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      pointerEvents="none"
                    />
                  )}

                  {/* Visual Circle (no CSS scale transforms = zero jitter) */}
                  <circle
                    cx={`${cxPct}%`}
                    cy={`${cyPct}%`}
                    r={isSelected ? 8.5 : isHovered ? 7.5 : 5.5}
                    fill={colorInfo.dot}
                    fillOpacity={isSelected || isHovered ? 1 : 0.82}
                    stroke={isSelected ? '#0f172a' : isHovered ? '#1e1b4b' : '#ffffff'}
                    strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.2}
                    pointerEvents="none"
                  />

                  {/* Optional Permanent Value Tag if enabled */}
                  {showValueLabels && (
                    <text
                      x={`${cxPct + 1.2}%`}
                      y={`${cyPct - 1.2}%`}
                      className="text-[9px] font-bold fill-slate-700 pointer-events-none select-none"
                    >
                      ${(c.outstandingBalance / 1000).toFixed(1)}k · {c.creditUtilization.toFixed(0)}%
                    </text>
                  )}

                  {/* Transparent enlarged hit-target: handles all clicks and hover events seamlessly */}
                  <circle
                    cx={`${cxPct}%`}
                    cy={`${cyPct}%`}
                    r={14}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => setSelectedDotCustomer(c)}
                    onMouseEnter={() => setHoveredCustomer(c)}
                    onMouseLeave={() => {
                      if (hoveredCustomer?.id === c.id) {
                        setHoveredCustomer(null);
                      }
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* GLITCH-FREE POPUP TOOLTIP: Anchored directly to dot percentages inside container with pointer-events-none */}
          {hoveredCustomer && (() => {
            const tipX = 8 + (Math.min(100, Math.max(0, hoveredCustomer.creditUtilization)) / 100) * 84;
            const tipY = 86 - (Math.min(25000, Math.max(0, hoveredCustomer.outstandingBalance)) / 25000) * 78;
            const isTop = tipY < 38;
            const isFarRight = tipX > 72;
            const isFarLeft = tipX < 28;

            return (
              <div
                className={`absolute z-30 pointer-events-none bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700 backdrop-blur-xs min-w-[230px] transition-opacity duration-150 ${
                  isTop ? 'translate-y-4' : '-translate-y-[calc(100%+14px)]'
                } ${
                  isFarRight ? '-translate-x-[90%]' : isFarLeft ? '-translate-x-[10%]' : '-translate-x-1/2'
                }`}
                style={{ left: `${tipX}%`, top: `${tipY}%` }}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                  <span className="font-bold text-white text-xs">{hoveredCustomer.fullName}</span>
                  <span className="font-mono text-[10px] text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/50 font-bold">
                    {hoveredCustomer.id}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Unpaid Balance</span>
                    <span className="font-bold text-white font-mono text-xs">
                      ${Number(hoveredCustomer.outstandingBalance || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Card Limit Used</span>
                    <span className="font-bold text-white font-mono text-xs">
                      {Number(hoveredCustomer.creditUtilization || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Credit Limit</span>
                    <span className="font-semibold text-slate-300 font-mono">
                      ${Number(hoveredCustomer.creditLimit || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Late in 6 Mos</span>
                    <span className={`font-semibold font-mono ${Number(hoveredCustomer.delayedPayments6M || 0) > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                      {hoveredCustomer.delayedPayments6M || 0} cycles
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                  <span className="text-indigo-300 font-semibold">{hoveredCustomer.segment}</span>
                  <span className="text-slate-400">Click dot to pin</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Combined Segment x Risk Cross-Analysis Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                Segment × Risk Analysis
              </span>
              <h3 className="text-base font-bold text-slate-900">
                Segment × Default Risk Cross-Tabulation Matrix
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Cross-tabulates K-Means customer segments against calibrated default risk tiers with revolving balance exposure ($).
              Click any cell to filter the cardholder portfolio below.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(selectedSegment !== 'All' || matrixRiskFilter !== 'All') && (
              <button
                onClick={() => {
                  setSelectedSegment('All');
                  setMatrixRiskFilter('All');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Filter ({selectedSegment !== 'All' ? selectedSegment : ''} {matrixRiskFilter !== 'All' ? `· ${matrixRiskFilter} Risk` : ''})
              </button>
            )}
          </div>
        </div>

        {/* Matrix Risk Concentration Callout */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <div>
            <span className="text-slate-500 text-[11px] uppercase font-bold tracking-wider">Top Risk Concentration</span>
            <div className="font-bold text-slate-900 mt-0.5">
              {segmentRiskCrossMatrix.reduce((prev, curr) => (curr.high.exposure > prev.high.exposure ? curr : prev), segmentRiskCrossMatrix[0])?.segment}
            </div>
            <p className="text-[11px] text-slate-500">
              Concentrates ${segmentRiskCrossMatrix.reduce((max, s) => Math.max(max, s.high.exposure), 0).toLocaleString()} in high-risk revolving balance
            </p>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] uppercase font-bold tracking-wider">Safest Cohort</span>
            <div className="font-bold text-emerald-700 mt-0.5">
              {segmentRiskCrossMatrix.reduce((prev, curr) => (curr.low.pct > prev.low.pct ? curr : prev), segmentRiskCrossMatrix[0])?.segment}
            </div>
            <p className="text-[11px] text-slate-500">
              Highest proportion of low-risk cardholders ({segmentRiskCrossMatrix.reduce((max, s) => Math.max(max, s.low.pct), 0).toFixed(1)}%)
            </p>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] uppercase font-bold tracking-wider">Total Portfolio High Risk</span>
            <div className="font-bold text-rose-600 mt-0.5">
              ${segmentRiskCrossMatrix.reduce((sum, s) => sum + s.high.exposure, 0).toLocaleString()} Exposure
            </div>
            <p className="text-[11px] text-slate-500">
              Across {segmentRiskCrossMatrix.reduce((sum, s) => sum + s.high.count, 0)} delinquent/overextended accounts
            </p>
          </div>
        </div>

        {/* Interactive Cross-Tabulation Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">Segment Cohort (K-Means)</th>
                <th className="py-3 px-4 text-center bg-emerald-50/60 text-emerald-900 border-x border-slate-200">
                  Low Risk Tier (Score ≤ 34)
                </th>
                <th className="py-3 px-4 text-center bg-amber-50/60 text-amber-900 border-r border-slate-200">
                  Medium Risk Tier (Score 35–64)
                </th>
                <th className="py-3 px-4 text-center bg-rose-50/60 text-rose-900 border-r border-slate-200">
                  High Risk Tier (Score ≥ 65)
                </th>
                <th className="py-3 px-4 text-right">Segment Exposure ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {segmentRiskCrossMatrix.map((row, idx) => {
                const isSegmentSelected = selectedSegment === row.segment;
                const color = SEGMENT_COLORS[row.segment] || DEFAULT_SEGMENT_COLOR;

                return (
                  <tr key={idx} className={isSegmentSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'}>
                    <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
                      <div>
                        <div className="font-bold">{row.segment}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{row.total} Cardholders · Avg PD {row.avgPd.toFixed(1)}%</div>
                      </div>
                    </td>

                    {/* Low Risk Cell */}
                    <td
                      onClick={() => {
                        setSelectedSegment(row.segment);
                        setMatrixRiskFilter('Low');
                      }}
                      className={`py-3 px-4 text-center border-x border-slate-200 cursor-pointer transition-all ${
                        isSegmentSelected && matrixRiskFilter === 'Low'
                          ? 'bg-emerald-200/80 font-bold ring-2 ring-emerald-500'
                          : 'hover:bg-emerald-100/60'
                      }`}
                    >
                      <div className="font-bold text-emerald-900">{row.low.count} ({row.low.pct.toFixed(0)}%)</div>
                      <div className="text-[10px] text-emerald-700 font-mono">${row.low.exposure.toLocaleString()}</div>
                    </td>

                    {/* Medium Risk Cell */}
                    <td
                      onClick={() => {
                        setSelectedSegment(row.segment);
                        setMatrixRiskFilter('Medium');
                      }}
                      className={`py-3 px-4 text-center border-r border-slate-200 cursor-pointer transition-all ${
                        isSegmentSelected && matrixRiskFilter === 'Medium'
                          ? 'bg-amber-200/80 font-bold ring-2 ring-amber-500'
                          : 'hover:bg-amber-100/60'
                      }`}
                    >
                      <div className="font-bold text-amber-900">{row.med.count} ({row.med.pct.toFixed(0)}%)</div>
                      <div className="text-[10px] text-amber-700 font-mono">${row.med.exposure.toLocaleString()}</div>
                    </td>

                    {/* High Risk Cell */}
                    <td
                      onClick={() => {
                        setSelectedSegment(row.segment);
                        setMatrixRiskFilter('High');
                      }}
                      className={`py-3 px-4 text-center border-r border-slate-200 cursor-pointer transition-all ${
                        isSegmentSelected && matrixRiskFilter === 'High'
                          ? 'bg-rose-200/80 font-bold ring-2 ring-rose-500'
                          : 'hover:bg-rose-100/60'
                      }`}
                    >
                      <div className="font-bold text-rose-900">{row.high.count} ({row.high.pct.toFixed(0)}%)</div>
                      <div className="text-[10px] text-rose-700 font-mono">${row.high.exposure.toLocaleString()}</div>
                    </td>

                    {/* Segment Exposure Total */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                      ${row.totalExposure.toLocaleString()}
                    </td>
                  </tr>
                );
              })}

              {/* Portfolio Totals Row */}
              <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-300">
                <td className="py-3 px-4">Portfolio Aggregate Total</td>
                <td className="py-3 px-4 text-center border-x border-slate-200 text-emerald-800">
                  {segmentRiskCrossMatrix.reduce((s, r) => s + r.low.count, 0)} accounts
                  <div className="text-[10px] font-mono text-emerald-700">
                    ${segmentRiskCrossMatrix.reduce((s, r) => s + r.low.exposure, 0).toLocaleString()}
                  </div>
                </td>
                <td className="py-3 px-4 text-center border-r border-slate-200 text-amber-800">
                  {segmentRiskCrossMatrix.reduce((s, r) => s + r.med.count, 0)} accounts
                  <div className="text-[10px] font-mono text-amber-700">
                    ${segmentRiskCrossMatrix.reduce((s, r) => s + r.med.exposure, 0).toLocaleString()}
                  </div>
                </td>
                <td className="py-3 px-4 text-center border-r border-slate-200 text-rose-800">
                  {segmentRiskCrossMatrix.reduce((s, r) => s + r.high.count, 0)} accounts
                  <div className="text-[10px] font-mono text-rose-700">
                    ${segmentRiskCrossMatrix.reduce((s, r) => s + r.high.exposure, 0).toLocaleString()}
                  </div>
                </td>
                <td className="py-3 px-4 text-right font-mono font-black">
                  ${segmentRiskCrossMatrix.reduce((s, r) => s + r.totalExposure, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparative Segment Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Comparative Segment Benchmark Matrix</h3>
            <p className="text-xs text-slate-500">Side-by-side performance indicators across all credit card cohorts</p>
          </div>
          <span className="text-xs font-mono text-slate-500">5 Segments Analyzed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3">Segment Cohort</th>
                <th className="py-2.5 px-3 text-right">Cardholders</th>
                <th className="py-2.5 px-3 text-right">Share</th>
                <th className="py-2.5 px-3 text-right">Avg Utilization</th>
                <th className="py-2.5 px-3 text-right">Avg Balance</th>
                <th className="py-2.5 px-3 text-right">Avg Income</th>
                <th className="py-2.5 px-3 text-right">Default Rate</th>
                <th className="py-2.5 px-3">Primary Underwriting Strategy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {segmentsData.map((seg, idx) => {
                const color = SEGMENT_COLORS[seg.segment || seg.name] || DEFAULT_SEGMENT_COLOR;
                const isSelected = selectedSegment === (seg.segment || seg.name);

                return (
                  <tr
                    key={idx}
                    onClick={() => setSelectedSegment(seg.segment || seg.name)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50/80 font-medium' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3 px-3 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.dot }} />
                      <div>
                        <div className="font-bold text-slate-900">{seg.name || seg.segment}</div>
                        <div className="text-[10px] text-slate-500">{seg.tagline}</div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-800">{seg.count}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">{seg.percentage}%</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{seg.avgUtilization}%</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-800">${seg.avgBalance?.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">${seg.avgIncome?.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-600">{seg.defaultRate}%</td>
                    <td className="py-3 px-3 text-[11px] text-slate-600">{seg.recommendedStrategy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: Interactive Segment Policy Simulator + AI Segment Strategist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (6 cols): What-If Policy Rebalancing Simulator */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                Segment Policy & Rebalancing Simulator
              </h3>
              <p className="text-xs text-slate-500">
                Simulate underwriting policy adjustments for <span className="font-semibold text-slate-800">[{selectedSegment}]</span>
              </p>
            </div>
            <button
              onClick={() => {
                setLimitAdjustmentPct(0);
                setMinPaymentPct(2.5);
                setRestrictCashAdvance(false);
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Reset
            </button>
          </div>

          <div className="space-y-4">
            {/* Slider 1: Credit Limit Adjustment */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Credit Limit Curtailment / Expansion:</span>
                <span className={`font-mono font-bold ${limitAdjustmentPct < 0 ? 'text-rose-600' : limitAdjustmentPct > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {limitAdjustmentPct > 0 ? `+${limitAdjustmentPct}%` : `${limitAdjustmentPct}%`}
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                step="5"
                value={limitAdjustmentPct}
                onChange={(e) => setLimitAdjustmentPct(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>-30% (Curtail)</span>
                <span>0% (Baseline)</span>
                <span>+30% (Expand)</span>
              </div>
            </div>

            {/* Slider 2: Minimum Payment Requirement */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Minimum Payment Ratio:</span>
                <span className="font-mono font-bold text-slate-900">{minPaymentPct.toFixed(1)}% of balance</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="5.0"
                step="0.5"
                value={minPaymentPct}
                onChange={(e) => setMinPaymentPct(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>2.0% (Standard)</span>
                <span>3.5%</span>
                <span>5.0% (Strict)</span>
              </div>
            </div>

            {/* Toggle 3: Restrict Cash Advance */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-800">Restrict Cash Advance Draws</div>
                <div className="text-[11px] text-slate-500">Block ATM draws on elevated utilization accounts</div>
              </div>
              <input
                type="checkbox"
                checked={restrictCashAdvance}
                onChange={(e) => setRestrictCashAdvance(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Simulated Outcome Display */}
          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                Estimated Capital Protected
              </span>
              <span className="text-2xl font-black text-indigo-900">
                ${Math.round(simulatedImpact.capitalSaved).toLocaleString()}
              </span>
              <span className="text-[10px] text-indigo-700 block mt-0.5">Across {segmentStats.totalCount} accounts</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 block">
                Default Rate Improvement
              </span>
              <span className="text-2xl font-black text-emerald-800">
                -{simulatedImpact.defaultRateDrop.toFixed(1)}%
              </span>
              <span className="text-[10px] text-emerald-700 block mt-0.5">Reduced risk delinquency</span>
            </div>
          </div>
        </div>

        {/* Right Column (6 cols): AI Segment Strategist (Gemini) */}
        <div className="lg:col-span-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-2xl p-6 shadow-md border border-indigo-800/60 space-y-5">
          <div className="flex items-center justify-between border-b border-indigo-700/50 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/80 flex items-center justify-center text-white shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">AI Segment Strategist</h3>
                <p className="text-[11px] text-indigo-300">Gemini Portfolio Diagnostic & Policy Advisor</p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              Active: {selectedSegment}
            </span>
          </div>

          {/* Quick AI Prompts */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider block">
              Quick Segment Inquiries:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleAskSegmentAi(`Perform an executive portfolio risk audit for the [${selectedSegment}] cohort. Highlight default threats and recommended credit line actions.`)}
                disabled={aiLoading}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 border border-indigo-600/40 transition-colors cursor-pointer text-left"
              >
                ⚡ Segment Risk Audit
              </button>
              <button
                onClick={() => handleAskSegmentAi(`Simulate a 200 bps macroeconomic rate hike on the [${selectedSegment}] cohort. What will happen to delinquency and revolving debt burden?`)}
                disabled={aiLoading}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 border border-indigo-600/40 transition-colors cursor-pointer text-left"
              >
                📈 Rate Hike Stress Test
              </button>
              <button
                onClick={() => handleAskSegmentAi(`Draft an Executive Credit Committee memo regarding policy rebalancing for the [${selectedSegment}] segment.`)}
                disabled={aiLoading}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-800/50 hover:bg-indigo-700 text-indigo-200 border border-indigo-600/40 transition-colors cursor-pointer text-left"
              >
                📝 Draft Committee Memo
              </button>
            </div>
          </div>

          {/* Interactive Input */}
          <div className="relative">
            <input
              type="text"
              placeholder={`Ask Gemini about ${selectedSegment} segment dynamics...`}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAskSegmentAi();
              }}
              className="w-full pl-3 pr-10 py-2.5 bg-slate-900/90 border border-indigo-500/50 rounded-xl text-xs text-white placeholder-indigo-300/60 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={() => handleAskSegmentAi()}
              disabled={aiLoading || !aiQuery.trim()}
              className="absolute right-2 top-2 p-1 text-indigo-300 hover:text-white disabled:opacity-40 cursor-pointer"
            >
              {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          {/* AI Output Card */}
          {aiResponse && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/40 space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px]">
                    Executive Strategic Brief
                  </span>
                  <button
                    onClick={() => handleCopy(aiResponse.answer, 'memo')}
                    className="text-[10px] text-indigo-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedType === 'memo' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-slate-200 leading-relaxed text-xs">
                  {aiResponse.answer}
                </p>
              </div>

              {aiResponse.keyFactors && aiResponse.keyFactors.length > 0 && (
                <div className="border-t border-indigo-800/60 pt-2.5">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">
                    Portfolio Drivers
                  </span>
                  <ul className="space-y-1">
                    {aiResponse.keyFactors.map((kf: string, i: number) => (
                      <li key={i} className="text-slate-300 text-[11px] flex items-start gap-1.5">
                        <span className="text-indigo-400">•</span>
                        <span>{kf}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResponse.recommendedActions && aiResponse.recommendedActions.length > 0 && (
                <div className="border-t border-indigo-800/60 pt-2.5">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block mb-1">
                    Strategic Recommendations
                  </span>
                  <ul className="space-y-1">
                    {aiResponse.recommendedActions.map((rec: string, i: number) => (
                      <li key={i} className="text-slate-300 text-[11px] flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
