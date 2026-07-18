import { Edit2, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { txApi } from '../api';
import { Card, ConfirmDialog, EmptyState, categoryIcon, formatDate, money } from '../components/UI';
import { useToast } from '../Toast';
import type { Transaction } from '../types';

const CATEGORIES = [
  'Food & Dining', 'Transport', 'Shopping', 'Subscriptions',
  'Utilities', 'Health', 'Entertainment', 'Education', 'Investments', 'Income', 'Others',
];

const PAGE_SIZE = 20;

export default function Transactions() {
  const { toast } = useToast();
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterType, setFilterType] = useState('');

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function loadTx(pg = page) {
    setLoading(true);
    try {
      const res = await txApi.list({
        search: search || undefined,
        category: filterCat || undefined,
        transaction_type: filterType || undefined,
        page: pg,
        page_size: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      toast('Failed to load transactions', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTx(1); setPage(1); }, [filterCat, filterType]);

  // Debounced search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { void loadTx(1); setPage(1); }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  useEffect(() => { void loadTx(); }, [page]);

  async function handleDelete() {
    if (!deleteTx) return;
    try {
      await txApi.remove(deleteTx.id);
      toast('Transaction deleted', 'success');
      setDeleteTx(null);
      void loadTx();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      {/* Header */}
      <div className="top">
        <div>
          <p className="page-label">MONEY TIMELINE</p>
          <h1>Transactions</h1>
          <em>Every rupee you earn, spend, and save.</em>
        </div>
        <button className="btn-add" onClick={() => setShowAdd(true)}>
          <Plus size={17} />Add transaction
        </button>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="search-wrap">
          <Search size={14} />
          <input
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button className="clear-btn" onClick={() => setSearch('')}><X size={13} /></button>}
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        {(filterCat || filterType || search) && (
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setFilterCat(''); setFilterType(''); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <Card className="tx-table">
        <div className="tx-table-header">
          <span className="col-wide">Description</span>
          <span className="col-mid hide-sm">Category</span>
          <span className="col-mid hide-sm">Date</span>
          <span className="col-amt">Amount</span>
          <span className="col-act">Actions</span>
        </div>

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="tx-row">
              <div className="skeleton" style={{ height: 12, width: '55%' }} />
              <div className="skeleton hide-sm" style={{ height: 12, width: '80%' }} />
              <div className="skeleton hide-sm" style={{ height: 12, width: '70%' }} />
              <div className="skeleton" style={{ height: 12, width: 60 }} />
              <div style={{ width: 60 }} />
            </div>
          ))
        ) : items.length === 0 ? (
          <EmptyState
            icon="💸"
            title="No transactions found"
            description={search || filterCat || filterType ? 'Try different filters' : 'Add your first transaction to get started'}
            action={
              !search && !filterCat && !filterType ? (
                <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
                  <Plus size={15} /> Add transaction
                </button>
              ) : undefined
            }
          />
        ) : (
          items.map((t) => (
            <div key={t.id} className="tx-row">
              <div className="col-wide tx-desc">
                <i className="tx-icon">{categoryIcon(t.category, t.transaction_type)}</i>
                <div>
                  <b>{t.description}</b>
                  {t.notes && <small className="tx-note">{t.notes}</small>}
                </div>
              </div>
              <div className="col-mid hide-sm">
                <span className="cat-badge">{t.category}</span>
              </div>
              <div className="col-mid hide-sm tx-date">{formatDate(t.date)}</div>
              <div className={`col-amt ${t.transaction_type === 'income' ? 'income' : 'expense-amt'}`}>
                {t.transaction_type === 'income' ? '+' : '−'}{money(t.amount)}
              </div>
              <div className="col-act tx-actions">
                <button className="icon-btn" title="Edit" onClick={() => setEditTx(t)}>
                  <Edit2 size={14} />
                </button>
                <button className="icon-btn danger" title="Delete" onClick={() => setDeleteTx(t)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn btn-ghost">
            ← Prev
          </button>
          <span>Page {page} of {totalPages} · {total} total</span>
          <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="btn btn-ghost">
            Next →
          </button>
        </div>
      )}

      {/* Add/Edit modal */}
      {(showAdd || editTx) && (
        <TxModal
          tx={editTx ?? undefined}
          onClose={() => { setShowAdd(false); setEditTx(null); }}
          onSaved={() => { setShowAdd(false); setEditTx(null); void loadTx(); toast(editTx ? 'Transaction updated' : 'Transaction added', 'success'); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTx && (
        <ConfirmDialog
          message={`Delete "${deleteTx.description}" (${money(deleteTx.amount)})? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTx(null)}
        />
      )}
    </>
  );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

function TxModal({ tx, onClose, onSaved }: { tx?: Transaction; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];

  const [description, setDescription] = useState(tx?.description ?? '');
  const [category, setCategory] = useState(tx?.category ?? 'Others');
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
  const [txType, setTxType] = useState<'income' | 'expense'>(tx?.transaction_type ?? 'expense');
  const [date, setDate] = useState(tx ? tx.date.split('T')[0] : today);
  const [notes, setNotes] = useState(tx?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Description is required';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) e.amount = 'Enter a valid amount';
    if (!date) e.date = 'Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        description: description.trim(),
        category,
        amount: parseFloat(amount),
        transaction_type: txType,
        date: new Date(date).toISOString(),
        notes: notes.trim() || undefined,
      };
      if (tx) {
        await txApi.update(tx.id, payload);
      } else {
        await txApi.add(payload);
      }
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{tx ? 'Edit transaction' : 'Add transaction'}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Type toggle */}
          <div className="type-toggle">
            <button className={txType === 'expense' ? 'active' : ''} onClick={() => setTxType('expense')}>
              Expense
            </button>
            <button className={txType === 'income' ? 'active income-toggle' : ''} onClick={() => setTxType('income')}>
              Income
            </button>
          </div>

          <div className="field">
            <label>Description</label>
            <input
              placeholder="e.g. Swiggy order, Salary credit…"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setErrors((x) => ({ ...x, description: '' })); }}
              className={errors.description ? 'input-error' : ''}
            />
            {errors.description && <span className="field-error">{errors.description}</span>}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: '' })); }}
                className={errors.amount ? 'input-error' : ''}
              />
              {errors.amount && <span className="field-error">{errors.amount}</span>}
            </div>
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => { setDate(e.target.value); setErrors((x) => ({ ...x, date: '' })); }}
                className={errors.date ? 'input-error' : ''}
              />
              {errors.date && <span className="field-error">{errors.date}</span>}
            </div>
          </div>

          <div className="field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Notes <span className="optional">(optional)</span></label>
            <input
              placeholder="Any details about this transaction…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : tx ? 'Update' : 'Add transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
