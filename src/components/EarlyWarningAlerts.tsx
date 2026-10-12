import React, { useState, useEffect } from 'react';
import { 
  Check, 
  RotateCcw, 
  RefreshCw,
  ArrowRight,
  Sparkles,
  Bot,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ShieldCheck,
  Send,
  MessageSquare,
  Mail,
  Zap,
  TrendingUp,
  Layers,
  X
} from 'lucide-react';
import { EarlyWarningAlert, AlertSeverity, AlertStatus } from '../types';
import { api } from '../services/api';
import { NavPage } from './Sidebar';

interface EarlyWarningAlertsProps {
  onSelectCustomer: (customerId: string) => void;
  onNavigate: (page: NavPage) => void;
  onAlertsCountChange?: (count: number) => void;
}

interface AlertAiTriageResult {
  rootCauseAnalysis: string;
  urgencyLevel: string;
  defaultProbabilityTrend: string;
  lossExposureEstimate: string;
  workoutStrategy: string[];
  customerNoticeDraft: {
    sms: string;
    emailSubject: string;
    emailBody: string;
  };
  committeeRecommendation: string;
}

export const EarlyWarningAlerts: React.FC<EarlyWarningAlertsProps> = ({
  onSelectCustomer,
  onNavigate,
  onAlertsCountChange,
}) => {
  const [alerts, setAlerts] = useState<EarlyWarningAlert[]>([]);
  const [severityFilter, setSeverityFilter] = useState<'All' | AlertSeverity>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | AlertStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // AI State
  const [expandedAiAlertId, setExpandedAiAlertId] = useState<string | null>(null);
  const [aiTriageCache, setAiTriageCache] = useState<Record<string, AlertAiTriageResult>>({});
  const [aiLoadingAlertId, setAiLoadingAlertId] = useState<string | null>(null);
  
  // Batch AI Radar
  const [showBatchAiModal, setShowBatchAiModal] = useState(false);
  const [batchAiData, setBatchAiData] = useState<any | null>(null);
  const [batchAiLoading, setBatchAiLoading] = useState(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Interactive Cardholder AI Assistant State
  const [customQuestionByAlert, setCustomQuestionByAlert] = useState<Record<string, string>>({});
  const [customAnswerByAlert, setCustomAnswerByAlert] = useState<Record<string, any>>({});
  const [askingAiAlertId, setAskingAiAlertId] = useState<string | null>(null);
  const [dispatchedAlertId, setDispatchedAlertId] = useState<string | null>(null);
  const [batchDispatched, setBatchDispatched] = useState<boolean>(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await api.getAlerts(severityFilter, statusFilter);
      setAlerts(data);
      if (onAlertsCountChange) {
        const crit = data.filter((a: EarlyWarningAlert) => a.severity === 'Critical' && a.status !== 'Resolved').length;
        onAlertsCountChange(crit);
      }
    } catch (err) {
      console.error('Failed to fetch alerts from API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [severityFilter, statusFilter]);

  const handleStatusChange = async (alertId: string, newStatus: AlertStatus) => {
    try {
      const updated = await api.updateAlertStatus(alertId, newStatus);
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)));
      if (onAlertsCountChange) {
        const remaining = alerts.filter(
          (a) => a.id !== alertId && a.severity === 'Critical' && a.status !== 'Resolved'
        ).length + (updated.severity === 'Critical' && updated.status !== 'Resolved' ? 1 : 0);
        onAlertsCountChange(remaining);
      }
    } catch (err) {
      console.error('Failed to update alert status via API:', err);
    }
  };

  // AI Triage Trigger
  const handleTriggerAiTriage = async (alert: EarlyWarningAlert) => {
    if (expandedAiAlertId === alert.id) {
      setExpandedAiAlertId(null);
      return;
    }
    setExpandedAiAlertId(alert.id);

    if (aiTriageCache[alert.id]) {
      return;
    }

    setAiLoadingAlertId(alert.id);
    try {
      const triage = await api.triageAlertWithAI(alert.id, alert.customerId);
      setAiTriageCache((prev) => ({ ...prev, [alert.id]: triage }));
    } catch (err) {
      console.error('AI Triage error:', err);
    } finally {
      setAiLoadingAlertId(null);
    }
  };

  // Batch AI Radar
  const handleOpenBatchAi = async () => {
    setShowBatchAiModal(true);
    if (!batchAiData) {
      setBatchAiLoading(true);
      try {
        const result = await api.getBatchAlertsSummaryWithAI();
        setBatchAiData(result);
      } catch (err) {
        console.error('Batch AI summary error:', err);
      } finally {
        setBatchAiLoading(false);
      }
    }
  };

  const handleCopyText = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleAskCustomAi = async (alert: EarlyWarningAlert, questionText?: string) => {
    const q = questionText || customQuestionByAlert[alert.id];
    if (!q || !q.trim()) return;

    setAskingAiAlertId(alert.id);
    try {
      const response = await api.askAiRiskAssistant(q, {
        customerId: alert.customerId,
        alertId: alert.id,
        triggerReason: alert.triggerReason,
      });
      setCustomAnswerByAlert((prev) => ({ ...prev, [alert.id]: response }));
    } catch (err) {
      console.error('Failed to query custom AI for alert:', err);
    } finally {
      setAskingAiAlertId(null);
    }
  };

  const handleSimulateDispatch = (alertId: string) => {
    setDispatchedAlertId(alertId);
    setTimeout(() => {
      setDispatchedAlertId(null);
    }, 4000);
  };

  const handleBatchDispatch = () => {
    setBatchDispatched(true);
    if (batchAiData?.topPriorityAccounts) {
      batchAiData.topPriorityAccounts.forEach((acc: any) => {
        const matching = alerts.find((a) => a.customerId === acc.customerId);
        if (matching && matching.status === 'New') {
          handleStatusChange(matching.id, 'Under Review');
        }
      });
    }
    setTimeout(() => setBatchDispatched(false), 4000);
  };

  const filteredAlerts = alerts.filter((alert) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      alert.customerId.toLowerCase().includes(q) ||
      (alert.customerName ? alert.customerName.toLowerCase().includes(q) : false) ||
      alert.triggerReason.toLowerCase().includes(q)
    );
  });

  const criticalCount = alerts.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved').length;
  const underReviewCount = alerts.filter((a) => a.status === 'Under Review').length;
  const resolvedCount = alerts.filter((a) => a.status === 'Resolved').length;

  return (
    <div className="max-w-[1400px] mx-auto pb-16 space-y-8 font-sans">
      {/* Top Banner / Editorial Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-slate-200/80">
        <div className="border-l-4 border-[#2563eb] pl-5 sm:pl-7">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#2563eb] font-bold">
              Surveillance Watchlist
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#2563eb] border border-blue-200">
              <Sparkles className="w-2.5 h-2.5" />
              Gemini AI Powered
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-semibold text-slate-900 tracking-tight">
            Early-Warning Alerts
          </h1>
          <p className="text-xs text-slate-500 font-sans mt-1 max-w-2xl">
            Real-time surveillance radar detecting chronic delinquency, credit limit exhaustion, and cash-draw velocity with Gemini AI remediation.
          </p>
        </div>

        {/* Counter Summary + AI Action */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <button
            onClick={handleOpenBatchAi}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#4338ca] text-white font-medium shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>AI Radar &amp; Batch Triage</span>
          </button>

          <div className="flex items-center gap-4 bg-white p-2.5 px-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="border-r border-slate-100 pr-3.5 text-right">
              <span className="text-[10px] uppercase font-mono font-semibold text-rose-600 block">Critical</span>
              <span className="font-mono font-bold text-base text-slate-900">{criticalCount}</span>
            </div>
            <div className="border-r border-slate-100 pr-3.5 text-right">
              <span className="text-[10px] uppercase font-mono font-semibold text-amber-600 block">Reviewing</span>
              <span className="font-mono font-bold text-base text-slate-900">{underReviewCount}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-mono font-semibold text-emerald-600 block">Resolved</span>
              <span className="font-mono font-bold text-base text-slate-900">{resolvedCount}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Filter and Query Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-white rounded-xl border border-slate-200 shadow-2xs text-xs">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by customer ID, name, or warning trigger..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent outline-none w-full text-xs font-sans text-slate-800 placeholder-slate-400 px-2"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 outline-none"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical Urgency</option>
            <option value="High">High Severity</option>
            <option value="Medium">Medium Severity</option>
            <option value="Low">Low Severity</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 outline-none"
          >
            <option value="All">All Review Statuses</option>
            <option value="New">Status: New Alert</option>
            <option value="Under Review">Status: Under Review</option>
            <option value="Resolved">Status: Resolved</option>
          </select>

          <button
            onClick={fetchAlerts}
            className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh alerts"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts Ledger Table */}
      <div className="space-y-3.5">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map((alert) => {
            const isResolved = alert.status === 'Resolved';
            const isAiExpanded = expandedAiAlertId === alert.id;
            const aiData = aiTriageCache[alert.id];
            const isAiLoading = aiLoadingAlertId === alert.id;

            return (
              <div
                key={alert.id}
                className={`rounded-2xl border transition-all duration-200 ${
                  isResolved
                    ? 'border-slate-200 bg-slate-50/60 opacity-75'
                    : alert.severity === 'Critical'
                    ? 'border-rose-200 bg-white shadow-2xs hover:shadow-xs'
                    : 'border-slate-200 bg-white shadow-2xs hover:shadow-xs'
                }`}
              >
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  {/* Left Column: Account & Reason */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        onClick={() => {
                          onSelectCustomer(alert.customerId);
                          onNavigate('assessment');
                        }}
                        className="font-mono font-bold text-sm text-[#2563eb] hover:underline"
                      >
                        {alert.customerId}
                      </button>
                      {alert.customerName && (
                        <span className="font-semibold text-xs text-slate-900">
                          {alert.customerName}
                        </span>
                      )}
                      <span className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        alert.severity === 'Critical'
                          ? 'border-rose-200 text-rose-700 bg-rose-50'
                          : alert.severity === 'High'
                          ? 'border-amber-200 text-amber-700 bg-amber-50'
                          : 'border-slate-200 text-slate-700 bg-slate-50'
                      }`}>
                        {alert.severity}
                      </span>

                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        alert.status === 'New'
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : alert.status === 'Under Review'
                          ? 'bg-amber-50 text-amber-700 font-semibold'
                          : 'bg-emerald-50 text-emerald-700 font-semibold'
                      }`}>
                        {alert.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-sm font-serif font-semibold text-slate-900">
                      {alert.triggerReason}
                    </div>

                    <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                      {alert.metricValue && (
                        <>
                          <span>Metric: <strong className="text-slate-800">{alert.metricValue}</strong></span>
                          <span>·</span>
                        </>
                      )}
                      <span>Detected: {alert.detectedDate || alert.triggerDate || 'Recently'}</span>
                      {alert.reviewedBy && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700">Reviewed by {alert.reviewedBy}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Recommended Action & Controls */}
                  <div className="lg:max-w-md w-full space-y-2.5 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {alert.suggestedAction && (
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
                        <span className="text-[10px] uppercase font-mono font-bold text-[#2563eb] block mb-0.5">Recommended Baseline:</span>
                        <span>{alert.suggestedAction}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      {/* AI Triage Button */}
                      <button
                        onClick={() => handleTriggerAiTriage(alert)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                          isAiExpanded
                            ? 'bg-[#2563eb] text-white shadow-xs'
                            : 'bg-blue-50 text-[#2563eb] hover:bg-blue-100 border border-blue-200'
                        }`}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : 'text-amber-500'}`} />
                        <span>{isAiExpanded ? 'Hide AI Triage' : 'AI Deep Triage'}</span>
                        {isAiExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                      </button>

                      {alert.status !== 'Under Review' && alert.status !== 'Resolved' && (
                        <button
                          onClick={() => handleStatusChange(alert.id, 'Under Review')}
                          className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-slate-400 bg-white text-slate-700 transition-colors cursor-pointer"
                        >
                          Review
                        </button>
                      )}

                      {alert.status !== 'Resolved' && (
                        <button
                          onClick={() => handleStatusChange(alert.id, 'Resolved')}
                          className="text-xs px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Resolve</span>
                        </button>
                      )}

                      {alert.status === 'Resolved' && (
                        <button
                          onClick={() => handleStatusChange(alert.id, 'Under Review')}
                          className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reopen</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          onSelectCustomer(alert.customerId);
                          onNavigate('assessment');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-[#2563eb] text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Profile</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* AI Deep Triage Drawer */}
                {isAiExpanded && (
                  <div className="border-t border-blue-100 bg-gradient-to-b from-blue-50/70 to-white p-5 rounded-b-2xl space-y-4">
                    {isAiLoading ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
                        <Bot className="w-6 h-6 text-[#2563eb] animate-bounce" />
                        <span className="text-xs font-mono">Gemini 3.8 Flash evaluating cardholder financial risk vectors...</span>
                      </div>
                    ) : aiData ? (
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100/80 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-[#2563eb] text-white flex items-center justify-center">
                              <Sparkles className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-serif font-bold text-slate-900 text-sm">
                              Gemini Risk Officer Triage Analysis
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                              {aiData.urgencyLevel} Urgency
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs font-mono text-slate-600">
                            <span>PD Shift: <strong className="text-rose-600">{aiData.defaultProbabilityTrend}</strong></span>
                            <span>·</span>
                            <span>Exposure: <strong className="text-slate-900">{aiData.lossExposureEstimate}</strong></span>
                          </div>
                        </div>

                        {/* Root Cause & Recommendation */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs space-y-1.5">
                            <span className="font-mono text-[10px] uppercase font-bold text-[#2563eb] flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              Root Cause &amp; Diagnosis
                            </span>
                            <p className="text-slate-700 leading-relaxed font-sans">
                              {aiData.rootCauseAnalysis}
                            </p>
                          </div>

                          <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs space-y-1.5">
                            <span className="font-mono text-[10px] uppercase font-bold text-emerald-700 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              Committee Recommendation
                            </span>
                            <p className="text-slate-700 leading-relaxed font-sans">
                              {aiData.committeeRecommendation}
                            </p>
                          </div>
                        </div>

                        {/* Prescriptive Workout Strategy */}
                        <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs space-y-2 text-xs">
                          <span className="font-mono text-[10px] uppercase font-bold text-slate-900 flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-amber-500" />
                            AI Prescribed Remediation Protocol
                          </span>
                          <ul className="space-y-1.5 text-slate-700 pl-1">
                            {aiData.workoutStrategy.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="w-4 h-4 rounded-full bg-blue-100 text-[#2563eb] font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Customer Notice Drafts */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* SMS Notice */}
                          <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] uppercase font-bold text-slate-800 flex items-center gap-1">
                                <MessageSquare className="w-3 h-3 text-[#2563eb]" />
                                Cardholder SMS Notice
                              </span>
                              <button
                                onClick={() => handleCopyText(aiData.customerNoticeDraft.sms, 'sms')}
                                className="text-[10px] font-mono text-[#2563eb] hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                {copiedType === 'sms' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 text-slate-700 font-mono text-[11px] leading-relaxed">
                              {aiData.customerNoticeDraft.sms}
                            </div>
                          </div>

                          {/* Email Notice */}
                          <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] uppercase font-bold text-slate-800 flex items-center gap-1">
                                <Mail className="w-3 h-3 text-[#2563eb]" />
                                Formal Email Notice
                              </span>
                              <button
                                onClick={() => handleCopyText(`${aiData.customerNoticeDraft.emailSubject}\n\n${aiData.customerNoticeDraft.emailBody}`, 'email')}
                                className="text-[10px] font-mono text-[#2563eb] hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                {copiedType === 'email' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-50 text-slate-700 text-[11px] space-y-1">
                              <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1">
                                {aiData.customerNoticeDraft.emailSubject}
                              </div>
                              <p className="whitespace-pre-line text-slate-600 pt-0.5">
                                {aiData.customerNoticeDraft.emailBody}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Gemini Risk Query for this Cardholder */}
                        <div className="bg-white p-3.5 rounded-xl border border-blue-100 shadow-2xs space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase font-bold text-slate-800 flex items-center gap-1.5">
                              <Bot className="w-3.5 h-3.5 text-[#2563eb]" />
                              Ask Gemini AI Risk Assistant About This Cardholder
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">Cardholder: {alert.customerId}</span>
                          </div>

                          {/* Quick Inquiry Pills */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[
                              "What if they miss the next billing cycle?",
                              "Can we restructure balance at 5% APR?",
                              "Is immediate line contraction recommended?"
                            ].map((pill, pIdx) => (
                              <button
                                key={pIdx}
                                onClick={() => {
                                  setCustomQuestionByAlert((prev) => ({ ...prev, [alert.id]: pill }));
                                  void handleAskCustomAi(alert, pill);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-[#2563eb] hover:bg-blue-100 transition-colors border border-blue-100 cursor-pointer"
                              >
                                {pill}
                              </button>
                            ))}
                          </div>

                          {/* Input field */}
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={`Ask custom question about ${alert.customerName || alert.customerId}...`}
                              value={customQuestionByAlert[alert.id] || ''}
                              onChange={(e) => setCustomQuestionByAlert((prev) => ({ ...prev, [alert.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleAskCustomAi(alert);
                              }}
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-[#2563eb]"
                            />
                            <button
                              onClick={() => void handleAskCustomAi(alert)}
                              disabled={askingAiAlertId === alert.id}
                              className="px-3 py-1.5 bg-[#2563eb] text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-[#1d4ed8] transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {askingAiAlertId === alert.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              <span>Ask AI</span>
                            </button>
                          </div>

                          {/* Custom Answer Display */}
                          {customAnswerByAlert[alert.id] && (
                            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs space-y-1.5 animate-in fade-in duration-200">
                              <p className="text-slate-800 leading-relaxed font-sans">
                                {customAnswerByAlert[alert.id].answer}
                              </p>
                              {customAnswerByAlert[alert.id].recommendedAction && (
                                <div className="text-[11px] text-[#2563eb] font-medium pt-1 border-t border-blue-200/50">
                                  <strong>Intervention:</strong> {customAnswerByAlert[alert.id].recommendedAction}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Quick Apply and Dispatch Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-blue-100/60">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSimulateDispatch(alert.id)}
                              disabled={dispatchedAlertId === alert.id}
                              className="px-3.5 py-2 border border-blue-200 bg-white text-[#2563eb] hover:bg-blue-50 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Send className="w-3 h-3" />
                              <span>{dispatchedAlertId === alert.id ? '✓ Dispatched to Gateway' : 'Simulate Customer Notice Dispatch'}</span>
                            </button>
                            {dispatchedAlertId === alert.id && (
                              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 animate-pulse">
                                Notice routed via SMS &amp; Customer Email
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => {
                              handleStatusChange(alert.id, 'Under Review');
                              setExpandedAiAlertId(null);
                            }}
                            className="px-4 py-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer self-end sm:self-auto"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Adopt AI Mitigation &amp; Mark Under Review</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center text-xs font-mono text-slate-400 border border-slate-200 bg-white rounded-2xl">
            No active early-warning flags match the current filter criteria.
          </div>
        )}
      </div>

      {/* Batch AI Surveillance Modal */}
      {showBatchAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#2563eb] text-white flex items-center justify-center shadow-sm">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="font-serif font-bold text-xl text-slate-900">
                    AI Surveillance Radar &amp; Priority Triage
                  </h2>
                  <p className="text-xs text-slate-500 font-sans">
                    Gemini 3.8 Flash macro synthesis of portfolio delinquent clusters and high-balance exposures.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowBatchAiModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              {batchAiLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <Bot className="w-8 h-8 text-[#2563eb] animate-bounce" />
                  <span className="font-mono text-xs">Analyzing 200 cardholder accounts and clustering surveillance alerts...</span>
                </div>
              ) : batchAiData ? (
                <div className="space-y-6">
                  {/* Executive Summary */}
                  <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-1.5">
                    <span className="text-[10px] uppercase font-mono font-bold text-[#2563eb] block">
                      Executive Portfolio Surveillance Synthesis
                    </span>
                    <p className="text-sm text-slate-800 leading-relaxed font-sans">
                      {batchAiData.executiveSummary}
                    </p>
                  </div>

                  {/* Primary Drivers Breakdown */}
                  <div className="space-y-2.5">
                    <span className="text-[11px] uppercase font-mono font-bold text-slate-800 block">
                      Dominant Risk Drivers &amp; Systemic Exposure
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {batchAiData.primaryRiskDrivers.map((driver: any, i: number) => (
                        <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] font-bold text-rose-700 uppercase">{driver.severity}</span>
                            <span className="font-mono text-[10px] text-slate-500">{driver.affectedCount} Accounts</span>
                          </div>
                          <div className="font-semibold text-slate-900 text-xs">{driver.category}</div>
                          <div className="font-mono text-sm font-bold text-[#2563eb]">{driver.exposure}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Priority Accounts */}
                  <div className="space-y-2.5">
                    <span className="text-[11px] uppercase font-mono font-bold text-slate-800 block">
                      High-Priority Workout Queue (Immediate Intervention)
                    </span>
                    <div className="space-y-2">
                      {batchAiData.topPriorityAccounts.map((account: any, i: number) => (
                        <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#2563eb]">{account.customerId}</span>
                              <span className="font-semibold text-slate-900">{account.customerName}</span>
                            </div>
                            <p className="text-slate-600 text-[11px] mt-0.5">{account.reason}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-[10px] font-mono uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                              {account.immediateAction}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Operational Recommendations */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-emerald-800 block">
                      Underwriting &amp; Operations Protocol Recommendations
                    </span>
                    <ul className="space-y-1.5 text-slate-700">
                      {batchAiData.operationalRecommendations.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const memo = `CREDITGUARD AI - EXECUTIVE SURVEILLANCE AUDIT MEMO\nDate: ${new Date().toLocaleDateString()}\n\n1. EXECUTIVE SUMMARY\n${batchAiData?.executiveSummary}\n\n2. DOMINANT RISK DRIVERS\n${batchAiData?.primaryRiskDrivers?.map((d: any) => `- ${d.category} (${d.severity}): ${d.affectedCount} accounts, ${d.exposure}`).join('\n')}\n\n3. HIGH-PRIORITY WORKOUT QUEUE\n${batchAiData?.topPriorityAccounts?.map((a: any) => `- [${a.customerId}] ${a.customerName}: ${a.reason} -> Immediate Action: ${a.immediateAction}`).join('\n')}\n\n4. UNDERWRITING COMMITTEE RECOMMENDATIONS\n${batchAiData?.operationalRecommendations?.map((r: string) => `- ${r}`).join('\n')}`;
                    handleCopyText(memo, 'memo');
                  }}
                  className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-[#2563eb]" />
                  <span>{copiedType === 'memo' ? '✓ Memo Copied to Clipboard!' : 'Copy Executive Committee Memo'}</span>
                </button>

                <button
                  onClick={handleBatchDispatch}
                  disabled={batchDispatched}
                  className="px-3.5 py-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>{batchDispatched ? '✓ Top Accounts Queued for Review!' : '1-Click Batch Underwriting Queue'}</span>
                </button>
              </div>

              <button
                onClick={() => setShowBatchAiModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-[#2563eb] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Radar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

