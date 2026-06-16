import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/format';
import { Trophy, ArrowLeft, Users, Zap, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LeaderboardPage({ session }) {
  const [tab, setTab] = useState('teams');
  const [leaderboard, setLeaderboard] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  const checkRedirectToQuestion = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      // Check if current user is an admin
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (myProfile?.is_admin) return; // Admin is never redirected

      // Get the latest active question
      const { data: activeQ } = await supabase
        .from('questions')
        .select('id, created_at, duration')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeQ) {
        // Check if student already answered
        const { data: answer } = await supabase
          .from('answers')
          .select('id')
          .eq('question_id', activeQ.id)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (!answer) {
          // Check if question timer hasn't expired (+2s buffer)
          const created = new Date(activeQ.created_at).getTime();
          const now = new Date().getTime();
          const qDuration = activeQ.duration || 30;
          if (created + (qDuration + 2) * 1000 > now) {
            navigate('/dashboard');
          }
        }
      }
    } catch (err) {
      console.error('Error checking active question for redirect:', err);
    }
  }, [session, navigate]);

  const fetchAll = useCallback(async () => {
    try {
      checkRedirectToQuestion();

      const [lbRes, profRes] = await Promise.all([
        supabase.rpc('get_leaderboard'),
        supabase
          .from('profiles')
          .select('id, user_id, first_name, last_name, is_admin, group_id, pacman_high_score, tetris_high_score, energy_high_score, groups(*)')
          .eq('is_admin', false)
          .order('last_name', { ascending: true }),
      ]);
      if (lbRes.data) setLeaderboard(lbRes.data);
      if (profRes.data) setProfiles(profRes.data);
    } catch (err) {
      console.error('LeaderboardPage fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [checkRedirectToQuestion]);

  useEffect(() => {
    fetchAll();

    const debouncedFetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchAll, 500);
    };

    const channel = supabase
      .channel('leaderboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, debouncedFetch)
      .subscribe();

    const broadcastChannel = supabase
      .channel('question_broadcast')
      .on('broadcast', { event: 'question_update' }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [fetchAll]);

  const tabs = [
    { id: 'teams', label: 'Finances Équipes' },
    { id: 'pacman', label: 'Robotique Pacman' },
    { id: 'tetris', label: 'Laboratoire Tetris' },
    { id: 'energy', label: 'Générateur Énergie' },
  ];

  const getGameProfiles = () => {
    const nonAdmins = profiles.filter(p => !p.is_admin);
    if (tab === 'pacman') return [...nonAdmins].sort((a, b) => (b.pacman_high_score || 0) - (a.pacman_high_score || 0));
    if (tab === 'tetris') return [...nonAdmins].sort((a, b) => (b.tetris_high_score || 0) - (a.tetris_high_score || 0));
    if (tab === 'energy') return [...nonAdmins].sort((a, b) => (b.energy_high_score || 0) - (a.energy_high_score || 0));
    return [];
  };

  const rankStyle = (idx) => {
    if (idx === 0) return 'bg-amber-400 text-white shadow-lg shadow-amber-200/50';
    if (idx === 1) return 'bg-slate-400 text-white shadow-lg shadow-slate-200/50';
    if (idx === 2) return 'bg-orange-400 text-white shadow-lg shadow-orange-200/50';
    return 'bg-beige-100 text-neutral-500';
  };

  const getScore = (item) => {
    if (tab === 'pacman') return item.pacman_high_score || 0;
    if (tab === 'tetris') return item.tetris_high_score || 0;
    if (tab === 'energy') return item.energy_high_score || 0;
    return 0;
  };

  const formatScore = (item) => {
    if (tab === 'energy') return `${getScore(item)} kWh`;
    return getScore(item).toLocaleString('fr-FR');
  };

  return (
    <div className="min-h-screen bg-beige-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-beige-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 rounded-xl bg-beige-50 hover:bg-beige-100 border border-beige-100 flex items-center justify-center text-neutral-600 transition-all active:scale-95"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-terracotta-600 flex items-center justify-center shadow-lg shadow-terracotta-200/50">
                <Trophy size={18} className="text-white" />
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-terracotta-600/70 leading-none mb-0.5">INF111</div>
                <div className="text-sm font-black text-neutral-900 leading-none">Classement Global</div>
              </div>
            </div>
          </div>
          <button
            onClick={fetchAll}
            className="w-10 h-10 rounded-xl bg-beige-50 hover:bg-terracotta-50 border border-beige-100 hover:border-terracotta-200 flex items-center justify-center text-neutral-500 hover:text-terracotta-600 transition-all active:scale-95"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 md:px-8 flex gap-0 overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-3 font-black text-xs uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'border-terracotta-600 text-terracotta-600'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-terracotta-100 border-t-terracotta-600 rounded-full animate-spin" />
          </div>
        ) : tab === 'teams' ? (
          <TeamsTab leaderboard={leaderboard} profiles={profiles} />
        ) : (
          <GameTab
            profiles={getGameProfiles()}
            tab={tab}
            formatScore={formatScore}
            getScore={getScore}
            rankStyle={rankStyle}
            currentUserId={session?.user?.id}
          />
        )}
      </div>
    </div>
  );
}

function TeamsTab({ leaderboard, profiles }) {
  if (leaderboard.length === 0) {
    return (
      <div className="bg-white rounded-[2rem] border border-beige-100 shadow-xl p-16 text-center">
        <Users size={40} className="text-neutral-200 mx-auto mb-4" />
        <p className="text-neutral-400 font-bold">Aucune équipe enregistrée.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Podium top 3 */}
      {leaderboard.length >= 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {leaderboard.slice(0, 3).map((item, idx) => (
            <PodiumCard key={item.group_id} item={item} rank={idx + 1} profiles={profiles} />
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-[2rem] border border-beige-100 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-beige-50">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Classement complet</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead className="bg-beige-50/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400">#</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400">Équipe</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 text-center">Membres</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 text-center">Réponses (✓)</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 text-center">Réussite</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 text-right">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-50">
              {leaderboard.map((item, idx) => (
                <tr key={item.group_id} className="hover:bg-beige-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${
                      idx === 0 ? 'bg-amber-400 text-white' :
                      idx === 1 ? 'bg-slate-400 text-white' :
                      idx === 2 ? 'bg-orange-400 text-white' :
                      'bg-beige-100 text-neutral-400'
                    }`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-black text-neutral-900">{item.group_name}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {profiles
                        .filter(p => p.group_id === item.group_id)
                        .map((p, i) => (
                          <span key={i} className="text-[10px] font-bold px-2 py-0.5 bg-beige-50 text-neutral-500 rounded border border-beige-100">
                            {p.first_name} {p.last_name}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-neutral-500 text-sm">{item.member_count}</td>
                  <td className="px-6 py-4 text-center font-bold text-neutral-500 text-sm">
                    {item.total_answers} ({item.correct_answers})
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-xs font-black px-3 py-1 rounded-full ${
                      item.success_rate >= 70 ? 'bg-green-50 text-green-600 border border-green-100' :
                      item.success_rate >= 40 ? 'bg-yellow-50 text-yellow-600 border border-yellow-100' :
                      'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {item.success_rate}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-black tabular-nums text-lg ${item.balance < 0 ? 'text-red-500' : 'text-terracotta-700'}`}>
                      {formatCurrency(item.balance)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PodiumCard({ item, rank, profiles }) {
  const colors = {
    1: { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-400', label: 'text-amber-600', icon: '🥇' },
    2: { bg: 'bg-slate-50 border-slate-200', badge: 'bg-slate-400', label: 'text-slate-600', icon: '🥈' },
    3: { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-400', label: 'text-orange-600', icon: '🥉' },
  };
  const c = colors[rank];
  const groupMembers = profiles
    .filter(p => p.group_id === item.group_id)
    .map(p => `${p.first_name} ${p.last_name}`);

  return (
    <div className={`bg-white rounded-[1.75rem] border-2 ${c.bg} p-6 shadow-xl flex flex-col items-center text-center gap-2 w-full`}>
      <div className="text-3xl mb-1">{c.icon}</div>
      <div className="font-black text-neutral-900 text-lg leading-tight">{item.group_name}</div>
      <div className="text-xs font-bold text-neutral-400">{item.member_count} membre{item.member_count !== 1 ? 's' : ''}</div>
      <div className={`text-2xl font-black tabular-nums mt-1 ${item.balance < 0 ? 'text-red-500' : c.label}`}>
        {formatCurrency(item.balance)}
      </div>
      <div className="text-xs font-bold text-neutral-400">{item.success_rate}% réussite</div>
      
      {groupMembers.length > 0 && (
        <div className="mt-3 w-full border-t border-neutral-100 pt-3 flex flex-col items-center">
          <div className="text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-1">Membres</div>
          <div className="flex flex-wrap gap-1 justify-center w-full">
            {groupMembers.map((name, i) => (
              <span key={i} className="text-[9px] font-bold px-2 py-0.5 bg-neutral-50 text-neutral-600 rounded border border-neutral-100">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GameTab({ profiles, formatScore, getScore, rankStyle, currentUserId }) {
  if (profiles.length === 0) {
    return (
      <div className="bg-white rounded-[2rem] border border-beige-100 shadow-xl p-16 text-center">
        <Zap size={40} className="text-neutral-200 mx-auto mb-4" />
        <p className="text-neutral-400 font-bold">Aucun élève enregistré.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top 3 podium */}
      {profiles.length >= 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {profiles.slice(0, 3).map((item, idx) => (
            <GamePodiumCard key={item.user_id} item={item} rank={idx + 1} formatScore={formatScore} />
          ))}
        </div>
      )}

      {/* Full list */}
      <div className="bg-white rounded-[2rem] border border-beige-100 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-beige-50">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">Tous les participants</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[400px]">
            <thead className="bg-beige-50/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400">#</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400">Élève</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400">Équipe</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-neutral-400 text-right">Meilleur Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-50">
              {profiles.map((item, idx) => (
                <tr
                  key={item.user_id}
                  className={`hover:bg-beige-50/50 transition-colors ${item.user_id === currentUserId ? 'bg-terracotta-50/60' : ''}`}
                >
                  <td className="px-6 py-4">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs ${rankStyle(idx)}`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-black text-neutral-900">{item.first_name} {item.last_name}</div>
                    {item.user_id === currentUserId && (
                      <div className="text-[9px] font-black text-terracotta-600 uppercase tracking-wider mt-0.5">Vous</div>
                    )}
                  </td>
                  <td className="px-6 py-4 font-bold text-neutral-500 text-sm">{item.groups?.name || 'Sans groupe'}</td>
                  <td className="px-6 py-4 text-right">
                    {getScore(item) > 0 ? (
                      <span className="font-black text-terracotta-700 tabular-nums">{formatScore(item)}</span>
                    ) : (
                      <span className="font-bold text-neutral-300 text-sm italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GamePodiumCard({ item, rank, formatScore }) {
  const colors = {
    1: { bg: 'bg-amber-50 border-amber-200', label: 'text-amber-600', icon: '🥇' },
    2: { bg: 'bg-slate-50 border-slate-200', label: 'text-slate-600', icon: '🥈' },
    3: { bg: 'bg-orange-50 border-orange-200', label: 'text-orange-600', icon: '🥉' },
  };
  const c = colors[rank];
  return (
    <div className={`bg-white rounded-[1.75rem] border-2 ${c.bg} p-6 shadow-xl flex flex-col items-center text-center gap-2`}>
      <div className="text-3xl mb-1">{c.icon}</div>
      <div className="font-black text-neutral-900 leading-tight">{item.first_name} {item.last_name}</div>
      <div className="text-xs font-bold text-neutral-400">{item.groups?.name || 'Sans groupe'}</div>
      <div className={`text-2xl font-black tabular-nums mt-2 ${c.label}`}>{formatScore(item)}</div>
    </div>
  );
}

LeaderboardPage.propTypes = { session: PropTypes.object };
TeamsTab.propTypes = { leaderboard: PropTypes.array.isRequired, profiles: PropTypes.array.isRequired };
PodiumCard.propTypes = { item: PropTypes.object.isRequired, rank: PropTypes.number.isRequired, profiles: PropTypes.array.isRequired };
GameTab.propTypes = {
  profiles: PropTypes.array.isRequired,
  tab: PropTypes.string.isRequired,
  formatScore: PropTypes.func.isRequired,
  getScore: PropTypes.func.isRequired,
  rankStyle: PropTypes.func.isRequired,
  currentUserId: PropTypes.string,
};
GamePodiumCard.propTypes = {
  item: PropTypes.object.isRequired,
  rank: PropTypes.number.isRequired,
  formatScore: PropTypes.func.isRequired,
};
