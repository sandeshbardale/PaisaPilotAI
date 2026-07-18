import { BrainCircuit, ChevronRight, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { chatApi } from '../api';
import { useToast } from '../Toast';
import type { ChatMessage } from '../types';

const PROMPTS = [
  'Where is my money leaking?',
  'How can I save more this month?',
  'What is my biggest expense category?',
  'Give me a budget plan',
];

export default function Chat() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; text: string; id: number }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  let msgId = useRef(0);

  // Load chat history on mount
  useEffect(() => {
    chatApi
      .history()
      .then((history: ChatMessage[]) => {
        const loaded = history.flatMap((h) => [
          { role: 'user' as const, text: h.question, id: ++msgId.current },
          { role: 'bot' as const, text: h.answer, id: ++msgId.current },
        ]);
        setMessages(loaded);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q, id: ++msgId.current }]);
    setLoading(true);

    // Typing indicator
    const typingId = ++msgId.current;
    setMessages((m) => [...m, { role: 'bot', text: '…', id: typingId }]);

    try {
      const res = await chatApi.ask(q);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === typingId ? { ...msg, text: res.answer } : msg
        )
      );
    } catch (e) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === typingId
            ? { ...msg, text: e instanceof Error ? e.message : 'Something went wrong. Please try again.' }
            : msg
        )
      );
      toast('Chat request failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const isEmpty = messages.length === 0 && historyLoaded;

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="top">
        <div>
          <p className="page-label">✦ PAISAPILOT INTELLIGENCE</p>
          <h1>AI Financial Assistant</h1>
          <em>Ask anything about your money — grounded in your real data.</em>
        </div>
      </div>

      {/* Messages area */}
      <div className="chat-area">
        {!historyLoaded && (
          <div className="chat-loading">
            <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
          </div>
        )}

        {isEmpty && (
          <div className="chat-empty">
            <div className="chat-bot-icon"><BrainCircuit size={28} /></div>
            <h2>Ask anything about your money.</h2>
            <p>I've reviewed your transactions and I'm ready to help you understand, optimise, and grow your finances.</p>
            <div className="prompt-grid">
              {PROMPTS.map((p) => (
                <button key={p} className="prompt-chip" onClick={() => void send(p)}>
                  ✦ {p} <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg ${msg.role}`}>
            {msg.role === 'bot' && (
              <div className="bot-av"><BrainCircuit size={14} /></div>
            )}
            <div className="msg-bubble">
              {msg.text === '…' ? (
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              ) : (
                <MarkdownText text={msg.text} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Prompt suggestions if no messages yet */}
      {!isEmpty && messages.length > 0 && !loading && (
        <div className="prompt-row">
          {PROMPTS.slice(0, 2).map((p) => (
            <button key={p} className="prompt-mini" onClick={() => void send(p)}>{p}</button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="chat-input-bar">
        <textarea
          className="chat-input"
          placeholder="Ask about your spending, savings, or budget…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={loading}
        />
        <button
          className={`send-btn${loading ? ' loading' : ''}`}
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
      <small className="chat-disclaimer">
        PaisaPilot provides educational insights only — not regulated financial advice.
      </small>
    </div>
  );
}

// Simple markdown renderer for **bold** and newlines
function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part.split('\n').map((line, j) => (
          <span key={`${i}-${j}`}>
            {line}
            {j < part.split('\n').length - 1 && <br />}
          </span>
        ));
      })}
    </p>
  );
}
