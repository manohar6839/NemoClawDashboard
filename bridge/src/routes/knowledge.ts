/**
 * knowledge.ts — Knowledge Graph endpoints
 * Uses raw SQL execution to create tables if not exist
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";

const router = Router();

// Ensure tables exist
const initTables = () => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_edges (
        id TEXT PRIMARY KEY,
        from_node TEXT NOT NULL,
        to_node TEXT NOT NULL,
        relationship TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  } catch (e) { /* tables may exist */ }
};
initTables();

// List all nodes
router.get("/", async (req: Request, res: Response) => {
  const { q, limit = 50 } = req.query;
  try {
    let sql = "SELECT * FROM knowledge_nodes";
    const params: string[] = [];
    if (q) {
      sql += " WHERE name LIKE ? OR description LIKE ?";
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(String(limit));
    const nodes = db.prepare(sql).all(...params);
    res.json({ nodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get node with connections
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const node = db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(id);
    if (!node) return res.status(404).json({ error: "Not found" });
    // Get all edges for graph
    const edges = db.prepare(`
      SELECT ke.from_node, ke.to_node, ke.relationship, kn.name as to_name
      FROM knowledge_edges ke
      JOIN knowledge_nodes kn ON ke.to_node = kn.id
    `).all();
    // Get all nodes for graph
    const allNodes = db.prepare("SELECT * FROM knowledge_nodes").all();
    res.json({ node, connections: edges, allNodes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create node
router.post("/", async (req: Request, res: Response) => {
  const { type, name, description } = req.body;
  if (!type || !name) return res.status(400).json({ error: "type, name required" });
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO knowledge_nodes (id, type, name, description) VALUES (?, ?, ?, ?)")
      .run(id, type, name, description || "");
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create connection
router.post("/connect", async (req: Request, res: Response) => {
  const { from, to, relationship } = req.body;
  if (!from || !to || !relationship) {
    return res.status(400).json({ error: "from, to, relationship required" });
  }
  try {
    const id = randomUUID();
    db.prepare("INSERT INTO knowledge_edges (id, from_node, to_node, relationship) VALUES (?, ?, ?, ?)")
      .run(id, from, to, relationship);
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Seed initial knowledge
router.post("/seed", async (req: Request, res: Response) => {
  const nodes = [
    { t: "person", n: "Manohar", d: "IIT Roorkee, IIM Rohtak, works at Renew Power" },
    { t: "company", n: "Renew Power", d: "India renewable energy, NYSE: RNW" },
    { t: "company", n: "Adani Green", d: "Competitor in renewables" },
    { t: "concept", n: "PE/VC", d: "Career path interest" },
    { t: "concept", n: "Option Trading", d: "Nifty options selling" },
  ];
  try {
    for (const x of nodes) {
      db.prepare("INSERT OR IGNORE INTO knowledge_nodes (id, type, name, description) VALUES (?, ?, ?, ?)")
        .run(randomUUID(), x.t, x.n, x.d);
    }
    res.json({ ok: true, count: nodes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;