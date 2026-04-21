const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');

// Load environment variables
dotenv.config();

// Set environment
const NODE_ENV = process.env.NODE_ENV || 'development';
if (!process.env.NODE_ENV) {
    console.warn('  NODE_ENV not set, defaulting to development');
}

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'GROQ_API_KEY', 'EMAIL_USER', 'EMAIL_PASS'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

// Connect to MongoDB
connectDB();

const app = express();

// Security middleware - Helmet must be early
app.use(helmet());

app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

// Rate Limiting Middleware
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Strict limit for auth endpoints
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
    skipSuccessfulRequests: true, // Don't count successful requests
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 AI requests per minute
    message: 'Too many email generation requests, please try again later',
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);

// Apply specific rate limiters to sensitive routes
app.use('/api/auth', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiLimiter);
app.use('/api/ai', aiRoutes);

// Absolute path to client build folder
const __dirnamePath = path.resolve();
const clientBuildPath = path.join(__dirnamePath, '..', 'client', 'dist');

// Serve static files
app.use(express.static(clientBuildPath));

// For any route not starting with /api, send index.html
app.get( (req, res,next) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
});


app.use((err, req, res, next) => {
    console.error(err.stack);
    const isDev = process.env.NODE_ENV === 'development';
    res.status(500).json({ 
        message: 'Server Error',
        error: isDev ? err.message : null
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date(), environment: NODE_ENV });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(` Server running on port ${PORT} in ${NODE_ENV} mode`);
});