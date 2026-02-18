import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function EmailMarketingPage() {
  const { dealerId, dealer, customers } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  const [activeTab, setActiveTab] = useState('campaigns'); // campaigns, templates, segments, automations
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [segments, setSegments] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    subject_line: '',
    preview_text: '',
    body_html: '',
    from_name: dealer?.dealer_name || '',
    from_email: dealer?.email || '',
    segment_id: null
  });

  // AI Generator form
  const [aiForm, setAiForm] = useState({
    goal: '', // 'promote_inventory', 'payment_reminder', 'thank_you', 'newsletter'
    tone: 'friendly', // friendly, professional, excited, urgent
    audience: '', // segment description
    keyPoints: '',
    customPrompt: ''
  });

  useEffect(() => {
    if (dealerId) fetchAllData();
  }, [dealerId]);

  async function fetchAllData() {
    setLoading(true);
    const [campaignsRes, templatesRes, segmentsRes, automationsRes] = await Promise.all([
      supabase.from('email_campaigns').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('email_templates').select('*').or(`dealer_id.eq.${dealerId},dealer_id.is.null`).order('created_at', { ascending: false }),
      supabase.from('customer_segments').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('email_automations').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false })
    ]);

    if (campaignsRes.data) setCampaigns(campaignsRes.data);
    if (templatesRes.data) setTemplates(templatesRes.data);
    if (segmentsRes.data) setSegments(segmentsRes.data);
    if (automationsRes.data) setAutomations(automationsRes.data);
    setLoading(false);
  }

  async function generateWithAI() {
    setAiGenerating(true);
    try {
      // Call edge function to generate email content with Claude
      const { data, error } = await supabase.functions.invoke('generate-email-content', {
        body: {
          goal: aiForm.goal,
          tone: aiForm.tone,
          audience: aiForm.audience,
          keyPoints: aiForm.keyPoints,
          customPrompt: aiForm.customPrompt,
          dealerName: dealer?.dealer_name || 'Our Dealership',
          dealerState: dealer?.state || 'UT'
        }
      });

      if (error) throw error;

      // Populate campaign form with AI-generated content
      setCampaignForm(prev => ({
        ...prev,
        subject_line: data.subject_line || prev.subject_line,
        preview_text: data.preview_text || prev.preview_text,
        body_html: data.body_html || prev.body_html
      }));

      setShowAIGenerator(false);
      setShowCreateCampaign(true);
    } catch (err) {
      console.error('AI generation error:', err);
      alert('Failed to generate content. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  }

  async function createCampaign() {
    if (!campaignForm.name || !campaignForm.subject_line || !campaignForm.body_html) {
      alert('Please fill in campaign name, subject line, and email content.');
      return;
    }

    const { data, error } = await supabase.from('email_campaigns').insert({
      ...campaignForm,
      dealer_id: dealerId,
      status: 'draft'
    }).select().single();

    if (error) {
      console.error('Error creating campaign:', error);
      alert('Failed to create campaign.');
      return;
    }

    setCampaigns([data, ...campaigns]);
    setShowCreateCampaign(false);
    resetCampaignForm();
    fetchAllData();
  }

  async function sendCampaign(campaignId) {
    if (!confirm('Are you sure you want to send this campaign? This action cannot be undone.')) return;

    try {
      // Call edge function to send campaign
      const { data, error } = await supabase.functions.invoke('send-email-campaign', {
        body: { campaign_id: campaignId }
      });

      if (error) throw error;

      alert(`Campaign sent to ${data.sent_count} recipients!`);
      fetchAllData();
    } catch (err) {
      console.error('Send campaign error:', err);
      alert('Failed to send campaign. Please try again.');
    }
  }

  function resetCampaignForm() {
    setCampaignForm({
      name: '',
      subject_line: '',
      preview_text: '',
      body_html: '',
      from_name: dealer?.dealer_name || '',
      from_email: dealer?.email || '',
      segment_id: null
    });
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt || 0);
  const getStatusColor = (status) => {
    const colors = {
      draft: { bg: '#71717a20', color: '#a1a1aa' },
      scheduled: { bg: '#3b82f620', color: '#3b82f6' },
      sending: { bg: '#f9731620', color: '#f97316' },
      sent: { bg: '#22c55e20', color: '#22c55e' },
      paused: { bg: '#eab30820', color: '#eab308' },
      cancelled: { bg: '#ef444420', color: '#ef4444' }
    };
    return colors[status] || colors.draft;
  };

  const calculateOpenRate = (campaign) => {
    if (!campaign.sent_count || campaign.sent_count === 0) return 0;
    return ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1);
  };

  const calculateClickRate = (campaign) => {
    if (!campaign.sent_count || campaign.sent_count === 0) return 0;
    return ((campaign.clicked_count / campaign.sent_count) * 100).toFixed(1);
  };

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };
  const tabStyle = (active) => ({ padding: '10px 20px', backgroundColor: active ? theme.accentBg : 'transparent', color: active ? theme.accent : theme.textSecondary, border: `1px solid ${active ? theme.accent : theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' });

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            ✉️ Email Marketing
            <span style={{ fontSize: '14px', fontWeight: '500', color: theme.textMuted, backgroundColor: theme.bgCard, padding: '4px 12px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              AI-Powered
            </span>
          </h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>
            {campaigns.length} campaigns • {customers?.length || 0} contacts
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowAIGenerator(true)} style={{ ...buttonStyle, backgroundColor: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>✨</span> AI Generator
          </button>
          <button onClick={() => setShowCreateCampaign(true)} style={buttonStyle}>
            + New Campaign
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
        <button onClick={() => setActiveTab('campaigns')} style={tabStyle(activeTab === 'campaigns')}>
          Campaigns {campaigns.length > 0 && `(${campaigns.length})`}
        </button>
        <button onClick={() => setActiveTab('templates')} style={tabStyle(activeTab === 'templates')}>
          Templates {templates.length > 0 && `(${templates.length})`}
        </button>
        <button onClick={() => setActiveTab('segments')} style={tabStyle(activeTab === 'segments')}>
          Audiences {segments.length > 0 && `(${segments.length})`}
        </button>
        <button onClick={() => setActiveTab('automations')} style={tabStyle(activeTab === 'automations')}>
          Automations {automations.length > 0 && `(${automations.length})`}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Loading...</div>
      ) : (
        <>
          {/* Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div>
              {campaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>No campaigns yet</h3>
                  <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 24px' }}>
                    Create your first email campaign with AI assistance
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button onClick={() => setShowAIGenerator(true)} style={{ ...buttonStyle, backgroundColor: '#8b5cf6' }}>
                      ✨ Start with AI
                    </button>
                    <button onClick={() => setShowCreateCampaign(true)} style={buttonStyle}>
                      Create Manually
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {campaigns.map(campaign => {
                    const statusStyle = getStatusColor(campaign.status);
                    return (
                      <div key={campaign.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '16px', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{campaign.name}</h3>
                              {campaign.ai_generated && (
                                <span style={{ fontSize: '12px', backgroundColor: '#8b5cf620', color: '#8b5cf6', padding: '2px 8px', borderRadius: '6px', fontWeight: '500' }}>
                                  AI
                                </span>
                              )}
                            </div>
                            <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>{campaign.subject_line}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ padding: '6px 12px', backgroundColor: statusStyle.bg, color: statusStyle.color, borderRadius: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>
                              {campaign.status}
                            </span>
                            {campaign.status === 'draft' && (
                              <button onClick={() => sendCampaign(campaign.id)} style={{ padding: '8px 16px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                Send Now
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        {campaign.sent_count > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                            <div>
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Sent</div>
                              <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text }}>{campaign.sent_count.toLocaleString()}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Open Rate</div>
                              <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6' }}>{calculateOpenRate(campaign)}%</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Click Rate</div>
                              <div style={{ fontSize: '20px', fontWeight: '700', color: '#8b5cf6' }}>{calculateClickRate(campaign)}%</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Bounced</div>
                              <div style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>{campaign.bounced_count || 0}</div>
                            </div>
                          </div>
                        )}

                        <div style={{ marginTop: '12px', fontSize: '13px', color: theme.textMuted }}>
                          Created {formatDate(campaign.created_at)}
                          {campaign.sent_at && ` • Sent ${formatDate(campaign.sent_at)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {templates.map(template => (
                <div key={template.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>{template.name}</div>
                  <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>{template.subject_line}</div>
                  <div style={{ padding: '8px 12px', backgroundColor: theme.bg, borderRadius: '6px', fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
                    Category: {template.category}
                  </div>
                  {template.is_default && (
                    <span style={{ fontSize: '11px', backgroundColor: '#22c55e20', color: '#22c55e', padding: '4px 8px', borderRadius: '6px', fontWeight: '600' }}>
                      DEFAULT
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Segments Tab */}
          {activeTab === 'segments' && (
            <div>
              {segments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>No audience segments</h3>
                  <p style={{ color: theme.textMuted, fontSize: '14px', margin: 0 }}>
                    Create customer segments for targeted campaigns
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {segments.map(segment => (
                    <div key={segment.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{segment.name}</h3>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: theme.accent }}>
                          {segment.customer_count || 0} contacts
                        </span>
                      </div>
                      {segment.description && (
                        <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0' }}>{segment.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Automations Tab */}
          {activeTab === 'automations' && (
            <div>
              {automations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>No automations</h3>
                  <p style={{ color: theme.textMuted, fontSize: '14px', margin: 0 }}>
                    Set up automated emails for payment reminders, new inventory alerts, and more
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {automations.map(automation => (
                    <div key={automation.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: '0 0 4px' }}>{automation.name}</h3>
                          <p style={{ color: theme.textMuted, fontSize: '14px', margin: 0 }}>{automation.description}</p>
                        </div>
                        <div style={{ padding: '6px 12px', backgroundColor: automation.is_active ? '#22c55e20' : '#71717a20', color: automation.is_active ? '#22c55e' : '#a1a1aa', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                          {automation.is_active ? 'ACTIVE' : 'PAUSED'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* AI Generator Modal */}
      {showAIGenerator && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => !aiGenerating && setShowAIGenerator(false)}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '600px', border: `1px solid ${theme.border}` }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.text, margin: '0 0 8px', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ✨ AI Email Generator
            </h2>
            <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 24px' }}>
              Tell AI what you want to send, and it will write the perfect email for you
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Campaign Goal *
                </label>
                <select value={aiForm.goal} onChange={(e) => setAiForm(prev => ({ ...prev, goal: e.target.value }))} style={inputStyle}>
                  <option value="">Select goal...</option>
                  <option value="promote_inventory">Promote New Inventory</option>
                  <option value="payment_reminder">Payment Reminder</option>
                  <option value="thank_you">Thank You Message</option>
                  <option value="vehicle_match">Vehicle Match Alert</option>
                  <option value="newsletter">Monthly Newsletter</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Tone
                </label>
                <select value={aiForm.tone} onChange={(e) => setAiForm(prev => ({ ...prev, tone: e.target.value }))} style={inputStyle}>
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="excited">Excited</option>
                  <option value="urgent">Urgent</option>
                  <option value="casual">Casual</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Key Points (optional)
                </label>
                <textarea
                  value={aiForm.keyPoints}
                  onChange={(e) => setAiForm(prev => ({ ...prev, keyPoints: e.target.value }))}
                  placeholder="e.g., 2024 Toyota Camry, $25,000, low miles, great condition"
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Additional Instructions (optional)
                </label>
                <textarea
                  value={aiForm.customPrompt}
                  onChange={(e) => setAiForm(prev => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="e.g., Include financing options, mention trade-in program"
                  style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowAIGenerator(false)}
                disabled={aiGenerating}
                style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: aiGenerating ? 'not-allowed' : 'pointer', opacity: aiGenerating ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                onClick={generateWithAI}
                disabled={aiGenerating || !aiForm.goal}
                style={{ flex: 1, padding: '12px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: (aiGenerating || !aiForm.goal) ? 'not-allowed' : 'pointer', opacity: (aiGenerating || !aiForm.goal) ? 0.5 : 1 }}
              >
                {aiGenerating ? 'Generating...' : '✨ Generate Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateCampaign && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }} onClick={() => setShowCreateCampaign(false)}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '700px', border: `1px solid ${theme.border}`, margin: '20px 0' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.text, margin: '0 0 24px', fontSize: '24px' }}>Create Email Campaign</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., January Inventory Sale"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Subject Line *
                </label>
                <input
                  type="text"
                  value={campaignForm.subject_line}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, subject_line: e.target.value }))}
                  placeholder="e.g., New 2024 Models Just Arrived!"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Preview Text
                </label>
                <input
                  type="text"
                  value={campaignForm.preview_text}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, preview_text: e.target.value }))}
                  placeholder="Shows in inbox preview..."
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Email Content *
                </label>
                <textarea
                  value={campaignForm.body_html}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, body_html: e.target.value }))}
                  placeholder="Write your email content here..."
                  style={{ ...inputStyle, minHeight: '200px', resize: 'vertical', fontFamily: 'monospace' }}
                />
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                  Tip: Use HTML for formatting, or use the AI Generator for help
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                    From Name
                  </label>
                  <input
                    type="text"
                    value={campaignForm.from_name}
                    onChange={(e) => setCampaignForm(prev => ({ ...prev, from_name: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                    From Email
                  </label>
                  <input
                    type="email"
                    value={campaignForm.from_email}
                    onChange={(e) => setCampaignForm(prev => ({ ...prev, from_email: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>
                  Send To
                </label>
                <select value={campaignForm.segment_id || ''} onChange={(e) => setCampaignForm(prev => ({ ...prev, segment_id: e.target.value || null }))} style={inputStyle}>
                  <option value="">All Customers ({customers?.length || 0})</option>
                  {segments.map(seg => (
                    <option key={seg.id} value={seg.id}>{seg.name} ({seg.customer_count || 0})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowCreateCampaign(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={createCampaign} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
