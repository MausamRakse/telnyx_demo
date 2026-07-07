import { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, Search, Mic, User, MapPin, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface Voice {
  id: number;
  name: string;
  badge?: string;
  gender: 'Female' | 'Male';
  language: string;
  accent: string;
  audioUrl: string;
  description: string;
}

const AVAILABLE_VOICES: Voice[] = [
  {
    id: 3,
    name: 'Asha',
    badge: 'Most Used',
    gender: 'Female',
    language: 'Hindi, English, Kannada, +7',
    accent: 'Indian',
    audioUrl: '/voice/Asha.mp3',
    description: 'A conversational, balanced, and direct voice ideal for survey intake and calendar bookings.'
  },
  {
    id: 1,
    name: 'Riya Mehta',
    badge: 'Most Used',
    gender: 'Female',
    language: 'Hindi, English, Kannada, +7',
    accent: 'Indian',
    audioUrl: '/voice/Riya_Mehta.mp3',
    description: 'A crisp, professional, and welcoming voice suitable for enterprise sales and customer support.'
  },
  {
    id: 2,
    name: 'Akash',
    badge: 'Popular',
    gender: 'Male',
    language: 'Hindi, English',
    accent: 'Indian',
    audioUrl: '/voice/Akash.mp3',
    description: 'A polite, friendly, and engaging male voice perfect for customer retention and feedback sessions.'
  }
];

interface Props {
  selectedVoiceId: number;
  onSelect: (voiceId: number) => void;
  onClose: () => void;
}

const VoiceSelectionModal = ({ selectedVoiceId, onSelect, onClose }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<string>('All');
  const [languageFilter, setLanguageFilter] = useState<string>('All');

  // Playback states
  const [playingVoiceId, setPlayingVoiceId] = useState<number | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop playback on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = (voice: Voice) => {
    // If playing, pause it
    if (playingVoiceId === voice.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
      return;
    }

    // Stop current audio if exists
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setLoadingVoiceId(voice.id);
    setPlayingVoiceId(null);

    const audio = new Audio(voice.audioUrl);
    audioRef.current = audio;

    audio.oncanplaythrough = () => {
      setLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
      audio.play().catch(err => {
        console.error("Audio playback error:", err);
        setPlayingVoiceId(null);
      });
    };

    audio.onwaiting = () => {
      setLoadingVoiceId(voice.id);
    };

    audio.onplaying = () => {
      setLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
    };

    audio.onended = () => {
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
    };

    audio.onerror = () => {
      toast.error('Failed to load voice sample.');
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
    };

    audio.load();
  };

  // Filter voices
  const filteredVoices = AVAILABLE_VOICES.filter(voice => {
    const matchesSearch = voice.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          voice.accent.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          voice.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesGender = genderFilter === 'All' || voice.gender === genderFilter;
    const matchesLanguage = languageFilter === 'All' || voice.language.includes(languageFilter);

    return matchesSearch && matchesGender && matchesLanguage;
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md transition-opacity animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="relative bg-surface border border-border/60 rounded-[24px] max-w-[720px] w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-border/40 flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Mic className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-surface-foreground uppercase tracking-wider">
                Select Voice
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-full text-textMuted hover:bg-muted/40 cursor-pointer transition-all border border-transparent hover:border-border/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inner Content Scroller */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col bg-muted/5">
          
          {/* Browse by Language Container */}
          <div className="bg-surface border border-border/40 p-4 rounded-xl shadow-sm mb-5 flex flex-col gap-3.5">
            <h3 className="font-bold text-[12px] text-surface-foreground uppercase tracking-wider">Browse by Language</h3>
            
            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={() => setLanguageFilter('All')} 
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  languageFilter === 'All' 
                    ? 'bg-[#1e293b] text-white shadow-sm' 
                    : 'bg-muted/40 hover:bg-muted text-textMuted border border-border/20'
                }`}
              >
                All
              </button>
              
              <button 
                onClick={() => setLanguageFilter('Hindi')} 
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  languageFilter === 'Hindi' 
                    ? 'bg-[#1e293b] text-white shadow-sm' 
                    : 'bg-muted/40 hover:bg-muted text-textMuted border border-border/20'
                }`}
              >
                <span>🇮🇳</span> Indian (+2 languages)
              </button>
            </div>

            {/* Search Input and Gender selection */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-border/10 w-full">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search voices..."
                  className="w-full pl-9 pr-3 py-1.5 text-[11px] bg-muted/20 border border-border rounded-lg text-surface-foreground placeholder:text-textMuted outline-none focus:border-primary transition-all w-full"
                />
              </div>

              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-muted/20 border border-border text-[11px] font-bold text-surface-foreground outline-none focus:border-primary cursor-pointer w-full sm:w-auto"
              >
                <option value="All">All Genders</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
          </div>

          {/* Section Header: Available Voices */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <h3 className="text-[14px] font-black text-surface-foreground uppercase tracking-tight">Available Voices</h3>
              <p className="text-[10px] text-textMuted">Organized by language for easy browsing</p>
            </div>
            <span className="text-[11px] font-black text-[#1e293b] bg-muted px-2.5 py-0.5 rounded-full border border-border/25">
              {filteredVoices.length} voice{filteredVoices.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Line-wise table view */}
          {filteredVoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center gap-3 opacity-60">
              <Mic className="w-10 h-10 text-textMuted opacity-40 animate-pulse" />
              <p className="font-bold text-[14px] text-textMuted">No voices match your filters.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-border/40 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-border/30 text-textMuted font-bold text-[10px] uppercase tracking-widest bg-muted/10">
                    <th className="px-3.5 py-3">Voice Name</th>
                    <th className="px-3.5 py-3">Language</th>
                    <th className="px-3.5 py-3">Gender</th>
                    <th className="px-3.5 py-3">Accent</th>
                    <th className="px-3.5 py-3 text-center">Preview</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filteredVoices.map((voice) => {
                    const isSelected = selectedVoiceId === voice.id;
                    const isPlaying = playingVoiceId === voice.id;
                    const isLoading = loadingVoiceId === voice.id;

                    return (
                      <tr 
                        key={voice.id} 
                        className={`hover:bg-primary/5 transition-colors group ${
                          isSelected ? 'bg-primary/5' : ''
                        }`}
                      >
                        {/* Voice Name & Badge */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-surface-foreground text-[13px]">{voice.name}</span>
                            {voice.badge && (
                              <span className="inline-flex mt-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/10 w-fit">
                                {voice.badge}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Language Tag */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/10">
                            <span>🇮🇳</span>
                            {voice.language}
                          </span>
                        </td>

                        {/* Gender with User Icon */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-textMuted font-medium text-[11px]">
                            <User className="w-3.5 h-3.5 opacity-60 text-surface-foreground" />
                            {voice.gender}
                          </span>
                        </td>

                        {/* Accent with Pin Icon */}
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-textMuted font-medium text-[11px]">
                            <MapPin className="w-3.5 h-3.5 opacity-60 text-surface-foreground" />
                            {voice.accent}
                          </span>
                        </td>

                        {/* Preview Audio Trigger */}
                        <td className="px-3.5 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayPause(voice);
                            }}
                            className={`px-3 py-1 rounded-lg flex items-center justify-center gap-1 text-[10px] font-black tracking-wide cursor-pointer transition-all active:scale-95 shadow-sm min-w-[70px] mx-auto ${
                              isPlaying
                                ? 'bg-success text-white shadow-success/15 hover:opacity-90'
                                : 'bg-[#1e293b] hover:bg-[#0f172a] text-white shadow-[#1e293b]/10'
                            }`}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Loading</span>
                              </>
                            ) : isPlaying ? (
                              <>
                                <Pause className="w-3 h-3 fill-current" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-current translate-x-0.5" />
                                <span>Play</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Action Select Button */}
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => onSelect(voice.id)}
                            className={`px-4.5 py-1 rounded-lg text-[11px] font-black cursor-pointer transition-all shadow-sm ${
                              isSelected
                                ? 'bg-primary text-primary-foreground hover:opacity-90 border border-transparent'
                                : 'bg-white border border-border/60 hover:bg-muted text-surface-foreground'
                            }`}
                          >
                            {isSelected ? 'Active' : 'Select'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceSelectionModal;
