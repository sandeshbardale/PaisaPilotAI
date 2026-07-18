import { Loader2, MapPin, Navigation } from 'lucide-react';
import { useRef, useState } from 'react';
import { API_BASE, getToken } from '../api';
import { Card, money } from '../components/UI';
import { useToast } from '../Toast';

type Tool = 'trip' | 'restaurant' | 'invest' | 'goal';

const TOOLS: { id: Tool; emoji: string; label: string }[] = [
  { id: 'trip',       emoji: '✈️', label: 'Trip Planner' },
  { id: 'restaurant', emoji: '🍽️', label: 'Restaurant Budget' },
  { id: 'invest',     emoji: '📈', label: 'Investment Advisor' },
  { id: 'goal',       emoji: '🎯', label: 'Goal Planner' },
];

async function aiPost(path: string, body: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

export default function AITools() {
  const [activeTool, setActiveTool] = useState<Tool>('trip');
  return (
    <>
      <div className="top">
        <div>
          <p className="page-label">AI POWERED TOOLS</p>
          <h1>Financial Tools</h1>
          <em>Trip planner, restaurant advisor, investment calculator, goal tracker.</em>
        </div>
      </div>
      <div className="report-tabs">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tab-btn${activeTool === t.id ? ' active' : ''}`} onClick={() => setActiveTool(t.id)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <div className="tool-page">
        {activeTool === 'trip'       && <TripPlanner />}
        {activeTool === 'restaurant' && <RestaurantAdvisor />}
        {activeTool === 'invest'     && <InvestmentCalculator />}
        {activeTool === 'goal'       && <GoalPlanner />}
      </div>
    </>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const POPULAR = ['Goa', 'Manali', 'Kerala', 'Rajasthan', 'Kashmir', 'Ladakh', 'Ooty', 'Coorg', 'Andaman'];
const CITIES  = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat'];

function DestInput({ value, onChange, placeholder, suggestions, label }: {
  value: string; onChange: (v: string) => void;
  placeholder: string; suggestions: string[]; label: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && value.length > 0);
  return (
    <div className="field" style={{ position: 'relative' }}>
      <label>{label}</label>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder} autoComplete="off" />
      {open && filtered.length > 0 && (
        <div className="dest-suggestions">
          {filtered.map(s => (
            <button key={s} className="dest-option" onMouseDown={() => { onChange(s); setOpen(false); }}>📍 {s}</button>
          ))}
        </div>
      )}
      {!value && (
        <div className="dest-chips">
          {suggestions.slice(0, 7).map(s => (
            <button key={s} className="dest-chip" onClick={() => onChange(s)}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Trip Planner ─────────────────────────────────────────────────────────────

function TripPlanner() {
  const { toast } = useToast();
  const [origin, setOrigin]           = useState('');
  const [destination, setDestination] = useState('');
  const [routeResult, setRouteResult] = useState<any>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [days, setDays]               = useState(5);
  const [budget, setBudget]           = useState(15000);
  const [tripResult, setTripResult]   = useState<any>(null);
  const [tripLoading, setTripLoading] = useState(false);

  async function findRoute() {
    if (!origin.trim() || !destination.trim()) { toast('Enter both starting city and destination', 'error'); return; }
    setRouteLoading(true); setRouteResult(null);
    try { setRouteResult(await aiPost('/analysis/routes', { origin: origin.trim(), destination: destination.trim() })); }
    catch (e) { toast(e instanceof Error ? e.message : 'Route lookup failed', 'error'); }
    finally { setRouteLoading(false); }
  }

  async function planBudget() {
    if (!destination.trim()) { toast('Enter a destination', 'error'); return; }
    setTripLoading(true);
    try { setTripResult(await aiPost('/analysis/trip', { destination: destination.trim(), days, budget, from_city: origin.trim() || 'Delhi' })); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setTripLoading(false); }
  }

  return (
    <div className="tool-layout">
      <Card className="tool-form">
        <div className="tool-form-head">
          <span className="tool-emoji">✈️</span>
          <div><h3>AI Trip Planner</h3><p>Real distances via OpenStreetMap • All transport options • Budget plan</p></div>
        </div>

        {/* FROM → TO visual */}
        <div className="trip-route-box">
          <div className="trip-route-field">
            <span className="trip-route-dot from-dot">A</span>
            <div className="field" style={{ flex: 1, position: 'relative' }}>
              <label>From (Starting city)</label>
              <input
                value={origin}
                onChange={e => { setOrigin(e.target.value); }}
                placeholder="e.g. Delhi, Mumbai, Pune…"
                autoComplete="off"
                list="from-cities"
              />
              <datalist id="from-cities">
                {CITIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="trip-route-divider">↓</div>
          <div className="trip-route-field">
            <span className="trip-route-dot to-dot">B</span>
            <div className="field" style={{ flex: 1, position: 'relative' }}>
              <label>To (Destination)</label>
              <input
                value={destination}
                onChange={e => { setDestination(e.target.value); }}
                placeholder="e.g. Goa, Manali, Bangkok…"
                autoComplete="off"
                list="to-cities"
              />
              <datalist id="to-cities">
                {POPULAR.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
        </div>

        {/* Popular destinations chips */}
        <div className="trip-quick-row">
          <small>Popular:</small>
          {POPULAR.slice(0, 5).map(d => (
            <button key={d} className={`dest-chip${destination === d ? ' active' : ''}`}
              onClick={() => setDestination(d)}>{d}</button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={findRoute}
          disabled={routeLoading || !origin.trim() || !destination.trim()}>
          {routeLoading
            ? <><Loader2 size={14} className="spin" /> Finding route…</>
            : '🗺️ Find Route & Compare Transport'}
        </button>

        <div className="form-divider">Day-wise Budget Planner</div>

        <div className="field-row">
          <div className="field">
            <label>Days</label>
            <input type="number" min={1} max={30} value={days} onChange={e => setDays(Math.max(1, Number(e.target.value)))} />
          </div>
          <div className="field">
            <label>Total budget (₹)</label>
            <input type="number" min={1000} step={500} value={budget} onChange={e => setBudget(Number(e.target.value))} />
          </div>
        </div>

        <button className="btn btn-ghost" onClick={planBudget} disabled={tripLoading || !destination.trim()}>
          {tripLoading ? <><Loader2 size={14} className="spin" /> Planning…</> : '💰 Plan Day-wise Budget'}
        </button>
      </Card>

      <div className="tool-result">
        {routeResult && <RouteResult result={routeResult} />}
        {tripResult  && <TripBudgetResult result={tripResult} />}
      </div>
    </div>
  );
}

function RouteResult({ result }: { result: any }) {
  const modes: any[] = result.transport_options ?? [];
  const cheapest = result.recommendation?.cheapest;
  const fastest  = result.recommendation?.fastest;

  return (
    <>
      <Card className="route-header-card">
        <div className="route-title">
          <span className="route-place">📍 {result.origin}</span>
          <span className="route-arrow">→</span>
          <span className="route-place">📍 {result.destination}</span>
        </div>
        <div className="route-distances">
          <div className="dist-pill"><b>{result.road_distance_km} km</b><small>Road distance {result.road_source === 'real (OSRM)' ? '✓ live' : '(estimated)'}</small></div>
          <div className="dist-pill"><b>{result.straight_line_km} km</b><small>Straight line (air)</small></div>
        </div>
        <a href={result.google_maps_url} target="_blank" rel="noopener noreferrer" className="maps-link">
          🗺️ Open in Google Maps →
        </a>
      </Card>

      <Card style={{ padding: 18 }}>
        <p className="card-label">ALL TRANSPORT OPTIONS — SORTED BY COST</p>
        <div className="transport-grid">
          {modes.map((m: any, i: number) => {
            const isCheapest = m.mode === cheapest;
            const isFastest  = m.mode === fastest;
            return (
              <div key={i} className={`transport-card${isCheapest ? ' best-value' : isFastest ? ' fastest' : ''}`}>
                <div className="transport-card-head">
                  <span className="transport-mode-name">{m.mode}</span>
                  <div className="transport-badges">
                    {isCheapest && <span className="badge badge-green">Cheapest</span>}
                    {isFastest && !isCheapest && <span className="badge badge-blue">Fastest</span>}
                  </div>
                </div>
                <div className="transport-cost">{m.cost_label}</div>
                <div className="transport-time">⏱ {m.duration_label}</div>
                <div className="transport-detail">{m.details}</div>
                <div className="transport-book">Book at: <span>{m.book_at}</span></div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <p className="card-label">AI RECOMMENDATION</p>
        <div className="reco-row"><span>💰 Cheapest option</span><b>{cheapest}</b></div>
        <div className="reco-row"><span>⚡ Fastest option</span><b>{fastest}</b></div>
        <div className="reco-row"><span>✅ Best value</span><b>{result.recommendation?.best_value}</b></div>
      </Card>
    </>
  );
}

function TripBudgetResult({ result }: { result: any }) {
  return (
    <>
      <div className={`feasibility-banner ${result.feasibility.feasible ? 'feasible' : 'not-feasible'}`}>
        {result.feasibility.message}
      </div>
      <div className="trip-header-row">
        <div className="trip-stat"><b>📍 {result.destination}</b><small>Destination</small></div>
        <div className="trip-stat"><b>{result.days} days</b><small>Duration</small></div>
        <div className="trip-stat"><b>{result.best_season}</b><small>Best season</small></div>
      </div>
      <div className="budget-plans">
        {[result.budget_plan, result.comfort_plan].map((plan: any) => (
          <Card key={plan.label} className="budget-plan-card">
            <p className="card-label">{plan.label.toUpperCase()}</p>
            {(['flight','hotel','food','transport','misc'] as const).map(k => (
              <div key={k} className="budget-row"><span>{k.charAt(0).toUpperCase()+k.slice(1)}</span><b>{money(plan[k])}</b></div>
            ))}
            <div className="budget-row total-row"><span>TOTAL</span><b>{money(plan.total)}</b></div>
          </Card>
        ))}
      </div>
      <Card className="result-section">
        <p className="card-label">DAY-WISE ITINERARY</p>
        {result.day_wise_plan.map((d: any) => (
          <div key={d.day} className="day-row">
            <span className="day-badge">Day {d.day}</span>
            <span className="day-activity">{d.activity}</span>
            <b className="day-cost">{money(d.estimated_cost)}</b>
          </div>
        ))}
      </Card>
      <Card className="result-section">
        <p className="card-label">PLACES TO VISIT</p>
        <div className="places-grid">
          {result.places_to_visit.map((p: string, i: number) => <div key={i} className="place-chip">📍 {p}</div>)}
        </div>
      </Card>
      <Card className="result-section">
        <p className="card-label">MONEY-SAVING TIPS</p>
        <ul className="tips-list">{result.money_saving_tips.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
      </Card>
    </>
  );
}

// ─── Restaurant Advisor with menu image upload ────────────────────────────────

const SAMPLE_MENU = `Paneer Tikka - ₹280
Veg Biryani - ₹220
Dal Makhani - ₹180
Butter Naan - ₹60
Soft Drink - ₹60
Gulab Jamun - ₹80
Masala Chai - ₹40
Fried Rice - ₹160
Chapati - ₹30
Paneer Butter Masala - ₹240`;

function RestaurantAdvisor() {
  const { toast } = useToast();
  const imgRef = useRef<HTMLInputElement>(null);
  const [budget, setBudget]         = useState(600);
  const [menuText, setMenuText]     = useState(SAMPLE_MENU);
  const [result, setResult]         = useState<any>(null);
  const [loading, setLoading]       = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function advise() {
    if (!menuText.trim()) { toast('Enter menu items', 'error'); return; }
    setLoading(true);
    try { setResult(await aiPost('/analysis/restaurant', { budget, menu_text: menuText })); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setLoading(false); }
  }

  async function handleMenuImage(file: File) {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!['.jpg','.jpeg','.png','.webp'].includes(ext)) {
      toast('Upload a JPG or PNG image', 'error'); return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setOcrLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/analysis/menu-ocr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'OCR failed');
      if (data.items_found > 0) {
        const lines = data.menu_items.map((i: any) => `${i.name} - ₹${i.price}`).join('\n');
        setMenuText(lines);
        toast(`${data.items_found} menu items extracted from image!`, 'success');
      } else {
        toast(data.message || 'No items found — please type the menu', 'info');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'OCR failed', 'error');
    } finally { setOcrLoading(false); }
  }

  return (
    <div className="tool-layout">
      <Card className="tool-form">
        <div className="tool-form-head">
          <span className="tool-emoji">🍽️</span>
          <div><h3>Restaurant Budget Advisor</h3><p>Upload menu photo or type items — AI finds the best order</p></div>
        </div>

        <div className="field">
          <label>Your budget (₹)</label>
          <input type="number" min={50} step={50} value={budget} onChange={e => setBudget(Number(e.target.value))} />
        </div>

        {/* Image upload */}
        <div className="menu-img-zone"
          onClick={() => imgRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleMenuImage(f); }}>
          <input ref={imgRef} type="file" hidden accept=".jpg,.jpeg,.png,.webp"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleMenuImage(f); }} />
          {ocrLoading ? (
            <><Loader2 size={22} className="spin" /><span>Reading menu with OCR…</span></>
          ) : previewUrl ? (
            <div className="menu-preview">
              <img src={previewUrl} alt="menu" className="menu-thumb" />
              <span>Click to change photo</span>
            </div>
          ) : (
            <>
              <span className="menu-upload-icon">📷</span>
              <b>Upload menu photo</b>
              <small>Take a photo of the menu — AI reads it automatically</small>
            </>
          )}
        </div>

        <div className="field">
          <label>Menu items <span className="optional">(auto-filled from photo, or type manually)</span></label>
          <textarea style={{ height: 200, resize: 'vertical' }} value={menuText}
            onChange={e => setMenuText(e.target.value)}
            placeholder={'Paneer Tikka - ₹280\nVeg Biryani - ₹220\nDal Makhani - ₹180'} />
        </div>

        <button className="btn btn-primary" onClick={advise} disabled={loading}>
          {loading ? <><Loader2 size={14} className="spin" /> Finding best order…</> : '🍽️ Find Best Order'}
        </button>
      </Card>

      {result && (
        <div className="tool-result">
          {result.best_combo ? (
            <>
              <Card className="combo-result">
                <p className="card-label">BEST ORDER FOR ₹{result.budget.toLocaleString('en-IN')}</p>
                <p className="combo-message">{result.best_combo.message}</p>
                <div className="combo-items">
                  {result.best_combo.items.map((item: any, i: number) => (
                    <div key={i} className="combo-item"><span>🍽️ {item.name}</span><b>{money(item.price)}</b></div>
                  ))}
                  <div className="combo-item combo-total"><span>Total</span><b>{money(result.best_combo.total)}</b></div>
                  <div className="combo-item combo-remaining"><span>Remaining</span><b>+{money(result.best_combo.remaining)}</b></div>
                </div>
              </Card>
              <Card className="result-section">
                <p className="card-label">TIPS</p>
                <ul className="tips-list">{result.tips.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
              </Card>
            </>
          ) : (
            <Card className="result-section"><p style={{ color: 'var(--text-2)' }}>{result.message}</p></Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Investment Calculator ─────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  'very low': '#55a28b', 'low': '#42c4ae', 'medium': '#ffad5c',
  'medium-high': '#f5728a', 'high': '#e86359',
};

function InvestmentCalculator() {
  const { toast } = useToast();
  const [amount, setAmount] = useState(10000);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    if (amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    setLoading(true);
    try { setResult(await aiPost('/analysis/invest', { amount })); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="tool-layout">
      <Card className="tool-form">
        <div className="tool-form-head">
          <span className="tool-emoji">📈</span>
          <div><h3>AI Investment Advisor</h3><p>Personalised portfolio plan for any surplus amount</p></div>
        </div>
        <div className="field">
          <label>Amount to invest (₹)</label>
          <input type="number" min={500} step={500} value={amount} onChange={e => setAmount(Number(e.target.value))} />
        </div>
        <div className="quick-amounts">
          {[2000, 5000, 10000, 25000, 50000].map(a => (
            <button key={a} className={`quick-btn${amount === a ? ' active' : ''}`} onClick={() => setAmount(a)}>
              ₹{a >= 1000 ? `${a/1000}K` : a}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={calculate} disabled={loading}>
          {loading ? <><Loader2 size={14} className="spin" /> Analysing…</> : '📈 Get Investment Plan'}
        </button>
      </Card>

      {result && result.suggestions?.length > 0 && (
        <div className="tool-result">
          <div className="invest-summary">
            <Card className="invest-summary-card">
              <p className="card-label">MONTHLY INVESTMENT</p>
              <h2>{money(result.investable_amount)}</h2>
            </Card>
            <Card className="invest-summary-card">
              <p className="card-label">PROJECTED 10-YEAR WEALTH</p>
              <h2 style={{ color: '#42c4ae' }}>{money(result.projected_10_year_wealth)}</h2>
              <small>At ~12% CAGR via SIP</small>
            </Card>
          </div>
          <div className="invest-cards">
            {result.suggestions.map((s: any, i: number) => {
              const color = RISK_COLORS[s.risk.toLowerCase()] ?? 'var(--text-2)';
              return (
                <Card key={i} className="invest-card">
                  <div className="invest-card-head">
                    <b>{s.option}</b>
                    <span className="risk-badge" style={{ background: color + '22', color }}>{s.risk}</span>
                  </div>
                  <div className="invest-row">
                    <span className="invest-amount">{money(s.amount)}<small>/mo ({s.allocation_pct}%)</small></span>
                    <span className="invest-return">↑ {s.expected_return}</span>
                  </div>
                  <p className="invest-desc">{s.description}</p>
                </Card>
              );
            })}
          </div>
          <p className="disclaimer">{result.disclaimer}</p>
        </div>
      )}
      {result && result.suggestions?.length === 0 && (
        <Card className="result-section"><p style={{ color: 'var(--text-2)' }}>{result.message}</p></Card>
      )}
    </div>
  );
}

// ─── Goal Planner ─────────────────────────────────────────────────────────────

const PRESET_GOALS = [
  { name: 'Buy a Laptop', amount: 60000 },
  { name: 'Buy a Phone', amount: 40000 },
  { name: 'Emergency Fund', amount: 100000 },
  { name: 'Trip to Japan', amount: 200000 },
  { name: 'Buy a Bike', amount: 90000 },
  { name: 'Higher Education', amount: 500000 },
];

function GoalPlanner() {
  const { toast } = useToast();
  const [goalName, setGoalName]       = useState('Buy a Laptop');
  const [targetAmount, setTargetAmount] = useState(60000);
  const [currentSaved, setCurrentSaved] = useState(10000);
  const [monthlySaving, setMonthlySaving] = useState(5000);
  const [result, setResult]           = useState<any>(null);
  const [loading, setLoading]         = useState(false);

  const pct = result ? Math.min(100, Math.round((result.current_saved / result.target) * 100)) : 0;

  async function plan() {
    if (!goalName.trim() || targetAmount <= 0) { toast('Fill in all fields', 'error'); return; }
    setLoading(true);
    try {
      setResult(await aiPost('/analysis/goal', {
        name: goalName, target_amount: targetAmount,
        current_saved: currentSaved, monthly_saving: monthlySaving,
      }));
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="tool-layout">
      <Card className="tool-form">
        <div className="tool-form-head">
          <span className="tool-emoji">🎯</span>
          <div><h3>Goal-Based Financial Planner</h3><p>Calculate your savings timeline for any goal</p></div>
        </div>
        <div className="field">
          <label>Quick select</label>
          <div className="dest-chips">
            {PRESET_GOALS.map(g => (
              <button key={g.name} className={`dest-chip${goalName === g.name ? ' active' : ''}`}
                onClick={() => { setGoalName(g.name); setTargetAmount(g.amount); setResult(null); }}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Goal name</label>
          <input value={goalName} onChange={e => setGoalName(e.target.value)} placeholder="e.g. Buy iPhone, Japan trip…" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Target amount (₹)</label>
            <input type="number" min={100} step={1000} value={targetAmount} onChange={e => setTargetAmount(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Already saved (₹)</label>
            <input type="number" min={0} step={500} value={currentSaved} onChange={e => setCurrentSaved(Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Monthly saving (₹)</label>
          <input type="number" min={100} step={500} value={monthlySaving} onChange={e => setMonthlySaving(Number(e.target.value))} />
        </div>
        <button className="btn btn-primary" onClick={plan} disabled={loading}>
          {loading ? <><Loader2 size={14} className="spin" /> Calculating…</> : '🎯 Calculate My Timeline'}
        </button>
      </Card>

      {result && (
        <div className="tool-result">
          <Card className="result-section">
            <h3 className="goal-name">🎯 {result.goal}</h3>
            <div className="goal-progress-bar">
              <div style={{ width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.8s' }} />
            </div>
            <div className="goal-progress-labels">
              <span>{money(result.current_saved)} saved</span>
              <span className="goal-pct-label">{pct}%</span>
              <span>{money(result.target)} goal</span>
            </div>
            <div className="trip-header-row" style={{ marginTop: 16 }}>
              <div className="trip-stat"><b>{result.timeline}</b><small>Time to goal</small></div>
              <div className="trip-stat"><b>{money(result.remaining)}</b><small>Still needed</small></div>
              <div className="trip-stat"><b>{money(result.monthly_saving)}</b><small>Monthly saving</small></div>
            </div>
          </Card>
          {result.faster_options?.length > 0 && (
            <Card className="result-section">
              <p className="card-label">REACH YOUR GOAL FASTER</p>
              {result.faster_options.map((opt: any, i: number) => (
                <div key={i} className="faster-option">
                  <div className="faster-left">
                    <b>Save {money(opt.new_monthly)}/month</b>
                    <small>+{opt.increase_by} more each month</small>
                  </div>
                  <div className="faster-right">
                    <b style={{ color: 'var(--income)' }}>-{opt.months_saved} months sooner</b>
                    <small>Done in {opt.new_timeline_months} months</small>
                  </div>
                </div>
              ))}
            </Card>
          )}
          <Card className="result-section">
            <p className="card-label">TIPS</p>
            <ul className="tips-list">{result.tips?.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
          </Card>
        </div>
      )}
    </div>
  );
}
