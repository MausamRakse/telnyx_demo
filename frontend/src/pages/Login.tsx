import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PhoneCall, Mail, Lock, Loader2, ArrowRight, User, Inbox, RefreshCw } from 'lucide-react';
import { getSupabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showVerificationSent, setShowVerificationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const navigate = useNavigate();

  const getFriendlyErrorMessage = (error: any) => {
    const message = error.message || '';
    if (message.includes('Invalid login credentials')) {
      return 'The email or password you entered is incorrect.';
    }
    if (message.includes('User already registered')) {
      return 'An account with this email already exists. Try logging in instead.';
    }
    if (message.includes('Email not confirmed')) {
      return 'Please verify your email address before logging in. Check your inbox!';
    }
    if (message.includes('Password should be at least')) {
      return 'Your password must be at least 6 characters long.';
    }
    return message || 'An unexpected error occurred. Please try again.';
  };

  const handleResendEmail = async () => {
    if (resendTimer > 0) return;
    
    setResendLoading(true);
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;
      toast.success('Verification email resent!');
      setResendTimer(60);
      const interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend email');
    } finally {
      setResendLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const sb = await getSupabase();
      if (isLogin) {
        const { error } = await sb.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        toast.success('Welcome back!');
        navigate('/dashboard');
      } else {
        const { error, data } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            },
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        
        // Check if confirmation is required
        if (data.session === null) {
          setShowVerificationSent(true);
        } else {
          toast.success('Welcome to convexa.ai!');
          navigate('/dashboard');
        }
      }
    } catch (error: any) {
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/5 via-bg to-bg">
      <div className="w-full max-w-[440px]">
        {/* Logo Section */}
        <Link to="/" className="flex flex-col items-center gap-4 mb-10 group">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/30 group-hover:scale-105 transition-transform duration-300">
            <PhoneCall className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-[28px] font-black tracking-tight text-surface-foreground">
            convexa<span className="text-primary italic">.ai</span>
          </h1>
        </Link>

        {/* Card Section */}
        <div className="bg-surface rounded-[32px] p-10 border border-border/60 shadow-2xl shadow-black/5 animate-in slide-in-from-top-4 duration-500">
          {showVerificationSent ? (
            <div className="text-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                <Inbox className="w-10 h-10 text-primary" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[10px] font-bold animate-bounce">
                  !
                </div>
              </div>
              
              <h2 className="text-[24px] font-bold text-surface-foreground mb-3">Verify Your Email</h2>
              <p className="text-textMuted text-[15px] leading-relaxed mb-8">
                We've sent a verification link to<br/>
                <span className="text-surface-foreground font-bold">{email}</span>.
                Please check your inbox to continue.
              </p>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleResendEmail}
                  disabled={resendLoading || resendTimer > 0}
                  className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-muted/50 text-[14px] font-bold text-surface-foreground hover:bg-muted transition-all disabled:opacity-50"
                >
                  {resendLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className={`w-4 h-4 ${resendTimer > 0 ? '' : 'animate-pulse text-primary'}`} />
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Email'}
                    </>
                  )}
                </button>

                <button 
                  onClick={() => {
                    setShowVerificationSent(false);
                    setIsLogin(true);
                  }}
                  className="text-[14px] font-bold text-textMuted hover:text-primary transition-colors py-2"
                >
                  Back to Login
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-10 text-center">
                <h2 className="text-[24px] font-bold text-surface-foreground mb-2">
                  {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-textMuted text-[14px]">
                  {isLogin ? 'Access your AI agent dashboard' : 'Start deploying intelligent voice agents'}
                </p>
              </div>

              <form onSubmit={handleAuth} className="flex flex-col gap-5">
                {!isLogin && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-300">
                    <label className="text-[13px] font-bold text-surface-foreground px-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-textMuted" />
                      <input 
                        type="text" 
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-muted/30 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-[15px]"
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-bold text-surface-foreground px-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-textMuted" />
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-muted/30 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-[15px]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-bold text-surface-foreground px-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-textMuted" />
                    <input 
                      type="password" 
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-border bg-muted/30 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all text-[15px]"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="mt-4 bg-primary text-primary-foreground py-4 rounded-2xl text-[16px] font-bold hover:bg-primary-hover transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group disabled:opacity-70"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      {isLogin ? 'Sign In' : 'Create Account'}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-10 flex flex-col gap-5 items-center">
                <button 
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[14px] font-bold text-textMuted hover:text-primary transition-colors underline-offset-4 hover:underline"
                >
                  {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-10 text-center">
          <p className="text-[13px] text-textMuted leading-relaxed">
            By continuing, you agree to convexa.ai&apos;s<br/>
            <a href="#" className="underline font-bold hover:text-surface-foreground transition-colors">Terms of Service</a> and <a href="#" className="underline font-bold hover:text-surface-foreground transition-colors">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
