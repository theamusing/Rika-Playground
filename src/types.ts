import { Type } from "@google/genai";

export type ActionType = 'idle' | 'walk' | 'run' | 'attack' | 'jump' | 'hit';

export interface Frame {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  masked: boolean;
}

export interface ActionConfig {
  type: ActionType;
  fps: number;
  frames: Frame[];
  maxFrames: number; // New: limit the number of frames used
  spriteSheetUrl: string | null;
  columns: number;
  rows: number;
  jumpMidPoint?: number; // Special for jump
  hitbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface GameParams {
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  gravity: number;
  charScale: number;
  horizonOffset: number;
}
