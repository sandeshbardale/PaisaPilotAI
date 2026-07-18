import { Loader2, MapPin, Navigation, Search, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { API_BASE, getToken } from '../api';
import { Card, money } from '../components/UI';
import { useToast } from '../Toast';

async function travelPost(path: string, body: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

type TGTab = 'guide' | 'nearby' | 'hotels' | 'activities';
type Loc   = { lat: number; lon: number };

const INTERESTS    = ['Family','Solo','Couple','Friends','Adventure','Photography','Food Lover'];
const GUIDE_PROMPTS = ['Show me tourist attractions nearby','Find hotels under ₹2000/night','Best restaurants near me','Plan a 3-day itinerary','Suggest adventure activities','Hidden gems to visit','Photography spots nearby','Family-friendly places'];
const NEAR_CATS    = [
  {id:'tourist_attractions',icon:'🏛️',label:'Attractions'},
  {id:'hotels',             icon:'🏨',label:'Hotels'},
  {id:'restaurants',        icon:'🍽️',label:'Restaurants'},
  {id:'hospitals',          icon:'🏥',label:'Hospitals'},
  {id:'atms',               icon:'🏧',label:'ATMs'},
  {id:'petrol',             icon:'⛽', label:'Petrol'},
  {id:'shopping',           icon:'🛍️',label:'Shopping'},
  {id:'parking',            icon:'🅿️', label:'Parking'},
  {id:'transport',          icon:'🚉',label:'Transport'},
  {id:'activities',         icon:'🎭',label:'Activities'},
];

/* ─── Shared helpers ─────────────────────────────────────────────────────── */

function PlaceCard({ place, icon }: { place: any; icon?: string }) {
  return (
    <div className="place-card">
      <div className="place-card-head">
        <span className="place-icon">{icon ?? '📍'}</span>
        <div className="place-info"><b>{place.name}</b><small>{place.distance_label}</small></div>
        <a href={place.maps_url} target="_blank" rel="noopener noreferrer" className="place-maps-btn">🗺️</a>
      </div>
      {(place.opening_hours || place.cuisine || place.phone) && (
        <div className="place-meta">
          {place.cuisine      && <span>🍽️ {place.cuisine}</span>}
          {place.opening_hours && <span>🕐 {place.opening_hours.slice(0,35)}</span>}
          {place.phone        && <span>📞 {place.phone}</span>}
        </div>
      )}
    </div>
  );
}

function NearbyInlineCards({ data }: { data: Record<string,any> }) {
  const ICONS: Record<string,string> = {tourist_attractions:'🏛️',hotels:'🏨',restaurants:'🍽️',photography_spots:'📸',activities:'🎭'};
  const entries = Object.entries(data).filter(([,v]:any) => { const p = Array.isArray(v)?v:v?.places??[]; return p.length>0; });
  if (!entries.length) return null;
  return (
    <div className="nearby-inline">
      {entries.slice(0,3).map(([key,val]:any) => {
        const places = Array.isArray(val)?val:val?.places??[];
        if (!places.length) return null;
        return (
          <div key={key} className="nearby-inline-group">
            <p className="card-label">{ICONS[key]??'📍'} {key.replace(/_/g,' ').toUpperCase()}</p>
            {places.slice(0,3).map((p:any,i:number)=>(
              <div key={i} className="nearby-inline-item">
                <span>{p.name}</span><span className="dist-pill-sm">{p.distance_label}</span>
                <a href={p.maps_url} target="_blank" rel="noopener noreferrer">🗺️</a>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MarkdownP({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p style={{margin:0,whiteSpace:'pre-wrap',lineHeight:1.7}}>
      {parts.map((p,i) => p.startsWith('**')&&p.endsWith('**')
        ? <strong key={i}>{p.slice(2,-2)}</strong>
        : <span key={i}>{p}</span>
      )}
    </p>
  );
}

/* ─── Hotel Finder ───────────────────────────────────────────────────────── */

function HotelFinder({ loc }: { loc: Loc|null }) {
  const { toast } = useToast();
  const [budgetNight, setBudgetNight] = useState(2000);
  const [guests, setGuests] = useState(2);
  const [nights, setNights] = useState(2);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function find() {
    if (!loc) { toast('Enable location first','error'); return; }
    setLoading(true);
    try { setResult(await travelPost('/travel/hotels',{lat:loc.lat,lon:loc.lon,budget_per_night:budgetNight,guests,nights})); }
    catch(e) { toast(e instanceof Error?e.message:'Failed','error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="tg-nearby-layout">
      <Card className="tg-config-panel">
        <p className="card-label">HOTEL SEARCH</p>
        <div className="field"><label>Budget/night (₹)</label><input type="number" min={300} step={100} value={budgetNight} onChange={e=>setBudgetNight(Number(e.target.value))}/></div>
        <div className="field-row">
          <div className="field"><label>Guests</label><input type="number" min={1} max={20} value={guests} onChange={e=>setGuests(Number(e.target.value))}/></div>
          <div className="field"><label>Nights</label><input type="number" min={1} max={30} value={nights} onChange={e=>setNights(Number(e.target.value))}/></div>
        </div>
        <div className="quick-amounts">{[500,1000,2000,4000,8000].map(b=><button key={b} className={`quick-btn${budgetNight===b?' active':''}`} onClick={()=>setBudgetNight(b)}>₹{b>=1000?`${b/1000}K`:b}</button>)}</div>
        <button className="btn btn-primary" onClick={find} disabled={loading||!loc} style={{marginTop:10}}>
          {loading ? <><Loader2 size={14} className="spin"/>Searching…</> : '🏨 Find Hotels'}
        </button>
        {!loc && <p className="loc-hint">📍 Enable location to search</p>}
      </Card>
      <div className="tg-results">
        {result ? (
          <>
            <div className="hotel-tier-banner">
              <span>{result.tier?.emoji} {result.tier?.label}</span>
              <span>{result.tier?.price_range}</span>
              <span>Total: <b>{money(result.total_hotel_cost)}</b> for {nights} night(s)</span>
            </div>
            <div className="hotel-booking-row">{result.booking_links?.map((bl:any)=><a key={bl.platform} href={bl.url} target="_blank" rel="noopener noreferrer" className="booking-link">{bl.platform}</a>)}</div>
            {result.nearby_hotels?.length>0
              ? <div className="near-places-grid">{result.nearby_hotels.map((h:any,i:number)=><PlaceCard key={i} place={h} icon="🏨"/>)}</div>
              : <Card style={{padding:20,textAlign:'center'}}><p style={{color:'var(--text-2)'}}>No hotels on OSM. Use booking links above.</p></Card>}
            <Card style={{padding:16}}><p className="card-label">TIPS</p><ul className="tips-list">{result.tips?.map((t:string,i:number)=><li key={i}>{t}</li>)}</ul></Card>
          </>
        ) : (
          <div className="tg-placeholder"><div style={{fontSize:48,marginBottom:12}}>🏨</div><h3>Find hotels near you</h3><p>Real nearby hotels from OpenStreetMap + smart budget recommendations.</p></div>
        )}
      </div>
    </div>
  );
}

/* ─── Activity Explorer ─────────────────────────────────────────────────── */

function ActivityExplorer({ loc }: { loc: Loc|null }) {
  const { toast } = useToast();
  const [interest, setInterest] = useState('Adventure');
  const [budget, setBudget] = useState(5000);
  const [days, setDays] = useState(3);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function plan() {
    if (!loc) { toast('Enable location first','error'); return; }
    setLoading(true);
    try { setResult(await travelPost('/travel/activities',{lat:loc.lat,lon:loc.lon,budget,interest,days})); }
    catch(e) { toast(e instanceof Error?e.message:'Failed','error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="tg-nearby-layout">
      <Card className="tg-config-panel">
        <p className="card-label">PLAN ACTIVITIES</p>
        <div className="field"><label>Travel style</label><div className="interest-grid">{INTERESTS.map(i=><button key={i} className={`interest-btn${interest===i?' active':''}`} onClick={()=>setInterest(i)}>{i}</button>)}</div></div>
        <div className="field"><label>Budget (₹)</label><input type="number" min={500} step={500} value={budget} onChange={e=>setBudget(Number(e.target.value))}/></div>
        <div className="field"><label>Days</label><input type="number" min={1} max={14} value={days} onChange={e=>setDays(Number(e.target.value))}/></div>
        <button className="btn btn-primary" onClick={plan} disabled={loading||!loc} style={{marginTop:4}}>
          {loading ? <><Loader2 size={14} className="spin"/>Planning…</> : '🎭 Plan Activities'}
        </button>
        {!loc && <p className="loc-hint">📍 Enable location to search</p>}
      </Card>
      <div className="tg-results">
        {result ? (
          <>
            <div className="act-summary-row">
              <div className="trip-stat"><b>{result.interest}</b><small>Style</small></div>
              <div className="trip-stat"><b>{money(result.total_estimated_cost)}</b><small>Est. cost</small></div>
              <div className="trip-stat"><b>{money(result.budget_remaining)}</b><small>Remaining</small></div>
              <div className="trip-stat"><b>{result.days} days</b><small>Duration</small></div>
            </div>
            <div className="act-grid">{result.recommended_activities?.map((a:any,i:number)=><div key={i} className="act-card"><span className="act-emoji">{a.emoji}</span><div className="act-info"><b>{a.name}</b><small>{a.cost_range} · {a.duration}</small><span className="act-tag">{a.best_for}</span></div><span className="act-cost">{money(a.estimated_cost)}</span></div>)}</div>
            {result.day_wise_plan?.length>0 && <Card style={{padding:18,marginTop:12}}><p className="card-label">DAY-WISE PLAN</p>{result.day_wise_plan.map((d:any)=><div key={d.day} className="day-row"><span className="day-badge">Day {d.day}</span><span className="day-activity">{d.activities.join(', ')}</span><b className="day-cost">{money(d.estimated_cost)}</b></div>)}</Card>}
            {result.nearby_venues?.length>0 && <Card style={{padding:18,marginTop:12}}><p className="card-label">NEARBY VENUES</p><div className="near-places-grid" style={{marginTop:10}}>{result.nearby_venues.map((v:any,i:number)=><PlaceCard key={i} place={v} icon="🎭"/>)}</div></Card>}
            <Card style={{padding:16,marginTop:12}}><p className="card-label">TIPS</p><ul className="tips-list">{result.tips?.map((t:string,i:number)=><li key={i}>{t}</li>)}</ul></Card>
          </>
        ) : (
          <div className="tg-placeholder"><div style={{fontSize:48,marginBottom:12}}>🎭</div><h3>Plan your activities</h3><p>Select a travel style and budget for personalised recommendations.</p></div>
        )}
      </div>
    </div>
  );
}

/* ─── AI Travel Chat ─────────────────────────────────────────────────────── */

function AITravelChat({ loc }: { loc: Loc|null }) {
  const { toast } = useToast();
  const [msgs, setMsgs] = useState<{role:'user'|'bot';text:string;data?:any;id:number}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [destination, setDestination] = useState('');
  const [budget, setBudget] = useState(10000);
  const [days, setDays] = useState(3);
  const [interest, setInterest] = useState('Family');
  const bottomRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[msgs]);

  async function ask(q: string) {
    const question=q.trim(); if(!question||loading) return;
    setInput('');
    const uid=++idRef.current; setMsgs(m=>[...m,{role:'user',text:question,id:uid}]);
    const tid=++idRef.current; setMsgs(m=>[...m,{role:'bot',text:'…',id:tid}]);
    setLoading(true);
    try {
      const res=await travelPost('/travel/guide',{question,lat:loc?.lat??null,lon:loc?.lon??null,destination,budget,days,interest});
      setMsgs(m=>m.map(msg=>msg.id===tid?{...msg,text:res.answer,data:res}:msg));
    } catch(e) {
      setMsgs(m=>m.map(msg=>msg.id===tid?{...msg,text:e instanceof Error?e.message:'Failed'}:msg));
      toast('Guide failed','error');
    } finally { setLoading(false); }
  }

  return (
    <div className="tg-chat-layout">
      <Card className="tg-config-panel">
        <p className="card-label">TRIP CONTEXT</p>
        <div className="field"><label>Destination</label><input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Goa, Manali…"/></div>
        <div className="field"><label>Budget (₹)</label><input type="number" value={budget} min={500} onChange={e=>setBudget(Number(e.target.value))}/></div>
        <div className="field"><label>Days</label><input type="number" value={days} min={1} max={30} onChange={e=>setDays(Number(e.target.value))}/></div>
        <div className="field"><label>Interest</label><select value={interest} onChange={e=>setInterest(e.target.value)}>{INTERESTS.map(i=><option key={i}>{i}</option>)}</select></div>
        <p className="card-label" style={{marginTop:12}}>QUICK PROMPTS</p>
        <div className="tg-prompts">{GUIDE_PROMPTS.map(p=><button key={p} className="tg-prompt-chip" onClick={()=>ask(p)}>{p}</button>)}</div>
      </Card>
      <div className="tg-chat-area-wrap">
        <div className="tg-chat-area">
          {msgs.length===0 && (
            <div className="tg-chat-empty">
              <div className="tg-bot-icon">🤖</div>
              <h3>Your AI Travel Guide</h3>
              <p>Ask anything — attractions, hotels, food, itineraries, budget tips, hidden gems.</p>
              {!loc && <div className="loc-hint">📍 Click "Use my location" for real nearby results</div>}
            </div>
          )}
          {msgs.map(msg=>(
            <div key={msg.id} className={`tg-msg tg-msg-${msg.role}`}>
              {msg.role==='bot' && <span className="tg-av">🤖</span>}
              <div className="tg-bubble">
                {msg.text==='…'
                  ? <div className="typing-indicator"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
                  : <><MarkdownP text={msg.text}/>{msg.data?.nearby_data&&<NearbyInlineCards data={msg.data.nearby_data}/>}{msg.data?.suggestions?.length>0&&<div className="tg-suggestion-chips">{msg.data.suggestions.map((s:string)=><button key={s} className="tg-sug-chip" onClick={()=>ask(s)}>{s}</button>)}</div>}</>
                }
              </div>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
        <div className="tg-input-bar">
          <input className="tg-input" placeholder="Ask about attractions, hotels, food, activities…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(input);}}} disabled={loading}/>
          <button className="send-btn" onClick={()=>ask(input)} disabled={loading||!input.trim()}><Send size={17}/></button>
        </div>
        <small className="chat-disclaimer">Travel suggestions are AI-generated. Verify before booking.</small>
      </div>
    </div>
  );
}

/* ─── Nearby Explorer ────────────────────────────────────────────────────── */

function NearbyExplorer({ loc }: { loc: Loc|null }) {
  const { toast } = useToast();
  const [category, setCategory] = useState('tourist_attractions');
  const [radius, setRadius] = useState(3000);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!loc) { toast('Enable location first','error'); return; }
    setLoading(true);
    try { setResult(await travelPost('/travel/nearby',{lat:loc.lat,lon:loc.lon,category,radius_m:radius})); }
    catch(e) { toast(e instanceof Error?e.message:'Failed','error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="tg-nearby-layout">
      <Card className="tg-config-panel">
        <p className="card-label">WHAT TO FIND</p>
        <div className="near-cat-grid">{NEAR_CATS.map(c=><button key={c.id} className={`near-cat-btn${category===c.id?' active':''}`} onClick={()=>setCategory(c.id)}><span>{c.icon}</span>{c.label}</button>)}</div>
        <div className="field" style={{marginTop:14}}>
          <label>Radius</label>
          <select value={radius} onChange={e=>setRadius(Number(e.target.value))}>
            <option value={500}>500 m</option><option value={1000}>1 km</option>
            <option value={2000}>2 km</option><option value={3000}>3 km</option>
            <option value={5000}>5 km</option><option value={10000}>10 km</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={search} disabled={loading||!loc} style={{marginTop:8}}>
          {loading ? <><Loader2 size={14} className="spin"/>Searching…</> : <><Search size={14}/>Find Nearby</>}
        </button>
        {!loc && <p className="loc-hint">📍 Enable location to search</p>}
      </Card>
      <div className="tg-results">
        {result ? (
          <>
            <div className="tg-results-header">
              <b>{result.icon} {result.label}</b>
              <span>{result.count} places within {radius>=1000?`${radius/1000} km`:`${radius} m`}</span>
              <a href={result.maps_area_url} target="_blank" rel="noopener noreferrer" className="maps-link">Open in Maps →</a>
            </div>
            {result.places.length===0
              ? <Card style={{padding:24,textAlign:'center'}}><p style={{color:'var(--text-2)'}}>No {result.label?.toLowerCase()} found. Try a wider radius.</p></Card>
              : <div className="near-places-grid">{result.places.map((p:any,i:number)=><PlaceCard key={i} place={p}/>)}</div>}
          </>
        ) : (
          <div className="tg-placeholder"><div style={{fontSize:48,marginBottom:12}}>📍</div><h3>Select a category and search</h3><p>Enable your location to discover real nearby places.</p></div>
        )}
      </div>
    </div>
  );
}

/* ─── Root export ────────────────────────────────────────────────────────── */

export default function TravelGuide() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TGTab>('guide');
  const [loc, setLoc] = useState<Loc|null>(null);
  const [locLoading, setLocLoading] = useState(false);

  function getLocation() {
    if (!navigator.geolocation) { toast('Geolocation not supported','error'); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{setLoc({lat:pos.coords.latitude,lon:pos.coords.longitude});setLocLoading(false);toast('Location detected!','success');},
      ()=>{setLocLoading(false);toast('Location denied.','error');},
      {timeout:10000},
    );
  }

  return (
    <>
      <div className="top">
        <div><p className="page-label">AI TRAVEL COPILOT</p><h1>Travel Guide</h1><em>Nearby places, hotels, food, activities — powered by real map data.</em></div>
        <button className="btn btn-primary" onClick={getLocation} disabled={locLoading}>
          {locLoading ? <><Loader2 size={14} className="spin"/>Detecting…</> : <><Navigation size={14}/>Use my location</>}
        </button>
      </div>
      {loc && <div className="loc-banner"><MapPin size={13}/> {loc.lat.toFixed(4)}, {loc.lon.toFixed(4)}<a href={`https://www.google.com/maps?q=${loc.lat},${loc.lon}`} target="_blank" rel="noopener noreferrer">Open in Maps →</a></div>}
      <div className="report-tabs">
        {([['guide','🤖','AI Travel Guide'],['nearby','📍','Nearby Places'],['hotels','🏨','Hotels'],['activities','🎭','Activities']] as [TGTab,string,string][]).map(([id,icon,label])=>(
          <button key={id} className={`tab-btn${tab===id?' active':''}`} onClick={()=>setTab(id)}>{icon} {label}</button>
        ))}
      </div>
      {tab==='guide'      && <AITravelChat      loc={loc}/>}
      {tab==='nearby'     && <NearbyExplorer    loc={loc}/>}
      {tab==='hotels'     && <HotelFinder       loc={loc}/>}
      {tab==='activities' && <ActivityExplorer  loc={loc}/>}
    </>
  );
}
