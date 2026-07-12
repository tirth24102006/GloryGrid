/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DaySchedule, Match, Pool, TournamentResult, GameType } from '../types';

function parseDateAndTime(baseDate: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function generateTournament(
  gameType: GameType,
  participantNames: string[],
  poolsCount: number,
  matchDurationMin: number,
  restTimeMin: number,
  startDateStr: string,
  schedules: DaySchedule[],
  isDoubles: boolean,
  courtsCount: number,
  customPoolRealCounts?: number[],
  customPoolByeCounts?: number[],
  allPlayAgainstAll?: boolean,
  championshipFormat?: 'knockout' | 'allplay',
  teamsToPromotePerPool?: number
): TournamentResult {
  // Strict constraint: Rest/buffer time must be capped at 20 minutes maximum
  const enforcedRestTimeMin = Math.min(20, Math.max(0, restTimeMin));

  // Helper to get pool name/labels dynamically supporting A-Z and beyond (Excel style)
  const getPoolLabel = (index: number): string => {
    let label = '';
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode((temp % 26) + 65) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  };

  // 1. Divine Pools
  const pools: Pool[] = [];
  for (let p = 0; p < poolsCount; p++) {
    pools.push({
      id: `pool-${p}`,
      name: `Pool ${getPoolLabel(p)}`,
      teams: [],
      byesCount: 0,
      rounds: [],
      isRoundRobin: (gameType === 'cricket' && allPlayAgainstAll),
    });
  }

  // Distribute teams to pools
  if (customPoolRealCounts && customPoolRealCounts.length === poolsCount) {
    let namesIndex = 0;
    for (let p = 0; p < poolsCount; p++) {
      const size = customPoolRealCounts[p] ?? 0;
      for (let s = 0; s < size; s++) {
        if (namesIndex < participantNames.length) {
          pools[p].teams.push(participantNames[namesIndex]);
          namesIndex++;
        } else {
          // Fallback placeholder if custom pool allocation is larger than the total registered players
          pools[p].teams.push(`Slot ${namesIndex + 1}`);
          namesIndex++;
        }
      }
    }
  } else {
    // Default: Distribute teams to pools (staggered allocation for balance)
    let poolIndex = 0;
    for (const team of participantNames) {
      if (!team || team.trim() === '') continue;
      pools[poolIndex].teams.push(team.trim());
      poolIndex = (poolIndex + 1) % poolsCount;
    }
  }

  const allPoolMatches: Match[] = [];

  // 2. Build Bracket matches for each pool
  for (let p = 0; p < pools.length; p++) {
    const pPool = pools[p];
    const teams = pPool.teams;
    const count = teams.length;

    if (count === 0) continue;

    if (gameType === 'cricket' && allPlayAgainstAll) {
      pPool.isRoundRobin = true;
      pPool.byesCount = 0;

      const list = [...teams];
      if (list.length % 2 !== 0) {
        list.push('BYE');
      }
      const n = list.length;
      const numRounds = n - 1;

      for (let r = 0; r < numRounds; r++) {
        const roundMatches: Match[] = [];
        for (let i = 0; i < n / 2; i++) {
          const teamA = list[i];
          const teamB = list[n - 1 - i];

          if (teamA !== 'BYE' && teamB !== 'BYE') {
            roundMatches.push({
              id: `${pPool.id}-R${r}-M${roundMatches.length}`,
              poolId: pPool.id,
              poolName: pPool.name,
              roundIndex: r,
              matchIndex: roundMatches.length,
              teamA,
              teamB,
              winner: null,
              scheduledTime: null,
              endTime: null,
              prevMatchAId: null,
              prevMatchBId: null,
              isWalkover: false,
              matchDurationMin,
              restTimeMin: enforcedRestTimeMin,
            });
          }
        }
        if (roundMatches.length > 0) {
          pPool.rounds.push(roundMatches);
        }
        
        // Circle rotation method keeping the first element fixed
        list.splice(1, 0, list.pop()!);
      }

      pPool.rounds.forEach(rnd => {
        allPoolMatches.push(...rnd);
      });
      continue;
    }

    // Determine total slots including manual byes override, if requested
    let customByes = (customPoolByeCounts && customPoolByeCounts[p] !== undefined) ? customPoolByeCounts[p] : null;
    let powerOfTwo = 1;
    let k = 0;

    if (customByes !== null) {
      const totalSlots = count + customByes;
      while (powerOfTwo < totalSlots) {
        powerOfTwo *= 2;
        k++;
      }
    } else {
      while (powerOfTwo < count) {
        powerOfTwo *= 2;
        k++;
      }
    }

    // We need at least 1 round even if count is 1
    if (powerOfTwo < 2) {
      powerOfTwo = 2;
      k = 1;
    }

    pPool.byesCount = powerOfTwo - count;

    // Distribute byes in Round 0
    // To feed Slot A and Slot B without BYE vs BYE:
    const matchesCount = powerOfTwo / 2;
    const poolTeams = [...teams];
    const slotA: string[] = [];
    const slotB: string[] = [];

    for (let j = 0; j < matchesCount; j++) {
      slotA.push(poolTeams.shift() || 'BYE');
    }
    for (let j = 0; j < matchesCount; j++) {
      slotB.push(poolTeams.shift() || 'BYE');
    }

    // Build Round 0
    const round0: Match[] = [];
    for (let j = 0; j < matchesCount; j++) {
      const teamAName = slotA[j];
      const teamBName = slotB[j];
      const isABy = teamAName === 'BYE';
      const isBBy = teamBName === 'BYE';
      const isWalkover = isABy || isBBy;
      let winner: string | null = null;
      if (isWalkover) {
        winner = isABy ? teamBName : teamAName;
      }

      round0.push({
        id: `${pPool.id}-R0-M${j}`,
        poolId: pPool.id,
        poolName: pPool.name,
        roundIndex: 0,
        matchIndex: j,
        teamA: teamAName,
        teamB: teamBName,
        winner,
        scheduledTime: null,
        endTime: null,
        prevMatchAId: null,
        prevMatchBId: null,
        isWalkover,
        matchDurationMin,
        restTimeMin: enforcedRestTimeMin,
      });
    }
    pPool.rounds.push(round0);

    // Build Subsequent Rounds
    for (let r = 1; r < k; r++) {
      const prevRoundMatches = pPool.rounds[r - 1];
      const roundMatchesCount = prevRoundMatches.length / 2;
      const currentRound: Match[] = [];

      for (let j = 0; j < roundMatchesCount; j++) {
        const prevM1 = prevRoundMatches[2 * j];
        const prevM2 = prevRoundMatches[2 * j + 1];

        // Placeholders for team names
        const teamAName = `Winner of M${prevM1.matchIndex + 1}`;
        const teamBName = `Winner of M${prevM2.matchIndex + 1}`;

        currentRound.push({
          id: `${pPool.id}-R${r}-M${j}`,
          poolId: pPool.id,
          poolName: pPool.name,
          roundIndex: r,
          matchIndex: j,
          teamA: teamAName,
          teamB: teamBName,
          winner: null,
          scheduledTime: null,
          endTime: null,
          prevMatchAId: prevM1.id,
          prevMatchBId: prevM2.id,
          isWalkover: false, // will play
          matchDurationMin,
          restTimeMin: enforcedRestTimeMin,
        });
      }
      pPool.rounds.push(currentRound);
    }

    // Collect all matches of this pool
    pPool.rounds.forEach(rnd => {
      allPoolMatches.push(...rnd);
    });
  }

  // 3. Build Finals Pool (Winners of other pools)
  const promoteCount = (gameType === 'cricket' && teamsToPromotePerPool) ? teamsToPromotePerPool : 1;
  const finalTeamsList: string[] = [];
  pools.forEach(p => {
    if (promoteCount === 1) {
      finalTeamsList.push(`Winner of ${p.name}`);
    } else if (promoteCount === 2) {
      finalTeamsList.push(`Winner of ${p.name}`);
      finalTeamsList.push(`Runner-up of ${p.name}`);
    } else {
      for (let j = 1; j <= promoteCount; j++) {
        let suffix = 'th';
        if (j === 1) suffix = 'st';
        else if (j === 2) suffix = 'nd';
        else if (j === 3) suffix = 'rd';
        finalTeamsList.push(`${j}${suffix} of ${p.name}`);
      }
    }
  });

  const finalsPool: Pool = {
    id: 'finals',
    name: 'Championship Stage',
    teams: finalTeamsList,
    byesCount: 0,
    rounds: [],
    isRoundRobin: championshipFormat === 'allplay',
  };

  const finalTeams = [...finalsPool.teams];
  const fc = finalTeams.length;

  if (fc > 0) {
    if (championshipFormat === 'allplay') {
      // Build a full all-play-against-all Round Robin for the promoted pool winners
      const list = [...finalTeams];
      if (list.length % 2 !== 0) {
        list.push('BYE');
      }
      const n = list.length;
      const numRounds = n - 1;

      // Helper to dynamically locate the final match id of a specific pool
      const getPoolLastMatchId = (teamName: string): string | null => {
        if (!teamName || !teamName.startsWith('Winner of ')) return null;
        const pName = teamName.substring('Winner of '.length);
        const sourcePool = pools.find(p => p.name === pName);
        if (sourcePool) {
          if (sourcePool.isRoundRobin) {
            return `${sourcePool.id}-winner`;
          }
          if (sourcePool.rounds.length > 0) {
            const lastRound = sourcePool.rounds[sourcePool.rounds.length - 1];
            if (lastRound && lastRound.length > 0) {
              return lastRound[0].id;
            }
          }
        }
        return null;
      };

      for (let r = 0; r < numRounds; r++) {
        const roundMatches: Match[] = [];
        for (let i = 0; i < n / 2; i++) {
          const teamAName = list[i];
          const teamBName = list[n - 1 - i];

          if (teamAName !== 'BYE' && teamBName !== 'BYE') {
            const prevMatchAId = getPoolLastMatchId(teamAName);
            const prevMatchBId = getPoolLastMatchId(teamBName);

            roundMatches.push({
              id: `finals-R${r}-M${roundMatches.length}`,
              poolId: 'finals',
              poolName: 'Championship Stage',
              roundIndex: r,
              matchIndex: roundMatches.length,
              teamA: teamAName,
              teamB: teamBName,
              winner: null,
              scheduledTime: null,
              endTime: null,
              prevMatchAId,
              prevMatchBId,
              isWalkover: false,
              matchDurationMin,
              restTimeMin: enforcedRestTimeMin,
            });
          }
        }
        if (roundMatches.length > 0) {
          finalsPool.rounds.push(roundMatches);
        }
        
        // Circle rotation method keeping the first element fixed
        list.splice(1, 0, list.pop()!);
      }
    } else {
      // Traditional Knockout Bracket layout
      let fPower = 1;
      let fk = 0;
      while (fPower < fc) {
        fPower *= 2;
        fk++;
      }
      if (fPower < 2) {
        fPower = 2;
        fk = 1;
      }

      finalsPool.byesCount = fPower - fc;
      const fMatchesCount = fPower / 2;
      const fSlotA: string[] = [];
      const fSlotB: string[] = [];

      if (fc === 4) {
        // Semifinal Match 1: Winner of Pool A vs Winner of Pool C
        // Semifinal Match 2: Winner of Pool D vs Winner of Pool B
        fSlotA.push(finalTeams[0]); // Winner of Pool A
        fSlotB.push(finalTeams[2]); // Winner of Pool C

        fSlotA.push(finalTeams[3]); // Winner of Pool D
        fSlotB.push(finalTeams[1]); // Winner of Pool B
      } else {
        for (let j = 0; j < fMatchesCount; j++) {
          fSlotA.push(finalTeams.shift() || 'BYE');
        }
        for (let j = 0; j < fMatchesCount; j++) {
          fSlotB.push(finalTeams.shift() || 'BYE');
        }
      }

      // Finals Round 0
      const fRound0: Match[] = [];
      for (let j = 0; j < fMatchesCount; j++) {
        const teamAName = fSlotA[j];
        const teamBName = fSlotB[j];
        const isABy = teamAName === 'BYE';
        const isBBy = teamBName === 'BYE';
        const isWalkover = isABy || isBBy;
        let winner: string | null = null;
        if (isWalkover) {
          winner = isABy ? teamBName : teamAName;
        }

        // Helper to dynamically locate the final match id of a specific pool
        const getPoolLastMatchId = (teamName: string): string | null => {
          if (!teamName || !teamName.startsWith('Winner of ')) return null;
          const pName = teamName.substring('Winner of '.length);
          const sourcePool = pools.find(p => p.name === pName);
          if (sourcePool) {
            if (sourcePool.isRoundRobin) {
              return `${sourcePool.id}-winner`;
            }
            if (sourcePool.rounds.length > 0) {
              const lastRound = sourcePool.rounds[sourcePool.rounds.length - 1];
              if (lastRound && lastRound.length > 0) {
                return lastRound[0].id;
              }
            }
          }
          return null;
        };

        const prevMatchAId = getPoolLastMatchId(teamAName);
        const prevMatchBId = getPoolLastMatchId(teamBName);

        fRound0.push({
          id: `finals-R0-M${j}`,
          poolId: 'finals',
          poolName: 'Championship Stage',
          roundIndex: 0,
          matchIndex: j,
          teamA: teamAName,
          teamB: teamBName,
          winner,
          scheduledTime: null,
          endTime: null,
          prevMatchAId,
          prevMatchBId,
          isWalkover,
          matchDurationMin,
          restTimeMin: enforcedRestTimeMin,
        });
      }
      finalsPool.rounds.push(fRound0);

      // Finals Subsequent Rounds
      for (let r = 1; r < fk; r++) {
        const prevRoundMatches = finalsPool.rounds[r - 1];
        const roundMatchesCount = prevRoundMatches.length / 2;
        const currentRound: Match[] = [];

        for (let j = 0; j < roundMatchesCount; j++) {
          const prevM1 = prevRoundMatches[2 * j];
          const prevM2 = prevRoundMatches[2 * j + 1];

          const teamAName = `Winner of Finals M${prevM1.matchIndex + 1}`;
          const teamBName = `Winner of Finals M${prevM2.matchIndex + 1}`;

          currentRound.push({
            id: `finals-R${r}-M${j}`,
            poolId: 'finals',
            poolName: 'Championship Stage',
            roundIndex: r,
            matchIndex: j,
            teamA: teamAName,
            teamB: teamBName,
            winner: null,
            scheduledTime: null,
            endTime: null,
            prevMatchAId: prevM1.id,
            prevMatchBId: prevM2.id,
            isWalkover: false,
            matchDurationMin,
            restTimeMin: enforcedRestTimeMin,
          });
        }
        finalsPool.rounds.push(currentRound);
      }
    }
  }

  // 4. Generate Timeslots and Schedule All Matches topologically
  // We sort topologically:
  // - All Round 0 Pool matches (Pool A R0, Pool B R0, etc.)
  // - All Round 1 Pool matches...
  // - ...
  // - Finals Pool Round 0, Round 1...
  
  const orderedMatchesToSchedule: Match[] = [];
  
  // Find maximum pool tree height
  const maxPoolRounds = Math.max(...pools.map(p => p.rounds.length), 0);
  for (let r = 0; r < maxPoolRounds; r++) {
    for (const p of pools) {
      if (p.rounds[r]) {
        orderedMatchesToSchedule.push(...p.rounds[r]);
      }
    }
  }

  // Append Finals Pool matches
  finalsPool.rounds.forEach(rnd => {
    orderedMatchesToSchedule.push(...rnd);
  });

  // Calculate day date schedules
  const baseDate = new Date(startDateStr);
  const dayRanges: { start: Date; end: Date }[] = [];

  for (const sched of schedules) {
    const dayBase = new Date(baseDate);
    dayBase.setDate(dayBase.getDate() + (sched.dayNumber - 1));

    const dayStart = parseDateAndTime(dayBase, sched.startTime);
    let dayEnd = parseDateAndTime(dayBase, sched.endTime);

    // Overnight rule: e.g. 19:00 to 02:00 means we end following morning
    if (dayEnd < dayStart) {
      dayEnd.setDate(dayEnd.getDate() + 1);
    }

    dayRanges.push({ start: dayStart, end: dayEnd });
  }

  // Let's schedule!
  const matchEndTimes: Record<string, Date> = {};
  const matchDayIndices: Record<string, number> = {};
  let unboundMatchesCount = 0;

  // Track next available time for each court on each day
  const courtNextAvailable: Date[][] = [];
  for (let d = 0; d < dayRanges.length; d++) {
    courtNextAvailable[d] = [];
    for (let c = 0; c < courtsCount; c++) {
      courtNextAvailable[d][c] = new Date(dayRanges[d].start);
    }
  }

  // Also track overflow schedules per court (starting at last day end)
  const lastDay = dayRanges[dayRanges.length - 1] || { start: new Date(), end: new Date() };
  const courtOverflowAvailable: Date[] = [];
  for (let c = 0; c < courtsCount; c++) {
    courtOverflowAvailable[c] = new Date(lastDay.end);
  }

  for (const match of orderedMatchesToSchedule) {
    if (match.isWalkover) {
      // Walkovers don't take time - advance instantly
      continue;
    }

    // Determine earliest possible start based on dependencies
    let earliestStart = dayRanges.length > 0 ? new Date(dayRanges[0].start) : new Date();

    let parentADayIdx: number | null = null;
    let parentBDayIdx: number | null = null;
    let parentAEndTime: Date | null = null;
    let parentBEndTime: Date | null = null;

    // Dependencies of the match:
    // If we have previous matches, they must finish and rest must elapse
    if (match.prevMatchAId && matchEndTimes[match.prevMatchAId]) {
      parentAEndTime = matchEndTimes[match.prevMatchAId];
      parentADayIdx = matchDayIndices[match.prevMatchAId] ?? null;
      const parentAEnd = new Date(parentAEndTime.getTime() + enforcedRestTimeMin * 60000);
      if (parentAEnd > earliestStart) {
        earliestStart = parentAEnd;
      }
    }
    if (match.prevMatchBId && matchEndTimes[match.prevMatchBId]) {
      parentBEndTime = matchEndTimes[match.prevMatchBId];
      parentBDayIdx = matchDayIndices[match.prevMatchBId] ?? null;
      const parentBEnd = new Date(parentBEndTime.getTime() + enforcedRestTimeMin * 60000);
      if (parentBEnd > earliestStart) {
        earliestStart = parentBEnd;
      }
    }

    const hasParents = parentAEndTime !== null || parentBEndTime !== null;
    let maxParentDayIdx = -1;
    if (parentADayIdx !== null) maxParentDayIdx = Math.max(maxParentDayIdx, parentADayIdx);
    if (parentBDayIdx !== null) maxParentDayIdx = Math.max(maxParentDayIdx, parentBDayIdx);

    let maxParentEndTime: Date | null = null;
    if (parentAEndTime && parentBEndTime) {
      maxParentEndTime = parentAEndTime > parentBEndTime ? parentAEndTime : parentBEndTime;
    } else if (parentAEndTime) {
      maxParentEndTime = parentAEndTime;
    } else if (parentBEndTime) {
      maxParentEndTime = parentBEndTime;
    }

    // Define gap thresholds to avoid consecutive/back-to-back matches for the same playing branch
    // Respect exactly the user input rest/buffer time without adding unsolicited long safety gaps
    const idealConsecutiveGapMs = enforcedRestTimeMin * 60000;
    const moderateConsecutiveGapMs = enforcedRestTimeMin * 60000;

    let selectedDayIdx: number | null = null;
    let selectedCourtIdx: number | null = null;
    let selectedStart: Date | null = null;
    let selectedEnd: Date | null = null;

    // Tiered search:
    // Tier 1: Try to schedule on a different day than parents, OR if same day, with an ideal gap (avoid consecutive play).
    // Tier 2: Accept a moderate gap on the parent's day if Tier 1 is impossible.
    // Tier 3: Fall back to minimum rest (parent end + enforcedRestTimeMin) if no gap slots are free.
    const tiers = [1, 2, 3];
    for (const tier of tiers) {
      let bestDayIdx: number | null = null;
      let bestCourtIdx: number | null = null;
      let bestStart: Date | null = null;
      let bestEnd: Date | null = null;

      for (let d = 0; d < dayRanges.length; d++) {
        const day = dayRanges[d];
        for (let c = 0; c < courtsCount; c++) {
          const courtAvail = courtNextAvailable[d][c];
          
          const basePotentialStart = new Date(Math.max(earliestStart.getTime(), courtAvail.getTime(), day.start.getTime()));
          let potentialStart = new Date(basePotentialStart);

          if (hasParents && d === maxParentDayIdx && maxParentEndTime) {
            if (tier === 1) {
              const gapTarget = new Date(maxParentEndTime.getTime() + idealConsecutiveGapMs);
              if (gapTarget > potentialStart) {
                potentialStart = gapTarget;
              }
            } else if (tier === 2) {
              const gapTarget = new Date(maxParentEndTime.getTime() + moderateConsecutiveGapMs);
              if (gapTarget > potentialStart) {
                potentialStart = gapTarget;
              }
            }
          }

          const potentialEnd = new Date(potentialStart.getTime() + matchDurationMin * 60000);

          if (potentialEnd.getTime() <= day.end.getTime()) {
            if (bestStart === null || potentialStart < bestStart) {
              bestDayIdx = d;
              bestCourtIdx = c;
              bestStart = potentialStart;
              bestEnd = potentialEnd;
            }
          }
        }
      }

      if (bestDayIdx !== null && bestCourtIdx !== null && bestStart !== null && bestEnd !== null) {
        selectedDayIdx = bestDayIdx;
        selectedCourtIdx = bestCourtIdx;
        selectedStart = bestStart;
        selectedEnd = bestEnd;
        break;
      }
    }

    if (selectedDayIdx !== null && selectedCourtIdx !== null && selectedStart !== null && selectedEnd !== null) {
      match.scheduledTime = selectedStart.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      match.endTime = selectedEnd.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      match.dayNumber = selectedDayIdx + 1;
      match.courtNumber = selectedCourtIdx + 1;

      matchEndTimes[match.id] = selectedEnd;
      matchDayIndices[match.id] = selectedDayIdx;
      courtNextAvailable[selectedDayIdx][selectedCourtIdx] = selectedEnd;
    } else {
      unboundMatchesCount++;

      let bestCourtIndex = 0;
      let earliestOverflowStart = new Date(Math.max(earliestStart.getTime(), courtOverflowAvailable[0].getTime()));

      for (let c = 1; c < courtsCount; c++) {
        const potentialStart = new Date(Math.max(earliestStart.getTime(), courtOverflowAvailable[c].getTime()));
        if (potentialStart < earliestOverflowStart) {
          bestCourtIndex = c;
          earliestOverflowStart = potentialStart;
        }
      }

      const fallbackEnd = new Date(earliestOverflowStart.getTime() + matchDurationMin * 60000);

      match.scheduledTime = earliestOverflowStart.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }) + ' (Ext. Day)';
      match.endTime = fallbackEnd.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      match.dayNumber = dayRanges.length;
      match.courtNumber = bestCourtIndex + 1;

      matchEndTimes[match.id] = fallbackEnd;
      matchDayIndices[match.id] = dayRanges.length - 1;
      courtOverflowAvailable[bestCourtIndex] = fallbackEnd;
    }
  }

  // Pre-resolve projected winners so user can see a full sample flow in action
  // (In dynamic state, we can let user click match card to declare actual winner,
  // and we recalculate subsequent participant names! Let's build exactly that! It's incredibly interactive).
  
  // Calculate end date based on startDateStr + (schedules.length - 1) days
  let endDateStr = startDateStr;
  try {
    const parts = startDateStr.split("-").map(Number);
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1] - 1;
      const day = parts[2];
      const startObj = new Date(year, month, day);
      if (!isNaN(startObj.getTime())) {
        const endObj = new Date(startObj);
        endObj.setDate(startObj.getDate() + Math.max(1, schedules.length) - 1);
        const yEnd = endObj.getFullYear();
        const mEnd = String(endObj.getMonth() + 1).padStart(2, '0');
        const dEnd = String(endObj.getDate()).padStart(2, '0');
        endDateStr = `${yEnd}-${mEnd}-${dEnd}`;
      }
    }
  } catch (err) {
    console.warn("Error calculating end date:", err);
  }

  return {
    gameType,
    totalParticipants: participantNames.length,
    isDoubles,
    matchDurationMin,
    restTimeMin: enforcedRestTimeMin,
    poolsCount,
    pools,
    finalsPool,
    schedules,
    unboundMatchesCount,
    startDate: startDateStr,
    endDate: endDateStr,
    courtsCount,
    allPlayAgainstAll: (gameType === 'cricket' && allPlayAgainstAll),
    championshipFormat,
    teamsToPromotePerPool: promoteCount,
  };
}
