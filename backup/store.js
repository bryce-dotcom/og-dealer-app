import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from './supabase';

export const useStore = create(
  persist(
    (set, get) => ({
      dealerId: null,
      dealer: null,
      inventory: [],
      employees: [],
      bhphLoans: [],
      deals: [],
      customers: [],
      loading: false,

      setDealer: (dealer) => set({ dealer, dealerId: dealer?.id }),
      
      clearDealer: () => set({ dealer: null, dealerId: null, inventory: [], employees: [], bhphLoans: [], deals: [], customers: [] }),

      fetchAllData: async () => {
        const { dealerId } = get();
        if (!dealerId) return;
        
        set({ loading: true });
        
        const [invRes, empRes, bhphRes, dealsRes, custRes] = await Promise.all([
          supabase.from('inventory').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
          supabase.from('employees').select('*').eq('dealer_id', dealerId),
          supabase.from('bhph_loans').select('*').eq('dealer_id', dealerId),
          supabase.from('deals').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
          supabase.from('customers').select('*').eq('dealer_id', dealerId)
        ]);

        set({
          inventory: invRes.data || [],
          employees: empRes.data || [],
          bhphLoans: bhphRes.data || [],
          deals: dealsRes.data || [],
          customers: custRes.data || [],
          loading: false
        });
      },

      refreshInventory: async () => {
        const { dealerId } = get();
        if (!dealerId) return;
        const { data } = await supabase.from('inventory').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false });
        set({ inventory: data || [] });
      },

      refreshEmployees: async () => {
        const { dealerId } = get();
        if (!dealerId) return;
        const { data } = await supabase.from('employees').select('*').eq('dealer_id', dealerId);
        set({ employees: data || [] });
      },

      refreshBhphLoans: async () => {
        const { dealerId } = get();
        if (!dealerId) return;
        const { data } = await supabase.from('bhph_loans').select('*').eq('dealer_id', dealerId);
        set({ bhphLoans: data || [] });
      },

      refreshDeals: async () => {
        const { dealerId } = get();
        if (!dealerId) return;
        const { data } = await supabase.from('deals').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false });
        set({ deals: data || [] });
      }
    }),
    {
      name: 'og-dealer-storage',
      partialize: (state) => ({ dealerId: state.dealerId })
    }
  )
);