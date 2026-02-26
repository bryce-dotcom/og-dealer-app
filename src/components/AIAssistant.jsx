import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { CreditService } from '../lib/creditService';

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

const SpeakerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>
);

export default function AIAssistant({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Ay, what's good? O.G. Arnie here. You need somethin', I got you. What's the word?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const { inventory, employees, bhphLoans, deals, dealer } = useStore();

  const speechSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Load available voices for text-to-speech
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
      // Find a deep, gruff voice for gangster grandpa Arnie
      const preferredVoice = availableVoices.find(v => 
        v.name.includes('Google UK English Male') ||
        v.name.includes('Daniel') ||
        v.name.includes('Google US English Male')
      ) || availableVoices.find(v => 
        v.name.includes('Male') || 
        v.name.includes('David') || 
        v.name.includes('James') ||
        v.name.includes('Alex')
      ) || availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
      setSelectedVoice(preferredVoice);
    };
    
    loadVoices();
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => { 
      if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.onvoiceschanged = null; 
      }
    };
  }, []);

  // Speech recognition setup
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
        // Auto-send in voice mode
        if (voiceMode) {
          setTimeout(() => {
            handleSendWithText(transcript);
          }, 300);
        }
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [voiceMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Stop speaking when modal closes
  useEffect(() => {
    if (!isOpen && isSpeaking) {
      stopSpeaking();
    }
  }, [isOpen]);

  const toggleListening = () => {
    if (isSpeaking) {
      stopSpeaking();
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text) => {
    if (!voiceMode || !selectedVoice) return;
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.rate = 0.9; // Slightly slower, deliberate like a wise old gangster
    utterance.pitch = 0.75; // Deep, gruff gangster grandpa voice
    utterance.volume = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
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

  // Local fallback - gangster grandpa Arnie responses
  const generateLocalResponse = (query) => {
    const q = query.toLowerCase();
    const fmt = (n) => (n || 0).toLocaleString();
    
    // Inventory
    if (q.includes('inventory') || q.includes('car') || q.includes('vehicle') || q.includes('stock') || q.includes('lot')) {
      const inStock = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale');
      const totalValue = inStock.reduce((sum, v) => sum + (parseFloat(v.purchase_price) || 0), 0);
      
      if (q.includes('how many') || q.includes('count')) {
        return `Listen, we got ${inStock.length} rides on the lot. That's $${fmt(totalValue)} in iron sittin' there. Capisce?`;
      }
      if (q.includes('value') || q.includes('worth')) {
        return `The inventory's worth about $${fmt(totalValue)}. That's ${inStock.length} vehicles, family. Good metal.`;
      }
      if (q.includes('list') || q.includes('show') || q.includes('what')) {
        const list = inStock.slice(0, 5).map(v => `${v.year} ${v.make} ${v.model}`).join(', ');
        return `Here's what we're workin' with: ${list}${inStock.length > 5 ? `, plus ${inStock.length - 5} more` : ''}. Solid rides, every one.`;
      }
      if (q.includes('for sale')) {
        const forSale = (inventory || []).filter(v => v.status === 'For Sale');
        return `We got ${forSale.length} cars marked for sale right now. Ready to move.`;
      }
      return `${inStock.length} vehicles on the lot, about $${fmt(totalValue)} worth. What else you need, family?`;
    }

    // Team
    if (q.includes('team') || q.includes('employee') || q.includes('staff') || q.includes('who') || q.includes('crew')) {
      const active = (employees || []).filter(e => e.active);
      if (active.length === 0) return "Ain't got nobody in the system yet. We gotta fix that.";
      const names = active.map(e => e.name).join(', ');
      return `The crew? ${active.length} soldiers: ${names}. Good people, all of 'em.`;
    }

    // BHPH
    if (q.includes('bhph') || q.includes('loan') || q.includes('owe') || q.includes('payment') || q.includes('financ')) {
      const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
      const totalOwed = activeLoans.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
      const monthly = activeLoans.reduce((sum, l) => sum + (parseFloat(l.monthly_payment) || 0), 0);
      
      if (activeLoans.length === 0) return "No BHPH deals active right now. Clean slate.";
      return `Got ${activeLoans.length} BHPH loans out there. People owe us $${fmt(totalOwed)}. That's $${fmt(monthly)} comin' in monthly. They better pay up.`;
    }

    // Deals
    if (q.includes('deal') || q.includes('sale') || q.includes('sold') || q.includes('sell')) {
      const allDeals = deals || [];
      const totalRevenue = allDeals.reduce((sum, d) => sum + (parseFloat(d.price) || 0), 0);
      if (allDeals.length === 0) return "No deals closed yet. We gotta move some metal.";
      return `${allDeals.length} deals done, $${fmt(totalRevenue)} in revenue. Keep that energy, family.`;
    }

    // Customers
    if (q.includes('customer') || q.includes('client') || q.includes('buyer')) {
      const count = (customers || []).length;
      return count > 0 ? `${count} customers in the book. That's ${count} relationships, family.` : "Customer list is empty. Gotta build that network.";
    }

    // Greetings
    if (q.includes('hello') || q.includes('hey') || q.includes('hi') || q.includes('what\'s up') || q.includes('yo')) {
      return "Ay, what's good? O.G. Arnie here. What you need?";
    }

    // Help
    if (q.includes('help') || q.includes('what can you')) {
      return "I know everything about the lot - inventory, BHPH loans, deals, the crew, customers. Just ask me straight up.";
    }

    // Summary
    if (q.includes('summary') || q.includes('overview') || q.includes('status')) {
      const inStock = (inventory || []).filter(v => v.status === 'In Stock' || v.status === 'For Sale');
      const activeLoans = (bhphLoans || []).filter(l => l.status === 'Active');
      const totalOwed = activeLoans.reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0);
      return `Alright, here's the rundown: ${inStock.length} cars on the lot, ${activeLoans.length} BHPH loans worth $${fmt(totalOwed)}, ${(deals || []).length} deals closed, ${(employees || []).filter(e => e.active).length} on the team. We're movin'.`;
    }

    // Default
    return "I hear you, but I ain't sure what you're askin'. Try inventory, BHPH, deals, team, or customers. I got all the numbers.";
  };

  const handleSendWithText = async (textToSend) => {
    if (!textToSend.trim() || loading) return;

    const userMessage = textToSend.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Check credits BEFORE operation
    const creditCheck = await CreditService.checkCredits(dealer.id, 'AI_ARNIE_QUERY');

    if (!creditCheck.success) {
      if (creditCheck.rate_limited) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⏱️ Yo, slow down! Rate limit hit. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`
        }]);
        return;
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ ' + (creditCheck.message || 'Unable to process query right now.')
      }]);
      return;
    }

    if (creditCheck.warning) {
      console.warn(creditCheck.warning);
    }

    setLoading(true);

    let reply;
    let isLocal = false;

    try {
      // Try the API first
      const { data, error } = await supabase.functions.invoke('og-arnie-chat', {
        body: { message: userMessage, context: buildContext() }
      });

      console.log('API Response:', data, 'Error:', error);

      if (error) throw error;
      reply = data?.reply;

      if (!reply) {
        console.log('No reply in data, falling back to local');
        throw new Error('No reply');
      }

      // Consume credits AFTER successful API response
      await CreditService.consumeCredits(
        dealer.id,
        'AI_ARNIE_QUERY',
        null,
        { query: userMessage, response_length: reply?.length, mode: 'api' }
      );
    } catch (err) {
      console.log('API unavailable:', err.message, '- using local fallback');
      isLocal = true;
    }

    // If no API reply, use local fallback
    if (!reply) {
      reply = generateLocalResponse(userMessage);
      isLocal = true;

      // Consume credits even for local fallback (still valuable)
      await CreditService.consumeCredits(
        dealer.id,
        'AI_ARNIE_QUERY',
        null,
        { query: userMessage, response_length: reply?.length, mode: 'local' }
      );
    }

    // Add indicator if using local mode (for debugging)
    if (isLocal) {
      reply = reply + "\n\n(Local mode - AI offline)";
    }

    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

    // Speak the response if voice mode is on (without the debug text)
    if (voiceMode) {
      const speakReply = reply.replace("\n\n(Local mode - AI offline)", "");
      setTimeout(() => speakText(speakReply), 100);
    }

    setLoading(false);
  };

  const handleSend = async () => {
    await handleSendWithText(input);
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
        height: '650px',
        maxHeight: '85vh',
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
          
          {/* Voice Mode Toggle */}
          <button 
            onClick={() => {
              if (voiceMode) stopSpeaking();
              setVoiceMode(!voiceMode);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '20px',
              border: voiceMode ? '2px solid #22c55e' : '1px solid #3f3f46',
              backgroundColor: voiceMode ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
              color: voiceMode ? '#22c55e' : '#71717a',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            title={voiceMode ? 'Voice mode ON - Arnie will speak' : 'Turn on voice mode'}
          >
            {voiceMode ? '🔊' : '🔇'} {voiceMode ? 'Voice ON' : 'Voice'}
          </button>
          
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            fontSize: '24px',
            lineHeight: 1
          }}>×</button>
        </div>

        {/* Voice Settings Bar (when voice mode is on) */}
        {voiceMode && (
          <div style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(34, 197, 94, 0.08)',
            borderBottom: '1px solid #27272a',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ color: '#71717a', fontSize: '12px', whiteSpace: 'nowrap' }}>Voice:</span>
            <select
              value={selectedVoice?.name || ''}
              onChange={(e) => setSelectedVoice(voices.find(v => v.name === e.target.value))}
              style={{
                flex: 1,
                padding: '6px 10px',
                backgroundColor: '#09090b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              {voices.filter(v => v.lang.startsWith('en')).map(v => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
            {isSpeaking && (
              <button 
                onClick={stopSpeaking}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                ⏹ Stop
              </button>
            )}
          </div>
        )}

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
                whiteSpace: 'pre-wrap',
                position: 'relative'
              }}>
                {msg.content}
                {/* Replay button for assistant messages when voice mode is on */}
                {msg.role === 'assistant' && voiceMode && i > 0 && (
                  <button
                    onClick={() => speakText(msg.content)}
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      padding: '4px 6px',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#a1a1aa',
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                    title="Replay this message"
                  >
                    <SpeakerIcon />
                  </button>
                )}
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
          {isSpeaking && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderRadius: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ animation: 'pulse 1s infinite' }}>🔊</span>
              <span style={{ color: '#22c55e', fontSize: '13px' }}>Arnie is speaking...</span>
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
            <button key={i} onClick={() => { 
              if (voiceMode) {
                handleSendWithText(q.query);
              } else {
                setInput(q.query); 
                inputRef.current?.focus(); 
              }
            }} style={{
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
              placeholder={voiceMode ? "Tap mic to talk or type..." : "Ask OG Arnie anything..."}
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
              <button onClick={toggleListening} disabled={isSpeaking} style={{
                width: '50px',
                height: '50px',
                borderRadius: '14px',
                border: 'none',
                backgroundColor: isListening ? '#ef4444' : (voiceMode ? '#22c55e' : '#27272a'),
                color: '#fff',
                cursor: isSpeaking ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                opacity: isSpeaking ? 0.5 : 1
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