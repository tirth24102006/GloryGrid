/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameType, SavedTournament } from '../types';
import { Flame, Target, Crown, Trophy, Swords, Sparkles, Clock, Trash2, Calendar, LayoutGrid, CheckCircle2, HelpCircle, X, Download, Sliders, Wand2, BookOpen, Layers, Check, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

interface HomeViewProps {
  onSelectGame: (game: GameType) => void;
  savedTournaments: SavedTournament[];
  activeTournamentId: string | null;
  onLoadTournament: (tour: SavedTournament) => void;
  onDeleteTournament: (id: string) => void;
  onClearAllTournaments?: () => void;
  onOpenHelp?: () => void;
}

const QUOTES = [
  { text: "In chess, as in life, forethought wins.", author: "Charles Buxton" },
  { text: "The sweet sound of leather hitting willow is the heartbeat of champions.", author: "Classic Cricket Legend" },
  { text: "A single stroke on the carrom board can change the geometry of your destiny.", author: "Board Master" },
  { text: "Winning is not a sometime thing; it's an all-the-time thing.", author: "Vince Lombardi" },
  { text: "The more difficult the victory, the greater the happiness in winning.", author: "Pelé" },
  { text: "Sports do not build character. They reveal it.", author: "Heywood Broun" }
];

export default function HomeView({
  onSelectGame,
  savedTournaments = [],
  activeTournamentId,
  onLoadTournament,
  onDeleteTournament,
  onClearAllTournaments,
  onOpenHelp
}: HomeViewProps) {
  const [quote, setQuote] = useState(QUOTES[0]);

  useEffect(() => {
    // Select random inspiring sports quote on mount
    const index = Math.floor(Math.random() * QUOTES.length);
    setQuote(QUOTES[index]);
  }, []);

  const getTournamentStatus = (tour: SavedTournament) => {
    const finalsPool = tour.result.finalsPool;
    if (!finalsPool || !finalsPool.rounds || finalsPool.rounds.length === 0) {
      return { label: 'In Progress', isConcluded: false, champion: null };
    }
    const lastRound = finalsPool.rounds[finalsPool.rounds.length - 1];
    if (!lastRound || lastRound.length === 0) {
      return { label: 'In Progress', isConcluded: false, champion: null };
    }
    const grandMatch = lastRound[0];
    const winner = tour.declaredWinners[grandMatch.id];
    if (winner && winner !== 'BYE' && !winner.startsWith('Winner of')) {
      return { label: 'Concluded', isConcluded: true, champion: winner };
    }
    return { label: 'In Progress', isConcluded: false, champion: null };
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center px-4 w-full">
      {/* Visual Header Grid Wrapper */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="mb-10 max-w-2xl relative"
      >
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-20 text-indigo-400">
          <Trophy size={80} className="animate-pulse" />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-black font-display tracking-tight text-white mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 py-1">
          GLORY GRID
        </h1>
        <p className="text-sm font-mono text-indigo-300 tracking-widest uppercase">
          Elite Fixture Generator
        </p>
      </motion.div>

      {/* Inspiring welcome quote box */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 1.2 }}
        className="max-w-2xl bg-slate-900/60 backdrop-blur-md px-8 py-5 rounded-2xl border border-indigo-500/20 shadow-2xl mb-12 relative overflow-hidden group"
      >
        <div className="absolute -left-3 -top-3 text-indigo-500/10 font-serif text-8xl user-select-none select-none">“</div>
        <p className="text-lg md:text-xl italic text-slate-100 font-medium leading-relaxed">
          {quote.text}
        </p>
        <p className="text-xs font-mono text-indigo-400 mt-3 tracking-wider uppercase">— {quote.author}</p>
        <div className="absolute bottom-1 right-2 flex gap-1 opacity-40">
          <Sparkles size={14} className="text-indigo-400" />
        </div>
      </motion.div>

      {/* TOURNAMENT HISTORY AND ACTIVE FIXTURES SECTION */}
      {savedTournaments && savedTournaments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-4xl bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 mb-12 text-left shadow-xl"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Calendar className="text-indigo-400" size={20} />
              <h3 className="text-lg font-bold font-display tracking-tight text-white">
                Saved Fixtures & Tournament History
              </h3>
            </div>
            {onClearAllTournaments && (
              <button
                type="button"
                onClick={onClearAllTournaments}
                className="text-xs font-mono text-rose-400 hover:text-white hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20 transition-all cursor-pointer"
              >
                Clear All History
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-1">
            {savedTournaments.map((tour) => {
              const info = getTournamentStatus(tour);
              const isActive = tour.id === activeTournamentId;
              const gType = tour.selectedGame;

              return (
                <div
                  key={tour.id}
                  className={`relative flex flex-col justify-between p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-slate-900/95 border-indigo-500/60 shadow-md shadow-indigo-950/40'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        gType === 'cricket' ? 'bg-orange-500/10 text-orange-400' :
                        gType === 'carrom' ? 'bg-emerald-500/10 text-emerald-400' :
                        'bg-indigo-500/10 text-indigo-400'
                      }`}>
                        {gType === 'cricket' ? <Flame size={18} /> :
                         gType === 'carrom' ? <Target size={18} /> :
                         <Crown size={18} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-100 line-clamp-1">
                          {tour.name}
                        </h4>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Clock size={11} />
                          <span>Generated: {tour.createdDate}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTournament(tour.id);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1.5 hover:bg-slate-800/60 rounded-md transition-colors cursor-pointer"
                      title="Delete saved fixture"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-900/60 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full uppercase ${
                        info.isConcluded
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-indigo-500/10 text-indigo-400'
                      }`}>
                        ● {info.label}
                      </span>

                      {info.isConcluded && info.champion && (
                        <span className="text-[10px] text-yellow-400 font-mono font-bold flex items-center gap-1">
                          🏆 {info.champion.length > 15 ? info.champion.substring(0, 15) + '...' : info.champion}
                        </span>
                      )}

                      {tour.endDate && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          Ends: {tour.endDate.split('-').reverse().join('/')}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onLoadTournament(tour)}
                      className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-lg sm:hover:bg-indigo-500'
                          : 'bg-slate-800 text-slate-300 sm:hover:bg-slate-700 sm:hover:text-white'
                      }`}
                    >
                      <span>{isActive ? 'Resume Active' : 'Load Bracket'}</span>
                      <Swords size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}



      {/* CREATE NEW SECTION SPLASH */}
      <div className="text-left w-full max-w-4xl px-4 mb-4">
        <span className="text-xs font-mono tracking-widest text-indigo-400 uppercase font-black">
          CREATE NEW TOURNAMENT
        </span>
      </div>

      {/* Play Cards Grid for Cricket, Carrom, Chess */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl px-4">
        {/* CRICKET CARD */}
        <motion.div
          whileHover={{ y: -8, scale: 1.03 }}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-orange-950/40 p-1 rounded-2xl border border-orange-500/30 overflow-hidden cursor-pointer shadow-xl group"
          onClick={() => onSelectGame('cricket')}
          id="btn-cricket"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl group-hover:bg-orange-500/20 transition-all duration-300 pointer-events-none" />
          <div className="bg-slate-950/80 p-8 rounded-[14px] h-full flex flex-col items-center justify-between text-center relative z-10">
            <div className="mb-6 p-4 rounded-full bg-orange-500/15 text-orange-400 ring-2 ring-orange-500/30 group-hover:bg-orange-500/25 group-hover:text-orange-300 transition-colors duration-300 shadow-lg">
              <Flame size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:text-orange-400 transition-colors">CRICKET</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Generate pools and schedule pitches with precision wood-willow parameters.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-mono font-bold text-orange-400 hover:text-orange-300 transition-all group-hover:translate-x-1 duration-300">
              BUILD STAGE <Swords size={14} />
            </span>
          </div>
        </motion.div>

        {/* CARROM CARD */}
        <motion.div
          whileHover={{ y: -8, scale: 1.03 }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/40 p-1 rounded-2xl border border-emerald-500/30 overflow-hidden cursor-pointer shadow-xl group"
          onClick={() => onSelectGame('carrom')}
          id="btn-carrom"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-300 pointer-events-none" />
          <div className="bg-slate-950/80 p-8 rounded-[14px] h-full flex flex-col items-center justify-between text-center relative z-10">
            <div className="mb-6 p-4 rounded-full bg-emerald-500/15 text-emerald-400 ring-2 ring-emerald-500/30 group-hover:bg-emerald-500/25 group-hover:text-emerald-300 transition-colors duration-300 shadow-lg">
              <Target size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:text-emerald-400 transition-colors">CARROM</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Supports Singles or side-by-side Doubles layouts with striker math.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 hover:text-emerald-300 transition-all group-hover:translate-x-1 duration-300">
              BUILD STAGE <Swords size={14} />
            </span>
          </div>
        </motion.div>

        {/* CHESS CARD */}
        <motion.div
          whileHover={{ y: -8, scale: 1.03 }}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/40 p-1 rounded-2xl border border-indigo-500/30 overflow-hidden cursor-pointer shadow-xl group"
          onClick={() => onSelectGame('chess')}
          id="btn-chess"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all duration-300 pointer-events-none" />
          <div className="bg-slate-950/80 p-8 rounded-[14px] h-full flex flex-col items-center justify-between text-center relative z-10">
            <div className="mb-6 p-4 rounded-full bg-indigo-500/15 text-indigo-400 ring-2 ring-indigo-500/30 group-hover:bg-indigo-500/25 group-hover:text-indigo-300 transition-colors duration-300 shadow-lg">
              <Crown size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:text-indigo-400 transition-colors">CHESS</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Strict turn planning, sequential scheduling, and precise round-robin or single elim structures.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 transition-all group-hover:translate-x-1 duration-300">
              BUILD STAGE <Swords size={14} />
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
