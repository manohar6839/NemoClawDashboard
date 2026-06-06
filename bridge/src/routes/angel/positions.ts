/**
 * angel-positions.ts — Fetch open positions from Angel ONE Smart API
 * 
 * Endpoints:
 * - POST /login — Get JWT token
 * - GET /portfolio — Fetch positions
 */

import { Router, Request, Response } from "express";
import axios from "axios";
import * as OTPAuth from "otplib";

const router = Router();

const API_BASE = process.env.DATA_SOURCE === "live" 
  ? "https://smartapi.angelone.in" 
  : "https://smapi.angelone.in";

const API_KEY = process.env.ANGEL_ONE_API_KEY || "";
const CLIENT_ID = process.env.ANGEL_ONE_CLIENT_ID || "";
const PASSWORD = process.env.ANGEL_ONE_PASSWORD || "";
const TOTP_SECRET = process.env.ANGEL_ONE_TOTP_SECRET || "";

// In-memory token cache (simple, valid for ~1 day)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

// Generate TOTP from secret
function generateTOTP(secret: string): string {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: "AngelOne",
      label: "SmartAPI",
      algorithm: "sha1",
      digits: 6,
      period: 30,
      secret: secret
    });
    return totp.generate() as string;
  } catch (e) {
    console.error("[angel] TOTP generation failed:", e);
    return "";
  }
}

// Login to Angel ONE and get JWT token
async function getToken(): Promise<string | null> {
  // Check cache
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const totp = generateTOTP(TOTP_SECRET);
    if (!totp) {
      throw new Error("TOTP generation failed");
    }

    const payload = {
      clientcode: CLIENT_ID,
      password: PASSWORD,
      totp: totp,
      apiKey: API_KEY
    };

    const response = await axios.post(`${API_BASE}/login`, payload, {
      headers: { "Content-Type": "application/json" }
    });

    if (response.data?.status?.success) {
      cachedToken = response.data.data.jwtToken;
      // Token valid for ~24 hours, cache for 23 hours
      tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
      return cachedToken;
    } else {
      console.error("[angel] Login failed:", response.data);
      return null;
    }
  } catch (err: any) {
    console.error("[angel] Login error:", err.message);
    return null;
  }
}

// Fetch open positions
async function getPositions(): Promise<any[]> {
  const token = await getToken();
  if (!token) {
    throw new Error("Failed to get Angel ONE token");
  }

  try {
    const response = await axios.get(`${API_BASE}/portfolio`, {
      headers: {
        "Authorization": token,
        "Content-Type": "application/json"
      }
    });

    if (response.data?.status?.success) {
      return response.data.data || [];
    } else {
      return [];
    }
  } catch (err: any) {
    console.error("[angel] Portfolio fetch error:", err.message);
    return [];
  }
}

// GET /angel/positions — Get current positions
router.get("/positions", async (req: Request, res: Response) => {
  try {
    const positions = await getPositions();
    res.json({ ok: true, count: positions.length, positions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /angel/positions/short — Short summary (symbol + P&L only)
router.get("/positions/short", async (req: Request, res: Response) => {
  try {
    const positions = await getPositions();
    const summary = positions.map((p: any) => ({
      symbol: p.tradingSymbol || p.symbol || p.tsym,
      pnl: p.pnl || p.realizedPnL || p.unrealizedPnL || 0,
      quantity: p.quantity || p.qty || 0,
      ltp: p.ltp || p.avgPrice || 0
    }));
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
export { getPositions, getToken };