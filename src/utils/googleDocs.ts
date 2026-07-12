/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { TournamentResult, Match } from '../types';
import { calculateCricketStandings } from './cricketStats';

// Initialize Firebase App and Auth dynamically
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/documents');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Initialize OAuth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Open Google popup login
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Fetch current in-memory token
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Sign out current authenticated session
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Generates and creates a fully structured Google Doc for the tournament results
export async function exportTournamentToGoogleDocs(
  result: TournamentResult,
  declaredWinners: Record<string, string>,
  selectedGame: string,
  getPDFRoundLabel: (p: any, roundIdx: number) => string,
  getPDFParticipantLabel: (m: Match, slot: 'A' | 'B') => string,
  getFlatChronologicalMatches: () => Match[]
): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("User is not authenticated or access token is missing.");
  }

  const title = result.fixtureName ? result.fixtureName.trim() : 'Glory Grid Tournament Fixture Log';
  
  // 1. Create a blank google doc
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || "Failed to create Google Document");
  }

  const doc = await createRes.json();
  const documentId = doc.documentId;

  // 2. Build the Document Contents sequentially
  const requests: any[] = [];
  let currentIndex = 1;

  function appendText(text: string, style?: { bold?: boolean; italic?: boolean; fontSize?: number; colorHex?: string; headingType?: string }) {
    const start = currentIndex;
    const end = start + text.length;

    requests.push({
      insertText: {
        text: text,
        location: { index: start }
      }
    });

    if (style) {
      const textStyle: any = {};
      if (style.bold !== undefined) textStyle.bold = style.bold;
      if (style.italic !== undefined) textStyle.italic = style.italic;
      if (style.fontSize !== undefined) {
        textStyle.fontSize = { size: style.fontSize, unit: 'PT' };
      }
      if (style.colorHex) {
        const hex = style.colorHex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        textStyle.foregroundColor = {
          color: {
            rgbColor: { red: r, green: g, blue: b }
          }
        };
      }

      if (Object.keys(textStyle).length > 0) {
        requests.push({
          updateTextStyle: {
            textStyle,
            range: { startIndex: start, endIndex: end },
            fields: Object.keys(textStyle).join(',')
          }
        });
      }

      if (style.headingType) {
        requests.push({
          updateParagraphStyle: {
            paragraphStyle: {
              namedStyleType: style.headingType
            },
            range: { startIndex: start, endIndex: end },
            fields: 'namedStyleType'
          }
        });
      }
    }

    currentIndex = end;
  }

  // Cover / Header
  const themeColor = selectedGame === 'cricket' ? '#f97316' : selectedGame === 'carrom' ? '#10b981' : '#6366f1';
  const gameLabel = selectedGame.charAt(0).toUpperCase() + selectedGame.slice(1);
  const formatLabel = result.isDoubles ? 'Doubles Partnership Pairing' : 'Singles Individual Pairing';
  const totalTeams = result.totalParticipants;
  const arenasCount = result.courtsCount;
  const arenaName = selectedGame === 'cricket' ? 'Pitch' : selectedGame === 'carrom' ? 'Board' : 'Chess Table';
  const arenaLabel = `${arenasCount} ${arenaName}${arenasCount > 1 ? 'es' : ''}`;

  // Large Title
  appendText(`${title}\n`, { bold: true, fontSize: 24, colorHex: themeColor });
  appendText(`${gameLabel} Tournament Match Ledger • ${formatLabel}\n\n`, { italic: true, fontSize: 12, colorHex: '#475569' });

  // Divider
  appendText("========================================================================\n\n", { colorHex: '#cbd5e1' });

  // Overview Specifications Section
  appendText("🏆 OFFICIAL TOURNAMENT SPECIFICATIONS\n\n", { bold: true, fontSize: 14, colorHex: '#1e3a8a' });
  
  const specs = [
    `• Fixture Tournament Name: ${result.fixtureName || 'N/A'}`,
    `• Sport / Discipline Type: ${gameLabel}`,
    `• Team Partnership Match Format: ${formatLabel}`,
    `• Total Registered Competitors: ${totalTeams} Competitors`,
    `• Playgrounds / Active Arenas: ${arenaLabel}`,
    `• Match Round Rest Buffer Interval: ${result.restTimeMin} minutes buffer`,
    `• Operational Match Duration: ${result.matchDurationMin} minutes`,
    `• Export Timestamp: ${new Date().toUTCString()}`,
  ];
  specs.forEach(spec => appendText(`${spec}\n`, { fontSize: 11, colorHex: '#1e293b' }));
  appendText("\n", {});

  // Divider
  appendText("------------------------------------------------------------------------\n\n", { colorHex: '#cbd5e1' });

  // Standard Pools Standings & Fixtures Section
  appendText("1. POOLS GROUP STANDINGS & MATCHES SCHEDULE\n\n", { bold: true, fontSize: 14, colorHex: '#1e3a8a' });

  result.pools.forEach((p) => {
    appendText(`\nPOOL: ${p.name.toUpperCase()}\n`, { bold: true, fontSize: 12, colorHex: '#2563eb' });

    const promoteCount = result.teamsToPromotePerPool || 1;
    const standings = selectedGame === 'cricket' ? calculateCricketStandings(p, declaredWinners) : [];
    const promotedTeams = selectedGame === 'cricket'
      ? standings.slice(0, promoteCount).map(t => t.name)
      : (declaredWinners[`${p.id}-winner`] ? [declaredWinners[`${p.id}-winner`]] : []);

    if (promotedTeams.length > 0) {
      appendText(`👑 PROMOTED TO PLAYOFFS: ${promotedTeams.join(" & ")}\n`, { bold: true, fontSize: 11, colorHex: '#15803d' });
    }

    if (selectedGame === 'cricket') {
      appendText("Leaderboard Status:\n", { bold: true, fontSize: 10.5, colorHex: '#475569' });
      
      standings.forEach((team, tIdx) => {
        const isPromoted = promotedTeams.includes(team.name);
        const nrrSign = team.nrr >= 0 ? '+' : '';
        appendText(
          `  [#${tIdx + 1}] ${team.name}${isPromoted ? ' 👑' : ''} | P: ${team.played} W: ${team.wins} L: ${team.losses} | PTS: ${team.points} | NRR: ${nrrSign}${team.nrr.toFixed(3)} (Scored: ${team.runsScored}/${team.oversFacedDecimal.toFixed(1)} ov, Conceded: ${team.runsConceded}/${team.oversBowledDecimal.toFixed(1)} ov)\n`,
          { fontSize: 10, colorHex: isPromoted ? '#16a34a' : '#1e293b' }
        );
      });
    } else {
      appendText("Group Competitors:\n", { bold: true, fontSize: 10.5, colorHex: '#475569' });
      p.teams.forEach((teamName, tIdx) => {
        appendText(`  • [#${tIdx + 1}] ${teamName}\n`, { fontSize: 10, colorHex: '#1e293b' });
      });
    }

    appendText("\nRounds Fixtures Log:\n", { bold: true, fontSize: 11, colorHex: '#475569' });
    p.rounds.forEach((round, rIdx) => {
      const roundLabel = getPDFRoundLabel(p, rIdx);
      appendText(`  ${roundLabel}:\n`, { bold: true, fontSize: 10.5, colorHex: '#3b82f6' });

      round.forEach((match) => {
        const finalWin = declaredWinners[match.id];
        const hasScores = match.runsScoredA !== undefined || match.runsScoredB !== undefined;
        let scoreString = '';
        if (selectedGame === 'cricket' && hasScores) {
          scoreString = `(${match.runsScoredA || 0}/${match.oversFacedA || 0} vs ${match.runsScoredB || 0}/${match.oversFacedB || 0})`;
        } else if (hasScores) {
          scoreString = `(${match.runsScoredA || 0} - ${match.runsScoredB || 0})`;
        }

        let statusText = 'Pending Play';
        if (match.isWalkover) {
          statusText = `Walkover Victory (Winner: ${finalWin || 'Declared BYE'})`;
        } else if (finalWin) {
          statusText = `Winner: ${finalWin} ${scoreString}`;
        }

        const courtStr = match.courtNumber ? ` | ${arenaName} ${match.courtNumber}` : '';
        const timeStr = match.scheduledTime ? ` | ${match.scheduledTime}` : '';

        const sideA = getPDFParticipantLabel(match, 'A');
        const sideB = getPDFParticipantLabel(match, 'B');

        appendText(
          `    - ${sideA} vs ${sideB} [Slot: M${match.id.substring(match.id.lastIndexOf('-M') + 2)}${courtStr}${timeStr}] -> Status: ${statusText}\n`,
          { fontSize: 10, colorHex: finalWin ? '#15803d' : '#b45309' }
        );
      });
    });
  });

  // Playoff Bracket Section
  if (result.finalsPool) {
    appendText("\n------------------------------------------------------------------------\n\n", { colorHex: '#cbd5e1' });
    appendText("2. PLAYOFFS CHAMPIONSHIP KNOCKOUT STAGE\n\n", { bold: true, fontSize: 14, colorHex: '#1e3a8a' });

    let overallWinner = declaredWinners['finals-M-overall-champ'] || declaredWinners['championship-winner'] || declaredWinners['finals-winner'];
    if (result.championshipPlayoffsPool && result.championshipPlayoffsPool.rounds.length > 0) {
      const pRounds = result.championshipPlayoffsPool.rounds;
      const lastRIndex = pRounds.length - 1;
      const grandFinalMatch = pRounds[lastRIndex]?.[0];
      if (grandFinalMatch) {
         const pWinner = declaredWinners[grandFinalMatch.id];
         if (pWinner && pWinner !== 'BYE' && !pWinner.startsWith('Winner of')) {
           overallWinner = pWinner;
         }
      }
    }

    if (overallWinner) {
      appendText(`🏆🎉 TOURNAMENT OVERALL CHAMPION: ${overallWinner.toUpperCase()} 🎉🏆\n\n`, { bold: true, fontSize: 14, colorHex: '#b91c1c' });
    }

    const activeChampPool = result.championshipPlayoffsPool || result.finalsPool;
    activeChampPool.rounds.forEach((round, rIdx) => {
      const roundLabel = getPDFRoundLabel(activeChampPool, rIdx);
      appendText(`\n${roundLabel}:\n`, { bold: true, fontSize: 12, colorHex: '#7c3aed' });

      round.forEach((match) => {
        const finalWin = declaredWinners[match.id];
        const hasScores = match.runsScoredA !== undefined || match.runsScoredB !== undefined;
        let scoreString = '';
        if (selectedGame === 'cricket' && hasScores) {
          scoreString = `(${match.runsScoredA || 0}/${match.oversFacedA || 0} vs ${match.runsScoredB || 0}/${match.oversFacedB || 0})`;
        } else if (hasScores) {
          scoreString = `(${match.runsScoredA || 0} - ${match.runsScoredB || 0})`;
        }

        let statusText = 'TBD / Pending playoff qualifier';
        if (match.isWalkover) {
          statusText = `Walkover (Winner: ${finalWin || 'Declared BYE'})`;
        } else if (finalWin) {
          statusText = `Winner: ${finalWin} ${scoreString}`;
        }

        const courtStr = match.courtNumber ? ` | ${arenaName} ${match.courtNumber}` : '';
        const timeStr = match.scheduledTime ? ` | ${match.scheduledTime}` : '';

        const sideA = getPDFParticipantLabel(match, 'A');
        const sideB = getPDFParticipantLabel(match, 'B');

        appendText(
          `    • ${sideA} vs ${sideB} [Slot: M${match.id.substring(match.id.lastIndexOf('-M') + 2)}${courtStr}${timeStr}] -> Status: ${statusText}\n`,
          { fontSize: 10, colorHex: finalWin ? '#059669' : '#475569' }
        );
      });
    });
  }

  // Detailed timeline ledger section
  const flatMatches = getFlatChronologicalMatches();
  if (flatMatches.length > 0) {
    appendText("\n------------------------------------------------------------------------\n\n", { colorHex: '#cbd5e1' });
    appendText("3. DETAILED CHRONOLOGICAL SCHEDULE EVENT JOURNAL\n\n", { bold: true, fontSize: 14, colorHex: '#1e3a8a' });

    flatMatches.forEach((match) => {
      const isWinnerDeclared = !!declaredWinners[match.id];
      const winTeamName = declaredWinners[match.id];
      const hasScores = match.runsScoredA !== undefined || match.runsScoredB !== undefined;

      let outcomeStr = 'Pending';
      if (match.isWalkover) {
        outcomeStr = `Walkover (${winTeamName || 'BYE'})`;
      } else if (isWinnerDeclared) {
        let scStr = '';
        if (selectedGame === 'cricket' && hasScores) {
          scStr = ` (${match.runsScoredA || 0}/${match.oversFacedA || 0}-${match.runsScoredB || 0}/${match.oversFacedB || 0})`;
        } else if (hasScores) {
          scStr = ` (${match.runsScoredA || 0}-${match.runsScoredB || 0})`;
        }
        outcomeStr = `Won: ${winTeamName}${scStr}`;
      }

      const dayLabel = match.dayNumber ? `Day ${match.dayNumber}` : 'N/A';
      const poolLabel = match.poolId === 'finals' ? 'Championship' : match.poolName;
      const sideA = getPDFParticipantLabel(match, 'A');
      const sideB = getPDFParticipantLabel(match, 'B');
      const placeTimeStr = `${arenaName} ${match.courtNumber || 'TBD'} @ ${match.scheduledTime?.split(', ')[2] || 'TBD'}`;

      appendText(
        `  [${dayLabel}] Pool: ${poolLabel} | ${sideA} vs ${sideB} | Arena: ${placeTimeStr} | Status: ${outcomeStr}\n`,
        { fontSize: 10, colorHex: isWinnerDeclared ? '#166534' : '#b45309' }
      );
    });
  }

  // Footer / Signature
  appendText("\n========================================================================\n", { colorHex: '#cbd5e1' });
  appendText(`Prepared and exported on UTC ${new Date().toUTCString()} • Glory Grid Sports Management Protocol\n`, { italic: true, fontSize: 9, colorHex: '#64748b' });

  // 3. Send batchUpdate to populate document
  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests })
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(err.error?.message || "Failed to format and populate Google Document");
  }

  return `https://docs.google.com/document/d/${documentId}/edit`;
}
