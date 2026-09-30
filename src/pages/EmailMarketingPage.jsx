import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

// ogdix.com is the only domain verified with our email provider (Resend), so every campaign is sent from this address.
const FROM_EMAIL = 'noreply@ogdix.com';
const hasEmail = (c) => !!c?.email && c.email.includes('@');

// supabase.functions.invoke hides the function's own error text behind a generic message; dig it out.
async function edgeErrorMessage(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch { /* fall through */ }
  return error?.message || 'Unknown error';
}

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
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showCreateSegment, setShowCreateSegment] = useState(false);
  const [showCreateAutomation, setShowCreateAutomation] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  // Only customers with an email address can receive a campaign.
  const emailableCount = (customers || []).filter(hasEmail).length;

  // Campaign form
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    subject_line: '',
    preview_text: '',
    body_html: '',
    from_name: dealer?.dealer_name || '',
    from_email: FROM_EMAIL,
    segment_id: null
  });

  // Template form
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject_line: '',
    body_html: '',
    category: 'general'
  });

  // Segment form
  const [segmentForm, setSegmentForm] = useState({
    name: '',
    description: '',
    criteria: {}
  });

  // Automation form
  const [automationForm, setAutomationForm] = useState({
    name: '',
    description: '',
    trigger_type: 'bhph_payment_due',
    subject_line: '',
    body_html: ''
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
      console.error('Full error details:', JSON.stringify(err, null, 2));
      alert(`Failed to generate content: ${err.message || JSON.stringify(err)}\n\nCheck browser console for details.`);
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
      // The sender builds "From Name <address>", so the name must never be blank.
      from_name: campaignForm.from_name?.trim() || dealer?.dealer_name || 'OG Dealer',
      from_email: FROM_EMAIL,
      reply_to: dealer?.email || null,
      // Audiences can't filter recipients yet (the sender ignores them), so don't pretend one was picked.
      segment_id: null,
      dealer_id: dealerId,
      status: 'draft'
    }).select().single();

    if (error) {
      console.error('Error creating campaign:', error);
      alert('Failed to create campaign: ' + error.message);
      return;
    }

    setCampaigns([data, ...campaigns]);
    setShowCreateCampaign(false);
    resetCampaignForm();
    fetchAllData();
  }

  async function sendCampaign(campaignId) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign || sendingId) return;

    // The sender always emails every customer with an email address; audiences are not applied yet.
    const recipientCount = emailableCount;
    if (recipientCount === 0) {
      alert('None of your customers have an email address on file, so there is no one to send to. Add email addresses on the Customers page first.');
      return;
    }

    const audienceNote = campaign.segment_id
      ? '\n\nNote: this campaign has an audience picked, but audiences are not applied yet. It will go to ALL customers with an email address.'
      : '';
    if (!confirm(`Send "${campaign.name}" by email to up to ${recipientCount} customers?\n\nThis goes to every customer with an email address on file (except anyone who unsubscribed).\nFrom: ${campaign.from_name?.trim() || dealer?.dealer_name || 'OG Dealer'} <${FROM_EMAIL}>\nSubject: ${campaign.subject_line}${audienceNote}\n\nThis cannot be undone.`)) return;

    setSendingId(campaignId);
    try {
      // ogdix.com is the only verified sending domain; fix older drafts saved with another From address
      // (or a blank From name, which the sender would turn into "null <...>").
      if (campaign.from_email !== FROM_EMAIL || !campaign.from_name?.trim()) {
        const { error: fromError } = await supabase.from('email_campaigns')
          .update({
            from_email: FROM_EMAIL,
            from_name: campaign.from_name?.trim() || dealer?.dealer_name || 'OG Dealer',
            reply_to: campaign.reply_to || dealer?.email || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaignId)
          .eq('dealer_id', dealerId);
        if (fromError) throw new Error('Could not update the From address: ' + fromError.message);
      }

      // Call edge function to send campaign
      const { data, error } = await supabase.functions.invoke('send-email-campaign', {
        body: { campaign_id: campaignId }
      });

      if (error) throw new Error(await edgeErrorMessage(error));

      const sent = data?.sent_count || 0;
      const failed = data?.failed_count || 0;
      if (sent === 0) {
        alert(`No emails went out.\n\nFailed: ${failed} of ${data?.total_recipients || 0}.\nPlease contact OG Dealer support.`);
      } else if (failed > 0) {
        alert(`Campaign partly sent.\n\nSent: ${sent}\nFailed: ${failed}\nTotal: ${data?.total_recipients || 0}`);
      } else {
        alert(`Campaign sent to ${sent} customer${sent === 1 ? '' : 's'}.`);
      }
      fetchAllData();
    } catch (err) {
      console.error('Send campaign error:', err);
      alert(`Failed to send campaign:\n${err.message || 'Unknown error'}`);
      fetchAllData();
    } finally {
      setSendingId(null);
    }
  }

  function resetCampaignForm() {
    setCampaignForm({
      name: '',
      subject_line: '',
      preview_text: '',
      body_html: '',
      from_name: dealer?.dealer_name || '',
      from_email: FROM_EMAIL,
      segment_id: null
    });
  }

  function applyTemplate(template) {
    setCampaignForm(prev => ({
      ...prev,
      subject_line: template.subject_line || prev.subject_line,
      body_html: template.body_html || prev.body_html
    }));
    setShowCreateCampaign(true);
  }

  async function createTemplate() {
    if (!templateForm.name || !templateForm.body_html) {
      alert('Please fill in template name and content.');
      return;
    }

    const { error } = await supabase.from('email_templates').insert({
      ...templateForm,
      dealer_id: dealerId
    });

    if (error) {
      console.error('Error creating template:', error);
      alert('Failed to create template: ' + error.message);
      return;
    }

    setShowCreateTemplate(false);
    setTemplateForm({ name: '', subject_line: '', body_html: '', category: 'general' });
    fetchAllData();
  }

  async function createSegment() {
    if (!segmentForm.name) {
      alert('Please fill in segment name.');
      return;
    }

    const { error } = await supabase.from('customer_segments').insert({
      ...segmentForm,
      dealer_id: dealerId
    });

    if (error) {
      console.error('Error creating segment:', error);
      alert('Failed to create audience: ' + error.message);
      return;
    }

    setShowCreateSegment(false);
    setSegmentForm({ name: '', description: '', criteria: {} });
    fetchAllData();
  }

  async function createAutomation() {
    if (!automationForm.name || !automationForm.body_html) {
      alert('Please fill in automation name and content.');
      return;
    }

    const { error } = await supabase.from('email_automations').insert({
      ...automationForm,
      dealer_id: dealerId,
      // Nothing runs automations yet. Save them switched off so they can't start sending by surprise later.
      is_active: false
    });

    if (error) {
      console.error('Error creating automation:', error);
      alert('Failed to save automation: ' + error.message);
      return;
    }

    setShowCreateAutomation(false);
    setAutomationForm({ name: '', description: '', trigger_type: 'bhph_payment_due', subject_line: '', body_html: '' });
    fetchAllData();
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
            💬 Connect
            <span style={{ fontSize: '14px', fontWeight: '500', color: theme.textMuted, backgroundColor: theme.bgCard, padding: '4px 12px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              AI-Powered
            </span>
          </h1>
          <p style={{ color: theme.textSecondary, margin: '4px 0 0', fontSize: '14px' }}>
            Write marketing emails (AI can help) and send them to your customers.
          </p>
          <p style={{ color: theme.textMuted, margin: '2px 0 0', fontSize: '13px' }}>
            {campaigns.length} campaigns • {emailableCount} of {customers?.length || 0} customers have an email address
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
                    // The sender marks a campaign 'sent' even when every email failed. Don't call that sent.
                    const nothingWentOut = campaign.status === 'sent' && !campaign.sent_count;
                    const statusStyle = nothingWentOut ? { bg: '#ef444420', color: '#ef4444' } : getStatusColor(campaign.status);
                    const statusLabel = nothingWentOut ? 'Not sent' : campaign.status;
                    const isSending = sendingId === campaign.id;
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
                              {statusLabel}
                            </span>
                            {(campaign.status === 'draft' || nothingWentOut) && (
                              <button onClick={() => sendCampaign(campaign.id)} disabled={!!sendingId} title={`Emails every customer with an email address, from ${FROM_EMAIL}`} style={{ padding: '8px 16px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: sendingId ? 'not-allowed' : 'pointer', opacity: sendingId && !isSending ? 0.5 : 1 }}>
                                {isSending ? 'Sending...' : nothingWentOut ? 'Try Again' : 'Send Now'}
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

                        {nothingWentOut && (
                          <div style={{ marginTop: '12px', fontSize: '13px', color: '#ef4444' }}>
                            None of the {campaign.recipient_count || 0} emails went out. No customer received this campaign, so it is safe to try again.
                          </div>
                        )}

                        <div style={{ marginTop: '12px', fontSize: '13px', color: theme.textMuted }}>
                          Created {formatDate(campaign.created_at)}
                          {campaign.sent_at && !nothingWentOut && ` • Sent ${formatDate(campaign.sent_at)}`}
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
            <div>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <p style={{ color: theme.textMuted, fontSize: '13px', margin: 0 }}>Templates are ready-made emails you can reuse. Click one to start a new campaign from it.</p>
                <button onClick={() => setShowCreateTemplate(true)} style={buttonStyle}>
                  + New Template
                </button>
              </div>
              {templates.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  No templates yet. Click "+ New Template" to save an email you want to reuse.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {templates.map(template => (
                  <div key={template.id} onClick={() => applyTemplate(template)} title="Start a new campaign from this template" style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
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
            </div>
          )}

          {/* Segments Tab */}
          {activeTab === 'segments' && (
            <div>
              <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eab30860', backgroundColor: '#eab30815', color: theme.text, fontSize: '13px', lineHeight: '1.5' }}>
                <strong style={{ color: '#eab308' }}>Audiences don't filter emails yet.</strong> An audience is a named group of customers (for example, "BHPH customers").
                You can save one here for later, but right now every campaign goes to all customers who have an email address.
              </div>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreateSegment(true)} style={buttonStyle}>
                  + New Audience
                </button>
              </div>
              {segments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>No audiences yet</h3>
                  <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 24px' }}>
                    You don't need one to send a campaign. Campaigns currently go to every customer with an email address.
                  </p>
                  <button onClick={() => setShowCreateSegment(true)} style={buttonStyle}>
                    Create First Audience
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {segments.map(segment => (
                    <div key={segment.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{segment.name}</h3>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted }} title="Audiences can't hold or filter customers yet">
                          Not used for sending yet
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
              <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #eab30860', backgroundColor: '#eab30815', color: theme.text, fontSize: '13px', lineHeight: '1.5' }}>
                <strong style={{ color: '#eab308' }}>Automatic emails aren't running yet.</strong> An automation is an email meant to go out on its own when something happens (like a payment coming due).
                You can write and save one here, but OG Dealer will not send it. Send reminders yourself for now.
              </div>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreateAutomation(true)} style={buttonStyle}>
                  + New Automation
                </button>
              </div>
              {automations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, margin: '0 0 8px' }}>No automations</h3>
                  <p style={{ color: theme.textMuted, fontSize: '14px', margin: '0 0 24px' }}>
                    You can draft emails for payment reminders and other events now. They will not send until automations are switched on in a future update.
                  </p>
                  <button onClick={() => setShowCreateAutomation(true)} style={buttonStyle}>
                    Draft an Automation
                  </button>
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
                        <div title="Automatic emails aren't running yet, so this will not send" style={{ padding: '6px 12px', backgroundColor: '#71717a20', color: '#a1a1aa', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                          NOT RUNNING YET
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

      {/* Create Template Modal */}
      {showCreateTemplate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowCreateTemplate(false)}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '600px', border: `1px solid ${theme.border}` }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.text, margin: '0 0 24px', fontSize: '24px' }}>Create Email Template</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Template Name *</label>
                <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Monthly Newsletter" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Category</label>
                <select value={templateForm.category} onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value }))} style={inputStyle}>
                  <option value="general">General</option>
                  <option value="reminder">Reminder</option>
                  <option value="promotion">Promotion</option>
                  <option value="follow_up">Follow Up</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Subject Line</label>
                <input type="text" value={templateForm.subject_line} onChange={(e) => setTemplateForm(prev => ({ ...prev, subject_line: e.target.value }))} placeholder="e.g., {{dealer_name}} Monthly Update" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Email Content *</label>
                <textarea value={templateForm.body_html} onChange={(e) => setTemplateForm(prev => ({ ...prev, body_html: e.target.value }))} placeholder="Write the email here. {{customer_name}} and {{dealer_name}} are filled in automatically for each customer." style={{ ...inputStyle, minHeight: '150px', resize: 'vertical', fontFamily: 'monospace' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowCreateTemplate(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createTemplate} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Create Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Segment Modal */}
      {showCreateSegment && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowCreateSegment(false)}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '600px', border: `1px solid ${theme.border}` }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.text, margin: '0 0 24px', fontSize: '24px' }}>Create Audience Segment</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Segment Name *</label>
                <input type="text" value={segmentForm.name} onChange={(e) => setSegmentForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., BHPH Customers" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Description</label>
                <textarea value={segmentForm.description} onChange={(e) => setSegmentForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Describe this audience segment..." style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
              </div>
              <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>💡 Audiences can't pick which customers get a campaign yet. Saving one now only stores the name and description for later.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowCreateSegment(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createSegment} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Create Segment</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Automation Modal */}
      {showCreateAutomation && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }} onClick={() => setShowCreateAutomation(false)}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '600px', border: `1px solid ${theme.border}`, margin: '20px 0' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.text, margin: '0 0 8px', fontSize: '24px' }}>Draft Email Automation</h2>
            <p style={{ color: '#eab308', fontSize: '13px', margin: '0 0 20px' }}>Automatic emails aren't running yet. This saves your draft, but nothing will be sent.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Automation Name *</label>
                <input type="text" value={automationForm.name} onChange={(e) => setAutomationForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., 3-Day Payment Reminder" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }} title="The event that would send this email">Trigger Type (what would send it)</label>
                <select value={automationForm.trigger_type} onChange={(e) => setAutomationForm(prev => ({ ...prev, trigger_type: e.target.value }))} style={inputStyle}>
                  <option value="bhph_payment_due">BHPH Payment Due</option>
                  <option value="bhph_payment_overdue">BHPH Payment Overdue</option>
                  <option value="new_inventory">New Inventory</option>
                  <option value="vehicle_match">Vehicle Match</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="birthday">Birthday</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Description</label>
                <textarea value={automationForm.description} onChange={(e) => setAutomationForm(prev => ({ ...prev, description: e.target.value }))} placeholder="What does this automation do?" style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Subject Line *</label>
                <input type="text" value={automationForm.subject_line} onChange={(e) => setAutomationForm(prev => ({ ...prev, subject_line: e.target.value }))} placeholder="e.g., Payment Reminder: {{amount}} Due Soon" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '500' }}>Email Content *</label>
                <textarea value={automationForm.body_html} onChange={(e) => setAutomationForm(prev => ({ ...prev, body_html: e.target.value }))} placeholder="Use {{customer_name}}, {{amount}}, {{due_date}}, etc." style={{ ...inputStyle, minHeight: '150px', resize: 'vertical', fontFamily: 'monospace' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowCreateAutomation(false)} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createAutomation} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Save Draft</button>
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
                    value={FROM_EMAIL}
                    readOnly
                    title="All campaigns are sent from this address. It can't be changed."
                    style={{ ...inputStyle, color: theme.textMuted, cursor: 'not-allowed' }}
                  />
                </div>
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '-8px' }}>
                Customers see your From Name, but the email comes from {FROM_EMAIL}, and replies to that address may not reach you. Put your phone number or email address in the message so customers can reach you.
              </div>

              <div style={{ padding: '16px', backgroundColor: theme.bg, border: `2px solid ${theme.accent}40`, borderRadius: '12px' }}>
                <label style={{ display: 'block', fontSize: '14px', color: theme.text, marginBottom: '8px', fontWeight: '600' }}>
                  📧 Send To
                </label>
                <div style={{ ...inputStyle, fontSize: '15px', fontWeight: '500' }}>
                  📬 All customers with an email address ({emailableCount})
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
                  Sending to a smaller group isn't available yet. Every campaign goes to all customers with an email address on file, except anyone who unsubscribed.
                </div>
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
