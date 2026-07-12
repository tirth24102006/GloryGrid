/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameType, TournamentResult, Match, SavedTournament, Pool } from './types';
import ThreeDBackground from './components/ThreeDBackground';
import HomeView from './components/HomeView';
import { calculateCricketStandings } from './utils/cricketStats';
import GameFormView from './components/GameFormView';
import LoadingView from './components/LoadingView';
import BracketRenderer from './components/BracketRenderer';
import PortalWelcome from './components/PortalWelcome';
import { Trophy, Calendar, Clock, RotateCcw, AlertTriangle, List, TreeDeciduous, Sparkles, FileDown, FileText, ExternalLink, BookOpen, Download, X, Sliders, Wand2, Layers, HelpCircle, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { initAuth, googleSignIn, logout, exportTournamentToGoogleDocs } from './utils/googleDocs';

const to24Hour = (time12: string): string => {
  if (!time12) return '09:00';
  const clean = time12.trim();
  const match = clean.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) {
    const parts = clean.split(':');
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].substring(0, 2)}`;
    }
    return '09:00';
  }
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
};

const to12Hour = (time24: string): string => {
  if (!time24) return '09:00 AM';
  const parts = time24.trim().split(':');
  if (parts.length < 2) return '09:00 AM';
  let h = parseInt(parts[0], 10);
  const m = parts[1].substring(0, 2);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
};

// Convers OKLCH color strings to widely supported standard RGB representation
const oklchToRgb = (oklchStr: string): string => {
  try {
    const matches = oklchStr.match(/oklch\(([^)]+)\)/);
    if (!matches) return '#ffffff';
    const parts = matches[1].trim().split(/[\s,+/]+/);
    if (parts.length < 3) return '#ffffff';
    
    let l = parseFloat(parts[0]);
    if (parts[0].includes('%')) l /= 100;
    
    let c = parseFloat(parts[1]);
    if (parts[1].includes('%')) c /= 100;
    
    let h = parseFloat(parts[2]);
    if (parts[2].includes('%')) h /= 100;
    
    let alphaStr = parts[3];
    let alpha = 1;
    if (alphaStr) {
      alpha = parseFloat(alphaStr);
      if (alphaStr.includes('%')) alpha /= 100;
    }

    // Convert OKLCH to sRGB
    const hRad = (h * Math.PI) / 180; // hue in degrees -> radians
    const labA = c * Math.cos(hRad);
    const labB = c * Math.sin(hRad);

    const l_ = l + 0.3963377774 * labA + 0.2158037573 * labB;
    const m_ = l - 0.1055613458 * labA - 0.0638541728 * labB;
    const s_ = l - 0.0894841775 * labA - 1.2914855480 * labB;

    const l_cubed = l_ * l_ * l_;
    const m_cubed = m_ * m_ * m_;
    const s_cubed = s_ * s_ * s_;

    const r_lin = +4.0767416621 * l_cubed - 3.3077115913 * m_cubed + 0.2309699292 * s_cubed;
    const g_lin = -1.2684380046 * l_cubed + 2.6097574011 * m_cubed - 0.3413193965 * s_cubed;
    const b_lin = -0.0041960863 * l_cubed - 0.7034186147 * m_cubed + 1.7076147010 * s_cubed;

    const toSRGB = (x: number) => {
      const clamped = Math.max(0, Math.min(1, x));
      return clamped <= 0.0031308 
        ? Math.round(clamped * 12.92 * 255) 
        : Math.round((1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255);
    };

    const r = toSRGB(r_lin);
    const g = toSRGB(g_lin);
    const b = toSRGB(b_lin);

    if (alpha < 1) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  } catch (e) {
    return '#ffffff';
  }
};

// Systemic handler that patches window.getComputedStyle temporarily during rendering
const patchGetComputedStyleForPDF = () => {
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(elt, pseudoElt) {
    const style = originalGetComputedStyle(elt, pseudoElt);
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return (p: string) => {
            const got = target.getPropertyValue(p);
            if (typeof got === 'string' && got.includes('oklch')) {
              return got.replace(/oklch\([^)]+\)/g, (match) => oklchToRgb(match));
            }
            return got;
          };
        }
        const val = target[prop as any];
        if (typeof val === 'string' && val.includes('oklch')) {
          return val.replace(/oklch\([^)]+\)/g, (match) => oklchToRgb(match));
        }
        if (typeof val === 'function') {
          return (val as any).bind(target);
        }
        return val;
      }
    });
  };
  return () => {
    window.getComputedStyle = originalGetComputedStyle;
  };
};

export default function App() {
  // Navigation & State Engine
  const [viewState, setViewState] = useState<'home' | 'form' | 'loading' | 'results'>('home');
  const [showPortal, setShowPortal] = useState<boolean>(true);
  const [selectedGame, setSelectedGame] = useState<GameType>('chess');
  const [result, setResult] = useState<TournamentResult | null>(null);

  // Tournament History and Persistent Storage
  const [savedTournaments, setSavedTournaments] = useState<SavedTournament[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);

  // Winner declaration memory: matchId -> winnerName
  const [declaredWinners, setDeclaredWinners] = useState<Record<string, string>>({});
  
  // Results page sub-panel toggle: 'bracket' or 'list'
  const [resultsSection, setResultsSection] = useState<'bracket' | 'list'>('bracket');

  // PDF Export Process State
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Google Docs Export & Authentication State
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isGoogleDocsExporting, setIsGoogleDocsExporting] = useState<boolean>(false);
  const [googleDocUrl, setGoogleDocUrl] = useState<string | null>(null);

  // Help Modal states
  const [showHelp, setShowHelp] = useState(false);
  const [isDownloadingManual, setIsDownloadingManual] = useState(false);

  const handleDownloadManualPDF = async () => {
    setIsDownloadingManual(true);
    let restoreGetComputedStyle: (() => void) | null = null;
    try {
      restoreGetComputedStyle = patchGetComputedStyleForPDF();
      
      // Small sleep to let changes repaint
      await new Promise(resolve => setTimeout(resolve, 150));

      const container = document.getElementById('hidden-manual-pdf-container');
      if (!container) {
        throw new Error("Manual pdf template element not found!");
      }

      // Safe jsPDF class resolution
      let DocClass: any = jsPDF;
      if (!DocClass) {
        const imported: any = await import('jspdf');
        DocClass = imported.jsPDF || imported.default || imported;
      }
      if (typeof DocClass !== 'function' && (DocClass as any).jsPDF) {
        DocClass = (DocClass as any).jsPDF;
      }
      if (typeof DocClass !== 'function' && (DocClass as any).default) {
        DocClass = (DocClass as any).default;
      }

      // Safe html2canvas resolution
      let h2c: any = html2canvas;
      if (!h2c) {
        const imported: any = await import('html2canvas');
        h2c = imported.default || imported;
      }
      if (typeof h2c !== 'function' && (h2c as any).default) {
        h2c = (h2c as any).default;
      }

      if (typeof DocClass !== 'function' || typeof h2c !== 'function') {
        throw new Error("Required exporting libraries (jsPDF/html2canvas) could not be resolved correctly.");
      }

      const pWidth = 1120;
      const pHeight = 792;
      const pdf = new DocClass({
        orientation: 'landscape',
        unit: 'px',
        format: [1120, 792],
        hotfixes: ['px_scaling']
      });

      const pageElements = container.querySelectorAll('.manual-pdf-page');
      if (pageElements.length === 0) {
        throw new Error("No pages found with '.manual-pdf-page' class inside template!");
      }

      for (let i = 0; i < pageElements.length; i++) {
        const el = pageElements[i] as HTMLElement;
        const canvas = await h2c(el, {
          scale: 2, // Double DPI resolution for super crisp print output
          useCORS: true,
          allowTaint: false, // Prevent canvas poisoning so toDataURL works perfectly
          backgroundColor: null,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          width: pWidth,
          height: pHeight,
          windowWidth: pWidth,
          windowHeight: pHeight,
          logging: false
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, pWidth, pHeight);
      }

      pdf.save('Glory_Grid_Elite_User_Guide.pdf');
    } catch (err: any) {
      console.error("PDF user manual download failed:", err);
      alert("Browser constraints prevented direct PDF compilation of the User Guide. Please try again or open in a full window tab!");
    } finally {
      if (restoreGetComputedStyle) {
        restoreGetComputedStyle();
      }
      setIsDownloadingManual(false);
    }
  };

  useEffect(() => {
    // Initializing OAuth subscriber from googleDocs utility
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleGoogleLogout = async () => {
    try {
      await logout();
      setGoogleUser(null);
      setGoogleToken(null);
      setGoogleDocUrl(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleExportGoogleDocs = async () => {
    if (!result) return;

    let currentToken = googleToken;
    if (!currentToken) {
      try {
        const res = await googleSignIn();
        if (res) {
          setGoogleUser(res.user);
          setGoogleToken(res.accessToken);
          currentToken = res.accessToken;
        } else {
          return;
        }
      } catch (err) {
        console.error("Google sign in popup failed:", err);
        alert("Please approve Google Docs scope permissions to execute the export.");
        return;
      }
    }

    setIsGoogleDocsExporting(true);
    setGoogleDocUrl(null);

    try {
      const docUrl = await exportTournamentToGoogleDocs(
        result,
        declaredWinners,
        selectedGame,
        getPDFRoundLabel,
        getPDFParticipantLabel,
        getFlatChronologicalMatches
      );
      setGoogleDocUrl(docUrl);
      
      // Attempt safe window opening
      try {
        window.open(docUrl, '_blank');
      } catch (e) {
        console.warn("Popup blocked, fallback to inline link UI action.");
      }
    } catch (err: any) {
      console.error("Google Docs Export Error:", err);
      alert(err.message || "Failed to compile Glory Grid ledger into Google Docs.");
    } finally {
      setIsGoogleDocsExporting(false);
    }
  };

  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Schedule Customization State
  const [editingScheduleMatch, setEditingScheduleMatch] = useState<Match | null>(null);
  const [selectedDayNum, setSelectedDayNum] = useState<number | undefined>(undefined);
  const [startTimeVal, setStartTimeVal] = useState<string>('09:00');
  const [endTimeVal, setEndTimeVal] = useState<string>('09:45');
  const [selectedCourtNum, setSelectedCourtNum] = useState<number | undefined>(undefined);
  const [hasTimeSelection, setHasTimeSelection] = useState<boolean>(true);

  // Load tournament results and choices from localStorage on device ready
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('glory_grid_saved_tournaments');
      if (savedHistory) {
        setSavedTournaments(JSON.parse(savedHistory));
      }
      const savedActiveId = localStorage.getItem('glory_grid_active_id');
      if (savedActiveId) {
        setActiveTournamentId(savedActiveId);
      }

      const savedResult = localStorage.getItem('glory_grid_result_v2');
      const savedWinners = localStorage.getItem('glory_grid_winners_v2');
      const savedGame = localStorage.getItem('glory_grid_selected_game_v2');
      const savedViewState = localStorage.getItem('glory_grid_view_state_v2');

      if (savedResult) {
        const parsed = JSON.parse(savedResult);
        if (parsed && typeof parsed === 'object') {
          // Compare current date with tournament end date strictly local midnight
          let expired = false;
          if (parsed.endDate) {
            try {
              const today = new Date();
              const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              
              const parts = parsed.endDate.split("-").map(Number);
              if (parts.length === 3) {
                const endMidnight = new Date(parts[0], parts[1] - 1, parts[2]);
                if (todayMidnight.getTime() > endMidnight.getTime()) {
                  expired = true;
                }
              }
            } catch (dtErr) {
              console.warn("Could not calculate date expiration:", dtErr);
            }
          }

          if (expired) {
            console.log("Concluded tournament auto-expired past scheduled end date on re-run:", parsed.endDate);
            localStorage.removeItem('glory_grid_result_v2');
            localStorage.removeItem('glory_grid_winners_v2');
            localStorage.removeItem('glory_grid_selected_game_v2');
            localStorage.removeItem('glory_grid_view_state_v2');
            localStorage.removeItem('glory_grid_active_id');
            setActiveTournamentId(null);
          } else {
            setResult(parsed);
            if (savedWinners) {
              const parsedWinners = JSON.parse(savedWinners);
              if (parsedWinners && typeof parsedWinners === 'object') {
                setDeclaredWinners(parsedWinners);
              }
            }
            if (savedGame) {
              setSelectedGame(savedGame as GameType);
            }
            setViewState('results'); // Load straight back into the active results dash
          }
        }
      }
    } catch (err) {
      console.warn("Could not load tournament state from localStorage:", err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Initialize schedule modal state when editing starts
  useEffect(() => {
    if (editingScheduleMatch) {
      setSelectedDayNum(editingScheduleMatch.dayNumber);
      setSelectedCourtNum(editingScheduleMatch.courtNumber);
      
      let start24 = '09:00';
      let hasTime = true; // default to true for fresh scheduling
      if (editingScheduleMatch.scheduledTime) {
        const parts = editingScheduleMatch.scheduledTime.split(', ');
        if (parts.length === 2) {
          // Scheduled but explicitly NO time! (Day & Date only)
          hasTime = false;
        } else if (parts.length >= 3) {
          hasTime = true;
          let tempStart = parts[2];
          if (tempStart.includes(' (Ext')) {
            tempStart = tempStart.split(' (Ext')[0];
          }
          start24 = to24Hour(tempStart);
        }
      }
      setHasTimeSelection(hasTime);
      setStartTimeVal(start24);
      
      let end24 = '09:45';
      if (editingScheduleMatch.endTime) {
        end24 = to24Hour(editingScheduleMatch.endTime);
      } else {
        const duration = editingScheduleMatch.matchDurationMin || 45;
        const [h, m] = start24.split(':').map(Number);
        const totalMin = h * 60 + m + duration;
        const newH = Math.floor(totalMin / 60) % 24;
        const newM = totalMin % 60;
        end24 = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
      }
      setEndTimeVal(end24);
    }
  }, [editingScheduleMatch]);

  // Save changes to localStorage whenever results, winners, games or viewState changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (result) {
        localStorage.setItem('glory_grid_result_v2', JSON.stringify(result));
        localStorage.setItem('glory_grid_winners_v2', JSON.stringify(declaredWinners));
        localStorage.setItem('glory_grid_selected_game_v2', selectedGame);
        localStorage.setItem('glory_grid_view_state_v2', viewState);
      } else {
        localStorage.removeItem('glory_grid_result_v2');
        localStorage.removeItem('glory_grid_winners_v2');
        localStorage.removeItem('glory_grid_selected_game_v2');
        localStorage.removeItem('glory_grid_view_state_v2');
      }
    } catch (err) {
      console.warn("Could not save tournament state to localStorage:", err);
    }
  }, [result, declaredWinners, selectedGame, viewState, isLoaded]);

  // Save savedTournaments to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem('glory_grid_saved_tournaments', JSON.stringify(savedTournaments));
    } catch (err) {
      console.warn("Could not save history to localStorage:", err);
    }
  }, [savedTournaments, isLoaded]);

  // Save active tournament ID to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (activeTournamentId) {
        localStorage.setItem('glory_grid_active_id', activeTournamentId);
      } else {
        localStorage.removeItem('glory_grid_active_id');
      }
    } catch (err) {
      console.warn("Could not save active ID to localStorage:", err);
    }
  }, [activeTournamentId, isLoaded]);

  // Synchronize changes to active tournament back into savedTournaments history
  useEffect(() => {
    if (!isLoaded || !activeTournamentId || !result) return;
    setSavedTournaments(prev => {
      let isChanged = false;
      const updated = prev.map(t => {
        if (t.id === activeTournamentId) {
          const resultStr = JSON.stringify(result);
          const winnersStr = JSON.stringify(declaredWinners);
          if (
            JSON.stringify(t.result) !== resultStr ||
            JSON.stringify(t.declaredWinners) !== winnersStr
          ) {
            isChanged = true;
            return {
              ...t,
              result: JSON.parse(resultStr),
              declaredWinners: JSON.parse(winnersStr),
              selectedGame: selectedGame,
            };
          }
        }
        return t;
      });
      return isChanged ? updated : prev;
    });
  }, [result, declaredWinners, activeTournamentId, selectedGame, isLoaded]);

  // PDF Download action
  const handleDownloadPDF = async () => {
    await legacy_handleDownloadPDF();
  };

  // Word Document (.doc) Export Action
  const handleDownloadWordDoc = () => {
    if (!result) return;

    const title = result.fixtureName ? result.fixtureName.trim() : 'Glory Grid Tournament Fixture Log';
    const gameLabel = selectedGame.charAt(0).toUpperCase() + selectedGame.slice(1);
    const formatLabel = result.isDoubles ? 'Doubles Partnership Pairing' : 'Singles Individual Pairing';
    const totalTeams = result.totalParticipants;
    const arenasCount = result.courtsCount;
    const arenaName = selectedGame === 'cricket' ? 'Pitch' : selectedGame === 'carrom' ? 'Board' : 'Chess Table';
    const arenaLabel = `${arenasCount} ${arenaName}${arenasCount > 1 ? 'es' : ''}`;
    const themeColor = selectedGame === 'cricket' ? '#f97316' : selectedGame === 'carrom' ? '#10b981' : '#6366f1';
    const flatMatches = getFlatChronologicalMatches();

    let htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${title}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@700&display=swap');
          @page {
            size: landscape;
            margin: 0.5in;
          }
          body {
            font-family: 'Segoe UI', 'Inter', Arial, sans-serif;
            color: #1e293b;
            background-color: #f8fafc;
            line-height: 1.5;
            padding: 0;
            margin: 0;
          }
          .word-page {
            page-break-after: always;
            clear: both;
            position: relative;
            box-sizing: border-box;
          }
          .cover-card {
            background-color: #0b1329;
            color: #ffffff;
            font-family: 'Segoe UI', 'Inter', sans-serif;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
        </style>
      </head>
      <body>
        <!-- PAGE 1: DARK THEME EXECUTIVE COVER SCREEN -->
        <div class="word-page cover-card" style="background-color: #0b0f19; color: #ffffff; padding: 40px; min-height: 560pt; border: 15px solid #090c15;">
          <div style="border: 1px solid #1e293b; padding: 30px; min-height: 500pt; border-radius: 4px; position: relative;">
            
            <!-- Dynamic Theme Highlight bar -->
            <div style="width: 180px; height: 4px; background-color: ${themeColor}; margin-bottom: 24px;"></div>
            
            <h1 style="color: #ffffff; font-size: 28pt; font-weight: 800; margin: 0 0 4px 0; text-transform: uppercase; font-family: 'Segoe UI', 'Inter', sans-serif;">
              ${title}
            </h1>
            <p style="color: #94a3b8; font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 0 0 20px 0; tracking-wider: 0.05em;">
              ${gameLabel.toUpperCase()} TOURNAMENT (${result.isDoubles ? 'DOUBLES' : 'SINGLES'})
            </p>
            
            <div style="height: 1px; background-color: #1e293b; margin-top: 16px; margin-bottom: 24px;"></div>
            
            <!-- Technical parameters card table -->
            <table style="width: 100%; border-collapse: collapse; background-color: #111827; border: 1px solid #1e293b; border-radius: 8px; margin-bottom: 30px;">
              <tr>
                <td style="width: 50%; padding: 20px; vertical-align: top;">
                  <h3 style="color: #818cf8; font-weight: 800; font-size: 11pt; margin-top: 0; margin-bottom: 12px; text-transform: uppercase;">⚙️ TECHNICAL CONFIG</h3>
                  <table style="width: 100%; font-size: 9.5pt; color: #cbd5e1; line-height: 1.6;">
                    <tr><td style="padding: 3px 0; width: 45%;"><strong>Discipline Type:</strong></td><td style="color: #ffffff;">${selectedGame.toUpperCase()}</td></tr>
                    <tr><td style="padding: 3px 0;"><strong>Match Format:</strong></td><td style="color: #ffffff;">${result.isDoubles ? 'Doubles (Tag Partnership)' : 'Singles (Solo Matchup)'}</td></tr>
                    <tr><td style="padding: 3px 0;"><strong>Active Arenas:</strong></td><td style="color: #ffffff;">${arenaLabel}</td></tr>
                    <tr><td style="padding: 3px 0;"><strong>Rest Buffer Time:</strong></td><td style="color: #ffffff;">${result.restTimeMin} Minutes play rest</td></tr>
                  </table>
                </td>
                <td style="width: 50%; padding: 20px; vertical-align: top; border-left: 1px solid #1e293b;">
                  <h3 style="color: #818cf8; font-weight: 800; font-size: 11pt; margin-top: 0; margin-bottom: 12px; text-transform: uppercase;">📡 TOURNAMENT METRICS</h3>
                  <table style="width: 100%; font-size: 9.5pt; color: #cbd5e1; line-height: 1.6;">
                    <tr><td style="padding: 3px 0; width: 45%;"><strong>Total Players/Teams:</strong></td><td style="color: #ffffff;">${totalTeams} Participants</td></tr>
                    <tr><td style="padding: 3px 0;"><strong>Active Pools Count:</strong></td><td style="color: #ffffff;">${result.pools.length} Pools of Play</td></tr>
                    <tr><td style="padding: 3px 0;"><strong>Allocated Match:</strong></td><td style="color: #ffffff;">${result.matchDurationMin} mins match / ${result.restTimeMin} mins rest</td></tr>
                    <tr><td style="padding: 3px 0;"><strong>Status Date Period:</strong></td><td style="color: #ffffff;">Ends ${result.endDate ? result.endDate.split('-').reverse().join('/') : 'N/A'}</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Participating pools list section -->
            <h2 style="color: #cbd5e1; font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 0 0 12px 0; border-bottom: 1px solid #1e293b; padding-bottom: 6px;">
              Participating Pools &amp; Segments (${result.pools.length})
            </h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
              <tr>
                <td style="padding: 0; vertical-align: top;">
                  ${result.pools.map((p) => {
                    const matchCount = p.rounds.reduce((acc, row) => acc + row.flat().length, 0);
                    return `
                      <div style="background-color: #111827; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 18px; margin-bottom: 10px; display: block;">
                        <table style="width: 100%;">
                          <tr>
                            <td>
                              <h4 style="color: #ffffff; font-size: 11pt; font-weight: bold; margin: 0; text-transform: uppercase;">${p.name}</h4>
                              <p style="color: #94a3b8; font-size: 8.5pt; margin: 4px 0 0 0;">${p.teams.length} Registered Teams &bull; ${p.rounds.length} Scheduled Rounds &bull; ${p.isRoundRobin ? 'Round Robin Series' : 'Knockout Stages'}</p>
                            </td>
                            <td style="text-align: right; vertical-align: middle;">
                              <span style="background-color: #1e293b; color: #cbd5e1; font-size: 8.5pt; font-weight: bold; padding: 4px 10px; border-radius: 20px;">
                                ${matchCount} Fixtures
                              </span>
                            </td>
                          </tr>
                        </table>
                      </div>
                    `;
                  }).join('')}
                  
                  ${result.finalsPool ? `
                    <div style="background-color: #1e1b4b; border: 2px solid #4f46e5; border-radius: 8px; padding: 12px 18px; margin-top: 10px; display: block;">
                      <table style="width: 100%;">
                        <tr>
                          <td>
                            <h4 style="color: #c7d2fe; font-size: 11pt; font-weight: bold; margin: 0; text-transform: uppercase;">🏆 Championship Playoffs Stage</h4>
                            <p style="color: #818cf8; font-size: 8.5pt; margin: 4px 0 0 0;">Cross-pool Playoff Knockout Bracket with ${result.finalsPool.teams.length} Qualifiers</p>
                          </td>
                          <td style="text-align: right; vertical-align: middle;">
                            <span style="background-color: #4f46e5; color: #ffffff; font-size: 8.5pt; font-weight: bold; padding: 4px 10px; border-radius: 4px;">
                              Playoffs
                            </span>
                          </td>
                        </tr>
                      </table>
                    </div>
                  ` : ''}
                </td>
              </tr>
            </table>

            <!-- Cover footer -->
            <table style="width: 100%; font-size: 8pt; color: #475569; border-top: 1px solid #1e293b; padding-top: 10px; margin-top: 35px; position: absolute; bottom: 10px; left: 0; right: 0;">
              <tr>
                <td>GLORY GRID EXECUTIVE REPORT DEEP_MIND SPEED_EDITION</td>
                <td style="text-align: right;">UTC DEPLOYMENT EXPORTED: ${new Date().toUTCString()}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- POOL BY POOL DETAILS (STANDINGS & BRACKETS) -->
        ${result.pools.map((p) => {
          let poolContent = '';

          // 1. Point Standings for Cricket Round Robin Pools (matching PDF Page 2)
          if (selectedGame === 'cricket') {
            const standings = calculateCricketStandings(p, declaredWinners);
            const promoteCount = result.teamsToPromotePerPool || 1;

            poolContent += `
              <br clear="all" style="page-break-before: always;" />
              <div class="word-page" style="background-color: #ffffff; color: #1e293b; padding: 40px; min-height: 560pt; border: 15px solid #f1f5f9; border-radius: 4px;">
                <div style="border: 1px solid #e2e8f0; padding: 30px; min-height: 500pt; position: relative;">
                  
                  <!-- Standings Header -->
                  <table style="width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
                    <tr>
                      <td>
                        <h2 style="font-size: 16pt; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase; font-family: sans-serif;">${p.name.toUpperCase()} - POINTS STANDINGS</h2>
                        <p style="font-size: 9pt; color: #64748b; margin: 2px 0 0 0; font-weight: bold; text-transform: uppercase;">CRM Statistics &amp; Net Run Rate (NRR) Details</p>
                      </td>
                      <td style="text-align: right; vertical-align: middle;">
                        <span style="background-color: #f1f5f9; color: #475569; font-size: 8.5pt; font-weight: bold; padding: 4px 12px; border-radius: 20px; border: 1px solid #cbd5e1; text-transform: uppercase;">
                           ROUND ROBIN POOL
                        </span>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Points Table Grid -->
                  <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                      <tr style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1;">
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: left; border-bottom: 2px solid #94a3b8;">Rank</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: left; border-bottom: 2px solid #94a3b8;">Team Name</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: center; border-bottom: 2px solid #94a3b8;">P</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: center; border-bottom: 2px solid #94a3b8;">W</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: center; border-bottom: 2px solid #94a3b8;">L</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: center; border-bottom: 2px solid #94a3b8;">PTS</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: left; border-bottom: 2px solid #94a3b8;">Runs / Overs Faced</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: left; border-bottom: 2px solid #94a3b8;">Runs / Overs Bowled</th>
                        <th style="padding: 10px 12px; font-size: 9.5pt; color: #475569; font-weight: bold; text-align: center; border-bottom: 2px solid #94a3b8;">NRR</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${standings.map((team, rank) => {
                        let nrrString = team.nrr.toFixed(3);
                        let nrrColor = '#64748b';
                        if (team.nrr > 0) {
                          nrrString = '+' + nrrString;
                          nrrColor = '#059669';
                        } else if (team.nrr < 0) {
                          nrrColor = '#dc2626';
                        }
                        const isCurrentlyPromoted = rank < promoteCount;
                        return `
                          <tr style="border-bottom: 1px solid #e2e8f0; ${isCurrentlyPromoted ? 'background-color: #f0fdf4;' : ''}">
                            <td style="padding: 10px 12px; font-size: 9.5pt; color: #64748b;">#${rank + 1}</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; font-weight: bold; color: #0f172a;">${team.name} ${isCurrentlyPromoted ? '👑' : ''}</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; text-align: center;">${team.played}</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; text-align: center; color: #059669; font-weight: bold;">${team.wins}</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; text-align: center; color: #ef4444;">${team.losses}</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; text-align: center; color: #1e3a8a; font-weight: bold;">${team.points}</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; color: #475569;">${team.runsScored} runs / ${team.oversFacedDecimal.toFixed(1)} ov</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; color: #475569;">${team.runsConceded} runs / ${team.oversBowledDecimal.toFixed(1)} ov</td>
                            <td style="padding: 10px 12px; font-size: 9.5pt; text-align: center; color: ${nrrColor}; font-weight: bold; font-family: monospace;">${nrrString}</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                  
                  ${promoteCount > 0 && standings.length > 0 ? `
                    <div style="margin-top: 30px; background-color: #ecfdf5; border: 1px solid #10b981; padding: 14px 20px; border-radius: 8px; color: #065f46; font-weight: bold; font-size: 10pt;">
                      🏆 PROMOTED TO PLAYOFFS: ${
                        standings.slice(0, promoteCount).map(t => t.name.toUpperCase()).join(" & ")
                      }
                    </div>
                  ` : ''}
                  
                  <!-- Standings Page Footer info -->
                  <table style="width: 100%; font-size: 8pt; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 40px; position: absolute; bottom: 10px; left: 0; right: 0;">
                    <tr>
                      <td>GLORY GRID SYSTEMS</td>
                      <td style="text-align: right;">POOL STANDINGS CARD &bull; POOL ${p.name.toUpperCase()}</td>
                    </tr>
                  </table>
                </div>
              </div>
            `;
          }

          // 2. Horizontally columnized tree diagram or round-fixtures list (matching PDF Page 3)
          poolContent += `
            <br clear="all" style="page-break-before: always;" />
            <div class="word-page" style="background-color: #ffffff; color: #1e293b; padding: 40px; min-height: 560pt; border: 15px solid #f1f5f9; border-radius: 4px;">
              <div style="border: 1px solid #e2e8f0; padding: 30px; min-height: 500pt; position: relative;">
                
                <!-- Page Brackets Header -->
                <table style="width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
                  <tr>
                    <td>
                      <h2 style="font-size: 16pt; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase;">${p.name.toUpperCase()} - MATCH FIXTURES TREE</h2>
                      <p style="font-size: 9pt; color: #64748b; margin: 2px 0 0 0; font-weight: bold; text-transform: uppercase;">Comprehensive competitive round list and outcome ledger</p>
                    </td>
                    <td style="text-align: right; vertical-align: middle;">
                      <span style="background-color: #f1f5f9; color: #475569; font-size: 8.5pt; font-weight: bold; padding: 4px 12px; border-radius: 20px; border: 1px solid #cbd5e1; text-transform: uppercase;">
                        ${p.isRoundRobin ? 'Round Robin Schedule' : 'Knockout Stages'}
                      </span>
                    </td>
                  </tr>
                </table>
                
                <!-- Horizontal bracket-card columns grid table -->
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                  <tr>
                    ${p.rounds.map((roundMatches, rIdx) => {
                      const roundLabel = getPDFRoundLabel(p, rIdx);
                      return `
                        <td style="width: 25%; padding: 0 8px; vertical-align: top;">
                          <!-- Custom dynamic color border matching game type -->
                          <div style="background-color: #f1f5f9; padding: 6px 12px; border-left: 3px solid ${themeColor}; border-radius: 3px; margin-bottom: 15px;">
                            <span style="font-size: 8pt; font-weight: bold; color: #475569; text-transform: uppercase; tracking-wider: 0.05em;">${roundLabel}</span>
                          </div>
                          
                          <table style="width: 100%; border-collapse: collapse;">
                            ${roundMatches.map((match) => {
                              const pSideA = getPDFParticipantLabel(match, 'A');
                              const pSideB = getPDFParticipantLabel(match, 'B');
                              const finalWin = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);
                              const isWinA = finalWin === pSideA;
                              const isWinB = finalWin === pSideB;

                              const hasScores = match.runsScoredA !== undefined || match.runsScoredB !== undefined;
                              let scoreStringA = '';
                              let scoreStringB = '';
                              if (selectedGame === 'cricket' && hasScores) {
                                scoreStringA = match.runsScoredA !== undefined ? `(${match.runsScoredA} r)` : '';
                                scoreStringB = match.runsScoredB !== undefined ? `(${match.runsScoredB} r)` : '';
                              } else if (hasScores) {
                                scoreStringA = match.runsScoredA !== undefined ? `(${match.runsScoredA})` : '';
                                scoreStringB = match.runsScoredB !== undefined ? `(${match.runsScoredB})` : '';
                              }

                              let statusText = 'PLAYING';
                              let statusColor = '#3b82f6';
                              let statusBg = '#eff6ff';
                              if (match.isWalkover) {
                                statusText = 'BYE';
                                statusColor = '#64748b';
                                statusBg = '#f1f5f9';
                              } else if (finalWin) {
                                statusText = 'FINISHED';
                                statusColor = '#059669';
                                statusBg = '#ecfdf5';
                              }

                              const arenaPlacement = match.courtNumber ? `${selectedGame === 'cricket' ? 'Pitch' : selectedGame === 'carrom' ? 'Board' : 'Table'} ${match.courtNumber}` : 'Open';
                              const timeSlot = match.scheduledTime ? (match.scheduledTime.split(', ').length >= 3 ? match.scheduledTime.split(', ')[2] : match.scheduledTime) : 'TBD';

                              return `
                                <tr>
                                  <td style="padding: 0 0 12px 0;">
                                    <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid ${themeColor}; border-radius: 6px; padding: 10px;">
                                      <table style="width: 100%; border-bottom: 1px solid #e2e8f0; margin-bottom: 6px; padding-bottom: 4px;">
                                        <tr>
                                          <td style="font-size: 7.5pt; font-weight: bold; color: #475569; font-family: monospace;">MATCH &bull; ${match.isWalkover ? 'BYE' : `M${match.matchIndex + 1}`}</td>
                                          <td style="font-size: 7.5pt; font-weight: bold; color: ${statusColor}; text-align: right; font-family: monospace;">
                                            <span style="background-color: ${statusBg}; padding: 1px 4px; border-radius: 3px;">${statusText}</span>
                                          </td>
                                        </tr>
                                      </table>
                                      
                                      <table style="width: 100%; font-size: 8.5pt; line-height: 1.4;">
                                        <tr>
                                          <td style="${isWinA ? 'color: #166534; font-weight: bold;' : 'color: #1e293b;'}; width: 80%;">
                                            ${pSideA}
                                          </td>
                                          <td style="text-align: right; font-weight: bold; color: #b45309; width: 20%;">
                                            ${scoreStringA}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td colspan="2" style="font-size: 7pt; color: #94a3b8; font-weight: bold; font-family: monospace; padding: 2px 0;">
                                            VS
                                          </td>
                                        </tr>
                                        <tr>
                                          <td style="${isWinB ? 'color: #166534; font-weight: bold;' : 'color: #1e293b;'}; width: 80%;">
                                            ${pSideB}
                                          </td>
                                          <td style="text-align: right; font-weight: bold; color: #b45309; width: 20%;">
                                            ${scoreStringB}
                                          </td>
                                        </tr>
                                      </table>
                                      
                                      ${!match.isWalkover ? `
                                        <table style="width: 100%; font-size: 7.5pt; color: #64748b; border-top: 1px dashed #cbd5e1; margin-top: 6px; padding-top: 4px; font-family: monospace;">
                                          <tr>
                                            <td>🏟️ ${arenaPlacement}</td>
                                            <td style="text-align: right;">🕒 ${timeSlot}</td>
                                          </tr>
                                        </table>
                                      ` : ''}
                                    </div>
                                  </td>
                                </tr>
                              `;
                            }).join('')}
                          </table>
                        </td>
                      `;
                    }).join('')}
                  </tr>
                </table>
                
                <!-- Bracket Page Footer info -->
                <table style="width: 100%; font-size: 8pt; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 40px; position: absolute; bottom: 10px; left: 0; right: 0;">
                  <tr>
                    <td>GLORY GRID CODES</td>
                    <td style="text-align: right;">FIXTURE REVOLUTIONS &bull; PAGE GROUP ${p.name.toUpperCase()}</td>
                  </tr>
                </table>
              </div>
            </div>
          `;

          return poolContent;
        }).join('')}

        <!-- 2. CHAMPIONSHIP PLAYOFF BRACKET PAGE (matching PDF Page 4) -->
        ${result.finalsPool ? (() => {
          const overallWinner = getGrandChampion();
          const pActivePool = result.championshipPlayoffsPool || result.finalsPool;
          return `
            <br clear="all" style="page-break-before: always;" />
            <div class="word-page" style="background-color: #ffffff; color: #1e293b; padding: 40px; min-height: 560pt; border: 15px solid #faf5ff; border-radius: 4px;">
              <div style="border: 1px solid #e9d5ff; padding: 30px; min-height: 500pt; position: relative;">
                
                <!-- Championship Header -->
                <table style="width: 100%; border-bottom: 2px solid #6b21a8; padding-bottom: 12px; margin-bottom: 16px;">
                  <tr>
                    <td>
                      <h2 style="font-size: 16pt; font-weight: 800; color: #581c87; margin: 0; text-transform: uppercase;">🏆 CHAMPIONSHIP PLAYOFFS BRACKET</h2>
                      <p style="font-size: 9pt; color: #8b5cf6; margin: 2px 0 0 0; font-weight: bold; text-transform: uppercase;">Cross-pool Playoffs stage knockout tree &amp; overall championship draw</p>
                    </td>
                    <td style="text-align: right; vertical-align: middle;">
                      <span style="background-color: #6b21a8; color: #ffffff; font-size: 8.5pt; font-weight: bold; padding: 4px 12px; border-radius: 20px; text-transform: uppercase;">
                        CHAMPIONSHIP FINALS
                      </span>
                    </td>
                  </tr>
                </table>
                
                ${overallWinner ? `
                  <div style="background-color: #fff1f2; border: 3px double #f43f5e; padding: 14px 20px; text-align: center; color: #be123c; font-size: 15pt; font-weight: bold; margin-bottom: 25px; border-radius: 8px;">
                    🎉🏆 TOURNAMENT OVERALL CHAMPION: ${overallWinner.toUpperCase()} 🏆🎉
                  </div>
                ` : ''}

                <!-- Horizontal Knockout Brackets Table -->
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                  <tr>
                    ${pActivePool.rounds.map((roundMatches, rIdx) => {
                      const roundLabel = getPDFRoundLabel(pActivePool, rIdx);
                      return `
                        <td style="width: 33.3%; padding: 0 10px; vertical-align: middle;">
                          <div style="background-color: #f5f3ff; padding: 6px 12px; border-left: 3px solid #8b5cf6; border-radius: 3px; margin-bottom: 15px;">
                            <span style="font-size: 8pt; font-weight: bold; color: #6d28d9; text-transform: uppercase;">${roundLabel}</span>
                          </div>
                          
                          <table style="width: 100%; border-collapse: collapse;">
                            ${roundMatches.map((match) => {
                              const pSideA = getPDFParticipantLabel(match, 'A');
                              const pSideB = getPDFParticipantLabel(match, 'B');
                              const finalWin = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);
                              const isWinA = finalWin === pSideA;
                              const isWinB = finalWin === pSideB;

                              const hasScores = match.runsScoredA !== undefined || match.runsScoredB !== undefined;
                              let scoreStringA = '';
                              let scoreStringB = '';
                              if (selectedGame === 'cricket' && hasScores) {
                                scoreStringA = match.runsScoredA !== undefined ? `(${match.runsScoredA} r)` : '';
                                scoreStringB = match.runsScoredB !== undefined ? `(${match.runsScoredB} r)` : '';
                              } else if (hasScores) {
                                scoreStringA = match.runsScoredA !== undefined ? `(${match.runsScoredA})` : '';
                                scoreStringB = match.runsScoredB !== undefined ? `(${match.runsScoredB})` : '';
                              }

                              let statusText = 'PLAYING';
                              let statusColor = '#8b5cf6';
                              let statusBg = '#f5f3ff';
                              if (match.isWalkover) {
                                statusText = 'BYE';
                                statusColor = '#64748b';
                                statusBg = '#f1f5f9';
                              } else if (finalWin) {
                                statusText = 'FINISHED';
                                statusColor = '#059669';
                                statusBg = '#ecfdf5';
                              }

                              const arenaPlacement = match.courtNumber ? `${selectedGame === 'cricket' ? 'Pitch' : selectedGame === 'carrom' ? 'Board' : 'Table'} ${match.courtNumber}` : 'Open';
                              const timeSlot = match.scheduledTime ? (match.scheduledTime.split(', ').length >= 3 ? match.scheduledTime.split(', ')[2] : match.scheduledTime) : 'TBD';

                              return `
                                <tr>
                                  <td style="padding: 0 0 15px 0;">
                                    <div style="background-color: #ffffff; border: 1px solid #d8b4fe; border-left: 4px solid #8b5cf6; border-radius: 6px; padding: 12px; box-shadow: 0 2px 4px rgba(139, 92, 246, 0.05);">
                                      <table style="width: 100%; border-bottom: 1px solid #e9d5ff; margin-bottom: 8px; padding-bottom: 4px;">
                                        <tr>
                                          <td style="font-size: 7.5pt; font-weight: bold; color: #581c87; font-family: monospace;">PLAYOFF MATCH &bull; ${match.isWalkover ? 'BYE' : `M${match.matchIndex + 1}`}</td>
                                          <td style="font-size: 7.5pt; font-weight: bold; color: ${statusColor}; text-align: right; font-family: monospace;">
                                            <span style="background-color: ${statusBg}; padding: 1px 4px; border-radius: 3px;">${statusText}</span>
                                          </td>
                                        </tr>
                                      </table>
                                      
                                      <table style="width: 100%; font-size: 9pt; line-height: 1.4;">
                                        <tr>
                                          <td style="${isWinA ? 'color: #166534; font-weight: bold;' : 'color: #1e293b;'}; width: 80%;">
                                            ${pSideA}
                                          </td>
                                          <td style="text-align: right; font-weight: bold; color: #6d28d9; width: 20%;">
                                            ${scoreStringA}
                                          </td>
                                        </tr>
                                        <tr>
                                          <td colspan="2" style="font-size: 7.5pt; color: #c084fc; font-weight: bold; font-family: monospace; padding: 2px 0;">
                                            VS
                                          </td>
                                        </tr>
                                        <tr>
                                          <td style="${isWinB ? 'color: #166534; font-weight: bold;' : 'color: #1e293b;'}; width: 80%;">
                                            ${pSideB}
                                          </td>
                                          <td style="text-align: right; font-weight: bold; color: #6d28d9; width: 20%;">
                                            ${scoreStringB}
                                          </td>
                                        </tr>
                                      </table>
                                      
                                      ${!match.isWalkover ? `
                                        <table style="width: 100%; font-size: 7.5pt; color: #7c3aed; border-top: 1px dashed #e9d5ff; margin-top: 8px; padding-top: 4px; font-family: monospace;">
                                          <tr>
                                            <td>🏟️ ${arenaPlacement}</td>
                                            <td style="text-align: right;">🕒 ${timeSlot}</td>
                                          </tr>
                                        </table>
                                      ` : ''}
                                    </div>
                                  </td>
                                </tr>
                              `;
                            }).join('')}
                          </table>
                        </td>
                      `;
                    }).join('')}
                  </tr>
                </table>
                
                <!-- Playoff Footer -->
                <table style="width: 100%; font-size: 8pt; color: #b45309; border-top: 1px solid #f3e8ff; padding-top: 10px; margin-top: 40px; position: absolute; bottom: 10px; left: 0; right: 0;">
                  <tr>
                    <td>GLORY GRID INDIGO</td>
                    <td style="text-align: right;">CHAMPIONSHIP PLATINUM LEAGUE SUMMARY</td>
                  </tr>
                </table>
              </div>
            </div>
          `;
        })() : ''}

        <!-- 3. DETAILED CHRONOLOGICAL SCHEDULE LEDGER PAGE (matching PDF Page 5) -->
        <br clear="all" style="page-break-before: always;" />
        <div class="word-page" style="background-color: #ffffff; color: #1e293b; padding: 40px; border: 15px solid #f1f5f9; border-radius: 4px;">
          <div style="border: 1px solid #e2e8f0; padding: 30px; min-height: 500pt; position: relative;">
            
            <!-- Ledger Header -->
            <table style="width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
              <tr>
                <td>
                  <h2 style="font-size: 16pt; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase;">📅 CHRONOLOGICAL STATUS LEDGER &amp; SCHEDULE</h2>
                  <p style="font-size: 9pt; color: #64748b; margin: 2px 0 0 0; font-weight: bold; text-transform: uppercase;">Chronological list of all played and scheduled fixture matchups</p>
                </td>
              </tr>
            </table>
            
            <!-- Table listing all matches -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
              <thead>
                <tr style="background-color: #0f172a; color: #ffffff;">
                  <th style="padding: 10px 12px; font-size: 9.5pt; font-weight: bold; text-align: left;">Pool / Stage</th>
                  <th style="padding: 10px 12px; font-size: 9.5pt; font-weight: bold; text-align: left;">Matchup Teams</th>
                  <th style="padding: 10px 12px; font-size: 9.5pt; font-weight: bold; text-align: left;">Schedule Day / Time</th>
                  <th style="padding: 10px 12px; font-size: 9.5pt; font-weight: bold; text-align: left;">Arena Placement</th>
                  <th style="padding: 10px 12px; font-size: 9.5pt; font-weight: bold; text-align: left;">Winner Outturn Status</th>
                </tr>
              </thead>
              <tbody>
                ${flatMatches.map((match, mIdx) => {
                  const sideA = getPDFParticipantLabel(match, 'A');
                  const sideB = getPDFParticipantLabel(match, 'B');
                  const isWalkover = match.isWalkover;
                  const winVal = declaredWinners[match.id] || (isWalkover ? match.winner : null);

                  let schedString = match.scheduledTime || 'TBD Schedule';
                  if (isWalkover) {
                    schedString = 'BYE Bypass (Instant)';
                  }
                  
                  const rowBg = mIdx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';

                  return `
                    <tr style="${rowBg} border-bottom: 1px solid #e2e8f0;">
                      <td style="padding: 11px 12px; font-size: 9.5pt; font-weight: bold; color: #475569;">${match.poolName || 'Championship'}</td>
                      <td style="padding: 11px 12px; font-size: 9.5pt; font-weight: bold; color: #0f172a;">${sideA} vs ${sideB}</td>
                      <td style="padding: 11px 12px; font-size: 9.5pt; color: #64748b; font-family: monospace;">${schedString}</td>
                      <td style="padding: 11px 12px; font-size: 9.5pt; font-weight: bold; color: #334155;">
                        ${isWalkover ? 'Not Required' : match.courtNumber ? `${selectedGame === 'cricket' ? 'Pitch' : selectedGame === 'carrom' ? 'Board' : 'Table'} ${match.courtNumber}` : 'Open Arena'}
                      </td>
                      <td style="padding: 11px 12px; font-size: 9.5pt; vertical-align: middle;">
                        ${winVal ? `
                          <span style="color: #15803d; font-weight: bold;">🏆 ${winVal}</span>
                        ` : `
                          <span style="color: #94a3b8; font-style: italic; font-weight: bold;">Pending Match</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            
            <!-- Event Ledger bottom signature info -->
            <table style="width: 100%; font-size: 8.5pt; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 40px;">
              <tr>
                <td>Prepared and exported on UTC ${new Date().toUTCString()} &bull; Glory Grid Sports Management Protocol</td>
              </tr>
            </table>
          </div>
        </div>
      </body>
      </html>
    `;

    const downloadFilename = result.fixtureName 
      ? `${result.fixtureName.trim().replace(/\s+/g, '_')}_workbook_report.doc`
      : `glory_grid_${selectedGame}_workbook_report.doc`;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFilename;
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
  };

  // Modern High-Fidelity PDF export utilizing html2canvas to capture exact shaped Gujarati fonts!
  const handleDownloadHighFidelityPDF = async () => {
    if (!result) return;
    setIsExporting(true);
    let restoreGetComputedStyle: (() => void) | null = null;
    try {
      restoreGetComputedStyle = patchGetComputedStyleForPDF();

      // Small sleep to let any changes paint
      await new Promise(resolve => setTimeout(resolve, 150));

      const container = document.getElementById('hidden-pdf-report-container');
      if (!container) {
        console.error("PDF high-fidelity report element not found!");
        alert("The PDF report is preparing. Please click the button again in a moment.");
        setIsExporting(false);
        return;
      }

      // Safe jsPDF class resolution
      let DocClass: any = jsPDF;
      if (!DocClass) {
        const imported: any = await import('jspdf');
        DocClass = imported.jsPDF || imported.default || imported;
      }
      if (typeof DocClass !== 'function' && (DocClass as any).jsPDF) {
        DocClass = (DocClass as any).jsPDF;
      }
      if (typeof DocClass !== 'function' && (DocClass as any).default) {
        DocClass = (DocClass as any).default;
      }

      // Safe html2canvas resolution
      let h2c: any = html2canvas;
      if (!h2c) {
        const imported: any = await import('html2canvas');
        h2c = imported.default || imported;
      }
      if (typeof h2c !== 'function' && (h2c as any).default) {
        h2c = (h2c as any).default;
      }

      if (typeof DocClass !== 'function' || typeof h2c !== 'function') {
        throw new Error("Required exporting libraries (jsPDF/html2canvas) could not be resolved correctly.");
      }

      const pdf = new DocClass({
        orientation: 'landscape',
        unit: 'px',
        format: 'a4',
      });

      const pWidth = pdf.internal.pageSize.getWidth();
      const pHeight = pdf.internal.pageSize.getHeight();

      const pageElements = container.querySelectorAll('.pdf-render-page');
      if (pageElements.length === 0) {
        throw new Error("No PDF render pages found inside hidden container!");
      }

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i] as HTMLElement;
        const canvas = await h2c(pageEl, {
          scale: 2, // Double-scale for crisp vector/text quality!
          useCORS: true,
          allowTaint: false, // Critical: prevent canvas poisoning so toDataURL can run!
          backgroundColor: null,
          scrollX: 0,
          scrollY: 0,
          logging: false, // Disable verbose console log warnings
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, pWidth, pHeight);
      }

      const downloadFilename = result.fixtureName 
        ? `${result.fixtureName.trim().replace(/\s+/g, '_')}_report.pdf` 
        : `glory_grid_${selectedGame}_tourney_report.pdf`;
      
      try {
        // Direct download attempt
        pdf.save(downloadFilename);
      } catch (saveErr) {
        console.warn("Direct pdf.save failed under sandboxed iframe, trying high-compatibility Blob URL download anchor...", saveErr);
        const pdfBlob = pdf.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = downloadFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
        }, 300);
      }
    } catch (err: any) {
      console.warn("PDF high-fidelity direct download failed, falling back to print-friendly web report. Error:", err);
      try {
        await legacy_handleDownloadPDF();
      } catch (fallbackErr) {
        console.error("Print web report fallback failed too:", fallbackErr);
        alert("Encountered an obstacle generating the PDF. Please try again or check your browser permissions.");
      }
    } finally {
      if (restoreGetComputedStyle) {
        restoreGetComputedStyle();
      }
      setIsExporting(false);
    }
  };

  // Modern PDF rendering helper functions
  const getPDFRoundLabel = (p: any, roundIdx: number): string => {
    if (p.isRoundRobin && p.id !== 'finals') {
      return `Fixtures Set ${roundIdx + 1}`;
    }
    const totalRounds = p.rounds.length;
    if (roundIdx === totalRounds - 1) return "Finals";
    if (roundIdx === totalRounds - 2) return "Semifinals";
    if (roundIdx === totalRounds - 3) return "Quarterfinals";
    return `Round ${roundIdx + 1}`;
  };

  const getPDFParticipantLabelFallback = (prevMatchId: string, currentPoolId: string): string => {
    if (currentPoolId === 'finals') {
      if (prevMatchId.startsWith('finals-')) {
        const pIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
        const round0Length = result?.finalsPool?.rounds[0]?.length || 0;
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
        const sourcePool = result?.pools.find(p => p.id === poolId);
        if (sourcePool) {
          return `Winner of ${sourcePool.name}`;
        }
      }
    }
    const prevMatchIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
    return `Winner of M${prevMatchIdx}`;
  };

  const getPDFParticipantLabel = (m: Match, slot: 'A' | 'B'): string => {
    const prevMatchId = slot === 'A' ? m.prevMatchAId : m.prevMatchBId;
    if (!prevMatchId) {
      return slot === 'A' ? m.teamA : m.teamB;
    }
    const winnerOfPrev = declaredWinners[prevMatchId];
    if (winnerOfPrev) {
      return winnerOfPrev;
    }
    return getPDFParticipantLabelFallback(prevMatchId, m.poolId);
  };

  // Legacy PDF implementation wrapper
  const legacy_handleDownloadPDF = async () => {
    if (!result) return;
    setIsExporting(true);
    try {
      if (false) {
        const getRoundLabelOfPool = (p: any, roundIdx: number): string => {
        if (p.isRoundRobin && p.id !== 'finals') {
          return `Fixtures Set ${roundIdx + 1}`;
        }
        const totalRounds = p.rounds.length;
        if (roundIdx === totalRounds - 1) return "Finals";
        if (roundIdx === totalRounds - 2) return "Semifinals";
        if (roundIdx === totalRounds - 3) return "Quarterfinals";
        return `Round ${roundIdx + 1}`;
      };

      const getFallbackPlaceholder = (prevMatchId: string, currentPoolId: string): string => {
        if (currentPoolId === 'finals') {
          if (prevMatchId.startsWith('finals-')) {
            const pIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
            const round0Length = result?.finalsPool?.rounds[0]?.length || 0;
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
            const sourcePool = result?.pools.find(p => p.id === poolId);
            if (sourcePool) {
              return `Winner of ${sourcePool.name}`;
            }
          }
        }
        const prevMatchIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
        return `Winner of M${prevMatchIdx}`;
      };

      const getParticipantLabel = (m: Match, slot: 'A' | 'B'): string => {
        const prevMatchId = slot === 'A' ? m.prevMatchAId : m.prevMatchBId;
        if (!prevMatchId) {
          return slot === 'A' ? m.teamA : m.teamB;
        }
        const winnerOfPrev = declaredWinners[prevMatchId];
        if (winnerOfPrev) {
          return winnerOfPrev;
        }
        return getFallbackPlaceholder(prevMatchId, m.poolId);
      };

      const customTitle = result.fixtureName ? result.fixtureName.toUpperCase() : 'GLORY GRID - TOURNAMENT REPORT';
      const formatLabel = result.isDoubles ? 'DOUBLES' : 'SINGLES';
      const gameLabel = result.gameType === 'carrom' ? `${result.gameType.toUpperCase()} TOURNAMENT (${formatLabel})` : `${result.gameType.toUpperCase()} TOURNAMENT`;
      const locTypeName = result.gameType === 'cricket' ? 'Pitches/Grounds' : result.gameType === 'carrom' ? 'Carrom Boards' : 'Chess Tables';

      let poolsListHTML = '';
      result.pools.forEach((p) => {
        const matchCount = p.rounds.reduce((acc, row) => acc + row.flat().length, 0);
        poolsListHTML += `
          <div style="break-inside: avoid;" class="flex flex-col sm:flex-row sm:items-center justify-between border border-slate-150 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition">
            <div>
              <h4 class="font-bold text-slate-900 text-sm">${p.name.toUpperCase()}</h4>
              <p class="text-xs text-slate-500">${p.teams.length} Registered Teams &bull; ${p.rounds.length} Scheduled Competitive Rounds</p>
            </div>
            <span class="text-xs font-semibold px-2.5 py-1 bg-slate-200 text-slate-700 rounded-full mt-2 sm:mt-0 max-w-fit">
              ${matchCount} Total Fixtures
            </span>
          </div>
        `;
      });

      if (result.finalsPool) {
        const activeChampPool = result.championshipPlayoffsPool || result.finalsPool;
        const lastRound = activeChampPool.rounds[activeChampPool.rounds.length - 1];
        let championBadge = '';
        if (lastRound && lastRound.length > 0) {
          const grandMatch = lastRound[0];
          const grandChamp = declaredWinners[grandMatch.id];
          if (grandChamp && grandChamp !== 'BYE' && !grandChamp.startsWith('Winner of')) {
            championBadge = `<span class="bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-lg px-3 py-1 text-xs">⭐ Grand Champion: \${grandChamp.toUpperCase()}</span>`;
          }
        }
        poolsListHTML += `
          <div style="break-inside: avoid;" class="flex flex-col sm:flex-row sm:items-center justify-between border border-indigo-150 rounded-xl p-4 bg-indigo-50/30">
            <div>
              <h4 class="font-black text-indigo-950 text-sm uppercase">🏆 Championship Stage</h4>
              <p class="text-xs text-indigo-700">Cross-pool Playoff Bracket with \${activeChampPool.teams.length} Qualifying Leaders</p>
            </div>
            <div class="mt-2 sm:mt-0 flex flex-wrap gap-2">
              \${championBadge}
              <span class="text-xs font-bold px-2.5 py-1 bg-indigo-600 text-white rounded-full">
                Playoffs Bracket
              </span>
            </div>
          </div>
        `;
      }

      let cricketStandingsSectionHTML = '';
      if (result.gameType === 'cricket') {
        cricketStandingsSectionHTML = `
          <div class="page-break mb-8">
            <h2 class="text-xl font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-4">🏏 CRICKET POOLS POINTS STANDINGS</h2>
        `;
        result.pools.forEach((p) => {
          const standings = calculateCricketStandings(p, declaredWinners);
          cricketStandingsSectionHTML += `
            <div style="break-inside: avoid;" class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
              <h3 class="text-base font-bold text-slate-800 mb-3">\${p.name.toUpperCase()} (Standings)</h3>
              <div class="overflow-x-auto font-sans">
                <table class="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                      <th class="py-2 px-3 font-semibold">Rank</th>
                      <th class="py-2 px-3 font-semibold">Team Name</th>
                      <th class="py-2 px-3 font-semibold text-center">P</th>
                      <th class="py-2 px-3 font-semibold text-center">W</th>
                      <th class="py-2 px-3 font-semibold text-center">L</th>
                      <th class="py-2 px-3 font-semibold text-center">PTS</th>
                      <th class="py-2 px-3 font-semibold">Runs / Overs Faced</th>
                      <th class="py-2 px-3 font-semibold">Runs / Overs Bowled</th>
                      <th class="py-2 px-3 font-semibold text-center">NRR</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
          `;
          standings.forEach((team: any, rank: number) => {
            let nrrString = team.nrr.toFixed(3);
            let nrrClass = 'text-slate-500 font-mono';
            if (team.nrr > 0) {
              nrrString = '+' + nrrString;
              nrrClass = 'text-emerald-600 font-bold font-mono';
            } else if (team.nrr < 0) {
              nrrClass = 'text-red-600 font-bold font-mono';
            }
            cricketStandingsSectionHTML += `
                    <tr class="hover:bg-slate-50 font-sans">
                      <td class="py-2 px-3 font-bold text-slate-600 font-sans">#\${rank + 1}</td>
                      <td class="py-2 px-3 font-bold text-slate-900 font-sans">\${team.name}</td>
                      <td class="py-2 px-3 text-center text-slate-700 font-sans">\${team.played}</td>
                      <td class="py-2 px-3 text-center text-emerald-600 font-semibold font-sans">\${team.wins}</td>
                      <td class="py-2 px-3 text-center text-red-500 font-sans">\${team.losses}</td>
                      <td class="py-2 px-3 text-center text-amber-600 font-bold font-sans">\${team.points}</td>
                      <td class="py-2 px-3 text-slate-600 font-sans">\${team.runsScored} runs / \text{\$}  {team.oversFacedDecimal.toFixed(1)} ov</td>
                      <td class="py-2 px-3 text-slate-600 font-sans">\${team.runsConceded} runs / \text{\$}  {team.oversBowledDecimal.toFixed(1)} ov</td>
                      <td class="py-2 px-3 text-center \${nrrClass}">\${nrrString}</td>
                    </tr>
            `;
          });
          cricketStandingsSectionHTML += `
                  </tbody>
                </table>
              </div>
          `;
          const promotedTeam = declaredWinners[p.id + '-winner'];
          if (promotedTeam) {
            cricketStandingsSectionHTML += `
              <div class="mt-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm font-semibold flex items-center space-x-2">
                <span>👑</span>
                <span><strong>POOL CHAMPION & PROMOTED:</strong> \${promotedTeam}</span>
              </div>
            `;
          }
          cricketStandingsSectionHTML += `
            </div>
          `;
        });
        cricketStandingsSectionHTML += `</div>`;
      }

      let ledgerRowsHTML = '';
      flatMatches.forEach((match) => {
        const isWalkover = match.isWalkover;
        const isWholeTournamentFinal =
          (match.poolId === 'finals' && match.roundIndex === result.finalsPool!.rounds.length - 1) ||
          (result.pools.length === 1 && result.pools[0] && match.poolId === result.pools[0].id && !result.pools[0].isRoundRobin && match.roundIndex === result.pools[0].rounds.length - 1);

        const sideA = getParticipantLabel(match, 'A');
        const sideB = getParticipantLabel(match, 'B');

        let scheduleDetails = '';
        if (isWalkover) {
          scheduleDetails = '<span class="text-slate-400 font-mono text-xs">BYE Bypass (Instant)</span>';
        } else if (isWholeTournamentFinal) {
          let dayDisplay = match.dayNumber ? 'Day ' + match.dayNumber : 'Day ?';
          let dateDisplay = '';
          if (match.scheduledTime) {
            const parts = match.scheduledTime.split(', ');
            if (parts.length === 2 && parts[1] !== 'TBD Date') {
              dateDisplay = ' &bull; ' + parts[1];
            }
          }
          const hasActualTime = match.scheduledTime && !match.scheduledTime.includes('TBD Start') && !match.scheduledTime.includes('BYE Bypass');
          const timeText = hasActualTime ? '<span class="block text-amber-600 font-bold font-mono text-xs mt-0.5">' + match.scheduledTime + '</span>' : '';
          scheduleDetails = '<span class="font-bold text-amber-600 text-xs uppercase tracking-wide">🏆 GRAND FINALE (' + dayDisplay + dateDisplay + ')</span>' + timeText;
        } else {
          scheduleDetails = '<span class="text-slate-600 text-xs font-medium">' + (match.scheduledTime || 'TBD') + '</span>';
        }

        let arenaLabel = '';
        if (isWalkover) {
          arenaLabel = '<span class="text-slate-400 italic text-xs">Not Required</span>';
        } else if (isWholeTournamentFinal && !match.courtNumber) {
          arenaLabel = '<span class="text-slate-400 italic text-xs">Not Required</span>';
        } else {
          if (match.courtNumber) {
            if (result.gameType === 'cricket') {
              arenaLabel = '<span class="bg-orange-100 text-orange-850 px-2 py-0.5 rounded border border-orange-200 text-xs font-bold">Ground ' + match.courtNumber + '</span>';
            } else if (result.gameType === 'carrom') {
              arenaLabel = '<span class="bg-emerald-100 text-emerald-850 px-2 py-0.5 rounded border border-emerald-200 text-xs font-bold">Board ' + match.courtNumber + '</span>';
            } else {
              arenaLabel = '<span class="bg-indigo-100 text-indigo-850 px-2 py-0.5 rounded border border-indigo-200 text-xs font-bold">Table ' + match.courtNumber + '</span>';
            }
          } else {
            arenaLabel = '<span class="text-slate-500 font-semibold text-xs italic">' + (result.gameType === 'cricket' ? 'Ground' : result.gameType === 'carrom' ? 'Board' : 'Table') + ' Open</span>';
          }
        }

        let outcomeHTML = '';
        const win = declaredWinners[match.id] || (isWalkover ? match.winner : null);
        if (win) {
          outcomeHTML = '<span class="text-emerald-700 font-bold text-xs flex items-center space-x-1"><span>✅</span><span>' + win + '</span></span>';
        } else {
          outcomeHTML = '<span class="text-slate-400 font-semibold text-xs italic">Pending Match</span>';
        }

        let scoreHTML = '';
        if (result.gameType === 'cricket') {
          const hasScoreA = match.runsScoredA !== undefined;
          const hasScoreB = match.runsScoredB !== undefined;
          if (hasScoreA || hasScoreB) {
            scoreHTML = `
              <div class="mt-1 text-[11px] font-mono select-none flex flex-col space-y-0.5 text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100 max-w-xs">
                <div><span class="font-semibold text-slate-700">\${sideA}:</span> \${hasScoreA ? match.runsScoredA + ' runs (' + match.oversFacedA + ' ov)' : '-'}</div>
                <div><span class="font-semibold text-slate-700">\${sideB}:</span> \${hasScoreB ? match.runsScoredB + ' runs (' + match.oversFacedB + ' ov)' : '-'}</div>
              </div>
            `;
          }
        }

        ledgerRowsHTML += `
          <tr class="hover:bg-slate-50/70 transition font-sans">
            <td class="py-3 px-4 font-bold text-slate-800 text-xs w-1/5 font-sans">\${match.poolName || 'Qualifiers'}</td>
            <td class="py-3 px-4 w-1/3">
              <div class="flex flex-col text-slate-950 font-semibold">
                <div class="\${win === sideA ? 'text-emerald-700 font-bold' : ''}">\${sideA}</div>
                <div class="text-slate-400 font-medium py-0.5 text-[10px]">vs</div>
                <div class="\${win === sideB ? 'text-emerald-700 font-bold' : ''}">\${sideB}</div>
              </div>
              \${scoreHTML}
            </td>
            <td class="py-3 px-4 w-1/4">\${scheduleDetails}</td>
            <td class="py-3 px-4">\${arenaLabel}</td>
            <td class="py-3 px-4">\${outcomeHTML}</td>
          </tr>
        `;
      });

      let poolsDetailHTML = '';
      result.pools.forEach((p) => {
        poolsDetailHTML += `
          <div style="break-inside: avoid;" class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8 mt-4 font-sans">
            <h3 class="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between uppercase">
              <span>\${p.name} Matches & Fixtures</span>
              <span class="text-xs bg-slate-100 text-slate-600 font-semibold px-2.5 py-1 rounded-full uppercase">\${p.isRoundRobin ? 'Round Robin' : 'Bracket'}</span>
            </h3>
        `;

        p.rounds.forEach((roundMatches, rIdx) => {
          const roundLabel = getRoundLabelOfPool(p, rIdx);
          poolsDetailHTML += `
            <div class="mb-6 last:mb-0">
              <h4 class="font-bold text-slate-800 text-xs mb-3 bg-slate-50 px-3 py-1.5 rounded border-l-4 border-indigo-500 font-mono uppercase tracking-wider">\${roundLabel}</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          `;

          roundMatches.forEach((match) => {
            const sideA = getParticipantLabel(match, 'A');
            const sideB = getParticipantLabel(match, 'B');
            const isWinnerA = declaredWinners[match.id] === sideA;
            const isWinnerB = declaredWinners[match.id] === sideB;
            const winName = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);

            let isCurrentWalkover = match.isWalkover;
            let matchStatusBadge = '';
            if (isCurrentWalkover) {
              matchStatusBadge = '<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold">BYE</span>';
            } else if (winName) {
              matchStatusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-mono font-bold">FINISHED</span>';
            } else {
              matchStatusBadge = '<span class="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-[10px] font-mono font-bold">PLAYING</span>';
            }

            let scoreDetailsA = '';
            let scoreDetailsB = '';
            if (result.gameType === 'cricket') {
              if (match.runsScoredA !== undefined) {
                scoreDetailsA = '<span class="text-amber-700 font-bold font-mono text-xs">(' + match.runsScoredA + ' runs, ' + match.oversFacedA + ' ov)</span>';
              }
              if (match.runsScoredB !== undefined) {
                scoreDetailsB = '<span class="text-amber-700 font-bold font-mono text-xs">(' + match.runsScoredB + ' runs, ' + match.oversFacedB + ' ov)</span>';
              }
            }

            poolsDetailHTML += `
              <div class="border border-slate-150 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between hover:border-indigo-200 transition font-sans">
                <div class="flex items-center justify-between border-b border-slate-200/60 pb-2 mb-3">
                  <span class="text-[10px] text-slate-400 font-bold font-mono">MATCH &bull; \${match.isWalkover ? 'BYE' : 'M' + (match.matchIndex + 1)}</span>
                  \${matchStatusBadge}
                </div>
                <div class="space-y-2.5">
                  <div class="flex items-center justify-between">
                    <span class="\${isWinnerA ? 'text-emerald-700 font-bold' : 'text-slate-800 font-semibold'}">\${sideA}</span>
                    \${scoreDetailsA}
                  </div>
                  <div class="text-[11px] text-slate-400 font-bold font-mono tracking-wider">VS</div>
                  <div class="flex items-center justify-between">
                    <span class="\${isWinnerB ? 'text-emerald-700 font-bold' : 'text-slate-800 font-semibold'}">\${sideB}</span>
                    \${scoreDetailsB}
                  </div>
                </div>
                
                \${!match.isWalkover ? \`
                <div class="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap gap-2 items-center justify-between text-[11px] text-slate-500">
                  <span>🏟️ \${match.courtNumber ? (result.gameType === 'cricket' ? 'Ground' : 'Board') + ' ' + match.courtNumber : 'Arena Open'}</span>
                  <span>🕒 \${match.scheduledTime || 'TBD Time'}</span>
                </div>
                \` : ''}
              </div>
            `;
          });

          poolsDetailHTML += `
              </div>
            </div>
          `;
        });

        poolsDetailHTML += `
          </div>
        `;
      });

      if (result.finalsPool) {
        poolsDetailHTML += `
          <div style="break-inside: avoid;" class="bg-indigo-50/10 border-2 border-indigo-200 rounded-xl p-6 mb-8 mt-6 font-sans">
            <h3 class="text-base font-black text-indigo-950 uppercase mb-4 flex items-center justify-between">
              <span>🏆 Championship Bracket Stage</span>
              <span class="text-xs bg-indigo-600 text-white font-bold px-2.5 py-1 rounded-full">Knockout Finals</span>
            </h3>
        `;

        result.finalsPool.rounds.forEach((roundMatches, rIdx) => {
          const roundLabel = getRoundLabelOfPool(result.finalsPool, rIdx);
          poolsDetailHTML += `
            <div class="mb-6 last:mb-0">
              <h4 class="font-bold text-indigo-900 text-xs mb-3 bg-indigo-100/60 px-3 py-1.5 rounded border-l-4 border-indigo-600 font-mono uppercase tracking-wider">\text{\$} {roundLabel}</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          `;

          roundMatches.forEach((match) => {
            const sideA = getParticipantLabel(match, 'A');
            const sideB = getParticipantLabel(match, 'B');
            const isWinnerA = declaredWinners[match.id] === sideA;
            const isWinnerB = declaredWinners[match.id] === sideB;
            const winName = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);

            let isCurrentWalkover = match.isWalkover;
            let matchStatusBadge = '';
            if (isCurrentWalkover) {
              matchStatusBadge = '<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold">BYE</span>';
            } else if (winName) {
              matchStatusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-mono font-bold">FINISHED</span>';
            } else {
              matchStatusBadge = '<span class="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-[10px] font-mono font-bold">PLAYING</span>';
            }

            let scoreDetailsA = '';
            let scoreDetailsB = '';
            if (result.gameType === 'cricket') {
              if (match.runsScoredA !== undefined) {
                scoreDetailsA = '<span class="text-amber-700 font-bold font-mono text-xs">(' + match.runsScoredA + ' runs, ' + match.oversFacedA + ' ov)</span>';
              }
              if (match.runsScoredB !== undefined) {
                scoreDetailsB = '<span class="text-amber-700 font-bold font-mono text-xs">(' + match.runsScoredB + ' runs, ' + match.oversFacedB + ' ov)</span>';
              }
            }

            poolsDetailHTML += `
              <div class="border border-indigo-150 rounded-lg p-4 bg-white flex flex-col justify-between hover:border-indigo-400 transition shadow-sm font-sans">
                <div class="flex items-center justify-between border-b border-indigo-100 pb-2 mb-3">
                  <span class="text-[10px] text-indigo-400 font-bold font-mono font-black font-semibold">PLAYOFF MATCH &bull; \${match.isWalkover ? 'BYE' : 'M' + (match.matchIndex + 1)}</span>
                  \${matchStatusBadge}
                </div>
                <div class="space-y-2.5 font-sans">
                  <div class="flex items-center justify-between">
                    <span class="\${isWinnerA ? 'text-emerald-700 font-bold' : 'text-slate-800 font-semibold'}">\${sideA}</span>
                    \${scoreDetailsA}
                  </div>
                  <div class="text-[11px] text-slate-400 font-bold font-mono tracking-wider font-sans">VS</div>
                  <div class="flex items-center justify-between">
                    <span class="\${isWinnerB ? 'text-emerald-700 font-bold' : 'text-slate-800 font-semibold'}">\${sideB}</span>
                    \${scoreDetailsB}
                  </div>
                </div>
                
                \${!match.isWalkover ? \`
                <div class="mt-3 pt-3 border-t border-indigo-50 flex flex-wrap gap-2 items-center justify-between text-[11px] text-slate-500">
                  <span>🏟️ \${match.courtNumber ? (result.gameType === 'cricket' ? 'Ground' : 'Board') + ' ' + match.courtNumber : 'Arena Open'}</span>
                  <span>🕒 \${match.scheduledTime || 'TBD Time'}</span>
                </div>
                \` : ''}
              </div>
            `;
          });

          poolsDetailHTML += `
              </div>
            </div>
          `;
        });

        poolsDetailHTML += `
          </div>
        `;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this website to print/save the tournament report.");
        return;
      }

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${result.fixtureName || 'Tournament Report'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Gujarati:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Noto Sans Gujarati"', '"Inter"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          }
        }
      }
    }
  </script>
  <style>
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        background-color: #ffffff !important;
        color: #000000 !important;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .page-break {
        page-break-before: always;
        break-before: page;
      }
    }
    body {
      font-family: "Noto Sans Gujarati", "Inter", sans-serif;
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen pb-16 font-sans">
  <div class="no-print bg-slate-900 text-white px-6 py-4 sticky top-0 flex flex-col sm:flex-row items-center justify-between border-b border-slate-800 shadow-md z-50">
    <div class="mb-3 sm:mb-0">
      <h2 class="font-bold text-base text-amber-500 tracking-wide">🏆 HIGH-FIDELITY PRINT RENDERING ENGINE</h2>
      <p class="text-xs text-slate-300">Renders Gujarati fonts and ligature conjuncts perfectly. Select <strong>"Save as PDF"</strong> (Landscape suggested) as your destination in the printer details.</p>
    </div>
    <div class="flex items-center space-x-3">
      <button onclick="window.print()" class="bg-amber-500 hover:bg-amber-600 active:scale-95 transition text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm flex items-center shadow-lg cursor-pointer font-sans cursor-pointer">
        🖨️ Print / Save as PDF
      </button>
      <button onclick="window.close()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg text-xs cursor-pointer">
        Close
      </button>
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8 font-sans">
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-8">
      <div class="border-b-4 border-amber-500 pb-6 mb-6">
        <h1 class="text-3xl font-black tracking-tight text-slate-900 uppercase mb-1 font-sans">${customTitle}</h1>
        <p class="text-sm font-semibold tracking-wider text-slate-500 uppercase">${gameLabel}</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 rounded-xl p-6 mb-8 border border-slate-150">
        <div>
          <h3 class="text-indigo-600 font-bold text-xs uppercase tracking-widest mb-3">⚙️ Technical Config</h3>
          <ul class="space-y-2 text-sm text-slate-700">
            <li><strong>Discipline Type:</strong> ${result.gameType.toUpperCase()}</li>
            ${result.gameType === 'carrom' ? `<li><strong>Match Format:</strong> ${result.isDoubles ? 'Doubles (Tag Partnership)' : 'Singles (Solo Matchup)'}</li>` : ''}
            <li><strong>Active Arenas:</strong> ${result.courtsCount} ${locTypeName}</li>
            <li><strong>Rest Buffer:</strong> ${result.restTimeMin} Minutes</li>
          </ul>
        </div>
        <div>
          <h3 class="text-indigo-600 font-bold text-xs uppercase tracking-widest mb-3">📈 Tournament Metrics</h3>
          <ul class="space-y-2 text-sm text-slate-700">
            <li><strong>Total Participants:</strong> ${result.totalParticipants} Players</li>
            <li><strong>Active Pools Count:</strong> ${result.poolsCount} Pools of Play</li>
            <li><strong>Allocated Match Duration:</strong> ${result.matchDurationMin} mins play / ${result.restTimeMin} mins break</li>
            <li><strong>Status Period Ends:</strong> ${result.endDate ? result.endDate.split('-').reverse().join('/') : 'N/A'}</li>
          </ul>
        </div>
      </div>

      <div>
        <h2 class="text-lg font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">📂 COMPONENT POOLS OVERVIEW</h2>
        <div class="space-y-3">
          ${poolsListHTML}
        </div>
      </div>
    </div>

    ${cricketStandingsSectionHTML}

    <div class="page-break mb-8">
      <h2 class="text-xl font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-6 font-sans">📅 SCHEDULE & FIXTURE LEDGER</h2>
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-sans">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="bg-slate-900 text-slate-100 uppercase text-[10px] tracking-wider">
              <th class="py-3 px-4">POOL / STAGE</th>
              <th class="py-3 px-4">MATCHUP TEAMS</th>
              <th class="py-3 px-4">SCHEDULE DETAILS</th>
              <th class="py-3 px-4">ALLOCATED ARENA</th>
              <th class="py-3 px-4">STATUS / WINNER</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-150">
            ${ledgerRowsHTML}
          </tbody>
        </table>
      </div>
    </div>

    <div class="page-break mt-8">
      <h2 class="text-xl font-black text-slate-900 border-b-2 border-slate-900 pb-2 mb-6 font-sans">📦 DETAILED FIXTURES & BRACKETS</h2>
      ${poolsDetailHTML}
    </div>

    <div class="mt-12 text-center text-xs text-slate-400 border-t border-slate-200 pt-6">
      <p>Report generated through Glory Grid on ${new Date().toLocaleDateString()}</p>
      <p class="mt-1">High-fidelity layout optimized for standard A4 landscape or portrait printing.</p>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(() => {
        window.print();
      }, 1000);
    }
  </script>
