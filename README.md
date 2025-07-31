# GameShare Remote Client & Signaling Server

This repository contains the split-architecture components for GameShare, allowing the host to run locally while clients connect through a remote signaling server.

## Architecture

- **Local Host**: Runs `gameshare-host` with `--remote-signaling-url` pointing to the remote server
- **Remote Server**: Node.js Express server with WebSocket signaling
- **Remote Client**: Browser-based client that connects to the remote server

## Deployment

### Option 1: Deploy to Fly.io (Recommended)

Fly.io provides excellent WebSocket support with built-in connection limits and rate limiting.

#### Prerequisites
1. Install Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
2. Login: `fly auth login`

#### Quick Deploy
```bash
# Run the deployment script
./deploy-fly.sh

# Or on Windows
deploy-fly.bat
```

#### Manual Deploy
```bash
# Install dependencies
npm install

# Deploy to Fly.io
flyctl deploy
```

#### Configuration
The `fly.toml` file includes:
- **Connection Limits**: Soft limit of 50, hard limit of 100 WebSocket connections
- **Single Instance**: Prevents auto-scaling to stay within free tier
- **Rate Limiting**: Built-in protection against abuse

#### Monitoring
```bash
flyctl status      # Check app status
flyctl logs        # View application logs
flyctl metrics     # Monitor CPU, memory, network usage
```

### Option 2: Deploy to Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Deploy:
   ```bash
   railway init
   railway up
   ```

### Option 3: Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy:
   ```bash
   vercel
   ```

**Note**: This is a pure Express.js application with WebSocket signaling. The `vercel.json` configuration ensures proper deployment.

## Usage

### Starting the Host

```bash
# Connect to remote signaling server
./gameshare-host --remote-signaling-url wss://your-server.com

# Or with a specific session ID
./gameshare-host --remote-signaling-url wss://your-server.com --session-id my-game-session
```

### Connecting Clients

Clients can connect by visiting:
```
https://your-server.com/?session=my-game-session&signaling=wss://your-server.com
```

Or simply:
```
https://your-server.com/?session=my-game-session
```

## Environment Variables

- `PORT`: Server port (default: 8080 for Fly.io)
- `HOST`: Server host (default: 0.0.0.0)

## API Endpoints

- `GET /`: Main client page
- `GET /health`: Health check
- `GET /sessions`: List active sessions
- `WS /`: WebSocket signaling endpoint

## Development

```bash
npm install
npm run dev
```

The server will be available at `http://localhost:8080`

## File Structure

```
/
├── index.html          # Minimal client page
├── client.js           # Remote client logic
├── server.js           # Express + WebSocket server
├── package.json        # Node.js dependencies
├── fly.toml           # Fly.io deployment configuration
├── Dockerfile         # Docker configuration for Fly.io
├── .dockerignore      # Docker ignore file
├── deploy-fly.sh      # Linux Fly.io deployment script
├── deploy-fly.bat     # Windows Fly.io deployment script
├── vercel.json        # Vercel deployment configuration (legacy)
├── .vercelignore      # Vercel ignore file
└── README.md          # This file
```

## Vercel Configuration

The `vercel.json` file configures:
- **WebSocket Routing**: `/signaling` endpoint routes to `server.js` for WebSocket connections
- **Static File Serving**: All routes serve through `server.js` which handles both API and static files
- **Function Settings**: 30-second timeout for serverless functions

This is a pure Express.js application that serves both the API and static files.

## Security Notes

- The signaling server is stateless and doesn't store sensitive data
- WebRTC connections are peer-to-peer and don't go through the server
- Built-in rate limiting prevents abuse (500 messages/minute per client)
- Connection limits prevent resource exhaustion (max 100 concurrent connections)
- Consider adding authentication if needed for production use

