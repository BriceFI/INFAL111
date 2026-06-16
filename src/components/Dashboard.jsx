import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/format';
import { Trophy, LayoutDashboard, LogOut, Send, CheckCircle2, XCircle, Clock } from 'lucide-react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { 
  BunkerStyles, RoboticAssembly, LogisticsBay, ResearchLab, 
  HydroponicsBay, PowerStation, AutomatedStorage 
} from './BunkerRooms';
import AdminView from './AdminView';

export default function Dashboard({ session }) {
  const [profile, setProfile] = useState(null);
  const [group, setGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [profiles, setProfiles] = useState([]);
  
  // Modals state
  const [resultModal, setResultModal] = useState(null);
  const navigate = useNavigate();
  
  // Question state for students
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const debounceRef = useRef(null);
  const broadcastRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch user profile and group details
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, is_admin, group_id, pacman_high_score, tetris_high_score, energy_high_score, groups(*)')
        .eq('user_id', session.user.id)
        .single();
      
      if (myProfile) {
        setProfile(myProfile);

        // 2. Auto-assignment if no group assigned and not admin
        let currentGroupId = myProfile.group_id;
        let currentGroup = myProfile.groups;

        if (!myProfile.is_admin && !currentGroupId) {
          const { data: assignedGroupId } = await supabase.rpc('assign_user_to_group', { p_user_id: session.user.id });
          if (assignedGroupId) {
            currentGroupId = assignedGroupId;
            const { data: newGroup } = await supabase
              .from('groups')
              .select('*')
              .eq('id', assignedGroupId)
              .single();
            if (newGroup) {
              currentGroup = newGroup;
            }
          }
        }

        if (currentGroup) {
          setGroup(currentGroup);
          
          // 3. Fetch group members
          const { data: members } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('group_id', currentGroupId);
          if (members) {
            setGroupMembers(members);
          }
        }
      }

      // 4. Fetch group leaderboard
      const { data: leadData } = await supabase.rpc('get_leaderboard');
      if (leadData) setLeaderboard(leadData);

      // 5. Fetch all profiles with group names for admin usage
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, is_admin, group_id, pacman_high_score, tetris_high_score, energy_high_score, groups(*)')
        .order('last_name', { ascending: true });
      if (allProfiles) setProfiles(allProfiles);

      // 6. Fetch active question for student
      if (myProfile && !myProfile.is_admin) {
        const { data: qData } = await supabase
          .from('questions')
          .select('id, question_text, options, duration, is_active, is_poll, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (qData) {
          setActiveQuestion(qData);
          const { data: aData } = await supabase
            .from('answers')
            .select('id')
            .eq('question_id', qData.id)
            .eq('user_id', session.user.id);
            
          setHasAnswered(aData && aData.length > 0);
          
          // Calculate time left
          const created = new Date(qData.created_at).getTime();
          const now = new Date().getTime();
          const qDuration = qData.duration || 30;
          const diff = Math.max(0, Math.floor((created + (qDuration * 1000) - now) / 1000));
          setTimeLeft(diff);
        } else {
          setActiveQuestion(null);
          setHasAnswered(false);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, [session.user.id]);

  useEffect(() => {
    fetchData();

    const debouncedFetch = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        fetchData();
      }, 300);
    };

    // Listen for DB changes
    const dbChannel = supabase.channel('realtime_supervision')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, debouncedFetch)
      .subscribe();

    // Listen for instant admin broadcast (primary)
    broadcastRef.current = supabase.channel('question_broadcast')
      .on('broadcast', { event: 'question_update' }, debouncedFetch)
      .subscribe();
      
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      supabase.removeChannel(dbChannel);
      if (broadcastRef.current) supabase.removeChannel(broadcastRef.current);
    };
  }, [fetchData]);

  // Student Timer Effect
  useEffect(() => {
    if (!activeQuestion || hasAnswered) {
      return;
    }
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setActiveQuestion(null); // Force close on timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [activeQuestion, hasAnswered]);

  const submitAnswer = async () => {
    if (selectedOption === null || !activeQuestion || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (activeQuestion.is_poll) {
        const { error } = await supabase.rpc('submit_poll_answer', {
          p_question_id: activeQuestion.id,
          p_chosen_index: selectedOption,
        });
        if (error) {
          setResultModal({ type: 'error', message: error.message, amount: '' });
        } else {
          setHasAnswered(true);
          broadcastRef.current?.send({ type: 'broadcast', event: 'question_update', payload: {} });
          setResultModal({ type: 'poll', message: 'Vote enregistré 📊', amount: 'Merci pour votre avis !' });
        }
      } else {
        const { data, error } = await supabase.rpc('submit_answer', {
          p_question_id: activeQuestion.id,
          p_chosen_index: selectedOption,
        });
        if (error) {
          setResultModal({ type: 'error', message: error.message, amount: '' });
        } else {
          setHasAnswered(true);
          broadcastRef.current?.send({ type: 'broadcast', event: 'question_update', payload: {} });
          const { is_correct, impact } = data || {};
          if (is_correct) {
            setResultModal({ type: 'success', message: 'Analyse Correcte', amount: `+ ${formatCurrency(impact)}` });
          } else {
            setResultModal({ type: 'error', message: 'Erreur Stratégique', amount: `- ${formatCurrency(impact)}` });
          }
        }
      }
    } finally {
      setIsSubmitting(false);
      setSelectedOption(null);
    }
  };

  const handleSaveScore = useCallback(async (gameType, score) => {
    try {
      // Anti-triche : Génération d'une signature numérique du score
      const salt = 'cesi_2026';
      const str = `${score}:${session.user.id}:${gameType}:${salt}`;
      let checksum = 0;
      for (let i = 0; i < str.length; i++) {
        checksum = (checksum * 31 + str.charCodeAt(i)) % 999983;
      }

      const { error } = await supabase.rpc('submit_game_score', {
        p_game_type: gameType,
        p_score: score,
        p_checksum: checksum,
      });
      if (error) {
        console.error('Error saving score:', error);
      } else {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  }, [fetchData, session.user.id]);

  if (profile?.is_admin) {
    return (
      <div className="h-screen w-full bg-beige-50 flex flex-col relative overflow-hidden text-neutral-800">
        <div className="absolute top-6 left-6 right-6 z-30 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-4 bg-white/80 backdrop-blur-xl p-3 pl-4 pr-6 rounded-2xl shadow-xl pointer-events-auto border-2 border-terracotta-400">
            <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center text-white shadow-lg">
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h1 className="text-[10px] font-black uppercase tracking-[0.2em] text-terracotta-600 leading-none mb-1">MODE ADMINISTRATEUR</h1>
              <div className="text-lg font-black tracking-tight text-neutral-900 leading-none">Supervision</div>
            </div>
          </div>
          <div className="pointer-events-auto">
            <button onClick={() => supabase.auth.signOut()} className="w-14 h-14 bg-neutral-900 text-white hover:bg-terracotta-600 rounded-2xl flex items-center justify-center shadow-xl active:scale-95">
              <LogOut size={22} />
            </button>
          </div>
        </div>
        <AdminView profiles={profiles} leaderboard={leaderboard} />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-beige-50 flex flex-col relative overflow-hidden text-neutral-800">
      <BunkerStyles />

      {/* Floating Header */}
      <div className="absolute top-3 md:top-6 left-3 md:left-6 right-3 md:right-6 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 bg-white/80 backdrop-blur-xl p-2 md:p-3 pl-3 md:pl-4 pr-4 md:pr-6 rounded-2xl border border-white/50 shadow-2xl premium-shadow pointer-events-auto">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-terracotta-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-terracotta-200">
            <LayoutDashboard size={20} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-[10px] font-black uppercase tracking-[0.2em] text-terracotta-600/70 leading-none mb-1">
              Équipe : {groupMembers.map(m => `${m.first_name} ${m.last_name}`).join(', ') || 'Seul'}
            </h1>
            <div className="text-lg font-black tracking-tight text-neutral-900 leading-none">{group?.name || 'Assignation...'}</div>
          </div>
          <div className="block sm:hidden">
            <div className="text-sm font-black tracking-tight text-neutral-900 leading-none">{group?.name || '...'}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4 pointer-events-auto">
          <div className="bg-white/80 backdrop-blur-xl px-3 md:px-6 py-2 md:py-3 rounded-2xl border border-white/50 shadow-2xl premium-shadow flex flex-col items-end">
            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-0.5">Budget Groupe</span>
            <span className={`text-lg md:text-2xl font-black tracking-tighter tabular-nums ${group?.balance < 0 ? 'text-red-500' : 'text-terracotta-700'}`}>
              {formatCurrency(group?.balance || 0)}
            </span>
          </div>
          <button onClick={() => navigate('/leaderboard')} className="w-10 h-10 md:w-14 md:h-14 bg-white/80 backdrop-blur-xl border border-white/50 hover:border-terracotta-200 text-neutral-600 rounded-2xl flex items-center justify-center transition-all shadow-2xl active:scale-95"><Trophy size={20} /></button>
          <button onClick={() => supabase.auth.signOut()} className="w-10 h-10 md:w-14 md:h-14 bg-neutral-900 text-white hover:bg-terracotta-600 rounded-2xl flex items-center justify-center shadow-xl active:scale-95"><LogOut size={18} /></button>
        </div>
      </div>

      <main className="flex-1 mt-20 md:mt-28 mb-4 md:mb-6 mx-3 md:mx-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 relative">
        <RoomCard title="Unité d'Assemblage" delay="0s">
          <RoboticAssembly onGameOver={(score) => handleSaveScore('pacman', score)} />
        </RoomCard>
        <RoomCard title="Flux Logistique" delay="0.1s">
          <LogisticsBay />
        </RoomCard>
        <RoomCard title="Laboratoire R&D" delay="0.2s">
          <ResearchLab onGameOver={(score) => handleSaveScore('tetris', score)} />
        </RoomCard>
        <RoomCard title="Centre Hydroponique" delay="0.3s">
          <HydroponicsBay />
        </RoomCard>
        <RoomCard title="Génération Énergie" delay="0.4s">
          <PowerStation onGameOver={(score) => handleSaveScore('energy', score)} />
        </RoomCard>
        <RoomCard title="Système de Stockage" delay="0.5s">
          <AutomatedStorage />
        </RoomCard>
      </main>

      {/* STUDENT QUESTION / POLL MODAL */}
      {activeQuestion && !hasAnswered && (
        <div className="fixed inset-0 z-[110] bg-neutral-900/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 md:p-6 entrance-anim">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] w-full max-w-2xl shadow-2xl flex flex-col border border-white/20 relative overflow-hidden max-h-[95vh] md:max-h-[90vh]">
            {/* Barre de progression (Fixe en haut) */}
            <div
              className={`absolute top-0 left-0 h-2 z-10 transition-all duration-1000 ${activeQuestion.is_poll ? 'bg-blue-500' : 'bg-terracotta-500'}`}
              style={{ width: `${(timeLeft / (activeQuestion.duration || 30)) * 100}%` }}
            />

            {/* Zone Scrollable (Questions + Options) */}
            <div className="flex-1 overflow-y-auto p-6 md:p-12 pt-10 md:pt-16 flex flex-col items-center">
              {/* Badge type + timer */}
              <div className="flex items-center gap-3 mb-8 flex-shrink-0">
                {activeQuestion.is_poll ? (
                  <div className="flex items-center gap-3 bg-blue-50 px-6 py-2 rounded-full border border-blue-100">
                    <span className="text-lg">📊</span>
                    <span className="font-black text-sm tracking-widest text-blue-600">SONDAGE — {timeLeft}s</span>
                  </div>
                ) : (
                  <div className={`flex items-center gap-3 bg-terracotta-50 px-6 py-2 rounded-full ${timeLeft < 10 ? 'bg-red-50' : ''}`}>
                    <Clock size={18} className={`text-terracotta-600 ${timeLeft < 10 ? 'animate-pulse text-red-500' : ''}`} />
                    <span className={`font-black text-sm tracking-widest ${timeLeft < 10 ? 'text-red-500' : 'text-terracotta-600'}`}>{timeLeft} SECONDES</span>
                  </div>
                )}
              </div>

              <h2 className="text-2xl md:text-3xl font-black text-neutral-900 mb-10 text-center leading-tight break-words w-full" style={{ wordBreak: 'break-word' }}>
                {activeQuestion.question_text}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-4">
                {activeQuestion.options.map((opt, idx) => (
                  <button key={idx} onClick={() => setSelectedOption(idx)}
                    className={`p-6 rounded-2xl border-2 text-left transition-all duration-300 ${
                      selectedOption === idx
                        ? activeQuestion.is_poll
                          ? 'border-blue-500 bg-blue-50 shadow-lg scale-[1.02]'
                          : 'border-terracotta-500 bg-terracotta-50 shadow-lg scale-[1.02]'
                        : activeQuestion.is_poll
                          ? 'border-beige-100 bg-white hover:border-blue-200'
                          : 'border-beige-100 bg-white hover:border-terracotta-200'
                    }`}>
                    <div className="flex items-start gap-3">
                      <span className={`font-black text-lg flex-shrink-0 mt-0.5 ${activeQuestion.is_poll ? 'text-blue-300' : 'text-terracotta-200'}`}>{['A', 'B', 'C', 'D'][idx]}</span>
                      <span className="font-bold text-neutral-800 break-words leading-relaxed" style={{ wordBreak: 'break-word' }}>{opt}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Fixe (Bouton Valider) */}
            <div className="p-6 md:p-12 pt-4 bg-white border-t border-beige-50 w-full flex-shrink-0">
              <button onClick={submitAnswer} disabled={selectedOption === null || isSubmitting}
                className={`w-full text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-all ${
                  activeQuestion.is_poll
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-terracotta-600 hover:bg-terracotta-500'
                }`}>
                {isSubmitting ? 'Transmission...' : activeQuestion.is_poll ? 'Voter' : "Valider l'Analyse"}
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      )}


      {/* RESULT MODAL */}
      {resultModal && (
        <div className="fixed inset-0 z-[120] bg-beige-100/80 backdrop-blur-md flex items-center justify-center p-6 entrance-anim">
          <div className="bg-white rounded-[3rem] w-full max-w-sm shadow-2xl p-10 flex flex-col items-center text-center border border-white">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
              resultModal.type === 'success' ? 'bg-green-100 text-green-600' :
              resultModal.type === 'poll' ? 'bg-blue-100 text-blue-600' :
              'bg-red-100 text-red-600'
            }`}>
              {resultModal.type === 'success' ? <CheckCircle2 size={56} /> :
               resultModal.type === 'poll' ? <span className="text-5xl">📊</span> :
               <XCircle size={56} />}
            </div>
            <h2 className="text-2xl font-black text-neutral-900 mb-2">{resultModal.message}</h2>
            <div className={`text-xl font-bold mb-8 ${
              resultModal.type === 'success' ? 'text-green-600' :
              resultModal.type === 'poll' ? 'text-blue-600' :
              'text-red-600'
            }`}>{resultModal.amount}</div>
            <button onClick={() => setResultModal(null)} className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold uppercase tracking-widest hover:bg-neutral-800 transition-colors">Continuer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomCard({ title, children, delay }) {
  return (
    <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] border border-white/50 shadow-xl overflow-hidden flex flex-col group hover:shadow-[0_30px_60px_-15px_rgba(109,63,55,0.2)] transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] entrance-anim" style={{ animationDelay: delay }}>
      <div className="p-8 pb-2 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-terracotta-500 animate-ping"></div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400 group-hover:text-terracotta-600 transition-colors">{title}</h3>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-10 pt-4">{children}</div>
    </div>
  );
}

Dashboard.propTypes = { session: PropTypes.object.isRequired };
RoomCard.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node.isRequired, delay: PropTypes.string };