</body>
</html>
`;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      }
    } catch (err) {
      console.error("Print popup failed:", err);
    }

    try {
      if (true) {
        let DocClass: any = jsPDF;
      if (!DocClass || (typeof DocClass !== 'function' && (DocClass as any).jsPDF)) {
        DocClass = (DocClass as any).jsPDF;
      }
      if (typeof DocClass !== 'function') {
        const imported = await import('jspdf');
        DocClass = imported.jsPDF || imported.default || imported;
      }

      // Create landscape PDF
      const doc = new DocClass({
        orientation: 'landscape',
        unit: 'px',
        format: 'a4',
      });

      let pdfFont = 'Helvetica';

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ==========================================
      // PAGE 1: EXECUTIVE COVER PAGE & CONFIGURATION DETAILS (DARK MODE)
      // ==========================================
      doc.setFillColor(11, 15, 25); // slate-950 (Elegant deep dark)
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Double structural thin borders
      doc.setDrawColor(30, 41, 59); // slate-800
      doc.setLineWidth(1);
      doc.rect(14, 14, pageWidth - 28, pageHeight - 28, 'D');
      doc.rect(18, 18, pageWidth - 36, pageHeight - 36, 'D');

      // Theme Accent Tag
      const isCricket = result.gameType === 'cricket';
      const isCarrom = result.gameType === 'carrom';
      const themeColorRGB = isCricket ? [249, 115, 22] : (isCarrom ? [16, 185, 129] : [79, 70, 229]); // Orange, Emerald, or Indigo

      doc.setFillColor(themeColorRGB[0], themeColorRGB[1], themeColorRGB[2]);
      doc.rect(34, 34, 180, 4, 'F');

      // Title Card
      doc.setTextColor(255, 255, 255); // Crisp White heading
      doc.setFont(pdfFont, 'bold');
      const customTitle = result.fixtureName ? result.fixtureName.toUpperCase() : 'GLORY GRID - TOURNAMENT REPORT';
      const fontSize = customTitle.length > 35 ? (customTitle.length > 50 ? 14 : 18) : 24;
      doc.setFontSize(fontSize);
      doc.text(customTitle, 34, 62);

      // Subtitle
      const formatLabel = result.isDoubles ? 'DOUBLES' : 'SINGLES';
      const gameLabel = result.gameType === 'carrom' ? `${result.gameType.toUpperCase()} TOURNAMENT (${formatLabel})` : `${result.gameType.toUpperCase()} TOURNAMENT`;
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(gameLabel, 34, 76);

      // Line spacer
      doc.setDrawColor(30, 41, 59); // slate-800 boundary
      doc.line(34, 90, pageWidth - 34, 90);

      // Statistics Card in beautiful dark rounded container
      doc.setFillColor(17, 24, 39); // slate-900
      doc.setDrawColor(51, 65, 85); // slate-700
      doc.roundedRect(34, 105, pageWidth - 68, 110, 6, 6, 'FD');

      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255); // white card header
      doc.text('CONFIGURATION DETAILS', 48, 122);
      
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225); // slate-300 readable metrics

      const locTypeName = result.gameType === 'cricket' ? 'Pitches/Grounds' : result.gameType === 'carrom' ? 'Carrom Boards' : 'Chess Tables';
      doc.text(`• Discipline Type:   ${result.gameType.toUpperCase()}`, 58, 142);
      if (result.gameType === 'carrom') {
        doc.text(`• Match Format:    ${result.isDoubles ? 'Doubles (Tag Partnership)' : 'Singles (Solo Matchup)'}`, 58, 156);
        doc.text(`• Active Arenas:   ${result.courtsCount} Allocated ${locTypeName}`, 58, 170);
        doc.text(`• Rest Time Limit: ${result.restTimeMin} Minutes Buffer Allocated`, 58, 184);
      } else {
        doc.text(`• Active Arenas:   ${result.courtsCount} Allocated ${locTypeName}`, 58, 156);
        doc.text(`• Rest Time Limit: ${result.restTimeMin} Minutes Buffer Allocated`, 58, 170);
      }

      const colStart2 = pageWidth / 2 + 10;
      doc.text(`• Total Players/Teams:  ${result.totalParticipants} Participants`, colStart2 + 10, 142);
      doc.text(`• Standard Pool Count: ${result.poolsCount} Competitive Pools`, colStart2 + 10, 156);
      let durationLabel = `${result.matchDurationMin} mins play / ${result.restTimeMin} mins break`;
      doc.text(`• Allocated Match Time: ${durationLabel}`, colStart2 + 10, 170);
      doc.text(`• Status Date Period:   Ending ${result.endDate ? result.endDate.split('-').reverse().join('/') : 'N/A'}`, colStart2 + 10, 184);

      // Category headers
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text('PARTICIPATING GROUP POOLS', 34, 238);

      let poolY = 255;
      result.pools.forEach((p, pIdx) => {
        if (poolY > pageHeight - 65) return;
        doc.setFillColor(17, 24, 39); // slate-900 background rows
        doc.setDrawColor(30, 41, 59); // slate-800 border lines
        doc.roundedRect(34, poolY - 10, pageWidth - 68, 20, 3, 3, 'FD');

        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text(p.name.toUpperCase(), 44, poolY + 2);

        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(`${p.teams.length} Registered Players/Doubles • Scheduled ${p.rounds.length} Competitive Rounds of Play`, 180, poolY + 2);

        const matchCount = p.rounds.reduce((acc, row) => acc + row.flat().length, 0);
        doc.text(`(${matchCount} Total Fixtured Matches)`, pageWidth - 140, poolY + 2);

        poolY += 25;
      });

      if (result.finalsPool && poolY <= pageHeight - 45) {
        doc.setFillColor(30, 41, 59); // indigo background in dark mode
        doc.setDrawColor(55, 65, 81);
        doc.roundedRect(34, poolY - 10, pageWidth - 68, 22, 4, 4, 'FD');

        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(themeColorRGB[0], themeColorRGB[1], themeColorRGB[2]); // orange/emerald/indigo category
        doc.text('CHAMPIONSHIP STAGE', 44, poolY + 4);

        const activeChampPool = result.championshipPlayoffsPool || result.finalsPool;

        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(203, 213, 225); // slate-300 text
        doc.text(`Cross-pool Playoff Bracket with ${activeChampPool.teams.length} Qualifying Champions`, 180, poolY + 4);

        const lastRound = activeChampPool.rounds[activeChampPool.rounds.length - 1];
        if (lastRound && lastRound.length > 0) {
          const grandMatch = lastRound[0];
          const grandChamp = declaredWinners[grandMatch.id];
          if (grandChamp && grandChamp !== 'BYE' && !grandChamp.startsWith('Winner of')) {
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(245, 158, 11); // gold gold title
            doc.text(`CROWNED CHAMPION: ${grandChamp.toUpperCase()}`, pageWidth - 210, poolY + 4);
          }
        }
      }

      // Elegant cover footer
      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Exported through Glory Grid on ${new Date().toLocaleDateString()}  |  Pure dark-mode background, high-fidelity printable tournament document.`, 34, pageHeight - 16);

      // Helper for vector drawing
      const getRoundLabelOfPool = (p: any, roundIdx: number): string => {
        if (p.isRoundRobin && p.id !== 'finals') {
          return `Fixtures Set ${roundIdx + 1}`;
        }
        const totalRounds = p.rounds.length;
        if (roundIdx === totalRounds - 1) return "Finals";
        if (roundIdx === totalRounds - 2) return "Semifinals";
        if (roundIdx === totalRounds - 3) return "Quarterfinals";
        return `Round ${roundIdx + 1}`;
      };

       const getFallbackPlaceholder = (prevMatchId: string, currentPoolId: string): string => {
        if (currentPoolId === 'finals') {
          if (prevMatchId.startsWith('finals-')) {
            const pIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
            const round0Length = result?.finalsPool?.rounds[0]?.length || 0;
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
            const sourcePool = result?.pools.find(p => p.id === poolId);
            if (sourcePool) {
              return `Winner of ${sourcePool.name}`;
            }
          }
        }
        const prevMatchIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
        return `Winner of M${prevMatchIdx}`;
      };

      const getParticipantLabel = (m: Match, slot: 'A' | 'B'): string => {
        const prevMatchId = slot === 'A' ? m.prevMatchAId : m.prevMatchBId;
        if (!prevMatchId) {
          return slot === 'A' ? m.teamA : m.teamB;
        }
        const winnerOfPrev = declaredWinners[prevMatchId];
        if (winnerOfPrev) {
          return winnerOfPrev;
        }
        return getFallbackPlaceholder(prevMatchId, m.poolId);
      };

      const drawPoolStandingsPage = (p: Pool) => {
        doc.addPage('landscape');

        // Clean white page background
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Border card frame
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(1);
        doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

        // Header Title (Elegant deep slate)
        doc.setTextColor(15, 23, 42); // slate-900
        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(16);
        doc.text(`${p.name.toUpperCase()} - CRICKET POINTS STANDINGS`, 30, 44);

        // Subheader
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105); // slate-650
        doc.text('Calculated statistics detailing matches played, points, runs, and decimal overs for Net Run Rate (NRR) computation.', 30, 58);

        // Standings header row
        const tableYStart = 85;
        doc.setFillColor(248, 250, 252); // slate-50 background for headers
        doc.rect(30, tableYStart, pageWidth - 60, 24, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.line(30, tableYStart, pageWidth - 30, tableYStart);
        doc.line(30, tableYStart + 24, pageWidth - 30, tableYStart + 24);

        // Text labels for table columns
        doc.setTextColor(51, 65, 85); // slate-700
        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(9);

        const colRankX = 40;
        const colTeamX = 80;
        const colPlayedX = 220;
        const colWinsX = 260;
        const colLossesX = 300;
        const colPointsX = 340;
        const colScoredX = 390;
        const colConcededX = 490;
        const colNrrX = 590;

        doc.text('RANK', colRankX, tableYStart + 15);
        doc.text('TEAM NAME', colTeamX, tableYStart + 15);
        doc.text('P', colPlayedX, tableYStart + 15, { align: 'center' });
        doc.text('W', colWinsX, tableYStart + 15, { align: 'center' });
        doc.text('L', colLossesX, tableYStart + 15, { align: 'center' });
        doc.text('PTS', colPointsX, tableYStart + 15, { align: 'center' });
        doc.text('RUNS / OVERS FACED', colScoredX, tableYStart + 15);
        doc.text('RUNS / OVERS BOWLED', colConcededX, tableYStart + 15);
        doc.text('NRR', colNrrX, tableYStart + 15, { align: 'center' });

        // Retrieve calculations
        const standings = calculateCricketStandings(p, declaredWinners);

        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(9);

        let curY = tableYStart + 24;
        standings.forEach((team, rank) => {
          // Draw alternating row background
          if (rank % 2 === 1) {
            doc.setFillColor(251, 252, 253);
            doc.rect(30, curY, pageWidth - 60, 24, 'F');
          }
          doc.setDrawColor(241, 245, 249);
          doc.line(30, curY + 24, pageWidth - 30, curY + 24);

          const isLeader = rank === 0 && team.points > 0;
          doc.setTextColor(15, 23, 42); // slate-900

          // Rank & name
          doc.setFont(pdfFont, 'bold');
          doc.text(`#${rank + 1}`, colRankX, curY + 15);
          doc.text(team.name, colTeamX, curY + 15);

          // P, W, L, Points
          doc.setFont(pdfFont, 'normal');
          doc.text(String(team.played), colPlayedX, curY + 15, { align: 'center' });

          doc.setTextColor(16, 185, 129); // emerald-500
          doc.text(String(team.wins), colWinsX, curY + 15, { align: 'center' });

          doc.setTextColor(239, 68, 68); // red-500
          doc.text(String(team.losses), colLossesX, curY + 15, { align: 'center' });

          doc.setTextColor(245, 158, 11); // amber-500
          doc.setFont(pdfFont, 'bold');
          doc.text(String(team.points), colPointsX, curY + 15, { align: 'center' });

          // Scored / Bowled
          doc.setTextColor(71, 85, 105);
          doc.setFont(pdfFont, 'normal');
          doc.text(`${team.runsScored} runs / ${team.oversFacedDecimal.toFixed(1)} ov`, colScoredX, curY + 15);
          doc.text(`${team.runsConceded} runs / ${team.oversBowledDecimal.toFixed(1)} ov`, colConcededX, curY + 15);

          // NRR formatting
          let nString = team.nrr.toFixed(3);
          if (team.nrr > 0) {
            nString = `+${nString}`;
            doc.setTextColor(16, 185, 129); // green
          } else if (team.nrr < 0) {
            doc.setTextColor(239, 68, 68); // red
          } else {
            doc.setTextColor(100, 116, 139); // slate-400
          }
          doc.setFont(pdfFont, 'bold');
          doc.text(nString, colNrrX, curY + 15, { align: 'center' });

          curY += 24;
        });

        // Promoted team highlight if configured
        const promotedTeam = declaredWinners[`${p.id}-winner`];
        if (promotedTeam) {
          doc.setFillColor(254, 243, 199); // amber-100
          doc.rect(30, curY + 12, pageWidth - 60, 32, 'F');
          doc.setDrawColor(251, 191, 36); // amber-400
          doc.rect(30, curY + 12, pageWidth - 60, 32, 'D');

          doc.setTextColor(146, 64, 14); // amber-800
          doc.setFont(pdfFont, 'bold');
          doc.setFontSize(10);
          doc.text(`CROWNED POOL CHAMPION & PROMOTED: ${promotedTeam.toUpperCase()}`, 40, curY + 29);
        }
      };

      const drawPoolBracketVector = (pool: any, title: string) => {
        const maxMatchesInRound = Math.max(...pool.rounds.map((r: any) => r.length));
        
        let currentPageHeight = pageHeight;
        let currentPageWidth = pageWidth;

        // If there are many matches in a round, dynamically increase the page height to ensure standard 
        // non-overlapping heights for cards and perfect vertical separation.
        if (maxMatchesInRound > 6) {
          currentPageHeight = pageHeight * 1.5;
          doc.addPage([pageWidth, currentPageHeight], 'landscape');
        } else {
          doc.addPage('landscape');
        }

        // Elegant Light background
        doc.setFillColor(255, 255, 255); // Crisp clean white
        doc.rect(0, 0, currentPageWidth, currentPageHeight, 'F');

        // Border card frame
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(1);
        doc.rect(14, 14, currentPageWidth - 28, currentPageHeight - 28);

        // Header Title (Elegant deep slate)
        doc.setTextColor(15, 23, 42); // slate-900
        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(13);
        const headerTitle = result.fixtureName ? `${result.fixtureName.toUpperCase()} - ${title.toUpperCase()}` : title.toUpperCase();
        doc.text(headerTitle, 30, 34);

        // Subheader
        doc.setFont(pdfFont, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105); // slate-600
        const locNamePlural = result.gameType === 'cricket' ? 'Ground' : result.gameType === 'carrom' ? 'Board' : 'Table';
        doc.text(`Official Bracket Tree Layout • High-Fidelity Printable Layout • Allocated ${locNamePlural} & Exact Timings Included`, 30, 46);

        // Separator Header Line
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.line(30, 52, currentPageWidth - 30, 52);

        // Grid parameters
        const startX = 30;
        const endX = currentPageWidth - 30;
        const roundsCount = pool.rounds.length;
        if (roundsCount === 0) return;

        const colWidth = (endX - startX) / roundsCount;
        const startY = 68;
        const endY = currentPageHeight - 34;

        // Space allocation of bracket matches
        const centerCoords: Record<string, { x: number; y: number }> = {};

        // 1. Draw Columns & Match Cards
        pool.rounds.forEach((roundMatches: Match[], rIdx: number) => {
          const roundLabel = getRoundLabelOfPool(pool, rIdx);

          // Headings banner for this round (modern grey heading block)
          doc.setFillColor(241, 245, 249); // slate-100 grey
          doc.rect(startX + rIdx * colWidth + 5, startY, colWidth - 10, 18, 'F');
          
          doc.setTextColor(51, 65, 85); // slate-700
          doc.setFont(pdfFont, 'bold');
          doc.setFontSize(8);
          doc.text(roundLabel.toUpperCase(), startX + rIdx * colWidth + colWidth / 2, startY + 12, { align: 'center' });

          const totalMatches = roundMatches.length;

          roundMatches.forEach((match: Match, mIdx: number) => {
            let matchY = 0;
            const availableHeight = endY - (startY + 30);
            const gap = availableHeight / (totalMatches + 1);

            if (rIdx === 0) {
              matchY = startY + 30 + gap * (mIdx + 1);
            } else {
              // Find parent match Ys
              const parentAY = centerCoords[match.prevMatchAId || '']?.y;
              const parentBY = centerCoords[match.prevMatchBId || '']?.y;

              if (parentAY !== undefined && parentBY !== undefined) {
                matchY = (parentAY + parentBY) / 2;
              } else if (parentAY !== undefined) {
                matchY = parentAY;
              } else if (parentBY !== undefined) {
                matchY = parentBY;
              } else {
                matchY = startY + 30 + gap * (mIdx + 1);
              }
            }

            // High custom cards & dynamic vertical sizing to guarantee spacing separation!
            const cardWidth = Math.min(132, colWidth - 14);
            // Cap card height dynamically relative to gap to prevent overlap at all costs.
            const cardHeight = Math.max(30, Math.min(48, gap * 0.78)); 
            const matchX = startX + rIdx * colWidth + (colWidth - cardWidth) / 2;

            centerCoords[match.id] = {
              x: matchX + cardWidth / 2,
              y: matchY
            };

            // Draw card background white with clean crisp light border
            doc.setFillColor(248, 250, 252); // slate-50 light background
            doc.setDrawColor(203, 213, 225); // slate-300 lines
            doc.setLineWidth(0.8);
            doc.roundedRect(matchX, matchY - cardHeight / 2, cardWidth, cardHeight, 4, 4, 'FD');

            // Draw a cute side indicator tag representing status
            const win = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);
            if (win) {
              doc.setFillColor(16, 185, 129); // emerald-500 completed
            } else {
              doc.setFillColor(themeColorRGB[0], themeColorRGB[1], themeColorRGB[2]); // pending/scheduled
            }
            doc.rect(matchX, matchY - cardHeight / 2, 2.5, cardHeight, 'F');

            // Text names inside card
            const teamAName = getParticipantLabel(match, 'A');
            const teamBName = getParticipantLabel(match, 'B');

            const isWinnerA = win === teamAName;
            const isWinnerB = win === teamBName;

            // Fluid responsive layout parameters & dynamic font-sizing based on cardHeight to fit all content cleanly without overlapping adjacent cards
            let taY, tbY, detY;
            let nameFontSize = 6.5;
            let detFontSize = 4.5;
            let idFontSize = 5.0;

            if (cardHeight < 40) {
              nameFontSize = 5.0;
              detFontSize = 3.6;
              idFontSize = 4.0;
              taY = matchY - cardHeight * 0.16;
              tbY = matchY + cardHeight * 0.22;
              detY = matchY + cardHeight / 2 - 2.5;
            } else {
              nameFontSize = 6.5;
              detFontSize = 4.5;
              idFontSize = 5.0;
              taY = matchY - cardHeight / 5 - 2;
              tbY = matchY + cardHeight / 5;
              detY = matchY + cardHeight / 2 - 4.5;
            }

            // Draw Team A (Whole Name)
            let currentNameAFontSize = nameFontSize;
            doc.setFontSize(currentNameAFontSize);
            const dispNameA = isWinnerA ? `[W] ${teamAName}` : teamAName;
            const maxTextWidthA = (result.gameType === 'cricket' && match.runsScoredA !== undefined) ? (cardWidth - 35) : (cardWidth - 14);
            while (currentNameAFontSize > 3.5 && (doc.getTextWidth ? doc.getTextWidth(dispNameA) : (dispNameA.length * currentNameAFontSize * 0.5)) > maxTextWidthA) {
              currentNameAFontSize -= 0.3;
              doc.setFontSize(currentNameAFontSize);
            }
            if (isWinnerA) {
              doc.setTextColor(16, 185, 129); // emerald-600 bold for winners in light mode
              doc.setFont(pdfFont, 'bold');
            } else {
              doc.setTextColor(51, 65, 85); // slate-700
              doc.setFont(pdfFont, 'normal');
            }
            doc.text(dispNameA, matchX + 7, taY);

            // Cricket Match Scores (Team A)
            if (result.gameType === 'cricket' && match.runsScoredA !== undefined) {
              doc.setFontSize(nameFontSize - 0.5);
              doc.setTextColor(194, 65, 12); // orange-750 / dark orange
              doc.setFont(pdfFont, 'bold');
              doc.text(`${match.runsScoredA} runs (${match.oversFacedA} ov)`, matchX + cardWidth - 25, taY, { align: 'right' });
            }

            // Small horizontal divider line inside card
            doc.setDrawColor(226, 232, 240); // slate-200
            doc.line(matchX + 4, matchY - 1, matchX + cardWidth - 4, matchY - 1);

            // Draw Team B (Whole Name)
            let currentNameBFontSize = nameFontSize;
            doc.setFontSize(currentNameBFontSize);
            const dispNameB = isWinnerB ? `[W] ${teamBName}` : teamBName;
            const maxTextWidthB = (result.gameType === 'cricket' && match.runsScoredB !== undefined) ? (cardWidth - 35) : (cardWidth - 14);
            while (currentNameBFontSize > 3.5 && (doc.getTextWidth ? doc.getTextWidth(dispNameB) : (dispNameB.length * currentNameBFontSize * 0.5)) > maxTextWidthB) {
              currentNameBFontSize -= 0.3;
              doc.setFontSize(currentNameBFontSize);
            }
            if (isWinnerB) {
              doc.setTextColor(16, 185, 129); // emerald-600
              doc.setFont(pdfFont, 'bold');
            } else {
              doc.setTextColor(51, 65, 85); // slate-700
              doc.setFont(pdfFont, 'normal');
            }
            doc.text(dispNameB, matchX + 7, tbY);

            // Cricket Match Scores (Team B)
            if (result.gameType === 'cricket' && match.runsScoredB !== undefined) {
              doc.setFontSize(nameFontSize - 0.5);
              doc.setTextColor(194, 65, 12); // orange-750
              doc.setFont(pdfFont, 'bold');
              doc.text(`${match.runsScoredB} runs (${match.oversFacedB} ov)`, matchX + cardWidth - 25, tbY, { align: 'right' });
            }

            // Build dynamic robust third-row content with all scheduling variables
            let dateText = '';
            let dayName = '';
            let startTimeText = '';
            let endTimeText = match.endTime || 'TBD End';

            if (match.isWalkover) {
              startTimeText = 'BYE Bypass';
            } else if (match.scheduledTime) {
              // match.scheduledTime is typically formatted like "Mon, May 25, 10:30 AM" or "Sat, Jun 6" (no time component)
              const parts = match.scheduledTime.split(', ');
              if (parts.length >= 3) {
                dayName = parts[0];  // e.g. "Mon"
                dateText = parts[1]; // e.g. "May 25"
                startTimeText = parts[2]; // e.g. "10:30 AM"
              } else if (parts.length === 2) {
                dayName = parts[0];
                dateText = parts[1];
                startTimeText = ''; // No time component!
              } else {
                startTimeText = match.scheduledTime;
              }
            } else {
              startTimeText = 'TBD Start';
            }

            const activeArenaWord = result.gameType === 'cricket' ? 'Ground' : result.gameType === 'carrom' ? 'Board' : 'Table';
            const locationLabelText = match.courtNumber ? `${activeArenaWord} ${match.courtNumber}` : `${activeArenaWord} Open`;
            const dayTextTag = match.dayNumber ? `Day ${match.dayNumber}` : 'Day ?';
            
            // Format ultimate third row string with ALL requested specifications!
            const isSinglePool = result.pools.length === 1;
            const isWholeTournamentFinal =
              (match.poolId === 'finals' && match.roundIndex === result.finalsPool.rounds.length - 1) ||
              (isSinglePool && result.pools[0] && match.poolId === result.pools[0].id && !result.pools[0].isRoundRobin && match.roundIndex === result.pools[0].rounds.length - 1);

            let thirdRowLabel = '';
            if (match.isWalkover) {
               thirdRowLabel = 'BYE Walkover (No Allocation)';
            } else if (isWholeTournamentFinal) {
              const wholeDateVal = dayName ? `${dayName}, ${dateText || 'TBD'}, 2026` : (dateText ? `${dateText}, 2026` : 'TBD Date');
              thirdRowLabel = `GRAND FINALE • ${dayTextTag} • ${wholeDateVal}`;
              if (match.courtNumber) {
                thirdRowLabel += ` • ${locationLabelText}`;
              }
              const hasActualTime = startTimeText && startTimeText !== 'TBD Start' && startTimeText !== 'BYE Bypass' && startTimeText !== '';
              if (hasActualTime) {
                const durationVal = (endTimeText && endTimeText !== 'TBD End') ? `${startTimeText} - ${endTimeText}` : startTimeText;
                thirdRowLabel += ` • ${durationVal}`;
                if (match.courtNumber) {
                  // court number is now appended outside of hasActualTime block below
                }
              }
            } else {
              const wholeDateVal = dayName ? `${dayName}, ${dateText || 'TBD'}, 2026` : (dateText ? `${dateText || 'TBD'}, 2026` : 'TBD Date');
              thirdRowLabel = `${dayTextTag} • ${wholeDateVal}`;
              if (startTimeText && startTimeText !== 'TBD Start') {
                const durationVal = (endTimeText && endTimeText !== 'TBD End') ? `${startTimeText} - ${endTimeText}` : startTimeText;
                thirdRowLabel += ` • ${durationVal}`;
              } else {
                thirdRowLabel += ` • Schedule TBD`;
              }
              thirdRowLabel += ` • ${locationLabelText}`;
            }

            doc.setFont(pdfFont, 'normal');
            doc.setFontSize(detFontSize);
            doc.setTextColor(100, 116, 139); // slate-500
            doc.text(thirdRowLabel, matchX + 7, detY);

            // Draw match ID small on card upper right corner instead of bottom right
            doc.setFont(pdfFont, 'bold');
            doc.setFontSize(idFontSize);
            doc.setTextColor(100, 116, 139); // slate-500
            const midLabel = match.isWalkover ? 'BYE' : `M${mIdx + 1}`;
            doc.text(midLabel, matchX + cardWidth - 11, taY);
          });
        });

        // 2. Draw Connection Connector Lines (Adaptive emerald/slate paths)
        pool.rounds.forEach((roundMatches: Match[], rIdx: number) => {
          if (rIdx === 0) return;

          roundMatches.forEach((match: Match) => {
            const parentA = centerCoords[match.prevMatchAId || ''];
            const parentB = centerCoords[match.prevMatchBId || ''];
            const childCenter = centerCoords[match.id];

            if (!childCenter) return;

            const drawBranch = (parent: { x: number; y: number } | undefined) => {
              if (!parent) return;

              const hasParentWinner = declaredWinners[match.prevMatchAId || ''] || declaredWinners[match.prevMatchBId || ''] || match.isWalkover;
              if (hasParentWinner) {
                doc.setDrawColor(16, 185, 129); // emerald-500 path
              } else {
                doc.setDrawColor(99, 102, 241); // dynamic indigo-500 path (high visibility tree layout)
              }
              doc.setLineWidth(1.0); // Slightly thicker line for high-definition visual precision

              const cardWidth = Math.min(132, colWidth - 14);
              const parentRightX = parent.x + cardWidth / 2;
              const childLeftX = childCenter.x - cardWidth / 2;
              const controlX = (parentRightX + childLeftX) / 2;

              doc.line(parentRightX, parent.y, controlX, parent.y);
              doc.line(controlX, parent.y, controlX, childCenter.y);
              doc.line(controlX, childCenter.y, childLeftX, childCenter.y);
            };

            if (parentA) drawBranch(parentA);
            if (parentB) drawBranch(parentB);
          });
        });
      };

      // Draw beautiful vector brackets for each pool consecutively
      result.pools.forEach((p) => {
        if (p.isRoundRobin) {
          drawPoolBracketVector(p, `${p.name} Matches & Fixtures`);
          if (result.gameType === 'cricket') {
            drawPoolStandingsPage(p);
          }
        } else {
          drawPoolBracketVector(p, p.name);
        }
      });

      // Also draw the championship stage finals
      if (result.finalsPool) {
        drawPoolBracketVector(result.finalsPool, "Championship Stage Finals");
      }

      // Add second page: Detailed Matches Schedule List (printer friendly off-white sheet)
      doc.addPage('landscape');

      // Clear white page
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Border frame
      doc.setDrawColor(226, 232, 240);
      doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

      // Title header
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42); // slate-900
      const ledgerTitle = result.fixtureName ? `${result.fixtureName.toUpperCase()} - SCHEDULE LEDGER` : 'MATCH SCHEDULE & FIXTURE LEDGER';
      doc.text(ledgerTitle, 24, 38);

      doc.setFont(pdfFont, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105); // slate-600
      let pitchLabel = result.gameType === 'cricket' ? 'Pitches' : result.gameType === 'carrom' ? 'Boards' : 'Chess Tables';
      doc.text(`Official high-accuracy schedule book detailing match times, day metrics, active ${pitchLabel}, and referee declarations.`, 24, 50);

      // Elegant, compact, and centered table metrics to avoid horizontal cutoff on any landscape PDF
      const tableLeft = 40;
      const tableWidth = pageWidth - 80; // Symmetrical margins of 40px (40px left, 40px right)
      
      const colX1 = tableLeft + 8;                 // STAGE / POOL
      const colX2 = tableLeft + tableWidth * 0.15; // MATCHUP TEAMS
      const colX3 = tableLeft + tableWidth * 0.44; // SCHEDULE TIME
      const colX4 = tableLeft + tableWidth * 0.70; // ALLOCATED ARENA
      const colX5 = tableLeft + tableWidth * 0.84; // STATUS / OUTCOME

      // Spacious Table Header row in Slate deep slate
      doc.setFillColor(15, 23, 42); // slate-900 heading block
      doc.rect(tableLeft, 60, tableWidth, 22, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont(pdfFont, 'bold');
      doc.setFontSize(8.5);
      doc.text('STAGE / POOL', colX1, 74);
      doc.text('MATCHUP TEAMS', colX2, 74);
      doc.text('SCHEDULE TIME', colX3, 74);
      doc.text('ALLOCATED ARENA', colX4, 74);
      doc.text('STATUS / OUTCOME', colX5, 74);

      // We implement generous spacing ("give some space between two match so user can easy read")
      // rowY will increment by 34px (instead of 15px), offering incredible breathing room.
      let rowY = 96;
      doc.setTextColor(51, 65, 85); // slate-700
      doc.setFont(pdfFont, 'normal');

      flatMatches.forEach((match, idx) => {
        // Handle precise page breaks based on the taller row spacing (A4 height is 595.28 points)
        if (rowY > pageHeight - 50) {
          doc.addPage('landscape');
          
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          
          doc.setDrawColor(226, 232, 240);
          doc.rect(14, 14, pageWidth - 28, pageHeight - 28);

          // Header
          doc.setFillColor(15, 23, 42);
          doc.rect(tableLeft, 25, tableWidth, 22, 'F');

          doc.setTextColor(255, 255, 255);
          doc.setFont(pdfFont, 'bold');
          doc.setFontSize(8.5);
          doc.text('STAGE / POOL', colX1, 39);
          doc.text('MATCHUP TEAMS', colX2, 39);
          doc.text('SCHEDULE TIME', colX3, 39);
          doc.text('ALLOCATED ARENA', colX4, 39);
          doc.text('STATUS / OUTCOME', colX5, 39);

          rowY = 61;
          doc.setTextColor(51, 65, 85);
          doc.setFont(pdfFont, 'normal');
        }

        // Draw Zebra comfort strip rect inside the ledger with generous height of 26px
        const isEvenRow = idx % 2 === 0;
        if (isEvenRow) {
          doc.setFillColor(248, 250, 252); // slate-50 soft zebra row background
          doc.rect(tableLeft, rowY - 14, tableWidth, 26, 'F');
        } else {
          // Subtle border lines separating matches to make them extremely isolated and readable
          doc.setDrawColor(241, 245, 249); // slate-100 line
          doc.setLineWidth(0.5);
          doc.line(tableLeft, rowY - 14, tableLeft + tableWidth, rowY - 14);
          doc.line(tableLeft, rowY + 12, tableLeft + tableWidth, rowY + 12);
        }

        // 1) Column STAGE / POOL
        doc.setTextColor(30, 41, 59); // slate-800
        doc.setFont(pdfFont, 'bold');
        doc.setFontSize(8);
        doc.text(match.poolName || 'Qualifiers', colX1, rowY + 2);

        // 2) Column MATCHUP TEAMS
        doc.setFontStyle ? doc.setFontStyle('normal') : doc.setFont(pdfFont, 'normal');
        doc.setTextColor(15, 23, 42); // deep black

        const sideA = declaredWinners[match.prevMatchAId || ''] || match.teamA;
        const sideB = declaredWinners[match.prevMatchBId || ''] || match.teamB;
        const matchupLabel = `${sideA}   vs   ${sideB}`;
        let matchupFontSize = 8;
        doc.setFontSize(matchupFontSize);
        const maxMatchupWidth = colX3 - colX2 - 6;
        while (matchupFontSize > 4.5 && (doc.getTextWidth ? doc.getTextWidth(matchupLabel) : (matchupLabel.length * matchupFontSize * 0.5)) > maxMatchupWidth) {
          matchupFontSize -= 0.3;
          doc.setFontSize(matchupFontSize);
        }
        doc.text(matchupLabel, colX2, rowY + 2);

        // 3) Column SCHEDULE TIME (with day details)
        doc.setTextColor(51, 65, 85);
        const isSinglePool = result.pools.length === 1;
        const isWholeTournamentFinal =
          (match.poolId === 'finals' && match.roundIndex === result.finalsPool.rounds.length - 1) ||
          (isSinglePool && result.pools[0] && match.poolId === result.pools[0].id && !result.pools[0].isRoundRobin && match.roundIndex === result.pools[0].rounds.length - 1);

        const isFinalTimeEmpty = !match.scheduledTime || match.scheduledTime.split(', ').length === 2;

        if (match.isWalkover) {
          doc.setFont(pdfFont, 'bold');
          doc.setTextColor(100, 116, 139);
          doc.text('BYE Bypass (Instant)', colX3, rowY + 2);
          doc.setFont(pdfFont, 'normal');
        } else if (isWholeTournamentFinal) {
          doc.setFont(pdfFont, 'bold');
          doc.setTextColor(249, 115, 22); // orange-500
          let dayDisplay = match.dayNumber ? `Day ${match.dayNumber}` : 'Day ?';
          let dateDisplay = '';
          if (match.scheduledTime) {
            const parts = match.scheduledTime.split(', ');
            if (parts.length >= 2) {
              dateDisplay = `, ${parts[0]}, ${parts[1]}`;
            } else {
              dateDisplay = `, ${match.scheduledTime}`;
            }
          }
          doc.text(`${dayDisplay}${dateDisplay}`, colX3, rowY + 2);
          doc.setFont(pdfFont, 'normal');
        } else {
          // Explicit detailed time segment
          let timeSegment = match.scheduledTime || '';
          if (match.endTime) {
            // Cutoff end details of timestamp and make it look clean like "Day 1, 10:30 AM - 11:30 AM"
            if (timeSegment.includes(' - ')) {
              timeSegment = timeSegment.split(' - ')[0];
            }
            timeSegment = `${timeSegment} - ${match.endTime}`;
          }
          doc.text(timeSegment.substring(0, 38), colX3, rowY + 2);
        }

        // 4) Column ALLOCATED ARENA (ground / board / table)
        doc.setTextColor(15, 23, 42);
        doc.setFont(pdfFont, 'bold');
        if (match.isWalkover) {
          doc.setTextColor(148, 163, 184);
          doc.text('Not Required', colX4, rowY + 2);
        } else if (isWholeTournamentFinal && !match.courtNumber) {
          doc.setTextColor(148, 163, 184);
          doc.text('Not Required', colX4, rowY + 2);
        } else {
          let arenaLabel = '';
          if (match.courtNumber) {
            if (result.gameType === 'cricket') {
              arenaLabel = `Ground ${match.courtNumber}`;
            } else if (result.gameType === 'carrom') {
              arenaLabel = `Board ${match.courtNumber}`;
            } else {
              arenaLabel = `Table ${match.courtNumber}`;
            }
          } else {
            if (result.gameType === 'cricket') {
              arenaLabel = 'Ground Open';
            } else if (result.gameType === 'carrom') {
              arenaLabel = 'Board Open';
            } else {
              arenaLabel = 'Table Open';
            }
          }
          doc.text(arenaLabel, colX4, rowY + 2);
        }

        // 5) Column STATUS / OUTCOME (with green bold highlight for easy reading)
        const win = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);
        if (win) {
          doc.setTextColor(22, 163, 74); // emerald-600
          doc.setFont(pdfFont, 'bold');
          
          const winLabelText = `${win} (Won)`;
          let winFontSize = 8;
          doc.setFontSize(winFontSize);
          const maxWinWidth = tableLeft + tableWidth - colX5 - 4;
          while (winFontSize > 4.5 && (doc.getTextWidth ? doc.getTextWidth(winLabelText) : (winLabelText.length * winFontSize * 0.5)) > maxWinWidth) {
            winFontSize -= 0.3;
            doc.setFontSize(winFontSize);
          }
          doc.text(winLabelText, colX5, rowY + 2);
        } else {
          doc.setTextColor(148, 163, 184); // slate-400
          doc.setFont(pdfFont, 'italic');
          doc.text('Pending Match', colX5, rowY + 2);
        }

        // Move to next row coordinate using 32px of spacing
        rowY += 32;
      });

      const downloadFilename = result.fixtureName ? `${result.fixtureName}.pdf` : `glory_grid_${selectedGame}_tourney_report.pdf`;
      doc.save(downloadFilename);
      }
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setIsExporting(false);
    }
  };
  // Triggered when match scores and overs are updated
  const handleUpdateMatchScores = (
    matchId: string,
    runsScoredA: number | undefined,
    oversFacedA: number | undefined,
    runsScoredB: number | undefined,
    oversFacedB: number | undefined
  ) => {
    if (!result) return;
    setResult(prev => {
      if (!prev) return null;
      const copy = { ...prev };
      
      // We look for matchId in all pools
      let found = false;
      copy.pools = copy.pools.map(pool => {
        return {
          ...pool,
          rounds: pool.rounds.map(round => {
            return round.map(match => {
              if (match.id === matchId) {
                found = true;
                const updatedMatch = {
                  ...match,
                  runsScoredA,
                  oversFacedA,
                  runsScoredB,
                  oversFacedB,
                };
                return updatedMatch;
              }
              return match;
            });
          }),
        };
      });

      if (!found && copy.finalsPool) {
        copy.finalsPool = {
          ...copy.finalsPool,
          rounds: copy.finalsPool.rounds.map(round => {
            return round.map(match => {
              if (match.id === matchId) {
                return {
                  ...match,
                  runsScoredA,
                  oversFacedA,
                  runsScoredB,
                  oversFacedB,
                };
              }
              return match;
            });
          }),
        };
      }

      // Also auto declare the winner if scores are complete and unequal
      if (runsScoredA !== undefined && runsScoredB !== undefined && runsScoredA !== runsScoredB) {
        // Find match in flat schedule to get team names
        const allM = [...(copy.pools.flatMap(p => p.rounds.flat())), ...(copy.finalsPool?.rounds.flat() || [])];
        const matchOfInt = allM.find(m => m.id === matchId);
        if (matchOfInt) {
          const winnerTeam = runsScoredA > runsScoredB ? matchOfInt.teamA : matchOfInt.teamB;
          setDeclaredWinners(prevWinners => {
            const winnersCopy = { ...prevWinners };
            winnersCopy[matchId] = winnerTeam;
            
            // Re-run downstream propagation with the new copy of result
            try {
              const allPoolsSeq = [...copy.pools, copy.finalsPool].filter(Boolean);
              
              const getFallbackPlaceholderLocal = (prevMatchId: string, currentPoolId: string): string => {
                if (currentPoolId === 'finals') {
                  if (prevMatchId.startsWith('finals-')) {
                    const pIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
                    const round0Length = copy.finalsPool?.rounds[0]?.length || 0;
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
                    const sourcePool = copy.pools?.find(p => p.id === poolId);
                    if (sourcePool) {
                      return `Winner of ${sourcePool.name}`;
                    }
                  }
                }
                const prevMatchIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
                return `Winner of M${prevMatchIdx}`;
              };

              allPoolsSeq.forEach(pool => {
                if (!pool || !pool.rounds) return;
                pool.rounds.forEach((roundMatches) => {
                  if (!roundMatches) return;
                  roundMatches.forEach(match => {
                    if (!match) return;
                    if (match.prevMatchAId) {
                      const winnerA = winnersCopy[match.prevMatchAId];
                      if (winnerA) {
                        match.teamA = winnerA;
                      } else {
                        match.teamA = getFallbackPlaceholderLocal(match.prevMatchAId, pool.id);
                      }
                    }
                    if (match.prevMatchBId) {
                      const winnerB = winnersCopy[match.prevMatchBId];
                      if (winnerB) {
                        match.teamB = winnerB;
                      } else {
                        match.teamB = getFallbackPlaceholderLocal(match.prevMatchBId, pool.id);
                      }
                    }
                    if (match.teamA === 'BYE') {
                      match.isWalkover = true;
                      match.winner = match.teamB;
                      winnersCopy[match.id] = match.teamB;
                    } else if (match.teamB === 'BYE') {
                      match.isWalkover = true;
                      match.winner = match.teamA;
                      winnersCopy[match.id] = match.teamA;
                    } else {
                      const curWinVal = winnersCopy[match.id];
                      if (curWinVal && curWinVal !== match.teamA && curWinVal !== match.teamB) {
                        delete winnersCopy[match.id];
                      }
                    }
                  });
                });
              });

              // Final pool candidate update during propagation
              copy.pools.forEach((pool, pIdx) => {
                if (!pool) return;
                let poolWinner: string | null = null;
                if (pool.isRoundRobin) {
                  poolWinner = winnersCopy[`${pool.id}-winner`] || null;
                } else if (pool.rounds && pool.rounds.length > 0) {
                  const poolFinalMatch = pool.rounds[pool.rounds.length - 1]?.[0];
                  if (poolFinalMatch) {
                    poolWinner = winnersCopy[poolFinalMatch.id] || (poolFinalMatch.isWalkover ? poolFinalMatch.winner : null);
                  }
                }
                const finalistPlaceholder = `Winner of ${pool.name}`;
                const newFinalistName = poolWinner || finalistPlaceholder;

                if (copy.finalsPool && copy.finalsPool.teams) {
                  const oldName = copy.finalsPool.teams[pIdx];
                  copy.finalsPool.teams[pIdx] = newFinalistName;

                  copy.finalsPool.rounds[0]?.forEach(fMatch => {
                    if (fMatch.teamA === oldName || (fMatch.teamA === finalistPlaceholder && poolWinner)) {
                      fMatch.teamA = newFinalistName;
                    }
                    if (fMatch.teamB === oldName || (fMatch.teamB === finalistPlaceholder && poolWinner)) {
                      fMatch.teamB = newFinalistName;
                    }
                  });
                }
              });
            } catch (err) {
              console.error("Propagation error inside state updater:", err);
            }

            return winnersCopy;
          });
        }
      }

      return copy;
    });
  };

  // Custom interactive schedule customizer
  const handleSaveSchedule = (
    matchId: string,
    dayNum: number | undefined,
    startTimeStr: string,
    endTimeStr: string,
    courtNum: number | undefined,
    useTimeSlot: boolean
  ) => {
    if (!result) return;
    
    // Compute scheduledTime and endTime
    let newScheduledTime: string | null = null;
    let newEndTime: string | null = null;
    
    if (dayNum !== undefined) {
      const baseDate = result.startDate ? new Date(result.startDate) : new Date();
      const targetDate = new Date(baseDate);
      targetDate.setDate(targetDate.getDate() + (dayNum - 1));
      const dayStr = targetDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      }); // e.g. "Sat, May 30"
      
      if (useTimeSlot) {
        newScheduledTime = `${dayStr}, ${to12Hour(startTimeStr)}`;
        newEndTime = to12Hour(endTimeStr);
      } else {
        newScheduledTime = dayStr; // Day & Date only! No exact clock time.
        newEndTime = null;
      }
    } else {
      newScheduledTime = null;
      newEndTime = null;
    }
    
    setResult(prev => {
      if (!prev) return null;
      const copy = { ...prev };
      
      let found = false;
      copy.pools = copy.pools.map(pool => {
        return {
          ...pool,
          rounds: pool.rounds.map(round => {
            return round.map(match => {
              if (match.id === matchId) {
                found = true;
                return {
                  ...match,
                  dayNumber: dayNum,
                  courtNumber: courtNum,
                  scheduledTime: newScheduledTime,
                  endTime: newEndTime,
                };
              }
              return match;
            });
          }),
        };
      });

      if (!found && copy.finalsPool) {
        copy.finalsPool = {
          ...copy.finalsPool,
          rounds: copy.finalsPool.rounds.map(round => {
            return round.map(match => {
              if (match.id === matchId) {
                return {
                  ...match,
                  dayNumber: dayNum,
                  courtNumber: courtNum,
                  scheduledTime: newScheduledTime,
                  endTime: newEndTime,
                };
              }
              return match;
            });
          }),
        };
      }
      
      return copy;
    });
    
    setEditingScheduleMatch(null);
  };

  // Triggered when a match winner gets chosen
  const handleDeclareWinner = (matchId: string, winnerName: string) => {
    setDeclaredWinners(prev => {
      const copy = { ...prev };
      
      // If already winner, clicking again toggles / clears it
      if (copy[matchId] === winnerName) {
        delete copy[matchId];
      } else {
        copy[matchId] = winnerName;
      }

      // Propagate outcomes recursively downstream to keep the bracket authentic!
      // This is a premium simulator feature.
      propagateWinnersDownstream(copy);

      return copy;
    });
  };

  // Helper: propagate outcomes sequentially to dynamic downstream slots
  const propagateWinnersDownstream = (winnersMap: Record<string, string>) => {
    if (!result) return;
    try {
       const getFallbackPlaceholder = (prevMatchId: string, currentPoolId: string): string => {
        if (currentPoolId === 'finals') {
          if (prevMatchId.startsWith('finals-')) {
            const pIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
            const round0Length = result.finalsPool?.rounds[0]?.length || 0;
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
            const sourcePool = result.pools?.find(p => p.id === poolId);
            if (sourcePool) {
              return `Winner of ${sourcePool.name}`;
            }
          }
        }
        const prevMatchIdx = parseInt(prevMatchId.split('-M')[1] || '0') + 1;
        return `Winner of M${prevMatchIdx}`;
      };

      // We scan pools and finals sequentially so that Round 0 choices ripple into Round 1, etc.
      const allPools = [...result.pools, result.finalsPool];
      if (result.championshipPlayoffsPool) {
        allPools.push(result.championshipPlayoffsPool);
      }

      allPools.forEach(pool => {
        if (!pool || !pool.rounds) return;
        pool.rounds.forEach((roundMatches, rIdx) => {
          if (!roundMatches) return;
          roundMatches.forEach(match => {
            if (!match) return;
            // If a match depends on parents:
            if (match.prevMatchAId) {
              const winnerA = winnersMap[match.prevMatchAId];
              if (winnerA) {
                match.teamA = winnerA;
              } else {
                match.teamA = getFallbackPlaceholder(match.prevMatchAId, pool.id);
              }
            }

            if (match.prevMatchBId) {
              const winnerB = winnersMap[match.prevMatchBId];
              if (winnerB) {
                match.teamB = winnerB;
              } else {
                match.teamB = getFallbackPlaceholder(match.prevMatchBId, pool.id);
              }
            }

            // Walkover check: If child is now a walkover (e.g. one slot is BYE and is resolved), set winner
            if (match.teamA === 'BYE') {
              match.isWalkover = true;
              match.winner = match.teamB;
              winnersMap[match.id] = match.teamB;
            } else if (match.teamB === 'BYE') {
              match.isWalkover = true;
              match.winner = match.teamA;
              winnersMap[match.id] = match.teamA;
            } else {
              // Note: If teamA or teamB names changed and the user had declared a different winner previously,
              // we should void the child winner if it doesn't match either of the parent names anymore.
              const curWin = winnersMap[match.id];
              if (curWin && curWin !== match.teamA && curWin !== match.teamB) {
                delete winnersMap[match.id];
              }
            }
          });
        });
      });

      // Also populate Finals Pool initial candidates dynamically as other pool Finals/Standings declare!
      let finalTeamsOffset = 0;
      const promoteCount = result.teamsToPromotePerPool || 1;

      result.pools.forEach((pool) => {
        if (!pool) return;

        // Calculate standings for this pool to rank them correctly
        const standings = calculateCricketStandings(pool, winnersMap);

        for (let rankIndex = 0; rankIndex < promoteCount; rankIndex++) {
          const pSlotIndex = finalTeamsOffset + rankIndex;

          let placeholder = `Winner of ${pool.name}`;
          if (promoteCount === 2) {
            placeholder = rankIndex === 0 ? `Winner of ${pool.name}` : `Runner-up of ${pool.name}`;
          } else if (promoteCount > 2) {
            const labelSuffix = rankIndex === 0 ? 'st' : rankIndex === 1 ? 'nd' : rankIndex === 2 ? 'rd' : 'th';
            placeholder = `${rankIndex + 1}${labelSuffix} of ${pool.name}`;
          }

          // Determine the actual team occupying this rank
          const rankedTeam = standings[rankIndex];
          const actualName = rankedTeam ? rankedTeam.name : placeholder;

          if (result.finalsPool && result.finalsPool.teams && pSlotIndex < result.finalsPool.teams.length) {
            const oldName = result.finalsPool.teams[pSlotIndex];
            result.finalsPool.teams[pSlotIndex] = actualName;

            // Traverse finals pool Round 0 matches and update matched slots
            result.finalsPool.rounds[0]?.forEach(fMatch => {
              if (fMatch.teamA === oldName || (fMatch.teamA === placeholder && rankedTeam)) {
                fMatch.teamA = actualName;
              }
              if (fMatch.teamB === oldName || (fMatch.teamB === placeholder && rankedTeam)) {
                fMatch.teamB = actualName;
              }
            });
          }
        }
        finalTeamsOffset += promoteCount;
      });
    } catch (err) {
      console.error("Error in propagateWinnersDownstream:", err);
    }
  };

  // Check if a Grand Champion exists by polling the finals mini-tournament final round
  const getGrandChampion = (): string | null => {
    if (!result) return null;

    // Check custom championship playoff bracket winner first if it is active
    if (result.championshipPlayoffsPool && result.championshipPlayoffsPool.rounds.length > 0) {
      const pRounds = result.championshipPlayoffsPool.rounds;
      const lastRoundIndex = pRounds.length - 1;
      const grandFinalMatch = pRounds[lastRoundIndex]?.[0];
      if (grandFinalMatch) {
        const winner = declaredWinners[grandFinalMatch.id];
        if (winner && winner !== 'BYE' && !winner.startsWith('Winner of')) {
          return winner;
        }
      }
    }

    if (result.finalsPool.rounds.length === 0) return null;
    const finalsRounds = result.finalsPool.rounds;
    const finalRoundIndex = finalsRounds.length - 1;
    const grandFinalMatch = finalsRounds[finalRoundIndex]?.[0];
    if (!grandFinalMatch) return null;

    const winner = declaredWinners[grandFinalMatch.id];
    if (winner && winner !== 'BYE' && !winner.startsWith('Winner of')) {
      return winner;
    }
    return null;
  };

  const champion = getGrandChampion();

  // Reset to initial page state
  const handleReset = () => {
    setDeclaredWinners({});
    setActiveTournamentId(null);
    setResult(null);
    setViewState('home');
  };

  // Back from form to choose games
  const handleFormBack = () => {
    setViewState('home');
  };

  // Handle sport click
  const handleSelectGame = (game: GameType) => {
    setSelectedGame(game);
    setViewState('form');
  };

  // Callback from setup screen
  const handleGenerate = (data: TournamentResult) => {
    const formattedDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    
    const newId = `tour-${Date.now()}`;
    const gameLabel = data.gameType === 'cricket' ? 'Cricket Pool Tournament' : data.gameType === 'carrom' ? 'Carrom Board Challenge' : 'Chess Grandmaster League';
    const tourName = data.fixtureName || `${gameLabel} (${data.totalParticipants} Players${data.isDoubles ? ' - Doubles' : ''})`;

    const newSaved: SavedTournament = {
      id: newId,
      name: tourName,
      createdDate: formattedDate,
      result: data,
      declaredWinners: {},
      selectedGame: selectedGame,
      endDate: data.endDate
    };

    setSavedTournaments(prev => [newSaved, ...prev]);
    setActiveTournamentId(newId);
    setResult(data);
    setDeclaredWinners({}); // Refresh winners map
    setViewState('loading');
  };

  const handleLoadSavedTournament = (saved: SavedTournament) => {
    setActiveTournamentId(saved.id);
    setResult(saved.result);
    setDeclaredWinners(saved.declaredWinners);
    setSelectedGame(saved.selectedGame);
    setViewState('results');
  };

  const handleDeleteSavedTournament = (savedId: string) => {
    setSavedTournaments(prev => prev.filter(t => t.id !== savedId));
    if (activeTournamentId === savedId) {
      setActiveTournamentId(null);
      setResult(null);
      setDeclaredWinners({});
    }
  };

  const handleClearAllTournaments = () => {
    if (window.confirm("Are you sure you want to clear your entire tournament history? This cannot be undone.")) {
      setSavedTournaments([]);
      setActiveTournamentId(null);
      setResult(null);
      setDeclaredWinners({});
    }
  };

  // Callback from loading state finishing
  const handleLoadingFinish = () => {
    try {
      // Prime the walkovers immediately so that byes advance prior to showing results
      const initialWinners: Record<string, string> = {};
      if (result) {
        const allPools = [...result.pools, result.finalsPool];
        allPools.forEach(pool => {
          if (pool && pool.rounds) {
            pool.rounds.forEach(round => {
              if (round) {
                round.forEach(match => {
                  if (match && match.isWalkover && match.winner) {
                    initialWinners[match.id] = match.winner;
                  }
                });
              }
            });
          }
        });
        // Propagate initial byes downstream
        propagateWinnersDownstream(initialWinners);
        setDeclaredWinners(initialWinners);
      }
    } catch (err) {
      console.error("Error in handleLoadingFinish background priming:", err);
    } finally {
      setViewState('results');
    }
  };

  // Build a flat, time-ordered list of ALL matches for the Schedule log
  const getFlatChronologicalMatches = (): Match[] => {
    if (!result) return [];
    const flat: Match[] = [];
    result.pools.forEach(p => {
      p.rounds.forEach(rnd => flat.push(...rnd));
    });
    result.finalsPool.rounds.forEach(rnd => flat.push(...rnd));

    // Sort by: walkover first? Actually real matches sorted by schedule, walkovers grouped as instantaneous
    return flat.sort((a, b) => {
      if (a.isWalkover && !b.isWalkover) return 1;
      if (!a.isWalkover && b.isWalkover) return -1;
      if (a.isWalkover && b.isWalkover) return 0;
      
      // Parse dates for accurate sorting
      const dateA = a.scheduledTime ? new Date(a.scheduledTime.split(' (')[0]).getTime() : Infinity;
      const dateB = b.scheduledTime ? new Date(b.scheduledTime.split(' (')[0]).getTime() : Infinity;
      return dateA - dateB;
    });
  };

  const flatMatches = getFlatChronologicalMatches();

  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col justify-between overflow-x-hidden bg-slate-950 font-sans">
      {/* 3D Decorative Background Elements from Glory Grid Theme */}
      <div className="absolute top-10 right-10 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-20 left-10 w-128 h-128 bg-blue-600/5 rounded-full blur-[140px] pointer-events-none z-0"></div>

      {/* Top Navigation Bar from Glory Grid Theme */}
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 md:px-8 z-50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20">G</div>
          <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            GLORY GRID
          </span>
        </div>
        <div className="flex gap-4 md:gap-6 text-[10px] md:text-xs font-mono uppercase tracking-wider font-bold">
          <button 
            type="button"
            onClick={() => {
              setViewState('home');
            }}
            className={`transition-colors cursor-pointer ${viewState === 'home' ? 'text-white border-b-2 border-blue-500 pb-5 pt-5' : 'text-slate-400 hover:text-white pb-5 pt-5'}`}
          >
            Dashboard
          </button>
          <button 
            type="button"
            onClick={() => { setViewState('form'); }}
            className={`transition-colors ${viewState === 'form' ? 'text-white border-b-2 border-blue-500 pb-5 pt-5' : 'text-slate-400 hover:text-white pb-5 pt-5'} cursor-pointer`}
          >
            Tournament Config
          </button>
          <button 
            type="button"
            onClick={() => { if (result) setViewState('results'); }}
            disabled={!result}
            className={`transition-colors ${!result ? 'text-slate-600 cursor-not-allowed pb-5 pt-5' : viewState === 'results' ? 'text-white border-b-2 border-blue-500 pb-5 pt-5' : 'text-slate-400 hover:text-white pb-5 pt-5'} cursor-pointer`}
          >
            Live Brackets
          </button>
          <button 
            type="button"
            onClick={() => { setShowHelp(true); }}
            className={`transition-colors ${showHelp ? 'text-white border-b-2 border-indigo-500 pb-5 pt-5' : 'text-slate-400 hover:text-white pb-5 pt-5'} cursor-pointer flex items-center gap-1`}
          >
            <span>Help Center</span>
            <span className="text-indigo-400 animate-pulse">💡</span>
          </button>
        </div>
        <div className="flex items-center gap-4">
          {/* Server Time has been removed for crisp aesthetic polish */}
        </div>
      </nav>

      {/* Visual Canvas Backdrop */}
      <ThreeDBackground gameType={viewState === 'home' ? 'home' : selectedGame} />

      {/* Main Core Body */}
      <main className="flex-1 w-full max-w-7xl mx-auto py-12 px-4 relative z-10 flex flex-col">
        <AnimatePresence mode="wait">
          {viewState === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              <HomeView
                onSelectGame={handleSelectGame}
                savedTournaments={savedTournaments}
                activeTournamentId={activeTournamentId}
                onLoadTournament={handleLoadSavedTournament}
                onDeleteTournament={handleDeleteSavedTournament}
                onClearAllTournaments={handleClearAllTournaments}
                onOpenHelp={() => setShowHelp(true)}
              />
            </motion.div>
          )}

          {viewState === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
            >
              <GameFormView
                gameType={selectedGame}
                onBack={handleFormBack}
                onGenerate={handleGenerate}
              />
            </motion.div>
          )}

          {viewState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <LoadingView gameType={selectedGame} onFinish={handleLoadingFinish} />
            </motion.div>
          )}

          {viewState === 'results' && result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
              {/* Grand Champion Celebration Card in Glory Grid Professional style */}
              {champion && (
                <motion.div
                  initial={{ opacity: 0, y: -30, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="bg-gradient-to-br from-indigo-950/50 via-slate-900/40 to-slate-950 border border-indigo-500/30 rounded-3xl p-8 hover:shadow-indigo-500/10 shadow-2xl text-center relative overflow-hidden backdrop-blur-xl"
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-pulse" />
                  
                  {/* Outer floating decorative asset */}
                  <div className="absolute -top-12 -right-12 opacity-5 text-indigo-400 pointer-events-none">
                    <div className="w-56 h-56 border-8 border-indigo-500/30 rounded-full rotate-45"></div>
                  </div>
                  
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center border border-white/20 mx-auto mb-4">
                    <Trophy className="text-yellow-500 animate-bounce" size={32} />
                  </div>
                  <span className="text-xs font-mono font-black tracking-widest text-indigo-400 uppercase">
                    🏆 GRAND CHAMPIONSHIP WINNER 🏆
                  </span>
                  <div className="h-[1.5px] w-48 bg-indigo-500/20 mx-auto my-3"></div>
                  <h2 className="text-3xl md:text-5xl font-black text-white mt-1 tracking-tight">
                    {champion.toUpperCase()}
                  </h2>
                  <p className="text-slate-400 text-xs font-mono mt-3 max-w-sm mx-auto uppercase">
                    Determined with perfect operational precision on the primary Glory Grid arena
                  </p>
                </motion.div>
              )}

              {/* Google Docs Export Success Banner */}
              {googleDocUrl && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 rounded-xl bg-blue-950/80 border border-blue-800/60 text-xs text-blue-200 flex flex-wrap items-center justify-between gap-3 shadow-lg backdrop-blur-md"
                  id="google-docs-success-banner"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles size={16} className="text-amber-400 shrink-0" />
                    <div>
                      <span className="font-bold text-white">Google Document Generated Successfully!</span>
                      <p className="mt-0.5 text-slate-300 text-[11px]">Your sports tournament ledger has been saved securely to Google Drive.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={googleDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-500 text-slate-950 hover:brightness-110 font-bold px-3 py-1.5 rounded-lg text-[11px] transition active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-900/30"
                      id="link-open-google-doc"
                    >
                      OPEN GOOGLE DOC <ExternalLink size={11} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setGoogleDocUrl(null)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition cursor-pointer hover:text-white"
                      id="btn-dismiss-google-doc-banner"
                    >
                      Dismiss
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Tournament Summary header indicators */}
              <div className="bg-slate-950/80 rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden backdrop-blur-md">
                <div>
                  <span className="text-xs font-mono text-indigo-400 tracking-wider uppercase">
                    {result.fixtureName ? "ARENA BRACKET DASHBOARD" : "GENERATION COMPLETED"}
                  </span>
                  <h1 className="text-3xl font-black text-white tracking-tight mt-1">
                    {result.fixtureName || "Arena Bracket Dashboard"}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                    <p className="text-slate-400 text-xs font-mono uppercase">
                      Discipline: {selectedGame} • Teams: {result.totalParticipants} • Pools: {result.poolsCount}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10.5px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-emerald-400 font-mono font-medium tracking-wide uppercase">
                      💾 SAVED ON THIS DEVICE
                    </span>
                  </div>
                </div>

                {/* Sub toggle controls */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex">
                    <button
                      type="button"
                      onClick={() => setResultsSection('bracket')}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        resultsSection === 'bracket' ? 'bg-indigo-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <TreeDeciduous size={13} /> BRACKET MAPS
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultsSection('list')}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        resultsSection === 'list' ? 'bg-indigo-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <List size={13} /> SCHEDULE LOG
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isExporting}
                    className={`inline-flex items-center gap-1.5 rounded-xl border py-3 px-4 text-xs font-mono font-bold transition cursor-pointer ${
                      isExporting 
                        ? 'bg-slate-950 border-slate-850 text-slate-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-slate-950 hover:brightness-110 shadow-md shadow-emerald-950/20'
                    }`}
                    id="btn-download-pdf"
                  >
                    <FileDown size={14} className={isExporting ? 'animate-pulse' : ''} />
                    {isExporting ? 'EXPORTING...' : 'DOWNLOAD PDF'}
                  </button>



                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl border border-slate-800 py-3 px-4 text-xs font-mono font-bold transition cursor-pointer"
                    id="btn-restart"
                  >
                    <RotateCcw size={14} /> NEW DRAFT
                  </button>
                </div>
              </div>

              {/* Authed User context indicator */}
              {googleUser && (
                <div className="flex items-center gap-2 text-[10.5px] font-mono text-slate-400 mt-2 bg-slate-900/40 px-3 py-1.5 rounded-lg border border-slate-850 w-fit">
                  <span>Google Account: <b className="text-emerald-400">{googleUser.email}</b></span>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="text-red-400 hover:text-red-300 underline font-bold cursor-pointer transition text-[10px]"
                    id="btn-google-signout"
                  >
                    Sign out
                  </button>
                </div>
              )}

              {/* Main displays switcher */}
              <div>
                {resultsSection === 'bracket' ? (
                  <BracketRenderer
                    gameType={selectedGame}
                    pools={result.pools}
                    finalsPool={result.finalsPool}
                    declaredWinners={declaredWinners}
                    onDeclareWinner={handleDeclareWinner}
                    teamsToPromotePerPool={result.teamsToPromotePerPool}
                    isDoubles={result.isDoubles}
                    onUpdateMatchScores={handleUpdateMatchScores}
                    onEditSchedule={setEditingScheduleMatch}
                    championshipPlayoffsPool={result.championshipPlayoffsPool}
                    onUpdatePlayoffsPool={(pPool) => {
                      setResult(prev => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          championshipPlayoffsPool: pPool
                        };
                      });
                      if (pPool) {
                        setDeclaredWinners(prev => {
                          const copy = { ...prev };
                          pPool.rounds.forEach(round => {
                            round.forEach(match => {
                              if (match.isWalkover && match.winner) {
                                copy[match.id] = match.winner;
                              }
                            });
                          });
                          propagateWinnersDownstream(copy);
                          return copy;
                        });
                      } else {
                        setDeclaredWinners(prev => {
                          const copy = { ...prev };
                          Object.keys(copy).forEach(key => {
                            if (key.startsWith('playoffs-')) {
                              delete copy[key];
                            }
                          });
                          propagateWinnersDownstream(copy);
                          return copy;
                        });
                      }
                    }}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-950/80 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl relative overflow-hidden backdrop-blur-md"
                  >
                    {/* Background Light Glow */}
                    <div className="absolute top-0 right-0 w-64 h-64 opacity-5 blur-3xl rounded-full bg-indigo-500" />

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div>
                        <span className="text-xs font-mono text-indigo-400 tracking-wider uppercase">LEDGER DATA</span>
                        <h2 className="text-2xl font-black text-white mt-1">Chronological Match Schedule</h2>
                      </div>
                      
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <Calendar size={13} className="text-indigo-400" /> Matches: {flatMatches.length} Real Rounds
                      </div>
                    </div>

                    {/* Unbound matches danger banner */}
                    {result.unboundMatchesCount > 0 && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex gap-3 text-rose-300 text-xs font-mono mb-6 items-start">
                        <AlertTriangle className="shrink-0 mt-0.5 text-rose-400" size={16} />
                        <div>
                          <strong>TIMELINE OVERFLOW WARNING:</strong> {result.unboundMatchesCount} matches exceeded the configured operational active Day hours. They have been scheduled safely inside extended overflow buffers at the end of the day. Recommend increasing the tournament Days or lengthening daily hours!
                        </div>
                      </div>
                    )}

                    {/* Flat chronological schedule table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm font-mono border-collapse" id="fixtures-table">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                            <th className="py-4 px-4 w-[12%]">DAY</th>
                            <th className="py-4 px-4 w-[16%]">POOL</th>
                            <th className="py-4 px-4 w-[32%]">MATCHUP</th>
                            <th className="py-4 px-4 w-[24%]">SCHEDULE SLOT</th>
                            <th className="py-4 px-4 w-[10%]">RESULT</th>
                            <th className="py-4 px-4 w-[6%] text-center">ACTION</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {flatMatches.map((match, idx) => {
                            const sideA = declaredWinners[match.prevMatchAId || ''] || match.teamA;
                            const sideB = declaredWinners[match.prevMatchBId || ''] || match.teamB;
                            const winner = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);

                            const poolOfMatch = result.pools.find(p => p.id === match.poolId);
                            const isPoolFinal = match.poolId === 'finals'
                              ? match.roundIndex === result.finalsPool.rounds.length - 1
                              : (poolOfMatch && !poolOfMatch.isRoundRobin && match.roundIndex === poolOfMatch.rounds.length - 1);

                            return (
                              <tr key={match.id} className="hover:bg-slate-900/30 transition-colors">
                                <td className="py-4 px-4">
                                  {match.isWalkover ? (
                                    <span className="text-[10px] text-slate-500 font-bold">N/A</span>
                                  ) : (
                                    <span className="inline-flex px-2 py-0.5 rounded bg-slate-900 text-indigo-400 border border-slate-800 text-xs font-black">
                                      DAY {match.dayNumber}
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  <span className="text-slate-400 text-xs uppercase font-bold">
                                    {match.poolName}
                                  </span>
                                  {isPoolFinal && (
                                    <span className="block text-[8px] text-yellow-500 font-black tracking-widest mt-0.5">
                                      🏆 {match.poolId === 'finals' ? 'GRAND FINAL' : 'STAGE FINAL'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  <div className="flex items-center gap-1.5 text-slate-200 text-xs">
                                    <span className={winner === sideA ? 'text-emerald-400 font-black' : ''}>{sideA}</span>
                                    <span className="text-slate-600 font-black text-[9px] uppercase px-1">VS</span>
                                    <span className={winner === sideB ? 'text-emerald-400 font-black' : ''}>{sideB}</span>
                                  </div>
                                </td>
                                <td className="py-4 px-4">
                                  {match.isWalkover ? (
                                    <span className="text-xs text-yellow-500/70 font-semibold italic bg-yellow-500/5 py-1 px-2.5 rounded border border-yellow-500/10">
                                      BYE Bye-pass
                                    </span>
                                  ) : (
                                    (() => {
                                      const isSinglePool = result.pools.length === 1;
                                      const isWholeTournamentFinal =
                                        (match.poolId === 'finals' && match.roundIndex === result.finalsPool.rounds.length - 1) ||
                                        (isSinglePool && result.pools[0] && match.poolId === result.pools[0].id && !result.pools[0].isRoundRobin && match.roundIndex === result.pools[0].rounds.length - 1);

                                      return (
                                        <div className="flex flex-col gap-1">
                                          {isWholeTournamentFinal ? (
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-1.5 text-orange-400 font-mono text-[10px] font-bold uppercase">
                                                <span>🏆 Showdown Finale</span>
                                              </div>
                                              {match.scheduledTime && (
                                                <div className="text-[10px] text-slate-400 font-bold bg-slate-900/60 border border-slate-800/60 px-2 py-0.5 rounded-md w-fit whitespace-nowrap">
                                                  📅 {(() => {
                                                    const parts = match.scheduledTime.split(', ');
                                                    return parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : match.scheduledTime;
                                                  })()}
                                                </div>
                                              )}
                                              {(() => {
                                                const parts = match.scheduledTime ? match.scheduledTime.split(', ') : [];
                                                if (parts.length >= 3) {
                                                  return (
                                                    <div className="flex items-center gap-1.5 text-slate-300 text-[11px] font-mono">
                                                      <Clock size={11} className="text-slate-500" />
                                                      <span>{parts[2]} - {match.endTime}</span>
                                                    </div>
                                                  );
                                                }
                                                return null;
                                              })()}
                                              {match.courtNumber && (
                                                <div className="text-[10px] text-slate-400 font-bold bg-slate-900/60 border border-slate-800/60 px-2 py-0.5 rounded-md w-fit mt-0.5 whitespace-nowrap">
                                                  📍 {result.gameType === 'cricket' ? `Ground ${match.courtNumber}` :
                                                      result.gameType === 'carrom' ? `Board ${match.courtNumber}` :
                                                      `Table ${match.courtNumber}`}
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="flex flex-col gap-1">
                                              <div className="flex items-center gap-1.5 text-slate-300 text-xs">
                                                <Clock size={12} className="text-slate-500" />
                                                <span>{match.scheduledTime ? (
                                                  match.scheduledTime.split(', ').length >= 3 ? match.scheduledTime.split(', ')[2] : 'TBD'
                                                ) : 'TBD'} - {match.endTime || 'TBD'}</span>
                                              </div>
                                              <div className="text-[10.5px] text-slate-400 font-bold bg-slate-900/60 border border-slate-800/60 px-2 py-0.5 rounded-md w-fit mt-0.5 whitespace-nowrap">
                                                📍 {match.courtNumber ? (
                                                  result.gameType === 'cricket' ? `Ground ${match.courtNumber}` :
                                                  result.gameType === 'carrom' ? `Board ${match.courtNumber}` :
                                                  `Table ${match.courtNumber}`
                                                ) : (
                                                  result.gameType === 'cricket' ? 'Ground Open (Flexible)' :
                                                  result.gameType === 'carrom' ? 'Board Open (Flexible)' :
                                                  'Table Open (Flexible)'
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  {winner ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-400 uppercase bg-emerald-500/5 px-2.5 py-1 rounded border border-emerald-500/20">
                                      🏆 {winner.split(' & ')[0]}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 text-xs italic">Pending</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-center">
                                  {!match.isWalkover && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingScheduleMatch(match)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-850 hover:border-slate-700 text-[10px] uppercase font-mono font-black text-indigo-400 hover:text-indigo-200 py-1.5 px-3 transition cursor-pointer shadow-sm"
                                    >
                                      📅 Edit
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Schedule Customization Interactive Modal Overlay */}
          {editingScheduleMatch && result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 text-slate-100"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 border-b border-indigo-900/40 relative">
                  <div className="absolute top-4 right-4">
                    <button
                      type="button"
                      onClick={() => setEditingScheduleMatch(null)}
                      className="text-slate-400 hover:text-white bg-slate-950/50 p-1 px-2.5 rounded-md transition cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-indigo-400 tracking-widest uppercase">MATCH SCHEDULER</span>
                  <h3 className="text-lg font-black text-white mt-1 break-words pr-12">
                    {editingScheduleMatch.teamA} vs {editingScheduleMatch.teamB}
                  </h3>
                </div>

                {/* Body Content */}
                <div className="p-5 space-y-4">
                  {/* Day Picker (1 to n) */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      Match Day Selection
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {/* Option for nothing to write */}
                      <button
                        type="button"
                        onClick={() => setSelectedDayNum(undefined)}
                        className={`py-2 px-1 rounded-lg text-[10.5px] font-mono font-black transition cursor-pointer flex flex-col items-center justify-center border ${
                          selectedDayNum === undefined
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="leading-none text-xs">❌</span>
                        <span className="text-[8px] mt-0.5 whitespace-nowrap">EMPTY</span>
                      </button>

                      {/* Explicit Days */}
                      {Array.from({ length: result.schedules?.length || 1 }).map((_, dIdx) => {
                        const dayVal = dIdx + 1;
                        return (
                          <button
                            key={dayVal}
                            type="button"
                            onClick={() => setSelectedDayNum(dayVal)}
                            className={`py-1.5 rounded-lg text-xs font-mono font-black transition cursor-pointer border ${
                              selectedDayNum === dayVal
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white'
                            }`}
                          >
                            D {dayVal}
                          </button>
                        );
                      })}
                    </div>
                    {selectedDayNum !== undefined && (
                      <div className="text-[10px] text-indigo-400 font-mono italic">
                        📅 Date: {(() => {
                          if (!result.startDate) return `Day ${selectedDayNum}`;
                          try {
                            const parts = result.startDate.split('-').map(Number);
                            if (parts.length === 3) {
                              const year = parts[0];
                              const month = parts[1] - 1;
                              const day = parts[2];
                              const d = new Date(year, month, day);
                              d.setDate(d.getDate() + (selectedDayNum - 1));
                              return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                            }
                          } catch (e) {
                            console.warn("Date error:", e);
                          }
                          return `Day ${selectedDayNum}`;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Operational Time Selectors */}
                  {selectedDayNum !== undefined && (
                    <div className="space-y-2 border-t border-slate-800/60 pt-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                          Exact Match Time
                        </label>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setHasTimeSelection(false)}
                            className={`px-2.5 py-1 rounded-md text-[9.5px] font-mono font-bold transition cursor-pointer border ${
                              !hasTimeSelection
                                ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                                : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            ❌ EMPTY (TBD)
                          </button>
                          <button
                            type="button"
                            onClick={() => setHasTimeSelection(true)}
                            className={`px-2.5 py-1 rounded-md text-[9.5px] font-mono font-bold transition cursor-pointer border ${
                              hasTimeSelection
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            🕒 SPECIFY TIME
                          </button>
                        </div>
                      </div>

                      {hasTimeSelection ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                              Start Time
                            </label>
                            <div className="relative">
                              <input
                                type="time"
                                value={startTimeVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setStartTimeVal(val);
                                  // Auto calculate clean 45 min duration if end time is behind or unconfigured
                                  const [sh, sm] = val.split(':').map(Number);
                                  const [eh, em] = endTimeVal.split(':').map(Number);
                                  if (eh * 60 + em <= sh * 60 + sm) {
                                    const totalMin = sh * 60 + sm + (editingScheduleMatch.matchDurationMin || 45);
                                    const newH = Math.floor(totalMin / 60) % 24;
                                    const newM = totalMin % 60;
                                    setEndTimeVal(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                                  }
                                }}
                                className="w-full bg-slate-950 border border-slate-800 text-white p-2 rounded-lg font-mono text-sm focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={endTimeVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                // Make sure we validate it doesn't exceed 11:59 PM as requested
                                const [eh, em] = val.split(':').map(Number);
                                if (eh === 23 && em > 59) {
                                  setEndTimeVal('23:59');
                                } else {
                                  setEndTimeVal(val);
                                }
                              }}
                              className="w-full bg-slate-950 border border-slate-800 text-white p-2 rounded-lg font-mono text-sm focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic bg-slate-950/40 p-2.5 rounded-lg border border-slate-850/60 font-mono">
                          ⏳ no time slot specified. Only Day and Date will be shown.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Arena/Board Selection (1 to n) */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      {result.gameType === 'cricket' ? 'Allocated Ground' : result.gameType === 'carrom' ? 'Allocated Board Number' : 'Allocated Table Arena'}
                    </label>
                    <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto pr-1">
                      {/* Option for nothing to write */}
                      <button
                        type="button"
                        onClick={() => setSelectedCourtNum(undefined)}
                        className={`py-2 px-1 rounded-lg text-[10.5px] font-mono font-black transition cursor-pointer flex flex-col items-center justify-center border ${
                          selectedCourtNum === undefined
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="leading-none text-xs">❌</span>
                        <span className="text-[8px] mt-0.5 whitespace-nowrap">EMPTY</span>
                      </button>

                      {/* Option cards from 1 to Total courts */}
                      {Array.from({ length: result.courtsCount || 1 }).map((_, cIdx) => {
                        const courtVal = cIdx + 1;
                        return (
                          <button
                            key={courtVal}
                            type="button"
                            onClick={() => setSelectedCourtNum(courtVal)}
                            className={`py-1.5 rounded-lg text-xs font-mono font-bold transition border cursor-pointer ${
                              selectedCourtNum === courtVal
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-950 border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white'
                            }`}
                          >
                            #{courtVal}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-slate-950 border-t border-slate-800/80 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingScheduleMatch(null)}
                    className="py-2 px-4 rounded-xl bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Final time caps validation to 11:59 PM
                      let finalStart = startTimeVal;
                      let finalEnd = endTimeVal;
                      if (selectedDayNum !== undefined) {
                        const [sh, sm] = finalStart.split(':').map(Number);
                        const [eh, em] = finalEnd.split(':').map(Number);
                        if (eh > 23 || (eh === 23 && em > 59)) {
                          finalEnd = '23:59';
                        }
                      }
                      handleSaveSchedule(
                        editingScheduleMatch.id,
                        selectedDayNum,
                        finalStart,
                        finalEnd,
                        selectedCourtNum,
                        hasTimeSelection
                      );
                    }}
                    className="py-2 px-5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 font-bold text-xs transition cursor-pointer border border-indigo-500/30"
                  >
                    Apply Update
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ========================================== */}
      {/* HIGH-FIDELITY OFFSCEEN PDF REPORT TEMPLATES */}
      {/* ========================================== */}
      {result && (
        <div 
          id="hidden-pdf-report-container" 
          className="pointer-events-none select-none"
          style={{ 
            position: 'absolute',
            top: '-9999px', 
            left: '0px', 
            width: '1120px', 
            backgroundColor: 'transparent',
            zIndex: -9999,
          }}
        >
          {/* Page 1: EXECUTIVE COVER PAGE & METRICS (DARK DESIGN) */}
          <div 
            className="pdf-page-wrapper pdf-render-page font-sans text-white text-left" 
            style={{
              width: '1120px',
              height: '792px',
              minWidth: '1120px',
              minHeight: '792px',
              padding: '48px',
              boxSizing: 'border-box',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              backgroundColor: '#0b0f19', // deep premium dark theme
            }}
          >
            {/* Elegant double border elements */}
            <div style={{ position: 'absolute', top: '14px', bottom: '14px', left: '14px', right: '14px', border: '1px solid #1e293b', pointerEvents: 'none', borderRadius: '4px' }}></div>
            <div style={{ position: 'absolute', top: '18px', bottom: '18px', left: '18px', right: '18px', border: '1px solid #1e293b', pointerEvents: 'none', borderRadius: '4px' }}></div>

            <div className="relative z-10 w-full">
              {/* Dynamic Theme Color Line */}
              <div 
                style={{ 
                  width: '180px', 
                  height: '4px', 
                  backgroundColor: selectedGame === 'cricket' ? '#f97316' : selectedGame === 'carrom' ? '#10b981' : '#6366f1',
                  marginBottom: '24px' 
                }}
              ></div>

              <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase mb-1 font-sans">
                {result.fixtureName ? result.fixtureName.toUpperCase() : 'GLORY GRID - TOURNAMENT REPORT'}
              </h1>
              <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase font-sans">
                {selectedGame === 'carrom' ? `${selectedGame.toUpperCase()} TOURNAMENT (${result.isDoubles ? 'DOUBLES' : 'SINGLES'})` : `${selectedGame.toUpperCase()} TOURNAMENT`}
              </p>

              <div style={{ height: '1px', backgroundColor: '#1e293b', marginTop: '16px', marginBottom: '20px' }}></div>

              {/* Configuration block in rounded card container */}
              <div 
                className="rounded-xl border p-6 mb-8 text-left grid grid-cols-2 gap-6"
                style={{ 
                  backgroundColor: '#111827', 
                  borderColor: '#374151' 
                }}
              >
                <div>
                  <h3 className="text-indigo-400 font-extrabold text-xs uppercase tracking-wider mb-3 font-sans">⚙️ Technical Config</h3>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li><strong>Discipline Type:</strong> {selectedGame.toUpperCase()}</li>
                    {selectedGame === 'carrom' && (
                      <li><strong>Match Format:</strong> {result.isDoubles ? 'Doubles (Tag Partnership)' : 'Singles (Solo Matchup)'}</li>
                    )}
                    <li><strong>Active Arenas:</strong> {result.courtsCount || result.arenasCount} {selectedGame === 'cricket' ? 'Pitches' : selectedGame === 'carrom' ? 'Boards' : 'Chess Tables'}</li>
                    <li><strong>Rest Buffer:</strong> {result.restTimeMin} Minutes play rest</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-indigo-400 font-extrabold text-xs uppercase tracking-wider mb-3 font-sans">📡 Tournament Metrics</h3>
                  <ul className="space-y-2 text-xs text-slate-300">
                    <li><strong>Total Players/Teams:</strong> {result.totalParticipants} Registrants</li>
                    <li><strong>Active Pools Count:</strong> {result.poolsCount} Pools of Play</li>
                    <li><strong>Allocated Match Duration:</strong> {result.matchDurationMin} mins match / {result.restTimeMin} mins rest</li>
                    <li><strong>Status Date Period:</strong> Ends {result.endDate ? result.endDate.split('-').reverse().join('/') : 'N/A'}</li>
                  </ul>
                </div>
              </div>

              {/* Participating pools list */}
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-3 font-sans">Participating Pools ({result.pools.length})</h2>
              <div className="grid grid-cols-2 gap-3">
                {result.pools.map((p) => {
                  const matchCount = p.rounds.reduce((acc, row) => acc + row.flat().length, 0);
                  return (
                    <div 
                      key={p.id} 
                      className="border rounded-lg p-3 flex items-center justify-between text-left"
                      style={{ backgroundColor: '#111827', borderColor: '#1e293b' }}
                    >
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase font-sans">{p.name}</h4>
                        <p className="text-[10px] text-slate-400 font-sans">{p.teams.length} Registered Teams &bull; {p.rounds.length} Scheduled Rounds</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
                        {matchCount} Fixtures
                      </span>
                    </div>
                  );
                })}

                {result.finalsPool && (
                  <div 
                    className="border-2 rounded-lg p-3 flex items-center justify-between text-left grid-col-span-1"
                    style={{ backgroundColor: '#1e1b4b', borderColor: '#4f46e5' }}
                  >
                    <div>
                      <h4 className="text-xs font-bold text-indigo-300 uppercase font-sans">🏆 Championship Stage</h4>
                      <p className="text-[10px] text-indigo-400 font-sans">Playoffs Knockout Bracket</p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-600 text-white">
                      Playoffs
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Signature Footer */}
            <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-505 font-mono tracking-wide mt-2">
              <span>GLORY GRID EXECUTIVE REPORT DEEP_MIND SPEED_EDITION</span>
              <span>UTC REPORT GENERATED {new Date().toUTCString()}</span>
            </div>
          </div>

          {/* Page 2: POOL POINTS STANDINGS (Cricket Pools) */}
          {selectedGame === 'cricket' && result.pools.map((p) => {
            const standings = calculateCricketStandings(p, declaredWinners);
            const promoteCount = result.teamsToPromotePerPool || 1;
            return (
              <div 
                key={`standings-page-${p.id}`}
                className="pdf-page-wrapper pdf-render-page font-sans text-slate-800 text-left" 
                style={{
                  width: '1120px',
                  height: '792px',
                  minWidth: '1120px',
                  minHeight: '792px',
                  padding: '48px',
                  boxSizing: 'border-box',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  backgroundColor: '#ffffff', // crisp white print page
                }}
              >
                {/* Thin slate borders */}
                <div style={{ position: 'absolute', top: '14px', bottom: '14px', left: '14px', right: '14px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>
                <div style={{ position: 'absolute', top: '18px', bottom: '18px', left: '18px', right: '18px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>

                <div className="relative z-10 w-full">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-950 uppercase font-sans">{p.name.toUpperCase()} - POINTS STANDINGS</h2>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-sans">CRM Statistics &amp; Net Run Rate (NRR) Details</p>
                    </div>
                    <span className="text-[10.5px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full uppercase border border-slate-200">
                      ROUND ROBIN POOL
                    </span>
                  </div>

                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }} className="text-slate-600 font-bold uppercase">
                        <th style={{ padding: '8px 12px' }} className="font-sans">Rank</th>
                        <th style={{ padding: '8px 12px' }} className="font-sans">Team Name</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }} className="font-sans">P</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }} className="font-sans">W</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }} className="font-sans">L</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }} className="font-sans">PTS</th>
                        <th style={{ padding: '8px 12px' }} className="font-sans">Runs / Overs Faced</th>
                        <th style={{ padding: '8px 12px' }} className="font-sans">Runs / Overs Bowled</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }} className="font-sans">NRR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {standings.map((team: any, rank: number) => {
                        let nrrString = team.nrr.toFixed(3);
                        let nrrColor = '#64748b';
                        if (team.nrr > 0) {
                          nrrString = '+' + nrrString;
                          nrrColor = '#059669'; // emerald dark
                        } else if (team.nrr < 0) {
                          nrrColor = '#dc2626'; // red
                        }
                        const isCurrentlyPromoted = rank < promoteCount;
                        return (
                          <tr key={team.name} className="hover:bg-slate-50 font-sans" style={isCurrentlyPromoted ? { backgroundColor: '#f0fdf4' } : {}}>
                            <td style={{ padding: '8px 12px' }} className="font-bold text-slate-500 font-sans">#{rank + 1}</td>
                            <td style={{ padding: '8px 12px' }} className="font-extrabold text-slate-900 font-sans">
                              {team.name} {isCurrentlyPromoted && '👑'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }} className="font-sans">{team.played}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#059669' }} className="font-semibold font-sans">{team.wins}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#ef4444' }} className="font-sans">{team.losses}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#d97706' }} className="font-bold font-sans">{team.points}</td>
                            <td style={{ padding: '8px 12px' }} className="text-slate-600 font-sans">{team.runsScored} runs / {team.oversFacedDecimal.toFixed(1)} ov</td>
                            <td style={{ padding: '8px 12px' }} className="text-slate-600 font-sans">{team.runsConceded} runs / {team.oversBowledDecimal.toFixed(1)} ov</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: nrrColor }} className="font-bold font-mono">{nrrString}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {promoteCount > 0 && standings.length > 0 && (
                    <div style={{ marginTop: '24px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', padding: '12px 16px', borderRadius: '8px' }} className="text-emerald-900 font-bold text-xs font-sans">
                      🏆 PROMOTED TO PLAYOFFS: {
                        standings.slice(0, promoteCount).map((t: any) => t.name.toUpperCase()).join(" & ")
                      }
                    </div>
                  )}
                </div>

                {/* Footer page descriptor */}
                <div className="relative z-10 flex items-center justify-between text-[9px] text-slate-400 font-mono tracking-wide mt-2 pt-2 border-t border-slate-100">
                  <span>GLORY GRID SYSTEMS</span>
                  <span>POOL STANDINGS CARD &bull; POOL {p.name.toUpperCase()}</span>
                </div>
              </div>
            );
          })}

          {/* Page 3: DETAILED FIXTURES & BRACKETS PAGES */}
          {result.pools.map((p) => {
            return (
              <div 
                key={`bracket-page-${p.id}`}
                className="pdf-page-wrapper pdf-render-page font-sans text-slate-800 text-left" 
                style={{
                  width: '1120px',
                  height: '792px',
                  minWidth: '1120px',
                  minHeight: '792px',
                  padding: '48px',
                  boxSizing: 'border-box',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  backgroundColor: '#ffffff',
                }}
              >
                {/* Thin slate borders */}
                <div style={{ position: 'absolute', top: '14px', bottom: '14px', left: '14px', right: '14px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>
                <div style={{ position: 'absolute', top: '18px', bottom: '18px', left: '18px', right: '18px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>

                <div className="relative z-10 w-full">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '10px', marginBottom: '16px' }}>
                    <div>
                      <h2 className="text-base font-extrabold text-slate-950 uppercase font-sans">{p.name.toUpperCase()} - MATCH FIXTURES TREE</h2>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-sans">Comprehensive competitive round list and outcome ledger</p>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-extrabold px-2.5 py-0.5 rounded-full uppercase border border-slate-200">
                      {p.isRoundRobin ? 'Round Robin Schedule' : 'Knockout Stages'}
                    </span>
                  </div>

                  {/* Horizontally structured rounds flex line */}
                  <div className="grid grid-cols-4 gap-4 overflow-hidden">
                    {p.rounds.map((roundMatches, rIdx) => {
                      const roundLabel = getPDFRoundLabel(p, rIdx);
                      return (
                        <div key={`round-${rIdx}`} className="space-y-3">
                          <div style={{ backgroundColor: '#f1f5f9', padding: '6px 12px', borderLeft: '3px solid #6366f1', borderRadius: '3px' }}>
                            <span className="text-[9px] font-extrabold text-slate-700 uppercase tracking-wider font-sans">{roundLabel}</span>
                          </div>

                          <div className="space-y-3 pr-1">
                            {roundMatches.map((match) => {
                              const pSideA = getPDFParticipantLabel(match, 'A');
                              const pSideB = getPDFParticipantLabel(match, 'B');
                              const finalWin = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);
                              const isWinA = finalWin === pSideA;
                              const isWinB = finalWin === pSideB;

                              return (
                                <div 
                                  key={match.id}
                                  className="border rounded-md p-3 text-left shadow-sm flex flex-col justify-between"
                                  style={{ backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }}
                                >
                                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2 text-[9px] font-bold text-slate-400">
                                    <span>MATCH &bull; {match.isWalkover ? 'BYE' : `M${match.matchIndex + 1}`}</span>
                                    {match.isWalkover ? (
                                      <span className="bg-slate-200/50 text-slate-500 px-1.5 py-0.5 rounded text-[8px]">BYE</span>
                                                            ) : finalWin ? (
                                      <span style={{ 
                                        backgroundColor: '#d1fae5', 
                                        color: '#065f46', 
                                        padding: '2px 6px', 
                                        borderRadius: '4px', 
                                        fontSize: '8px', 
                                        fontWeight: 'extrabold', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        lineHeight: '1', 
                                        height: '16px', 
                                        boxSizing: 'border-box',
                                        whiteSpace: 'nowrap'
                                      }}>FINISHED</span>
                                    ) : (
                                      <span style={{ 
                                        backgroundColor: '#e0e7ff', 
                                        color: '#4f46e5', 
                                        padding: '2px 6px', 
                                        borderRadius: '4px', 
                                        fontSize: '8px', 
                                        fontWeight: 'extrabold', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        lineHeight: '1', 
                                        height: '16px', 
                                        boxSizing: 'border-box',
                                        whiteSpace: 'nowrap'
                                      }}>PLAYING</span>
                                    )}
                                  </div>

                                  <div className="space-y-1.5 pr-2">
                                    <div className="flex items-center justify-between">
                                      <span className={`text-[10px] ${isWinA ? 'text-emerald-700 font-extrabold' : 'text-slate-800 font-semibold'} font-sans`}>{pSideA}</span>
                                      {selectedGame === 'cricket' && match.runsScoredA !== undefined && (
                                        <span className="text-[9px] font-extrabold text-amber-600 font-mono">({match.runsScoredA} r)</span>
                                      )}
                                    </div>
                                    <div className="text-[8px] text-slate-400 font-bold ml-1 tracking-wider uppercase font-mono">VS</div>
                                    <div className="flex items-center justify-between font-sans">
                                      <span className={`text-[10px] ${isWinB ? 'text-emerald-700 font-extrabold' : 'text-slate-800 font-semibold'} font-sans`}>{pSideB}</span>
                                      {selectedGame === 'cricket' && match.runsScoredB !== undefined && (
                                        <span className="text-[9px] font-extrabold text-amber-600 font-mono">({match.runsScoredB} r)</span>
                                      )}
                                    </div>
                                  </div>

                                  {!match.isWalkover && (
                                    <div className="mt-2.5 pt-2 border-t border-slate-150 flex items-center justify-between text-[8px] text-slate-500 font-mono">
                                      <span>🏟️ #{match.courtNumber || 'Open'}</span>
                                      <span>🕒 {match.scheduledTime ? (match.scheduledTime.split(', ').length >= 3 ? match.scheduledTime.split(', ')[2] : match.scheduledTime) : 'TBD'}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer page descriptor */}
                <div className="relative z-10 flex items-center justify-between text-[9px] text-slate-400 font-mono tracking-wide mt-2 pt-2 border-t border-slate-100">
                  <span>GLORY GRID CODES</span>
                  <span>FIXTURE REVOLUTIONS &bull; PAGE GROUP {p.name.toUpperCase()}</span>
                </div>
              </div>
            );
          })}

          {/* Page 4: CHAMPIONSHIP PLAYOFFS BRACKET PAGE */}
          {result.finalsPool && (
            <div 
              className="pdf-page-wrapper pdf-render-page font-sans text-slate-800 text-left" 
              style={{
                width: '1120px',
                height: '792px',
                minWidth: '1120px',
                minHeight: '792px',
                padding: '48px',
                boxSizing: 'border-box',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                backgroundColor: '#ffffff',
              }}
            >
              {/* Thin slate borders */}
              <div style={{ position: 'absolute', top: '14px', bottom: '14px', left: '14px', right: '14px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>
              <div style={{ position: 'absolute', top: '18px', bottom: '18px', left: '18px', right: '18px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>

              <div className="relative z-10 font-sans w-full">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #5850ec', paddingBottom: '10px', marginBottom: '16px' }}>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-950 uppercase font-sans">🏆 CHAMPIONSHIP PLATINUM BRACKET</h2>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-sans">Knockout Finals &amp; Grand Finale Playoff Tree</p>
                  </div>
                  <span className="text-[10px] bg-indigo-600 text-white font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                    CHAMPIONSHIP FINALS
                  </span>
                </div>

                {/* Horizontally structured playoff rounds */}
                <div className="grid grid-cols-3 gap-6 font-sans">
                  {result.finalsPool.rounds.map((roundMatches, rIdx) => {
                    const roundLabel = getPDFRoundLabel(result.finalsPool, rIdx);
                    return (
                      <div key={`playoff-round-${rIdx}`} className="space-y-4">
                        <div style={{ backgroundColor: '#e0e7ff', padding: '6px 12px', borderLeft: '3px solid #4f46e5', borderRadius: '3px' }}>
                          <span className="text-[9px] font-extrabold text-indigo-900 uppercase tracking-wider font-sans">{roundLabel}</span>
                        </div>

                        <div className="space-y-3 font-sans">
                          {roundMatches.map((match) => {
                            const pSideA = getPDFParticipantLabel(match, 'A');
                            const pSideB = getPDFParticipantLabel(match, 'B');
                            const finalWin = declaredWinners[match.id] || (match.isWalkover ? match.winner : null);
                            const isWinA = finalWin === pSideA;
                            const isWinB = finalWin === pSideB;

                            return (
                              <div 
                                key={match.id}
                                className="border rounded-lg p-4 text-left shadow-md flex flex-col justify-between"
                                style={{ backgroundColor: '#ffffff', borderColor: '#4f46e5' }}
                              >
                                <div className="flex items-center justify-between border-b border-indigo-100 pb-1.5 mb-2.5 text-[9px] font-bold text-indigo-400">
                                  <span>PLAYOFF MATCH &bull; {match.isWalkover ? 'BYE' : `M${match.matchIndex + 1}`}</span>
                                  {finalWin ? (
                                    <span style={{ 
                                      backgroundColor: '#d1fae5', 
                                      color: '#065f46', 
                                      padding: '2px 6px', 
                                      borderRadius: '4px', 
                                      fontSize: '8px', 
                                      fontWeight: 'extrabold', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      lineHeight: '1', 
                                      height: '16px', 
                                      boxSizing: 'border-box',
                                      whiteSpace: 'nowrap'
                                    }}>FINISHED</span>
                                  ) : (
                                    <span style={{ 
                                      backgroundColor: '#e0e7ff', 
                                      color: '#4f46e5', 
                                      padding: '2px 6px', 
                                      borderRadius: '4px', 
                                      fontSize: '8px', 
                                      fontWeight: 'extrabold', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      lineHeight: '1', 
                                      height: '16px', 
                                      boxSizing: 'border-box',
                                      whiteSpace: 'nowrap'
                                    }}>PLAYING</span>
                                  )}
                                </div>

                                <div className="space-y-2 font-sans pr-2">
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[10px] ${isWinA ? 'text-emerald-700 font-extrabold' : 'text-slate-800 font-semibold'} font-sans`}>{pSideA}</span>
                                    {selectedGame === 'cricket' && match.runsScoredA !== undefined && (
                                      <span className="text-[9px] font-extrabold text-indigo-700 font-mono">({match.runsScoredA} r)</span>
                                    )}
                                  </div>
                                  <div className="text-[8px] text-indigo-300 font-black ml-1 tracking-wider uppercase font-mono">VS</div>
                                  <div className="flex items-center justify-between font-sans">
                                    <span className={`text-[10px] ${isWinB ? 'text-emerald-700 font-extrabold' : 'text-slate-800 font-semibold'} font-sans`}>{pSideB}</span>
                                    {selectedGame === 'cricket' && match.runsScoredB !== undefined && (
                                      <span className="text-[9px] font-extrabold text-indigo-700 font-mono">({match.runsScoredB} r)</span>
                                    )}
                                  </div>
                                </div>

                                {!match.isWalkover && (
                                  <div className="mt-3 pt-2 border-t border-indigo-50 flex items-center justify-between text-[8px] text-indigo-400 font-mono">
                                    <span>🏟️ Table #{match.courtNumber || 'Open'}</span>
                                    <span>🕒 {match.scheduledTime ? (match.scheduledTime.split(', ').length >= 3 ? match.scheduledTime.split(', ')[2] : match.scheduledTime) : 'TBD'}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer page descriptor */}
              <div className="relative z-10 flex items-center justify-between text-[9px] text-slate-400 font-mono tracking-wide mt-2 pt-2 border-t border-slate-100">
                <span>GLORY GRID INDIGO</span>
                <span>CHAMPIONSHIP PLATINUM LEAGUE SUMMARY</span>
              </div>
            </div>
          )}

          {/* Page 5+: DETAILED CHRONOLOGICAL SCHEDULE BOOK (Zebrafolk pages) */}
          {(() => {
            const itemsPerPage = 11;
            const pagesCount = Math.ceil(flatMatches.length / itemsPerPage);
            const ledgerPages = [];

            for (let pageIdx = 0; pageIdx < pagesCount; pageIdx++) {
              const currentSlice = flatMatches.slice(pageIdx * itemsPerPage, (pageIdx + 1) * itemsPerPage);
              ledgerPages.push(
                <div 
                  key={`ledger-page-${pageIdx}`}
                  className="pdf-page-wrapper pdf-render-page font-sans text-slate-800 text-left font-sans" 
                  style={{
                    width: '1120px',
                    height: '792px',
                    minWidth: '1120px',
                    minHeight: '792px',
                    padding: '48px',
                    boxSizing: 'border-box',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    backgroundColor: '#ffffff',
                  }}
                >
                  {/* Thin slate borders */}
                  <div style={{ position: 'absolute', top: '14px', bottom: '14px', left: '14px', right: '14px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>
                  <div style={{ position: 'absolute', top: '18px', bottom: '18px', left: '18px', right: '18px', border: '1px solid #e2e8f0', pointerEvents: 'none', borderRadius: '4px' }}></div>

                  <div className="relative z-10 w-full font-sans">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '10px', marginBottom: '16px' }}>
                      <div>
                        <h2 className="text-base font-extrabold text-slate-950 uppercase font-sans">📅 CHRONOLOGICAL STATUS LEDGER &amp; SCHEDULE</h2>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-sans">Chronological list of all played and scheduled fixture matchups</p>
                      </div>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-3 py-0.5 rounded-full border border-indigo-200">
                        PAGE {pageIdx + 1} OF {pagesCount}
                      </span>
                    </div>

                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead>
                        <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }} className="uppercase text-[9px] font-bold tracking-wide">
                          <th style={{ padding: '8px 12px' }} className="font-sans">Pool / Stage</th>
                          <th style={{ padding: '8px 12px' }} className="font-sans">Matchup Teams</th>
                          <th style={{ padding: '8px 12px' }} className="font-sans">Schedule Detail</th>
                          <th style={{ padding: '8px 12px' }} className="font-sans">Arena Layout</th>
                          <th style={{ padding: '8px 12px' }} className="font-sans">Winner Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 text-slate-800 font-sans">
                        {currentSlice.map((match) => {
                          const sideA = getPDFParticipantLabel(match, 'A');
                          const sideB = getPDFParticipantLabel(match, 'B');
                          const isWalkover = match.isWalkover;
                          const winVal = declaredWinners[match.id] || (isWalkover ? match.winner : null);

                          let schedString = match.scheduledTime || 'TBD Schedule';
                          if (isWalkover) {
                            schedString = 'BYE (Instant)';
                          }

                          return (
                            <tr key={match.id} className="hover:bg-slate-50/50 transition font-sans">
                              <td style={{ padding: '8px 12px' }} className="font-extrabold text-slate-700 font-sans">{match.poolName || 'Championship'}</td>
                              <td style={{ padding: '8px 12px' }} className="font-semibold text-slate-900 font-sans">{sideA} vs {sideB}</td>
                              <td style={{ padding: '8px 12px' }} className="text-slate-500 font-mono text-[11px] font-sans">{schedString}</td>
                              <td style={{ padding: '8px 12px' }} className="font-bold font-sans">
                                {isWalkover ? 'Not Req' : match.courtNumber ? `${selectedGame === 'cricket' ? 'Ground' : selectedGame === 'carrom' ? 'Board' : 'Table'} ${match.courtNumber}` : 'Open Arena'}
                              </td>
                              <td style={{ padding: '8px 12px' }} className="font-sans">
                                {winVal ? (
                                  <span className="text-emerald-700 font-extrabold font-sans">🏆 {winVal}</span>
                                ) : (
                                  <span className="text-slate-400 italic font-semibold font-sans">Pending Match</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer page descriptor */}
                  <div className="relative z-10 flex items-center justify-between text-[9px] text-slate-400 font-mono tracking-wide mt-2 pt-2 border-t border-slate-100">
                    <span>GLORY GRID LEDGER ENGINE</span>
                    <span>AUTOMATIC SCHEDULE INTEGRITY BOOK</span>
                  </div>
                </div>
              );
            }
            return ledgerPages;
          })()}
        </div>
      )}

      {/* ========================================== */}
      {/* INTERACTIVE HELP CENTER MODAL OVERLAY      */}
      {/* ========================================== */}
      {showHelp && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99999] flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-indigo-500/30 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
          >
            {/* Modal Header */}
            <div className="bg-slate-950 px-6 py-4 border-b border-indigo-950 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide uppercase">Glory Grid Interactive Training Hub</h3>
                  <p className="text-[10px] font-mono text-indigo-400">Software Operations & Design Manual</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadManualPDF}
                  disabled={isDownloadingManual}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-mono text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-950/20 shadow-none hover:shadow-indigo-500/20"
                >
                  <Download size={14} className={isDownloadingManual ? "animate-bounce" : ""} />
                  {isDownloadingManual ? "GENERATING PDF GUIDE..." : "DOWNLOAD GUIDANCE PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  className="p-1.5 bg-slate-850 hover:bg-rose-600 hover:text-white text-slate-400 rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar text-left scroll-smooth bg-slate-900 border-none">
              
              {/* BRAND NEW KNOWLEDGE BASE WELCOME CALLOUT */}
              <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                <h4 className="text-lg font-black text-white flex items-center gap-2 mb-2 font-sans">
                  Glory Grid Elite Tournament Operations Knowledge Base 💡
                </h4>
                <p className="text-slate-200 text-sm leading-relaxed max-w-4xl font-sans">
                  Welcome to the ultimate operations center. This system manages complex brackets, team pools, locations, and schedules for physical team athletics and indoor sports alike. Below is a comprehensive walkthrough explaining every available parameter, caching rule, live bracket mechanism, and Google Workspace integrations in explicit detail.
                </p>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. CALIBRATING PARAMETERS & FIELDS */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 mb-3">
                    <Sliders size={16} className="text-indigo-400" />
                    <h4 className="text-sm font-bold text-white font-sans">1. Calibration Form Fields & Parameters</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans font-normal">
                    <p>To calibrate the schedule builder, you must configure the following key inputs:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Participants Count (2 to 128):</strong> Sets the exact size of the competitor roster.</li>
                      <li><strong className="text-white">Doubles Play Toggle:</strong> Formats match cards for dual-team pairs (e.g. <i>Partner 1 + Partner 2</i>) automatically.</li>
                      <li><strong className="text-white">Division Pool Split (Up to 50 Pools):</strong> Divide competitors into up to 50 separate, custom-alphabetized pools (supporting Pool A to Z and further as Excel-style AA, AB, etc.).</li>
                      <li><strong className="text-white">Equal Pool Team Allocation:</strong> Subdivides teams mathematically with maximum balance. For example, selecting 14 total teams across 2 pools dynamically yields exactly 7 and 7 teams respectively. No team is ever dropped or lost from the configuration.</li>
                      <li><strong className="text-white">"All Play Against All" Pools:</strong> A dedicated round-robin pool league structure where every team plays against all other teams in their respective pools, generating points standings, calculated matches, and automatic bye structures.</li>
                      <li><strong className="text-white">Cushion & Rest Buffers:</strong> Introduce Rest Intervals of up to 20-mins between matches to prevent athletic burnout.</li>
                      <li><strong className="text-white">Active Arenas:</strong> Specify sequential Grounds, Boards, or Tables to prevent location conflicts.</li>
                    </ul>
                  </div>
                  {/* Miniature visual form representation mock */}
                  <div className="mt-4 p-3 bg-slate-100/5 rounded-xl border border-slate-800 text-[10px] font-mono space-y-2 text-slate-400">
                    <div className="flex justify-between items-center text-indigo-400 border-b border-indigo-900 pb-1.5 font-bold">
                      <span>⚙️ CONFIGURATION ENGINE FIELD DEMO</span>
                      <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">CALIBRATION</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      <div className="p-1.5 bg-slate-900/60 rounded border border-slate-800">
                        <span className="text-slate-500 block">Doubles Mode</span>
                        <span className="text-emerald-400 font-bold">● ENABLED</span>
                      </div>
                      <div className="p-1.5 bg-slate-900/60 rounded border border-slate-800">
                        <span className="text-slate-500 block">Scheduling Limit</span>
                        <span className="text-white font-bold">Max 20m Buffers</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. THE CACHE CONFIGURATION MEMORY */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 mb-3">
                    <Wand2 size={16} className="text-indigo-400" />
                    <h4 className="text-sm font-bold text-white font-sans">2. Load Previous Memory & Local Cache</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans">
                    <p>Forget entering long participant rosters repeatedly. Glory Grid uses secure localized session databases to cache configs:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Sport-Specific Registers:</strong> Cricket, Carrom, and Chess each preserve independent memory caches automatically.</li>
                      <li><strong className="text-white">"Load Previous Data" Trigger:</strong> Click to instantly restore names, pools, buffer durations, and timelines from your last setup.</li>
                      <li><strong className="text-white">Instant Calibrations:</strong> Ideal for correcting participant spelling mistakes or re-ordering arena rosters on-the-fly.</li>
                    </ul>
                  </div>
                  {/* Miniature button representation mock */}
                  <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3 font-sans">
                    <div className="text-[10px] font-mono text-slate-400">
                      <span className="text-indigo-400 font-bold block">📂 RESTORE PARAMETERS</span>
                      <span>1-Click History Calibration</span>
                    </div>
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2.5 py-1.5 rounded-lg font-bold font-mono">
                      LOAD MEMORY
                    </span>
                  </div>
                </div>

                {/* 3. DYNAMIC INTERACTIVE PLAYOFF BRACKETS */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers size={16} className="text-indigo-400" />
                    <h4 className="text-sm font-bold text-white font-sans">3. Active Tournament Playoff Brackets</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans">
                    <p>Track championship development visually with responsive structural brackets:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Interactive Nodes:</strong> Click on any active match panel to view schedules or select match outcomes.</li>
                      <li><strong className="text-white">Automated Progression:</strong> Declaring a winner instantly calculates bracket advancement, pushing winners into next-round nodes.</li>
                      <li><strong className="text-white">Live Updates:</strong> Instantly adapts subsequent stages, eliminating manual data entry mistakes.</li>
                    </ul>
                  </div>
                  {/* Miniature flow diagram representation mock */}
                  <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-900 text-[10px] font-mono space-y-1.5">
                    <div className="flex justify-between text-slate-500">
                      <span>Interactive Match Box 1</span>
                      <span className="text-emerald-400">✔ Winner Decided</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-900 p-1.5 border border-slate-800 rounded">
                      <span className="text-slate-300 font-bold font-sans">Player A</span>
                      <span className="text-slate-500 font-sans">vs</span>
                      <span className="text-slate-400 font-sans">Player B</span>
                      <span className="text-emerald-400 font-bold ml-auto font-sans">[Player A Won]</span>
                    </div>
                    <div className="text-center text-slate-600 text-[9px] font-bold font-mono">➡ CHANNELS AUTOMATICALLY TO NEXT ROUND</div>
                  </div>
                </div>

                {/* 4. CHRONOLOGICAL ARENA TIMELINE */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-indigo-400" />
                    <h4 className="text-sm font-bold text-white font-sans">4. Aligned Location & Time Schedules</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans">
                    <p>All tournament fixtures organize neatly within a central chronological timeline ledger:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Venue Segregation:</strong> Separates schedules by active Pitches (Cricket), Board indexes (Carrom), or Tables (Chess).</li>
                      <li><strong className="text-white">Real-Time Indicators:</strong> Highlights active match states (<i>Upcoming, In-Progress, or Completed</i>).</li>
                      <li><strong className="text-white">Date-Aligned Scrollbars:</strong> Sorts matches strictly chronologically, ensuring zero double-bookings or overlapping events.</li>
                    </ul>
                  </div>
                  {/* Miniature timeline grid mockup */}
                  <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-mono">
                    <div className="text-indigo-300 font-bold mb-1.5">📅 CHRONOLOGICAL VENUE ASSIGNMENTS</div>
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      <div className="bg-slate-900 p-1.5 border border-slate-800 rounded">
                        <span className="text-slate-500 block">Board 1 (Carrom)</span>
                        <span className="text-white">09:00 AM - 09:45 AM</span>
                      </div>
                      <div className="bg-slate-900 p-1.5 border border-slate-800 rounded">
                        <span className="text-slate-500 block">Board 2 (Carrom)</span>
                        <span className="text-white">09:45 AM - 10:30 AM</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. THE DYNAMIC AUTO-FILL NAMES ENGINE */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={16} className="text-emerald-400" />
                    <h4 className="text-sm font-bold text-white font-sans">5. Dynamic Thematic Auto-Fill Names Engine</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans">
                    <p>Speed up testing and setup with custom, thematic auto-fill names that instantly assign sport-relevant identities to all slots:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Cricket Themes:</strong> Implements legendary player names like <i>MS Dhoni, Virat Kohli, Sachin Tendulkar, Rohit Sharma, Jasprit Bumrah</i> and elite franchises.</li>
                      <li><strong className="text-white">Carrom Themes:</strong> Generates arcade-ready strikers and board handles like <i>Flick Master, Pocket Raider, Striker Pro</i>.</li>
                      <li><strong className="text-white">Chess Themes:</strong> Deploys classic grandmaster styles such as <i>Magnus Carlsen, Garry Kasparov, Bobby Fischer</i>.</li>
                    </ul>
                  </div>
                </div>

                {/* 6. HIGH-FIDELITY PDF EXPORT */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/40">
                  <div className="flex items-center gap-2 mb-3">
                    <FileDown size={16} className="text-emerald-400" />
                    <h4 className="text-sm font-bold text-white font-sans">6. 1-Click High-Fidelity PDF Export System</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans">
                    <p>Compile and download your calibrated tournaments instantly using our vector-crisp PDF generation engine:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Seamless Compiler:</strong> Generates multi-page landscape PDF workbooks containing your exact groupings, pool metrics, tournament brackets, and chronology boards.</li>
                      <li><strong className="text-white">Crisp Vector Rendering:</strong> Implements safe double-scale (2x DPI) technology to keep text, lines, and custom Gujarati characters crystal-clear at any zoom levels.</li>
                      <li><strong className="text-white">Offline Portability:</strong> Compile your tournament playbooks offline without needing an active internet connection.</li>
                    </ul>
                  </div>
                </div>

                {/* 7. SMART PDF TABLE IMPORT & NAME MAPPING */}
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/40 md:col-span-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers size={16} className="text-indigo-400" />
                    <h4 className="text-sm font-bold text-white font-sans">7. Smart PDF Table Import & Name Mapping Engine</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed font-sans">
                    <p>Load player lists directly from existing PDF reports or spreadsheets using our advanced table parser:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1 font-sans">
                      <li><strong className="text-white">Ignore Header Noise:</strong> The parsing engine automatically detects and discards outer page/table titles (e.g., <i>"Neighborhood Household Demographics"</i>) so that they never clutter your player roster.</li>
                      <li><strong className="text-white">Smart Column Headers:</strong> Searches for the column heading containing <i>"NAME"</i> or <i>"name"</i> to find player data, then skips that header row entirely to start extracting from the actual rows below.</li>
                      <li><strong className="text-white">Whole Player Name Merging:</strong> In multi-line layouts, vertically stacked segments belonging to the same player slot (e.g. <i>"Arthur Pendragon"</i>) are merged as a single whole player name, instead of being split incorrectly into separate players (e.g. <i>"Arthur"</i> and <i>"Pendragon"</i>).</li>
                    </ul>
                  </div>
                </div>

              </div>

              {/* Step-by-Step Training Walkthrough */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h4 className="text-sm font-bold text-white tracking-widest uppercase font-mono">🏆 Complete Step-By-Step Workflow</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-left">
                    <span className="text-[10px] font-bold text-indigo-400 block pb-1 border-b border-indigo-950">STEP 01</span>
                    <h5 className="font-bold text-slate-200">Select Game Type</h5>
                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">Choose Cricket, Carrom, or Chess on the dashboard to open the calibration form.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-left">
                    <span className="text-[10px] font-bold text-indigo-400 block pb-1 border-b border-indigo-950">STEP 02</span>
                    <h5 className="font-bold text-slate-200">Calibrate Parameters</h5>
                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">Set total players, day durations, and available arenas. Use Auto-Fill or load previous data to save time.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-left">
                    <span className="text-[10px] font-bold text-indigo-400 block pb-1 border-b border-indigo-950">STEP 03</span>
                    <h5 className="font-bold text-slate-200">Refine & Generate</h5>
                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">Adjust individual days, pool sizes, or names as required. Click GENERATE FIXTURES on the form.</p>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 text-left">
                    <span className="text-[10px] font-bold text-indigo-400 block pb-1 border-b border-indigo-950">STEP 04</span>
                    <h5 className="font-bold text-slate-200">Manage & Export Docs</h5>
                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">Declare match results in real time, customize dates, or export clean print-ready PDFs and Google Docs.</p>
                  </div>
                </div>
              </div>

              {/* Bottom Callout banner */}
              <div className="bg-gradient-to-r from-emerald-950/20 to-indigo-950/20 p-5 border border-emerald-500/25 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-300 font-sans text-left">
                  💡 <strong>Expert Tip:</strong> Download the print-ready landscaping PDF manual below to explore comprehensive visual designs, form illustrations, and bracket diagram templates.
                </span>
                <button
                  type="button"
                  onClick={handleDownloadManualPDF}
                  disabled={isDownloadingManual}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-5 py-2.5 text-xs font-bold font-mono rounded-xl shrink-0 transition-colors cursor-pointer"
                >
                  {isDownloadingManual ? "PREPARING..." : "DOWNLOAD PDF"}
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================== */}
      {/* HIGH-FIDELITY OFFSCEEN MANUAL PDF TEMPLATE */}
      {/* ========================================== */}
      <div 
        id="hidden-manual-pdf-container" 
        className="pointer-events-none select-none"
        style={{ 
          position: 'fixed',
          top: '0px', 
          left: '0px', 
          width: '1120px', 
          opacity: 1,
          backgroundColor: 'transparent',
          zIndex: -100,
        }}
      >
        {/* PAGE 1: MANUAL COVER PAGE */}
        <div 
          className="manual-pdf-page font-sans text-left overflow-hidden relative"
          style={{
            width: '1120px',
            height: '792px',
            minWidth: '1120px',
            minHeight: '792px',
            boxSizing: 'border-box',
            backgroundColor: '#0b0f19',
            color: '#ffffff',
            padding: '64px',
            position: 'relative'
          }}
        >
          {/* Cover Page Decorative Graphics with explicit color codes */}
          <div className="absolute top-0 right-0 w-[420px] h-[420px] rounded-full blur-[120px]" style={{ backgroundColor: '#2e1065', opacity: 0.4 }} />
          <div className="absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full blur-[100px]" style={{ backgroundColor: '#022c22', opacity: 0.4 }} />

          <div className="h-full flex flex-col justify-between relative z-10" style={{ boxSizing: 'border-box' }}>
            <div>
              <span className="text-xs font-mono tracking-widest uppercase font-black" style={{ color: '#10b981' }}>SYSTEM SECURITY & OPERATIONS MANUAL</span>
              <h1 className="text-5xl font-black mt-4 tracking-tight" style={{ color: '#818cf8', lineHeight: '1.1' }}>
                THE GLORY GRID ELITE HANDBOOK
              </h1>
              <p className="text-sm font-mono mt-2 tracking-widest uppercase" style={{ color: '#a5b4fc' }}>
                Universal Tournament Architecture & Operational Guidance Manual
              </p>
              
              <div className="mt-4 w-24 h-1.5 rounded-full" style={{ backgroundColor: '#4f46e5' }} />
            </div>

            <div className="p-8 rounded-2xl max-w-3xl space-y-4" style={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}>
              <h3 className="text-lg font-black flex items-center gap-2" style={{ color: '#ffffff' }}>
                🏆 Software Architecture & Operational Overview
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
                Glory Grid is a professional-grade, multi-sport interactive match scheduling and tournament bracket evaluation system. Engineered to empower athletic events and indoor league games, our system integrates dynamic calibration forms, persistent localized cache memories, aligned venue clock chronologies, and secure Google Workspace export suites into a seamless coordination core.
              </p>
              <div className="grid grid-cols-2 gap-4 text-[10px] font-mono pt-2" style={{ color: '#9ca3af' }}>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#10b981' }}>✔</span> Fully Portable Local Session Caching
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#10b981' }}>✔</span> Interactive 1-Click Winner Declarant Nodes
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#10b981' }}>✔</span> Aligned Location Hour Calendars
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#10b981' }}>✔</span> Direct Google Docs Sync Engine
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 text-[10px] font-mono" style={{ borderTop: '1px solid #1f2937', color: '#4b5563' }}>
              <span>GLORY GRID ENTERPRISE TOURNAMENT BUILDER</span>
              <span>Doc Version 5.2.0 (High Precision Production Release) • Page 1 of 5</span>
            </div>
          </div>
        </div>

        {/* PAGE 2: PARAMETERS & RESTORATION GUIDES */}
        <div 
          className="manual-pdf-page font-sans text-left overflow-hidden relative"
          style={{
            width: '1120px',
            height: '792px',
            minWidth: '1120px',
            minHeight: '792px',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '64px'
          }}
        >
          <div className="h-full flex flex-col justify-between" style={{ boxSizing: 'border-box' }}>
            <div>
              <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <h2 className="text-2xl font-black tracking-tight uppercase" style={{ color: '#111827' }}>
                  SECTION 1: HIGH-FIDELITY CALIBRATION & MEMORY CONTROLS
                </h2>
                <span className="text-xs font-mono px-2.5 py-1 rounded font-bold" style={{ color: '#4f46e5', backgroundColor: '#e0e7ff' }}>Page 2 of 5</span>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-6">
                {/* Text Explanations */}
                <div className="space-y-4">
                  <h3 className="text-base font-black flex items-center gap-2 pl-2" style={{ borderLeft: '4px solid #4f46e5', color: '#111827' }}>
                    🛠 Calibrating Setup Parameters
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>
                    Glory Grid's form handles tournament setup through fine-grained control parameters:
                  </p>
                  <ul className="text-xs space-y-2 list-disc list-inside leading-relaxed pl-1" style={{ color: '#4b5563' }}>
                    <li><strong style={{ color: '#000000' }}> Roster Size (2 to 128):</strong> Adjusts participants instantly. Singles / Doubles mode toggle automatically adapts dual-athlete names (e.g. <i>Partner 1 + Partner 2</i>).</li>
                    <li><strong style={{ color: '#000000' }}>Time Buffer Padding:</strong> Specify the exact match durations and essential athlete cushion buffers (up to 20 mins) to prevent location conflicts and player fatigue.</li>
                    <li><strong style={{ color: '#000005' }}>Symmetrical Pool Splits (Up to 50 Pools):</strong> Divide roster groups into up to 50 separate pools. The software mathematically balances divisions (e.g., 14 teams over 2 pools splits into exactly 7 and 7 teams respectively), ensuring zero dropped or omitted teams.</li>
                    <li><strong style={{ color: '#000010' }}>"All Play Against All" Format:</strong> Computes true round-robin structures where all teams play everyone else within their division. Points tables and standings compile dynamically to allow seamless, non-symmetrical playoffs and bracket promotions.</li>
                  </ul>

                  <h3 className="text-base font-black flex items-center gap-2 pl-2 pt-2" style={{ borderLeft: '4px solid #10b981', color: '#111827' }}>
                    📂 Sports Caching Session Registries
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>
                    Avoid re-typing long names. Clicking the blue <span className="font-bold" style={{ color: '#4f46e5' }}>"LOAD PREVIOUS DATA"</span> button retrieves your precise configuration, participant lists, day divisions, and date ranges from cached session storage instantly. Cache registries reside independently for Chess, Cricket, and Carrom.
                  </p>
                </div>

                {/* Styled Form Visual Diagrams / Sketches */}
                <div className="p-6 rounded-2xl flex flex-col justify-between" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div>
                    <span className="text-[10px] font-mono font-bold block mb-2 uppercase" style={{ color: '#9ca3af' }}>✦ Interactive Calibration Terminal mockup</span>
                    <div className="rounded-xl p-4 space-y-3 shadow-md text-[10px]" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}>
                      <div className="h-2 w-1/3 rounded-full mb-2" style={{ backgroundColor: '#4f46e5' }} />
                      <div className="grid grid-cols-2 gap-2 font-mono">
                        <div className="p-2 rounded-lg" style={{ border: '1px solid #e5e7eb', backgroundColor: '#f3f4f6' }}>
                          <span className="block text-[8px]" style={{ color: '#9ca3af' }}>TOTAL STAGES</span>
                          <strong className="text-xs" style={{ color: '#000000' }}>4 Rounds</strong>
                        </div>
                        <div className="p-2 rounded-lg" style={{ border: '1px solid #e5e7eb', backgroundColor: '#f3f4f6' }}>
                          <span className="block text-[8px]" style={{ color: '#9ca3af' }}>BUFFER CUSHION</span>
                          <strong className="text-xs" style={{ color: '#000000' }}>Max 20 Minutes</strong>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1 p-2 rounded-lg font-mono" style={{ backgroundColor: '#e0e7ff', color: '#4f46e5' }}>
                        <span>📂 RESTORE PREV CONFIGURATION</span>
                        <span style={{ 
                          backgroundColor: '#4f46e5', 
                          color: '#ffffff', 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontSize: '8px', 
                          fontWeight: 'bold', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          lineHeight: '1', 
                          height: '18px', 
                          boxSizing: 'border-box',
                          whiteSpace: 'nowrap'
                        }}>MEM CACHE</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 p-2 rounded-lg font-mono font-bold" style={{ backgroundColor: '#d1fae5', color: '#065f46' }}>
                        <span>⚡ DYNAMIC THEMATIC AUTO-FILL</span>
                        <span style={{ 
                          backgroundColor: '#10b981', 
                          color: '#ffffff', 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontSize: '8px', 
                          fontWeight: 'bold', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          lineHeight: '1', 
                          height: '18px', 
                          boxSizing: 'border-box',
                          whiteSpace: 'nowrap'
                        }}>AUTO</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg text-[10px] leading-relaxed" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                    📋 <strong>Memory Cache Protocol:</strong> Participant names and system fields persist independently across discrete storage rows, ensuring no interference when swapping between sports.
                  </div>
                </div>
              </div>

            </div>
            
            <div className="pt-4 flex items-center justify-between text-[10px] font-mono" style={{ borderTop: '1px solid #e5e7eb', color: '#9ca3af' }}>
              <span>GLORY GRID SOFTWARE OPERATIONS MANUAL</span>
              <span>Doc Section: Page 2 of 5</span>
            </div>
          </div>
        </div>

        {/* PAGE 3: BRACKETS PROGRESSIONS & AUTO-TIMELINES */}
        <div 
          className="manual-pdf-page font-sans text-left overflow-hidden relative"
          style={{
            width: '1120px',
            height: '792px',
            minWidth: '1120px',
            minHeight: '792px',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '64px'
          }}
        >
          <div className="h-full flex flex-col justify-between" style={{ boxSizing: 'border-box' }}>
            <div>
              <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <h2 className="text-2xl font-black tracking-tight uppercase" style={{ color: '#111827' }}>
                  SECTION 2: DYNAMIC PLAYOFF BRACKETS & VENUE TIMELINES
                </h2>
                <span className="text-xs font-mono px-2.5 py-1 rounded font-bold" style={{ color: '#4f46e5', backgroundColor: '#e0e7ff' }}>Page 3 of 5</span>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-6">
                {/* Text Explanations */}
                <div className="space-y-4">
                  <h3 className="text-base font-black flex items-center gap-2 pl-2" style={{ borderLeft: '4px solid #4f46e5', color: '#111827' }}>
                    🔄 Interactive Championship Progressions
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>
                    Calibrated fixtures automatically materialize into live, interactive bracket nodes:
                  </p>
                  <ul className="text-xs space-y-2 list-disc list-inside leading-relaxed pl-1" style={{ color: '#4b5563' }}>
                    <li><strong style={{ color: '#000000' }}>Dynamic Node Interactivity:</strong> Select any fixture block to open the Live Match Auditor. Adjust schedule details or register physical scores on-screen.</li>
                    <li><strong style={{ color: '#000000' }}>Automated Bracket Pushes:</strong> Submitting a winner instantly recalculates the championship tree, promoting the victor to the next stage node dynamically.</li>
                    <li><strong style={{ color: '#000000' }}>Recursive Recalculations:</strong> Automatically handles bye scores or uncompleted ties to keep timelines optimized.</li>
                  </ul>

                  <h3 className="text-base font-black flex items-center gap-2 pl-2 pt-2" style={{ borderLeft: '4px solid #10b981', color: '#111827' }}>
                    ⏰ Aligned Chronological Location Lanes
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>
                    Matches sequence cleanly across multiple lanes (Cricket pitches, chess tables, carrom boards) sorted chronologically. This ensures venue lanes remain fully utilized with zero overlaps.
                  </p>
                </div>

                {/* Styled Brackets & Schedule Visual Diagrams */}
                <div className="p-6 rounded-2xl flex flex-col justify-between" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div>
                    <span className="text-[10px] font-mono font-bold block mb-2 uppercase" style={{ color: '#9ca3af' }}>✦ Live Winner Progression Tree mockup</span>
                    <div className="rounded-xl p-4 space-y-3 shadow-md text-[10px] font-mono" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}>
                      
                      {/* Round 1 node */}
                      <div className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: '#d1fae5', border: '1px solid #10b981', color: '#065f46' }}>
                        <span>⚔ Match 1 [Round 1]</span>
                        <strong>[Winner Declared]</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[8px] pl-3" style={{ color: '#4b5563', borderLeft: '2px solid #e5e7eb' }}>
                        <div className="font-bold" style={{ color: '#047857' }}>🏆 Team-Alpha (Won)</div>
                        <div style={{ color: '#94a3b8', textDecoration: 'line-through' }}>Team-Beta (Lost)</div>
                      </div>

                      {/* Progression Path */}
                      <div className="text-center text-xs font-bold my-1" style={{ color: '#94a3b8' }}>⬇ AUTO-ADVANCING PATH ⬇</div>

                      {/* Round 2 node with Team-A pushed */}
                      <div className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', color: '#111827' }}>
                        <span>⚔ Match 2 [Quarter Final]</span>
                        <span style={{ 
                          backgroundColor: '#f3f4f6', 
                          color: '#4b5563', 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontSize: '8px', 
                          fontWeight: 'bold', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          lineHeight: '1', 
                          height: '18px', 
                          boxSizing: 'border-box',
                          whiteSpace: 'nowrap'
                        }}>PENDING</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[8px] pl-3" style={{ borderLeft: '2px solid #c7d2fe', color: '#4b5563' }}>
                        <div className="font-bold" style={{ color: '#4f46e5' }}>🥇 Team-Alpha</div>
                        <div style={{ color: '#94a3b8' }}>[Waiting for Quarter-Winner]</div>
                      </div>

                    </div>
                  </div>

                  <div className="p-3 rounded-lg text-[10px] leading-relaxed" style={{ backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46' }}>
                    💡 <strong>Pro Tip:</strong> Toggle the Bracket views or Calendar tables on-screen to instantly filter and review active pool structures cleanly.
                  </div>
                </div>
              </div>

            </div>
            
            <div className="pt-4 flex items-center justify-between text-[10px] font-mono" style={{ borderTop: '1px solid #e5e7eb', color: '#9ca3af' }}>
              <span>GLORY GRID SOFTWARE OPERATIONS MANUAL</span>
              <span>Doc Section: Page 3 of 5</span>
            </div>
          </div>
        </div>

        {/* PAGE 4: DIGITAL WORKBOOKS & EXPORT UTILITIES */}
        <div 
          className="manual-pdf-page font-sans text-left overflow-hidden relative"
          style={{
            width: '1120px',
            height: '792px',
            minWidth: '1120px',
            minHeight: '792px',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '64px'
          }}
        >
          <div className="h-full flex flex-col justify-between" style={{ boxSizing: 'border-box' }}>
            <div>
              <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <h2 className="text-2xl font-black tracking-tight uppercase" style={{ color: '#111827' }}>
                  SECTION 3: HIGH-RESOLUTION PDF COMPILATION & DIGITAL ARCHIVING
                </h2>
                <span className="text-xs font-mono px-2.5 py-1 rounded font-bold" style={{ color: '#10b981', backgroundColor: '#d1fae5' }}>Page 4 of 5</span>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-6">
                {/* Text Explanations */}
                <div className="space-y-4">
                  <h3 className="text-base font-black flex items-center gap-2 pl-2" style={{ borderLeft: '4px solid #10b981', color: '#111827' }}>
                    📑 High-DPI Unified PDF Report Generator
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>
                    Glory Grid provides professional-grade offline-first vector PDF exports structured for print sheets, stadium handbooks, and official league records:
                  </p>
                  <ul className="text-xs space-y-2 list-disc list-inside leading-relaxed pl-1" style={{ color: '#4b5563' }}>
                    <li><strong style={{ color: '#000000' }}>1-Click Workbook Synthesizer:</strong> Generates landscape-oriented multi-page files containing executive parameters, team standings, and pool rounds.</li>
                    <li><strong style={{ color: '#000000' }}>Vector Font Protection:</strong> Utilizing state-of-the-art double-DPI rasterization, the system preserves complex Gujarati glyph overlays and classic display fonts beautifully.</li>
                    <li><strong style={{ color: '#000000' }}>Offline Portability:</strong> Local state persistence guarantees full PDF compiling capabilities without external network dependencies.</li>
                  </ul>
                </div>

                {/* Styled Cloud Sync Visual Diagrams */}
                <div className="p-6 rounded-2xl flex flex-col justify-between" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div>
                    <span className="text-[10px] font-mono font-bold block mb-2 uppercase" style={{ color: '#9ca3af' }}>✦ Unified High-Fidelity PDF Export System</span>
                    <div className="rounded-xl p-4 space-y-3 shadow-md text-[10px] font-mono" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}>
                      <div className="flex items-center gap-2 pb-2 text-[8px] font-bold" style={{ borderBottom: '1px solid #e5e7eb', color: '#10b981' }}>
                        <span>🖨️ ELITE PRINT ENGINE</span>
                        <span style={{ 
                          backgroundColor: '#d1fae5', 
                          color: '#065f46', 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          fontSize: '8px', 
                          fontWeight: 'bold', 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          lineHeight: '1', 
                          height: '18px', 
                          boxSizing: 'border-box',
                          whiteSpace: 'nowrap'
                        }}>READY TO EXPORT</span>
                      </div>
                      <div className="space-y-1.5 text-[8px] leading-relaxed" style={{ color: '#4b5563' }}>
                        <p>📦 <strong>Exported Workbook Assets:</strong></p>
                        <li>📑 <i>Page 1: Executive Cover Sheet & Setup Parameters</i></li>
                        <li>📊 <i>Page 2: Group Pool Standings & Statistics tables</i></li>
                        <li>⚔ <i>Page 3: Interactive Tournament Tree Brackets</i></li>
                        <li>📅 <i>Page 4: Detailed Chronological Day Timelines</i></li>
                      </div>
                      <div className="p-2 rounded text-center text-xs font-bold" style={{ border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', color: '#047857' }}>
                        VECTOR EXPORT COMPILED SUCCESSFULLY
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg text-[10px] leading-relaxed" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                    ℹ <strong>Print Guidelines:</strong> When compiling PDF schedules, all sheets are rendered under high-DPI scaling limits (2x) to ensure pixel-perfect text representation at any print zoom levels.
                  </div>
                </div>
              </div>

            </div>
            
            <div className="pt-4 flex items-center justify-between text-[10px] font-mono" style={{ borderTop: '1px solid #e5e7eb', color: '#9ca3af' }}>
              <span>GLORY GRID SOFTWARE OPERATIONS MANUAL</span>
              <span>Doc Section: Page 4 of 5</span>
            </div>
          </div>
        </div>

        {/* PAGE 5: SMART PDF TABLE IMPORT & NAME MAPPING */}
        <div 
          className="manual-pdf-page font-sans text-left overflow-hidden relative"
          style={{
            width: '1120px',
            height: '792px',
            minWidth: '1120px',
            minHeight: '792px',
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '64px'
          }}
        >
          <div className="h-full flex flex-col justify-between" style={{ boxSizing: 'border-box' }}>
            <div>
              <div className="flex justify-between items-center pb-3" style={{ borderBottom: '1px solid #e5e7eb' }}>
                <h2 className="text-2xl font-black tracking-tight uppercase" style={{ color: '#111827' }}>
                  SECTION 4: SMART PDF TABLE IMPORT & NAME MAPPING ENGINE
                </h2>
                <span className="text-xs font-mono px-2.5 py-1 rounded font-bold" style={{ color: '#4f46e5', backgroundColor: '#e0e7ff' }}>Page 5 of 5</span>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-6">
                {/* Text Explanations */}
                <div className="space-y-4">
                  <h3 className="text-base font-black flex items-center gap-2 pl-2" style={{ borderLeft: '4px solid #4f46e5', color: '#111827' }}>
                    🔍 Advanced Intelligent PDF Roster Parser
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: '#4b5563' }}>
                    Our state-of-the-art document parser includes custom algorithms to make importing rosters from official documents completely friction-free:
                  </p>
                  <ul className="text-xs space-y-2.5 list-disc list-inside leading-relaxed pl-1" style={{ color: '#4b5563' }}>
                    <li>
                      <strong style={{ color: '#000000' }}>Table Title Suppression:</strong> 
                      Automatically detects and filters out non-table text titles like <i>"Neighborhood Household Demographics"</i> or general document headers to keep rosters pure.
                    </li>
                    <li>
                      <strong style={{ color: '#000000' }}>Case-Insensitive Column Target:</strong> 
                      Scans the table horizontally to locate headings matching <i>"NAME"</i> or <i>"name"</i>. Once found, that row is registered as the column header and safely excluded from imports.
                    </li>
                    <li>
                      <strong style={{ color: '#000000' }}>Atomic Full Name Extraction:</strong> 
                      Rather than splitting name segments, vertically stacked words in the name column are preserved as one complete player name. For example, <i>"Arthur Pendragon"</i> is imported together as <i>Player 1</i> instead of being split into separate player slots.
                    </li>
                  </ul>
                </div>

                {/* Styled Visual Guide mockup */}
                <div className="p-6 rounded-2xl flex flex-col justify-between" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div>
                    <span className="text-[10px] font-mono font-bold block mb-2 uppercase" style={{ color: '#9ca3af' }}>✦ Intelligent Import Mapping Pipeline</span>
                    <div className="rounded-xl p-4 space-y-3 shadow-md text-[10px]" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}>
                      <div className="flex items-center gap-2 pb-2 text-[9px] font-bold" style={{ borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>
                        <span>❌ AVOIDED: "Neighborhood Household Demographics"</span>
                        <span className="text-[8px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono font-normal">Table Header Skip</span>
                      </div>
                      
                      <div className="flex items-center gap-2 pb-2 text-[9px] font-bold" style={{ borderBottom: '1px solid #e5e7eb', color: '#16a34a' }}>
                        <span>❌ SKIPPED COLUMN HEADER: "NAME"</span>
                        <span className="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-mono font-normal">Target Identifier</span>
                      </div>

                      <div className="space-y-1.5 font-mono text-[8px] leading-relaxed pt-1" style={{ color: '#4b5563' }}>
                        <p className="font-sans font-bold text-indigo-600">✅ EXTRACTED ROSTER LIST:</p>
                        <div className="p-1.5 rounded" style={{ backgroundColor: '#fef08a', color: '#854d0e', border: '1px solid #fef08a' }}>
                          👤 Player 1: <strong>Arthur Pendragon</strong> <span className="text-[7px] text-amber-800 font-sans italic">(Imported as single whole name)</span>
                        </div>
                        <div className="p-1.5 rounded" style={{ backgroundColor: '#fef08a', color: '#854d0e', border: '1px solid #fef08a' }}>
                          👤 Player 2: <strong>Beatrice Portinari</strong> <span className="text-[7px] text-amber-800 font-sans italic">(Imported as single whole name)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg text-[10px] leading-relaxed" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                    ℹ <strong>Roster Rule:</strong> The parser will dynamically group cells vertically based on height and position tolerance. Multi-line stacked text remains bound to the correct player row.
                  </div>
                </div>
              </div>

            </div>
            
            <div className="pt-4 flex items-center justify-between text-[10px] font-mono" style={{ borderTop: '1px solid #e5e7eb', color: '#9ca3af' }}>
              <span>GLORY GRID SOFTWARE OPERATIONS MANUAL</span>
              <span>Doc Section: Page 5 of 5</span>
            </div>
          </div>
        </div>

      </div>

      {/* Styled Footer Block */}
      <footer className="w-full text-center py-6 border-t border-slate-800 bg-slate-950/40 relative z-10 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
        Tournament Fixture Generator © 2026 • Powered by Google DeepMind Gemini Speed Engine
      </footer>

      {showPortal && (
        <PortalWelcome onEnter={() => setShowPortal(false)} />
      )}
    </div>
  );
}
