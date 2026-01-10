require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');

const { getCurrencyLabels } = require('./db');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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
  res.locals.currentPath = req.path;
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', publicRoutes({ verifyPasscode }));
app.use('/admin', adminRoutes({ verifyPasscode }));

app.use((req, res) => {
  res.status(404).render('pages/404');
});

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

app.listen(PORT, HOST, () => {
  const lanIp = getLanIp();
  // eslint-disable-next-line no-console
  console.log(`The Storehouse running on http://${HOST}:${PORT}`);
  if (lanIp) {
    // eslint-disable-next-line no-console
    console.log(`LAN access: http://${lanIp}:${PORT}`);
  }
});
