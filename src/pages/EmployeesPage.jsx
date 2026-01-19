import { useTheme } from '../components/Layout';

// Inside the component:
const themeContext = useTheme();
const theme = themeContext?.theme || {
  bg: '#09090b', bgCard: '#18181b', border: '#27272a',
  text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
  accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
};

// Then use theme.bg, theme.bgCard, theme.text, etc instead of hardcoded colors
import { useStore } from '../lib/store';
import { Mail, Phone } from 'lucide-react';

export default function EmployeesPage() {
  const employees = useStore((state) => state.employees);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Team</h1>
        <p className="text-gray-500 mt-1">{employees?.length || 0} team members</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {employees?.map(e => (
          <div key={e.id} className="bg-[#111] border border-[#222] rounded-2xl p-6 hover:border-[#D4AF37]/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#D4AF37] flex items-center justify-center text-black font-bold text-2xl">
                {e.name[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">{e.name}</h3>
                  <span className="text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400">{e.status}</span>
                </div>
                <p className="text-[#D4AF37] font-medium">{e.role}</p>
                
                <div className="mt-4 space-y-2">
                  <a href={`mailto:${e.email}`} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                    <Mail size={16} />
                    <span className="text-sm">{e.email}</span>
                  </a>
                </div>

                <div className="mt-4 pt-4 border-t border-[#222] flex justify-between text-sm">
                  <span className="text-gray-500">Pay: <span className="text-white">{e.payRate > 0 ? `$${e.payRate}/hr` : 'Commission'}</span></span>
                  <span className="text-gray-500">{e.payType}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}