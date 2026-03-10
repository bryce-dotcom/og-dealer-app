import { useState, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function SMSPage() {
  const { dealerId, customers, employees } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [smsSettings, setSmsSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    twilio_phone_number: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    auto_payment_reminders: true,
    reminder_days_before: 3,
    auto_appointment_reminders: true,
  });
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (dealerId) {
      loadConversations();
      loadSettings();
    }
  }, [dealerId]);

  useEffect(() => {
    if (selectedCustomer) loadMessages(selectedCustomer.id);
  }, [selectedCustomer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadSettings() {
    const { data } = await supabase
      .from('sms_settings')
      .select('*')
      .eq('dealer_id', dealerId)
      .maybeSingle();
    if (data) {
      setSmsSettings(data);
      setSettingsForm({
        twilio_phone_number: data.twilio_phone_number || '',
        twilio_account_sid: data.twilio_account_sid || '',
        twilio_auth_token: data.twilio_auth_token || '',
        auto_payment_reminders: data.auto_payment_reminders ?? true,
        reminder_days_before: data.reminder_days_before || 3,
        auto_appointment_reminders: data.auto_appointment_reminders ?? true,
      });
    }
  }

  async function loadConversations() {
    try {
      setLoading(true);
      // Get recent messages grouped by customer
      const { data } = await supabase
        .from('sms_messages')
        .select('*, customers(id, name, phone)')
        .eq('dealer_id', dealerId)
        .order('created_at', { ascending: false })
        .limit(500);

      // Group by customer
      const grouped = {};
      (data || []).forEach(msg => {
        const custId = msg.customer_id;
        if (!custId) return;
        if (!grouped[custId]) {
          grouped[custId] = {
            customer: msg.customers,
            lastMessage: msg,
            unread: 0,
            messages: [],
          };
        }
        grouped[custId].messages.push(msg);
        if (msg.direction === 'inbound' && msg.status === 'received') {
          grouped[custId].unread++;
        }
      });

      setConversations(Object.values(grouped).sort((a, b) =>
        new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at)
      ));
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(customerId) {
    const { data } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('dealer_id', dealerId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(100);
    setMessages(data || []);
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !selectedCustomer?.phone) return;

    try {
      setSending(true);

      // Save message to database
      const { error } = await supabase.from('sms_messages').insert({
        dealer_id: dealerId,
        customer_id: selectedCustomer.id,
        direction: 'outbound',
        from_number: smsSettings?.twilio_phone_number || 'pending',
        to_number: selectedCustomer.phone,
        body: newMessage.trim(),
        status: smsSettings?.is_active ? 'queued' : 'sent',
        message_type: 'manual',
      });

      if (error) throw error;

      // Log interaction
      await supabase.from('customer_interactions').insert({
        dealer_id: dealerId,
        customer_id: selectedCustomer.id,
        interaction_type: 'sms',
        direction: 'outbound',
        summary: `SMS sent: ${newMessage.trim().substring(0, 80)}...`,
        details: newMessage.trim(),
      });

      setNewMessage('');
      loadMessages(selectedCustomer.id);
      loadConversations();
    } catch (error) {
      alert('Failed to send: ' + error.message);
    } finally {
      setSending(false);
    }
  }

  async function saveSettings() {
    try {
      const payload = {
        dealer_id: dealerId,
        ...settingsForm,
        is_active: !!settingsForm.twilio_account_sid && !!settingsForm.twilio_auth_token,
      };

      if (smsSettings?.id) {
        await supabase.from('sms_settings').update(payload).eq('id', smsSettings.id);
      } else {
        await supabase.from('sms_settings').insert(payload);
      }

      alert('SMS settings saved');
      setShowSettings(false);
      loadSettings();
    } catch (error) {
      alert('Failed to save: ' + error.message);
    }
  }

  function timeAgo(dateStr) {
    const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  const filteredConversations = conversations.filter(c =>
    !search || c.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.customer?.phone?.includes(search)
  );

  // Customers not yet in conversations
  const existingCustomerIds = new Set(conversations.map(c => c.customer?.id));
  const newCustomerOptions = (customers || []).filter(c =>
    c.phone && !existingCustomerIds.has(c.id) &&
    (!search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
  );

  return (
    <div style={{ height: 'calc(100vh - 0px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>SMS Messaging</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>
            Send texts to customers {smsSettings?.is_active ? '(Twilio connected)' : '(messages saved locally)'}
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          style={{ padding: '8px 16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', cursor: 'pointer' }}
        >
          Settings
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Conversations List */}
        <div style={{ width: '340px', borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers..."
              style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredConversations.map(conv => (
              <div
                key={conv.customer?.id}
                onClick={() => setSelectedCustomer(conv.customer)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}`,
                  backgroundColor: selectedCustomer?.id === conv.customer?.id ? theme.accentBg : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{conv.customer?.name}</span>
                  <span style={{ color: theme.textMuted, fontSize: '12px' }}>{timeAgo(conv.lastMessage.created_at)}</span>
                </div>
                <div style={{ color: theme.textSecondary, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.lastMessage.direction === 'outbound' ? 'You: ' : ''}{conv.lastMessage.body}
                </div>
                {conv.unread > 0 && (
                  <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', backgroundColor: theme.accent, color: '#fff', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                    {conv.unread} new
                  </span>
                )}
              </div>
            ))}

            {/* New conversation starters */}
            {search && newCustomerOptions.length > 0 && (
              <>
                <div style={{ padding: '8px 16px', fontSize: '11px', color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', borderTop: `1px solid ${theme.border}` }}>
                  Start New Conversation
                </div>
                {newCustomerOptions.slice(0, 5).map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCustomer(c)}
                    style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{c.name}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>{c.phone}</div>
                  </div>
                ))}
              </>
            )}

            {!loading && filteredConversations.length === 0 && !search && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.textMuted }}>
                <p>No conversations yet</p>
                <p style={{ fontSize: '13px' }}>Search for a customer to start texting</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedCustomer ? (
            <>
              {/* Chat Header */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>{selectedCustomer.name}</h2>
                  <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0' }}>{selectedCustomer.phone}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={`tel:${selectedCustomer.phone}`} style={{ padding: '8px 12px', backgroundColor: '#22c55e20', color: '#22c55e', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
                    Call
                  </a>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{
                    display: 'flex',
                    justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                    marginBottom: '12px',
                  }}>
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: '16px',
                      backgroundColor: msg.direction === 'outbound' ? '#3b82f6' : theme.bgCard,
                      color: msg.direction === 'outbound' ? '#fff' : theme.text,
                      border: msg.direction === 'inbound' ? `1px solid ${theme.border}` : 'none',
                    }}>
                      <div style={{ fontSize: '14px', lineHeight: '1.4' }}>{msg.body}</div>
                      <div style={{
                        fontSize: '11px', marginTop: '4px',
                        color: msg.direction === 'outbound' ? 'rgba(255,255,255,0.7)' : theme.textMuted,
                        textAlign: 'right',
                      }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.direction === 'outbound' && (
                          <span style={{ marginLeft: '6px' }}>
                            {msg.status === 'delivered' ? '✓✓' : msg.status === 'sent' ? '✓' : msg.status === 'failed' ? '!' : '...'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
              <div style={{ padding: '16px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: '12px 16px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '24px', color: theme.text, fontSize: '14px', outline: 'none' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  style={{
                    padding: '12px 20px', backgroundColor: theme.accent, color: '#fff',
                    borderRadius: '24px', border: 'none', fontWeight: '600', fontSize: '14px',
                    cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                    opacity: sending || !newMessage.trim() ? 0.5 : 1,
                  }}
                >
                  {sending ? '...' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
              <div style={{ textAlign: 'center' }}>
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: '12px', opacity: 0.5 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: '16px' }}>Select a conversation</p>
                <p style={{ fontSize: '13px' }}>or search for a customer to start texting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '32px', width: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>SMS Settings</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: theme.textSecondary }}>Twilio Phone Number</label>
                <input type="text" value={settingsForm.twilio_phone_number} onChange={(e) => setSettingsForm({ ...settingsForm, twilio_phone_number: e.target.value })}
                  placeholder="+1234567890" style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: theme.textSecondary }}>Account SID</label>
                <input type="text" value={settingsForm.twilio_account_sid} onChange={(e) => setSettingsForm({ ...settingsForm, twilio_account_sid: e.target.value })}
                  placeholder="ACxxxxxxx" style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: theme.textSecondary }}>Auth Token</label>
                <input type="password" value={settingsForm.twilio_auth_token} onChange={(e) => setSettingsForm({ ...settingsForm, twilio_auth_token: e.target.value })}
                  placeholder="••••••••" style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Automation</h3>
                {[
                  { key: 'auto_payment_reminders', label: 'Auto payment reminders', desc: `Send ${settingsForm.reminder_days_before} days before due date` },
                  { key: 'auto_appointment_reminders', label: 'Auto appointment reminders', desc: '24 hours before appointment' },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{desc}</div>
                    </div>
                    <button onClick={() => setSettingsForm({ ...settingsForm, [key]: !settingsForm[key] })}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: settingsForm[key] ? theme.accent : theme.border, position: 'relative' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#fff', position: 'absolute', top: '2px', transition: 'left 0.2s', left: settingsForm[key] ? '22px' : '2px' }} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => setShowSettings(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveSettings} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>Save Settings</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
