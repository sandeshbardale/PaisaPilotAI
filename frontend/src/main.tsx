import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './AuthContext';
import { ToastProvider } from './Toast';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <AuthProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </AuthProvider>
);
