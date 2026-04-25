/**
 * GET /tiger/config/models — list all models Tiger knows about
 * Response: { ok: true, models: [{ id, name, provider, reasoning, contextWindow }] }
 */
import { Router, Request, Response } from "express";
import { readModels } from "../tiger.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const models = await readModels();
    res.json({ ok: true, models });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
