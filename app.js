import createError from 'http-errors';
import express from "express";
import { createServer } from 'node:http';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import logger from 'morgan';
import cors from "cors";
import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';
import patientsRouter from './routes/patientsRouter.js';
import relatedPersonRoutes from "./routes/relatedPersonRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import livekitRoutes from './routes/livekitRoutes.js';
import imagesRouter from './routes/imagesRoutes.js';
import connectDB from './config/db.js';
import passport from "./config/passport.js";
import MongoStore from "connect-mongo";
import session from "express-session"
import "./config/passport.js";
import "./instrument.js";
import * as Sentry from "@sentry/node";
// import cookieSession from 'cookie-session'
import dotenv from "dotenv";
dotenv.config();


const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});
// import session from "express-session";
// import MongoStore from "connect-mongo";

app.set("trust proxy", 1); // ✅ Required for AWS Elastic Beanstalk & reverse proxies
app.use(
  cors({
    origin: process.env.FRONTEND_URL, // Ensure this matches your frontend URL
    credentials: true, // Allow cookies
  })
);



// app.use(cookieSession({
//   name: 'session',
//   keys: ['email', 'auth_token']
// }))

// ✅ 2. JSON Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 3. Session Middleware (After CORS)
console.log(`🔍 Connecting to MongoDB for sessions at: ${process.env.MONGO_DB_URL}`);
app.use((req, res, next) => {
  console.error("📝 PRE Session Middleware Debug: ", req.session);
  next();
});

app.use(session({
  secret: process.env.JWT_SECRET || "default-secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_DB_URL,
    collectionName: "sessions",
  })
}));

app.use((req, res, next) => {
  console.error("📝Session Middleware Debug: ", req.session);
  next();
});


app.use(passport.authenticate('session'));
app.use(passport.initialize());

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

connectDB();

app.use('/', indexRouter);

app.use("/auth", authRoutes);
app.use('/patients', patientsRouter);
app.use('/users', usersRouter);
app.use("/relatedPerson", relatedPersonRoutes);
app.use("/images", imagesRouter)
app.use("/api/livekit", livekitRoutes);
app.use("/calendar", calendarRoutes);

Sentry.setupExpressErrorHandler(app);

const users = new Map();
io.on('connection', (socket) => {
  console.log(`⚡: ${socket.id} user just connected!`);

  socket.on('register', (email) => {
    users.set(email, socket.id);
    console.log(`User registered: ${email} -> ${socket.id}`);
  });

  // Handle private messages
  socket.on('privateMessage', ({ toEmail, message, type }) => {
    console.log({ toEmail, message, type })
    const recipientSocketId = users.get(toEmail);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message', { type, message });
      console.log(`Message sent to ${toEmail}`);
    } else {
      console.log(`User ${toEmail} is not connected`);
    }
  });

  socket.on("callUser", ({ toEmail, offer }) => {
    const recipientSocketId = users.get(toEmail);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("offer", { from: getUserEmail(socket.id), offer });
    }
  });

  socket.on("acceptCall", ({ from }) => {
    const recipientSocketId = users.get(from);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("callAccepted", { from: getUserEmail(socket.id) });
    }
  });

  socket.on("hangup", ({ toEmail }) => {
    const recipientSocketId = users.get(toEmail);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("hangup", toEmail);
      console.log(`Call hangup event sent to ${toEmail}`);
    } else {
      console.log(`User ${toEmail} is not connected.`);
    }
  });

  socket.on("answer", ({ to, answer }) => {
    const recipientSocketId = users.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("answer", { answer });
    }
  });

  socket.on("iceCandidate", ({ to, candidate }) => {
    const recipientSocketId = users.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("iceCandidate", { candidate });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    for (const [email, id] of users.entries()) {
      if (id === socket.id) {
        users.delete(email);
        console.log(`User disconnected: ${email}`);
        break;
      }
    }
  });
  socket.on("message", (message) => {
    socket.broadcast.emit("message", message);
  });
});

function getUserEmail(socketId) {
  for (const [email, id] of users.entries()) {
    if (id === socketId) return email;
  }
  return null;
}


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
