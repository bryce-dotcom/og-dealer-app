import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

export default function AIAssistant({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey there! OG Arnie here. What can I help you with today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const { inventory, employees, bhphLoans, deals, dealer } = useStore();

  const speechSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (speechSupported) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const buildContext = () => ({
    dealer_name: dealer?.dealer_name || 'Unknown',
    inventory_summary: {
      total: inventory.length,
      for_sale: inventory.filter(v => v.status === 'For Sale').length,
      in_stock: inventory.filter(v => v.status === 'In Stock').length,
      sold: inventory.filter(v => v.status === 'Sold').length,
      bhph: inventory.filter(v => v.status === 'BHPH').length,
    },
    recent_inventory: inventory.slice(0, 10).map(v => ({
      year: v.year, make: v.make, model: v.model, 
      price: v.sale_price, status: v.status, miles: v.miles || v.mileage
    })),
    team: employees.filter(e => e.active).map(e => ({ name: e.name, roles: e.roles })),
    bhph_loans: bhphLoans.map(l => ({
      customer: l.customer_name, balance: l.current_balance, 
      monthly: l.monthly_payment, status: l.status
    })),
    deals_count: deals.length,
    recent_deals: deals.slice(0, 5).map(d => ({
      customer: d.purchaser_name, price: d.price, date: d.date_of_sale
    }))
  });

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('og-arnie-chat', {
        body: { message: userMessage, context: buildContext() }
      });

      if (error) throw error;

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply || "Sorry, couldn't get a response." 
      }]);
    } catch (err) {
      console.error('AI Error:', err);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "Having trouble connecting. Check your internet and try again." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickQueries = [
    { label: '📊 Inventory Stats', query: 'Give me a quick inventory summary' },
    { label: '💰 BHPH Status', query: 'How are my BHPH loans doing?' },
    { label: '👥 Team', query: 'Who is on my team?' },
    { label: '🚗 For Sale', query: 'What cars do I have for sale?' }
  ];

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '500px',
        height: '600px',
        maxHeight: '80vh',
        backgroundColor: '#18181b',
        borderRadius: '20px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #27272a'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <img src="/og-arnie.png" alt="OG Arnie" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '2px solid #f97316',
            objectFit: 'cover'
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', color: '#fff', fontSize: '16px' }}>OG Arnie</div>
            <div style={{ fontSize: '12px', color: '#71717a' }}>AI Assistant • {dealer?.dealer_name}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            fontSize: '24px',
            lineHeight: 1
          }}>×</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px'
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '16px',
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <div style={{
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: msg.role === 'user' ? '#f97316' : '#27272a',
                color: '#fff',
                fontSize: '14px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: '4px', padding: '12px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: '#f97316',
                  animation: `bounce 1s infinite ${i * 0.2}s`
                }} />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Queries */}
        <div style={{
          padding: '0 20px 12px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          {quickQueries.map((q, i) => (
            <button key={i} onClick={() => { setInput(q.query); inputRef.current?.focus(); }} style={{
              padding: '8px 12px',
              borderRadius: '20px',
              border: '1px solid #3f3f46',
              backgroundColor: 'transparent',
              color: '#a1a1aa',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px 20px',
          borderTop: '1px solid #27272a',
          backgroundColor: '#18181b'
        }}>
          {isListening && (
            <div style={{
              marginBottom: '12px',
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#ef4444',
              fontSize: '13px'
            }}>
              <span style={{ 
                width: '8px', height: '8px', borderRadius: '50%', 
                backgroundColor: '#ef4444', animation: 'pulse 1s infinite'
              }} />
              Listening... speak now
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask OG Arnie anything..."
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '14px',
                border: '1px solid #3f3f46',
                backgroundColor: '#09090b',
                color: '#fff',
                fontSize: '15px',
                outline: 'none'
              }}
            />
            
            {speechSupported && (
              <button onClick={toggleListening} style={{
                width: '50px',
                height: '50px',
                borderRadius: '14px',
                border: 'none',
                backgroundColor: isListening ? '#ef4444' : '#27272a',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}>
                {isListening ? <MicOffIcon /> : <MicIcon />}
              </button>
            )}
            
            <button onClick={handleSend} disabled={loading || !input.trim()} style={{
              width: '50px',
              height: '50px',
              borderRadius: '14px',
              border: 'none',
              backgroundColor: input.trim() ? '#f97316' : '#3f3f46',
              color: '#fff',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>
    </div>
  );
}