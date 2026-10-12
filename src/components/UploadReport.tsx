import React, { ChangeEvent, DragEvent, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Customer, PredictionResponse, RiskConfig } from '../types';
import { api } from '../services/api';
import { DEFAULT_RISK_CONFIG } from '../utils/scoringEngine';

interface UploadReportProps {
  config?: RiskConfig;
}

interface PredictionComparison {
  customer: Customer;
  current: PredictionResponse;
  onTime: PredictionResponse;
  projectedLatePayments: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 20;

async function extractCustomerId(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const document = await loadingTask.promise;
  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDFs are limited to ${MAX_PDF_PAGES} pages.`);
    }

    const pageText: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pageText.push(content.items
        .filter((item) => 'str' in item)
        .map((item) => item.str)
        .join(' '));
    }
    const text = pageText.join('\n');
    const idMatch =
      text.match(/\b(?:customer\s*id|customer\s*identifier)\s*:?\s*(CUST\d{6})\b/i) ||
      text.match(/\bREF\s*:\s*CG-AUDIT-(CUST\d{6})\b/i);
    if (!idMatch) {
      throw new Error('No CreditGuard customer ID was found. Upload a CreditGuard risk report PDF containing a customer ID such as CUST000001.');
    }
    return idMatch[1].toUpperCase();
  } finally {
    await loadingTask.destroy();
  }
}

const percent = (probability: number) => `${probability.toFixed(1)}%`;

const tierStyle: Record<string, string> = {
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Medium: 'border-amber-200 bg-amber-50 text-amber-800',
  High: 'border-rose-200 bg-rose-50 text-rose-800',
};

export const UploadReport: React.FC<UploadReportProps> = ({
  config = DEFAULT_RISK_CONFIG,
}) => {
  const [comparison, setComparison] = useState<PredictionComparison | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const analyzeFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setComparison(null);
    setFileName('');

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Upload a PDF risk report. CSV and spreadsheet files are not supported.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('The PDF exceeds the 10 MB upload limit.');
      return;
    }

    setLoading(true);
    try {
      const customerId = await extractCustomerId(file);
      const customer = await api.getCustomerById(customerId);
      if (!customer) {
        throw new Error(`Customer ${customerId} from the PDF was not found in the connected portfolio.`);
      }

      const projectedLatePayments = Math.max(0, customer.delayedPayments6M - 1);
      const [current, onTime] = await Promise.all([
        api.predictRisk(customer.id, undefined, config),
        api.predictRisk(
          customer.id,
          { delayedPayments: projectedLatePayments },
          config,
        ),
      ]);
      setComparison({ customer, current, onTime, projectedLatePayments });
      setFileName(file.name);
    } catch (caught) {
      console.error('Could not analyze uploaded PDF:', caught);
      setError(caught instanceof Error ? caught.message : 'Could not read this PDF report.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    void analyzeFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void analyzeFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-16">
      <header className="border-b border-[#e5e7eb] pb-5">
        <div className="border-l-4 border-[#4338ca] pl-6 sm:pl-8">
          <div className="meta mb-2">Payment Scenario Prediction</div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl lg:text-5xl">
            Upload Risk Report PDF
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
            Upload a CreditGuard risk-report PDF to compare the current assessment with a scenario
            where the next payment is made on time. PDF text is read locally in your browser.
          </p>
        </div>
      </header>

      <label
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-12 text-center transition ${
          isDragging ? 'border-[#4338ca] bg-indigo-50' : 'border-[#cbd5e1] bg-white hover:border-[#4338ca]'
        }`}
      >
        <span className="mb-4 bg-indigo-50 p-3 text-[#4338ca]"><Upload className="h-6 w-6" /></span>
        <span className="text-lg font-serif font-semibold text-[#1a1a1a]">
          {loading ? 'Reading report and calculating scenarios…' : 'Drop a risk report PDF here'}
        </span>
        <span className="mt-1 text-xs text-gray-500">
          or choose a PDF from your device · PDF only · up to 10 MB and 20 pages
        </span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleChange}
          disabled={loading}
          className="sr-only"
        />
      </label>

      <section className="border border-[#e5e7eb] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2 border-b border-[#e5e7eb] pb-3">
          <FileText className="h-4 w-4 text-[#4338ca]" />
          <h2 className="text-lg font-serif font-semibold text-[#1a1a1a]">How the prediction works</h2>
        </div>
        <ol className="mt-4 grid gap-4 text-xs leading-5 text-gray-600 sm:grid-cols-3">
          <li><strong className="text-[#1a1a1a]">1. Read the PDF.</strong> The report is parsed on this device to identify its CreditGuard customer ID.</li>
          <li><strong className="text-[#1a1a1a]">2. Load the profile.</strong> The connected portfolio supplies the customer profile and current model assessment.</li>
          <li><strong className="text-[#1a1a1a]">3. Compare scenarios.</strong> The second assessment assumes one late payment ages out of the rolling six-month count after an on-time payment.</li>
        </ol>
        <p className="mt-4 border-t border-[#e5e7eb] pt-3 text-xs leading-5 text-gray-500">
          This is a what-if estimate, not a promise of a score change or a substitute for a real future assessment.
          An on-time payment does not erase a historical late payment immediately; the one-payment adjustment is a modeling assumption.
        </p>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {comparison && (
        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-2 border-l-4 border-emerald-600 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />Prediction generated for {comparison.customer.fullName}
            </div>
            <span className="meta text-emerald-800">{fileName} · {comparison.customer.id}</span>
          </div>

          <article className="border border-[#e5e7eb] bg-white p-5 sm:p-6">
            <div className="border-b border-[#e5e7eb] pb-3">
              <p className="meta text-[#4338ca]">Customer profile from portfolio</p>
              <h2 className="mt-1 text-xl font-serif font-semibold text-[#1a1a1a]">{comparison.customer.fullName}</h2>
              <p className="mt-1 text-xs text-gray-500">
                {comparison.customer.id} · {comparison.customer.segment} · {comparison.customer.cardType}
              </p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Credit limit', comparison.customer.creditLimit],
                ['Current balance', comparison.customer.outstandingBalance],
                ['Utilization', `${comparison.customer.creditUtilization.toFixed(1)}%`],
                ['Late payments (last 6 months)', comparison.customer.delayedPayments6M],
              ].map(([label, value]) => (
                <div key={String(label)} className="border-b border-[#e5e7eb] pb-3">
                  <span className="meta">{label}</span>
                  <p className="mt-1 text-sm font-semibold text-[#1a1a1a]">
                    {typeof value === 'number' && !String(label).includes('payments')
                      ? `$${value.toLocaleString('en-US')}`
                      : value}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <div className="grid gap-5 lg:grid-cols-2">
            {[
              { title: 'Current profile', prediction: comparison.current, lateCount: comparison.customer.delayedPayments6M },
              { title: 'If next payment is on time', prediction: comparison.onTime, lateCount: comparison.projectedLatePayments },
            ].map(({ title, prediction, lateCount }, index) => (
              <article key={title} className={`border bg-white p-5 sm:p-6 ${index === 1 ? 'border-[#4338ca]' : 'border-[#e5e7eb]'}`}>
                <div className="flex items-start justify-between gap-3 border-b border-[#e5e7eb] pb-3">
                  <div>
                    <p className="meta">{index === 0 ? 'Baseline' : 'Hypothetical scenario'}</p>
                    <h3 className="mt-1 text-xl font-serif font-semibold text-[#1a1a1a]">{title}</h3>
                  </div>
                  {index === 1 && <Sparkles className="h-5 w-5 text-[#4338ca]" />}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="border border-[#e5e7eb] p-3">
                    <span className="meta">Risk score</span>
                    <p className="mt-1 text-2xl font-serif font-semibold text-[#1a1a1a]">{prediction.assessment.riskScore}</p>
                  </div>
                  <div className="border border-[#e5e7eb] p-3">
                    <span className="meta">Default probability</span>
                    <p className="mt-1 text-2xl font-serif font-semibold text-[#1a1a1a]">{percent(prediction.assessment.defaultProbability)}</p>
                  </div>
                  <div className="border border-[#e5e7eb] p-3">
                    <span className="meta">Late payments modeled</span>
                    <p className="mt-1 text-2xl font-serif font-semibold text-[#1a1a1a]">{lateCount}</p>
                  </div>
                </div>
                <span className={`mt-4 inline-flex border px-3 py-1 text-xs font-semibold ${tierStyle[prediction.assessment.riskTier] || 'border-[#e5e7eb] bg-[#fdfcf9] text-[#1a1a1a]'}`}>
                  {prediction.assessment.riskTier} risk
                </span>
                {prediction.source === 'demo-proxy' && (
                  <p className="mt-3 text-xs text-amber-800">Calculated with the local demo proxy, not the live model backend.</p>
                )}
              </article>
            ))}
          </div>

          <article className="border border-indigo-200 bg-indigo-50 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#4338ca]" />
              <div>
                <h3 className="text-sm font-semibold text-[#1a1a1a]">Scenario interpretation</h3>
                <p className="mt-1 text-sm leading-6 text-gray-700">
                  The hypothetical score changes from {comparison.current.assessment.riskScore} to {comparison.onTime.assessment.riskScore},
                  and estimated default probability changes from {percent(comparison.current.assessment.defaultProbability)} to {percent(comparison.onTime.assessment.defaultProbability)}.
                  Other profile inputs are held constant; the model receives {comparison.projectedLatePayments} late payment(s) rather than {comparison.customer.delayedPayments6M}.
                </p>
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  This assumes one existing late payment rolls out of the model's six-month lookback. It does not claim that an on-time payment immediately removes past delinquencies.
                </p>
              </div>
            </div>
          </article>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <ArrowDown className="h-3.5 w-3.5" />
            Compare the model outputs as a scenario only; actual future risk depends on the subsequent complete customer profile.
          </div>
        </section>
      )}
    </div>
  );
};
