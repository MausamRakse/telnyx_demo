import { Link } from 'react-router-dom';
import { 
  PhoneCall, 
  FileText, 
  Activity, 
  Layers, 
  ArrowRight, 
  Zap,
  Terminal
} from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen bg-bg text-surface-foreground selection:bg-primary/20">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-[20px] font-bold tracking-tight text-surface-foreground">convexa.ai</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login" className="text-[14px] font-medium text-textMuted hover:text-surface-foreground transition-colors">
              Sign In
            </Link>
            <Link 
              to="/login" 
              className="bg-primary text-primary-foreground px-5 py-2 rounded-lg text-[14px] font-semibold hover:bg-primary-hover transition-all shadow-lg shadow-primary/20"
            >
              Open Console
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-[13px] font-bold mb-8">
            <Zap className="w-4 h-4 fill-current" />
            <span>Now Live: Outbound Agent V1</span>
          </div>
          <h1 className="text-[64px] md:text-[84px] font-black tracking-tight leading-[1.05] mb-6">
            Intelligent Outbound<br/>
            <span className="text-primary italic">AI Calling Agent.</span>
          </h1>
          <p className="max-w-[700px] text-[18px] text-textMuted leading-relaxed mb-10">
            Deploy autonomous voice agents that can handle lead qualification, appointment booking, and customer support with human-like fluency. Complete dashboard for scale.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link 
              to="/login" 
              className="bg-primary text-primary-foreground px-8 py-4 rounded-xl text-[16px] font-bold hover:bg-primary-hover transition-all shadow-xl shadow-primary/30 flex items-center gap-2 group"
            >
              Launch Console
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button className="bg-muted text-surface-foreground border border-border px-8 py-4 rounded-xl text-[16px] font-bold hover:bg-muted/80 transition-all flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              View Documentation
            </button>
          </div>
        </div>
      </section>

      {/* Services/Features */}
      <section className="py-24 bg-surface/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-bold mb-4 text-surface-foreground">Our Services</h2>
            <p className="text-textMuted text-[16px]">Everything you need to automate your outbound operations</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-surface p-8 rounded-3xl border border-border hover:shadow-xl hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Layers className="w-6 h-6 text-primary group-hover:text-primary-foreground transition-colors" />
              </div>
              <h3 className="text-[20px] font-bold mb-3 text-surface-foreground">Bulk & Single Calling</h3>
              <p className="text-textMuted text-[15px] leading-relaxed">
                Upload Excel sheets for high-volume campaigns or dial single numbers instantly for testing with our flexible API.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-surface p-8 rounded-3xl border border-border hover:shadow-xl hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                <FileText className="w-6 h-6 text-accent group-hover:text-accent-foreground transition-colors" />
              </div>
              <h3 className="text-[20px] font-bold mb-3 text-surface-foreground">Smart Transcripts</h3>
              <p className="text-textMuted text-[15px] leading-relaxed">
                Automatically generated transcripts stored in JSON format for easy analysis and seamless CRM integration.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-surface p-8 rounded-3xl border border-border hover:shadow-xl hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-6 group-hover:bg-success group-hover:text-white transition-colors">
                <Activity className="w-6 h-6 text-success group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-[20px] font-bold mb-3 text-surface-foreground">Real-time Monitoring</h3>
              <p className="text-textMuted text-[15px] leading-relaxed">
                Watch live agent status, call duration, and connection health from a central dashboard in real-time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <PhoneCall className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-surface-foreground">convexa.ai</span>
          </div>
          <div className="flex gap-8 text-[14px] font-medium text-textMuted">
            <a href="#" className="hover:text-surface-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-surface-foreground transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-surface-foreground transition-colors">Contact Support</a>
          </div>
          <div className="text-textMuted text-[14px]">
            &copy; 2026 convexa.ai. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
