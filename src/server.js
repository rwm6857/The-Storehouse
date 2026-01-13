require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');

const { getCurrencyLabels, dbPath } = require('./db');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { createTerminalUi } = require('./terminalUi');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return null;
}

const lanIp = getLanIp();

const adminPasscode = process.env.ADMIN_PASSCODE;
if (!adminPasscode) {
  throw new Error('ADMIN_PASSCODE is required. Set it in your .env file.');
}

const passHash = crypto.createHash('sha256').update(adminPasscode).digest();

function verifyPasscode(candidate) {
  const input = candidate || '';
  const inputHash = crypto.createHash('sha256').update(input).digest();
  if (inputHash.length !== passHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(inputHash, passHash);
}

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 45 * 60 * 1000
    }
  })
);

app.use((req, res, next) => {
  res.locals.appName = 'The Storehouse';
  res.locals.isAdmin = Boolean(req.session && req.session.isAdmin);
  res.locals.labels = getCurrencyLabels();
  res.locals.currencySymbols = { shekels: '\u20AA', talents: '\u05DB' };
  res.locals.currentPath = req.path;
  res.locals.lanUrl = lanIp ? `http://${lanIp}:${PORT}` : null;
  next();
});

const staticDir = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : path.join(__dirname, 'public');
app.use(express.static(staticDir));

app.use('/', publicRoutes({ verifyPasscode }));
app.use('/admin', adminRoutes({ verifyPasscode }));

app.use((req, res) => {
  res.status(404).render('pages/404');
});

const terminalUi = createTerminalUi({
  appName: 'The Storehouse',
  host: HOST,
  port: PORT,
  lanIp,
  dbPath
});

const server = app.listen(PORT, HOST, () => {
  terminalUi.start(server);
});

function setupGracefulShutdown() {
  const shutdown = () => {
    terminalUi.handleShutdown(server);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

setupGracefulShutdown();
