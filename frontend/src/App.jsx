import React, { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';

const API_URL = 'http://localhost:3001';

// ── Helpers ────────────────────────────────────────────────────
function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── TypingDots ─────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="typing-dots">
      <span /><span /><span />
    </div>
  );
}

// ── SourcesPanel ───────────────────────────────────────────────
function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div>
      <button
        className={`sources-toggle ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="chevron">›</span>
        {sources.length} source{sources.length !== 1 ? 's' : ''} retrieved
      </button>
      {open && (
        <div className="sources-list">
          {sources.map((s, i) => (
            <div className="source-card" key={i}>
              <div className="source-score">Relevance: {s.score}</div>
              {s.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`message-row ${isUser ? 'user' : 'bot'}`}>
      <div className={`avatar ${isUser ? 'user' : 'bot'}`}>
        {isUser ? '👤' : '🕌'}
      </div>
      <div className="bubble-wrapper">
        <div className={`bubble ${isUser ? 'user' : 'bot'}`}>
          {msg.typing ? <TypingDots /> : msg.content}
        </div>
        {!msg.typing && msg.status && (
          <div className="status-message">
            <div className="status-spinner" />
            {msg.status}
          </div>
        )}
        {!msg.typing && !msg.status && (
          <div className="bubble-timestamp">{msg.time}</div>
        )}
        {!isUser && msg.sources && (
          <SourcesPanel sources={msg.sources} />
        )}
      </div>
    </div>
  );
}

// ── WelcomeCard ────────────────────────────────────────────────
const SUGGESTIONS = [
  'Where is Dar Chaaben located?',
  'What is the history of Dar Chaaben?',
  'What is the economy of Dar Chaaben?',
  'What are the cultural traditions?',
  'ما هو دار شعبان الفهري؟',
];

function WelcomeCard({ onSuggest }) {
  return (
    <div className="welcome-card">
      <span className="welcome-emoji">🕌</span>
      <h1 className="welcome-title">Dar Chaaben Assistant</h1>
      <p className="welcome-subtitle">مرحباً بك في مساعد دار شعبان</p>
      <p className="welcome-desc">
        Ask me anything about <strong>Dar Chaaben El Fehri</strong> — its history,
        geography, culture, economy, or daily life. I'm powered by local AI and a
        curated knowledge base.
      </p>
      <div className="suggestion-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => onSuggest(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── InputBar ───────────────────────────────────────────────────
function InputBar({ onSend, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="input-area">
      <div className="input-wrapper">
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={text}
          rows={1}
          placeholder="Ask about Dar Chaaben… (Enter to send, Shift+Enter for newline)"
          onChange={(e) => { setText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
          id="send-button"
        >
          ➤
        </button>
      </div>
      <p className="input-hint">Powered by Ollama · 100% local · No data leaves your machine</p>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (question) => {
    if (isStreaming) return;
    setError(null);

    // Add user message
    const userMsg = { id: Date.now(), role: 'user', content: question, time: timestamp() };
    // Add placeholder bot message (typing)
    const botId = Date.now() + 1;
    const botPlaceholder = { id: botId, role: 'bot', content: '', typing: true, status: 'Searching knowledge base...', time: timestamp() };

    setMessages(prev => [...prev, userMsg, botPlaceholder]);
    setIsStreaming(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let sources = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const raw = decoder.decode(value, { stream: true });
        const lines = raw.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());

            if (event.type === 'status') {
              setMessages(prev => prev.map(m =>
                m.id === botId ? { ...m, typing: true, status: event.message } : m
              ));
            } else if (event.type === 'sources') {
              sources = event.sources;
            } else if (event.type === 'token') {
              accumulatedText += event.token;
              setMessages(prev => prev.map(m =>
                m.id === botId
                  ? { ...m, typing: false, status: null, content: accumulatedText, sources }
                  : m
              ));
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === botId
                  ? { ...m, typing: false, status: null, content: accumulatedText, sources, time: timestamp() }
                  : m
              ));
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            // skip malformed event lines
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== botId));
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="chat-header">
        <div className="header-icon">🕌</div>
        <div className="header-text">
          <div className="header-title">
            <span>دار شعبان</span> Dar Chaaben Assistant
          </div>
          <div className="header-subtitle">
            Cap Bon Peninsula · Nabeul Governorate · Tunisia
          </div>
        </div>
        <div className="header-status">
          <div className="status-dot" />
          Local AI Active
        </div>
      </header>

      {/* Messages */}
      <main className="chat-window" id="chat-window" role="log" aria-live="polite">
        {messages.length === 0 && (
          <WelcomeCard onSuggest={sendMessage} />
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {error && (
          <div className="error-banner" role="alert">
            ⚠️ {error}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <InputBar onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
