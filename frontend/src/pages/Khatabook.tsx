import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, Edit2, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE, getToken } from '../api';
import { ConfirmDialog, money } from '../components/UI';
import { useToast } from '../Toast';

async function kbFetch(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

interface Party {
  id: number; name: string; phone?: string; note?: string;
  balance: number; balance_label: string;
  balance_type: 'receivable' | 'payable' | 'settled';
}
interface Entry {
  id: number; party_id: number; entry_type: 'gave' | 'got';
  amount: number; description?: string; date: string; settled: boolean;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Khatabook() {
  const { toast } = useToast();
  const [parties, setParties] = useState<Party[]>([]);
  const [summary, setSummary] = useState<{ total_receivable: number; total_payable: number; net: number } | null>(null);
  const [selected, setSelected] = useState<Party | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddParty, setShowAddParty] = useState(false);
  const [editParty, setEditParty]   = useState<Party | null>(null);
  const [deleteParty, setDeleteParty] = useState<Party | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<Entry | null>(null);
  const [entryModal, setEntryModal] = useState<'gave' | 'got' | null>(null);

  async function loadParties() {
    setLoading(true);
    try {
      const r = await kbFetch('/khatabook/parties');
      setParties(r.parties);
      setSummary(r.summary);
    } catch (e) { toast(e instanceof Error ? e.message : 'Load failed', 'error'); }
    finally { setLoading(false); }
  }

  async function openParty(p: Party) {
    setSelected(p);
    try {
      const r = await kbFetch(`/khatabook/parties/${p.id}/entries`);
      setEntries(r.entries);
      setSelected(r.party);
      setParties(ps => ps.map(x => x.id === p.id ? r.party : x));
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  async function settleEntry(e: Entry) {
    try {
      await kbFetch(`/khatabook/entries/${e.id}/settle`, 'PATCH');
      toast('Entry marked settled', 'success');
      if (selected) openParty(selected);
      loadParties();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  async function deleteEntryConfirmed() {
    if (!deleteEntry) return;
    try {
      await kbFetch(`/khatabook/entries/${deleteEntry.id}`, 'DELETE');
      toast('Entry deleted', 'success');
      setDeleteEntry(null);
      if (selected) openParty(selected);
      loadParties();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  async function deletePartyConfirmed() {
    if (!deleteParty) return;
    try {
      await kbFetch(`/khatabook/parties/${deleteParty.id}`, 'DELETE');
      toast('Party deleted', 'success');
      setDeleteParty(null);
      if (selected?.id === deleteParty.id) { setSelected(null); setEntries([]); }
      loadParties();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  async function settleAll() {
    if (!selected) return;
    try {
      const r = await kbFetch(`/khatabook/parties/${selected.id}/settle-all`, 'PATCH');
      toast(r.message, 'success');
      openParty(selected);
      loadParties();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
  }

  useEffect(() => { loadParties(); }, []);

  // ── VIEW: Party ledger (after selecting a party) ──────────────────────────
  if (selected) {
    const pending = entries.filter(e => !e.settled);
    const settled = entries.filter(e => e.settled);

    return (
      <>
        {/* Back + header */}
        <div className="kb-detail-header">
          <button className="kb-back-btn" onClick={() => { setSelected(null); setEntries([]); }}>
            <ChevronLeft size={18} /> Back
          </button>
          <div className="kb-detail-name">
            <div className="kb-party-av-lg">{selected.name[0].toUpperCase()}</div>
            <div>
              <h2>{selected.name}</h2>
              {selected.phone && <small>{selected.phone}</small>}
            </div>
          </div>
          {selected.balance !== 0 && (
            <button className="btn btn-ghost kb-settle-all-btn" onClick={settleAll}>✓ Settle All</button>
          )}
        </div>

        {/* Balance banner */}
        <div className={`kb-balance-banner kb-banner-${selected.balance_type}`}>
          <div className="kb-banner-left">
            <span className="kb-banner-icon">
              {selected.balance_type === 'receivable' ? '💸' : selected.balance_type === 'payable' ? '💳' : '✅'}
            </span>
            <div>
              <b className="kb-banner-amount">{money(Math.abs(selected.balance))}</b>
              <p className="kb-banner-label">{selected.balance_label}</p>
            </div>
          </div>
        </div>

        {/* ── GIVE / GET BUTTONS — always visible ── */}
        <div className="kb-action-btns">
          <button className="kb-action-btn kb-give-btn" onClick={() => setEntryModal('gave')}>
            <ArrowUpCircle size={32} />
            <div>
              <b>You Gave Money</b>
              <small>{selected.name} owes you — record a payment given</small>
            </div>
          </button>
          <button className="kb-action-btn kb-get-btn" onClick={() => setEntryModal('got')}>
            <ArrowDownCircle size={32} />
            <div>
              <b>You Got Money</b>
              <small>You owe {selected.name} — record a payment received</small>
            </div>
          </button>
        </div>

        {/* Pending entries */}
        {pending.length > 0 && (
          <div className="kb-entries-section">
            <p className="kb-section-label">PENDING ({pending.length})</p>
            {pending.map(e => (
              <EntryCard
                key={e.id} entry={e} partyName={selected.name}
                onSettle={() => settleEntry(e)}
                onDelete={() => setDeleteEntry(e)}
              />
            ))}
          </div>
        )}

        {/* Settled entries */}
        {settled.length > 0 && (
          <div className="kb-entries-section">
            <p className="kb-section-label">SETTLED ({settled.length})</p>
            {settled.map(e => (
              <EntryCard
                key={e.id} entry={e} partyName={selected.name}
                onSettle={() => settleEntry(e)}
                onDelete={() => setDeleteEntry(e)}
              />
            ))}
          </div>
        )}

        {entries.length === 0 && (
          <div className="kb-no-entries">
            <span style={{ fontSize: 44 }}>📋</span>
            <h3>No entries yet</h3>
            <p>Use the buttons above to record money given or received.</p>
          </div>
        )}

        {/* Modals */}
        {entryModal && (
          <EntryModal
            partyId={selected.id}
            partyName={selected.name}
            initialType={entryModal}
            onClose={() => setEntryModal(null)}
            onSaved={() => {
              setEntryModal(null);
              openParty(selected);
              loadParties();
              toast('Entry saved!', 'success');
            }}
          />
        )}
        {deleteEntry && (
          <ConfirmDialog
            message={`Delete this ₹${deleteEntry.amount.toLocaleString('en-IN')} entry? This cannot be undone.`}
            onConfirm={deleteEntryConfirmed}
            onCancel={() => setDeleteEntry(null)}
          />
        )}
      </>
    );
  }

  // ── VIEW: Party list ──────────────────────────────────────────────────────
  return (
    <>
      <div className="top">
        <div>
          <p className="page-label">LEDGER</p>
          <h1>Khatabook</h1>
          <em>Track who owes you and who you owe — your digital ledger.</em>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddParty(true)}>
          <Plus size={15} /> Add Party
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="kb-summary">
          <div className="kb-sum-card kb-sum-receive">
            <span className="kb-sum-icon">💸</span>
            <div>
              <p>You Will Receive</p>
              <b>{money(summary.total_receivable)}</b>
              <small>from {parties.filter(p => p.balance > 0).length} parties</small>
            </div>
          </div>
          <div className="kb-sum-card kb-sum-pay">
            <span className="kb-sum-icon">💳</span>
            <div>
              <p>You Will Pay</p>
              <b>{money(summary.total_payable)}</b>
              <small>to {parties.filter(p => p.balance < 0).length} parties</small>
            </div>
          </div>
          <div className="kb-sum-card kb-sum-net">
            <span className="kb-sum-icon">📊</span>
            <div>
              <p>Net Balance</p>
              <b style={{ color: summary.net >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {summary.net >= 0 ? '+' : '−'}{money(Math.abs(summary.net))}
              </b>
              <small>{summary.net >= 0 ? 'Net receivable' : 'Net payable'}</small>
            </div>
          </div>
        </div>
      )}

      {/* Party list */}
      {loading ? (
        <div className="kb-loading">Loading parties…</div>
      ) : parties.length === 0 ? (
        <div className="kb-empty-page">
          <span style={{ fontSize: 56 }}>📒</span>
          <h3>No parties yet</h3>
          <p>Add a person or business to start tracking money.</p>
          <button className="btn btn-primary" onClick={() => setShowAddParty(true)}>
            <Plus size={14} /> Add First Party
          </button>
        </div>
      ) : (
        <div className="kb-party-grid">
          {parties.map(p => (
            <div
              key={p.id}
              className={`kb-party-card kb-party-${p.balance_type}`}
              onClick={() => openParty(p)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && openParty(p)}
            >
              <div className="kb-party-card-left">
                <div className="kb-party-av">{p.name[0].toUpperCase()}</div>
                <div className="kb-party-card-info">
                  <b>{p.name}</b>
                  {p.phone && <small>{p.phone}</small>}
                  {p.note  && <em>{p.note}</em>}
                </div>
              </div>
              <div className="kb-party-card-right">
                <span className={`kb-party-balance kb-bal-${p.balance_type}`}>
                  {p.balance === 0
                    ? '✓ Settled'
                    : p.balance_type === 'receivable'
                      ? `+${money(p.balance)}`
                      : `−${money(Math.abs(p.balance))}`}
                </span>
                <small className={`kb-bal-label-${p.balance_type}`}>
                  {p.balance_type === 'receivable' ? 'will receive'
                    : p.balance_type === 'payable' ? 'will pay'
                    : 'settled'}
                </small>
                <div className="kb-party-card-actions" onClick={ev => ev.stopPropagation()}>
                  <button className="icon-btn" title="Edit" onClick={() => setEditParty(p)}>
                    <Edit2 size={13} />
                  </button>
                  <button className="icon-btn danger" title="Delete" onClick={() => setDeleteParty(p)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {(showAddParty || editParty) && (
        <PartyModal
          party={editParty ?? undefined}
          onClose={() => { setShowAddParty(false); setEditParty(null); }}
          onSaved={() => {
            setShowAddParty(false); setEditParty(null);
            loadParties();
            toast(editParty ? 'Party updated' : 'Party added', 'success');
          }}
        />
      )}
      {deleteParty && (
        <ConfirmDialog
          message={`Delete "${deleteParty.name}" and all entries? This cannot be undone.`}
          onConfirm={deletePartyConfirmed}
          onCancel={() => setDeleteParty(null)}
        />
      )}
    </>
  );
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

function EntryCard({ entry: e, partyName, onSettle, onDelete }: {
  entry: Entry; partyName: string; onSettle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`kb-entry-card kb-entry-${e.entry_type}${e.settled ? ' settled' : ''}`}>
      <div className={`kb-entry-indicator kb-ind-${e.entry_type}`}>
        {e.entry_type === 'gave' ? <ArrowUpCircle size={22} /> : <ArrowDownCircle size={22} />}
      </div>

      <div className="kb-entry-details">
        <div className="kb-entry-top">
          <span className={`kb-type-label kb-type-${e.entry_type}`}>
            {e.entry_type === 'gave' ? `💸 You gave to ${partyName}` : `💰 You received from ${partyName}`}
          </span>
          {e.settled && <span className="kb-settled-tag">✓ Settled</span>}
          {!e.settled && e.entry_type === 'gave' && <span className="kb-pending-tag kb-pending-receive">Pending — will receive</span>}
          {!e.settled && e.entry_type === 'got' && <span className="kb-pending-tag kb-pending-pay">Pending — will pay</span>}
        </div>
        {e.description && <p className="kb-entry-desc">{e.description}</p>}
        <small className="kb-entry-date">
          {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </small>
      </div>

      <div className="kb-entry-right">
        <b className={`kb-entry-amount ${e.entry_type === 'gave' ? 'kb-amt-gave' : 'kb-amt-got'}`}>
          {e.entry_type === 'gave' ? '+' : '−'}{money(e.amount)}
        </b>
        <div className="kb-entry-actions">
          {!e.settled && <button className="kb-settle-btn" onClick={onSettle}>✓ Settle</button>}
          <button className="icon-btn danger" onClick={onDelete}><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Party Modal ──────────────────────────────────────────────────────────────

function PartyModal({ party, onClose, onSaved }: {
  party?: Party; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName]   = useState(party?.name ?? '');
  const [phone, setPhone] = useState(party?.phone ?? '');
  const [note, setNote]   = useState(party?.note ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast('Name is required', 'error'); return; }
    setSaving(true);
    try {
      if (party) await kbFetch(`/khatabook/parties/${party.id}`, 'PATCH', { name, phone: phone || null, note: note || null });
      else await kbFetch('/khatabook/parties', 'POST', { name, phone: phone || null, note: note || null });
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={ev => ev.stopPropagation()}>
        <div className="modal-head">
          <h3>{party ? 'Edit Party' : 'Add New Party'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Rahul, ABC Shop, Maa…" autoFocus disabled={saving} />
          </div>
          <div className="field">
            <label>Phone <span className="optional">(optional)</span></label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" disabled={saving} />
          </div>
          <div className="field">
            <label>Note <span className="optional">(optional)</span></label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Neighbor, Supplier…" disabled={saving} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : party ? 'Update' : 'Add Party'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────

function EntryModal({ partyId, partyName, initialType, onClose, onSaved }: {
  partyId: number; partyName: string;
  initialType: 'gave' | 'got';
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType]   = useState<'gave' | 'got'>(initialType);
  const [amount, setAmount] = useState('');
  const [desc, setDesc]   = useState('');
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = Number(amount);
    if (!num || num <= 0) { toast('Enter a valid amount', 'error'); return; }
    setSaving(true);
    try {
      await kbFetch('/khatabook/entries', 'POST', {
        party_id: partyId,
        entry_type: type,
        amount: num,
        description: desc.trim() || null,
        date: new Date(date).toISOString(),
      });
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'error'); }
    finally { setSaving(false); }
  }

  const isGave = type === 'gave';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={ev => ev.stopPropagation()}>
        <div className="modal-head">
          <h3>{isGave ? '💸 You Gave Money' : '💰 You Got Money'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body">

          {/* Type toggle */}
          <div className="kb-type-toggle">
            <button
              className={`kb-toggle-btn kb-toggle-gave${isGave ? ' active' : ''}`}
              onClick={() => setType('gave')}
            >
              <ArrowUpCircle size={18} /> You Gave
            </button>
            <button
              className={`kb-toggle-btn kb-toggle-got${!isGave ? ' active' : ''}`}
              onClick={() => setType('got')}
            >
              <ArrowDownCircle size={18} /> You Got
            </button>
          </div>

          {/* Explanation */}
          <div className={`kb-entry-explain ${isGave ? 'explain-gave' : 'explain-got'}`}>
            {isGave
              ? `💸 You gave money to ${partyName}. They now owe you.`
              : `💰 You received money from ${partyName}. You now owe them.`}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Amount (₹) *</label>
              <input
                type="number" min="1" step="1" autoFocus
                placeholder="Enter amount…"
                value={amount} onChange={e => setAmount(e.target.value)}
                disabled={saving}
                style={{ fontSize: 20, fontWeight: 700, height: 52 }}
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input
                type="date" value={date}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="field">
            <label>Reason / Description <span className="optional">(optional)</span></label>
            <input
              placeholder="e.g. Lent for groceries, received rent, paid bill…"
              value={desc} onChange={e => setDesc(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className={`btn ${isGave ? 'btn-danger' : 'btn-primary'}`}
            onClick={save} disabled={saving || !amount}
          >
            {saving ? 'Saving…' : isGave ? '↑ Save — You Gave' : '↓ Save — You Got'}
          </button>
        </div>
      </div>
    </div>
  );
}
