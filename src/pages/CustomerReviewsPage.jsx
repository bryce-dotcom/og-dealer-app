import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function CustomerReviewsPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterRating, setFilterRating] = useState('all');
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [respondingTo, setRespondingTo] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);

  const platforms = {
    google: 'Google', facebook: 'Facebook', yelp: 'Yelp', cars_com: 'Cars.com',
    autotrader: 'AutoTrader', dealerrater: 'DealerRater', carfax: 'Carfax',
    bbb: 'BBB', internal: 'Internal', other: 'Other'
  };

  const [form, setForm] = useState({
    customer_id: '', salesperson_id: '', deal_id: '',
    platform: 'google', reviewer_name: '', rating: '5', title: '',
    review_text: '', review_date: new Date().toISOString().split('T')[0],
    external_url: '', verified_purchase: false, featured: false, notes: ''
  });

  useEffect(() => { if (dealerId) { fetchReviews(); fetchRelated(); } }, [dealerId]);

  const fetchReviews = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('customer_reviews')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('review_date', { ascending: false });
    setReviews(data || []);
    setLoading(false);
  };

  const fetchRelated = async () => {
    const [c, e] = await Promise.all([
      supabase.from('customers').select('id, first_name, last_name').eq('dealer_id', dealerId),
      supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true)
    ]);
    setCustomers(c.data || []);
    setEmployees(e.data || []);
  };

  const handleSave = async () => {
    const sentiment = parseInt(form.rating) >= 4 ? 'positive' : parseInt(form.rating) >= 3 ? 'neutral' : 'negative';
    const payload = {
      dealer_id: dealerId,
      customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      salesperson_id: form.salesperson_id ? parseInt(form.salesperson_id) : null,
      deal_id: form.deal_id ? parseInt(form.deal_id) : null,
      platform: form.platform,
      reviewer_name: form.reviewer_name,
      rating: parseInt(form.rating),
      title: form.title || null,
      review_text: form.review_text || null,
      review_date: form.review_date,
      external_url: form.external_url || null,
      verified_purchase: form.verified_purchase,
      featured: form.featured,
      sentiment,
      notes: form.notes || null
    };
    if (editingReview) {
      await supabase.from('customer_reviews').update(payload).eq('id', editingReview.id);
    } else {
      await supabase.from('customer_reviews').insert(payload);
    }
    setShowModal(false);
    setEditingReview(null);
    resetForm();
    fetchReviews();
  };

  const resetForm = () => setForm({
    customer_id: '', salesperson_id: '', deal_id: '',
    platform: 'google', reviewer_name: '', rating: '5', title: '',
    review_text: '', review_date: new Date().toISOString().split('T')[0],
    external_url: '', verified_purchase: false, featured: false, notes: ''
  });

  const openEdit = (r) => {
    setEditingReview(r);
    setForm({
      customer_id: r.customer_id?.toString() || '', salesperson_id: r.salesperson_id?.toString() || '',
      deal_id: r.deal_id?.toString() || '', platform: r.platform || 'google',
      reviewer_name: r.reviewer_name || '', rating: r.rating?.toString() || '5',
      title: r.title || '', review_text: r.review_text || '',
      review_date: r.review_date || '', external_url: r.external_url || '',
      verified_purchase: r.verified_purchase || false, featured: r.featured || false,
      notes: r.notes || ''
    });
    setShowModal(true);
  };

  const deleteReview = async (id) => {
    if (!confirm('Delete this review?')) return;
    await supabase.from('customer_reviews').delete().eq('id', id);
    fetchReviews();
  };

  const openResponse = (review) => {
    setRespondingTo(review);
    setResponseText(review.response_text || '');
    setShowResponseModal(true);
  };

  const saveResponse = async () => {
    await supabase.from('customer_reviews').update({
      responded: true,
      response_text: responseText,
      responded_at: new Date().toISOString()
    }).eq('id', respondingTo.id);
    setShowResponseModal(false);
    setRespondingTo(null);
    fetchReviews();
  };

  const toggleFeatured = async (id, current) => {
    await supabase.from('customer_reviews').update({ featured: !current }).eq('id', id);
    fetchReviews();
  };

  const toggleFlag = async (id, current) => {
    await supabase.from('customer_reviews').update({ flagged: !current }).eq('id', id);
    fetchReviews();
  };

  const filtered = reviews.filter(r => {
    if (filterPlatform !== 'all' && r.platform !== filterPlatform) return false;
    if (filterRating !== 'all' && r.rating !== parseInt(filterRating)) return false;
    return true;
  });

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '0.0';
  const needsResponse = reviews.filter(r => !r.responded && r.rating <= 3).length;

  const stats = {
    total: reviews.length,
    avgRating,
    fiveStar: reviews.filter(r => r.rating === 5).length,
    needsResponse
  };

  const Stars = ({ rating, size = 14 }) => (
    <div style={{ display: 'flex', gap: '1px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= rating ? '#f59e0b' : theme.border, fontSize: `${size}px` }}>★</span>
      ))}
    </div>
  );

  const inputStyle = { width: '100%', padding: '8px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Customer Reviews</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Reputation management and review tracking</p>
        </div>
        <button onClick={() => { resetForm(); setEditingReview(null); setShowModal(true); }} style={{
          padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
          border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
        }}>+ Add Review</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>Total Reviews</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent }}>{stats.total}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>Average Rating</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>{stats.avgRating}</span>
            <Stars rating={Math.round(parseFloat(stats.avgRating))} size={16} />
          </div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>5-Star Reviews</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{stats.fiveStar}</div>
        </div>
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>Needs Response</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: stats.needsResponse > 0 ? '#ef4444' : '#22c55e' }}>{stats.needsResponse}</div>
        </div>
      </div>

      {/* Rating Distribution */}
      <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '10px' }}>Rating Distribution</div>
        {[5, 4, 3, 2, 1].map(r => {
          const count = reviews.filter(rev => rev.rating === r).length;
          const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
          return (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '13px', color: theme.textSecondary, width: '16px' }}>{r}</span>
              <span style={{ color: '#f59e0b', fontSize: '12px' }}>★</span>
              <div style={{ flex: 1, height: '8px', backgroundColor: theme.bg, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: r >= 4 ? '#22c55e' : r === 3 ? '#f59e0b' : '#ef4444', borderRadius: '4px' }} />
              </div>
              <span style={{ fontSize: '12px', color: theme.textMuted, width: '30px', textAlign: 'right' }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Platforms</option>
          {Object.entries(platforms).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterRating} onChange={e => setFilterRating(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} Stars</option>)}
        </select>
      </div>

      {/* Reviews List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No reviews found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(review => (
            <div key={review.id} style={{
              backgroundColor: theme.bgCard, border: `1px solid ${review.flagged ? '#ef4444' : theme.border}`,
              borderRadius: '12px', padding: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700', color: theme.text, fontSize: '15px' }}>{review.reviewer_name}</span>
                    <Stars rating={review.rating} />
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent }}>{platforms[review.platform] || review.platform}</span>
                    {review.verified_purchase && <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: '600' }}>Verified</span>}
                    {review.featured && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600' }}>Featured</span>}
                    {review.flagged && <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '600' }}>Flagged</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>{new Date(review.review_date + 'T00:00:00').toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => toggleFeatured(review.id, review.featured)} style={{ background: 'none', border: 'none', color: review.featured ? '#f59e0b' : theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>{review.featured ? 'Unfeat' : 'Feat'}</button>
                  <button onClick={() => toggleFlag(review.id, review.flagged)} style={{ background: 'none', border: 'none', color: review.flagged ? '#ef4444' : theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>Flag</button>
                  <button onClick={() => openResponse(review)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px' }}>Reply</button>
                  <button onClick={() => openEdit(review)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '13px' }}>Edit</button>
                  <button onClick={() => deleteReview(review.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Del</button>
                </div>
              </div>
              {review.title && <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px', marginBottom: '4px' }}>{review.title}</div>}
              {review.review_text && <div style={{ fontSize: '14px', color: theme.textSecondary, lineHeight: '1.5' }}>{review.review_text}</div>}
              {review.responded && (
                <div style={{ marginTop: '12px', padding: '10px', backgroundColor: theme.bg, borderRadius: '8px', borderLeft: `3px solid ${theme.accent}` }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.accent, marginBottom: '4px' }}>Dealer Response</div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary }}>{review.response_text}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '600px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>{editingReview ? 'Edit Review' : 'Add Review'}</h2>
              <button onClick={() => { setShowModal(false); setEditingReview(null); }} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><label style={labelStyle}>Reviewer Name *</label><input value={form.reviewer_name} onChange={e => setForm({ ...form, reviewer_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Platform</label><select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} style={inputStyle}>
                {Object.entries(platforms).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
              <div><label style={labelStyle}>Rating *</label><select value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} style={inputStyle}>
                {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} Star{r > 1 ? 's' : ''}</option>)}
              </select></div>
              <div><label style={labelStyle}>Date</label><input type="date" value={form.review_date} onChange={e => setForm({ ...form, review_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Customer</label><select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
                <option value="">Select</option>{customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select></div>
              <div><label style={labelStyle}>Salesperson</label><select value={form.salesperson_id} onChange={e => setForm({ ...form, salesperson_id: e.target.value })} style={inputStyle}>
                <option value="">Select</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Review Text</label><textarea value={form.review_text} onChange={e => setForm({ ...form, review_text: e.target.value })} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>External URL</label><input value={form.external_url} onChange={e => setForm({ ...form, external_url: e.target.value })} style={inputStyle} placeholder="https://..." /></div>
              <div style={{ display: 'flex', gap: '16px', gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: theme.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.verified_purchase} onChange={e => setForm({ ...form, verified_purchase: e.target.checked })} /> Verified Purchase
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: theme.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Featured
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditingReview(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.reviewer_name} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !form.reviewer_name ? 0.5 : 1 }}>{editingReview ? 'Update' : 'Add'} Review</button>
            </div>
          </div>
        </div>
      )}

      {/* Response Modal */}
      {showResponseModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '500px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: '0 0 12px' }}>Respond to Review</h2>
            <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', fontSize: '13px', color: theme.text }}>{respondingTo?.reviewer_name}</span>
                <Stars rating={respondingTo?.rating || 0} size={12} />
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary }}>{respondingTo?.review_text?.substring(0, 150)}{respondingTo?.review_text?.length > 150 ? '...' : ''}</div>
            </div>
            <label style={labelStyle}>Your Response</label>
            <textarea value={responseText} onChange={e => setResponseText(e.target.value)} style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }} placeholder="Thank you for your feedback..." />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button onClick={() => setShowResponseModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveResponse} disabled={!responseText} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: !responseText ? 0.5 : 1 }}>Save Response</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}