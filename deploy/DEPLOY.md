# Tiger Bridge — Deployment Guide

## Architecture

```
Internet
  │ HTTPS
  ▼
Caddy (agent.manohargupta.com)
  │ HTTP localhost:3000
  ▼
Next.js Dashboard  ──── /api/tiger/* ────┐
                                         │ HTTP localhost:3456
                                    Tiger Bridge (Express)
                                         │ child_process.exec
                                    docker exec openshell-cluster-nemoclaw
                                         │
                                    kubectl exec -n openshell tiger
                                         │
                                    Tiger sandbox pod
```

## Quick Start on the VPS

### 1. Install dependencies

```bash
# Node.js 20+ (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy
sudo apt install -y caddy
```

### 2. Clone and set up the project

```bash
cd /root
git clone <your-repo-url> clawd-dashboard
cd clawd-dashboard
```

### 3. Set up the Tiger Bridge

```bash
cd bridge
npm install

# Create bridge .env
cp ../deploy/.env.example .env
# Edit .env and set:
#   TIGER_BRIDGE_TOKEN=<run: openssl rand -hex 32>
#   ALLOWED_ORIGIN=https://agent.manohargupta.com
nano .env
```

### 4. Set up the Dashboard

```bash
cd dashboard
npm install

# Create dashboard .env.local
cp ../deploy/.env.example .env.local
# Edit .env.local and set:
#   TIGER_BRIDGE_TOKEN=<same token as bridge>
#   TIGER_BRIDGE_URL=http://localhost:3456
nano .env.local

# Build for production
npm run build
```

### 5. Configure Caddy

```bash
# Generate the basicauth password hash
caddy hash-password --plaintext "your-admin-password"
# Copy the $2a$... output

# Edit the Caddyfile and paste your hash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
# Replace CHANGE_ME_HASH with your hash

sudo systemctl reload caddy
```

### 6. Start with PM2 (recommended)

```bash
npm install -g pm2

# Start the bridge
cd /root/clawd-dashboard/bridge
pm2 start "npm run dev" --name tiger-bridge

# Start the dashboard
cd /root/clawd-dashboard/dashboard
pm2 start "npm start" --name tiger-dashboard

# Save process list so they restart on reboot
pm2 save
pm2 startup  # Follow the printed instructions
```

## Verify

```bash
# Check bridge is running
curl http://localhost:3456/health
# Should return: {"ok":true,"service":"tiger-bridge","ts":"..."}

# Check dashboard is running
curl http://localhost:3000/api/tiger/status
# Should return Tiger status JSON

# Check public HTTPS
curl https://agent.manohargupta.com/api/tiger/status
```

## Token Security

The `TIGER_BRIDGE_TOKEN` is the shared secret between the dashboard and bridge.

- Store it only in `.env.local` (dashboard) and `.env` (bridge)
- Both files are in `.gitignore`
- Never commit real tokens to git
- Rotate with: `openssl rand -hex 32`

## Logs

```bash
# Bridge logs
pm2 logs tiger-bridge

# Dashboard logs  
pm2 logs tiger-dashboard

# Caddy access logs
sudo tail -f /var/log/caddy/agent.manohargupta.com.log
```
