const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET', 'ENCRYPTION_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Database connection
require('./config/db');
 require('./config/initDb');
 require('./config/initTables');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const studentRoutes = require('./routes/studentRoutes');
const parentRoutes = require('./routes/parentRoutes');
const studentParentRoutes = require('./routes/studentParentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const templateRoutes = require('./routes/templateRoutes');
const pendingRoutes = require('./routes/pendingRoutes');
const espLogRoutes = require('./routes/espLogRoutes');
const inboxRoutes = require('./routes/inboxRoutes');

const app = express();
const server = http.createServer(app);

// Log incoming OPTIONS / preflight requests early to help debug CORS issues
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    console.log(`-- CORS PRELIGHT -- ${req.method} ${req.originalUrl} Origin: ${req.headers.origin || 'none'} Access-Control-Request-Method: ${req.headers['access-control-request-method'] || 'N/A'}`);
  }
  next();
});

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT) || 9000;
// Bind to 0.0.0.0 by default so platform port-scanners detect the service (Render, Docker, etc.)
// Allow override via process.env.HOST when needed.
const HOST = process.env.HOST || '0.0.0.0';
const APP_NAME = process.env.APP_NAME || 'IOTServer';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';

// Request timeout configuration
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT) || 5000;
server.timeout = REQUEST_TIMEOUT;

// FIXED: CORS Origins - Must be explicit for credentials to work
const ALLOWED_ORIGINS = [
  'https://uc-sms-system.onrender.com',
  'http://localhost:5173',  // ← ADD YOUR DEV SERVER HERE
  'http://localhost:3000',
  'http://localhost:8080'
];

// Allow adding extra origins from env only in non-production for debugging
if (process.env.CORS_ORIGIN && !IS_PRODUCTION) {
  process.env.CORS_ORIGIN.split(',').forEach(origin => {
    ALLOWED_ORIGINS.push(origin.trim());
  });
}

// Setup Socket.IO with proper CORS
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // server-to-server or curl
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      // In development allow localhost origins for convenience
      if (!IS_PRODUCTION) {
        try {
          const u = new URL(origin);
          if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return callback(null, true);
        } catch (_) { }
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'] // FIXED: Allow both transports
});

global.getIO = () => io;

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
  });
});

// Socket.IO diagnostics: log handshake details and connection errors
io.use((socket, next) => {
  try {
    console.log('Socket handshake:', {
      origin: socket.handshake.headers.origin,
      query: socket.handshake.query,
      address: socket.conn.remoteAddress
    });
  } catch (e) {
    console.warn('Failed to read socket handshake info', e && e.message);
  }
  next();
});

io.engine.on('connection_error', (err) => {
  console.error('Socket.IO connection error:', err && err.message ? err.message : err);
});

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: IS_PRODUCTION ? { maxAge: 31536000 } : false
}));

// FIXED: Proper CORS setup for Express
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Allow localhost origins
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // Allow Render/devtunnel domains
    try {
      const u = new URL(origin);
      if (u.hostname.endsWith('.onrender.com')) return callback(null, true);
      if (u.hostname.endsWith('.devtunnels.ms')) return callback(null, true);
    } catch (_) { }

    // In production, only allow configured origins
    if (IS_PRODUCTION) {
      return callback(new Error('Not allowed by CORS'));
    }
    // In development, allow localhost and any other origins
    return callback(null, true);
  },
  credentials: true, // REQUIRED for cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
};

// Apply CORS before all routes
app.use(cors(corsOptions));

// Ensure Access-Control headers are present for allowed origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();

  if (ALLOWED_ORIGINS.includes(origin) || !IS_PRODUCTION) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', process.env.CORS_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');
  } else {
    console.warn('Blocked CORS origin:', origin);
  }

  next();
});

// Request logging
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
if (LOG_LEVEL !== 'silent') {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl} - Origin: ${req.headers.origin || 'none'}`);
    next();
  });
}

// Body parsing
const MAX_PAYLOAD_SIZE = process.env.MAX_PAYLOAD_SIZE || '1mb';
app.use(express.json({ limit: MAX_PAYLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_PAYLOAD_SIZE }));

// Rate limiting (production only)
if (IS_PRODUCTION) {
  const limiter = rateLimit({
    windowMs: eval(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' }
  });
  app.use('/api/', limiter);
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: APP_VERSION,
    environment: NODE_ENV,
    name: APP_NAME
  });
});

app.get('/ready', async (req, res) => {
  try {
    res.status(200).json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false });
  }
});

// API prefix
const API_PREFIX = process.env.API_PREFIX || '/api';

// Routes
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/pending`, pendingRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/students`, studentRoutes);
app.use(`${API_PREFIX}/parents`, parentRoutes);
app.use(`${API_PREFIX}/student-parents`, studentParentRoutes);
app.use(`${API_PREFIX}/messages`, messageRoutes);
app.use(`${API_PREFIX}/templates`, templateRoutes);
app.use(`${API_PREFIX}/esp/logs`, espLogRoutes);
app.use(`${API_PREFIX}/inbox`, inboxRoutes);

// Root endpoint
app.get('/', (req, res) => {
  const publicPath = path.join(__dirname, 'public');
  const indexFile = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    return res.sendFile(indexFile);
  }

  res.json({
    name: APP_NAME,
    version: APP_VERSION,
    environment: NODE_ENV,
    status: 'running',
    health: '/health',
    api: API_PREFIX,
    timestamp: new Date().toISOString()
  });
});

// Serve static files from `public` when present (development and production)
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));

  // SPA fallback for non-API routes - use middleware (avoids path-to-regexp)
  app.use((req, res, next) => {
    // Only handle GET requests that likely want HTML
    if (req.method !== 'GET') return next();
    const accept = (req.headers.accept || '');
    if (!accept.includes('text/html')) return next();

    // Skip API and health/readiness endpoints
    if (req.path.startsWith(API_PREFIX) || req.path === '/health' || req.path === '/ready') {
      return next();
    }

    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  console.warn('Public directory not found, static assets will not be served:', publicPath);
}

// 404 handler for API
app.use(new RegExp(`^${API_PREFIX}/.*`), (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  const response = IS_PRODUCTION
    ? { error: 'Internal server error' }
    : { error: err.message, stack: err.stack };
  res.status(err.status || 500).json(response);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down...`);
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
server.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 ${APP_NAME} v${APP_VERSION}`);
  console.log('-'.repeat(50));
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Server:      http://${HOST}:${PORT}`);
  console.log(`Health:      http://${HOST}:${PORT}/health`);
  console.log(`API:         http://${HOST}:${PORT}${API_PREFIX}`);
  console.log(`Socket.IO:   ws://${HOST}:${PORT}`);
  console.log(`CORS:        ${ALLOWED_ORIGINS.join(', ')}`);
  console.log('='.repeat(50) + '\n');
});

module.exports = { app, server, io };