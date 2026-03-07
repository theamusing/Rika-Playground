/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Upload, 
  Play, 
  Pause, 
  X, 
  ChevronRight, 
  Settings2, 
  Gamepad2,
  Layers,
  Activity,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActionType, ActionConfig, Frame, GameParams } from './types';

const INITIAL_ACTIONS: ActionType[] = ['idle', 'walk', 'run', 'attack', 'jump', 'hit'];
const ASSETS_BASE_URL = 'https://cdn.rika-ai.com/assets/frontpage/examples/';

const DEFAULT_ACTION_CONFIG = (type: ActionType): ActionConfig => ({
  type,
  fps: 12,
  frames: [],
  maxFrames: 1,
  spriteSheetUrl: null,
  columns: 1,
  rows: 1,
  hitbox: { x: 0, y: 0, width: 150, height: 200 },
  ...(type === 'jump' ? { jumpMidPoint: 1 } : {})
});

// --- Components ---

const HitboxOverlay = ({ hitbox, frame, scale, onUpdate }: { 
  hitbox: { x: number, y: number, width: number, height: number },
  frame: { width: number, height: number },
  scale: number,
  onUpdate: (h: { x: number, y: number, width: number, height: number }) => void
}) => {
  const [dragging, setDragging] = useState<string | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startHitbox = useRef(hitbox);

  const onMouseDown = (e: React.MouseEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(edge);
    startPos.current = { x: e.clientX, y: e.clientY };
    startHitbox.current = { ...hitbox };
  };

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - startPos.current.x) / scale;
      const dy = (e.clientY - startPos.current.y) / scale;
      
      const newHitbox = { ...startHitbox.current };
      
      if (dragging === 'left') {
        newHitbox.x = startHitbox.current.x + dx;
        newHitbox.width = startHitbox.current.width - dx;
      } else if (dragging === 'right') {
        newHitbox.width = startHitbox.current.width + dx;
      } else if (dragging === 'top') {
        newHitbox.y = startHitbox.current.y + dy;
        newHitbox.height = startHitbox.current.height - dy;
      } else if (dragging === 'bottom') {
        newHitbox.height = startHitbox.current.height + dy;
      }
      
      onUpdate(newHitbox);
    };

    const onMouseUp = () => setDragging(null);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, scale, onUpdate]);

  const rectLeft = (-frame.width / 2 + hitbox.x) * scale;
  const rectTop = (-frame.height / 2 + hitbox.y) * scale;
  const rectWidth = hitbox.width * scale;
  const rectHeight = hitbox.height * scale;

  return (
    <div 
      className="absolute pointer-events-none"
      style={{
        left: '50%',
        top: '50%',
        width: rectWidth,
        height: rectHeight,
        transform: `translate(${rectLeft}px, ${rectTop}px)`,
        border: '2px solid #f97316', // orange-500
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
        zIndex: 50
      }}
    >
      {/* Drag Handles */}
      <div 
        onMouseDown={(e) => onMouseDown(e, 'left')}
        className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-ew-resize pointer-events-auto hover:bg-orange-500/30"
      />
      <div 
        onMouseDown={(e) => onMouseDown(e, 'right')}
        className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-ew-resize pointer-events-auto hover:bg-orange-500/30"
      />
      <div 
        onMouseDown={(e) => onMouseDown(e, 'top')}
        className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-ns-resize pointer-events-auto hover:bg-orange-500/30"
      />
      <div 
        onMouseDown={(e) => onMouseDown(e, 'bottom')}
        className="absolute bottom-0 left-0 right-0 h-2 -mb-1 cursor-ns-resize pointer-events-auto hover:bg-orange-500/30"
      />
    </div>
  );
};

