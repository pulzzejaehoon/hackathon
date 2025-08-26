// server/src/index.ts (patched to mount Google Calendar connector auth-url)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth.js';
// import chatbotRouter from './routes/chatbot.js'; // Commented out as file not found
import { authMiddleware } from './middleware/auth.js';
// NEW: Google Calendar connector OAuth route
import googleCalendarConnectorRouter from './routes/connectors/googlecalendar.js';
import gmailConnectorRouter from './routes/connectors/gmail.js';
import driveConnectorRouter from './routes/connectors/drive.js';
import integrationsRouter from './routes/integrations.js';
import calendarRouter from './routes/calendar.js';
import chatbotRouter from './routes/chatbot.js';
const app = express();
const port = process.env.PORT || 3001;
const origin = process.env.FRONTEND_ORIGIN?.split(',').map(s => s.trim()) || ['http://localhost:3000'];
app.use(cors({ origin, credentials: true }));
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/chatbot', authMiddleware, chatbotRouter);
// NEW: centralized integrations management
app.use('/api/integrations', authMiddleware, integrationsRouter);
// Calendar API functionality
app.use('/api/calendar', authMiddleware, calendarRouter);
// Legacy: individual connector routes (kept for backward compatibility)
app.use('/api/connectors/googlecalendar', authMiddleware, googleCalendarConnectorRouter);
app.use('/api/connectors/gmail', authMiddleware, gmailConnectorRouter);
app.use('/api/connectors/drive', authMiddleware, driveConnectorRouter);
app.get('/health', (_req, res) => res.json({ ok: true, service: 'server', port }));
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});
