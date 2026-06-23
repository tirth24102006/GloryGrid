/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { GameType } from '../types';

interface ThreeDBackgroundProps {
  gameType: GameType | 'home';
}

interface FloatingObj {
  x: number;
  y: number;
  z: number;
  size: number;
  rx: number;
  ry: number;
  rz: number;
  vx: number;
  vy: number;
  vz: number;
  vrx: number;
  vry: number;
  vrz: number;
  type: string;
  color: string;
  accent: string;
}

export default function ThreeDBackground({ gameType }: ThreeDBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Dynamic resize handler
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Setup 3D elements array
    let objects: FloatingObj[] = [];
    const focalLength = 300;

    const createObjects = (type: GameType | 'home') => {
      const items: FloatingObj[] = [];
      const count = type === 'home' ? 12 : 8;

      for (let i = 0; i < count; i++) {
        let objType = '';
        let color = '#ccc';
        let accent = '#999';

        if (type === 'home') {
          // Mixed sports
          const r = Math.random();
          if (r < 0.33) {
            objType = 'ball';
            color = '#de2929'; // cricket ball
            accent = '#ffffff';
          } else if (r < 0.66) {
            objType = 'striker';
            color = '#543015'; // carrom coin wood
            accent = '#e3a857';
          } else {
            objType = 'bishop'; // chess
            color = '#111827'; // dark chess
            accent = '#6366f1';
          }
        } else if (type === 'cricket') {
          objType = Math.random() > 0.4 ? 'ball' : 'bat';
          color = objType === 'ball' ? '#ea580c' : '#b45309'; // reddish/orange ball, wood brown bat
          accent = objType === 'ball' ? '#ffffff' : '#f59e0b';
        } else if (type === 'carrom') {
          objType = Math.random() > 0.5 ? 'striker' : 'coin';
          color = objType === 'striker' ? '#be123c' : '#fbcfe8'; // ruby red striker, pink/white coins
          accent = objType === 'striker' ? '#fde047' : '#ec4899';
        } else if (type === 'chess') {
          const types = ['king', 'knight', 'pawn'];
          objType = types[Math.floor(Math.random() * types.length)];
          color = i % 2 === 0 ? '#1f2937' : '#f3f4f6'; // alternate black & white pieces
          accent = '#3b82f6';
        }

        items.push({
          x: (Math.random() - 0.5) * width,
          y: (Math.random() - 0.5) * height,
          z: Math.random() * 400 - 100,
          size: type === 'home' ? 20 + Math.random() * 25 : 30 + Math.random() * 35,
          rx: Math.random() * Math.PI,
          ry: Math.random() * Math.PI,
          rz: Math.random() * Math.PI,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          vz: (Math.random() - 0.5) * 0.3,
          vrx: (Math.random() - 0.5) * 0.015,
          vry: (Math.random() - 0.5) * 0.015,
          vrz: (Math.random() - 0.5) * 0.015,
          type: objType,
          color,
          accent,
        });
      }
      return items;
    };

    objects = createObjects(gameType);

    const drawBall = (c: CanvasRenderingContext2D, size: number, color: string, accent: string) => {
      // 3D Spherical Radial Gradient
      const grad = c.createRadialGradient(-size / 3, -size / 3, size / 8, 0, 0, size);
      grad.addColorStop(0, '#ffffff'); // Glare
      grad.addColorStop(0.2, color);
      grad.addColorStop(1, '#000000'); // Shadow

      c.fillStyle = grad;
      c.beginPath();
      c.arc(0, 0, size, 0, Math.PI * 2);
      c.fill();

      // Draw Seam (White stitched arc for 3D sphere depth)
      c.strokeStyle = accent;
      c.lineWidth = size * 0.08;
      c.setLineDash([size * 0.1, size * 0.1]);
      c.beginPath();
      // Curved seam wrapping around 3D rotating coordinates
      c.ellipse(0, 0, size, size * 0.25, Math.PI / 4, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    };

    const drawBat = (c: CanvasRenderingContext2D, size: number, color: string, accent: string) => {
      // Rotated rectangular plank (blade) + cylindrical handle
      c.shadowBlur = 10;
      c.shadowColor = 'rgba(0,0,0,0.3)';

      // Wood Grain Gradient
      const woodGrad = c.createLinearGradient(-size * 0.3, 0, size * 0.3, 0);
      woodGrad.addColorStop(0, '#5c2c04');
      woodGrad.addColorStop(0.5, color);
      woodGrad.addColorStop(1, '#3b1b01');

      // Bat Blade
      c.fillStyle = woodGrad;
      c.beginPath();
      c.moveTo(-size * 0.15, -size * 0.5);
      c.lineTo(size * 0.15, -size * 0.5);
      c.lineTo(size * 0.15, size * 0.4);
      c.bezierCurveTo(size * 0.1, size * 0.5, -size * 0.1, size * 0.5, -size * 0.15, size * 0.4);
      c.closePath();
      c.fill();

      // Handle (wrapped rubber grip)
      const gripGrad = c.createLinearGradient(-size * 0.05, 0, size * 0.05, 0);
      gripGrad.addColorStop(0, '#111');
      gripGrad.addColorStop(0.5, accent);
      gripGrad.addColorStop(1, '#111');

      c.fillStyle = gripGrad;
      c.fillRect(-size * 0.04, -size * 0.9, size * 0.08, size * 0.4);

      // Grip bands
      c.strokeStyle = '#fff';
      c.lineWidth = 1;
      for (let y = -size * 0.85; y <= -size * 0.55; y += size * 0.07) {
        c.beginPath();
        c.moveTo(-size * 0.04, y);
        c.lineTo(size * 0.04, y);
        c.stroke();
      }

      c.shadowBlur = 0;
    };

    const drawStrikerCoin = (c: CanvasRenderingContext2D, size: number, color: string, accent: string, isStriker: boolean) => {
      // concentric cylinders representing ivory carrom discs
      c.shadowBlur = 15;
      c.shadowColor = 'rgba(0,0,0,0.2)';

      const discGrad = c.createLinearGradient(0, -size * 0.2, 0, size * 0.2);
      discGrad.addColorStop(0, color);
      discGrad.addColorStop(0.4, accent);
      discGrad.addColorStop(1, '#1a0505');

      c.fillStyle = discGrad;
      // Draw 3D sloped edge
      c.beginPath();
      c.ellipse(0, 0, size, size * 0.6, 0, 0, Math.PI * 2);
      c.fill();

      if (isStriker) {
        // High quality central golden engraving star
        c.strokeStyle = '#fde047';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        c.stroke();

        c.fillStyle = '#fde047';
        c.beginPath();
        for (let j = 0; j < 8; j++) {
          const angle = (j * Math.PI) / 4;
          const outerX = Math.cos(angle) * size * 0.4;
          const outerY = Math.sin(angle) * size * 0.24;
          const innerX = Math.cos(angle + Math.PI / 8) * size * 0.15;
          const innerY = Math.sin(angle + Math.PI / 8) * size * 0.09;
          if (j === 0) c.moveTo(outerX, outerY);
          else c.lineTo(outerX, outerY);
          c.lineTo(innerX, innerY);
        }
        c.closePath();
        c.fill();
      } else {
        // Standard Carrom Coin Concentric Rings
        c.strokeStyle = 'rgba(0,0,0,0.4)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.ellipse(0, 0, size * 0.6, size * 0.36, 0, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.ellipse(0, 0, size * 0.3, size * 0.18, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.shadowBlur = 0;
    };

    const drawChessPiece = (c: CanvasRenderingContext2D, size: number, color: string, accent: string, pieceType: string) => {
      c.shadowBlur = 12;
      c.shadowColor = 'rgba(0,0,0,0.15)';

      const pieceGrad = c.createLinearGradient(-size * 0.3, 0, size * 0.3, 0);
      pieceGrad.addColorStop(0, color === '#f3f4f6' ? '#fff' : '#333');
      pieceGrad.addColorStop(0.5, color);
      pieceGrad.addColorStop(1, color === '#f3f4f6' ? '#a1a1aa' : '#090d16');

      c.fillStyle = pieceGrad;
      c.strokeStyle = color === '#f3f4f6' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)';
      c.lineWidth = 1;

      // Volumetric drawing of pieces using standard chess profiles
      c.beginPath();
      if (pieceType === 'pawn') {
        // Pawn profile
        c.moveTo(-size * 0.3, size * 0.6); // base
        c.lineTo(size * 0.3, size * 0.6);
        c.bezierCurveTo(size * 0.2, size * 0.4, size * 0.1, size * 0.3, size * 0.12, size * 0.1); // pedestal
        c.ellipse(0, -size * 0.2, size * 0.2, size * 0.2, 0, 0, Math.PI * 2); // head circle
        c.lineTo(-size * 0.12, size * 0.1);
        c.bezierCurveTo(-size * 0.1, size * 0.3, -size * 0.2, size * 0.4, -size * 0.3, size * 0.6);
      } else if (pieceType === 'king') {
        // King Profile with a Crown and Cross
        c.moveTo(-size * 0.35, size * 0.7); // base
        c.lineTo(size * 0.35, size * 0.7);
        c.lineTo(size * 0.25, size * 0.55);
        c.bezierCurveTo(size * 0.15, size * 0.1, size * 0.2, -size * 0.2, size * 0.25, -size * 0.4); // body waist
        c.lineTo(-size * 0.25, -size * 0.4);
        c.bezierCurveTo(-size * 0.2, -size * 0.2, -size * 0.15, size * 0.1, -size * 0.3, size * 0.55);
        c.closePath();
        c.fill();
        c.stroke();

        // Crown / Head block
        c.fillStyle = pieceGrad;
        c.beginPath();
        c.moveTo(-size * 0.2, -size * 0.4);
        c.lineTo(size * 0.2, -size * 0.4);
        c.lineTo(size * 0.2, -size * 0.5);
        c.lineTo(size * 0.05, -size * 0.45);
        c.lineTo(0, -size * 0.65); // Crown tip
        c.lineTo(-size * 0.05, -size * 0.45);
        c.lineTo(-size * 0.2, -size * 0.5);
        c.closePath();
        c.fill();
        c.stroke();

        // Cross representing King
        c.fillStyle = accent;
        c.fillRect(-size * 0.03, -size * 0.8, size * 0.06, size * 0.2);
        c.fillRect(-size * 0.08, -size * 0.74, size * 0.16, size * 0.05);
        return;
      } else {
        // Knight Profile (Horse)
        c.moveTo(-size * 0.35, size * 0.6); // base
        c.lineTo(size * 0.35, size * 0.6);
        c.bezierCurveTo(size * 0.25, size * 0.3, size * 0.28, size * 0.1, size * 0.15, -size * 0.1); // Back curve
        c.bezierCurveTo(size * 0.1, -size * 0.3, size * 0.05, -size * 0.5, -size * 0.1, -size * 0.55); // Mane top
        c.lineTo(-size * 0.25, -size * 0.4); // Snout
        c.bezierCurveTo(-size * 0.1, -size * 0.2, -size * 0.2, 0, -size * 0.22, size * 0.25); // Chest
        c.closePath();
      }
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
    };

    // Main animation loops
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep, sports-dynamic canvas light backlighting
      let gradBg = ctx.createRadialGradient(width / 2, height / 2, width / 6, width / 2, height / 2, width);
      if (gameType === 'cricket') {
        gradBg.addColorStop(0, 'rgba(239, 68, 68, 0.04)'); // Red glow
        gradBg.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
      } else if (gameType === 'carrom') {
        gradBg.addColorStop(0, 'rgba(16, 185, 129, 0.03)'); // Emerald green glow
        gradBg.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
      } else if (gameType === 'chess') {
        gradBg.addColorStop(0, 'rgba(99, 102, 241, 0.03)'); // Indigo chess glow
        gradBg.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
      } else {
        gradBg.addColorStop(0, 'rgba(59, 130, 246, 0.03)'); // Home neutral glow
        gradBg.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
      }
      ctx.fillStyle = gradBg;
      ctx.fillRect(0, 0, width, height);

      // Render 3D items inside coordinate frame
      objects.forEach(obj => {
        // Float update
        obj.x += obj.vx;
        obj.y += obj.vy;
        obj.z += obj.vz;

        // Rotation updates
        obj.rx += obj.vrx;
        obj.ry += obj.vry;
        obj.rz += obj.vrz;

        // Wrap around bounds (with 3D limits)
        const extendX = width / 2 + 100;
        const extendY = height / 2 + 100;
        
        if (obj.x < -extendX) obj.x = extendX;
        if (obj.x > extendX) obj.x = -extendX;
        if (obj.y < -extendY) obj.y = extendY;
        if (obj.y > extendY) obj.y = -extendY;
        if (obj.z < -150) obj.z = 250;
        if (obj.z > 250) obj.z = -150;

        // 3D Perspective Projection
        const scale = focalLength / (focalLength + obj.z);
        const projX = obj.x * scale + width / 2;
        const projY = obj.y * scale + height / 2;
        const projSize = obj.size * scale;

        // Only draw if within bounds
        if (projX > -100 && projX < width + 100 && projY > -100 && projY < height + 100) {
          ctx.save();
          ctx.translate(projX, projY);
          
          // Apply projected 3D Euler rotation matrices as 2D affine equivalents
          ctx.rotate(obj.rz);
          ctx.scale(Math.cos(obj.ry), Math.cos(obj.rx));

          // Set transparency based on depth Z to amplify 3D background atmosphere
          const alpha = Math.max(0.05, Math.min(0.25, 1 - (obj.z + 150) / 400));
          ctx.globalAlpha = alpha;

          // Dispatch visual painters
          if (obj.type === 'ball') {
            drawBall(ctx, projSize, obj.color, obj.accent);
          } else if (obj.type === 'bat') {
            drawBat(ctx, projSize, obj.color, obj.accent);
          } else if (obj.type === 'striker') {
            drawStrikerCoin(ctx, projSize, obj.color, obj.accent, true);
          } else if (obj.type === 'coin') {
            drawStrikerCoin(ctx, projSize, obj.color, obj.accent, false);
          } else if (obj.type === 'pawn' || obj.type === 'king' || obj.type === 'knight' || obj.type === 'bishop') {
            drawChessPiece(ctx, projSize, obj.color, obj.accent, obj.type);
          }

          ctx.restore();
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [gameType]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none -z-10 bg-slate-900 transition-colors duration-1000"
      style={{ mixBlendMode: 'plus-lighter' }}
    />
  );
}
