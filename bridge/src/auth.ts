/**
 * auth.ts — Simple bearer token auth for the Bridge API.
 * 
 * The dashboard (running on the same machine) sends a shared secret.
 * This prevents unauthorized access if the bridge port is accidentally exposed.
 * Token is set via TIGER_BRIDGE_TOKEN env var.
 */

import { Request, Response, NextFunction } from "express";

const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth if no token configured (local dev mode)
  if (!BRIDGE_TOKEN) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.slice(7);
  if (token !== BRIDGE_TOKEN) {
    return res.status(403).json({ error: "Invalid token" });
  }

  next();
}
