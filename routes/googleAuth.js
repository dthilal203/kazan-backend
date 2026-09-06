const express = require('express');
const { getAuthUrl, exchangeCodeForTokens, getProfileEmail, revoke } = require('../services/gmail');
const { syncUserMailbox } = require('../services/sync');
const { getUser, saveUser } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Yeni bir hesap bağlamak için — zaten bağlı hesapların üzerine EKLENİR, üzerine yazmaz.
router.get('/auth/google', requireAuth, (req, res) => {
  const url = getAuthUrl(req.userEmail);
  res.redirect(url);
});

router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/dashboard.html?connect_error=' + encodeURIComponent(error));
  try {
    const [appEmail] = (state || '').split('::');
    const user = getUser(appEmail);
    if (!user) return res.status(400).send('Kullanıcı bulunamadı');

    const tokens = await exchangeCodeForTokens(code);
    const tempAccount = { refreshToken: tokens.refresh_token };
    const connectedAddress = await getProfileEmail(tempAccount);

    user.googleAccounts = user.googleAccounts || [];
    const already = user.googleAccounts.find(a => a.address === connectedAddress);
    if (already) {
      already.refreshToken = tokens.refresh_token; // yeniden onay — token'ı tazele
    } else {
      user.googleAccounts.push({
        address: connectedAddress,
        refreshToken: tokens.refresh_token,
        connectedAt: Date.now(),
        lastSyncAt: null
      });
    }
    saveUser(appEmail, user);

    // Bu hesabı hemen tara — kullanıcı beklemeden sonuç görsün.
    await syncUserMailbox(appEmail, user);

    res.redirect('/dashboard.html?connected=' + encodeURIComponent(connectedAddress));
  } catch (e) {
    console.error('Google OAuth hatası:', e.message);
    res.redirect('/dashboard.html?connect_error=' + encodeURIComponent(e.message));
  }
});

// Bağlı bir hesabı kaldırır (Google tarafında da erişimi iptal etmeyi dener).
router.delete('/api/google-accounts/:address', requireAuth, async (req, res) => {
  const user = req.user;
  const account = (user.googleAccounts || []).find(a => a.address === req.params.address);
  if (!account) return res.status(404).json({ error: 'Hesap bulunamadı' });

  await revoke(account);
  user.googleAccounts = user.googleAccounts.filter(a => a.address !== req.params.address);
  saveUser(req.userEmail, user);
  res.json({ ok: true });
});

module.exports = router;
