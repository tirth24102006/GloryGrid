/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Pool, Match, GameType } from '../types';
import { Trophy, Clock, CheckCircle2, ListFilter, ArrowRight, UserCheck, Info, Image, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCricketStandings } from '../utils/cricketStats';
import html2canvas from 'html2canvas';

interface BracketRendererProps {
  gameType: GameType;
  pools: Pool[];
  finalsPool: Pool;
  declaredWinners: Record<string, string>; // matchId -> winnerName
  onDeclareWinner: (matchId: string, winnerName: string) => void;
  isDoubles: boolean;
  onUpdateMatchScores?: (
    matchId: string,
    runsA: number | undefined,
    oversA: number | undefined,
    runsB: number | undefined,
    oversB: number | undefined
  ) => void;
  onEditSchedule?: (match: Match) => void;
  championshipPlayoffsPool?: Pool | null;
  onUpdatePlayoffsPool?: (pool: Pool | null) => void;
  teamsToPromotePerPool?: number;
}

export default function BracketRenderer({
  gameType,
  pools,
  finalsPool,
  declaredWinners,
  onDeclareWinner,
  isDoubles,
  onUpdateMatchScores,
  onEditSchedule,
  championshipPlayoffsPool,
  onUpdatePlayoffsPool,
  teamsToPromotePerPool = 1,
}: BracketRendererProps) {
  // Tabs: pools and finals
  const tabs = [...pools, finalsPool];
  const [activeTabId, setActiveTabId] = useState<string>(pools[0]?.id || 'finals');

  // Find the currently active tab
  const activePool = tabs.find(t => t.id === activeTabId) || pools[0] || finalsPool;

  const [selectedPlayoffTeams, setSelectedPlayoffTeams] = useState<string[]>([]);

  // Automatically initialize selectedPlayoffTeams when entering finals tab
  React.useEffect(() => {
    if (activePool && activePool.id === 'finals' && activePool.isRoundRobin && selectedPlayoffTeams.length === 0) {
      const standings = calculateCricketStandings(activePool, declaredWinners);
      if (standings.length > 0) {
        // Default to promoting top 4 (or less if standings has fewer teams)
        const defaultCount = Math.min(standings.length, 4);
        const topTeams = standings.slice(0, defaultCount).map(t => t.name);
        setSelectedPlayoffTeams(topTeams);
      }
    }
  }, [activePool, declaredWinners, selectedPlayoffTeams.length]);

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [runsA, setRunsA] = useState<string>('');
  const [oversA, setOversA] = useState<string>('');
  const [runsB, setRunsB] = useState<string>('');
  const [oversB, setOversB] = useState<string>('');

  const startEditing = (m: Match) => {
    setEditingMatchId(m.id);
    setRunsA(m.runsScoredA !== undefined ? String(m.runsScoredA) : '');
    setOversA(m.oversFacedA !== undefined ? String(m.oversFacedA) : '');
    setRunsB(m.runsScoredB !== undefined ? String(m.runsScoredB) : '');
    setOversB(m.oversFacedB !== undefined ? String(m.oversFacedB) : '');
  };

  const [isExportingImg, setIsExportingImg] = useState(false);
  const [exportedImgUrl, setExportedImgUrl] = useState<string | null>(null);
  const [exportedImgFormat, setExportedImgFormat] = useState<'png' | 'jpg'>('png');

  const handleDownloadPoolImage = async (format: 'png' | 'jpg') => {
    setIsExportingImg(true);
    try {
      // Small sleep to let the render cycle update the element's DOM nodes completely
      await new Promise(resolve => setTimeout(resolve, 150));

      const element = document.getElementById('bracket-capture-area');
      if (!element) {
        console.error("Fixture layout container was not found.");
        setIsExportingImg(false);
        return;
      }

      // Safe html2canvas resolution
      let h2c: any = html2canvas;
      if (!h2c) {
        const imported = await import('html2canvas');
        h2c = imported.default || imported;
      }
      if (typeof h2c !== 'function' && (h2c as any).default) {
        h2c = (h2c as any).default;
      }

      // Capture scroll heights & widths for complete content exporting
      const scrollWidth = element.scrollWidth;
      const scrollHeight = element.scrollHeight;

      // Temporarily expand container's sizing so html2canvas renders the absolute full card view unclipped
      const originalStyleWidth = element.style.width;
      const originalStyleHeight = element.style.height;
      const originalStyleOverflow = element.style.overflow;
      const originalStyleMaxWidth = element.style.maxWidth;

      element.style.width = scrollWidth + 'px';
      element.style.height = scrollHeight + 'px';
      element.style.overflow = 'visible';
      element.style.maxWidth = 'none';

      // Give browser layout engine a split frame to paint the expanded styles
      await new Promise(resolve => setTimeout(resolve, 80));

      const canvas = await h2c(element, {
        scale: 2, // High resolution crisp Retina render output
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#0c152d', // Standard high-contrast slate-950 theme background
        logging: false,
      });

      // Restore original container layout styling immediately
      element.style.width = originalStyleWidth;
      element.style.height = originalStyleHeight;
      element.style.overflow = originalStyleOverflow;
      element.style.maxWidth = originalStyleMaxWidth;

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const fileExt = format === 'png' ? 'png' : 'jpg';
      const downloadFilename = `${activePool.name.trim().replace(/\s+/g, '_')}_fixture.${fileExt}`;

      // Convert canvas elements to URL blob
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error("Could not generate image blob.");
          setIsExportingImg(false);
          return;
        }
        const blobUrl = URL.createObjectURL(blob);
        
        // Setup state for the Showcase Lightbox offering interactive backup saves!
        setExportedImgUrl(blobUrl);
        setExportedImgFormat(format);

        try {
          const link = document.createElement('a');
          link.download = downloadFilename;
          link.href = blobUrl;
          
          // Critically required action inside sandboxed iframe containers to allow triggers!
          document.body.appendChild(link);
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
          }, 200);
        } catch (downloadErr) {
          console.warn("Direct programatic anchor click download blocked or failed, lightbox modal provides high-res manual/force-click fallback. Detail:", downloadErr);
        }
      }, mimeType, 0.95);

    } catch (err) {
      console.error("Image capture error:", err);
    } finally {
      setIsExportingImg(false);
    }
  };

  const handleGeneratePlayoffs = () => {
    if (selectedPlayoffTeams.length < 2) {
      alert("Please select at least 2 teams to generate a playoff bracket!");
      return;
    }

    // Shuffle the selected teams (Fisher-Yates) for fully randomized matchups!
    const shuffledTeams = [...selectedPlayoffTeams];
    for (let i = shuffledTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
    }

    const count = shuffledTeams.length;
    // Next power of 2
    let P = 2;
    while (P < count) {
      P *= 2;
    }

    const roundsCount = Math.round(Math.log2(P));
    const playoffPool: Pool = {
      id: 'playoffs',
      name: 'Championship Playoffs',
      teams: shuffledTeams,
      byesCount: P - count,
      rounds: []
    };

    const r0Matches: Match[] = [];
    const matchesInR0 = P / 2;

    // Distribute teams and BYEs:
    // Place one real team as teamA in each match to prevent BYE vs BYE.
    // Place remaining count - P/2 teams as teamB in the first slots.
    // Fill the rest with 'BYE'.
    const pairSlots: { teamA: string; teamB: string }[] = [];
    for (let j = 0; j < matchesInR0; j++) {
      const teamA = shuffledTeams[j];
      const hasSecondaryTeam = j + matchesInR0 < count;
      const teamB = hasSecondaryTeam ? shuffledTeams[j + matchesInR0] : 'BYE';
      pairSlots.push({ teamA, teamB });
    }

    // Fully shuffle the order of the matches to randomize who gets a BYE/walkover!
    for (let i = pairSlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairSlots[i], pairSlots[j]] = [pairSlots[j], pairSlots[i]];
    }

    // Create real match objects for Round 0
    for (let j = 0; j < matchesInR0; j++) {
      const { teamA, teamB } = pairSlots[j];
      const isWalkover = teamB === 'BYE';
      const winner = isWalkover ? teamA : null;

      r0Matches.push({
        id: `playoffs-R0-M${j}`,
        poolId: 'playoffs',
        poolName: 'Championship Playoffs',
        roundIndex: 0,
        matchIndex: j,
        teamA,
        teamB,
        winner,
        scheduledTime: 'To Be Scheduled',
        endTime: null,
        prevMatchAId: null,
        prevMatchBId: null,
        isWalkover,
        matchDurationMin: 60,
        restTimeMin: 15,
      });
    }
    playoffPool.rounds.push(r0Matches);

    // Build downstream rounds dynamically!
    for (let r = 1; r < roundsCount; r++) {
      const prevRoundMatches = playoffPool.rounds[r - 1];
      const roundMatchesCount = prevRoundMatches.length / 2;
      const currentRound: Match[] = [];

      for (let j = 0; j < roundMatchesCount; j++) {
        const prevM1 = prevRoundMatches[j * 2];
        const prevM2 = prevRoundMatches[j * 2 + 1];

        // Format round labels
        let roundLabelStr = 'Playoff';
        if (r === roundsCount - 1) {
          roundLabelStr = 'Final';
        } else if (r === roundsCount - 2) {
          roundLabelStr = 'Semifinal';
        } else if (r === roundsCount - 3) {
          roundLabelStr = 'Quarterfinal';
        }

        const teamAName = `Winner of ${roundLabelStr} M${prevM1.matchIndex * 2 + 1}`;
        const teamBName = `Winner of ${roundLabelStr} M${prevM2.matchIndex * 2 + 1}`;

        currentRound.push({
          id: `playoffs-R${r}-M${j}`,
          poolId: 'playoffs',
          poolName: 'Championship Playoffs',
          roundIndex: r,
          matchIndex: j,
          teamA: teamAName,
          teamB: teamBName,
          winner: null,
          scheduledTime: 'To Be Scheduled',
          endTime: null,
          prevMatchAId: prevM1.id,
          prevMatchBId: prevM2.id,
          isWalkover: false,
          matchDurationMin: 60,
          restTimeMin: 15,
        });
      }
      playoffPool.rounds.push(currentRound);
    }

    if (onUpdatePlayoffsPool) {
      onUpdatePlayoffsPool(playoffPool);
    }
  };

  const getPlayoffParticipantLabel = (m: Match, side: 'A' | 'B'): string => {
    if (side === 'A') {
      if (m.prevMatchAId) {
        return declaredWinners[m.prevMatchAId] || m.teamA;
      }
      return m.teamA;
    } else {
      if (m.prevMatchBId) {
        return declaredWinners[m.prevMatchBId] || m.teamB;
      }
      return m.teamB;
    }
  };

  const getCourtLabel = (courtNum: number | undefined): string => {
    if (!courtNum) return '';
    if (gameType === 'cricket') return `Grd ${courtNum}`;
    if (gameType === 'carrom') return `Board ${courtNum}`;
    if (gameType === 'chess') return `Table ${courtNum}`;
    return `Court ${courtNum}`;
  };

  const getFallbackPlaceholder = (prevMatchId: string, currentPoolId: string): string => {
    if (currentPoolId === 'finals') {
      if (prevMatchId.startsWith('finals-')) {
        const pIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
        const round0Length = finalsPool.rounds[0]?.length || 0;
        if (round0Length === 2) {
          return `Winner of Semifinal Match ${pIdx}`;
        } else if (round0Length === 4) {
          return `Winner of Quarterfinal Match ${pIdx}`;
        }
        return `Winner of Finals M${pIdx}`;
      } else {
        const poolId = prevMatchId.includes('-winner')
          ? prevMatchId.split('-winner')[0]
          : prevMatchId.substring(0, prevMatchId.indexOf('-R'));
        const sourcePool = pools.find(p => p.id === poolId);
        if (sourcePool) {
          return `Winner of ${sourcePool.name}`;
        }
      }
    }
    const prevMatchIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
    return `Winner of M${prevMatchIdx}`;
  };

  // Helper: resolve team names dynamically based on propagates
  const getParticipantLabel = (match: Match, slot: 'A' | 'B'): string => {
    const prevMatchId = slot === 'A' ? match.prevMatchAId : match.prevMatchBId;
    if (!prevMatchId) {
      return slot === 'A' ? match.teamA : match.teamB;
    }

    // It depends on a previous match
    const winnerOfPrev = declaredWinners[prevMatchId];
    if (winnerOfPrev) {
      return winnerOfPrev;
    }

    return getFallbackPlaceholder(prevMatchId, match.poolId);
  };

  const getThemeColors = () => {
    return {
      cricket: {
        text: "text-orange-500",
        border: "border-orange-200",
        borderActive: "border-orange-500",
        badge: "bg-orange-50 text-orange-600 border-orange-100",
        accent: "from-orange-500 to-amber-600",
        hoverBg: "hover:bg-orange-50/50",
        winnerGlow: "shadow-orange-100/60 border-orange-300/80 ring-1 ring-orange-200/50",
      },
      carrom: {
        text: "text-emerald-600",
        border: "border-emerald-200",
        borderActive: "border-emerald-500",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
        accent: "from-emerald-500 to-teal-600",
        hoverBg: "hover:bg-emerald-50/50",
        winnerGlow: "shadow-emerald-100/60 border-emerald-300/80 ring-1 ring-emerald-200/50",
      },
      chess: {
        text: "text-indigo-600",
        border: "border-indigo-200",
        borderActive: "border-indigo-500",
        badge: "bg-indigo-50 text-indigo-700 border-indigo-100",
        accent: "from-indigo-600 to-blue-600",
        hoverBg: "hover:bg-indigo-50/50",
        winnerGlow: "shadow-indigo-100/60 border-indigo-300/80 ring-1 ring-indigo-200/50",
      },
    }[gameType];
  };

  const colors = getThemeColors();

  // Helper: map index to round label
  const getRoundLabel = (pool: Pool, roundIdx: number): string => {
    if (pool.isRoundRobin && pool.id !== 'finals') {
      return `Fixtures Set ${roundIdx + 1}`;
    }
    const totalRounds = pool.rounds.length;
    if (roundIdx === totalRounds - 1) return "Finals";
    if (roundIdx === totalRounds - 2) return "Semifinals";
    if (roundIdx === totalRounds - 3) return "Quarterfinals";
    return `Round ${roundIdx + 1}`;
  };

  return (
    <div className="space-y-6">
      {/* Tab bar header styled in dark theme */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2">
          <ListFilter size={18} className="text-slate-400" />
          <span className="text-xs font-mono text-slate-400 uppercase tracking-widest font-black">Active Brackets:</span>
        </div>
        
        {/* Dynamic tabs list */}
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isFinalStage = tab.id === 'finals';
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all border cursor-pointer ${
                  isActive
                    ? `bg-indigo-500 border-indigo-500 text-slate-950 shadow-md ring-1 ring-indigo-500/10`
                    : `bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800`
                }`}
                id={`tab-bracket-${tab.id}`}
              >
                {isFinalStage ? (
                  <span className="flex items-center gap-1.5 text-indigo-400 font-bold">
                    <Trophy size={13} fill="currentColor" /> CHAMPIONSHIP STAGE
                  </span>
                ) : (
                  tab.name
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render selected pool's bracket */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activePool.id}
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -15 }}
          transition={{ duration: 0.3 }}
        >
          <div
            id="bracket-capture-area"
            className="bg-slate-900/40 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl overflow-hidden relative backdrop-blur-md"
          >
          {/* Header section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-mono text-slate-400 tracking-wider uppercase font-bold">Pool Display Block</span>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2 mt-1">
                {activePool.id === 'finals' ? (
                  <span className="flex items-center gap-2">
                    <Trophy className="text-amber-500" size={28} /> Championship Bracket
                  </span>
                ) : (
                  activePool.name
                )}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span className="text-slate-300 font-mono font-bold">Teams: {activePool.teams.length}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-amber-400 font-mono font-bold">Byes: {activePool.byesCount}</span>
              </div>


            </div>
          </div>

          {/* Round-Robin Pool Standings Table and Pool Winner declaration */}
          {activePool.isRoundRobin && (
            <div className="mb-8 p-5 bg-slate-950/70 border border-slate-800 rounded-2xl">
              <div>
                <span className="text-xs font-mono text-orange-400 tracking-wider uppercase font-bold">POOL CLASSIFICATION & NET RUN RATE (NRR)</span>
                <h3 className="text-lg font-black text-white mt-1 mb-4 flex items-center gap-2">
                  <Trophy size={18} className="text-orange-400 shrink-0" /> Round-Robin Points Table
                </h3>
              </div>
              
              <div className="overflow-x-auto rounded-xl border border-slate-850 bg-slate-900/45">
                <table className="w-full text-left font-sans text-xs min-w-[750px]">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-widest font-mono text-[10px]">
                      <th className="py-3 px-4 font-black">Rank</th>
                      <th className="py-3 px-4 font-black">Team Name</th>
                      <th className="py-3 px-3 font-black text-center">Played</th>
                      <th className="py-3 px-3 font-black text-center text-emerald-400">Wins</th>
                      <th className="py-3 px-3 font-black text-center text-rose-450">Losses</th>
                      <th className="py-3 px-3 font-black text-center text-yellow-400">Points</th>
                      <th className="py-3 px-3 font-black text-right">Runs / Overs Faced</th>
                      <th className="py-3 px-3 font-black text-right">Runs / Overs Bowled</th>
                      <th className="py-3 px-4 font-black text-center text-orange-400">Net Run Rate (NRR)</th>
                      {!isExportingImg && <th className="py-3 px-4 font-black text-center">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {(() => {
                      const teamStats = calculateCricketStandings(activePool, declaredWinners);

                      return teamStats.map((team, rank) => {
                        const isCurrentlyPromoted = activePool.id === 'finals'
                          ? selectedPlayoffTeams.includes(team.name)
                          : rank < teamsToPromotePerPool;
                        
                        // Format NRR sign dynamically
                        let nrrString = team.nrr.toFixed(3);
                        if (team.nrr > 0) nrrString = `+${nrrString}`;
                        
                        const nrrColorClass = team.nrr > 0 
                          ? 'text-emerald-450 font-bold' 
                          : team.nrr < 0 
                          ? 'text-rose-400 font-bold' 
                          : 'text-slate-400 font-bold';

                        return (
                          <tr 
                            key={team.name} 
                            className={`transition ${
                              isCurrentlyPromoted && activePool.id !== 'finals'
                                ? "bg-emerald-500/5 hover:bg-emerald-500/10 border-l-[3px] border-l-emerald-500" 
                                : "hover:bg-slate-900/50"
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-bold text-slate-450">
                              #{rank + 1}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-100">
                              <div className="flex items-center gap-2">
                                <span>{team.name}</span>
                                {rank === 0 && team.points > 0 && (
                                  <span className="text-[9px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold font-mono">
                                    LEADER
                                  </span>
                                )}
                                {isCurrentlyPromoted && activePool.id !== 'finals' && (
                                  <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold font-mono">
                                    👑 PROMOTED
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-slate-305">
                              {team.played}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-emerald-400 font-bold">
                              {team.wins}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-rose-400">
                              {team.losses}
                            </td>
                            <td className="py-3 px-3 text-center font-mono text-amber-400 font-black text-sm">
                              {team.points}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-400">
                              <span className="text-slate-200 font-bold">{team.runsScored}</span> / {team.oversFacedDecimal.toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-400">
                              <span className="text-slate-200">{team.runsConceded}</span> / {team.oversBowledDecimal.toFixed(1)}
                            </td>
                            <td className={`py-3 px-4 text-center font-mono text-xs ${nrrColorClass}`}>
                              {nrrString}
                            </td>
                             {!isExportingImg && (
                              <td className="py-3 px-4 text-center">
                                {activePool.id === 'finals' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isCurrentlyPromoted) {
                                        setSelectedPlayoffTeams(prev => prev.filter(t => t !== team.name));
                                      } else {
                                        setSelectedPlayoffTeams(prev => [...prev, team.name]);
                                      }
                                    }}
                                    className={`px-4 py-1.5 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer border ${
                                      isCurrentlyPromoted
                                        ? "bg-amber-500 text-slate-950 border-amber-500 hover:bg-amber-400"
                                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800"
                                    }`}
                                  >
                                    {isCurrentlyPromoted ? "👑 PROMOTED" : "🏆 PROMOTE"}
                                  </button>
                                ) : (
                                  <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-mono font-black uppercase tracking-wider border ${
                                    isCurrentlyPromoted 
                                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                                      : "bg-slate-900/60 text-slate-500 border-slate-800/40"
                                  }`}>
                                    {isCurrentlyPromoted ? "👑 PROMOTED" : "🏆 ELIGIBLE"}
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] font-mono text-slate-500 mt-3 flex items-center gap-1.5">
                <Info size={12} className="text-orange-400 shrink-0" />
                {activePool.id === 'finals' ? (
                  <span>Teams are ranked by Points, then by Net Run Rate (NRR) if points are equal. Click the <strong className="text-amber-500">'PROMOTE'</strong> button next to any number of teams from this Points Table to slot them into the Championship Playoffs!</span>
                ) : (
                  <span>Teams are ranked by Points (2 for win), then by Net Run Rate (NRR) if points are equal. Click 'PROMOTE' next to the winning team to slot them into the Championship bracket!</span>
                )}
              </p>
            </div>
          )}

          {/* Promo panel for All Play Against All Championship Stage */}
          {activePool.id === 'finals' && activePool.isRoundRobin && (
            <div className="mb-8 p-6 bg-slate-950/80 border-2 border-indigo-500/30 rounded-2xl shadow-xl space-y-6">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
                <span className="text-xs font-mono text-indigo-400 tracking-wider uppercase font-black">PLAYOFFS GENERATOR HUB</span>
              </div>
              
              <div>
                <h3 className="text-lg font-black text-white">Championship Stage: Playoffs Organizer info</h3>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  This dashboard automatically selects the optimal playoff layout and formats the next matches based strictly on the teams you promote from the points table above. No manual selection can be made within this hub.
                </p>
              </div>

              {/* Read-Only Status depending on chosen teams count from the Points Table */}
              {selectedPlayoffTeams.length < 2 ? (
                <div className="p-5 bg-slate-900/60 border border-dashed border-slate-800 rounded-xl text-center font-mono text-slate-450 text-xs py-8 space-y-2">
                  <span className="block text-amber-500 font-bold text-sm">⚠️ ACTION REQUIRED</span>
                  <p className="text-slate-400 max-w-md mx-auto">
                    Currently, there are <strong className="text-amber-400 font-bold">{selectedPlayoffTeams.length} teams</strong> promoted. Please click the <strong>'PROMOTE'</strong> buttons on the Round-Robin Points Table rows above to promote at least 2 teams to activate your playoff stage!
                  </p>
                </div>
              ) : (
                <>
                  {/* Step 1: Read-Only List of Promoted Teams */}
                  <div className="space-y-3">
                    <label className="block text-[11px] font-mono font-bold text-indigo-300 uppercase tracking-wider">
                      📋 Promoted Teams from Points Table
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                      {selectedPlayoffTeams.map((teamName, index) => (
                        <div key={teamName} className="flex items-center gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 text-white rounded-xl text-xs font-extrabold shadow-sm">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-sm" />
                          <span className="text-indigo-400 font-mono text-[9px]">#{index + 1}</span>
                          <span>{teamName}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] font-mono text-slate-500">
                      *Action note: To alter or remove any promoted team, click the respective 'PROMOTE' action button directly in the Points Table above.
                    </p>
                  </div>

                  {/* Step 2: Automatic Matchmaking Mode Select Details */}
                  <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-widest block">Selected Game Format Mode</span>
                      {(() => {
                        const count = selectedPlayoffTeams.length;
                        let modeName = "Knockout Bracket";
                        let modeDesc = "";
                        if (count === 2) {
                          modeName = "🏆 GRAND FINALE (Top 2)";
                          modeDesc = "A single high-stakes final game will determine the ultimate Champion.";
                        } else if (count === 3) {
                          modeName = "⚔️ THREE-WAY CHAMPIONSHIP (Semifinal format)";
                          modeDesc = "A 4-slot bracket. 1 team gets a Round-1 walkover BYE. The remaining 2 battle, with the winner meeting the BYE team in the Grand Finale.";
                        } else if (count === 4) {
                          modeName = "🔥 FOUR-WAY SEMIFINALS (Top 4)";
                          modeDesc = "Two balanced Semifinal matches. Winners advance to the Grand Finale.";
                        } else if (count > 4 && count <= 8) {
                          modeName = `⚡ QUARTERFINALS (${count} Teams)`;
                          modeDesc = `An 8-slot bracket format. ${8 - count} team(s) get automated Round-1 walkover BYEs based on standings ranks.`;
                        } else if (count > 8 && count <= 16) {
                          modeName = `🚀 ROUND OF 16 (${count} Teams)`;
                          modeDesc = `A 16-slot bracket format. ${16 - count} team(s) get automated Round-1 walkover BYEs.`;
                        } else {
                          modeName = `🔥 CHAMPIONSHIP TOURNAMENT (${count} Teams)`;
                          modeDesc = "Custom multi-round single-elimination bracket.";
                        }

                        return (
                          <>
                            <span className="text-sm font-black text-white block">{modeName}</span>
                            <span className="text-[11px] text-slate-400 font-mono block leading-relaxed">{modeDesc}</span>
                          </>
                        );
                      })()}
                    </div>

                    <div className="p-3.5 bg-slate-950/60 border border-slate-900 rounded-xl flex flex-col justify-center space-y-1.5 font-mono text-[11px]">
                      {(() => {
                        const count = selectedPlayoffTeams.length;
                        let P = 2;
                        while (P < count) P *= 2;
                        const byesCount = P - count;
                        const roundsCount = Math.round(Math.log2(P));
                        return (
                          <>
                            <div>🎯 Bracket Plan: <strong className="text-emerald-400">{roundsCount} rounds of play</strong></div>
                            <div>⚖️ Auto-balanced BYEs: <strong className="text-orange-400">{byesCount} team(s) starting with BYEs</strong></div>
                            <div>🔥 Random Matchmaker: <strong className="text-teal-400 font-bold">FULLY RANDOM SHUFFLE</strong></div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={handleGeneratePlayoffs}
                  disabled={selectedPlayoffTeams.length < 2}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs uppercase tracking-wider font-black transition-all shadow-lg cursor-pointer ${
                    selectedPlayoffTeams.length < 2
                      ? 'bg-slate-800 text-slate-500 border border-slate-900 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 hover:from-emerald-300 hover:to-teal-400 hover:scale-[1.015]'
                  }`}
                >
                  🚀 GENERATE RANDOMIZED PLAYOFFS BRACKET
                </button>

                {championshipPlayoffsPool && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onUpdatePlayoffsPool) {
                        onUpdatePlayoffsPool(null);
                      }
                    }}
                    className="px-4 py-3 bg-slate-900 border border-slate-800 text-red-450 hover:text-red-400 rounded-xl text-xs font-mono font-bold hover:bg-slate-800/80 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    ❌ CLEAR CURRENT PLAYOFFS
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BRACKET CANVAS STRUCTURE (Spacious custom scrollable canvas pane) */}
          <div className="flex items-stretch justify-start gap-12 overflow-x-auto pb-6 pt-6 px-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 custom-scrollbar">
            {activePool.rounds.map((roundMatches, rIdx) => (
              <div
                key={rIdx}
                className="flex flex-col justify-around gap-10 py-6 min-w-[250px] md:min-w-[290px] relative"
              >
                {/* Round Header */}
                <div className="absolute top-[-10px] left-0 right-0 text-center">
                  <span className="text-[11px] font-mono tracking-widest text-indigo-400 uppercase font-black bg-slate-900 px-2 py-0.5 rounded-md shadow-md border border-slate-800">
                    {getRoundLabel(activePool, rIdx)}
                  </span>
                </div>

                {roundMatches.map((match, mIdx) => {
                  const tA = getParticipantLabel(match, 'A');
                  const tB = getParticipantLabel(match, 'B');
                  
                  const isWinnerA = declaredWinners[match.id] === tA && tA !== 'BYE';
                  const isWinnerB = declaredWinners[match.id] === tB && tB !== 'BYE';
                  const hasWinner = isWinnerA || isWinnerB || match.isWalkover;
                  const curWinner = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);

                  const isEven = mIdx % 2 === 0;
                  const showConnector = activePool.isRoundRobin ? false : (rIdx < activePool.rounds.length - 1);

                  // High fidelity connector lines matching sport theme and dark mode perfectly with 100% solid opacity
                  const getConnectorColors = () => {
                    const activeColors = {
                      cricket: { border: 'border-orange-500', bg: 'bg-orange-500' },
                      carrom: { border: 'border-emerald-400', bg: 'bg-emerald-400' },
                      chess: { border: 'border-indigo-500', bg: 'bg-indigo-500' },
                    }[gameType] || { border: 'border-indigo-400', bg: 'bg-indigo-400' };

                    if (hasWinner) {
                      return {
                        border: `${activeColors.border} border-solid opacity-100`,
                        bg: `${activeColors.bg} opacity-100`
                      };
                    } else {
                      return {
                        border: 'border-slate-700 border-solid opacity-70',
                        bg: 'bg-slate-700 opacity-70'
                      };
                    }
                  };

                  const connColors = getConnectorColors();
                  const connectBorderColor = connColors.border;
                  const connectBgColor = connColors.bg;

                  const hVal = Math.pow(2, rIdx) * 110;

                  return (
                    <div
                      key={match.id}
                      className={`relative bg-slate-900 p-4 rounded-xl border transition-all duration-300 shadow-lg pl-5 ${
                        hasWinner 
                          ? 'border-slate-800 hover:border-slate-700 hover:shadow-xl' 
                          : 'border-slate-800/80 hover:border-slate-700/80 hover:shadow-xl'
                      }`}
                      id={`match-card-${match.id}`}
                    >
                      {/* Thick left-edge vertical status tagline */}
                      <div 
                        className={`absolute left-0 top-0 bottom-0 w-[4.5px] rounded-l-xl ${
                          hasWinner 
                            ? 'bg-emerald-500' // Emerald win strip
                            : 'bg-orange-500' // Orange scheduled strip
                        }`}
                      />

                      {/* Connection lines to adjacent rounds */}
                      {showConnector && (
                        isEven ? (
                          <div 
                            className={`absolute -right-6 top-1/2 w-6 border-r-2 border-t-2 ${connectBorderColor} rounded-tr-lg pointer-events-none`} 
                            style={{ height: `${hVal}px` }}
                          >
                            {/* Horizontal extension line to the next round card */}
                            <div 
                              className={`absolute bottom-0 w-6 h-[2px] ${connectBgColor}`} 
                              style={{ left: '100%' }}
                            />
                          </div>
                        ) : (
                          <div 
                            className={`absolute -right-6 bottom-1/2 w-6 border-r-2 border-b-2 ${connectBorderColor} rounded-br-lg pointer-events-none`}
                            style={{ height: `${hVal}px` }}
                          >
                            {/* Horizontal extension line to the next round card */}
                            <div 
                              className={`absolute top-0 w-6 h-[2px] ${connectBgColor}`} 
                              style={{ left: '100%' }}
                            />
                          </div>
                        )
                      )}

                      {/* Match # & Sched details */}
                      <div className="flex items-center justify-between gap-1.5 pb-2 mb-2 border-b border-slate-800/60 text-[10px] font-mono text-slate-500 font-bold">
                        <span className="text-slate-500">MATCH M{mIdx + 1}</span>
                        {match.isWalkover && (
                          <span className="text-[9px] text-emerald-450 bg-emerald-500/10 border border-emerald-500/20 py-0.5 px-1.5 rounded font-black font-mono">
                            BYE BYPASS
                          </span>
                        )}
                      </div>

                      {/* Sports participants slots */}
                      <div className="space-y-1.5">
                        {/* TEAM A */}
                        <div
                          onClick={() => {
                            if (!match.isWalkover && tA !== 'BYE') {
                              onDeclareWinner(match.id, tA);
                            }
                          }}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                            tA === 'BYE' 
                              ? 'opacity-35 text-slate-600 bg-slate-950 cursor-not-allowed border border-transparent'
                              : isWinnerA
                              ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 shadow-sm'
                              : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          <span className="text-xs font-semibold select-all text-slate-100 flex flex-col whitespace-normal break-words py-0.5 w-full">
                            <span className="flex items-center gap-1.5">
                              {isWinnerA ? `[W] ${tA}` : tA}
                              {isWinnerA && <CheckCircle2 size={13} className="text-emerald-400 shrink-0 inline" />}
                            </span>
                            {gameType === 'cricket' && match.runsScoredA !== undefined && (
                              <span className="text-[10px] text-orange-400 font-mono mt-0.5 font-bold">
                                🏏 {match.runsScoredA} runs ({match.oversFacedA} ov)
                              </span>
                            )}
                          </span>
                          {!match.isWalkover && tA !== 'BYE' && (
                            isWinnerA ? (
                              <span className="text-[8px] font-mono font-bold tracking-wider text-emerald-400 uppercase shrink-0">
                                WINNER
                              </span>
                            ) : (
                              !isExportingImg && (
                                <span className="text-[8px] font-mono font-bold tracking-wider text-slate-500 hover:text-slate-200 uppercase transition-colors shrink-0">
                                  DECLARE
                                </span>
                              )
                            )
                          )}
                        </div>

                        {/* Versus Divider */}
                        <div className="flex items-center gap-2 py-0.5 opacity-20">
                          <div className="flex-1 h-[0.5px] bg-slate-700" />
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-black">VS</span>
                          <div className="flex-1 h-[0.5px] bg-slate-700" />
                        </div>

                        {/* TEAM B */}
                        <div
                          onClick={() => {
                            if (!match.isWalkover && tB !== 'BYE') {
                              onDeclareWinner(match.id, tB);
                            }
                          }}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                            tB === 'BYE' 
                              ? 'opacity-35 text-slate-600 bg-slate-950 cursor-not-allowed border border-transparent'
                              : isWinnerB
                              ? 'bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 shadow-sm'
                              : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                          }`}
                        >
                          <span className="text-xs font-semibold select-all text-slate-100 flex flex-col whitespace-normal break-words py-0.5 w-full">
                            <span className="flex items-center gap-1.5">
                              {isWinnerB ? `[W] ${tB}` : tB}
                              {isWinnerB && <CheckCircle2 size={13} className="text-emerald-400 shrink-0 inline" />}
                            </span>
                            {gameType === 'cricket' && match.runsScoredB !== undefined && (
                              <span className="text-[10px] text-orange-400 font-mono mt-0.5 font-bold">
                                🏏 {match.runsScoredB} runs ({match.oversFacedB} ov)
                              </span>
                            )}
                          </span>
                          {!match.isWalkover && tB !== 'BYE' && (
                            isWinnerB ? (
                              <span className="text-[8px] font-mono font-bold tracking-wider text-emerald-400 uppercase shrink-0">
                                WINNER
                              </span>
                            ) : (
                              !isExportingImg && (
                                <span className="text-[8px] font-mono font-bold tracking-wider text-slate-500 hover:text-slate-200 uppercase transition-colors shrink-0">
                                  DECLARE
                                </span>
                              )
                            )
                          )}
                        </div>
                      </div>

                      {/* Cricket Score Editor panel */}
                      {gameType === 'cricket' && !match.isWalkover && tA !== 'BYE' && tB !== 'BYE' && !isExportingImg && (
                        <div className="mt-3">
                          {editingMatchId === match.id ? (
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-2.5">
                              <span className="block text-[9px] font-mono font-bold text-orange-400 uppercase tracking-widest">
                                ENTER MATCH RUNS & OVERS
                              </span>
                              
                              {/* Team A score */}
                              <div className="space-y-1">
                                <label className="block text-[8px] font-mono font-bold text-slate-400 uppercase truncate">
                                  {tA} Scored
                                </label>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input
                                    type="number"
                                    placeholder="Runs"
                                    value={runsA}
                                    onChange={(e) => setRunsA(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-1 px-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-orange-500"
                                  />
                                  <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Overs"
                                    value={oversA}
                                    onChange={(e) => setOversA(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-1 px-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-orange-500"
                                  />
                                </div>
                              </div>

                              {/* Team B score */}
                              <div className="space-y-1">
                                <label className="block text-[8px] font-mono font-bold text-slate-400 uppercase truncate">
                                  {tB} Scored
                                </label>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input
                                    type="number"
                                    placeholder="Runs"
                                    value={runsB}
                                    onChange={(e) => setRunsB(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-1 px-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-orange-500"
                                  />
                                  <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Overs"
                                    value={oversB}
                                    onChange={(e) => setOversB(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-md p-1 px-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-orange-500"
                                  />
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingMatchId(null)}
                                  className="flex-1 py-1 px-2 rounded bg-slate-900 text-slate-400 text-[9px] font-mono font-bold hover:text-white transition cursor-pointer"
                                >
                                  CANCEL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const rA = runsA === '' ? undefined : parseInt(runsA);
                                    const oA = oversA === '' ? undefined : parseFloat(oversA);
                                    const rB = runsB === '' ? undefined : parseInt(runsB);
                                    const oB = oversB === '' ? undefined : parseFloat(oversB);
                                    
                                    if (onUpdateMatchScores) {
                                      onUpdateMatchScores(match.id, rA, oA, rB, oB);
                                    }
                                    setEditingMatchId(null);
                                  }}
                                  className="flex-1 py-1 px-2 rounded bg-orange-600 text-slate-950 text-[9px] font-mono font-black hover:bg-orange-500 transition cursor-pointer"
                                >
                                  SAVE
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1.5 w-full">
                              <button
                                type="button"
                                onClick={() => startEditing(match)}
                                className="flex-1 py-1 px-1 rounded bg-slate-950 border border-slate-850 hover:border-slate-700 text-slate-400 hover:text-white text-[9px] font-mono font-bold transition cursor-pointer flex items-center justify-center gap-1"
                              >
                                🏏 {match.runsScoredA !== undefined || match.runsScoredB !== undefined ? 'EDIT SCORE' : 'ADD SCORE'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onEditSchedule?.(match)}
                                className="flex-1 py-1 px-1 rounded bg-slate-950 border border-indigo-950/60 hover:border-indigo-800 text-indigo-400 hover:text-indigo-200 text-[9px] font-mono font-black transition cursor-pointer flex items-center justify-center gap-1"
                              >
                                📅 SCHEDULE
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Chess and Carrom get a full-width Schedule edit button! */}
                      {gameType !== 'cricket' && !match.isWalkover && tA !== 'BYE' && tB !== 'BYE' && !isExportingImg && (
                        <div className="mt-2 text-center">
                          <button
                            type="button"
                            onClick={() => onEditSchedule?.(match)}
                            className="w-full py-1 rounded bg-slate-950 border border-indigo-950/60 hover:border-indigo-800 text-indigo-400 hover:text-indigo-200 text-[9px] font-mono font-black transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            📅 EDIT DATE/TIME/BOARD
                          </button>
                        </div>
                      )}

                      {/* Card Details Footer */}
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5 text-[10px] text-slate-400 font-sans">
                        {match.isWalkover ? (
                          <div className="text-slate-500 italic text-[9.5px]">
                            • BYE Bypass (No games scheduled)
                          </div>
                        ) : (
                          (() => {
                            const isSinglePool = pools.length === 1;
                            const isWholeTournamentFinal =
                              (match.poolId === 'finals' && match.roundIndex === finalsPool.rounds.length - 1) ||
                              (isSinglePool && pools[0] && match.poolId === pools[0].id && !pools[0].isRoundRobin && match.roundIndex === pools[0].rounds.length - 1);

                            if (isWholeTournamentFinal) {
                              const p = match.scheduledTime ? match.scheduledTime.split(', ') : [];
                              const startTimeText = p.length >= 3 ? p[2] : '';
                              return (
                                <div className="space-y-1">
                                  <div className="text-orange-400 font-extrabold text-[9px] tracking-widest uppercase flex items-center gap-1">
                                    🏆 CHAMPIONSHIP SHOWDOWN
                                  </div>
                                  <div className="text-slate-400 font-medium flex items-center justify-between">
                                    <span>
                                      {match.dayNumber ? `Day ${match.dayNumber}` : 'Day Awaiting'} •{' '}
                                      <span className="text-slate-200 font-mono">
                                        {match.scheduledTime ? (
                                          (() => {
                                            const parts = match.scheduledTime.split(', ');
                                            if (parts.length >= 2) {
                                              return `${parts[0]}, ${parts[1]}, 2026`; // Complete full year!
                                            }
                                            return match.scheduledTime;
                                          })()
                                        ) : (
                                          'TBD Date'
                                        )}
                                      </span>
                                    </span>
                                    {match.courtNumber && (
                                      <span className="text-indigo-400 font-mono font-black uppercase text-[8px] bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/15 shrink-0 ml-1">
                                        {getCourtLabel(match.courtNumber)}
                                      </span>
                                    )}
                                  </div>
                                  {startTimeText && (
                                    <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-850 p-1.5 rounded-lg text-slate-300 font-mono text-[9px] w-full">
                                      <Clock size={11} className="text-indigo-400 shrink-0" />
                                      <div className="flex items-baseline gap-1">
                                        <span className="font-bold text-slate-400">TIME:</span>
                                        <span className="text-emerald-400 font-bold">
                                          {startTimeText} - {match.endTime || 'TBD End'}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            const schParts = match.scheduledTime ? match.scheduledTime.split(', ') : [];
                            const isTimeEmpty = schParts.length === 2;
                            return (
                              <>
                                <div className="flex items-center justify-between text-slate-400 font-medium">
                                  <span>
                                    {match.dayNumber ? `Day ${match.dayNumber}` : 'Day Awaiting'} •{' '}
                                    <span className="text-slate-200 font-mono">
                                      {match.scheduledTime ? (
                                        (() => {
                                          if (schParts.length >= 2) {
                                            return `${schParts[0]}, ${schParts[1]}, 2026`; // Complete full year!
                                          }
                                          return match.scheduledTime;
                                        })()
                                      ) : (
                                        'TBD Date'
                                      )}
                                    </span>
                                  </span>
                                  {match.courtNumber && (
                                    <span className="text-indigo-400 font-mono font-black uppercase text-[8px] bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/15 shrink-0 ml-1">
                                      {getCourtLabel(match.courtNumber)}
                                    </span>
                                  )}
                                </div>
                                
                                {!isTimeEmpty && (
                                  <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-850 p-1.5 rounded-lg text-slate-300 font-mono text-[9px] w-full">
                                    <Clock size={11} className="text-indigo-400 shrink-0" />
                                    <div className="flex items-baseline gap-1">
                                      <span className="font-bold text-slate-400">TIME:</span>
                                      <span className="text-emerald-400 font-bold">
                                        {match.scheduledTime ? (
                                          (() => {
                                            const startT = schParts.length >= 3 ? schParts[2] : match.scheduledTime;
                                            const endT = match.endTime || 'TBD End';
                                            return `${startT} - ${endT}`;
                                          })()
                                        ) : (
                                          'TBD Start - End'
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()
                        )}
                        <span className="text-[8px] text-slate-600 font-mono font-medium block text-right mt-1">
                          {match.isWalkover ? 'BYE' : `M${mIdx + 1}`}
                        </span>
                      </div>

                      {/* Advances banner */}
                      {hasWinner && curWinner && curWinner !== 'BYE' && (
                        <div className="mt-2.5 text-center bg-emerald-500/5 p-1.5 rounded-lg border border-emerald-500/10">
                          <span className="text-[9.5px] font-mono text-emerald-400 font-semibold flex items-center justify-center gap-1 uppercase">
                            <UserCheck size={11} /> {curWinner.split(' & ')[0]} Advances <ArrowRight size={10} />
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Championship Playoffs Bracket Render Area */}
          {activePool.id === 'finals' && championshipPlayoffsPool && (
            <div className="mt-12 pt-12 border-t border-slate-800 space-y-8">
              <div className="text-center">
                <span className="text-xs font-mono text-indigo-400 tracking-wider uppercase font-bold text-center block">THE SUPREME RESOLUTION PHASE</span>
                <h2 className="text-2xl font-black text-center text-white mt-1 mb-8 flex items-center justify-center gap-2">
                  🏆 Championship Playoffs Bracket
                </h2>
              </div>

              <div className="flex items-stretch justify-center gap-12 overflow-x-auto pb-6 pt-6 px-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 custom-scrollbar">
                {championshipPlayoffsPool.rounds.map((roundMatches, rIdx) => (
                  <div
                    key={rIdx}
                    className="flex flex-col justify-around gap-10 py-6 min-w-[250px] md:min-w-[290px] relative"
                  >
                    {/* Round Header */}
                    <div className="absolute top-[-10px] left-0 right-0 text-center text-xs">
                      <span className="text-[11px] font-mono tracking-widest text-emerald-400 uppercase font-bold bg-slate-900 px-2.5 py-0.5 rounded-md shadow-md border border-slate-800 animate-pulse">
                        {rIdx === championshipPlayoffsPool.rounds.length - 1 ? 'GRAND FINALS' : rIdx === championshipPlayoffsPool.rounds.length - 2 ? 'SEMI-FINALS' : 'QUARTER-FINALS'}
                      </span>
                    </div>

                    {roundMatches.map((match, mIdx) => {
                      const tA = getPlayoffParticipantLabel(match, 'A');
                      const tB = getPlayoffParticipantLabel(match, 'B');
                      
                      const isWinnerA = declaredWinners[match.id] === tA && tA !== 'BYE';
                      const isWinnerB = declaredWinners[match.id] === tB && tB !== 'BYE';
                      const hasWinner = isWinnerA || isWinnerB || match.isWalkover;
                      const curWinner = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);

                      return (
                        <div key={match.id} className="relative z-10 flex flex-col group py-2">
                          <div className={`p-4 rounded-2xl bg-slate-950 border transition-all duration-300 relative ${
                            hasWinner ? 'border-emerald-500/30' : 'border-slate-800 hover:border-indigo-500/50'
                          } shadow-lg`}>
                            
                            {/* Match index tracker tag */}
                            <span className="absolute top-[-8px] left-3 text-[9px] font-mono font-bold tracking-widest text-slate-500 bg-slate-950 border border-slate-850 px-1.5 py-0.5 rounded uppercase">
                              PLAYOFF M#{mIdx + 1}
                            </span>

                            {/* Schedule slot status bar */}
                            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-3 border-b border-slate-900 pb-2">
                              <span>🎯 PLAYOFF MATCH</span>
                              <span>{match.scheduledTime || 'TBD'}</span>
                            </div>

                            <div className="space-y-3">
                              {/* Team A Card Layout */}
                              <div
                                onClick={() => {
                                  if (tA !== 'BYE') {
                                    onDeclareWinner(match.id, tA);
                                  }
                                }}
                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                  isWinnerA 
                                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold' 
                                    : hasWinner 
                                    ? 'bg-slate-900/30 border-slate-850 text-slate-500 opacity-60' 
                                    : 'bg-slate-900 border-slate-850 text-slate-100 hover:bg-slate-850 hover:border-slate-705'
                                }`}
                              >
                                <span className="font-bold truncate text-xs">{tA}</span>
                                {isWinnerA && <span className="text-[10px] font-black font-mono ml-2">🏆 WIN</span>}
                              </div>

                              {/* VS separator line with interactive badge */}
                              <div className="relative text-center my-0.5">
                                <span className="absolute inset-0 flex items-center" aria-hidden="true">
                                  <span className="w-full border-t border-slate-900" />
                                </span>
                                <span className="relative inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-500 bg-slate-950 rounded border border-slate-900">
                                  VS
                                </span>
                              </div>

                              {/* Team B Card Layout */}
                              <div
                                onClick={() => {
                                  if (tB !== 'BYE') {
                                    onDeclareWinner(match.id, tB);
                                  }
                                }}
                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                  isWinnerB 
                                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold' 
                                    : hasWinner 
                                    ? 'bg-slate-900/30 border-slate-850 text-slate-500 opacity-60' 
                                    : 'bg-slate-900 border-slate-850 text-slate-100 hover:bg-slate-850 hover:border-slate-705'
                                }`}
                              >
                                <span className="font-bold truncate text-xs">{tB}</span>
                                {isWinnerB && <span className="text-[10px] font-black font-mono ml-2">🏆 WIN</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Champ declaration overlay inside the playoffs bracket */}
              {(() => {
                const lastRound = championshipPlayoffsPool.rounds[championshipPlayoffsPool.rounds.length - 1];
                if (lastRound && lastRound.length > 0) {
                  const finalMatch = lastRound[0];
                  const playoffChamp = declaredWinners[finalMatch.id];
                  if (playoffChamp) {
                    return (
                      <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-3xl p-8 max-w-xl mx-auto text-center space-y-3 shadow-2xl relative overflow-hidden my-6">
                        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-amber-500 opacity-5 blur-3xl rounded-full" />
                        <Trophy className="text-amber-400 mx-auto animate-bounce" size={48} />
                        <div>
                          <p className="text-[11px] font-mono text-amber-500 font-bold uppercase tracking-widest animate-pulse">GRAND CHAMPIONSHIP ULTIMATE VICTOR</p>
                          <h3 className="text-3xl font-black text-white mt-1 uppercase tracking-tight">{playoffChamp}</h3>
                          <p className="text-xs font-mono text-slate-400 mt-2">
                            Completed and triumphed through the Round-Robin Group Phase, and conquered the Playoff Elimination Bracket!
                          </p>
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              })()}
            </div>
          )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Lightbox Export Image Success Showcase Overlay */}
      <AnimatePresence>
        {exportedImgUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
            id="image-download-dialog-overlay"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 text-left shadow-2xl relative"
              id="image-download-dialog-content"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <Trophy className="text-amber-500 shrink-0" size={20} /> 
                    Pool Fixture Image Exported!
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Image successfully generated for <b className="text-indigo-400">{activePool.name}</b> in high-definition 2x scale.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(exportedImgUrl);
                    setExportedImgUrl(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs transition cursor-pointer"
                  id="btn-close-image-download-dialog"
                >
                  CLOSE
                </button>
              </div>

              {/* Instructions banner */}
              <div className="p-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">PRO TIP for Devices & Restricted Iframes:</span>
                  <p className="mt-1 leading-relaxed text-[11px] text-slate-300">
                    If your browser or device security prevents the automatic file download in this preview frame, simply <b>right-click</b> the picture below and click <b>"Save Image As..."</b>, or <b>press and hold the image</b> on your touchscreen device to download it instantly.
                  </p>
                </div>
              </div>

              {/* Image Preview Canvas frame */}
              <div className="p-2 rounded-xl bg-slate-950 border border-slate-850 text-center mb-5 overflow-hidden max-h-[44vh] flex items-center justify-center">
                <img
                  src={exportedImgUrl}
                  alt={`${activePool.name} Fixtures Snapshot`}
                  className="max-w-full max-h-[42vh] object-contain rounded-lg border border-slate-800 shadow-md"
                />
              </div>

              {/* Action Buttons list */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-850 text-xs">
                <div className="text-slate-400 font-mono text-[10.5px]">
                  Format: <span className="text-slate-200 uppercase font-bold">{exportedImgFormat}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <a
                    href={exportedImgUrl}
                    download={`${activePool.name.trim().replace(/\s+/g, '_')}_fixture.${exportedImgFormat === 'png' ? 'png' : 'jpg'}`}
                    className="inline-flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold font-mono px-4 py-2 rounded-lg text-xs transition active:scale-95"
                    id="btn-force-download-fallback"
                  >
                    <Download size={13} />
                    SAVE TO DISK
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(exportedImgUrl);
                      setExportedImgUrl(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold transition cursor-pointer"
                    id="btn-dismiss-fallback-modal"
                  >
                    CLOSE PREVIEW
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
