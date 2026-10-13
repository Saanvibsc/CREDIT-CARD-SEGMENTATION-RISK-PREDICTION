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
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Policy Simulator States
  const [limitAdjustmentPct, setLimitAdjustmentPct] = useState<number>(0);
  const [minPaymentPct, setMinPaymentPct] = useState<number>(2.5);
  const [restrictCashAdvance, setRestrictCashAdvance] = useState<boolean>(false);

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

  // Filtered customers for active segment
  const activeCustomers = useMemo(() => {
    if (selectedSegment === 'All') return customers;
    return customers.filter((c) => c.segment === selectedSegment);
  }, [customers, selectedSegment]);

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
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              Credit Card Data Segmentation: Utilization vs. Outstanding Balance
            </h2>
            <p className="text-xs text-slate-500">
              Interactive 2D Cluster Matrix · Click any dot to inspect cardholder profile or navigate to their Customer Dashboard
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Prime
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Revolver
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Leverage
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Watchlist
            </span>
          </div>
        </div>

        {/* Selected Dot Quick Popover Drawer */}
        {selectedDotCustomer && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{selectedDotCustomer.fullName}</span>
                <span className="font-mono text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                  {selectedDotCustomer.id}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-slate-700 font-semibold">
                  {selectedDotCustomer.cardType}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Balance: <span className="font-bold text-slate-900">${Number(selectedDotCustomer?.outstandingBalance || 0).toLocaleString()}</span> ·
                Utilization: <span className="font-bold text-slate-900">{(Number(selectedDotCustomer?.creditUtilization) || 0).toFixed(1)}%</span> ·
                Segment: <span className="font-semibold text-indigo-900">{selectedDotCustomer?.segment || 'Standard'}</span> ·
                Delinquency 6M: <span className="font-semibold text-slate-800">{selectedDotCustomer?.delayedPayments6M ?? 0} late</span>
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
        <div className="relative w-full h-[460px] bg-slate-50/70 border border-slate-200 rounded-xl overflow-hidden p-4">
          {/* Quadrant Background Watermarks */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 pointer-events-none p-6">
            {/* Top-Left Quadrant */}
            <div className="border-r border-b border-dashed border-slate-300 p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800/60 bg-indigo-100/50 px-2 py-1 rounded">
                Quadrant II: Affluent High Balance Revolvers
              </span>
            </div>
            {/* Top-Right Quadrant */}
            <div className="border-b border-dashed border-slate-300 p-3 text-right">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800/70 bg-rose-100/60 px-2 py-1 rounded">
                Quadrant I: Critical Exposure Danger Zone (Maxed Out)
              </span>
            </div>
            {/* Bottom-Left Quadrant */}
            <div className="border-r border-dashed border-slate-300 p-3 flex items-end">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/60 bg-emerald-100/50 px-2 py-1 rounded">
                Quadrant III: Conservative Prime Transactors (Safe Haven)
              </span>
            </div>
            {/* Bottom-Right Quadrant */}
            <div className="p-3 flex items-end justify-end">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70 bg-amber-100/60 px-2 py-1 rounded">
                Quadrant IV: Overextended Subprime / Micro-Revolvers
              </span>
            </div>
          </div>

          {/* SVG Canvas */}
          <svg className="w-full h-full relative z-10 overflow-visible">
            {/* Axis Labels */}
            <text x="50%" y="98%" textAnchor="middle" className="text-[11px] font-bold fill-slate-500 tracking-wide uppercase">
              Credit Card Utilization Percentage (%) →
            </text>
            <text x="18" y="24" className="text-[11px] font-bold fill-slate-500 tracking-wide uppercase">
              ↑ Revolving Balance ($)
            </text>

            {/* Render Scatter Dots */}
            {activeCustomers.map((c) => {
              const cxPct = Math.min(95, Math.max(5, (c.creditUtilization / maxUtil) * 90 + 5));
              const cyPct = Math.min(90, Math.max(10, 95 - (c.outstandingBalance / maxBalance) * 85));
              const colorInfo = SEGMENT_COLORS[c.segment] || DEFAULT_SEGMENT_COLOR;
              const isSelected = selectedDotCustomer?.id === c.id;

              return (
                <g key={c.id} className="cursor-pointer group">
                  <circle
                    cx={`${cxPct}%`}
                    cy={`${cyPct}%`}
                    r={isSelected ? 9 : 6}
                    fill={colorInfo.dot}
                    fillOpacity={isSelected ? 1 : 0.82}
                    stroke={isSelected ? '#1e1b4b' : '#ffffff'}
                    strokeWidth={isSelected ? 3 : 1.5}
                    className="transition-all duration-200 hover:scale-150 hover:opacity-100"
                    onClick={() => {
                      setSelectedDotCustomer(c);
                    }}
                    onMouseEnter={(e) => {
                      setHoveredCustomer(c);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipPos({ x: rect.left, y: rect.top });
                    }}
                    onMouseLeave={() => setHoveredCustomer(null)}
                  />
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip */}
          {hoveredCustomer && tooltipPos && (
            <div
              className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 min-w-[200px]"
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              <div className="font-bold flex items-center justify-between">
                <span>{hoveredCustomer.fullName}</span>
                <span className="font-mono text-[10px] text-indigo-300">{hoveredCustomer.id}</span>
              </div>
              <div className="text-slate-300 text-[11px]">
                Balance: <span className="font-semibold text-white">${Number(hoveredCustomer?.outstandingBalance || 0).toLocaleString()}</span>
              </div>
              <div className="text-slate-300 text-[11px]">
                Utilization: <span className="font-semibold text-white">{(Number(hoveredCustomer?.creditUtilization) || 0).toFixed(1)}%</span>
              </div>
              <div className="text-slate-300 text-[11px]">
                Segment: <span className="font-semibold text-indigo-300">{hoveredCustomer.segment}</span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                Click dot to inspect or open dashboard
              </div>
            </div>
          )}
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
