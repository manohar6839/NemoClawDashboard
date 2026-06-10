---
name: angel-positions
description: Read Manohar's live Angel One trading positions and P&L from the standalone position-tracker. Use when asked about positions, profit/loss, exposure, or how the portfolio is doing right now. Read-only — this skill can never place, modify, or close trades.
---

# Angel One Positions (read-only)

The standalone position-tracker (own repo/deploy) is the single source of
truth for live positions. Endpoint:

```bash
curl -s https://angel.manohargupta.com/api/positions
```

Response: array of positions with `tradingsymbol`, `exchange`, `netqty`,
`ltp`, `avg_price`, `unrealised_pnl` (₹), `realised_pnl` (₹).

## Reporting rules
- Always report P&L in ₹ with the sign, per position and total.
- Note market hours: NSE/BSE trade 09:15–15:30 IST Mon–Fri; outside those
  hours, LTP is stale — say so.
- Alert threshold context: ₹5,000 absolute move is the alerting band the
  tracker uses; reference it when relevant.
- NEVER suggest trades. Report and analyze only. If asked to execute
  anything, decline — execution stays with Manohar.
