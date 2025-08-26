# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack AI assistant SaaS application that provides chat-based interactions with third-party services (Google Calendar, Gmail, Drive) through Interactor.com integration platform. The application consists of a React frontend and Express.js backend with TypeScript throughout.

## Development Commands

### Server (Express + TypeScript)
```bash
cd server
npm run build      # Compile TypeScript to dist/
npm start          # Start with nodemon (watches dist/index.js)
node dist/index.js # Start directly without nodemon
```

### Client (React + TypeScript)
```bash
cd client
npm start          # Start development server on port 3000
PORT=3002 npm start # Start on custom port (commonly used: 3002)
npm run build      # Production build
npm test           # Run tests
```

### Development Workflow
- Server runs on port 3001 (configurable via PORT env var)
- Client typically runs on port 3002 for development
- Always run `npm run build` in server after TypeScript changes
- Server uses ES modules (`"type": "module"` in package.json)

## Architecture

### Backend Structure
```
server/src/
├── index.ts                 # Express app setup, CORS, route mounting
├── routes/
│   ├── auth.ts             # User registration/login with file-based storage
│   ├── chatbot.ts          # LLM chat with OpenRouter, action detection
│   ├── integrations.ts     # Centralized integration management
│   ├── calendar.ts         # Calendar-specific endpoints
│   └── connectors/         # Individual service connectors (legacy)
├── services/
│   └── IntegrationService.ts # Core integration logic, Interactor API calls
├── middleware/
│   └── auth.ts             # JWT authentication middleware
├── lib/
│   └── interactor.ts       # Interactor.com API wrapper
└── types/
    └── integrations.ts     # TypeScript interfaces
```

### Frontend Structure  
```
client/src/
├── App.tsx                 # Router setup, protected routes
├── components/
│   ├── Dashboard/          # Main dashboard with chat and integration panel
│   ├── Auth/              # Login, Register, ProtectedRoute
│   ├── Chatbot/           # Chat interface with quick action buttons
│   ├── Integrations/      # Integration management hub
│   └── [Service]/Settings/ # Service-specific settings pages
```

### Key Integration Patterns

**IntegrationService Class**: Centralized service managing all third-party integrations. Maps integration IDs to Interactor connector names and handles auth URLs, status checks, and disconnections.

**OAuth Flow**: Popup-based authentication that communicates success/failure back to parent window via `postMessage`. The callback endpoint returns HTML pages that close the popup and notify the parent.

**Chat System**: Combines OpenRouter LLM with keyword-based action detection. Supports both streaming and regular responses, with fallback responses for API failures.

**Authentication**: JWT-based with file-based user storage in `server/data/users.json`. Middleware protects all API routes except auth endpoints.

## Environment Configuration

### Server (.env)
```
OPENROUTER_API_KEY=         # OpenRouter API key for LLM
OPENAI_BASE_URL=           # OpenRouter endpoint
OPENROUTER_MODEL=          # Model to use (e.g., mistralai/mistral-7b-instruct:free)
INTERACTOR_API_KEY=        # Interactor.com API key
JWT_SECRET=                # Secret for JWT signing
FRONTEND_ORIGIN=           # Comma-separated allowed origins for CORS
BACKEND_ORIGIN=           # Backend URL for OAuth redirects
PORT=3001                  # Server port
```

### Client (.env)
```
REACT_APP_API_BASE=        # Backend API URL (not NEXT_PUBLIC_API_BASE)
```

## Interactor.com API Integration

The application uses Interactor.com for third-party service integration. Key API patterns:

**Auth URL (GET)**: 
```
GET /connector/interactor/{service}/auth-url?account={email}
```

**Calendar Actions (POST)**:
```
POST /connector/interactor/googlecalendar-v1/action/{actionName}/execute?account={email}
Body: { action-specific parameters }
```

**Status Check**: Uses calendar list API call to verify connection status rather than dedicated status endpoint.

## ES Module Considerations

The server uses ES modules, so:
- Use `import` syntax throughout
- File extensions required in imports (`.js` for compiled files)
- `__dirname` not available - use `fileURLToPath(import.meta.url)` pattern
- All relative imports must include `.js` extension even for `.ts` files

## Known Issues & Workarounds

- Interactor API requires exact parameter matching - remove empty/undefined parameters before sending requests
- OAuth popup communication requires specific HTML responses with `postMessage` 
- Status checking is done via actual API calls rather than dedicated status endpoints
- User persistence uses file-based storage rather than database for simplicity
- Server may exit immediately after startup - ensure proper async handling in startup code

## Testing OAuth Flow

1. Register a user via `/api/auth/register`  
2. Connect service via popup from dashboard integration panel
3. Verify connection status updates in real-time after popup closes
4. Test chat interactions with connected services using quick action buttons

The application is designed for global-scale deployment with proper production-grade UX patterns throughout.