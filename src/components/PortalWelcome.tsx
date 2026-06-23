import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface PortalWelcomeProps {
  onEnter: () => void;
  brandName?: string;
}

export default function PortalWelcome({ onEnter, brandName = "GLORY GRID" }: PortalWelcomeProps) {
  const [isEntering, setIsEntering] = useState(false);
  const [lockState, setLockState] = useState<'locked' | 'assembling' | 'opening' | 'receding' | 'unlocked'>('locked');
  const [isMobile, setIsMobile] = useState(false);
  
  const letters = brandName.split("");

  // Check screen responsive bounds for letter offsets
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Preset extreme coordinates outside the screen bounds for a cinematic scatter entry
  const scatterOffsets = [
    { x: -1200, y: -800, r: -240 },  // G
    { x: -1400, y: -200, r: 180 },   // L
    { x: -600, y: -1000, r: -90 },   // O
    { x: 600, y: -1100, r: 120 },    // R
    { x: 1300, y: -700, r: -150 },   // Y
    { x: 0, y: 1200, r: 0 },         // (space)
    { x: -1300, y: 600, r: 210 },    // G
    { x: -400, y: 1200, r: -135 },   // R
    { x: 800, y: 1100, r: 95 },      // I
    { x: 1400, y: 500, r: -180 },    // D
  ];

  const triggerAnimationSequence = () => {
    if (isEntering) return;
    setIsEntering(true);

    // Phase 1: Assemble - flying scattered letters merge beautifully intocenter
    setLockState('assembling');

    // Phase 2: Open Doors - sliding double screens open wide
    setTimeout(() => {
      setLockState('opening');
    }, 1200);

    // Phase 3: Recede - Title moves back into 3D horizon space
    setTimeout(() => {
      setLockState('receding');
    }, 1800);

    // Phase 4: Complete transition and mount dashboard
    setTimeout(() => {
      setLockState('unlocked');
      onEnter();
    }, 2500);
  };

  const getLetterAnimation = (idx: number) => {
    const scatter = scatterOffsets[idx % scatterOffsets.length];
    const letterSpacing = isMobile ? 24 : 48;
    const centerOffset = (idx - (letters.length - 1) / 2) * letterSpacing;

    switch (lockState) {
      case 'locked':
        // Secretly hidden in scattered coordinate matrix
        return {
          x: scatter.x,
          y: scatter.y,
          rotate: scatter.r,
          scale: 0.1,
          opacity: 0,
          color: '#06b6d4', // Initial cyan spark
        };

      case 'assembling':
      case 'opening':
        // Clustered perfectly into the glowing centered logo
        return {
          x: centerOffset,
          y: 0,
          rotate: 0,
          scale: 1,
          opacity: 1,
          color: '#10b981', // Glowing Emerald Cyber
        };

      case 'receding':
      case 'unlocked':
        // Zooming out into depth space
        return {
          x: centerOffset * 0.1,
          y: -100,
          rotate: -20,
          scale: 0.01,
          opacity: 0,
          color: '#6366f1', // Transitioning to indigo
        };

      default:
        return {};
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-[3px] select-none flex items-center justify-center font-mono">
      {/* Immersive Full-Screen Cinematic Cyber Doors */}
      <div className="absolute inset-0 flex z-30 pointer-events-none">
        
        {/* Left Double Door */}
        <motion.div 
          className="w-1/2 h-full border-r border-[#10b981]/30 relative flex items-center justify-end"
          style={{ 
            backgroundImage: 'radial-gradient(circle at right, #090e1a 0%, #020308 100%)',
            boxShadow: 'inset -20px 0 50px rgba(16, 185, 129, 0.05)'
          }}
          animate={(lockState === 'opening' || lockState === 'receding' || lockState === 'unlocked') 
            ? { x: '-100%', skewX: -4, opacity: 0 } 
            : { x: '0%', skewX: 0, opacity: 1 }}
          transition={{ duration: 1.3, ease: [0.77, 0, 0.175, 1] }}
        >
          {/* Neon laser guiding lines along the vertical seam */}
          <div className="w-[2px] h-32 bg-emerald-500/40 absolute right-[1px] top-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(16,185,129,0.7)]" />
        </motion.div>

        {/* Right Double Door */}
        <motion.div 
          className="w-1/2 h-full border-l border-[#10b981]/30 relative flex items-center justify-start"
          style={{ 
            backgroundImage: 'radial-gradient(circle at left, #090e1a 0%, #020308 100%)',
            boxShadow: 'inset 20px 0 50px rgba(16, 185, 129, 0.05)'
          }}
          animate={(lockState === 'opening' || lockState === 'receding' || lockState === 'unlocked') 
            ? { x: '100%', skewX: 4, opacity: 0 } 
            : { x: '0%', skewX: 0, opacity: 1 }}
          transition={{ duration: 1.3, ease: [0.77, 0, 0.175, 1] }}
        >
          {/* Neon laser guiding lines along the vertical seam */}
          <div className="w-[2px] h-32 bg-emerald-500/40 absolute left-[1px] top-1/2 -translate-y-1/2 shadow-[0_0_15px_rgba(16,185,129,0.7)]" />
        </motion.div>
      </div>

      {/* Scattered/Assembled Neon Letters */}
      <div className="absolute inset-x-0 h-40 flex items-center justify-center z-45 pointer-events-none">
        {letters.map((letter, idx) => {
          const isSpace = letter === " ";
          return (
            <motion.span
              key={idx}
              className={`absolute font-black uppercase text-center tracking-tight ${
                isMobile ? 'text-4xl' : 'text-7xl lg:text-8xl'
              }`}
              style={{
                textShadow: lockState !== 'locked' 
                  ? '0 0 20px rgba(16, 185, 129, 0.95), 0 0 45px rgba(16, 185, 129, 0.6)' 
                  : 'none'
              }}
              animate={getLetterAnimation(idx)}
              transition={{
                type: "spring",
                stiffness: lockState === 'receding' ? 140 : 90,
                damping: lockState === 'receding' ? 18 : 12,
                delay: lockState === 'assembling' ? idx * 0.05 : 0
              }}
            >
              {isSpace ? "\u200B" : letter}
            </motion.span>
          );
        })}
      </div>

      {/* Play/Trigger Launcher Centerpiece */}
      {lockState === 'locked' && (
        <div className="absolute z-50 flex flex-col items-center justify-center text-center">
          <motion.button
            type="button"
            onClick={triggerAnimationSequence}
            className="group px-10 py-4 font-mono font-bold text-sm tracking-[0.4em] uppercase text-emerald-400 bg-slate-950/90 border border-emerald-500/40 rounded-full hover:bg-emerald-950/60 hover:text-white transition-all duration-300 pointer-events-auto cursor-pointer shadow-[0_0_30px_rgba(16,185,129,0.15)] flex items-center justify-center gap-2"
            whileHover={{ 
              scale: 1.05, 
              boxShadow: '0 0 45px rgba(16,185,129,0.45)', 
              borderColor: 'rgba(16,185,129,0.8)' 
            }}
            whileTap={{ scale: 0.96 }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span>🚀 Let's Start</span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
