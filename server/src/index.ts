// server/src/index.ts - AI Agent SaaS Server
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { EnvironmentValidator } from './utils/validation.js';

import authRouter from './routes/auth.js';
// import chatbotRouter from './routes/chatbot.js'; // Commented out as file not found
import { authMiddleware } from './middleware/auth.js';

// NEW: Google Calendar connector OAuth route
import googleCalendarConnectorRouter from './routes/connectors/googlecalendar.js';
import gmailConnectorRouter from './routes/connectors/gmail.js';
import driveConnectorRouter from './routes/connectors/drive.js';
import integrationsRouter from './routes/integrations.js';
import calendarRouter from './routes/calendar.js';
import gmailRouter from './routes/gmail.js';
import driveRouter from './routes/drive.js';
import briefingRouter from './routes/briefing.js';
import chatbotRouter from './routes/chatbot.js';
import mockOAuthRouter from './routes/mock-oauth.js';
import interactorRouter from './routes/interactor.js';

// Validate environment before starting server
console.log('🚀 Starting AI Agent SaaS Server...\n');
try {
  EnvironmentValidator.validate();
} catch (error: any) {
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

const config = EnvironmentValidator.getConfig();
const app = express();

// Enhanced CORS configuration
const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map(s => s.trim()) || [
  'http://localhost:3000',
  'http://localhost:3002'
];

app.use(cors({ 
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));

// Enhanced middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/auth', mockOAuthRouter); // Mock OAuth for development
app.use('/api/chatbot', authMiddleware, chatbotRouter);

// NEW: PRD-compliant Interactor Core (structured commands)
app.use('/api/interactor', interactorRouter);

// NEW: centralized integrations management
app.use('/api/integrations', authMiddleware, integrationsRouter);

// Calendar API functionality
app.use('/api/calendar', authMiddleware, calendarRouter);

// Gmail API functionality
app.use('/api/gmail', authMiddleware, gmailRouter);

// Google Drive API functionality
app.use('/api/drive', authMiddleware, driveRouter);

// Daily Briefing API functionality
app.use('/api/briefing', authMiddleware, briefingRouter);

// Legacy: individual connector routes (kept for backward compatibility)
app.use('/api/connectors/googlecalendar', authMiddleware, googleCalendarConnectorRouter);
app.use('/api/connectors/gmail', authMiddleware, gmailConnectorRouter);
app.use('/api/connectors/drive', authMiddleware, driveConnectorRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    service: 'ai-agent-saas-server', 
    port: config.port,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    ok: false,
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server with enhanced error handling
const server = app.listen(config.port, () => {
  console.log(`🚀 AI Agent SaaS Server started successfully`);
  console.log(`📍 Server URL: http://localhost:${config.port}`);
  console.log(`🏥 Health Check: http://localhost:${config.port}/health`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 CORS Origins: ${allowedOrigins.join(', ')}`);
  console.log(`🔐 JWT Secret: ${config.jwtSecret ? 'configured' : 'missing'}`);
  console.log(`🔌 Interactor API: ${config.interactorApiKey ? 'configured' : 'missing'}`);
  console.log('✅ Server is ready to accept connections\n');
}).on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${config.port} is already in use. Please free the port or set a different PORT environment variable.`);
    process.exit(1);
  } else {
    console.error('❌ Server failed to start:', err.message);
    process.exit(1);
  }
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received, initiating graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err.message);
      process.exit(1);
    }
    
    console.log('✅ Server closed successfully');
    console.log('👋 Goodbye!');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('⏰ Forceful shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