export default function App() {
  // --- State ---
  const [actions, setActions] = useState<Record<ActionType, ActionConfig>>(() => {
    const initial: any = {};
    INITIAL_ACTIONS.forEach(type => {
      initial[type] = DEFAULT_ACTION_CONFIG(type);
    });
    return initial;
  });

  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [gameParams, setGameParams] = useState<GameParams>({
    walkSpeed: 4,
    runSpeed: 8,
    jumpVelocity: -15,
    gravity: 0.8,
    charScale: 1,
    horizonOffset: 0
  });

  // Character State
  const charPosRef = useRef({ x: 0, y: 0 });
  const charVelRef = useRef({ x: 0, y: 0 });
  const charStateRef = useRef<ActionType>('idle');
  const isGroundedRef = useRef(true);
  const currentFrameIndexRef = useRef(0);
  const jumpPhaseRef = useRef<'start' | 'mid' | 'end'>('start');
  const isRunJumpRef = useRef(false);
  const gameParamsRef = useRef(gameParams);
  const actionsRef = useRef(actions);

  const [charPos, setCharPos] = useState({ x: 0, y: 0 });
  const [charVel, setCharVel] = useState({ x: 0, y: 0 });
  const [charDir, setCharDir] = useState<1 | -1>(1);
  const [charState, setCharState] = useState<ActionType>('idle');
  const [isGrounded, setIsGrounded] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [editorFrameIndex, setEditorFrameIndex] = useState(0);
  const [jumpPhase, setJumpPhase] = useState<'start' | 'mid' | 'end'>('start');

  // Keep refs in sync with state
  useEffect(() => { gameParamsRef.current = gameParams; }, [gameParams]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  // Input State
  const keysPressed = useRef<Set<string>>(new Set());
  const prevKeysPressed = useRef<Set<string>>(new Set());

  // --- Animation Loop ---
  const lastFrameTime = useRef<number>(0);
  const charFrameAccumulator = useRef<number>(0);
  const editorFrameAccumulator = useRef<number>(0);

  const updateAnimation = useCallback((delta: number, nextState: ActionType) => {
    // 1. Update Character Animation (Always plays)
    let stateToAnimate = nextState;
    let charConfig = actionsRef.current[stateToAnimate];
    let charActiveFrames = charConfig.frames.slice(0, charConfig.maxFrames).filter(f => !f.masked);

    // Fallback logic for animation loop
    if (charActiveFrames.length === 0 && stateToAnimate !== 'idle') {
      stateToAnimate = 'idle';
      charConfig = actionsRef.current['idle'];
      charActiveFrames = charConfig.frames.slice(0, charConfig.maxFrames).filter(f => !f.masked);
    }

    if (charActiveFrames.length > 0) {
      const charFrameDuration = 1000 / charConfig.fps;
      charFrameAccumulator.current += delta;

      if (charFrameAccumulator.current >= charFrameDuration) {
        charFrameAccumulator.current = 0;

        if (stateToAnimate === 'jump') {
          const midPoint = charConfig.jumpMidPoint || 1;
          if (jumpPhaseRef.current === 'start') {
            if (currentFrameIndexRef.current < midPoint) {
              currentFrameIndexRef.current += 1;
            } else {
              jumpPhaseRef.current = 'mid';
            }
          } else if (jumpPhaseRef.current === 'end') {
            if (currentFrameIndexRef.current < charActiveFrames.length - 1) {
              currentFrameIndexRef.current += 1;
            }
          }
        } else if (stateToAnimate === 'attack' || stateToAnimate === 'hit') {
          if (currentFrameIndexRef.current < charActiveFrames.length - 1) {
            currentFrameIndexRef.current += 1;
          }
        } else {
          // Loop
          currentFrameIndexRef.current = (currentFrameIndexRef.current + 1) % charActiveFrames.length;
        }
        
        // Sync to React state for rendering
        setCurrentFrameIndex(currentFrameIndexRef.current);
        setJumpPhase(jumpPhaseRef.current);
      }
    }

    // 2. Update Editor Animation (Respects isPlaying)
    if (selectedAction && isPlaying) {
      const editorConfig = actionsRef.current[selectedAction];
      const editorActiveFrames = editorConfig.frames.slice(0, editorConfig.maxFrames).filter(f => !f.masked);

      if (editorActiveFrames.length > 0) {
        const editorFrameDuration = 1000 / editorConfig.fps;
        editorFrameAccumulator.current += delta;

        if (editorFrameAccumulator.current >= editorFrameDuration) {
          editorFrameAccumulator.current = 0;
          setEditorFrameIndex(prev => (prev + 1) % editorActiveFrames.length);
        }
      }
    }
  }, [selectedAction, isPlaying]);

  // --- Physics & Control Loop ---
  useEffect(() => {
    let rafId: number;
    const loop = (time: number) => {
      if (!lastFrameTime.current) lastFrameTime.current = time;
      const delta = time - lastFrameTime.current;
      lastFrameTime.current = time;

      // 1. Handle Inputs & State Machine
      const keys = keysPressed.current;
      const prevKeys = prevKeysPressed.current;
      
      const isMovingLeft = keys.has('a') || keys.has('arrowleft');
      const isMovingRight = keys.has('d') || keys.has('arrowright');
      const isRunning = keys.has('shift');
      
      // Just pressed logic
      const isJumping = keys.has(' ') && !prevKeys.has(' ');
      const isAttacking = keys.has('j') && !prevKeys.has('j');
      const isHitting = keys.has('h') && !prevKeys.has('h');

      const currentState = charStateRef.current;
      let nextState: ActionType = currentState;

      const config = actionsRef.current[currentState];
      const activeFrames = config.frames.slice(0, config.maxFrames).filter(f => !f.masked);
      const isAnimFinished = currentFrameIndexRef.current >= activeFrames.length - 1;

      // State Machine Logic
      if (currentState === 'hit') {
        if (isAnimFinished) nextState = 'idle';
        else nextState = 'hit';
      } else if (isHitting) {
        nextState = 'hit';
      } else if (currentState === 'jump') {
        if (isGroundedRef.current && isAnimFinished) nextState = 'idle';
        else nextState = 'jump';
      } else if (isJumping && isGroundedRef.current) {
        isRunJumpRef.current = currentState === 'run';
        nextState = 'jump';
        charVelRef.current.y = gameParamsRef.current.jumpVelocity;
        isGroundedRef.current = false;
      } else if (currentState === 'attack') {
        if (isAnimFinished) nextState = 'idle';
        else nextState = 'attack';
      } else if (isAttacking) {
        nextState = 'attack';
      } else if (isMovingLeft || isMovingRight) {
        nextState = isRunning ? 'run' : 'walk';
      } else {
        nextState = 'idle';
      }

      let didStateChange = false;
      // Reset animation when state changes
      if (nextState !== currentState) {
        didStateChange = true;
        currentFrameIndexRef.current = 0;
        charFrameAccumulator.current = 0;
        setCurrentFrameIndex(0);
        if (nextState === 'jump') {
          jumpPhaseRef.current = 'start';
          setJumpPhase('start');
        }
      }

      charStateRef.current = nextState;
      setCharState(nextState);
      setIsGrounded(isGroundedRef.current);

      if (isMovingLeft) setCharDir(-1);
      if (isMovingRight) setCharDir(1);

      // Update prevKeys for next frame
      prevKeysPressed.current = new Set(keys);

      // 2. Physics
      let targetVx = 0;
      if (nextState === 'walk' || nextState === 'run' || nextState === 'jump') {
        let speed = gameParamsRef.current.walkSpeed;
        if (nextState === 'run') {
          speed = gameParamsRef.current.runSpeed;
        } else if (nextState === 'jump' && isRunJumpRef.current) {
          speed = gameParamsRef.current.runSpeed;
        }
        
        if (isMovingLeft) targetVx = -speed;
        if (isMovingRight) targetVx = speed;
      }

      // Use a factor to normalize speed (assuming ~60fps)
      const timeScale = delta / 16.666; 
      
      // Horizontal smoothing (acceleration/deceleration)
      const lerpFactor = 0.25;
      charVelRef.current.x += (targetVx - charVelRef.current.x) * lerpFactor * timeScale;
      
      if (!isGroundedRef.current) {
        charVelRef.current.y += gameParamsRef.current.gravity * timeScale;
      }

      charPosRef.current.x += charVelRef.current.x * timeScale;
      charPosRef.current.y += charVelRef.current.y * timeScale;

      // Ground check
      if (charPosRef.current.y >= 0) {
        charPosRef.current.y = 0;
        charVelRef.current.y = 0;
        
        if (!isGroundedRef.current) {
          isGroundedRef.current = true;
          isRunJumpRef.current = false;
          setIsGrounded(true);
          // If we were jumping, ensure we enter the end phase to play landing frames
          if (charStateRef.current === 'jump') {
            jumpPhaseRef.current = 'end';
          }
        }
      }

      // Sync to state for rendering
      setCharPos({ ...charPosRef.current });
      setCharVel({ ...charVelRef.current });

      // Landing logic for jump animation
      // User: "当距离地面小于一个值且已经播放到mid时，继续播放后面的帧直到结束"
      if (nextState === 'jump' && charVelRef.current.y > 0 && Math.abs(charPosRef.current.y) < 100 && jumpPhaseRef.current === 'mid') {
         jumpPhaseRef.current = 'end';
      }

      // 3. Animation (Always plays)
      if (!didStateChange) {
        updateAnimation(delta, nextState);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [updateAnimation]);

  // --- Event Handlers ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: ActionType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      updateAction(type, { 
        spriteSheetUrl: url,
        columns: 1,
        rows: 1,
        maxFrames: 1,
        frames: [{ id: 0, x: 0, y: 0, width: img.width, height: img.height, masked: false }]
      });
    };
    img.src = url;
  };

  const updateAction = (type: ActionType, updates: Partial<ActionConfig>) => {
    setActions(prev => ({
      ...prev,
      [type]: { ...prev[type], ...updates }
    }));
  };

  const splitSpriteSheet = (type: ActionType, cols: number, rows: number) => {
    const config = actions[type];
    if (!config.spriteSheetUrl) return;

    const img = new Image();
    img.onload = () => {
      const frameWidth = img.width / cols;
      const frameHeight = img.height / rows;
      const newFrames: Frame[] = [];
      let id = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          newFrames.push({
            id: id++,
            x: c * frameWidth,
            y: r * frameHeight,
            width: frameWidth,
            height: frameHeight,
            masked: false
          });
        }
      }
      const maxFrames = newFrames.length;
      updateAction(type, { 
        columns: cols, 
        rows: rows, 
        frames: newFrames,
        maxFrames: maxFrames,
        hitbox: { x: 0, y: 0, width: frameWidth, height: frameHeight },
        ...(type === 'jump' ? { jumpMidPoint: Math.floor(maxFrames / 2) } : {})
      });
    };
    img.src = config.spriteSheetUrl;
  };

  // --- Render Helpers ---
  const renderSprite = (type: ActionType, frameIdx: number, scale = 1, flip = 1, constrain = false, fixedSize?: number, noFallback = false) => {
    const config = actions[type];
    const activeFrames = config.frames.slice(0, config.maxFrames).filter(f => !f.masked);
    
    // Fallback logic
    let displayConfig = config;
    let displayFrames = activeFrames;

    if (displayFrames.length === 0 && !noFallback) {
      displayConfig = actions['idle'];
      displayFrames = displayConfig.frames.slice(0, displayConfig.maxFrames).filter(f => !f.masked);
    }

    if (displayFrames.length === 0) {
      const placeholder = (
        <div 
          className="border-2 border-orange-500 border-dashed rounded-sm" 
          style={{ width: 150, height: 200 }}
        />
      );
      if (fixedSize) {
        return (
          <div className="relative flex items-center justify-center overflow-hidden" style={{ width: fixedSize, height: fixedSize }}>
            {placeholder}
          </div>
        );
      }
      return placeholder;
    }

    const frame = displayFrames[frameIdx % displayFrames.length];
    const baseStyle: React.CSSProperties = {
      width: frame.width,
      height: frame.height,
      backgroundImage: `url(${displayConfig.spriteSheetUrl})`,
      backgroundPosition: `-${frame.x}px -${frame.y}px`,
      transform: `scale(${scale * flip}, ${scale})`,
      transformOrigin: 'center',
      imageRendering: 'pixelated',
      flexShrink: 0
    };

    if (fixedSize) {
      const s = (fixedSize / Math.max(frame.width, frame.height)) * scale;
      return (
        <div className="relative flex items-center justify-center overflow-hidden" style={{ width: fixedSize, height: fixedSize }}>
          <div style={{
            ...baseStyle,
            position: 'absolute',
            transform: `scale(${s * flip}, ${s})`
          }} />
        </div>
      );
    }

    if (constrain) {
      // For editor preview, ensure it fits the container
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <div style={{
            ...baseStyle,
            transform: `scale(${Math.min(1, 400 / frame.width, 400 / frame.height) * scale * flip}, ${Math.min(1, 400 / frame.width, 400 / frame.height) * scale})`
          }} />
        </div>
      );
    }

    return (
      <div style={baseStyle} />
    );
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-zinc-300 font-sans selection:bg-emerald-500/30 select-none">
      {/* --- Left Sidebar: Action List --- */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-[#0f0f12]">
        <div className="p-6 border-bottom border-white/5">
          <h1 className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            RIKA PLAYGROUND
          </h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {INITIAL_ACTIONS.map(type => (
            <div 
              key={type}
              onClick={() => setSelectedAction(type)}
              className={`group cursor-pointer rounded-xl border p-3 transition-all ${
                selectedAction === type 
                  ? 'bg-emerald-500/10 border-emerald-500/50' 
                  : 'bg-white/5 border-transparent hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300">
                    {type}
                  </span>
                  {type === 'jump' && actions['jump'].frames.length > 0 && (() => {
                    const config = actions['jump'];
                    const activeFrames = config.frames.slice(0, config.maxFrames).filter(f => !f.masked);
                    if (activeFrames.length === 0) return null;
                    const frameIdx = Math.floor(Date.now() / (1000 / config.fps)) % activeFrames.length;
                    const mid = config.jumpMidPoint || 0;
                    if (frameIdx >= 1 && frameIdx <= mid) return <ArrowUp className="w-3 h-3 text-red-500" />;
                    if (frameIdx > mid) return <ArrowDown className="w-3 h-3 text-blue-500" />;
                    return null;
                  })()}
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${selectedAction === type ? 'rotate-90 text-emerald-500' : 'text-zinc-600'}`} />
              </div>
              
              <div className="aspect-square bg-black/40 rounded-lg flex items-center justify-center overflow-hidden border border-white/5">
                {renderSprite(type, Math.floor(Date.now() / (1000 / actions[type].fps)), 1, 1, false, 180, true)}
              </div>

              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500">FPS</span>
                  <input 
                    type="range" 
                    min="8" 
                    max="16" 
                    step="1"
                    value={actions[type].fps}
                    onChange={(e) => updateAction(type, { fps: parseInt(e.target.value) })}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 select-text"
                  />
                  <span className="text-[10px] font-mono text-emerald-500 w-4">{actions[type].fps}</span>
                </div>

                {type === 'jump' && (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] font-mono text-zinc-500">MID</span>
                    <input 
                      type="range" 
                      min="1" 
                      max={Math.max(1, actions['jump'].maxFrames - 1)}
                      step="1"
                      value={actions['jump'].jumpMidPoint}
                      onChange={(e) => updateAction('jump', { jumpMidPoint: parseInt(e.target.value) })}
                      className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 select-text"
                    />
                    <span className="text-[10px] font-mono text-emerald-500 w-4">{actions['jump'].jumpMidPoint}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Main Area --- */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedAction ? (
            /* --- Sprite Editor View --- */
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col p-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <button 
                  onClick={() => setSelectedAction(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-zinc-400 hover:text-white"
                >
                  <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
                <div>
                  <h2 className="text-3xl font-bold text-white capitalize">{selectedAction} Editor</h2>
                  <p className="text-zinc-500 text-sm">Configure your sprite sheet and frame sequence</p>
                </div>
              </div>

              {/* Editor Main Preview */}
              <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 flex items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 opacity-20 pointer-events-none" 
                  style={{ 
                    backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', 
                    backgroundSize: '20px 20px' 
                  }} 
                />
                <div className="aspect-square w-full max-w-[400px] flex items-center justify-center">
                  {renderSprite(selectedAction, editorFrameIndex, 1, 1, false, 400)}
                </div>
              </div>

              {/* Frame Strip */}
              <div className="mt-12">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Frame Sequence</h3>
                  <span className="text-xs font-mono text-zinc-600">{actions[selectedAction].frames.length} total frames</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                  {actions[selectedAction].frames.slice(0, actions[selectedAction].maxFrames).map((frame, idx) => (
                    <div 
                      key={frame.id}
                      onClick={() => {
                        setEditorFrameIndex(idx);
                        setIsPlaying(false);
                      }}
                      className={`relative flex-shrink-0 rounded-lg border flex items-center justify-center bg-black/20 overflow-hidden transition-all cursor-pointer group/frame aspect-square h-[100px] ${
                        editorFrameIndex === idx ? 'ring-2 ring-emerald-500 border-emerald-500' : ''
                      } ${
                        frame.masked ? 'border-red-500/50' : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div 
                         className="absolute"
                         style={{
                          width: frame.width,
                          height: frame.height,
                          backgroundImage: `url(${actions[selectedAction].spriteSheetUrl})`,
                          backgroundPosition: `-${frame.x}px -${frame.y}px`,
                          transform: `scale(${100 / Math.max(frame.width, frame.height)})`,
                          transformOrigin: 'center',
                          imageRendering: 'pixelated'
                        }}
                      />
                      {frame.masked && <div className="absolute inset-0 bg-red-500/40 z-10" />}
                      <div className="absolute inset-0 bg-black/0 group-hover/frame:bg-black/20 transition-colors pointer-events-none z-0" />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const newFrames = [...actions[selectedAction].frames];
                          newFrames[idx].masked = !newFrames[idx].masked;
                          updateAction(selectedAction, { frames: newFrames });
                        }}
                        className={`absolute top-1 right-1 p-1 rounded-md transition-all scale-0 group-hover/frame:scale-100 z-20 ${
                          frame.masked ? 'bg-red-500 text-white opacity-100' : 'bg-black/80 text-zinc-400 hover:text-white hover:bg-red-500'
                        }`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 text-[9px] font-mono text-zinc-400 px-1.5 py-0.5 bg-black/80 rounded-md border border-white/5 z-20">{idx}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            /* --- Game Preview View --- */
            <motion.div 
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 relative bg-[#050507]"
            >
              {/* Game Map Background */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="relative w-full h-full bg-center bg-cover bg-no-repeat transition-all duration-500"
                  style={{ backgroundImage: `url(${ASSETS_BASE_URL}bg1.png)` }}
                />
              </div>

              {/* Character */}
              <div 
                className="absolute left-1/2"
                style={{ 
                  bottom: `${128 - gameParams.horizonOffset}px`,
                  transform: `translate(calc(-50% + ${charPos.x}px), ${charPos.y}px)` 
                }}
              >
                {renderSprite(charState, currentFrameIndex, 1, charDir, false, 256 * gameParams.charScale)}
                
                {/* Hitbox Overlay */}
                {actions['idle'].spriteSheetUrl && actions['idle'].hitbox && (
                  <HitboxOverlay 
                    hitbox={actions['idle'].hitbox!}
                    frame={actions['idle'].frames[0] || { width: 150, height: 200 }}
                    scale={(256 * gameParams.charScale) / Math.max(
                      actions['idle'].frames[0]?.width || 150,
                      actions['idle'].frames[0]?.height || 200
                    )}
                    onUpdate={(newHitbox) => {
                      const idleFrame = actions['idle'].frames[0] || { width: 150, height: 200 };
                      // Clamp hitbox to frame dimensions
                      const clamped = {
                        x: Math.max(0, Math.min(idleFrame.width, newHitbox.x)),
                        y: Math.max(0, Math.min(idleFrame.height, newHitbox.y)),
                        width: Math.max(0, Math.min(idleFrame.width - Math.max(0, newHitbox.x), newHitbox.width)),
                        height: Math.max(0, Math.min(idleFrame.height - Math.max(0, newHitbox.y), newHitbox.height))
                      };
                      // Re-adjust x/y if width/height were clamped by bounds
                      clamped.x = Math.max(0, Math.min(idleFrame.width - clamped.width, clamped.x));
                      clamped.y = Math.max(0, Math.min(idleFrame.height - clamped.height, clamped.y));

                      updateAction('idle', { hitbox: clamped });
                    }}
                  />
                )}
                
                {/* Debug Info */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 px-2 py-1 rounded text-[10px] font-mono border border-white/10">
                  <span className="text-emerald-500">{charState}</span> | F:{currentFrameIndex}
                </div>
              </div>

              {/* Controls Overlay */}
              <div className="absolute bottom-8 left-8 flex gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex gap-1 justify-center">
                    <kbd className="px-2 py-1 bg-white/10 rounded border border-white/10 text-[10px]">W</kbd>
                  </div>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-white/10 rounded border border-white/10 text-[10px]">A</kbd>
                    <kbd className="px-2 py-1 bg-white/10 rounded border border-white/10 text-[10px]">S</kbd>
                    <kbd className="px-2 py-1 bg-white/10 rounded border border-white/10 text-[10px]">D</kbd>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                   <kbd className="px-4 py-1 bg-white/10 rounded border border-white/10 text-[10px]">SPACE (Jump)</kbd>
                   <kbd className="px-4 py-1 bg-white/10 rounded border border-white/10 text-[10px]">SHIFT (Run)</kbd>
                </div>
                <div className="flex flex-col gap-1">
                   <kbd className="px-4 py-1 bg-white/10 rounded border border-white/10 text-[10px]">J (Attack)</kbd>
                   <kbd className="px-4 py-1 bg-white/10 rounded border border-white/10 text-[10px]">H (Hit)</kbd>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Right Sidebar: Parameters --- */}
      <div className="w-80 border-l border-white/5 bg-[#0f0f12] p-6 flex flex-col gap-8">
        {selectedAction ? (
          /* Editor Controls */
          <div className="space-y-8">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                <Upload className="w-4 h-4" /> Sprite Sheet
              </h3>
              {actions[selectedAction].spriteSheetUrl ? (
                <div className="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40 h-32 flex items-center justify-center">
                  <img 
                    src={actions[selectedAction].spriteSheetUrl} 
                    className="max-w-full max-h-full object-contain p-2" 
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    onClick={() => updateAction(selectedAction, { spriteSheetUrl: null, frames: [], maxFrames: 1 })}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/5 hover:border-emerald-500/50 transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                    <p className="text-xs text-zinc-500">Click to upload</p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden select-text" 
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, selectedAction)}
                  />
                </label>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4" /> Splitting
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 uppercase">Columns</label>
                  <input 
                    type="number" 
                    min="1"
                    value={actions[selectedAction].columns}
                    onChange={(e) => splitSpriteSheet(selectedAction, parseInt(e.target.value) || 1, actions[selectedAction].rows)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 select-text"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-500 uppercase">Rows</label>
                  <input 
                    type="number" 
                    min="1"
                    value={actions[selectedAction].rows}
                    onChange={(e) => splitSpriteSheet(selectedAction, actions[selectedAction].columns, parseInt(e.target.value) || 1)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 select-text"
                  />
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] text-zinc-500 uppercase">Frame Count</label>
                  <span className="text-xs font-mono text-emerald-500">{actions[selectedAction].maxFrames}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max={actions[selectedAction].frames.length || 1}
                  step="1"
                  value={actions[selectedAction].maxFrames}
                  onChange={(e) => updateAction(selectedAction, { maxFrames: parseInt(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 select-text"
                />
              </div>
            </section>

            {/* Jump Midpoint removed from here */}
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isPlaying ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-emerald-500 text-black hover:bg-emerald-400'
              }`}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isPlaying ? 'PAUSE PREVIEW' : 'PLAY PREVIEW'}
            </button>
          </div>
        ) : (
          /* Game Parameters */
          <div className="space-y-8 overflow-y-auto">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> Character Params
              </h3>
              <div className="space-y-6">
                {[
                  { label: 'Display Scale', key: 'charScale', min: 0.25, max: 4, step: 0.05 },
                  { label: 'Horizon Offset', key: 'horizonOffset', min: -1000, max: 1000, step: 10 },
                ].map(param => (
                  <div key={param.key} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-zinc-500 uppercase">{param.label}</label>
                      <span className="text-xs font-mono text-emerald-500">{(gameParams as any)[param.key]}</span>
                    </div>
                    <input 
                      type="range" 
                      min={param.min} 
                      max={param.max} 
                      step={param.step || 1}
                      value={(gameParams as any)[param.key]}
                      onChange={(e) => setGameParams(prev => ({ ...prev, [param.key]: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 select-text"
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Physics Params
              </h3>
              
              <div className="space-y-6">
                {[
                  { label: 'Walk Speed', key: 'walkSpeed', min: 1, max: 10 },
                  { label: 'Run Speed', key: 'runSpeed', min: 1, max: 20 },
                  { label: 'Jump Power', key: 'jumpVelocity', min: 5, max: 30 },
                  { label: 'Gravity', key: 'gravity', min: 0.1, max: 2, step: 0.1 },
                ].map(param => (
                  <div key={param.key} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-zinc-500 uppercase">{param.label}</label>
                      <span className="text-xs font-mono text-emerald-500">
                        {param.key === 'jumpVelocity' ? Math.abs((gameParams as any)[param.key]) : (gameParams as any)[param.key]}
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min={param.min} 
                      max={param.max} 
                      step={param.step || 1}
                      value={param.key === 'jumpVelocity' ? Math.abs((gameParams as any)[param.key]) : (gameParams as any)[param.key]}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setGameParams(prev => ({ 
                          ...prev, 
                          [param.key]: param.key === 'jumpVelocity' ? -val : val 
                        }));
                      }}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 select-text"
                    />
                  </div>
                ))}
              </div>
            </section>

            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <h4 className="text-[10px] font-bold text-emerald-500 uppercase mb-2 flex items-center gap-2">
                <Gamepad2 className="w-3 h-3" /> State Machine
              </h4>
              <ul className="text-[10px] text-zinc-500 space-y-1 list-disc pl-3">
                <li>Jump/Hit are uninterruptible</li>
                <li>Attack can be interrupted by Hit</li>
                <li>Cannot move while Attacking</li>
                <li>Jump allows air movement</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
