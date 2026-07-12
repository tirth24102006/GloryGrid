/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Match, Pool } from '../types';

export function convertOverToDecimal(overs: number | undefined | null): number {
  if (overs === undefined || overs === null || isNaN(Number(overs))) return 0;
  const o = Number(overs);
  const wholeOvers = Math.floor(o);
  const str = String(o);
  let balls = 0;
  if (str.includes('.')) {
    const idx = str.indexOf('.');
    const dec = str.substring(idx + 1);
    balls = Number(dec[0] || '0'); // get first decimal digit representing individual balls
  }
  return wholeOvers + (balls / 6);
}

export interface CricketTeamStat {
  name: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  runsScored: number;
  oversFacedDecimal: number;
  runsConceded: number;
  oversBowledDecimal: number;
  nrr: number;
}

export function calculateCricketStandings(pool: Pool, declaredWinners: Record<string, string>): CricketTeamStat[] {
  const statsMap: Record<string, CricketTeamStat> = {};

  // Initialize stats for every team
  pool.teams.forEach(team => {
    statsMap[team] = {
      name: team,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      runsScored: 0,
      oversFacedDecimal: 0,
      runsConceded: 0,
      oversBowledDecimal: 0,
      nrr: 0,
    };
  });

  // Accumulate stats from all played matches
  pool.rounds.forEach(round => {
    round.forEach(match => {
      const winner = declaredWinners[match.id];
      const isPlayed = winner !== undefined && winner !== null;

      // Ensure we only calculate stats if the match has score or winner
      const hasScores = 
        match.runsScoredA !== undefined || 
        match.runsScoredB !== undefined ||
        match.oversFacedA !== undefined ||
        match.oversFacedB !== undefined;

      if (!isPlayed && !hasScores) return;

      const teamA = match.teamA;
      const teamB = match.teamB;

      // If either team is BYE, skip points/NRR accumulation
      if (teamA === 'BYE' || teamB === 'BYE') return;

      // Stats for A and B
      const statA = statsMap[teamA];
      const statB = statsMap[teamB];

      if (!statA || !statB) return;

      // If scores are entered, accumulate runs and overs
      if (match.runsScoredA !== undefined) statA.runsScored += match.runsScoredA;
      if (match.runsScoredB !== undefined) statB.runsScored += match.runsScoredB;

      if (match.runsScoredB !== undefined) statA.runsConceded += match.runsScoredB;
      if (match.runsScoredA !== undefined) statB.runsConceded += match.runsScoredA;

      if (match.oversFacedA !== undefined) {
        const decA = convertOverToDecimal(match.oversFacedA);
        statA.oversFacedDecimal += decA;
        statB.oversBowledDecimal += decA;
      }
      if (match.oversFacedB !== undefined) {
        const decB = convertOverToDecimal(match.oversFacedB);
        statB.oversFacedDecimal += decB;
        statA.oversBowledDecimal += decB;
      }

      // If winner is declared, update wins, losses, points
      if (isPlayed) {
        statA.played += 1;
        statB.played += 1;
        if (winner === teamA) {
          statA.wins += 1;
          statA.points += 2;
          statB.losses += 1;
        } else if (winner === teamB) {
          statB.wins += 1;
          statB.points += 2;
          statA.losses += 1;
        }
      }
    });
  });

  // Calculate NRR for each team
  const standings = Object.values(statsMap).map(stat => {
    let runsScoredPerOver = 0;
    let runsConcededPerOver = 0;

    if (stat.oversFacedDecimal > 0) {
      runsScoredPerOver = stat.runsScored / stat.oversFacedDecimal;
    }
    if (stat.oversBowledDecimal > 0) {
      runsConcededPerOver = stat.runsConceded / stat.oversBowledDecimal;
    }

    stat.nrr = runsScoredPerOver - runsConcededPerOver;
    return stat;
  });

  // Sort by Points (descending), then NRR (descending)
  standings.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    return b.nrr - a.nrr;
  });

  return standings;
}
