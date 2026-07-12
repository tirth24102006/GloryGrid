/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameType = 'cricket' | 'carrom' | 'chess';

export interface DaySchedule {
  dayNumber: number;
  startTime: string; // e.g., "09:00"
  endTime: string;   // e.g., "17:00"
}

export interface Match {
  id: string; // unique match identifier, e.g. "poolA-R0-M0"
  poolId: string; // "poolA", "poolB", or "finals"
  poolName: string;
  roundIndex: number; // 0-based index of the round
  matchIndex: number; // 0-based index of the match within the round
  teamA: string;
  teamB: string;
  winner: string | null;
  scheduledTime: string | null; // formatted display string or ISO
  endTime: string | null;       // end time of the match
  prevMatchAId: string | null; // match ID whose winner feeds teamA
  prevMatchBId: string | null; // match ID whose winner feeds teamB
  isWalkover: boolean;
  matchDurationMin: number;
  restTimeMin: number;
  dayNumber?: number; // scheduled day number
  courtNumber?: number; // scheduled court/table/ground number (1-based index)
  runsScoredA?: number;
  oversFacedA?: number;
  runsScoredB?: number;
  oversFacedB?: number;
}

export interface Pool {
  id: string;
  name: string;
  teams: string[];
  byesCount: number;
  rounds: Match[][]; // Matches grouped by round
  isRoundRobin?: boolean;
}

export interface TournamentResult {
  gameType: GameType;
  totalParticipants: number;
  isDoubles: boolean; // only applicable to carrom
  matchDurationMin: number;
  restTimeMin: number;
  poolsCount: number;
  pools: Pool[];
  finalsPool: Pool; // details of the finals mini-bracket combining winners of all pools
  schedules: DaySchedule[];
  unboundMatchesCount: number; // any matches that couldn't fit in the days
  startDate?: string;
  endDate?: string;
  courtsCount: number;
  allPlayAgainstAll?: boolean;
  fixtureName?: string;
  championshipFormat?: 'knockout' | 'allplay';
  championshipPlayoffsPool?: Pool | null;
  teamsToPromotePerPool?: number;
}

export interface SavedTournament {
  id: string;
  name: string;
  createdDate: string;
  result: TournamentResult;
  declaredWinners: Record<string, string>;
  selectedGame: GameType;
  endDate?: string;
  allPlayAgainstAll?: boolean;
}
