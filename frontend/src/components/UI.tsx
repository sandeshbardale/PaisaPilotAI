import type { ReactNode } from 'react';

// ─── Card ────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <section className={`card ${className}`} style={style}>{children}</section>;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ height = 18, width = '100%', className = '' }: {
  height?: number;
  width?: string | number;
  className?: string;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton height={12} width="45%" />
        <Skeleton height={26} width="70%" />
        {Array.from({ length: lines - 2 }).map((_, i) => (
          <Skeleton key={i} height={12} width="90%" />
        ))}
      </div>
    </Card>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  danger = true,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal-msg">{message}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Money formatter ──────────────────────────────────────────────────────────

export function money(value: number): string {
  return `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// ─── Category icon ────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  'food & dining': '🍜',
  transport: '🚗',
  subscriptions: '🎬',
  shopping: '🛍️',
  utilities: '⚡',
  health: '💊',
  income: '✦',
  investments: '📈',
  education: '📚',
  entertainment: '🎮',
  others: '•',
};

export function categoryIcon(category: string, txType?: string): string {
  if (txType === 'income') return '✦';
  const key = category.toLowerCase();
  for (const [k, v] of Object.entries(ICONS)) {
    if (key.includes(k)) return v;
  }
  return '•';
}

// ─── Date formatter ───────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const day = 86400000;
  if (diff < day && d.getDate() === now.getDate()) return `Today, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  if (diff < 2 * day) return `Yesterday`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}
