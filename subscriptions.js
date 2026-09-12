const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { saveUser } = require('../db');
const { syncUserMailbox, processTimeTransitions } = require('../services/sync');

const router = express.Router();

function annualValue(item) { return item.cadence === 'yearly' ? item.amount : item.amount * 12; }
function monthlyValue(item) { return item.cadence === 'yearly' ? item.amount / 12 : item.amount; }

router.get('/subscriptions', requireAuth, (req, res) => {
  const user = req.user;
  processTimeTransitions(user);
  saveUser(req.userEmail, user);

  const now = Date.now();
  const active = user.subs.filter(s => s.status === 'flagged');
  const trials = active.filter(s => s.kind === 'trial' && (!s.snoozedUntil || new Date(s.snoozedUntil).getTime() <= now))
    .map(s => ({ ...s, daysLeft: Math.round((new Date(s.trialEnd) - now) / 86400000) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const forgotten = active.filter(s => s.kind === 'forgotten');
  const cancelled = user.subs.filter(s => s.status === 'cancelled');

  res.json({
    accounts: (user.googleAccounts || []).map(a => ({ address: a.address, connectedAt: a.connectedAt, lastSyncAt: a.lastSyncAt })),
    user: { firstName: user.firstName, lastName: user.lastName, email: user.id },
    realizedYearly: cancelled.reduce((s, x) => s + annualValue(x), 0),
    potentialMonthly: active.reduce((s, x) => s + monthlyValue(x), 0),
    cancelledCount: cancelled.length,
    trials, forgotten
  });
});

router.post('/subscriptions/:id/cancel-confirm', requireAuth, (req, res) => {
  const item = req.user.subs.find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Bulunamadı' });
  item.status = 'cancelled';
  item.cancelledAt = Date.now();
  saveUser(req.userEmail, req.user);
  res.json({ ok: true, addedToSavings: annualValue(item) });
});

router.post('/subscriptions/:id/dismiss', requireAuth, (req, res) => {
  const item = req.user.subs.find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Bulunamadı' });
  item.status = 'dismissed';
  saveUser(req.userEmail, req.user);
  res.json({ ok: true });
});

router.post('/subscriptions/:id/snooze', requireAuth, (req, res) => {
  const item = req.user.subs.find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Bulunamadı' });
  item.snoozedUntil = new Date(Date.now() + 2 * 86400000).toISOString();
  saveUser(req.userEmail, req.user);
  res.json({ ok: true });
});

router.post('/sync/now', requireAuth, async (req, res) => {
  if (!req.user.googleAccounts || req.user.googleAccounts.length === 0) {
    return res.status(400).json({ error: 'Önce en az bir e-posta hesabı bağlamalısın' });
  }
  try {
    const result = await syncUserMailbox(req.userEmail, req.user);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: 'Tarama başarısız: ' + e.message });
  }
});

module.exports = router;
