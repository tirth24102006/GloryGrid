/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameType, DaySchedule, TournamentResult } from '../types';
import { generateTournament } from '../utils/scheduler';
import { ChevronLeft, Play, Calendar, User, Users, Plus, Minus, Wand2, Info, Upload, Check, AlertCircle, X } from 'lucide-react';
import { motion } from 'motion/react';

interface GameFormViewProps {
  gameType: GameType;
  onBack: () => void;
  onGenerate: (result: TournamentResult) => void;
}

// Random name pools for rapid demo testing
const RANDOM_NAMES: Record<GameType, string[]> = {
  cricket: [
    "Mumbai Mavericks XI", "Sydney Thunderbirds", "Kolkata Crusaders", "Lords Knights SC",
    "Cape Town Cobras", "Auckland Aces", "Barbados Royals", "Karachi Kings XI",
    "Delhi Daredevils", "Melbourne Stars", "Yorkshire Vikings", "County Warriors"
  ],
  carrom: [
    "Ace Striker", "Pocket Dynamo", "Slammer Pro", "Rebound King",
    "White Disc Legend", "Queen Pursuer", "Board Glider", "Ruby Pocket",
    "Master Fingertips", "The Carrom Champ", "Frictionless Shot", "Black Coin Hunter"
  ],
  chess: [
    "Grandmaster Garry", "Magnus Apprentice", "Checkmate Carlsen", "Bobby's Legacy",
    "Hikaru's Speed", "Queens Gambit QC", "Rook and Rollers", "The Knight Riders",
    "En Passant Elite", "Sicilian Castle", "Pawn Stars", "E4 Dominators"
  ]
};

