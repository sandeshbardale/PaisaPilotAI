import { CheckCircle, FileText, TrendingUp, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { uploadApi } from '../api';
import { Card, money } from '../components/UI';
import { useToast } from '../Toast';

const PIE_COLORS = ['#8065ff', '#42c4ae', '#ffad5c', '#b3a8ff', '#f5728a', '#60c4f5', '#ffd166'];

interface UploadResult {
  filename: string;
  status: string;
  transaction_count: number;
  message: string;
  analysis?: {
    summary: {
      total_income: number;
      total_expense: number;
      net_savings: number;
      savings_rate: number;
      transaction_count: number;
    };
    category_breakdown: Record<string, number>;
    monthly_trend: Record<string, { income: number; expense: number }>;
    spending_insights: string[];
    savings_plan: {
      tips: string[];
      potential_additional_savings: number;
      target_savings: number;
      emergency_fund_target: number;
    };
    investment_advice: {
      investable_amount: number;
      suggestions: Array<{
        option: string; allocation_pct: number; amount: number;
        expected_return: string; risk: string; description: string;
      }>;
      projected_10_year_wealth: number;
      disclaimer: string;
    };
    subscription_analysis: {
      detected: string[];
      total_monthly: number;
      potential_annual_saving: number;
    };
    health_score: { score: number; rating: string };
  };
}

export default function UploadPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'insights' | 'savings' | 'investments' | 'subscriptions'>('insights');

  function pickFile(file: File) {
    const allowed = ['.pdf', '.csv', '.png', '.jpg', '.jpeg'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) {
      setError(`Unsupported file type. Allowed: ${allowed.join(', ')}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10 MB limit');
      return;
    }
    setError(''); setResult(null); setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true); setProgress(5); setError('');
    try {
      const res = await uploadApi.statement(selectedFile, setProgress);
      setResult(res as UploadResult);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
      toast(res.transaction_count > 0 ? `${res.transaction_count} transactions extracted!` : res.message, res.transaction_count > 0 ? 'success' : 'info');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(msg); toast(msg, 'error');
    } finally {
      setUploading(false);
    }
  }

  const analysis = result?.analysis;
  const pieData = analysis
    ? Object.entries(analysis.category_breakdown)
        .sort((a, b) => b[1] - a[1]).slice(0, 7)
        .map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }))
    : [];

  const monthlyData = analysis
    ? Object.entries(analysis.monthly_trend).slice(-6)
        .map(([month, v]) => ({ month: month.split(' ')[0], income: v.income, expense: v.expense }))
    : [];

  return (
    <>
      <div className="top">
        <div>
          <p className="page-label">IMPORT DATA</p>
          <h1>Upload Statement</h1>
          <em>Upload your bank statement — AI extracts, categorises, and analyses everything.</em>
        </div>
      </div>

      <div className="upload-layout">
        {/* Drop zone */}
        <Card className="upload-card">
          <div
            className={`drop-zone${dragging ? ' drag-over' : ''}${selectedFile ? ' has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
            onClick={() => !selectedFile && inputRef.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" hidden accept=".pdf,.csv,.png,.jpg,.jpeg"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
            {selectedFile ? (
              <div className="file-preview">
                <FileText size={38} />
                <span>{selectedFile.name}</span>
                <small>{(selectedFile.size / 1024).toFixed(0)} KB</small>
                <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setError(''); }}>
                  <X size={14} /> Remove
                </button>
              </div>
            ) : (
              <>
                <Upload size={38} />
                <b>Drop file here or click to browse</b>
                <small>PDF, CSV, PNG, JPG — max 10 MB</small>
              </>
            )}
          </div>

          {uploading && (
            <div className="progress-wrap">
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
              <small>Analysing with AI… {progress}%</small>
            </div>
          )}
          {error && <div className="upload-error">{error}</div>}
          {selectedFile && !uploading && (
            <button className="btn btn-primary upload-btn" onClick={handleUpload}>
              <Upload size={16} /> Upload & Analyse with AI
            </button>
          )}
        </Card>

        {/* How it works */}
        {!result && (
          <Card className="upload-info">
            <h3>What happens after upload</h3>
            <ol className="steps">
              <li><span>1</span><div><b>AI extracts transactions</b> from PDF/CSV automatically.</div></li>
              <li><span>2</span><div><b>Smart categorisation</b> — Food, Transport, Shopping, etc.</div></li>
              <li><span>3</span><div><b>Spending insights</b> with personalised recommendations.</div></li>
              <li><span>4</span><div><b>Savings & investment plan</b> based on your actual data.</div></li>
              <li><span>5</span><div><b>Subscription detection</b> to find hidden recurring costs.</div></li>
            </ol>
            <div className="csv-tip">
              <b>Best results:</b> Export CSV from your net banking portal. Columns needed:{' '}
              <code>Date, Description/Narration, Debit, Credit</code> or <code>Amount</code>.
            </div>
          </Card>
        )}

        {/* Quick success banner */}
        {result && result.transaction_count > 0 && (
          <Card className="upload-result">
            <CheckCircle size={32} className="result-icon" />
            <h3>Analysis complete!</h3>
            <div className="result-stats">
              <div className="stat-pill"><b>{result.transaction_count}</b><span>Transactions</span></div>
              {analysis && <>
                <div className="stat-pill income"><b>{money(analysis.summary.total_income)}</b><span>Income</span></div>
                <div className="stat-pill expense"><b>{money(analysis.summary.total_expense)}</b><span>Expenses</span></div>
                <div className="stat-pill"><b>{analysis.summary.savings_rate}%</b><span>Savings Rate</span></div>
                <div className="stat-pill score"><b>{analysis.health_score.score}/100</b><span>{analysis.health_score.rating}</span></div>
              </>}
            </div>
          </Card>
        )}

        {result && result.transaction_count === 0 && (
          <Card className="upload-result">
            <div className="no-extract">
              <TrendingUp size={32} />
              <h3>File uploaded</h3>
              <p>{result.message}</p>
              <p className="hint">Try exporting a <b>CSV</b> from your bank's net banking portal for best results.</p>
            </div>
          </Card>
        )}
      </div>

      {/* Full AI Analysis Report */}
      {analysis && (
        <div className="analysis-report">
          <h2 className="report-title">AI Financial Analysis Report</h2>

          {/* Tab navigation */}
          <div className="report-tabs">
            {(['insights', 'savings', 'investments', 'subscriptions'] as const).map((tab) => (
              <button key={tab} className={`tab-btn${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'insights' ? '💡 Insights' : tab === 'savings' ? '💰 Savings Plan' : tab === 'investments' ? '📈 Investments' : '🔄 Subscriptions'}
              </button>
            ))}
          </div>

          {/* Charts row */}
          <div className="charts-row">
            {pieData.length > 0 && (
              <Card className="chart-card">
                <p className="card-label">EXPENSE BREAKDOWN</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart><Pie data={pieData} dataKey="value" innerRadius={36} outerRadius={58} paddingAngle={3}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie></PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {pieData.map((d, i) => (
                      <div className="legend" key={i}>
                        <i className="legend-dot" style={{ background: d.color }} />
                        {d.name}<span>{money(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {monthlyData.length > 0 && (
              <Card className="chart-card">
                <p className="card-label">MONTHLY TREND</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={monthlyData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0eef2" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Bar dataKey="income" fill="#42c4ae" radius={[4, 4, 0, 0]} name="Income" />
                    <Bar dataKey="expense" fill="#8065ff" radius={[4, 4, 0, 0]} name="Expense" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>

          {/* Tab content */}
          {activeTab === 'insights' && (
            <div className="insight-list">
              {analysis.spending_insights.map((ins, i) => (
                <div key={i} className="insight-row">
                  <span className="insight-num">{i + 1}</span>
                  <p><MarkdownText text={ins} /></p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'savings' && (
            <div className="savings-section">
              <div className="savings-grid">
                <Card className="savings-stat">
                  <p className="card-label">CURRENT SAVINGS</p>
                  <h2 style={{ color: analysis.savings_plan.target_savings > 0 && analysis.summary.net_savings >= 0 ? '#55a28b' : '#e86359' }}>
                    {money(analysis.summary.net_savings)}
                  </h2>
                  <small>Target: {money(analysis.savings_plan.target_savings)}/month</small>
                </Card>
                <Card className="savings-stat">
                  <p className="card-label">EMERGENCY FUND TARGET</p>
                  <h2>{money(analysis.savings_plan.emergency_fund_target)}</h2>
                  <small>6 months of expenses</small>
                </Card>
                <Card className="savings-stat">
                  <p className="card-label">POTENTIAL EXTRA SAVING</p>
                  <h2 style={{ color: '#8065ff' }}>{money(analysis.savings_plan.potential_additional_savings)}/mo</h2>
                  <small>By cutting top 3 categories 15%</small>
                </Card>
              </div>
              <Card style={{ padding: '20px', marginTop: 14 }}>
                <p className="card-label">SAVINGS TIPS</p>
                <ul className="tips-list">
                  {analysis.savings_plan.tips.map((tip, i) => (
                    <li key={i}><MarkdownText text={tip} /></li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {activeTab === 'investments' && analysis.investment_advice.investable_amount > 0 && (
            <div className="invest-section">
              <div className="invest-header">
                <div>
                  <p className="card-label">INVESTABLE AMOUNT</p>
                  <h2>{money(analysis.investment_advice.investable_amount)}/month</h2>
                </div>
                <div>
                  <p className="card-label">PROJECTED 10-YEAR WEALTH</p>
                  <h2 style={{ color: '#42c4ae' }}>{money(analysis.investment_advice.projected_10_year_wealth)}</h2>
                </div>
              </div>
              <div className="invest-cards">
                {analysis.investment_advice.suggestions.map((s, i) => (
                  <Card key={i} className="invest-card">
                    <div className="invest-card-head">
                      <b>{s.option}</b>
                      <span className={`risk-badge risk-${s.risk.toLowerCase().replace(/[^a-z]/g, '-')}`}>{s.risk}</span>
                    </div>
                    <div className="invest-amount">{money(s.amount)}/mo <small>({s.allocation_pct}%)</small></div>
                    <div className="invest-return">Expected: <b>{s.expected_return}</b></div>
                    <p className="invest-desc">{s.description}</p>
                  </Card>
                ))}
              </div>
              <p className="disclaimer">{analysis.investment_advice.disclaimer}</p>
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <div className="subs-section">
              <div className="subs-stats">
                <Card className="savings-stat">
                  <p className="card-label">MONTHLY SUBSCRIPTIONS</p>
                  <h2>{money(analysis.subscription_analysis.total_monthly)}</h2>
                  <small>{analysis.subscription_analysis.detected.length} subscription(s) found</small>
                </Card>
                <Card className="savings-stat">
                  <p className="card-label">POTENTIAL ANNUAL SAVING</p>
                  <h2 style={{ color: '#8065ff' }}>{money(analysis.subscription_analysis.potential_annual_saving)}</h2>
                  <small>If unused ones are cancelled</small>
                </Card>
              </div>
              {analysis.subscription_analysis.detected.length > 0 ? (
                <Card style={{ padding: '20px', marginTop: 14 }}>
                  <p className="card-label">DETECTED SUBSCRIPTIONS</p>
                  <div className="sub-list">
                    {analysis.subscription_analysis.detected.map((sub, i) => (
                      <div key={i} className="sub-item">
                        <span>🔄</span> {sub}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
                    Review each subscription and cancel any you no longer actively use.
                  </p>
                </Card>
              ) : (
                <Card style={{ padding: '20px', marginTop: 14 }}>
                  <p style={{ color: 'var(--text-2)' }}>No subscriptions detected in the uploaded statement.</p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}
