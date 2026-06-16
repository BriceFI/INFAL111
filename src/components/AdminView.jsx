import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/format';
import {
  Trophy, Send, XCircle, AlertTriangle, CheckCircle,
  Clock, Trash2, ChevronRight, LayoutDashboard, History, LogOut
} from 'lucide-react';

export default function AdminView({ profiles, leaderboard }) {
  // Navigation
  const [currentTab, setCurrentTab] = useState('missions'); // 'missions', 'history', 'stats'
  const [leaderboardTab, setLeaderboardTab] = useState('teams');

  // Form state
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [reward, setReward] = useState(50000);
  const [penalty, setPenalty] = useState(10000);
  const [duration, setDuration] = useState(30);
  const [isPoll, setIsPoll] = useState(false);

  // Data state
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [pastQuestions, setPastQuestions] = useState([]);
  const [stats, setStats] = useState({ total: 0, answered: 0, correct: 0, wrong: 0 });

  const [timeLeft, setTimeLeft] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Detail modal state
  const [detailQuestion, setDetailQuestion] = useState(null);
  const [detailAnswers, setDetailAnswers] = useState([]);

  const debounceRef = useRef(null);
  const broadcastChannel = useRef(null);

  /* ─── Fetch ─── */
  const fetchActiveQuestion = useCallback(async () => {
    try {
      // Question active
      const { data: qData } = await supabase
        .from('questions')
        .select('id, question_text, options, duration, is_active, is_poll, reward, penalty, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActiveQuestion(qData || null);

      if (qData) {
        const created = new Date(qData.created_at).getTime();
        const now = new Date().getTime();
        const qDuration = qData.duration || 30;
        const diff = Math.max(0, Math.floor((created + qDuration * 1000 - now) / 1000));
        setTimeLeft(diff);

        // Stats pour la question active
        const { count: totalCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_admin', false);

        const { data: aData } = await supabase
          .from('answers')
          .select('user_id, is_correct')
          .eq('question_id', qData.id);

        setStats({
          answered: aData?.length || 0,
          total: totalCount || 0,
          correct: aData?.filter(a => a.is_correct).length || 0,
          wrong: aData?.filter(a => !a.is_correct).length || 0,
        });
      } else {
        setStats({ total: 0, answered: 0, correct: 0, wrong: 0 });
      }

      // Historique
      const { data: pData } = await supabase
        .from('questions')
        .select('id, question_text, options, duration, is_active, is_poll, reward, penalty, created_at')
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(20);
      setPastQuestions(pData || []);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, []);

  /* ─── Actions ─── */
  const handleClose = useCallback(async (qId) => {
    if (!qId) return;
    const { error } = await supabase.rpc('close_question', { p_question_id: qId });
    if (error) {
      alert("Erreur lors de la clôture: " + error.message);
    } else {
      fetchActiveQuestion();
      broadcastChannel.current?.send({ type: 'broadcast', event: 'question_update', payload: {} });
    }
  }, [fetchActiveQuestion]);

  const handleDelete = async (qId, e) => {
    e?.stopPropagation();
    if (!window.confirm('🚨 SUPPRESSION DÉFINITIVE : Supprimer cette question et toutes ses réponses ?')) return;
    
    setIsDeleting(true);
    try {
      // 1. Supprimer les réponses d'abord
      const { error: aError } = await supabase.from('answers').delete().eq('question_id', qId);
      if (aError) throw aError;

      // 2. Supprimer la question
      const { error: qError } = await supabase.from('questions').delete().eq('id', qId);
      if (qError) throw qError;

      // 3. Fermer le modal si besoin
      if (detailQuestion?.id === qId) setDetailQuestion(null);
      
      // 4. Refresh
      await fetchActiveQuestion();
      broadcastChannel.current?.send({ type: 'broadcast', event: 'question_update', payload: {} });
      
    } catch (err) {
      alert("Erreur lors de la suppression: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };


  const handleOpenDetail = async (q, e) => {
    e?.stopPropagation();
    setDetailQuestion(q);

    const { data: aData } = await supabase
      .from('answers')
      .select('user_id, is_correct, chosen_index')
      .eq('question_id', q.id);

    const enriched = (aData || []).map(a => {
      const profile = profiles.find(p => p.user_id === a.user_id);
      return {
        ...a,
        group_name: profile?.groups?.name || 'Sans groupe',
        first_name: profile?.first_name || 'Inconnu',
        last_name: profile?.last_name || '',
      };
    });
    setDetailAnswers(enriched);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (options.some(o => !o.trim())) return;
    const { error } = await supabase.from('questions').insert([{
      question_text: questionText,
      options,
      correct_option_index: isPoll ? 0 : correctIndex,
      reward: isPoll ? 0 : reward,
      penalty: isPoll ? 0 : penalty,
      duration,
      is_active: true,
      is_poll: isPoll,
    }]);
    if (!error) {
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectIndex(0);
      setIsPoll(false);
      fetchActiveQuestion();
      broadcastChannel.current?.send({ type: 'broadcast', event: 'question_update', payload: {} });
    } else {
      alert("Erreur création: " + error.message);
    }
  };

  /* ─── Effects ─── */
  useEffect(() => {
    fetchActiveQuestion();

    const debouncedFetch = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        fetchActiveQuestion();
      }, 300);
    };

    broadcastChannel.current = supabase.channel('question_broadcast')
      .on('broadcast', { event: 'question_update' }, debouncedFetch)
      .subscribe();

    const channel = supabase.channel('admin_realtime_full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      supabase.removeChannel(channel);
      if (broadcastChannel.current) supabase.removeChannel(broadcastChannel.current);
    };
  }, [fetchActiveQuestion]);

  useEffect(() => {
    if (!activeQuestion) {
      return;
    }
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          handleClose(activeQuestion.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [activeQuestion, handleClose]);

  return (
    <div className="flex w-full h-screen bg-beige-50 overflow-hidden">
      
      {/* ── Sidebar Menu (Desktop) ── */}
      <aside className="hidden md:flex w-64 bg-white border-r border-beige-200 flex-col pt-24 pb-6 px-4 shadow-sm z-20">
        <div className="space-y-2 flex-1">
          <MenuButton 
            icon={<LayoutDashboard size={18} />} 
            label="Missions Live" 
            active={currentTab === 'missions'} 
            onClick={() => setCurrentTab('missions')} 
          />
          <MenuButton 
            icon={<History size={18} />} 
            label="Historique" 
            active={currentTab === 'history'} 
            onClick={() => setCurrentTab('history')} 
          />
          <MenuButton 
            icon={<Trophy size={18} />} 
            label="Leaderboard" 
            active={currentTab === 'stats'} 
            onClick={() => setCurrentTab('stats')} 
          />
        </div>
        
        <div className="pt-6 border-t border-beige-100">
          <button 
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm"
          >
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto pt-20 md:pt-28 px-4 md:px-8 pb-24 md:pb-12">
        
        {currentTab === 'missions' && (
          <div className="max-w-5xl mx-auto w-full space-y-8">
            <h2 className="text-3xl font-black text-neutral-900 flex items-center gap-4">
              <AlertTriangle className="text-terracotta-500" /> Gestion des Missions
            </h2>

            {activeQuestion ? (
              <div className="bg-white rounded-[2.5rem] shadow-2xl border-2 border-terracotta-200 relative overflow-hidden transition-all">
                <div 
                  className="absolute top-0 left-0 h-1.5 bg-terracotta-500 transition-all duration-1000" 
                  style={{ width: `${(timeLeft / (activeQuestion.duration || 30)) * 100}%` }}
                />
                <div className="p-10">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
                    <div className="max-w-xl w-full">
                      <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-3 ${timeLeft < 10 ? 'text-red-500' : 'text-terracotta-600'}`}>
                        <Clock size={16} className={timeLeft < 10 ? 'animate-pulse' : ''} />
                        {timeLeft} secondes restantes
                      </div>
                      <h3 className="text-xl md:text-2xl font-black text-neutral-900 leading-tight break-words" style={{ wordBreak: 'break-word' }}>
                        {activeQuestion.question_text}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                      {activeQuestion.is_poll ? (
                        <StatCard label="Votes" value={stats.answered} color="text-blue-500" big />
                      ) : (
                        <>
                          <StatCard label="Juste" value={stats.correct} color="text-green-500" big />
                          <StatCard label="Faux" value={stats.wrong} color="text-red-500" big />
                        </>
                      )}
                      <StatCard label="Total" value={`${stats.answered}/${stats.total}`} color="text-neutral-900" big />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-10">
                    {activeQuestion.options.map((opt, idx) => {
                      const isCorrect = !activeQuestion.is_poll && idx === activeQuestion.correct_option_index;
                      return (
                        <div 
                          key={idx} 
                          className={`p-6 rounded-2xl border-2 flex items-center justify-between transition-all ${isCorrect ? 'border-green-500 bg-green-50 shadow-inner' : 'border-beige-100 bg-beige-50/50'}`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <span className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-black text-sm ${isCorrect ? 'bg-green-500 text-white' : 'bg-white text-neutral-400 border border-beige-200'}`}>
                              {['A', 'B', 'C', 'D'][idx]}
                            </span>
                            <span className="font-bold text-neutral-800 text-lg break-words overflow-hidden" style={{ wordBreak: 'break-word' }}>{opt}</span>
                          </div>
                          {isCorrect && <CheckCircle size={24} className="text-green-500" />}
                          {activeQuestion.is_poll && (
                            <div className="text-xs font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                              Option {['A', 'B', 'C', 'D'][idx]}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button 
                    onClick={() => handleClose(activeQuestion.id)} 
                    className="w-full bg-neutral-900 hover:bg-red-600 text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl active:scale-[0.98]"
                  >
                    <XCircle size={24} /> ARRÊTER LA MISSION IMMÉDIATEMENT
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-beige-200 p-10">
                {/* Toggle Mission / Sondage */}
                <div className="flex bg-beige-50 p-1.5 rounded-2xl border border-beige-100 mb-8">
                  <button type="button" onClick={() => setIsPoll(false)}
                    className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${!isPoll ? 'bg-terracotta-600 text-white shadow-lg' : 'text-neutral-400 hover:text-neutral-600'}`}>
                    ⚡ Mission
                  </button>
                  <button type="button" onClick={() => setIsPoll(true)}
                    className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${isPoll ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-400 hover:text-neutral-600'}`}>
                    📊 Sondage
                  </button>
                </div>
                <form onSubmit={handleCreate} className="space-y-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3 ml-2">
                      {isPoll ? 'Question du sondage' : 'Énoncé de la mission'}
                    </label>
                    <textarea required value={questionText} onChange={e => setQuestionText(e.target.value)}
                      className={`w-full h-32 bg-beige-50 border-2 rounded-3xl p-6 outline-none text-xl font-bold transition-all resize-none shadow-inner ${isPoll ? 'border-blue-100 focus:border-blue-400' : 'border-beige-100 focus:border-terracotta-500'}`}
                      placeholder={isPoll ? 'Ex: Quelle est la principale menace ?' : 'Ex: Quelle est la priorité stratégique ?'} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {options.map((opt, idx) => (
                      <div key={idx} className={`p-5 rounded-2xl border-2 transition-all ${!isPoll && correctIndex === idx ? 'border-green-400 bg-green-50/30' : 'border-beige-100 bg-white'}`}>
                        <div className="flex items-center justify-between mb-2">
                          {!isPoll ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={correctIndex === idx} onChange={() => setCorrectIndex(idx)} className="w-4 h-4 accent-green-600" />
                              <span className="text-[10px] font-black uppercase text-neutral-400">Option {['A','B','C','D'][idx]}</span>
                            </label>
                          ) : (
                            <span className="text-[10px] font-black uppercase text-blue-400">Option {['A','B','C','D'][idx]}</span>
                          )}
                          {!isPoll && correctIndex === idx && <span className="text-[8px] font-black bg-green-500 text-white px-2 py-0.5 rounded">CORRECTE</span>}
                        </div>
                        <input required type="text" value={opt}
                          onChange={e => { const n = [...options]; n[idx] = e.target.value; setOptions(n); }}
                          className="w-full bg-transparent outline-none font-bold text-neutral-900 border-b-2 border-beige-100 focus:border-terracotta-500 py-2 text-lg" />
                      </div>
                    ))}
                  </div>

                  <div className={`grid gap-6 ${isPoll ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {!isPoll && (
                      <>
                        <div className="bg-white p-4 rounded-2xl border-2 border-beige-100 focus-within:border-green-400 transition-all">
                          <span className="block text-[10px] font-black text-green-600 uppercase mb-1">Gain Capital (€)</span>
                          <input type="number" required value={reward} onChange={e => setReward(Number(e.target.value))} className="w-full bg-transparent outline-none font-black text-2xl text-green-600" />
                        </div>
                        <div className="bg-white p-4 rounded-2xl border-2 border-beige-100 focus-within:border-red-400 transition-all">
                          <span className="block text-[10px] font-black text-red-600 uppercase mb-1">Pénalité (€)</span>
                          <input type="number" required value={penalty} onChange={e => setPenalty(Number(e.target.value))} className="w-full bg-transparent outline-none font-black text-2xl text-red-600" />
                        </div>
                      </>
                    )}
                    <div className="bg-white p-4 rounded-2xl border-2 border-beige-100 focus-within:border-terracotta-400 transition-all">
                      <span className="block text-[10px] font-black text-terracotta-600 uppercase mb-1">Durée (secondes)</span>
                      <input type="number" required value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-transparent outline-none font-black text-2xl text-terracotta-600" />
                    </div>
                  </div>

                  <button type="submit" className={`w-full text-white font-black py-6 rounded-3xl transition-all shadow-2xl flex items-center justify-center gap-4 text-xl active:scale-[0.98] ${isPoll ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-terracotta-600 hover:bg-terracotta-700 shadow-terracotta-200'}`}>
                    <Send size={24} /> {isPoll ? 'LANCER LE SONDAGE' : 'LANCER LA MISSION'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {currentTab === 'history' && (
          <div className="max-w-5xl mx-auto w-full space-y-8">
            <h2 className="text-3xl font-black text-neutral-900 flex items-center gap-4">
              <History className="text-terracotta-500" /> Historique complet
            </h2>
            
            <div className="grid grid-cols-1 gap-4">
              {pastQuestions.map(q => (
                <div 
                  key={q.id} 
                  onClick={(e) => handleOpenDetail(q, e)}
                  className="bg-white border-2 border-transparent hover:border-terracotta-200 p-6 rounded-[2rem] flex items-center justify-between transition-all cursor-pointer shadow-sm hover:shadow-xl group"
                >
                  <div className="flex-1 min-w-0 pr-8">
                    <h4 className="text-lg font-black text-neutral-800 truncate mb-2">{q.question_text}</h4>
                    <div className="flex items-center gap-3">
                      {q.is_poll ? (
                        <span className="text-[10px] font-black px-3 py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-100">📊 SONDAGE</span>
                      ) : (
                        <>
                          <span className="text-[10px] font-black px-3 py-1 bg-green-50 text-green-600 rounded-full border border-green-100">+{formatCurrency(q.reward)}</span>
                          <span className="text-[10px] font-black px-3 py-1 bg-red-50 text-red-600 rounded-full border border-red-100">-{formatCurrency(q.penalty)}</span>
                        </>
                      )}
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{new Date(q.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      disabled={isDeleting}
                      onClick={(e) => handleDelete(q.id, e)} 
                      className="p-3 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={20} />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-beige-50 flex items-center justify-center text-neutral-300 group-hover:bg-terracotta-50 group-hover:text-terracotta-500 transition-all">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </div>
              ))}
              {pastQuestions.length === 0 && (
                <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-beige-200 text-neutral-400 font-bold">
                  Aucune mission terminée pour le moment.
                </div>
              )}
            </div>
          </div>
        )}

        {currentTab === 'stats' && (
          <div className="max-w-5xl mx-auto w-full space-y-8">
            <h2 className="text-3xl font-black text-neutral-900 flex items-center gap-4">
              <Trophy className="text-terracotta-500" /> Leaderboard Détaillé
            </h2>
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-beige-200 overflow-hidden flex flex-col">
              
              {/* Tabs Selector */}
              <div className="flex border-b border-beige-100 px-8 bg-white overflow-x-auto whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('teams')}
                  className={`pb-4 pt-4 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                    leaderboardTab === 'teams'
                      ? 'border-terracotta-600 text-terracotta-600'
                      : 'border-transparent text-neutral-400 hover:text-neutral-900'
                  }`}
                >
                  Finances Équipes
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('pacman')}
                  className={`pb-4 pt-4 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                    leaderboardTab === 'pacman'
                      ? 'border-terracotta-600 text-terracotta-600'
                      : 'border-transparent text-neutral-400 hover:text-neutral-900'
                  }`}
                >
                  Robotique Pacman
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('tetris')}
                  className={`pb-4 pt-4 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                    leaderboardTab === 'tetris'
                      ? 'border-terracotta-600 text-terracotta-600'
                      : 'border-transparent text-neutral-400 hover:text-neutral-900'
                  }`}
                >
                  Laboratoire Tetris
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardTab('energy')}
                  className={`pb-4 pt-4 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                    leaderboardTab === 'energy'
                      ? 'border-terracotta-600 text-terracotta-600'
                      : 'border-transparent text-neutral-400 hover:text-neutral-900'
                  }`}
                >
                  Générateur Énergie
                </button>
              </div>

              <div className="px-8 pb-8 mt-4">
                {leaderboardTab === 'teams' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="bg-beige-50 border-b border-beige-100">
                        <tr>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400">Rang</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400">Groupe</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400 text-center">Membres</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400 text-center">Réponses (Justes)</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400 text-center">Taux de réussite</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400 text-right">Budget Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige-100">
                        {leaderboard.map((item, idx) => (
                          <tr key={item.group_id} className="hover:bg-beige-50/50 transition-colors">
                            <td className="px-8 py-6">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${idx === 0 ? 'bg-amber-400 text-white shadow-lg' : idx === 1 ? 'bg-slate-300 text-white' : idx === 2 ? 'bg-orange-400 text-white' : 'text-neutral-400'}`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <div className="font-black text-neutral-900">{item.group_name}</div>
                            </td>
                            <td className="px-8 py-6 text-center">
                              <div className="text-sm font-bold text-neutral-500">{item.member_count}</div>
                            </td>
                            <td className="px-8 py-6 text-center">
                              <div className="text-sm font-bold text-neutral-500">{item.total_answers} ({item.correct_answers})</div>
                            </td>
                            <td className="px-8 py-6 text-center">
                              <span className={`text-xs font-black px-3 py-1 rounded-full ${item.success_rate >= 70 ? 'bg-green-50 text-green-600 border border-green-100' : item.success_rate >= 40 ? 'bg-yellow-50 text-yellow-600 border border-yellow-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                {item.success_rate}%
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className={`text-xl font-black tabular-nums ${item.balance < 0 ? 'text-red-500' : 'text-terracotta-700'}`}>
                                {formatCurrency(item.balance)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="bg-beige-50 border-b border-beige-100">
                        <tr>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400">Rang</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400">Élève</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400">Groupe</th>
                          <th className="px-8 py-6 text-[10px] font-black uppercase text-neutral-400 text-right">Meilleur Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige-100">
                        {(leaderboardTab === 'pacman' ? profiles.filter(p => !p.is_admin).sort((a, b) => (b.pacman_high_score || 0) - (a.pacman_high_score || 0)) :
                          leaderboardTab === 'tetris' ? profiles.filter(p => !p.is_admin).sort((a, b) => (b.tetris_high_score || 0) - (a.tetris_high_score || 0)) :
                          profiles.filter(p => !p.is_admin).sort((a, b) => (b.energy_high_score || 0) - (a.energy_high_score || 0))
                        ).map((item, idx) => (
                          <tr key={item.id} className="hover:bg-beige-50/50 transition-colors">
                            <td className="px-8 py-6">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${idx === 0 ? 'bg-amber-400 text-white shadow-lg' : idx === 1 ? 'bg-slate-300 text-white' : idx === 2 ? 'bg-orange-400 text-white' : 'text-neutral-400'}`}>
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-8 py-6 font-black text-neutral-900">{item.first_name} {item.last_name}</td>
                            <td className="px-8 py-6 font-bold text-neutral-500">{item.groups?.name || 'Sans groupe'}</td>
                            <td className="px-8 py-6 text-right font-black text-terracotta-700 tabular-nums">
                              {leaderboardTab === 'pacman' ? item.pacman_high_score :
                               leaderboardTab === 'tetris' ? item.tetris_high_score :
                               `${item.energy_high_score} kWh`}
                            </td>
                          </tr>
                        ))}
                        {((leaderboardTab === 'pacman' && profiles.filter(p => p.pacman_high_score > 0).length === 0) ||
                          (leaderboardTab === 'tetris' && profiles.filter(p => p.tetris_high_score > 0).length === 0) ||
                          (leaderboardTab === 'energy' && profiles.filter(p => p.energy_high_score > 0).length === 0)) && (
                          <tr>
                            <td colSpan="4" className="text-center py-8 text-neutral-400 font-bold italic">Aucun score enregistré pour le moment.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-beige-100 flex shadow-2xl">
        <button onClick={() => setCurrentTab('missions')} className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-black uppercase transition-all ${currentTab === 'missions' ? 'text-terracotta-600' : 'text-neutral-400'}`}>
          <LayoutDashboard size={22} />
          Live
        </button>
        <button onClick={() => setCurrentTab('history')} className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-black uppercase transition-all ${currentTab === 'history' ? 'text-terracotta-600' : 'text-neutral-400'}`}>
          <History size={22} />
          Historique
        </button>
        <button onClick={() => setCurrentTab('stats')} className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-black uppercase transition-all ${currentTab === 'stats' ? 'text-terracotta-600' : 'text-neutral-400'}`}>
          <Trophy size={22} />
          Scores
        </button>
        <button onClick={() => supabase.auth.signOut()} className="flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-black uppercase text-red-400">
          <LogOut size={22} />
          Quitter
        </button>
      </nav>
      {detailQuestion && (
        <div className="fixed inset-0 z-[100] bg-neutral-900/80 backdrop-blur-xl flex items-center justify-center p-4 md:p-6" onClick={() => setDetailQuestion(null)}>
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] w-full max-w-2xl shadow-2xl flex flex-col border border-white/20 relative overflow-hidden max-h-[95vh] md:max-h-[90vh]" onClick={e => e.stopPropagation()}>
            
            {/* Zone Scrollable du Détail */}
            <div className="flex-1 overflow-y-auto p-6 md:p-12">
              <div className="mb-8">
                <div className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${detailQuestion.is_poll ? 'text-blue-600' : 'text-terracotta-600'}`}>
                  {detailQuestion.is_poll ? '📊 Résultats du sondage' : 'Détails de la mission'}
                </div>
                <h3 className="text-2xl md:text-3xl font-black text-neutral-900 leading-tight mb-4 break-words" style={{ wordBreak: 'break-word' }}>
                  {detailQuestion.question_text}
                </h3>
                {!detailQuestion.is_poll && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-xl inline-flex font-bold text-sm border border-green-100 max-w-full">
                    <CheckCircle size={18} className="flex-shrink-0" /> 
                    <span className="break-words">Réponse : {['A','B','C','D'][detailQuestion.correct_option_index]} — {detailQuestion.options[detailQuestion.correct_option_index]}</span>
                  </div>
                )}
              </div>

              {/* Stats / Distribution (Sondage) */}
              {detailQuestion.is_poll && (
                <div className="space-y-3 mb-10">
                  {detailQuestion.options.map((opt, idx) => {
                    const votes = detailAnswers.filter(a => a.chosen_index === idx).length;
                    const pct = detailAnswers.length > 0 ? Math.round((votes / detailAnswers.length) * 100) : 0;
                    return (
                      <div key={idx} className="bg-beige-50 rounded-2xl p-4 border border-beige-100">
                        <div className="flex justify-between mb-1 gap-4">
                          <span className="font-black text-sm text-neutral-800 break-words flex-1" style={{ wordBreak: 'break-word' }}>
                            <span className="text-blue-500 mr-2">{['A','B','C','D'][idx]}</span>{opt}
                          </span>
                          <span className="font-black text-sm text-blue-600 whitespace-nowrap">{votes} vote{votes !== 1 ? 's' : ''} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-beige-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Liste des répondants (Mission ou Sondage) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400 mb-4 px-2">Engagements individuels</h4>
                {detailAnswers.length > 0 ? (
                  detailAnswers.map((a, i) => (
                    <div key={i} className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${
                      detailQuestion.is_poll 
                        ? 'border-blue-50 bg-blue-50/30' 
                        : a.is_correct ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50'
                    }`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 ${
                          detailQuestion.is_poll 
                            ? 'bg-blue-500' 
                            : a.is_correct ? 'bg-green-500' : 'bg-red-500'
                        }`}>
                          {detailQuestion.is_poll ? ['A', 'B', 'C', 'D'][a.chosen_index] : (a.is_correct ? <CheckCircle size={20} /> : <XCircle size={20} />)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-neutral-900 truncate">{a.first_name} {a.last_name}</div>
                          <div className="text-[10px] font-bold text-neutral-400 uppercase truncate">{a.group_name}</div>
                        </div>
                      </div>
                      <div className={`font-black text-[10px] px-3 py-1 rounded-full bg-white shadow-sm flex-shrink-0 ${
                        detailQuestion.is_poll ? 'text-blue-600' : (a.is_correct ? 'text-green-600' : 'text-red-500')
                      }`}>
                        {detailQuestion.is_poll ? `OPTION ${['A', 'B', 'C', 'D'][a.chosen_index]}` : (a.is_correct ? 'APPROUVÉ' : 'REJETÉ')}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-neutral-400 font-bold italic">Aucune donnée enregistrée.</div>
                )}
              </div>
            </div>

            {/* Footer Fixe */}
            <div className="p-6 md:p-12 pt-4 bg-white border-t border-beige-50 flex justify-center">
              <button 
                onClick={() => setDetailQuestion(null)}
                className="px-10 py-4 bg-neutral-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-terracotta-600 transition-all active:scale-95"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({ icon, label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-black text-sm ${active ? 'bg-terracotta-600 text-white shadow-lg shadow-terracotta-200' : 'text-neutral-500 hover:bg-beige-50'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, color, big }) {
  return (
    <div className={`bg-white p-4 rounded-2xl border-2 border-beige-100 text-center shadow-sm min-w-[80px] ${big ? 'px-6' : ''}`}>
      <div className="text-[10px] font-black uppercase text-neutral-400 mb-1">{label}</div>
      <div className={`${big ? 'text-2xl' : 'text-lg'} font-black ${color}`}>{value}</div>
    </div>
  );
}
 
AdminView.propTypes = {
  profiles: PropTypes.array.isRequired,
  leaderboard: PropTypes.array.isRequired,
};

MenuButton.propTypes = {
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  color: PropTypes.string.isRequired,
  big: PropTypes.bool,
};
