import createError from 'http-errors';
import express from "express";
import { createServer } from 'node:http';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import logger from 'morgan';
import cors from "cors";
import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';
import patientsRouter from './routes/patients-router.js';
import relatedPersonRoutes from "./routes/relatedPersonRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import calendarRoutes from "./routes/calendar-routes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import livekitRoutes from './routes/livekit-routes.js';
import webRTCRoutes from './routes/webrtc-routes.js'
import imagesRouter from './routes/imagesRoutes.js';
import {SpotifyRouter} from './routes/spotify-router.js';
import withingsRoutes from './routes/withings-routes.js';
import AsteriskRoutes from './routes/asterisk-routes.js';
import QueueRoutes from './routes/queue-router.js';
import modeRouter from './routes/mode-routes.js';
import callHistoryRoutes from './routes/call-history-routes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import auditEventRoutes from './routes/auditEventRoutes.js';
import patientMediaRoutes from './routes/patient-media-routes.js';
import brigidCalendarRoutes from './routes/brigid-calendar-routes.js';
import brigidCalendarService from './services/brigid-calendar-service.js';
import asteriskAMI from './services/asterisk-ami-service.js';
import connectDB from './config/db.js';
import passport from "./config/passport.js";
import MongoStore from "connect-mongo";
import session from "express-session"
import "./config/passport.js";
import "./instrument.js";
import * as Sentry from "@sentry/node";
// import cookieSession from 'cookie-session'
import dotenv from "dotenv";
import {dotEnvConfig} from './config/vars.js'
import expressListEndpoints from "express-list-endpoints";
import {socketInit, users} from './socketIo/socketIo.js'
import {setupAgenda}  from './agenda/agenda.js'
dotenv.config(dotEnvConfig);

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  throw new Error("❌ JWT_SECRET environment variable is required");
}
if (!process.env.JWT_REFRESH_SECRET) {
  console.warn("⚠️  JWT_REFRESH_SECRET not set, using JWT_SECRET (not recommended for production)");
}
if (!process.env.FRONTEND_URL) {
  console.warn("⚠️  FRONTEND_URL not set, CORS will allow all origins (not secure for production)");
}

const app = express();
const server = createServer(app);
app.use('/', indexRouter);
export const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*", // Restrict Socket.IO to frontend URL
    credentials: true
  }
});

app.set("trust proxy", 1); // ✅ Required for AWS Elastic Beanstalk & reverse proxies

// CORS configuration - restrict to frontend URL for security
const corsOptions = {
  origin: [process.env.FRONTEND_URL, "http://localhost:5173", "https://main.d1027o4nsqa17p.amplifyapp.com"], // Use FRONTEND_URL if set, otherwise allow all (dev only)
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

if (!process.env.FRONTEND_URL) {
  console.warn("⚠️  CORS is allowing all origins - this is insecure for production!");
}

app.use(cors(corsOptions));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory (for OAuth success page, etc.)
app.use(express.static('public'));

app.use((req, res, next) => {
  // console.error("📝 PRE Session Middleware Debug: ", req.session);
  next();
});

app.use(session({
  secret: process.env.JWT_SECRET, // No fallback - fails fast if not set
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_DB_URL,
    collectionName: "sessions",
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    httpOnly: true,
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use((req, res, next) => {
  // console.error("📝Session Middleware Debug: ", req.session);
  next();
});


app.use(passport.authenticate('session'));
app.use(passport.initialize());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

connectDB();
app.use("/auth", authRoutes);
app.use('/patients', patientsRouter);
app.use('/users', usersRouter);
app.use("/relatedPerson", relatedPersonRoutes);
app.use("/images", imagesRouter)
app.use("/api/livekit", livekitRoutes);
app.use("/calendar", calendarRoutes);
app.use("/webhook", webhookRoutes);
app.use("/modes", modeRouter);

socketInit(io)

app.use('/send-webrtc-message', webRTCRoutes);
app.use('/asterisk', AsteriskRoutes);
app.use('/queue', QueueRoutes);
app.use('/call-history', callHistoryRoutes);
const clientId = 'bc445b54c9a94b649f73f923c675320b';
const clientSecret = 'e4e50fefcd2a4059a45fade10833f547';
const redirectUri = `${process.env.FRONTEND_URL}/callback`;

const spotifyRouter = new SpotifyRouter(clientId, clientSecret, redirectUri);

app.use('/spotify', spotifyRouter.getRouter());
app.use('/withings', withingsRoutes);
app.use('/device', deviceRoutes);
app.use('/auditEvent', auditEventRoutes);
app.use('/api/patient-media', patientMediaRoutes);
app.use('/brigid-calendar', brigidCalendarRoutes);

// Inject Socket.IO into Brigid Calendar Service for real-time notifications
brigidCalendarService.setSocketIO(io);

// Initialize Asterisk AMI connection for queue management
if (process.env.ASTERISK_AMI_HOST) {
  asteriskAMI.connect({
    host: process.env.ASTERISK_AMI_HOST,
    port: process.env.ASTERISK_AMI_PORT || 5038,
    username: process.env.ASTERISK_AMI_USERNAME || 'brigid-backend',
    password: process.env.ASTERISK_AMI_PASSWORD
  });
  console.log('🔌 Asterisk AMI connection initialized');
} else {
  console.log('⚠️  ASTERISK_AMI_HOST not set - AMI integration disabled');
}

setupAgenda()

function getUserEmail(socketId) {
  for (const [email, id] of users.entries()) {
    if (id === socketId) return email;
  }
  return null;
}

const endpoints = expressListEndpoints(app);


// console.log(endpoints);
Sentry.setupExpressErrorHandler(app);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.send('error');
});


export default server;
