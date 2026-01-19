import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function EmbedFindRig() {
  const { dealerId } = useParams();
  const [dealer, setDealer] = useState(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  // Conversation flow - AI asks these questions
  const questions = [
    { key: 'name', question: "Hey there! I'm here to help you find the perfect ride. What's your name?", placeholder: "Your name" },
    { key: 'phone', question: "Nice to meet you, {name}! What's the best number to reach you at?", placeholder: "Phone number" },
    { key: 'email', question: "Got it! And your email address?", placeholder: "Email address" },
    { key: 'type', question: "Perfect! Now let's find your rig. What type of vehicle are you looking for? Truck, SUV, sedan, or something else?", placeholder: "Truck, SUV, sedan..." },
    { key: 'make', question: "Any particular make you prefer? Like Ford, Toyota, Chevy... or are you open to anything?", placeholder: "Make or 'any'" },
    { key: 'year_range', question: "What year range works for you? Like '2018-2024' or just give me a minimum year.", placeholder: "2018-2024 or 2020+" },
    { key: 'max_price', question: "What's your budget? Give me a max price you're comfortable with.", placeholder: "$15,000" },
    { key: 'max_miles', question: "How about mileage? What's the most miles you'd be okay with?", placeholder: "100,000" },
    { key: 'notes', question: "Anything else I should know? Specific features, colors, must-haves?", placeholder: "4WD, leather seats, etc." }
  ];

  useEffect(() => {
    loadDealer();
    setupSpeechRecognition();
  }, [dealerId]);

  const loadDealer = async () => {
    if (!dealerId) return;
    const { data } = await supabase
      .from('dealer_settings')
      .select('*')
      .eq('id', dealerId)
      .single();
    setDealer(data);
  };

  const setupSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
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

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Voice input not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const getCurrentQuestion = () => {
    if (step >= questions.length) return null;
    let q = questions[step].question;
    // Replace placeholders with previous answers
    Object.keys(answers).forEach(key => {
      q = q.replace(`{${key}}`, answers[key]);
    });
    return q;
  };

  const handleNext = () => {
    if (!input.trim()) return;
    
    const currentKey = questions[step].key;
    setAnswers(prev => ({ ...prev, [currentKey]: input.trim() }));
    setInput('');
    
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      // All questions answered, submit
      submitRequest({ ...answers, [currentKey]: input.trim() });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleNext();
    }
  };

  const parseYearRange = (yearStr) => {
    const cleaned = yearStr.replace(/[^\d\-+]/g, '');
    if (cleaned.includes('-')) {
      const [min, max] = cleaned.split('-');
      return { year_min: parseInt(min) || null, year_max: parseInt(max) || null };
    } else if (cleaned.includes('+')) {
      return { year_min: parseInt(cleaned) || null, year_max: null };
    } else {
      const year = parseInt(cleaned);
      return { year_min: year || null, year_max: null };
    }
  };

  const parsePrice = (priceStr) => {
    const cleaned = priceStr.replace(/[^\d]/g, '');
    return parseInt(cleaned) || null;
  };

  const parseMiles = (milesStr) => {
    const cleaned = milesStr.replace(/[^\d]/g, '');
    return parseInt(cleaned) || null;
  };

  const submitRequest = async (data) => {
    setLoading(true);
    try {
      const yearRange = parseYearRange(data.year_range || '');
      
      // Create customer first
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          name: data.name,
          phone: data.phone,
          email: data.email,
          dealer_id: parseInt(dealerId)
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // Create vehicle request
      const { error: requestError } = await supabase
        .from('customer_vehicle_requests')
        .insert({
          customer_id: customer.id,
          dealer_id: parseInt(dealerId),
          year_min: yearRange.year_min,
          year_max: yearRange.year_max,
          make: data.make?.toLowerCase() === 'any' ? null : data.make,
          model: data.type, // Using type as model for now
          max_price: parsePrice(data.max_price),
          max_miles: parseMiles(data.max_miles),
          notes: data.notes,
          status: 'Looking'
        });

      if (requestError) throw requestError;

      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting:', err);
      alert('Something went wrong. Please try again or call us directly.');
    } finally {
      setLoading(false);
    }
  };

  // Get URL params for theming
  const urlParams = new URLSearchParams(window.location.search);
  const themeName = urlParams.get('theme') || 'dark';

  const themes = {
    dark: {
      bg: '#09090b',
      bgCard: '#18181b',
      border: '#27272a',
      text: '#ffffff',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      accent: '#f97316',
      accentHover: '#ea580c',
      micActive: '#ef4444',
      success: '#22c55e'
    },
    light: {
      bg: '#f4f4f5',
      bgCard: '#ffffff',
      border: '#e4e4e7',
      text: '#18181b',
      textSecondary: '#52525b',
      textMuted: '#71717a',
      accent: '#f97316',
      accentHover: '#ea580c',
      micActive: '#ef4444',
      success: '#22c55e'
    }
  };

  const theme = themes[themeName] || themes.dark;

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: theme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '500px',
          textAlign: 'center',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: theme.success + '20',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={theme.success} strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h2 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: '0 0 12px' }}>
            You're on the list, {answers.name}!
          </h2>
          <p style={{ color: theme.textSecondary, fontSize: '16px', margin: '0 0 24px', lineHeight: '1.6' }}>
            We're on the hunt for your perfect rig. We'll reach out as soon as we find something that matches what you're looking for.
          </p>
          {dealer?.phone && (
            <a 
              href={`tel:${dealer.phone}`}
              style={{
                display: 'inline-block',
                padding: '14px 28px',
                backgroundColor: theme.accent,
                color: '#fff',
                borderRadius: '12px',
                textDecoration: 'none',
                fontWeight: '600',
                fontSize: '15px'
              }}
            >
              Call Us: {dealer.phone}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '20px',
        padding: '32px',
        width: '100%',
        maxWidth: '500px',
        border: `1px solid ${theme.border}`
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {dealer?.logo_url && (
            <img 
              src={dealer.logo_url} 
              alt={dealer.dealer_name}
              style={{ height: '40px', marginBottom: '16px' }}
            />
          )}
          <h1 style={{ 
            color: theme.accent, 
            fontSize: '24px', 
            fontWeight: '700', 
            margin: '0 0 4px' 
          }}>
            Find Me a Rig
          </h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: 0 }}>
            {dealer?.dealer_name || 'Loading...'}
          </p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: '8px',
            fontSize: '12px',
            color: theme.textMuted
          }}>
            <span>Question {step + 1} of {questions.length}</span>
            <span>{Math.round(((step + 1) / questions.length) * 100)}%</span>
          </div>
          <div style={{ 
            height: '4px', 
            backgroundColor: theme.border, 
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${((step + 1) / questions.length) * 100}%`,
              height: '100%',
              backgroundColor: theme.accent,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Question */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{
            color: theme.text,
            fontSize: '18px',
            lineHeight: '1.5',
            margin: 0
          }}>
            {getCurrentQuestion()}
          </p>
        </div>

        {/* Input Area */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={questions[step]?.placeholder || 'Type your answer...'}
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: '12px',
              border: `2px solid ${input ? theme.accent : theme.border}`,
              backgroundColor: theme.bg,
              color: theme.text,
              fontSize: '16px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
          
          {/* Voice Button */}
          <button
            onClick={toggleListening}
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: isListening ? theme.micActive : theme.border,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isListening ? '#fff' : theme.textSecondary} strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        </div>

        {/* Listening Indicator */}
        {isListening && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '16px',
            color: theme.micActive,
            fontSize: '14px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: theme.micActive,
              animation: 'pulse 1s infinite'
            }} />
            Listening...
          </div>
        )}

        {/* Next Button */}
        <button
          onClick={handleNext}
          disabled={!input.trim() || loading}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: input.trim() ? theme.accent : theme.border,
            color: input.trim() ? '#fff' : theme.textMuted,
            fontSize: '16px',
            fontWeight: '600',
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s'
          }}
        >
          {loading ? 'Submitting...' : step < questions.length - 1 ? 'Next' : 'Find My Rig!'}
        </button>

        {/* Skip for non-required fields */}
        {['notes'].includes(questions[step]?.key) && (
          <button
            onClick={() => {
              setAnswers(prev => ({ ...prev, [questions[step].key]: '' }));
              if (step < questions.length - 1) {
                setStep(step + 1);
              } else {
                submitRequest({ ...answers, [questions[step].key]: '' });
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.textMuted,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Skip this question
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        {dealer?.phone && (
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 8px' }}>
            Prefer to talk? Call us at{' '}
            <a href={`tel:${dealer.phone}`} style={{ color: theme.accent, textDecoration: 'none' }}>
              {dealer.phone}
            </a>
          </p>
        )}
        <p style={{ color: theme.textMuted, fontSize: '12px', margin: 0 }}>
          Powered by OG DiX
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}