require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/googleAuth');
const subscriptionRoutes = require('./routes/subscriptions');
const scheduler = require('./services/scheduler');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/', googleAuthRoutes); // /auth/google ve /auth/google/callback
app.use('/api', subscriptionRoutes);

app.get('/', (req, res) => res.redirect('/index.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`kazan. çalışıyor → http://localhost:${PORT}`);
  scheduler.start();
});
