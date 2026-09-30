import { useState, useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

// Texting is NOT connected: nothing in OG Dealer sends or receives SMS yet.
// This page only keeps a record of texts staff send from their own phones.
// (The old Twilio settings form stored the auth token from the browser; it was removed on purpose.)

const displayName = (c) => (c && (c.name || [c.first_name, c.last_name].filter(Boolean).join(' '))) || 'Unnamed customer';
const smsHref = (phone) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}`;

export default function SMSPage() {
  const { dealerId, customers, currentEmployee } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (dealerId) {
      loadConversations();
    }
  }, [dealerId]);

  useEffect(() => {
    if (selectedCustomer) loadMessages(selectedCustomer.id);
  }, [selectedCustomer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    try {
      setLoading(true);
      // Get recent messages grouped by customer
      const { data, error } = await supabase
        .from('sms_messages')
        .select('*, customers(id, name, first_name, last_name, phone)')
        .eq('dealer_id', dealerId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

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
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('dealer_id', dealerId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) console.error('Error loading messages:', error);
    setMessages(data || []);
  }

  // Saves a record of a text the staff member sent from their own phone. This does NOT send anything.
  async function handleLogMessage() {
    const body = newMessage.trim();
    if (!body) return;
    if (!selectedCustomer?.phone) {
      alert('This customer has no phone number on file. Add one on the Customers page first.');
      return;
    }

    try {
      setSending(true);

      const { error } = await supabase.from('sms_messages').insert({
        dealer_id: dealerId,
        customer_id: selectedCustomer.id,
        direction: 'outbound',
        from_number: 'staff phone',
        to_number: selectedCustomer.phone,
        body,
        // provider 'manual' = logged by staff, not sent by OG Dealer (no provider_message_id).
        status: 'sent',
        provider: 'manual',
        message_type: 'manual',
        sent_by: currentEmployee?.id || null,
        sent_by_name: currentEmployee?.name || null,
      });
      if (error) throw error;

      // Add to the customer's history (not critical - the text log above already saved)
      const { error: logError } = await supabase.from('customer_interactions').insert({
        dealer_id: dealerId,
        customer_id: selectedCustomer.id,
        interaction_type: 'sms',
        direction: 'outbound',
        summary: `Text logged (sent from staff phone): ${body.length > 80 ? body.substring(0, 80) + '...' : body}`,
        details: body,
        employee_id: currentEmployee?.id || null,
        employee_name: currentEmployee?.name || null,
      });
      if (logError) console.warn('Text logged, but adding it to the customer history failed:', logError);

      setNewMessage('');
      loadMessages(selectedCustomer.id);
      loadConversations();
    } catch (error) {
      alert('Could not log text: ' + error.message);
    } finally {
      setSending(false);
    }
  }

  function outboundStatusLabel(msg) {
    if (msg.provider === 'manual') return 'Logged';
    if (!msg.provider_message_id) return 'Not sent';
    if (msg.status === 'delivered') return 'Delivered';
    if (msg.status === 'sent') return 'Sent';
    if (msg.status === 'failed') return 'Failed';
    return 'Not sent';
  }

  function timeAgo(dateStr) {
    const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  const searchLower = search.toLowerCase();
  const filteredConversations = conversations.filter(c =>
    !search || displayName(c.customer).toLowerCase().includes(searchLower) ||
    c.customer?.phone?.includes(search)
  );

  // Customers not yet in conversations
  const existingCustomerIds = new Set(conversations.map(c => c.customer?.id));
  const newCustomerOptions = (customers || []).filter(c =>
    c.phone && !existingCustomerIds.has(c.id) &&
    (!search || displayName(c).toLowerCase().includes(searchLower) || c.phone.includes(search))
  );

  return (
    <div style={{ height: 'calc(100vh - 0px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}` }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>SMS Messaging</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>
            Keep a record of the texts you trade with customers, so the whole team can see them.
          </p>
        </div>
        <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eab30860', backgroundColor: '#eab30815', color: theme.text, fontSize: '13px', lineHeight: '1.5' }}>
          <strong style={{ color: '#eab308' }}>Texting isn't connected yet.</strong> OG Dealer can't send or receive texts on its own.
          To text a customer, tap <strong>Text from my phone</strong> to open your phone's messaging app. Then type what you sent below
          and click <strong>Log Text</strong> to save a copy here. Automatic payment and appointment reminders are not running either.
        </div>
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
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{displayName(conv.customer)}</span>
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

            {search && filteredConversations.length === 0 && newCustomerOptions.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                No customers with a phone number match "{search}".
              </div>
            )}

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
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{displayName(c)}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>{c.phone}</div>
                  </div>
                ))}
              </>
            )}

            {!loading && filteredConversations.length === 0 && !search && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.textMuted }}>
                <p>No logged texts yet</p>
                <p style={{ fontSize: '13px' }}>Type a customer's name or phone in the search box above to pick them.</p>
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
                  <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>{displayName(selectedCustomer)}</h2>
                  <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0' }}>{selectedCustomer.phone}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <a href={smsHref(selectedCustomer.phone)} title="Opens the texting app on this device (works best on a phone)" style={{ padding: '8px 12px', backgroundColor: '#3b82f620', color: '#3b82f6', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
                    Text from my phone
                  </a>
                  <a href={`tel:${selectedCustomer.phone}`} style={{ padding: '8px 12px', backgroundColor: '#22c55e20', color: '#22c55e', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
                    Call
                  </a>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: theme.textMuted, fontSize: '13px', padding: '40px 20px' }}>
                    No texts logged for this customer yet. After you text them from your phone, type what you sent below and click Log Text.
                  </div>
                )}
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
                          <span style={{ marginLeft: '6px' }} title={msg.provider === 'manual' ? 'Sent from a staff phone and logged here. OG Dealer did not send it.' : undefined}>
                            {outboundStatusLabel(msg)}{msg.sent_by_name ? ` by ${msg.sent_by_name}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Log a text (does not send) */}
              <div style={{ padding: '16px', borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleLogMessage()}
                    placeholder="Type what you texted the customer..."
                    style={{ flex: 1, padding: '12px 16px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '24px', color: theme.text, fontSize: '14px', outline: 'none' }}
                  />
                  <button
                    onClick={handleLogMessage}
                    disabled={sending || !newMessage.trim()}
                    title="Saves a copy of a text you sent from your own phone. This does NOT send a text."
                    style={{
                      padding: '12px 20px', backgroundColor: theme.accent, color: '#fff',
                      borderRadius: '24px', border: 'none', fontWeight: '600', fontSize: '14px',
                      cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
                      opacity: sending || !newMessage.trim() ? 0.5 : 1,
                    }}
                  >
                    {sending ? 'Saving...' : 'Log Text'}
                  </button>
                </div>
                <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '6px', paddingLeft: '4px' }}>
                  Log Text only saves a note here. It does not send anything to the customer.
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
              <div style={{ textAlign: 'center' }}>
                <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom: '12px', opacity: 0.5 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p style={{ fontSize: '16px' }}>Pick a customer</p>
                <p style={{ fontSize: '13px' }}>Choose a conversation on the left, or search for a customer to log a text.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
