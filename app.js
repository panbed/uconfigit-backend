let createError = require('http-errors');
let express = require('express');
let path = require('path');

let cookieParser = require('cookie-parser');
let logger = require('morgan');

let dotenv = require('dotenv').config({path : '.env'});

const envPath = require('./config').envPath;

// let dotenv = require('dotenv').config({path : envPath});


// let indexRouter = require('./routes/index');
let apiRouter = require('./routes/api');

let app = express();
let cors = require('cors');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// app.use(cors({
//   origin: process.env.FRONTEND_URL,
// }));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use('/api', apiRouter);
// app.use('/', indexRouter);

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
  res.render('error');
});

module.exports = app;
// module.exports.envPath = envPath;