const formatTo12Hour = (timeStr: string): string => {
  if (!timeStr) return "";
  const [hoursStr, minutesStr] = timeStr.split(":");
  const hours = parseInt(hoursStr, 10);
  if (isNaN(hours)) return timeStr;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${minutesStr || "00"} ${ampm}`;
};

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

export default function GameFormView({ gameType, onBack, onGenerate }: GameFormViewProps) {
  // 1. Core Config States
  const [fixtureName, setFixtureName] = useState<string>('');
  const [participantsCount, setParticipantsCount] = useState<number>(0);
  const [poolsCount, setPoolsCount] = useState<number>(1);
  const [isDoubles, setIsDoubles] = useState<boolean>(false);
  const [matchDuration, setMatchDuration] = useState<number>(45);
  const [restTime, setRestTime] = useState<number>(15);
  const [daysCount, setDaysCount] = useState<number>(3);
  const [startDate, setStartDate] = useState<string>("2026-05-22");
  const [courtsCount, setCourtsCount] = useState<number>(2);
  const [allPlayAgainstAll, setAllPlayAgainstAll] = useState<boolean>(false);
  const [championshipFormat, setChampionshipFormat] = useState<'knockout' | 'allplay'>('knockout');
  const [teamsToPromotePerPool, setTeamsToPromotePerPool] = useState<number>(1);

  // Dynamic lists
  const [names, setNames] = useState<string[]>([]);
  const [doublesNames, setDoublesNames] = useState<{ p1: string; p2: string }[]>([]);
  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>([]);

  // 1b. Custom/Manual Pool allocations
  const [enableCustomPoolDistribution, setEnableCustomPoolDistribution] = useState<boolean>(false);
  const [poolRealCounts, setPoolRealCounts] = useState<number[]>([]);
  const [poolByeCounts, setPoolByeCounts] = useState<number[]>([]);

  // Previous Data Persistence States
  const [hasPrevData, setHasPrevData] = useState<boolean>(false);

  // PDF Name Extractor States
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [parsedDialogData, setParsedDialogData] = useState<{
    rawRows: string[][];
    maxColsCount: number;
    fileName: string;
  } | null>(null);

  const [pdfColIndexP1, setPdfColIndexP1] = useState<number>(0);
  const [pdfColIndexP2, setPdfColIndexP2] = useState<number>(1);
  const [pdfSkipHeader, setPdfSkipHeader] = useState<boolean>(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`glory_grid_prev_config_${gameType}`);
      setHasPrevData(!!stored);
    } catch (e) {
      setHasPrevData(false);
    }
  }, [gameType]);

  useEffect(() => {
    // Keep pool allocation arrays at length poolsCount
    setPoolRealCounts(prev => {
      const nextReal = [...prev];
      if (nextReal.length < poolsCount) {
        while (nextReal.length < poolsCount) {
          nextReal.push(0);
        }
      } else if (nextReal.length > poolsCount) {
        nextReal.splice(poolsCount);
      }

      // Automatically divide participantsCount into poolsCount to compute equal defaults
      const baseVal = Math.floor(participantsCount / (poolsCount || 1));
      const remainder = participantsCount % (poolsCount || 1);

      const currentSum = nextReal.reduce((sum, val) => sum + val, 0);
      const needsReset = prev.length !== poolsCount || currentSum !== participantsCount;

      for (let i = 0; i < poolsCount; i++) {
        const defaultReal = baseVal + (i < remainder ? 1 : 0);
        if (nextReal[i] === 0 || needsReset) {
          nextReal[i] = defaultReal;
        }
      }
      return nextReal;
    });

    setPoolByeCounts(prev => {
      const nextBye = [...prev];
      if (nextBye.length < poolsCount) {
        while (nextBye.length < poolsCount) {
          nextBye.push(0);
        }
      } else if (nextBye.length > poolsCount) {
        nextBye.splice(poolsCount);
      }

      // Calculate perfect power-of-2 BYE counts based on default real counts
      const baseVal = Math.floor(participantsCount / (poolsCount || 1));
      const remainder = participantsCount % (poolsCount || 1);

      const needsReset = prev.length !== poolsCount;

      for (let i = 0; i < poolsCount; i++) {
        const poolRealSize = baseVal + (i < remainder ? 1 : 0);
        let powerOfTwo = 1;
        while (powerOfTwo < poolRealSize) {
          powerOfTwo *= 2;
        }
        if (powerOfTwo < 2) powerOfTwo = 2;
        const defaultBye = powerOfTwo - poolRealSize;

        if (nextBye[i] === 0 || needsReset) {
          nextBye[i] = defaultBye;
        }
      }
      return nextBye;
    });
  }, [poolsCount, participantsCount]);

  // 2. Select default presets on mount or game selection
  useEffect(() => {
    if (gameType === 'cricket') {
      setParticipantsCount(8);
      setPoolsCount(2);
      setIsDoubles(false);
      setMatchDuration(60);
      setRestTime(15);
      setDaysCount(3);
      setFixtureName("Cricket Championship League");
    } else if (gameType === 'carrom') {
      setParticipantsCount(6);
      setPoolsCount(2);
      setIsDoubles(false);
      setMatchDuration(25);
      setRestTime(10);
      setDaysCount(2);
      setFixtureName("Carrom Board Challenge");
    } else if (gameType === 'chess') {
      setParticipantsCount(8);
      setPoolsCount(2);
      setIsDoubles(false);
      setMatchDuration(45);
      setRestTime(15);
      setDaysCount(2);
      setFixtureName("Chess Prestige League");
    }
  }, [gameType]);

  // 3. Sync arrays when quantities change
  useEffect(() => {
    // Sync participant names length
    setNames(prev => {
      const copy = [...prev];
      if (copy.length < participantsCount) {
        while (copy.length < participantsCount) {
          copy.push('');
        }
      } else if (copy.length > participantsCount) {
        copy.splice(participantsCount);
      }
      return copy;
    });

    // Sync doubles team names length
    setDoublesNames(prev => {
      const copy = [...prev];
      if (copy.length < participantsCount) {
        while (copy.length < participantsCount) {
          copy.push({ p1: '', p2: '' });
        }
      } else if (copy.length > participantsCount) {
        copy.splice(participantsCount);
      }
      return copy;
    });
  }, [participantsCount]);

  useEffect(() => {
    const maxPromoted = Math.max(1, Math.floor(participantsCount / poolsCount));
    if (teamsToPromotePerPool > maxPromoted) {
      setTeamsToPromotePerPool(Math.max(1, Math.min(maxPromoted, 50)));
    }
  }, [poolsCount, participantsCount, teamsToPromotePerPool]);

  useEffect(() => {
    // Sync day schedule inputs length
    setDaySchedules(prev => {
      const copy = [...prev];
      if (copy.length < daysCount) {
        let i = copy.length + 1;
        while (copy.length < daysCount) {
          // default shift based on sport
          let start = "09:00";
          let end = "18:00";
          if (gameType === 'cricket') {
            start = "09:00";
            end = "17:00";
          } else if (gameType === 'carrom') {
            start = "14:00";
            end = "21:00"; // evening play
          } else if (gameType === 'chess') {
            start = "10:00";
            end = "18:00";
          }
          copy.push({ dayNumber: i, startTime: start, endTime: end });
          i++;
        }
      } else if (copy.length > daysCount) {
        copy.splice(daysCount);
      }
      return copy;
    });
  }, [daysCount, gameType]);

  // 4. Utility: fill random names
  const handleAutoFill = () => {
    const list = RANDOM_NAMES[gameType];
    const generated: string[] = [];
    const generatedDoubles: { p1: string; p2: string }[] = [];

    for (let i = 0; i < participantsCount; i++) {
      if (isDoubles && gameType === 'carrom') {
        const p1 = list[Math.floor(Math.random() * list.length)] + ` A`;
        const p2 = list[Math.floor(Math.random() * list.length)] + ` B`;
        generatedDoubles.push({ p1, p2 });
      } else {
        const randBase = list[Math.floor(Math.random() * list.length)];
        const suffix = i + 1;
        // Keep name unique
        generated.push(`${randBase} #${suffix}`);
      }
    }

    if (isDoubles && gameType === 'carrom') {
      setDoublesNames(generatedDoubles);
    } else {
      setNames(generated);
    }
  };

  // Shuffle names fully randomly
  const handleShuffleNames = () => {
    if (isDoubles && gameType === 'carrom') {
      const copy = [...doublesNames];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
      }
      setDoublesNames(copy);
    } else {
      const copy = [...names];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
      }
      setNames(copy);
    }
  };

  // Load PDF JS from CDN dynamically and parse names
  const loadPdfJS = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        const pdfjs = (window as any).pdfjsLib;
        if (pdfjs) {
          pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(pdfjs);
        } else {
          reject(new Error("PDF.js library could not be initialized on window."));
        }
      };
      script.onerror = () => reject(new Error("Failed to load PDF library script. Please check your internet connection."));
      document.head.appendChild(script);
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setPdfError(null);

    try {
      const pdfjs = await loadPdfJS();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;

      const parsedRows: string[][] = [];
      let maxCols = 0;

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const items = textContent.items.map((item: any) => {
          const x = item.transform[4];
          const y = item.transform[5];
          const height = item.height || Math.abs(item.transform[3]) || 10;
          // Use standard item.width if defined and non-zero, otherwise approximate
          const width = (item.width !== undefined && item.width > 0) 
            ? item.width 
            : (height * 0.48 * item.str.length);
          return {
            text: item.str,
            x: x,
            y: y,
            width: width,
            height: height
          };
        }).filter((item: any) => item.text.trim().length > 0);

        if (items.length === 0) continue;

        // 1. Vertically merge close text segments belonging to the same column
        let mergedItems = [...items];
        let mergedAny = true;

        while (mergedAny) {
          mergedAny = false;
          // Sort items: Left-to-right (X ascending), then Top-to-bottom (Y descending)
          mergedItems.sort((a, b) => {
            if (Math.abs(a.x - b.x) > 12) {
              return a.x - b.x;
            }
            return b.y - a.y;
          });

          for (let i = 0; i < mergedItems.length - 1; i++) {
            const a = mergedItems[i];
            const b = mergedItems[i + 1];

            const xDiff = Math.abs(a.x - b.x);
            const aXCenter = a.x + a.width / 2;
            const bXCenter = b.x + b.width / 2;
            const centerDiff = Math.abs(aXCenter - bXCenter);

            const isSameCol = xDiff < 15 || centerDiff < 18;

            if (isSameCol) {
              const yGap = a.y - b.y; // Y is descending in PDF space
              const maxGap = Math.max(a.height * 1.8, 22);

              if (yGap > 0 && yGap <= maxGap) {
                const mergedText = `${a.text} ${b.text}`.replace(/\s+/g, ' ').trim();
                const mergedX = Math.min(a.x, b.x);
                const mergedY = a.y; // Topmost Y coordinate
                const mergedWidth = Math.max(a.x + a.width, b.x + b.width) - mergedX;
                const mergedHeight = a.y - b.y + b.height;

                const newItem = {
                  text: mergedText,
                  x: mergedX,
                  y: mergedY,
                  width: mergedWidth,
                  height: mergedHeight
                };

                mergedItems.splice(i, 2, newItem);
                mergedAny = true;
                break;
              }
            }
          }
        }

        // Group by vertical Y coordinate with a restricted dynamic height tolerance
        const rowGroups: { y: number; items: any[] }[] = [];
        mergedItems.forEach((item: any) => {
          const tolerance = Math.min(Math.max(item.height * 0.75, 7), 12);
          let foundRow = rowGroups.find(r => Math.abs(r.y - item.y) <= tolerance);
          if (foundRow) {
            foundRow.items.push(item);
          } else {
            rowGroups.push({ y: item.y, items: [item] });
          }
        });

        // Sort rows top-to-bottom (Y coordinates are descending in PDF coordinate space)
        rowGroups.sort((a, b) => b.y - a.y);

        // Sort horizontal items inside each row left-to-right (X ascending)
        rowGroups.forEach(rg => {
          rg.items.sort((a, b) => a.x - b.x);
        });

        rowGroups.forEach(rg => {
          // Merge very close horizontal text segments into distinct table cells/columns
          const columns: string[] = [];
          let currentCellItems: any[] = [];

          rg.items.forEach((item) => {
            if (currentCellItems.length === 0) {
              currentCellItems.push(item);
            } else {
              const prev = currentCellItems[currentCellItems.length - 1];
              const gap = item.x - (prev.x + prev.width);
              
              // Define a column gap threshold. If gap is below threshold, they belong to the same cell/name.
              // A typical single space is ~3-8 units, whereas a column gap is >25 units.
              // Let's use 22 units as a robust dividing threshold.
              const threshold = Math.max(22, item.height * 2.0);

              if (gap < threshold) {
                currentCellItems.push(item);
              } else {
                // Flush the finished cell
                const cellText = currentCellItems
                  .map(i => i.text)
                  .join(' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (cellText) {
                  columns.push(cellText);
                }
                currentCellItems = [item];
              }
            }
          });

          if (currentCellItems.length > 0) {
            const cellText = currentCellItems
              .map(i => i.text)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (cellText) {
              columns.push(cellText);
            }
          }

          if (columns.length > 0) {
            parsedRows.push(columns);
            if (columns.length > maxCols) {
              maxCols = columns.length;
            }
          }
        });
      }

      if (parsedRows.length === 0) {
        throw new Error("We couldn't detect any text rows in this PDF. Please ensure the PDF contains searchable text.");
      }

      // Auto-detect header row and best column defaults
      let guessedP1 = 0;
      let guessedP2 = 1;
      let autoHeaderRowIdx = -1;
      let foundNameCols: number[] = [];

      for (let rIdx = 0; rIdx < parsedRows.length; rIdx++) {
        const row = parsedRows[rIdx];
        const indices: number[] = [];
        row.forEach((cell, cIdx) => {
          const txt = cell.toLowerCase().trim();
          if (txt === 'name' || txt === 'player' || txt === 'player name' || txt === 'participant' || txt === 'team' || txt === 'team name' || txt === 'player 1' || txt === 'player 2' || txt === 'partner') {
            indices.push(cIdx);
          }
        });
        if (indices.length > 0) {
          foundNameCols = indices;
          autoHeaderRowIdx = rIdx;
          break;
        }
      }

      if (autoHeaderRowIdx !== -1) {
        // Discard any garbage rows or titles above the header row (e.g. "Neighborhood Household Demographics")
        parsedRows.splice(0, autoHeaderRowIdx);
        // Header row is now at index 0, so skip it
        setPdfSkipHeader(true);

        if (gameType === 'carrom' && isDoubles) {
          guessedP1 = foundNameCols[0];
          guessedP2 = foundNameCols[1] !== undefined ? foundNameCols[1] : (foundNameCols[0] + 1 < maxCols ? foundNameCols[0] + 1 : foundNameCols[0]);
        } else {
          guessedP1 = foundNameCols[0];
          guessedP2 = foundNameCols[0] + 1 < maxCols ? foundNameCols[0] + 1 : foundNameCols[0];
        }
      } else {
        // Fallback guesser based on serial numbers in first column
        let col0IsSerial = 0;
        const sampleRows = parsedRows.slice(0, Math.min(10, parsedRows.length));
        sampleRows.forEach(r => {
          if (r[0] && /^\d+$/.test(r[0])) {
            col0IsSerial++;
          }
        });

        if (col0IsSerial >= sampleRows.length * 0.4 && maxCols > 1) {
          guessedP1 = 1;
          guessedP2 = 2 < maxCols ? 2 : 1;
        } else {
          guessedP1 = 0;
          guessedP2 = 1 < maxCols ? 1 : 0;
        }
        setPdfSkipHeader(parsedRows.length > 1);
      }

      setPdfColIndexP1(guessedP1);
      setPdfColIndexP2(guessedP2);

      setParsedDialogData({
        rawRows: parsedRows,
        maxColsCount: maxCols,
        fileName: file.name
      });
    } catch (err: any) {
      console.error("PDF Parsing error:", err);
      setPdfError(err.message || "Failed to parse the PDF file.");
    } finally {
      setIsExtracting(false);
      e.target.value = ""; // clear so same file can re-trigger onChange
    }
  };

  const handleApplyImport = () => {
    if (!parsedDialogData) return;
    
    const activeRows = pdfSkipHeader ? parsedDialogData.rawRows.slice(1) : parsedDialogData.rawRows;

    if (gameType === 'carrom' && isDoubles) {
      const list = activeRows.map(row => ({
        p1: row[pdfColIndexP1] || '',
        p2: row[pdfColIndexP2] || ''
      })).filter(team => team.p1.trim() !== '' || team.p2.trim() !== '');

      if (list.length === 0) {
        alert("The selected column mapping yielded zero valid team names. Please select correct columns.");
        return;
      }
      setParticipantsCount(list.length);
      setDoublesNames(list);
    } else {
      const list = activeRows.map(row => row[pdfColIndexP1] || '').filter(name => name.trim() !== '');

      if (list.length === 0) {
        alert("The selected column mapping yielded zero valid participant names. Please select a correct column.");
        return;
      }
      setParticipantsCount(list.length);
      setNames(list);
    }
    
    setParsedDialogData(null);
  };

  // Restore previous configuration
  const handleLoadPreviousData = () => {
    try {
      const stored = localStorage.getItem(`glory_grid_prev_config_${gameType}`);
      if (!stored) {
        alert("No previous data found for this game type.");
        return;
      }
      const data = JSON.parse(stored);
      if (data) {
        if (data.fixtureName !== undefined) setFixtureName(data.fixtureName);
        if (data.participantsCount !== undefined) setParticipantsCount(data.participantsCount);
        if (data.poolsCount !== undefined) setPoolsCount(data.poolsCount);
        if (data.isDoubles !== undefined) setIsDoubles(data.isDoubles);
        if (data.matchDuration !== undefined) setMatchDuration(data.matchDuration);
        if (data.restTime !== undefined) setRestTime(data.restTime);
        if (data.daysCount !== undefined) setDaysCount(data.daysCount);
        if (data.startDate !== undefined) setStartDate(data.startDate);
        if (data.courtsCount !== undefined) setCourtsCount(data.courtsCount);
        if (data.allPlayAgainstAll !== undefined) setAllPlayAgainstAll(data.allPlayAgainstAll);
        if (data.championshipFormat !== undefined) setChampionshipFormat(data.championshipFormat);
        if (data.teamsToPromotePerPool !== undefined) setTeamsToPromotePerPool(data.teamsToPromotePerPool);
        
        if (data.enableCustomPoolDistribution !== undefined) setEnableCustomPoolDistribution(data.enableCustomPoolDistribution);
        if (data.poolRealCounts !== undefined) setPoolRealCounts(data.poolRealCounts);
        if (data.poolByeCounts !== undefined) setPoolByeCounts(data.poolByeCounts);

        if (data.names !== undefined) setNames(data.names);
        if (data.doublesNames !== undefined) setDoublesNames(data.doublesNames);
        if (data.daySchedules !== undefined) setDaySchedules(data.daySchedules);

        alert("All previous parameters, dates, timings, and participant names have been successfully restored! You can now adjust names or configurations and recreate the fixtures.");
      }
    } catch (err) {
      console.error("Error loading previous config:", err);
      alert("Encountered an issue loading previous configuration.");
    }
  };

  // 5. Submit handler and validations
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (participantsCount < 2) {
      alert("Specify at least 2 participants.");
      return;
    }
    if (poolsCount < 1) {
      alert("Specify at least 1 pool.");
      return;
    }
    if (poolsCount > participantsCount) {
      alert("Number of pools cannot exceed total participants.");
      return;
    }

    // Capture accurate participant list
    let finalParticipants: string[] = [];
    if (gameType === 'carrom' && isDoubles) {
      finalParticipants = doublesNames.map((team, idx) => {
        const p1 = team.p1.trim() || `Player ${idx * 2 + 1}`;
        const p2 = team.p2.trim() || `Player ${idx * 2 + 2}`;
        return `${p1} & ${p2}`;
      });
    } else {
      finalParticipants = names.map((name, idx) => name.trim() || `Team ${idx + 1}`);
    }

    // Save configuration parameters to allow subsequent loading
    const configToSave = {
      fixtureName,
      participantsCount,
      poolsCount,
      isDoubles,
      matchDuration,
      restTime,
      daysCount,
      startDate,
      courtsCount,
      allPlayAgainstAll,
      championshipFormat,
      teamsToPromotePerPool,
      names,
      doublesNames,
      daySchedules,
      enableCustomPoolDistribution,
      poolRealCounts,
      poolByeCounts,
    };
    try {
      localStorage.setItem(`glory_grid_prev_config_${gameType}`, JSON.stringify(configToSave));
      setHasPrevData(true);
    } catch (err) {
      console.warn("Could not save config to localStorage:", err);
    }

    // Call Generator
    const result = generateTournament(
      gameType,
      finalParticipants,
      poolsCount,
      matchDuration,
      restTime,
      startDate,
      daySchedules,
      isDoubles && gameType === 'carrom',
      courtsCount,
      enableCustomPoolDistribution ? poolRealCounts : undefined,
      enableCustomPoolDistribution ? poolByeCounts : undefined,
      allPlayAgainstAll,
      championshipFormat,
      teamsToPromotePerPool
    );

    // Attach custom fixture name or fallback
    (result as any).fixtureName = fixtureName.trim() || (gameType === 'cricket' ? 'Cricket Championship League' : gameType === 'carrom' ? 'Carrom Board Challenge' : 'Chess Prestige League');

    onGenerate(result);
  };

  // Border theme colors matching each sport
  const themeColors = {
    cricket: {
      border: "border-orange-500/20",
      accent: "from-orange-500 to-amber-600",
      outline: "focus:ring-orange-500/50 focus:border-orange-500",
      text: "text-orange-400",
      glowBg: "bg-orange-500/10",
      badge: "border-orange-500/30 text-orange-400 bg-orange-500/5",
    },
    carrom: {
      border: "border-emerald-500/20",
      accent: "from-emerald-500 to-teal-600",
      outline: "focus:ring-emerald-500/50 focus:border-emerald-500",
      text: "text-emerald-400",
      glowBg: "bg-emerald-500/10",
      badge: "border-emerald-500/30 text-emerald-400 bg-emerald-500/5",
    },
    chess: {
      border: "border-indigo-500/20",
      accent: "from-indigo-500 to-blue-600",
      outline: "focus:ring-indigo-500/50 focus:border-indigo-500",
      text: "text-indigo-400",
      glowBg: "bg-indigo-500/10",
      badge: "border-indigo-500/30 text-indigo-400 bg-indigo-500/5",
    },
  }[gameType];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back navigation anchor */}
      <motion.button
        whileHover={{ x: -4 }}
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-mono text-slate-400 hover:text-white mb-6 bg-slate-900/50 py-2 px-4 rounded-xl border border-slate-800 cursor-pointer"
        id="btn-back-form"
      >
        <ChevronLeft size={16} /> SELECT DISCIPLINE
      </motion.button>

      {/* Styled top banner */}
      <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-2xl mb-8 relative overflow-hidden backdrop-blur-md">
        <div className={`absolute top-0 right-0 w-48 h-48 ${themeColors.glowBg} rounded-full blur-3xl pointer-events-none`} />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 border ${themeColors.badge}`}>
              {gameType} configs
            </span>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Fixture Parameters
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-lg">
              Set up bracket division, schedule constraints, and participant files. Power-of-2 byes will scale automatically.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0 md:min-w-[180px]">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={handleAutoFill}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-100 rounded-xl border border-indigo-500/30 text-sm font-mono font-bold transition-all shadow-md cursor-pointer"
            >
              <Wand2 size={16} className={themeColors.text} /> AUTO-FILL DEMO
            </motion.button>

            <motion.button
              whileHover={hasPrevData ? { scale: 1.05 } : {}}
              whileTap={hasPrevData ? { scale: 0.95 } : {}}
              type="button"
              disabled={!hasPrevData}
              onClick={handleLoadPreviousData}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-mono font-bold transition-all rounded-xl border ${
                hasPrevData 
                  ? 'bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 border-indigo-800/80 cursor-pointer shadow-md'
                  : 'bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed opacity-50'
              }`}
              title={hasPrevData ? "Restore the parameters, participant names, and schedule limits from your last configuration" : "No previous data generated yet for this game"}
            >
              <span className="shrink-0 font-bold">📂</span> LOAD PREVIOUS DATA
            </motion.button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* FIXTURE NAME SPECIFICATION */}
        <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl relative backdrop-blur-sm">
          <label className="block text-xs font-mono tracking-wider text-indigo-400 uppercase mb-2">
            🏆 Fixture Name / Tournament Title
          </label>
          <input
            type="text"
            required
            value={fixtureName}
            onChange={(e) => setFixtureName(e.target.value)}
            placeholder="e.g. Summer Sizzler Cup 2026"
            className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-white text-lg font-bold tracking-tight focus:outline-none focus:ring-2 ${themeColors.outline}`}
          />
          <p className="text-slate-500 text-xs mt-2 italic font-mono">
            This name will serve as the official heading in your downloaded PDF and on your dashboard.
          </p>
        </div>

        {/* SECTION 1: BRACKET DIVISION */}
        <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl relative backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className={`w-1.5 h-6 rounded-full bg-gradient-to-b ${themeColors.accent}`} />
            1. Bracket Division
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Total Participants Selector */}
            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                Participants (Teams or Individual Players)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setParticipantsCount(Math.max(2, participantsCount - 1))}
                  className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min="2"
                  max="128"
                  value={participantsCount || ""}
                  onChange={(e) => setParticipantsCount(Math.max(2, Number(e.target.value)))}
                  className={`flex-1 text-center bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-white text-lg font-bold font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
                />
                <button
                  type="button"
                  onClick={() => setParticipantsCount(Math.min(128, participantsCount + 1))}
                  className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-slate-500 text-xs mt-2 italic font-mono">
                Supports up to 128 slots
              </p>
            </div>

            {/* Total Pools Selector */}
            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                Number of Pools
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPoolsCount(Math.max(1, poolsCount - 1))}
                  className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={poolsCount || ""}
                  onChange={(e) => setPoolsCount(Math.max(1, Math.min(50, Math.min(participantsCount, Number(e.target.value)))))}
                  className={`flex-1 text-center bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-white text-lg font-bold font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
                />
                <button
                  type="button"
                  onClick={() => setPoolsCount(Math.min(Math.min(50, participantsCount), poolsCount + 1))}
                  className="p-3 bg-slate-900 border border-slate-800 text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-slate-500 text-xs mt-2 italic font-mono">
                Participants divided equally. Floor size: {Math.floor(participantsCount / (poolsCount || 1))}, remainder {participantsCount % (poolsCount || 1)}
              </p>
            </div>
          </div>

          {/* Special Doubles Toggle for Carrom */}
          {gameType === 'carrom' && (
            <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="block text-sm font-bold text-white">Carrom Game Mode</span>
                <span className="block text-xs text-slate-400 font-mono mt-0.5">Toggle between 1v1 singles or 2v2 doubles teams.</span>
              </div>
              <div className="flex items-center gap-4 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDoubles(false)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${!isDoubles ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  <User size={13} /> SINGLES
                </button>
                <button
                  type="button"
                  onClick={() => setIsDoubles(true)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${isDoubles ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  <Users size={13} /> DOUBLES
                </button>
              </div>
            </div>
          )}

          {/* Special All Play Against All Toggle for Cricket */}
          {gameType === 'cricket' && (
            <div className="mt-8 pt-6 border-t border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="block text-sm font-bold text-white">All Play Against All (Round-Robin Pools)</span>
                <span className="block text-xs text-slate-400 font-mono mt-0.5">Every team plays every other team in their pool. Promote pool winners to the championship stage.</span>
              </div>
              <div className="flex items-center gap-4 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setAllPlayAgainstAll(false)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all border border-transparent cursor-pointer ${!allPlayAgainstAll ? 'bg-orange-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                >
                  KNOCKOUT POOLS
                </button>
                <button
                  type="button"
                  onClick={() => setAllPlayAgainstAll(true)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all border border-transparent cursor-pointer ${allPlayAgainstAll ? 'bg-orange-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                >
                  ALL PLAY AGAINST ALL
                </button>
              </div>
            </div>
          )}

          {/* Special Championship Mode Selector for Cricket */}
          {gameType === 'cricket' && (
            <div className="mt-6 pt-6 border-t border-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="block text-sm font-bold text-white">Championship Stage Format</span>
                <span className="block text-xs text-slate-400 font-mono mt-0.5">Define if finals should use knockout brackets or a round-robin (where you can later launch custom playoffs).</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setChampionshipFormat('knockout')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all border border-transparent cursor-pointer ${
                    championshipFormat === 'knockout'
                      ? 'bg-orange-500 text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ⚔️ KNOCKOUT
                </button>
                <button
                  type="button"
                  onClick={() => setChampionshipFormat('allplay')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all border border-transparent cursor-pointer ${
                    championshipFormat === 'allplay'
                      ? 'bg-orange-500 text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🔄 ALL PLAY AGAINST ALL
                </button>
              </div>
            </div>
          )}

          {/* Teams to Promote Option for Cricket Pools (not valid for single/championship stage pool) */}
          {gameType === 'cricket' && poolsCount > 1 && (
            <div className="mt-6 pt-6 border-t border-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="block text-sm font-bold text-white">Teams to Promote Per Pool</span>
                <span className="block text-xs text-slate-400 font-mono mt-0.5">
                  Select the number of qualifying teams to advance from each pool (e.g. Pool A, Pool B) to the Championship stage final bracket drawing.
                </span>
              </div>
              <div className="flex items-center gap-2 self-start md:self-auto">
                <select
                  value={teamsToPromotePerPool}
                  onChange={(e) => setTeamsToPromotePerPool(parseInt(e.target.value, 10))}
                  id="teams-to-promote-select"
                  className="bg-slate-900 text-white border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
                >
                  {Array.from({ length: Math.min(50, Math.max(1, Math.floor(participantsCount / poolsCount))) }).map((_, idx) => {
                    const val = idx + 1;
                    let label = `🏆 Top ${val} Team${val > 1 ? 's' : ''}`;
                    if (val === 1) {
                      label += " (Winner)";
                    } else if (val === 2) {
                      label += " (Winner & Runner-up)";
                    } else {
                      label += ` (Rank 1st-${val})`;
                    }
                    return (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: DYNAMIC PARTICIPANT REGISTER */}
        <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl relative backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className={`w-1.5 h-6 rounded-full bg-gradient-to-b ${themeColors.accent}`} />
              2. Participant Register
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleShuffleNames}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-purple-400 hover:text-purple-300 rounded-lg text-xs font-mono font-bold transition-all shadow-md cursor-pointer"
              >
                🔀 SHUFFLE REGISTER
              </button>

              {(gameType === 'chess' || gameType === 'carrom') && (
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfUpload}
                    id="pdf-upload-roster-input"
                    className="hidden"
                  />
                  <label
                    htmlFor="pdf-upload-roster-input"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-emerald-400 hover:text-emerald-300 rounded-lg text-xs font-mono font-bold transition-all shadow-md cursor-pointer ${isExtracting ? 'opacity-80' : ''}`}
                  >
                    {isExtracting ? (
                      <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-emerald-400 border-t-transparent" />
                    ) : (
                      <Upload size={13} className="text-emerald-400" />
                    )}
                    {isExtracting ? "EXTRACTING..." : "UPLOAD NAMES PDF"}
                  </label>
                </div>
              )}

              <div className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Info size={13} className="text-indigo-400" />
                Blank names will default to "Slot {`{N}`}"
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {gameType === 'carrom' && isDoubles ? (
              doublesNames.map((team, idx) => (
                <div key={idx} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 space-y-3">
                  <span className="block text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase">
                    Doubles Team {idx + 1}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Player A"
                      value={team.p1}
                      onChange={(e) => {
                        const copy = [...doublesNames];
                        copy[idx].p1 = e.target.value;
                        setDoublesNames(copy);
                      }}
                      className={`bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ${themeColors.outline}`}
                    />
                    <input
                      type="text"
                      placeholder="Player B"
                      value={team.p2}
                      onChange={(e) => {
                        const copy = [...doublesNames];
                        copy[idx].p2 = e.target.value;
                        setDoublesNames(copy);
                      }}
                      className={`bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ${themeColors.outline}`}
                    />
                  </div>
                </div>
              ))
            ) : (
              names.map((name, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/80">
                  <span className="text-xs font-mono font-bold text-indigo-400/80 w-6">
                    #{idx + 1}
                  </span>
                  <input
                    type="text"
                    placeholder={`Enter participant/team name`}
                    value={name}
                    onChange={(e) => {
                      const copy = [...names];
                      copy[idx] = e.target.value;
                      setNames(copy);
                    }}
                    className={`flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 ${themeColors.outline}`}
                  />
                </div>
              ))
            )}
          </div>

          {/* Custom Pool Allocation Controls */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-mono">
                  🎛️ POOL ALLOCATION PREFERENCES
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {enableCustomPoolDistribution 
                    ? "Custom pool sizes & manual BYEs override is active. Edit values per pool below."
                    : "Automatic balanced distribution of players and BYEs is active."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnableCustomPoolDistribution(!enableCustomPoolDistribution)}
                className={`inline-flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-mono font-black transition-all cursor-pointer ${
                  enableCustomPoolDistribution 
                    ? 'bg-slate-900 border-slate-850/80 text-purple-400 border-purple-900/30 hover:border-purple-800/50' 
                    : `bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300 font-bold`
                }`}
              >
                {enableCustomPoolDistribution ? "🎀 SWITCH TO EQUAL / AUTO DISTRIBUTION" : "🎛️ SWITCH TO MANUAL OVERRIDES"}
              </button>
            </div>

            {enableCustomPoolDistribution && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-900 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
                {(() => {
                  const sumReal = poolRealCounts.reduce((a, b) => a + b, 0);
                  const diff = sumReal - participantsCount;
                  if (diff !== 0) {
                    return (
                      <div className="md:col-span-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-center text-xs text-amber-400 font-mono">
                        ⚠️ Total allocated players ({sumReal}) does not match registered participants ({participantsCount}). {diff > 0 ? `We will auto-generate ${diff} placeholder slot(s).` : `First ${sumReal} player(s) will be used; remaining will be skipped.`}
                      </div>
                    );
                  }
                  return null;
                })()}

                {Array.from({ length: poolsCount }).map((_, pIdx) => {
                  const pName = `Pool ${getPoolLabel(pIdx)}`;
                  return (
                    <div key={pIdx} className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 space-y-2">
                      <span className="block text-xs font-mono font-bold text-indigo-400">
                        {pName} Configuration
                      </span>
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                          Number of Players
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="128"
                          value={poolRealCounts[pIdx] ?? 0}
                          onChange={(e) => {
                            const copy = [...poolRealCounts];
                            copy[pIdx] = Math.max(0, Number(e.target.value));
                            setPoolRealCounts(copy);
                          }}
                          className={`w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:ring-1 ${themeColors.outline}`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 uppercase mb-1">
                          Number of BYEs
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="128"
                          value={poolByeCounts[pIdx] ?? 0}
                          onChange={(e) => {
                            const copy = [...poolByeCounts];
                            copy[pIdx] = Math.max(0, Number(e.target.value));
                            setPoolByeCounts(copy);
                          }}
                          className={`w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:ring-1 ${themeColors.outline}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: SCHEDULING TIME MATHEMATICS */}
        <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl relative backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span className={`w-1.5 h-6 rounded-full bg-gradient-to-b ${themeColors.accent}`} />
            3. Timing & Math Constraints
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-slate-800/60 mb-6">
            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                Match Duration (minutes)
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={matchDuration}
                onChange={(e) => setMatchDuration(Math.max(5, Number(e.target.value)))}
                className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white text-sm font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
              />
            </div>

            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                Cooldown/Rest Interval (0-20 mins)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={restTime}
                onChange={(e) => setRestTime(Math.min(20, Math.max(0, Number(e.target.value))))}
                className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white text-sm font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
              />
            </div>

            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                {gameType === 'cricket' ? 'Available Grounds' : gameType === 'carrom' ? 'Available Carrom Boards' : 'Available Chess Boards'}
              </label>
              <input
                type="number"
                min="1"
                max="32"
                value={courtsCount}
                onChange={(e) => setCourtsCount(Math.max(1, Math.min(32, Number(e.target.value))))}
                className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white text-sm font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                Tournament Start Date
              </label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono tracking-wider text-slate-400 uppercase mb-2">
                Tournament Duration (Days)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDaysCount(Math.max(1, daysCount - 1))}
                  className="p-2.5 bg-slate-900 border border-slate-800 text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={daysCount}
                  onChange={(e) => setDaysCount(Math.max(1, Math.min(14, Number(e.target.value))))}
                  className={`flex-1 text-center bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-4 text-white text-sm font-bold font-mono focus:outline-none focus:ring-2 ${themeColors.outline}`}
                />
                <button
                  type="button"
                  onClick={() => setDaysCount(Math.min(14, daysCount + 1))}
                  className="p-2.5 bg-slate-900 border border-slate-800 text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Elegant Date Calculator indicator */}
          {(() => {
            if (!startDate) return null;
            try {
              const parts = startDate.split("-");
              if (parts.length !== 3) return null;
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const day = parseInt(parts[2], 10);
              
              const startObj = new Date(year, month, day);
              if (isNaN(startObj.getTime())) return null;
              
              const endObj = new Date(year, month, day);
              endObj.setDate(startObj.getDate() + daysCount - 1);
              
              // Helper to style friendly dates (DD/MM/YYYY)
              const dStart = String(startObj.getDate()).padStart(2, '0');
              const mStart = String(startObj.getMonth() + 1).padStart(2, '0');
              const yStart = startObj.getFullYear();
              
              const dEnd = String(endObj.getDate()).padStart(2, '0');
              const mEnd = String(endObj.getMonth() + 1).padStart(2, '0');
              const yEnd = endObj.getFullYear();
              
              const startReadable = `${dStart}/${mStart}/${yStart}`;
              const endReadable = `${dEnd}/${mEnd}/${yEnd}`;
              
              return (
                <div className="mt-5 bg-gradient-to-r from-indigo-500/10 via-slate-900 to-indigo-950/10 rounded-xl border border-indigo-500/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-mono">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Calendar size={14} className="animate-pulse" />
                    <span className="font-bold tracking-wide uppercase">TIMELINE MATHEMATICS DETECTED</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5 items-center sm:text-right">
                    <span className="text-slate-400">Start: <strong className="text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">{startReadable}</strong></span>
                    <span className="text-indigo-400">➔</span>
                    <span className="text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/25 px-2.5 py-1 rounded">
                      Ends/Fixture Saved on: <strong>{endReadable}</strong>
                    </span>
                  </div>
                </div>
              );
            } catch (err) {
              return null;
            }
          })()}
        </div>

        {/* SECTION 4: DYNAMIC DAILY SCHEDULES */}
        <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl relative backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <span className={`w-1.5 h-6 rounded-full bg-gradient-to-b ${themeColors.accent}`} />
            4. Daily Calendars
          </h2>
          <p className="text-slate-400 text-xs font-mono mb-6 pb-2 border-b border-slate-800/40">
            Set custom slots. Overnights (e.g., 20:00 to 01:00) scale automatically.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {daySchedules.map((day, dIdx) => (
              <div key={day.dayNumber} className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800">
                <span className="block text-xs font-mono font-bold text-indigo-400 mb-4 bg-indigo-500/5 border border-indigo-500/25 px-2.5 py-1 rounded w-fit uppercase font-display tracking-widest animate-pulse">
                  Day {day.dayNumber}
                </span>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-mono text-slate-400 uppercase pb-0.5">
                        Start Time
                      </label>
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 rounded uppercase">
                        {formatTo12Hour(day.startTime)}
                      </span>
                    </div>
                    <input
                      type="time"
                      value={day.startTime}
                      onChange={(e) => {
                        const copy = [...daySchedules];
                        copy[dIdx].startTime = e.target.value;
                        setDaySchedules(copy);
                      }}
                      className={`w-full bg-slate-950 border border-slate-850 rounded-lg py-2 px-3 text-white text-xs font-mono focus:outline-none focus:ring-1 ${themeColors.outline}`}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-mono text-slate-400 uppercase pb-0.5">
                        End Time
                      </label>
                      <span className="text-[10px] font-mono font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 rounded uppercase">
                        {formatTo12Hour(day.endTime)}
                      </span>
                    </div>
                    <input
                      type="time"
                      value={day.endTime}
                      onChange={(e) => {
                        const copy = [...daySchedules];
                        copy[dIdx].endTime = e.target.value;
                        setDaySchedules(copy);
                      }}
                      className={`w-full bg-slate-950 border border-slate-850 rounded-lg py-2 px-3 text-white text-xs font-mono focus:outline-none focus:ring-1 ${themeColors.outline}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GENERATE SUBMIT BUTTON */}
        <div className="pt-4 flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            id="btn-generate-fixtures"
            className={`inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-mono font-black tracking-wider text-slate-950 bg-gradient-to-r ${themeColors.accent} hover:brightness-110 active:brightness-95 transition-all shadow-lg text-base cursor-pointer`}
          >
            GENERATE FIXTURE <Play size={18} fill="currentColor" />
          </motion.button>
        </div>
      </form>

      {/* PDF ERROR DIALOG MODAL */}
      {pdfError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold font-mono">PDF EXTRACTION FAILED</h3>
            </div>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed font-sans">
              {pdfError}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPdfError(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-mono font-bold transition-all cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF PARSED IMPORT PREVIEW MODAL */}
      {parsedDialogData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-start justify-between shrink-0">
              <div>
                <span className="inline-block text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded mb-2 uppercase tracking-widest">
                  📄 Roster Spreadsheet Parser
                </span>
                <h3 className="text-xl font-black text-white font-sans">
                  Map Columns & Confirm Names
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-1 break-all">
                  Source File: <span className="text-slate-300">{parsedDialogData.fileName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setParsedDialogData(null)}
                className="p-1.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Interactive Column Mapper & Live Preview */}
            <div className="p-6 overflow-y-auto space-y-6 bg-slate-950/40 flex-1 custom-scrollbar">
              
              {/* SECTION 1: COLUMN SELECTORS */}
              <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800/60">
                  <h4 className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                    <Wand2 size={15} className="text-indigo-400" />
                    Configure Column Mapping
                  </h4>
                  
                  {/* Skip Header Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pdfSkipHeader}
                      onChange={(e) => setPdfSkipHeader(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950 h-4 w-4"
                    />
                    <span className="text-xs font-mono text-slate-300">Skip First Row (Table Headers)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {gameType === 'carrom' && isDoubles ? (
                    <>
                      {/* Player 1 Col Selection */}
                      <div>
                        <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded bg-indigo-500"></span>
                          👤 Player 1 Column Selector
                        </label>
                        <select
                          value={pdfColIndexP1}
                          onChange={(e) => setPdfColIndexP1(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {Array.from({ length: parsedDialogData.maxColsCount }).map((_, colIdx) => {
                            const sampleRow = parsedDialogData.rawRows[pdfSkipHeader ? 1 : 0] || parsedDialogData.rawRows[0] || [];
                            const sampleText = sampleRow[colIdx] ? `(e.g. "${sampleRow[colIdx]}")` : '(empty)';
                            return (
                              <option key={colIdx} value={colIdx}>
                                Column {colIdx + 1} {sampleText}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Player 2 Col Selection */}
                      <div>
                        <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded bg-emerald-500"></span>
                          👥 Player 2 Column Selector
                        </label>
                        <select
                          value={pdfColIndexP2}
                          onChange={(e) => setPdfColIndexP2(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                        >
                          {Array.from({ length: parsedDialogData.maxColsCount }).map((_, colIdx) => {
                            const sampleRow = parsedDialogData.rawRows[pdfSkipHeader ? 1 : 0] || parsedDialogData.rawRows[0] || [];
                            const sampleText = sampleRow[colIdx] ? `(e.g. "${sampleRow[colIdx]}")` : '(empty)';
                            return (
                              <option key={colIdx} value={colIdx}>
                                Column {colIdx + 1} {sampleText}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </>
                  ) : (
                    /* Singles Col Selection */
                    <div className="md:col-span-2">
                      <label className="block text-xs font-mono font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded bg-indigo-500"></span>
                        👤 Participant/Team Name Column
                      </label>
                      <select
                        value={pdfColIndexP1}
                        onChange={(e) => setPdfColIndexP1(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        {Array.from({ length: parsedDialogData.maxColsCount }).map((_, colIdx) => {
                          const sampleRow = parsedDialogData.rawRows[pdfSkipHeader ? 1 : 0] || parsedDialogData.rawRows[0] || [];
                          const sampleText = sampleRow[colIdx] ? `(e.g. "${sampleRow[colIdx]}")` : '(empty)';
                          return (
                            <option key={colIdx} value={colIdx}>
                              Column {colIdx + 1} {sampleText}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: RAW PARSED TABLE PREVIEW */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="block text-[11px] font-mono tracking-wider font-bold text-slate-400 uppercase flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                    🔍 Full PDF Data Table (Scroll to confirm all records)
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    💡 Click buttons in table headers to map columns directly
                  </span>
                </div>
                
                <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900/40 max-h-[350px] custom-scrollbar">
                  <table className="min-w-full text-left border-collapse text-xs table-auto">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono shadow-md">
                        <th className="p-3.5 w-16 text-center bg-slate-950">Row</th>
                        {Array.from({ length: parsedDialogData.maxColsCount }).map((_, colIdx) => {
                          const isP1 = pdfColIndexP1 === colIdx;
                          const isP2 = gameType === 'carrom' && isDoubles && pdfColIndexP2 === colIdx;
                          return (
                            <th 
                              key={colIdx} 
                              className={`p-3.5 border-l border-slate-800/80 min-w-[180px] bg-slate-950 transition-all ${
                                isP1 
                                  ? 'bg-indigo-950/40 text-indigo-400 border-b-2 border-b-indigo-500' 
                                  : isP2 
                                  ? 'bg-emerald-950/40 text-emerald-400 border-b-2 border-b-emerald-500' 
                                  : ''
                              }`}
                            >
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-[10px] uppercase font-bold text-slate-400">
                                    Col {colIdx + 1}
                                  </span>
                                  {isP1 && (
                                    <span className="text-[9px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 px-1.5 py-0.5 rounded font-mono font-bold">
                                      {gameType === 'carrom' && isDoubles ? 'P1' : 'ACTIVE'}
                                    </span>
                                  )}
                                  {isP2 && (
                                    <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">
                                      P2
                                    </span>
                                  )}
                                </div>

                                <div className="flex gap-1.5 mt-0.5">
                                  {gameType === 'carrom' && isDoubles ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setPdfColIndexP1(colIdx)}
                                        className={`flex-1 text-[9px] py-1 px-1.5 rounded font-bold font-mono transition-all ${
                                          isP1 
                                            ? 'bg-indigo-500 text-white shadow-lg' 
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                                        }`}
                                      >
                                        SET P1
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPdfColIndexP2(colIdx)}
                                        className={`flex-1 text-[9px] py-1 px-1.5 rounded font-bold font-mono transition-all ${
                                          isP2 
                                            ? 'bg-emerald-500 text-slate-950 shadow-lg' 
                                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                                        }`}
                                      >
                                        SET P2
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPdfColIndexP1(colIdx)}
                                      className={`w-full text-[9px] py-1 px-2 rounded font-bold font-mono transition-all ${
                                        isP1 
                                          ? 'bg-indigo-500 text-white shadow-lg' 
                                          : 'bg-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 border border-slate-800'
                                      }`}
                                    >
                                      {isP1 ? '✓ ACTIVE SELECTION' : 'CHOOSE AS NAME COLUMN'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedDialogData.rawRows.map((row, rowIdx) => {
                        const isHeader = pdfSkipHeader && rowIdx === 0;
                        return (
                          <tr 
                            key={rowIdx} 
                            className={`border-b border-slate-800/40 hover:bg-slate-900/20 transition-all font-mono ${
                              isHeader ? 'opacity-40 bg-red-950/15 line-through decoration-red-500/50' : ''
                            }`}
                          >
                            <td className="p-3 text-center text-slate-500 text-[10px] bg-slate-950/20 border-r border-slate-800/30 sticky left-0 z-0">
                              {isHeader ? 'Header' : rowIdx + 1}
                            </td>
                            {Array.from({ length: parsedDialogData.maxColsCount }).map((_, colIdx) => {
                              const val = row[colIdx] || '';
                              const isP1 = pdfColIndexP1 === colIdx;
                              const isP2 = gameType === 'carrom' && isDoubles && pdfColIndexP2 === colIdx;
                              return (
                                <td 
                                  key={colIdx} 
                                  className={`p-3 border-l border-slate-800/40 whitespace-normal break-words font-medium text-slate-300 ${
                                    isP1 
                                      ? 'bg-indigo-500/5 font-semibold text-white border-x border-indigo-500/20' 
                                      : isP2 
                                      ? 'bg-emerald-500/5 font-semibold text-white border-x border-emerald-500/20' 
                                      : ''
                                  }`}
                                >
                                  {val || <span className="text-slate-700 italic">empty</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 3: LIVE CONFIRMATION LIST */}
              <div className="space-y-2">
                <span className="block text-[10px] font-mono tracking-wider font-bold text-slate-400 uppercase">
                  📋 Live Resolved Names Preview (Import List Confirmation)
                </span>

                <div className="bg-slate-900/60 rounded-xl border border-slate-800/80 p-4">
                  <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {(() => {
                      const activeRows = pdfSkipHeader ? parsedDialogData.rawRows.slice(1) : parsedDialogData.rawRows;
                      
                      if (gameType === 'carrom' && isDoubles) {
                        const list = activeRows.map(row => ({
                          p1: row[pdfColIndexP1] || '',
                          p2: row[pdfColIndexP2] || ''
                        })).filter(team => team.p1.trim() !== '' || team.p2.trim() !== '');

                        if (list.length === 0) {
                          return (
                            <div className="text-center py-6 text-slate-500 italic text-xs font-mono">
                              No team names found. Adjust the column mappings above.
                            </div>
                          );
                        }

                        return list.map((team, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/40 text-xs">
                            <span className="text-indigo-400 font-mono font-bold w-10 shrink-0">#{idx + 1}</span>
                            <div className="flex-1 flex gap-2">
                              <span className="bg-indigo-500/5 px-2.5 py-1 rounded border border-indigo-500/10 text-white truncate max-w-[45%]">
                                {team.p1 || 'Empty'}
                              </span>
                              <span className="text-slate-500 self-center">+</span>
                              <span className="bg-pink-500/5 px-2.5 py-1 rounded border border-pink-500/10 text-white truncate max-w-[45%]">
                                {team.p2 || 'Empty'}
                              </span>
                            </div>
                          </div>
                        ));
                      } else {
                        const list = activeRows.map(row => row[pdfColIndexP1] || '').filter(name => name.trim() !== '');

                        if (list.length === 0) {
                          return (
                            <div className="text-center py-6 text-slate-500 italic text-xs font-mono">
                              No player/team names found. Adjust the column mappings above.
                            </div>
                          );
                        }

                        return list.map((name, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-lg border border-slate-800/40 text-xs">
                            <span className="text-indigo-400 font-mono font-bold w-10 shrink-0">#{idx + 1}</span>
                            <span className="text-slate-200 truncate bg-indigo-500/5 px-2.5 py-1 rounded border border-indigo-500/10">
                              {name}
                            </span>
                          </div>
                        ));
                      }
                    })()}
                  </div>
                </div>
              </div>

              {/* Informational Warning */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
                <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-slate-300 text-xs leading-relaxed font-sans">
                  Importing will set the <strong className="text-white">Participants Count</strong> to <strong className="text-emerald-400">
                    {(() => {
                      const activeRows = pdfSkipHeader ? parsedDialogData.rawRows.slice(1) : parsedDialogData.rawRows;
                      if (gameType === 'carrom' && isDoubles) {
                        return activeRows.map(row => ({
                          p1: row[pdfColIndexP1] || '',
                          p2: row[pdfColIndexP2] || ''
                        })).filter(team => team.p1.trim() !== '' || team.p2.trim() !== '').length;
                      } else {
                        return activeRows.map(row => row[pdfColIndexP1] || '').filter(name => name.trim() !== '').length;
                      }
                    })()}
                  </strong> and instantly overwrite your current roster list.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setParsedDialogData(null)}
                className="px-4 py-2 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-300 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-mono font-black transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={14} /> IMPORT & APPLY LIST
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
