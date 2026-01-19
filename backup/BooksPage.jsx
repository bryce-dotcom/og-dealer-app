import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function BooksPage() {
  const { dealerId } = useStore();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('tinder');

  useEffect(() => {
    loadData();
  }, [dealerId]);

  const loadData = async () => {
    if (!dealerId) return;
    setLoading(true);

    const [txRes, catRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('dealer_id', dealerId).eq('status', 'uncategorized').order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('dealer_id', dealerId)
    ]);

    setTransactions(txRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  };

  const categorize = async (categoryId, categoryName) => {
    const tx = transactions[currentIndex];
    if (!tx) return;

    await supabase.from('transactions').update({
      user_category: categoryName,
      status: 'categorized'
    }).eq('id', tx.id);

    setCurrentIndex(prev => prev + 1);
  };

  const skip = () => {
    setCurrentIndex(prev => prev + 1);
  };

  const currentTx = transactions[currentIndex];
  const remaining = transactions.length - currentIndex;

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type === 'expense');

  if (loading) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#71717a' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Books</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Money Tinder - Swipe to categorize</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setView('tinder')} style={{ padding: '8px 16px', backgroundColor: view === 'tinder' ? '#f97316' : '#27272a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Categorize</button>
          <button onClick={() => setView('list')} style={{ padding: '8px 16px', backgroundColor: view === 'list' ? '#f97316' : '#27272a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>All</button>
        </div>
      </div>

      {view === 'tinder' ? (
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          {remaining > 0 && currentTx ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '16px', color: '#71717a', fontSize: '14px' }}>
                {remaining} transactions to categorize
              </div>

              <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', marginBottom: '20px', border: '1px solid #27272a' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: currentTx.amount >= 0 ? '#4ade80' : '#fff', marginBottom: '8px' }}>
                    {currentTx.amount >= 0 ? '+' : ''}${Math.abs(currentTx.amount).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '18px', color: '#fff', marginBottom: '4px' }}>{currentTx.vendor || 'Unknown'}</div>
                  <div style={{ fontSize: '14px', color: '#71717a' }}>{currentTx.date}</div>
                  {currentTx.plaid_category && (
                    <div style={{ marginTop: '8px', padding: '4px 12px', backgroundColor: '#27272a', borderRadius: '12px', display: 'inline-block', fontSize: '12px', color: '#a1a1aa' }}>
                      {currentTx.plaid_category}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#4ade80', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>INCOME</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {incomeCategories.map(cat => (
                    <button key={cat.id} onClick={() => categorize(cat.id, cat.name)} style={{
                      padding: '10px 16px', backgroundColor: '#166534', color: '#4ade80',
                      border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
                    }}>{cat.name}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#f87171', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>EXPENSE</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {expenseCategories.map(cat => (
                    <button key={cat.id} onClick={() => categorize(cat.id, cat.name)} style={{
                      padding: '10px 16px', backgroundColor: '#7f1d1d', color: '#fca5a5',
                      border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
                    }}>{cat.name}</button>
                  ))}
                </div>
              </div>

              <button onClick={skip} style={{
                width: '100%', padding: '12px', backgroundColor: '#27272a', color: '#71717a',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}>Skip</button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#18181b', borderRadius: '16px', border: '1px solid #27272a' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
              <div style={{ color: '#4ade80', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>All caught up!</div>
              <div style={{ color: '#71717a' }}>No transactions to categorize</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a' }}>
          <div style={{ padding: '40px', textAlign: 'center', color: '#71717a' }}>
            Connect Plaid to see all transactions
          </div>
        </div>
      )}
    </div>
  );
}