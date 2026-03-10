import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function InvestorLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if investor record exists
      const { data: investor } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (!investor) {
        alert('Investor account not found. Please contact support.');
        await supabase.auth.signOut();
        return;
      }

      // Redirect to dashboard
      navigate('/investor/dashboard');

    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!email || !password || !fullName) {
      alert('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // Create investor record
      const { error: investorError } = await supabase
        .from('investors')
        .insert({
          user_id: authData.user.id,
          email: email,
          full_name: fullName,
          status: 'pending', // Will be activated after verification
        });

      if (investorError) throw investorError;

      alert('Account created! Please check your email to verify your account.');
      setMode('login');

    } catch (error) {
      console.error('Signup error:', error);
      alert('Signup failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">OG Dealer</h1>
          <p className="text-blue-200">Investor Portal</p>
        </div>

        {/* Login/Signup Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition ${
                mode === 'login'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-blue-200 hover:bg-white/5'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 px-4 py-3 rounded-lg font-semibold transition ${
                mode === 'signup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-transparent text-blue-200 hover:bg-white/5'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); mode === 'login' ? handleLogin() : handleSignup(); }}>
            <div className="space-y-4">

              {mode === 'signup' && (
                <div>
                  <label className="block text-white font-semibold mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-white font-semibold mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="investor@example.com"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition mt-6"
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </div>
          </form>

          {mode === 'login' && (
            <div className="mt-4 text-center">
              <a href="#" className="text-blue-400 hover:text-blue-300 text-sm">
                Forgot password?
              </a>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-blue-200 text-sm">
          <p>Accredited investors only</p>
          <p className="mt-2 text-xs text-blue-300">
            By signing up, you agree to verify your accreditation status
          </p>
        </div>

        {/* Back to Main Site */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to OG Dealer
          </button>
        </div>

      </div>
    </div>
  );
}
