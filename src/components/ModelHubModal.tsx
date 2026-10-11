import React, { useState } from 'react';
import { 
  X, 
  Download, 
  FileSpreadsheet, 
  Cpu, 
  CheckCircle2, 
  BarChart3, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  downloadCombinedCreditRiskCsv, 
  downloadTestPredictionsCsv, 
  downloadValidationComparisonCsv, 
  downloadModelPkl 
} from '../utils/datasetExporter';
import { VALIDATION_MODELS, TEST_PREDICTIONS, MODEL_PIPELINE_SPEC } from '../data/mockData';

interface ModelHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelHubModal: React.FC<ModelHubModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'comparison' | 'predictions' | 'python'>('overview');
  const [downloadNotice, setDownloadNotice] = useState('');

  if (!isOpen) return null;

  const triggerDownload = (fn: () => void, name: string) => {
    fn();
    setDownloadNotice(`Downloaded ${name}`);
    setTimeout(() => setDownloadNotice(''), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs">
      <div className="bg-[#fdfcf9] border border-[#1a1a1a] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[#e5e7eb] flex items-center justify-between bg-white">
          <div>
            <div className="meta text-[#4338ca] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              <span>Machine Learning &amp; Data Hub</span>
            </div>
            <h2 className="text-2xl font-serif font-bold text-[#1a1a1a] mt-1">
              Model &amp; Dataset Files
            </h2>
            <p className="text-xs text-gray-500 font-sans mt-0.5">
              Everything powering CreditGuard AI in plain, simple English — with ready-to-use CSV and model.pkl downloads.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 border border-[#e5e7eb] hover:border-[#1a1a1a] hover:bg-gray-50 text-gray-700 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Download Action Cards Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gray-50 border-b border-[#e5e7eb] text-xs">
          {/* Card 1: model.pkl */}
          <div className="bg-white p-3 border border-[#e5e7eb] flex flex-col justify-between">
            <div>
              <div className="mono font-bold text-[#4338ca] text-[11px]">model.pkl</div>
              <div className="font-semibold text-[#1a1a1a] mt-0.5">Trained AI Model</div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                Saved Scikit-learn gradient boosting model for predicting defaults.
              </p>
            </div>
            <button
              onClick={() => triggerDownload(downloadModelPkl, 'model.pkl')}
              className="mt-3 py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Get model.pkl</span>
            </button>
          </div>

          {/* Card 2: combined dataset */}
          <div className="bg-white p-3 border border-[#e5e7eb] flex flex-col justify-between">
            <div>
              <div className="mono font-bold text-emerald-700 text-[11px]">Dataset CSV</div>
              <div className="font-semibold text-[#1a1a1a] mt-0.5">200 Accounts</div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                combined_credit_risk_realistic_with_ids with balances &amp; 6-month payments.
              </p>
            </div>
            <button
              onClick={() => triggerDownload(downloadCombinedCreditRiskCsv, 'combined_credit_risk_realistic_with_ids.csv')}
              className="mt-3 py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Download CSV</span>
            </button>
          </div>

          {/* Card 3: test predictions */}
          <div className="bg-white p-3 border border-[#e5e7eb] flex flex-col justify-between">
            <div>
              <div className="mono font-bold text-amber-700 text-[11px]">Test Predictions</div>
              <div className="font-semibold text-[#1a1a1a] mt-0.5">Test Results CSV</div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                creditguard_test_predictions comparing predicted risk vs actual defaults.
              </p>
            </div>
            <button
              onClick={() => triggerDownload(downloadTestPredictionsCsv, 'creditguard_test_predictions.csv')}
              className="mt-3 py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Download CSV</span>
            </button>
          </div>

          {/* Card 4: model comparison */}
          <div className="bg-white p-3 border border-[#e5e7eb] flex flex-col justify-between">
            <div>
              <div className="mono font-bold text-indigo-700 text-[11px]">Model Benchmarks</div>
              <div className="font-semibold text-[#1a1a1a] mt-0.5">Comparison CSV</div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                creditguard_validation_model_comparison matching 6 models side-by-side.
              </p>
            </div>
            <button
              onClick={() => triggerDownload(downloadValidationComparisonCsv, 'creditguard_validation_model_comparison.csv')}
              className="mt-3 py-1.5 px-2 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <BarChart3 className="w-3 h-3" />
              <span>Download CSV</span>
            </button>
          </div>
        </div>

        {downloadNotice && (
          <div className="px-6 py-2 bg-emerald-50 text-emerald-800 text-xs border-b border-emerald-200 mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{downloadNotice}</span>
          </div>
        )}

        {/* Sub-Tabs for exploring in plain words */}
        <div className="flex border-b border-[#e5e7eb] px-6 bg-white gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
              activeTab === 'overview' ? 'text-[#4338ca]' : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>How The Model Works</span>
            {activeTab === 'overview' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338ca]" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('comparison')}
            className={`py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
              activeTab === 'comparison' ? 'text-[#4338ca]' : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>Compare 6 Models</span>
            {activeTab === 'comparison' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338ca]" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('predictions')}
            className={`py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
              activeTab === 'predictions' ? 'text-[#4338ca]' : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>Test Predictions Sample</span>
            {activeTab === 'predictions' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338ca]" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('python')}
            className={`py-3 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
              activeTab === 'python' ? 'text-[#4338ca]' : 'text-gray-500 hover:text-black'
            }`}
          >
            <span>Python Code (model.pkl)</span>
            {activeTab === 'python' && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338ca]" />
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6 text-xs">
              <div className="bg-white border border-[#e5e7eb] p-5 space-y-3">
                <h3 className="text-base font-serif font-bold text-[#1a1a1a]">
                  What does this model do?
                </h3>
                <p className="text-gray-600 leading-relaxed font-sans text-xs">
                  CreditGuard AI looks at a customer's credit card habits — like how full their card is, whether they paid late in recent months, and how much they earn — and estimates their likelihood of missing an upcoming payment over the next 90 days.
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                  <div className="p-3 bg-gray-50 border border-[#e5e7eb]">
                    <span className="meta">Overall Accuracy</span>
                    <div className="text-2xl font-serif font-bold text-emerald-700 mt-0.5">93.6%</div>
                    <div className="text-[10px] text-gray-500">Correct on 94 out of 100 tests</div>
                  </div>
                  <div className="p-3 bg-gray-50 border border-[#e5e7eb]">
                    <span className="meta">Algorithm Used</span>
                    <div className="text-sm font-semibold text-[#1a1a1a] mt-1.5">Gradient Boosting</div>
                    <div className="text-[10px] text-gray-500">250 balanced decision trees</div>
                  </div>
                  <div className="p-3 bg-gray-50 border border-[#e5e7eb]">
                    <span className="meta">Speed per Prediction</span>
                    <div className="text-2xl font-serif font-bold text-[#4338ca] mt-0.5">4.2 ms</div>
                    <div className="text-[10px] text-gray-500">Instant results</div>
                  </div>
                </div>
              </div>

              {/* Feature Importance in simple English */}
              <div className="bg-white border border-[#e5e7eb] p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-2">
                  <h3 className="text-base font-serif font-bold text-[#1a1a1a]">
                    Top Factors the Model Looks At
                  </h3>
                  <span className="meta">Weighted by Importance</span>
                </div>

                <div className="space-y-2.5">
                  {[
                    { name: 'Late Payments in Last 6 Months', pct: 34.2, desc: 'How many times a payment was missed or delayed' },
                    { name: 'Credit Card Limit Used (%)', pct: 28.6, desc: 'How close the card balance is to its maximum allowed limit' },
                    { name: 'Monthly Payment vs Minimum Due', pct: 14.8, desc: 'Whether the borrower pays just the minimum or pays off more' },
                    { name: 'Estimated Debt-to-Income', pct: 9.5, desc: 'Total debt size compared to declared annual income' },
                    { name: 'Annual Income', pct: 4.8, desc: 'Total declared yearly earnings' },
                    { name: 'Years of Credit History', pct: 3.8, desc: 'How long the customer has had established credit accounts' }
                  ].map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1a1a1a]">{item.name}</span>
                        <span className="mono font-bold text-[#4338ca]">{item.pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-[#4338ca]" style={{ width: `${item.pct * 2.5}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-500">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="space-y-4 text-xs">
              <div>
                <h3 className="text-base font-serif font-bold text-[#1a1a1a]">
                  Model Comparison (Validation Benchmarks)
                </h3>
                <p className="text-gray-500 font-sans mt-0.5">
                  We tested 6 different machine learning approaches on the same data. The Gradient Boosting model gave the highest accuracy and the fewest false alarms.
                </p>
              </div>

              <div className="overflow-x-auto border border-[#e5e7eb]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 border-b border-[#e5e7eb]">
                    <tr>
                      <th className="py-2.5 px-3 meta">Model Name</th>
                      <th className="py-2.5 px-3 meta">Accuracy</th>
                      <th className="py-2.5 px-3 meta">Catch Rate (Recall)</th>
                      <th className="py-2.5 px-3 meta">False Alarm Rate</th>
                      <th className="py-2.5 px-3 meta">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {VALIDATION_MODELS.map((m, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${m.status === 'Production Primary' ? 'bg-indigo-50/40 font-medium' : ''}`}>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#1a1a1a]">{m.model_name}</div>
                          <div className="text-[10px] text-gray-500">{m.description}</div>
                        </td>
                        <td className="py-3 px-3 mono font-bold text-[#1a1a1a]">
                          {m.accuracy_pct}%
                        </td>
                        <td className="py-3 px-3 mono text-[#1a1a1a]">
                          {(m.recall * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 mono text-gray-600">
                          {(m.fpr_at_90_recall * 100).toFixed(1)}%
                        </td>
                        <td className="py-3 px-3">
                          <span className={`mono text-[10px] px-2 py-0.5 border ${
                            m.status === 'Production Primary'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                              : 'bg-white text-gray-700 border-gray-300'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'predictions' && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#1a1a1a]">
                    Test Predictions Sample ({TEST_PREDICTIONS.length} Records)
                  </h3>
                  <p className="text-gray-500 font-sans mt-0.5">
                    See how the model predicted on held-out test accounts versus what actually happened.
                  </p>
                </div>
                <button
                  onClick={() => triggerDownload(downloadTestPredictionsCsv, 'creditguard_test_predictions.csv')}
                  className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#4338ca] text-white mono text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Download Test Predictions CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-[#e5e7eb]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-50 border-b border-[#e5e7eb]">
                    <tr>
                      <th className="py-2 px-2.5 meta">Customer</th>
                      <th className="py-2 px-2.5 meta">Card Used</th>
                      <th className="py-2 px-2.5 meta">Delinquency</th>
                      <th className="py-2 px-2.5 meta">Predicted Chance</th>
                      <th className="py-2 px-2.5 meta">Actual Outcome</th>
                      <th className="py-2 px-2.5 meta">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb]">
                    {TEST_PREDICTIONS.slice(0, 15).map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2.5 px-2.5">
                          <span className="mono font-bold text-[#1a1a1a]">{p.customerId}</span>
                          <span className="block text-[11px] text-gray-500">{p.fullName}</span>
                        </td>
                        <td className="py-2.5 px-2.5 mono">{p.utilizationPct.toFixed(0)}%</td>
                        <td className="py-2.5 px-2.5 mono">{p.latePayments6M} delays</td>
                        <td className="py-2.5 px-2.5 mono font-bold text-[#4338ca]">
                          {p.predictedProbability.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2.5">
                          {p.actualDefault === 1 ? (
                            <span className="meta text-[#be123c] font-bold">Missed Payment (1)</span>
                          ) : (
                            <span className="meta text-emerald-700">Paid on Time (0)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span className={`mono text-[10px] px-1.5 py-0.5 rounded-xs ${
                            p.predictionOutcome === 'True Positive' || p.predictionOutcome === 'True Negative'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {p.predictionOutcome === 'True Positive' ? '✓ Correct High Risk' :
                             p.predictionOutcome === 'True Negative' ? '✓ Correct Low Risk' :
                             p.predictionOutcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'python' && (
            <div className="space-y-4 text-xs">
              <div>
                <h3 className="text-base font-serif font-bold text-[#1a1a1a]">
                  How to Load and Retrain model.pkl in Python
                </h3>
                <p className="text-gray-500 font-sans mt-0.5">
                  Use this simple script to load the downloaded <code className="mono bg-gray-100 px-1 py-0.5">model.pkl</code> in your local Python environment or Jupyter notebook:
                </p>
              </div>

              <div className="p-4 bg-[#1a1a1a] text-gray-100 mono text-xs rounded-none border border-black overflow-x-auto space-y-2">
                <div className="text-gray-400"># 1. Load the trained model using Python pickle</div>
                <div>import pickle</div>
                <div>import pandas as pd</div>
                <div className="pt-2 text-gray-400"># Open model.pkl</div>
                <div>with open("model.pkl", "rb") as f:</div>
                <div className="pl-4">model_artifact = pickle.load(f)</div>
                <div className="pt-2 text-gray-400"># Check model parameters &amp; accuracy</div>
                <div>print("Model algorithm:", model_artifact.get("algorithm", "GradientBoosting"))</div>
                <div>print("Trees:", model_artifact.get("hyperparameters", {}).get("n_estimators", 250))</div>
                <div className="pt-2 text-gray-400"># Load the realistic customer dataset</div>
                <div>df = pd.read_csv("combined_credit_risk_realistic_with_ids.csv")</div>
                <div>{'print(f"Loaded {len(df)} customer records for scoring.")'}</div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="meta text-gray-500">Works with Python 3.9+, Scikit-Learn, LightGBM, and Pandas.</span>
                <button
                  onClick={() => triggerDownload(downloadModelPkl, 'model.pkl')}
                  className="px-4 py-2 bg-[#4338ca] hover:bg-[#3730a3] text-white mono text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download model.pkl Now</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-[#e5e7eb] flex items-center justify-between text-xs">
          <div className="meta text-gray-500">
            CreditGuard AI · 4 Downloadable Files (model.pkl, dataset, test predictions, comparisons)
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 border border-[#1a1a1a] hover:bg-gray-100 mono text-xs uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
