/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ShieldAlert, Sparkles } from 'lucide-react';

interface LoadingViewProps {
  gameType: GameType;
  onFinish: () => void;
}

const MESSAGES_CRICKET = [
  "Drafting pool seeds...",
  "Calibrating pitch schedules...",
  "Integrating power-of-two byes...",
  "Assigning match timeline slots...",
  "Structuring one-sided bracket trees...",
  "Aligning championship finals pool..."
];

const MESSAGES_CARROM = [
  "Seeding strikers and pockets...",
  "Setting friction calculations...",
  "Structuring doubles pairings...",
  "Arranging match resting buffers...",
  "Generating single elim rounds...",
  "Finalizing championship layout..."
];

const MESSAGES_CHESS = [
  "Setting up Sicilian defense...",
  "Initializing Elo seeds...",
  "Balancing white and black turns...",
  "Sequencing matches with resting logs...",
  "Building one-sided chess matrices...",
  "Constructing ultimate final stage..."
];

export default function LoadingView({ gameType, onFinish }: LoadingViewProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  const messages = {
    cricket: MESSAGES_CRICKET,
    carrom: MESSAGES_CARROM,
    chess: MESSAGES_CHESS,
  }[gameType];

  const onFinishRef = React.useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    // Cycle messages every 500ms
    const interval = setInterval(() => {
      setMsgIdx(prev => (prev + 1) % messages.length);
    }, 500);

    // Auto-complete loading after 2.2 seconds for realistic athletic pacing
    const timeout = setTimeout(() => {
      onFinishRef.current();
    }, 2200);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [messages.length]);

  const colorClass = {
    cricket: "text-orange-500 border-orange-500",
    carrom: "text-emerald-500 border-emerald-500",
    chess: "text-indigo-500 border-indigo-500",
  }[gameType];

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4">
      {/* Container Card */}
      <div className="relative max-w-md w-full bg-slate-950/80 rounded-3xl p-10 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-md">
        
        {/* Glow Element */}
        <div className={`absolute -top-12 -left-12 w-32 h-32 opacity-10 blur-2xl rounded-full ${colorClass.split(' ')[0]}`} />

        {/* 3D Spinning Orb Spinner */}
        <div className="relative w-28 h-28 mx-auto mb-8 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className={`absolute w-full h-full rounded-full border-[3px] border-t-transparent border-r-transparent ${colorClass.split(' ')[1]}`}
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className={`absolute w-5/6 h-5/6 rounded-full border border-b-transparent border-l-transparent opacity-60 ${colorClass.split(' ')[1]}`}
          />
          <Trophy size={32} className={`relative ${colorClass.split(' ')[0]} animate-bounce`} />
        </div>

        {/* Loading text headers */}
        <h3 className="text-xl font-bold text-white tracking-tight mb-2">
          Generating Tournament
        </h3>
        <p className="text-xs font-mono text-slate-400 tracking-wider uppercase mb-6">
          Architecting Arena
        </p>

        {/* Dynamic cycling message bar */}
        <div className="h-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={msgIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="text-sm font-mono text-slate-300 flex items-center gap-1.5"
            >
              <Sparkles size={13} className={`${colorClass.split(' ')[0]} animate-pulse`} />
              {messages[msgIdx]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom micro bar indicator */}
        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-8">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 2.2, ease: "easeInOut" }}
            className={`h-full bg-gradient-to-r ${
              gameType === 'cricket' ? 'from-orange-500 to-amber-500' :
              gameType === 'carrom' ? 'from-emerald-500 to-teal-500' :
              'from-indigo-500 to-blue-500'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
