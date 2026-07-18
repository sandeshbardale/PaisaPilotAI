import { Bell, BrainCircuit, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardApi } from '../api';
import { useAuth } from '../AuthContext';
import { Card, EmptyState, SkeletonCard, categoryIcon, formatDate, money } from '../components/UI';
import { useToast } from '../Toast';
import type { DashboardData, Page } from '../types';

interface Props {
  onNav: (p: Page) => void;
}

const PIE_COLORS = ['#8065ff', '#42c4ae', '#ffad5c', '#b3a8ff', '#f5728a', '#60c4f5'];

export default function Dashboard({ onNav }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const firstName = user?.name.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    setLoading(true);
    dashboardApi
      .get()
      .then(setData)
      .catch(() => toast('Failed to load dashboard', 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Monthly bar chart data
  const monthlyData = data
    ? Object.entries(data.monthly_trend)
        .slice(-6)
        .map(([month, v]) => ({ month: month.split(' ')[0], income: v.income, expense: v.expense }))
    : [];

  // Pie chart data
  const pieData = data
    ? Object.entries(data.categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }))
    : [];

  const totalCategoryExpense = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <>
      {/* Header */}
      <div className="top">
        <div>
          <p className="page-label">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</p>
          <h1>{greeting}, {firstName} ✦</h1>
          <em>Here's the calm, clear view of your money.</em>
        </div>
        <div className="top-actions">
          <button className="bell" aria-label="Notifications"><Bell size={18} /></button>
          <button className="btn-add" onClick={() => onNav('transactions')}>
            <Plus size={17} />Add transaction
          </button>
        </div>
      </div>

      {/* Metric cards */}
      {loading ? (
        <div className="metrics">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      ) : (
        <div className="metrics">
          <MetricCard
            label="TOTAL BALANCE"
            value={money((data?.savings ?? 0) + (data?.income ?? 0))}
            sub={`${data?.savings_rate ?? 0}% savings rate`}
            subColor="#60a48e"
          />
          <MetricCard
            label="MONTHLY INCOME"
            value={money(data?.income ?? 0)}
            sub="All recorded income"
          />
          <MetricCard
            label="MONTHLY SPEND"
            value={money(data?.expense ?? 0)}
            sub={data?.expense === 0 ? 'No expenses yet' : 'All recorded expenses'}
            subColor="#928c9c"
          />
          <MetricCard
            label="SAVINGS"
            value={money(data?.savings ?? 0)}
            sub={`Score: ${data?.health_score ?? 0}/100`}
            subColor={(data?.savings ?? 0) >= 0 ? '#60a48e' : '#e86359'}
          />
        </div>
      )}

      {/* Main grid */}
      <div className="dash-grid">
        {/* Cash flow / monthly trend */}
        <Card className="cash">
          <header>
            <div>
              <p className="card-label">INCOME VS EXPENSES</p>
              <h2>Monthly trend</h2>
            </div>
          </header>
          {monthlyData.length === 0 ? (
            <EmptyState icon="📊" title="No data yet" description="Add transactions to see your trend" />
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0eef2" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="income" fill="#42c4ae" radius={[4, 4, 0, 0]} name="Income" />
                  <Bar dataKey="expense" fill="#8065ff" radius={[4, 4, 0, 0]} name="Expense" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Health score */}
        <Card className="health">
          <header>
            <div>
              <p className="card-label">FINANCIAL HEALTH</p>
              <h2>{(data?.health_score ?? 0) >= 70 ? 'Looking strong' : 'Room to grow'}</h2>
            </div>
          </header>
          <div className="healthrow">
            <div className="ring" style={{ background: `radial-gradient(closest-side,#fff 76%,transparent 78% 100%),conic-gradient(#7258e8 ${data?.health_score ?? 0}%,#e8e4f3 0)` }}>
              <b>{data?.health_score ?? 0}</b>
              <small>/100</small>
            </div>
            <div>
              <b>{(data?.health_score ?? 0) >= 70 ? "You're in great shape" : 'Keep building habits'}</b>
              <em>Based on your income and savings ratio.</em>
            </div>
          </div>
          {data?.insights.map((ins, i) => (
            <div key={i} className="insight-chip">✦ {ins}</div>
          ))}
        </Card>

        {/* Spending pie */}
        <Card className="spend">
          <header>
            <div>
              <p className="card-label">SPENDING BREAKDOWN</p>
              <h2>Where it went</h2>
            </div>
          </header>
          {pieData.length === 0 ? (
            <EmptyState icon="🥧" title="No expenses yet" description="Add expenses to see the breakdown" />
          ) : (
            <>
              <div className="pie-wrap">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" innerRadius={38} outerRadius={60} paddingAngle={3}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <b className="pie-center">{money(data?.expense ?? 0)}<small>spent</small></b>
              </div>
              {pieData.map((d, i) => (
                <div className="legend" key={i}>
                  <i className="legend-dot" style={{ background: d.color }} />
                  {d.name}
                  <span>{totalCategoryExpense > 0 ? Math.round(d.value / totalCategoryExpense * 100) : 0}%</span>
                </div>
              ))}
            </>
          )}
        </Card>

        {/* AI coach */}
        <Card className="coach">
          <div className="bot-icon"><BrainCircuit size={22} /></div>
          <p className="card-label" style={{ color: '#c9bee9' }}>YOUR AI COACH</p>
          <h2>{data?.insights[0] ?? 'Upload transactions to get personalised insights.'}</h2>
          <em>{data?.insights[1] ?? 'I can help you build smarter money habits.'}</em>
          <button className="coach-btn" onClick={() => onNav('chat')}>
            Ask PaisaPilot <MessageCircle size={14} />
          </button>
        </Card>

        {/* Recent transactions */}
        <Card className="activity">
          <header>
            <div>
              <p className="card-label">RECENT ACTIVITY</p>
              <h2>Every rupee, understood</h2>
            </div>
            <button className="link-btn" onClick={() => onNav('transactions')}>View all</button>
          </header>
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="transaction" style={{ gap: 12 }}>
                <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 9 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 10, width: '40%' }} />
                </div>
                <div className="skeleton" style={{ height: 12, width: 60 }} />
              </div>
            ))
          ) : data?.recent_transactions.length === 0 ? (
            <EmptyState icon="💸" title="No transactions yet" description="Add your first transaction" />
          ) : (
            data?.recent_transactions.map((t) => (
              <div className="transaction" key={t.id}>
                <i className="tx-icon">{categoryIcon(t.category, t.transaction_type)}</i>
                <span className="tx-info">
                  <b>{t.description}</b>
                  <small>{t.category} · {formatDate(t.date)}</small>
                </span>
                <strong className={t.transaction_type === 'income' ? 'income' : 'expense-amt'}>
                  {t.transaction_type === 'income' ? '+' : '−'}{money(t.amount)}
                </strong>
              </div>
            ))
          )}
        </Card>

        {/* Savings goal placeholder */}
        <Card className="goal">
          <p className="card-label">SAVINGS GOAL</p>
          <h2>Japan Trip, 2027 🇯🇵</h2>
          <em>₹1,24,600 of ₹2,00,000</em>
          <div className="goal-bar"><div className="goal-fill" style={{ width: '62%' }} /></div>
          <b className="goal-pct">62%</b>
          <div className="pro-teaser">
            <Sparkles size={14} />
            <span>Goals tracking — coming in Pro</span>
          </div>
        </Card>
      </div>
    </>
  );
}

function MetricCard({ label, value, sub, subColor }: { label: string; value: string; sub: string; subColor?: string }) {
  return (
    <Card className="metric">
      <p className="card-label">{label}</p>
      <h2>{value}</h2>
      <small style={{ color: subColor ?? '#928c9c' }}>{sub}</small>
    </Card>
  );
}
