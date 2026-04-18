/**
 * gateway.ts — Proxy to OpenClaw Gateway inside Tiger container
 *
 * GET/POST /api/gateway/*
 * Forwards requests to the gateway running inside tiger-openclaw container
 */

import { Router } from "express";

const router = Router();

// Gateway URL - use Docker internal IP or container name
// The Tiger container has IP 172.17.0.3 on docker0 network
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "http://172.17.0.3:18789";

// Proxy all requests to the gateway inside the container
router.all("/", async (req, res) => {
  try {
    const targetUrl = `${GATEWAY_URL}${req.originalUrl.replace("/api/gateway", "")}`;

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization && {
          Authorization: req.headers.authorization,
        }),
      },
    };

    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (err: any) {
    if (err.message?.includes("ECONNREFUSED")) {
      res.status(503).json({
        error: "Gateway not accessible",
        details: "The gateway is running inside the Tiger container and not reachable. Check Docker networking.",
      });
    } else {
      res.status(500).json({
        error: "Failed to proxy to gateway",
        details: err.message,
      });
    }
  }
});

export default router;