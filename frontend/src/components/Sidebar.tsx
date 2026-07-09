import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Bot, PhoneCall, Settings, LogOut, Hexagon, Megaphone, User, CalendarCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const Sidebar = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const sb = await getSupabase();
      sb.auth.getUser().then(({ data: { user } }: any) => {
        if (user) {
          setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');
        }
      });
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      const sb = await getSupabase();
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      toast.success('Signed out successfully');
      navigate('/login');
    } catch (error: any) {
      toast.error('Error signing out');
    }
  };
  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Agents', path: '/agents', icon: Bot },
    { name: 'Campaigns', path: '/campaigns', icon: Megaphone },
    { name: 'Call Logs', path: '/logs', icon: PhoneCall },
    { name: 'Meeting Logs', path: '/meetings', icon: CalendarCheck },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="w-[260px] h-full flex flex-col bg-surface border-r border-border shadow-sm">
      {/* Top Section */}
      <div className="p-6 pb-8 flex items-center justify-start gap-3">
        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <Hexagon className="w-6 h-6 fill-current" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-[20px] leading-tight text-surface-foreground tracking-tight">convexa.ai</span>
          <span className="text-[10px] text-textMuted uppercase font-semibold tracking-widest">Dashboard</span>
        </div>
      </div>

      {/* Nav Section */}
      <nav className="flex-1 flex flex-col gap-1.5 px-4 mt-2">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-medium transition-all duration-200
              ${isActive
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 translate-x-1'
                : 'text-textMuted hover:bg-muted hover:text-surface-foreground hover:translate-x-1'}
            `}
          >
            <item.icon className="w-[18px] h-[18px]" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-border mt-auto bg-muted/30">
        <div className="px-4 py-3 mb-2 flex items-center gap-3 bg-surface rounded-xl border border-border shadow-sm">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <User className="w-4 h-4" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-[13px] font-bold text-surface-foreground truncate">{userName || 'Loading...'}</span>
            <span className="text-[11px] text-textMuted font-medium truncate italic">Online</span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl text-error hover:bg-error/10 transition-all text-[14px] font-medium group"
        >
          <LogOut className="w-[18px] h-[18px] group-hover:-translate-x-1 transition-transform" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
