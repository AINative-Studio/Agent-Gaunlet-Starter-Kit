/**
 * Voice module for Cody — plays intro clip and narrates key events via macOS TTS.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const VOICE_SAMPLE = join(process.cwd(), 'voice-sample-matrix-mode.mp3');

// Use a calm, clear macOS voice. "Samantha" is clean and professional.
const TTS_VOICE = process.env.CODY_VOICE || 'Samantha';
const TTS_RATE = Number(process.env.CODY_RATE || '185'); // words per minute

let voiceEnabled = true;

export function disableVoice() { voiceEnabled = false; }
export function enableVoice() { voiceEnabled = true; }

/**
 * Play the Cody intro voice clip (non-blocking, returns immediately).
 */
export function playIntro(): Promise<void> {
  if (!voiceEnabled) return Promise.resolve();
  if (!existsSync(VOICE_SAMPLE)) {
    console.error('[voice] Intro clip not found, skipping');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const proc = spawn('afplay', [VOICE_SAMPLE], { stdio: 'ignore' });
    proc.on('close', resolve);
    proc.on('error', () => resolve());
  });
}

/**
 * Speak a line using macOS TTS (non-blocking fire-and-forget).
 */
export function speak(text: string): void {
  if (!voiceEnabled) return;
  try {
    execFile('say', ['-v', TTS_VOICE, '-r', String(TTS_RATE), text], (err) => {
      if (err) { /* silent fail */ }
    });
  } catch { /* silent fail */ }
}

/**
 * Speak a line and wait for it to finish.
 */
export function speakSync(text: string): Promise<void> {
  if (!voiceEnabled) return Promise.resolve();
  return new Promise((resolve) => {
    execFile('say', ['-v', TTS_VOICE, '-r', String(TTS_RATE), text], () => resolve());
  });
}

/**
 * Narrate key arena events — called from agent.ts at milestone points.
 */
export const narrate = {
  online: () => speak('Cody online. Connecting to arena.'),
  registered: () => speak('Registered. Discovering tools.'),
  toolsFound: (n: number) => speak(`${n} tools discovered. Fetching challenge.`),
  solvingText: () => speak('Text challenge received. Gathering clues and solving.'),
  solvingImage: (type: string) => speak(`Image ${type} challenge. Processing now.`),
  submitting: () => speak('Submitting answer.'),
  score: (final: number) => speak(`Score: ${Math.round(final)} points.`),
  done: () => speak('Cody out.'),
};
