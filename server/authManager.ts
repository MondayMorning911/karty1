import { chromium } from 'playwright';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { Page, BrowserContext } from 'playwright-core';

// Ensure Firebase is initialized
if (!getApps().length) {
  try {
    initializeApp();
  } catch (e: any) {
    console.error("Firebase admin initialization warning:", e.message);
  }
}

const db = getFirestore();
const BROWSERLESS_WS_URL = 'ws://72.56.1.59:3001/chromium?token=KartyMustPassword';
const BROWSERLESS_DEBUG_URL = 'http://72.56.1.59:3001/?token=KartyMustPassword';

const ORCHESTRATOR_URL = 'http://72.56.1.59:8080';

export class AuthManager {
  static async startSession(userId: string, platform: 'ssge' | 'myhome' | 'realting' | 'korter') {
    console.log(`[AuthManager] Starting VPS session for ${platform} (User: ${userId})`);

    try {
      // Подключаемся к VPS Orchestrator
      const response = await fetch(`${ORCHESTRATOR_URL}/start-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, platform, proxy: '' })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start session on VPS');
      }

      console.log(`[AuthManager] VPS Session created: ${data.sessionId}, VNC: ${data.novncUrl}`);
      
      return { 
        interactiveUrl: data.novncUrl,
        sessionId: data.sessionId
      };
    } catch (error: any) {
      console.error(`[AuthManager] Failed to start VPS session:`, error.message);
      throw error;
    }
  }

  // Called when user clicks "I'm logged in"
  static async saveSession(userId: string, platform: string, sessionId: string) {
    try {
      console.log(`[AuthManager] Saving session for ${platform} via VPS Orchestrator...`);
      
      const res = await fetch(`${ORCHESTRATOR_URL}/check-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch session state');
      }

      const { storageState, localStorage } = data;
      
      if (!storageState) {
        throw new Error('No storage state returned from VPS');
      }

      // Сохраняем в Firestore
      await db.doc(`users/${userId}/sessions/${platform}`).set({
        state: storageState,
        localStorage: localStorage || {}, // сохраняем если есть
        sessionId: sessionId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await db.doc(`sessions/${userId}/platforms/${platform}`).set({
        state: storageState,
        localStorage: localStorage || {},
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      console.log(`[AuthManager] Session saved successfully for ${platform}. Stopping container...`);

      // Останавливаем контейнер
      fetch(`${ORCHESTRATOR_URL}/stop-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      }).catch(e => console.error("Error stopping container:", e));

      return { success: true };
    } catch (err: any) {
      console.error("[AuthManager] Save session error:", err.message);
      throw err;
    }
  }
}
