export interface User {
  id: number;
  name: string;
  email: string;
  dark_mode: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Transaction {
  id: number;
  user_id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
  transaction_type: 'income' | 'expense';
  balance: number | null;
  source: string;
  notes: string | null;
}

export interface TransactionPage {
  total: number;
  page: number;
  page_size: number;
  items: Transaction[];
}

export interface DashboardData {
  income: number;
  expense: number;
  savings: number;
  savings_rate: number;
  health_score: number;
  categories: Record<string, number>;
  monthly_trend: Record<string, { income: number; expense: number }>;
  recent_transactions: Transaction[];
  recent_uploads: UploadRecord[];
  insights: string[];
}

export interface UploadRecord {
  id: number;
  filename: string;
  transaction_count: number;
  uploaded_at: string;
  status: string;
}

export interface ChatMessage {
  id: number;
  question: string;
  answer: string;
  created_at: string;
}

export type Page =
  | 'dashboard'
  | 'transactions'
  | 'chat'
  | 'settings'
  | 'upload'
  | 'tools'
  | 'travel'
  | 'khatabook';
