const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUser, saveUser } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// rememberMe=true  -> 90 günlük kalıcı çerez (tarayıcı kapansa da oturum sürer)
// rememberMe=false -> oturum çerezi (tarayıcı kapanınca düşer), JWT'nin
//                      kendisi de kısa ömürlü tutulur (1 gün)
function issueToken(res, email, rememberMe) {
  const expiresIn = rememberMe ? '90d' : '1d';
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn });
  const cookieOpts = { httpOnly: true, sameSite: 'lax' };
  if (rememberMe) cookieOpts.maxAge = 90 * 86400000;
  res.cookie('kazan_token', token, cookieOpts);
}

router.post('/signup', async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta gir' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Şifre en az 4 karakter olmalı' });
  if (getUser(email)) return res.status(409).json({ error: 'Bu e-posta zaten kayıtlı' });

  const passwordHash = await bcrypt.hash(password, 10);
  saveUser(email, { id: email, passwordHash, createdAt: Date.now(), googleAccounts: [], subs: [] });
  issueToken(res, email, rememberMe !== false);
  res.json({ ok: true, email });
});

router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;
  const user = getUser((email || '').toLowerCase());
  if (!user) return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  issueToken(res, user.id, rememberMe !== false);
  res.json({ ok: true, email: user.id });
});

router.post('/logout', (req, res) => {
  res.clearCookie('kazan_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    email: req.user.id,
    connectedAccounts: (req.user.googleAccounts || []).map(a => a.address)
  });
});

module.exports = router;
