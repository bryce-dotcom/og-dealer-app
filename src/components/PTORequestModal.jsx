import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function PTORequestModal({ employee, dealerId, onClose, onSuccess, theme }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestType, setRequestType] = useState('pto');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ptoBalance = Math.max(0, (employee?.pto_accrued || 0) - (employee?.pto_used || 0));

  // Calculate business days between dates
  const calculateDays = () => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) days++;
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const daysRequested = calculateDays();
  const hasEnoughPTO = requestType !== 'pto' || daysRequested <= ptoBalance;

  const handleSubmit = async () => {
    if (!startDate || !endDate || daysRequested === 0) {
      alert('Please select valid dates');
      return;
    }
    if (requestType === 'pto' && daysRequested > ptoBalance) {
      alert(`You only have ${ptoBalance.toFixed(1)} PTO days available`);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('time_off_requests').insert({
      employee_id: employee.id,
      start_date: startDate,
      end_date: endDate,
      days_requested: daysRequested,
      request_type: requestType,
      reason: reason,
      status: 'pending',
      dealer_id: dealerId
    });

    if (error) {
      alert('Failed to submit request: ' + error.message);
    } else {
      onSuccess?.();
      onClose();
    }
    setSubmitting(false);
  };

  const inputStyle = { width: '100%', padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '6px', fontWeight: '600' };

  const requestTypes = [
    { value: 'pto', label: '🏖️ PTO (Paid)', color: '#3b82f6' },
    { value: 'sick', label: '🤒 Sick Leave', color: '#eab308' },
    { value: 'personal', label: '👤 Personal Day', color: '#8b5cf6' },
    { value: 'unpaid', label: '📅 Unpaid Leave', color: '#71717a' }
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '480px', width: '100%', margin: '16px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, transparent 100%)' }}>
          <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>Request Time Off</h2>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>
            Available PTO: <span style={{ color: '#3b82f6', fontWeight: '700' }}>{ptoBalance.toFixed(1)} days</span>
          </p>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Request Type */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Type of Leave</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {requestTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setRequestType(type.value)}
                  style={{
                    padding: '12px',
                    backgroundColor: requestType === type.value ? `${type.color}20` : theme.bg,
                    border: `2px solid ${requestType === type.value ? type.color : theme.border}`,
                    borderRadius: '10px',
                    color: requestType === type.value ? type.color : theme.textSecondary,
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                }}
                min={new Date().toISOString().split('T')[0]}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || new Date().toISOString().split('T')[0]}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Days Summary */}
          {daysRequested > 0 && (
            <div style={{
              padding: '16px',
              backgroundColor: hasEnoughPTO ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              borderRadius: '10px',
              border: `1px solid ${hasEnoughPTO ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Days Requested (Business Days)</span>
                <span style={{ color: hasEnoughPTO ? '#22c55e' : '#ef4444', fontSize: '24px', fontWeight: '700' }}>{daysRequested}</span>
              </div>
              {requestType === 'pto' && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted }}>
                  {hasEnoughPTO 
                    ? `Remaining PTO after approval: ${(ptoBalance - daysRequested).toFixed(1)} days`
                    : `⚠️ Exceeds available PTO by ${(daysRequested - ptoBalance).toFixed(1)} days`
                  }
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Reason (Optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Vacation, appointment, etc..."
              rows={3}
              style={{ ...inputStyle, resize: 'none' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '14px',
                backgroundColor: theme.border, color: theme.text,
                border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || daysRequested === 0 || (requestType === 'pto' && !hasEnoughPTO)}
              style={{
                flex: 1, padding: '14px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: '#fff', border: 'none', borderRadius: '10px',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                opacity: submitting || daysRequested === 0 || (requestType === 'pto' && !hasEnoughPTO) ? 0.5 : 1
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}