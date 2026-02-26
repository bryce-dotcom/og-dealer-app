import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, Search, FileText, CheckCircle2, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { getFeeScheduleInfo } from '../lib/feeCalculator';

const STEPS = ['Details', 'Discovery', 'Forms', 'Complete'];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 
  'Wisconsin', 'Wyoming'
];

const STATE_CODES = {
  'Utah': 'UT', 'Arizona': 'AZ', 'California': 'CA', 'Texas': 'TX', 'Florida': 'FL',
  'Nevada': 'NV', 'Colorado': 'CO', 'Idaho': 'ID', 'Wyoming': 'WY', 'New Mexico': 'NM'
};

export default function DealerOnboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredForms, setDiscoveredForms] = useState([]);
  const [discoveredFees, setDiscoveredFees] = useState([]);
  const [feeDiscoveryStatus, setFeeDiscoveryStatus] = useState('pending'); // 'pending', 'checking', 'discovering', 'found', 'not_found'
  const [formData, setFormData] = useState({
    dealer_name: '',
    state: 'Utah',
    county: '',
    dealer_license: '',
    address: '',
    city: '',
    zip: '',
    phone: '',
    email: '',
  });

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (step === 2) discoverForms();
  }, [step]);

  const discoverForms = async () => {
    setDiscovering(true);
    try {
      const stateCode = STATE_CODES[formData.state] || formData.state.substring(0, 2).toUpperCase();

      // Discover forms
      const { data: forms, error } = await supabase
        .from('form_registry')
        .select('id, form_number, form_name, category, description')
        .eq('state', stateCode)
        .eq('is_active', true)
        .order('category');
      if (error) throw error;
      setDiscoveredForms(forms || []);

      // Check for fee schedules
      setFeeDiscoveryStatus('checking');
      const feeInfo = await getFeeScheduleInfo(stateCode, supabase);

      if (feeInfo && feeInfo.has_schedules) {
        // Fee schedules already exist
        setDiscoveredFees(feeInfo.schedules || []);
        setFeeDiscoveryStatus('found');
        console.log(`[ONBOARDING] Found ${feeInfo.count} existing fee schedules for ${stateCode}`);
      } else {
        // No schedules - attempt discovery
        console.log(`[ONBOARDING] No fee schedules for ${stateCode}, attempting discovery...`);
        setFeeDiscoveryStatus('discovering');

        try {
          const { data: feeData, error: feeError } = await supabase.functions.invoke('discover-state-fees', {
            body: { state: stateCode }
          });

          if (feeError) {
            console.error('[ONBOARDING] Fee discovery error:', feeError);
            setFeeDiscoveryStatus('not_found');
          } else if (feeData?.success && feeData?.newly_discovered > 0) {
            setDiscoveredFees(feeData.fees || []);
            setFeeDiscoveryStatus('found');
            console.log(`[ONBOARDING] Discovered ${feeData.newly_discovered} new fees for ${stateCode}`);
          } else {
            setFeeDiscoveryStatus('not_found');
            console.log(`[ONBOARDING] No fees discovered for ${stateCode}`);
          }
        } catch (feeErr) {
          console.error('[ONBOARDING] Fee discovery exception:', feeErr);
          setFeeDiscoveryStatus('not_found');
        }
      }

      setTimeout(() => setStep(3), 2000);
    } catch (err) {
      console.error('Form discovery error:', err);
      setDiscoveredForms([]);
      setFeeDiscoveryStatus('not_found');
      setTimeout(() => setStep(3), 2000);
    } finally {
      setDiscovering(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && !formData.dealer_name) {
      alert('Please enter your dealership name');
      return;
    }
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => step > 1 && setStep(step - 1);

  const handleComplete = async () => {
    setLoading(true);
    try {
      // Get current user to set as owner
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be logged in to create a dealership');
        setLoading(false);
        return;
      }

      // Insert dealership with owner_user_id for multi-tenancy
      const { data: dealer, error: dealerError } = await supabase
        .from('dealer_settings')
        .insert([{ ...formData, owner_user_id: user.id }])
        .select()
        .single();
      if (dealerError) throw dealerError;
      if (dealer && discoveredForms.length > 0) {
        const dealerForms = discoveredForms.map(form => ({
          dealer_id: dealer.id,
          form_registry_id: form.id,
          is_enabled: true
        }));
        await supabase.from('dealer_forms').insert(dealerForms);
      }
      useStore.getState().setDealer(dealer);
      await useStore.getState().fetchAllData();
      onComplete?.();
    } catch (err) {
      console.error('Setup error:', err);
      alert('Error saving settings: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = { backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '24px', overflow: 'hidden' };
  const inputStyle = { width: '100%', padding: '18px 20px', backgroundColor: '#27272a', border: '2px solid #3f3f46', borderRadius: '12px', color: '#fff', fontSize: '16px', outline: 'none' };
  const labelStyle = { display: 'block', fontSize: '15px', fontWeight: '500', color: '#d4d4d8', marginBottom: '12px' };
  const btnNextStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 32px', backgroundColor: '#f97316', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '16px', fontWeight: '600', cursor: 'pointer' };
  const btnBackStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 24px', backgroundColor: 'transparent', border: 'none', borderRadius: '12px', color: '#a1a1aa', fontSize: '16px', fontWeight: '500', cursor: 'pointer' };

  return (
    <div style={cardStyle}>
      <div style={{ padding: '40px 48px 32px 48px', borderBottom: '1px solid #27272a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {STEPS.map((name, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', backgroundColor: step >= idx + 1 ? '#f97316' : '#27272a', color: step >= idx + 1 ? '#fff' : '#71717a', border: step >= idx + 1 ? 'none' : '1px solid #3f3f46' }}>{idx + 1}</div>
                <span style={{ marginTop: '12px', fontSize: '14px', fontWeight: '500', color: step >= idx + 1 ? '#fff' : '#71717a' }}>{name}</span>
              </div>
              {idx < STEPS.length - 1 && <div style={{ flex: '1', height: '4px', backgroundColor: step > idx + 1 ? '#f97316' : '#3f3f46', margin: '0 16px', marginTop: '-24px', borderRadius: '2px', minWidth: '60px' }} />}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '48px' }}>
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#f97316', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}><Sparkles size={18} /> OG Arnie</div>
              <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Set Up Your Dealership</h2>
              <p style={{ fontSize: '18px', color: '#a1a1aa' }}>We will configure state-specific forms and compliance.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div>
                <label style={labelStyle}>Dealership Name<span style={{ color: '#f97316', marginLeft: '4px' }}>*</span></label>
                <input type="text" value={formData.dealer_name} onChange={(e) => updateField('dealer_name', e.target.value)} placeholder="e.g. Smith Auto Sales" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label style={labelStyle}>State<span style={{ color: '#f97316', marginLeft: '4px' }}>*</span></label>
                  <select value={formData.state} onChange={(e) => updateField('state', e.target.value)} style={inputStyle}>{US_STATES.map(state => (<option key={state} value={state}>{state}</option>))}</select>
                </div>
                <div>
                  <label style={labelStyle}>County</label>
                  <input type="text" value={formData.county} onChange={(e) => updateField('county', e.target.value)} placeholder="e.g. Salt Lake" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Dealer License #</label>
                <input type="text" value={formData.dealer_license} onChange={(e) => updateField('dealer_license', e.target.value)} placeholder="e.g. DL-123456" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Street Address</label>
                <input type="text" value={formData.address} onChange={(e) => updateField('address', e.target.value)} placeholder="e.g. 123 Main Street" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input type="text" value={formData.city} onChange={(e) => updateField('city', e.target.value)} placeholder="e.g. Salt Lake City" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ZIP Code</label>
                  <input type="text" value={formData.zip} onChange={(e) => updateField('zip', e.target.value)} placeholder="e.g. 84101" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="e.g. (801) 555-1234" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} placeholder="e.g. info@dealer.com" style={inputStyle} />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px auto' }}><Search color="#f97316" size={48} /></div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Discovering Requirements</h2>
            <p style={{ fontSize: '18px', color: '#a1a1aa', marginBottom: '40px' }}>OG Arnie is configuring {formData.state} dealership settings...</p>
            <div style={{ backgroundColor: '#27272a', borderRadius: '16px', padding: '32px', maxWidth: '500px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Loader2 className="animate-spin" color="#f97316" size={28} />
                <span style={{ color: '#d4d4d8', fontSize: '18px' }}>Searching required forms...</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {feeDiscoveryStatus === 'pending' ? (
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#3f3f46' }} />
                ) : feeDiscoveryStatus === 'checking' || feeDiscoveryStatus === 'discovering' ? (
                  <Loader2 className="animate-spin" color="#f97316" size={28} />
                ) : feeDiscoveryStatus === 'found' ? (
                  <CheckCircle2 color="#22c55e" size={28} />
                ) : (
                  <DollarSign color="#71717a" size={28} />
                )}
                <span style={{ color: '#d4d4d8', fontSize: '18px' }}>
                  {feeDiscoveryStatus === 'pending' ? 'Waiting for fee discovery...' :
                   feeDiscoveryStatus === 'checking' ? 'Checking fee schedules...' :
                   feeDiscoveryStatus === 'discovering' ? 'Discovering state fees...' :
                   feeDiscoveryStatus === 'found' ? 'Fee schedules configured ✓' :
                   'Fee schedules not found'}
                </span>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px auto' }}><FileText color="#f97316" size={48} /></div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Configuration Complete</h2>
            <p style={{ fontSize: '18px', color: '#a1a1aa', marginBottom: '40px' }}>
              {discoveredForms.length > 0 ? `Found ${discoveredForms.length} forms` : 'Default forms configured'}
              {discoveredFees.length > 0 && ` and ${discoveredFees.length} fee schedules`} for {formData.state}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: discoveredFees.length > 0 ? '1fr 1fr' : '1fr', gap: '24px', maxWidth: '900px', margin: '0 auto' }}>
              {/* Forms */}
              <div style={{ backgroundColor: '#27272a', borderRadius: '16px', padding: '32px', textAlign: 'left', maxHeight: '300px', overflowY: 'auto' }}>
                <div style={{ color: '#f97316', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>📄 FORMS</div>
                {discoveredForms.length > 0 ? discoveredForms.map((form, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#d4d4d8', fontSize: '15px', padding: '8px 0', borderBottom: i === discoveredForms.length - 1 ? 'none' : '1px solid #3f3f46' }}>
                    <CheckCircle2 color="#22c55e" size={20} />
                    <div>
                      <div style={{ fontWeight: '500' }}>{form.form_name}</div>
                      {form.form_number && <div style={{ fontSize: '12px', color: '#71717a' }}>{form.form_number}</div>}
                    </div>
                  </div>
                )) : ['Bill of Sale', 'Title Application', 'Odometer Disclosure', "Buyer's Guide"].map((form, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#d4d4d8', fontSize: '15px', padding: '8px 0', borderBottom: i === 3 ? 'none' : '1px solid #3f3f46' }}>
                    <CheckCircle2 color="#22c55e" size={20} />
                    {form}
                  </div>
                ))}
              </div>

              {/* Fees (if discovered) */}
              {discoveredFees.length > 0 && (
                <div style={{ backgroundColor: '#27272a', borderRadius: '16px', padding: '32px', textAlign: 'left', maxHeight: '300px', overflowY: 'auto' }}>
                  <div style={{ color: '#22c55e', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>💰 FEE SCHEDULES</div>
                  {discoveredFees.map((fee, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#d4d4d8', fontSize: '15px', padding: '8px 0', borderBottom: i === discoveredFees.length - 1 ? 'none' : '1px solid #3f3f46' }}>
                      <CheckCircle2 color="#22c55e" size={20} />
                      <div>
                        <div style={{ fontWeight: '500' }}>{fee.fee_name}</div>
                        {fee.verified && <div style={{ fontSize: '12px', color: '#22c55e' }}>✓ Verified</div>}
                        {fee.ai_discovered && !fee.verified && <div style={{ fontSize: '12px', color: '#f97316' }}>⚠ Needs verification</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px auto' }}><CheckCircle2 color="#22c55e" size={48} /></div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>You're All Set!</h2>
            <p style={{ fontSize: '18px', color: '#a1a1aa', marginBottom: '40px' }}>Your dealership is configured and ready to go.</p>
            <div style={{ backgroundColor: '#27272a', borderRadius: '16px', padding: '32px', maxWidth: '500px', margin: '0 auto', textAlign: 'left' }}>
              <p style={{ color: '#71717a', fontSize: '14px', marginBottom: '8px' }}>Your setup:</p>
              <p style={{ color: '#fff', fontSize: '24px', fontWeight: '600' }}>{formData.dealer_name || 'Your Dealership'}</p>
              <p style={{ color: '#a1a1aa', fontSize: '18px', marginTop: '4px' }}>{formData.city}{formData.city && formData.state ? ', ' : ''}{formData.state}</p>
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ color: '#71717a', fontSize: '14px' }}>✓ {discoveredForms.length || 'Default'} forms configured</p>
                {discoveredFees.length > 0 && (
                  <p style={{ color: '#71717a', fontSize: '14px' }}>✓ {discoveredFees.length} fee schedules configured</p>
                )}
                {feeDiscoveryStatus === 'not_found' && (
                  <p style={{ color: '#f97316', fontSize: '14px' }}>⚠ Fee schedules require manual entry</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '24px 48px', backgroundColor: '#0f0f10', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleBack} disabled={step === 1 || step === 2} style={{ ...btnBackStyle, opacity: (step === 1 || step === 2) ? 0.4 : 1, cursor: (step === 1 || step === 2) ? 'not-allowed' : 'pointer' }}><ChevronLeft size={22} /> Back</button>
        {step === 2 ? (
          <div style={{ color: '#71717a', fontSize: '14px' }}>Please wait...</div>
        ) : step < 4 ? (
          <button onClick={handleNext} style={btnNextStyle}>Continue <ChevronRight size={22} /></button>
        ) : (
          <button onClick={handleComplete} disabled={loading} style={{ ...btnNextStyle, opacity: loading ? 0.7 : 1 }}>{loading ? <><Loader2 className="animate-spin" size={22} /> Setting up...</> : <>Launch Dashboard <ChevronRight size={22} /></>}</button>
        )}
      </div>
    </div>
  );
}