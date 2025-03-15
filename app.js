import createError from 'http-errors';
import express from "express";
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';
import patientsRouter from './routes/patientsRouter.js';
import relatedPersonRoutes from "./routes/relatedPersonRoutes.js";
import connectDB from './config/db.js';


var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
connectDB();

app.use('/', indexRouter);
app.use('/patients', patientsRouter);
app.use('/users', usersRouter);
app.use("/relatedPerson", relatedPersonRoutes);

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

export default app;
