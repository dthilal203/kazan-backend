const { getMessage, listMessageIds } = require('./gmail');
const { classifyEmail, llmExtract } = require('./detection');
const { saveUser } = require('../db');

function uid() { return Math.random().toString(36).slice(2, 10); }

function processTimeTransitions(user) {
  const now = Date.now();
  (user.subs || []).forEach(it => {
    if (it.kind === 'trial' && it.status === 'flagged' && new Date(it.trialEnd).getTime() < now) {
      it.kind = 'forgotten';
      it.status = 'flagged';
      it.lastSeenReceiptAt = it.trialEnd;
      it.occurrences = 1;
    }
  });
}

// Tek bir bağlı hesabı tarar, ham receipt/trial sinyallerini döndürür.
// Kalıcı yazma yapmaz — birleştirme işlemi syncUserMailbox'ta olur, çünkü
// aynı abonelik iki farklı bağlı e-postada da görünebilir ve tek kayda
// düşürülmesi gerekir.
async function scanOneAccount(account) {
  const isFirstScan = !account.lastSyncAt;
  const afterDate = isFirstScan ? new Date(Date.now() - 180 * 86400000) : new Date(account.lastSyncAt);
  const afterEpoch = Math.floor(afterDate.getTime() / 1000);
  const query = `after:${afterEpoch} (deneme OR trial OR fatura OR receipt OR "ödeme alındı" OR subscription OR abonelik)`;

  const ids = await listMessageIds(account, query, 150);
  const trialSignals = [];
  const receiptSignals = [];

  for (const { id } of ids) {
    const email = await getMessage(account, id);
    let result = classifyEmail(email);

    if (result.type === 'irrelevant') {
      const llm = await llmExtract(email);
      if (llm && llm.type !== 'irrelevant') {
        result = {
          type: llm.type,
          merchant: llm.merchant || email.from,
          cancelUrl: `https://${(email.from.match(/@([\w.-]+)/) || [, ''])[1]}`,
          amount: llm.amount,
          trialEnd: llm.trial_end_date ? new Date(llm.trial_end_date) : null,
          date: email.date,
          confidence: llm.confidence || 'low'
        };
      }
    }
    if (result.type === 'irrelevant') continue;

    if (result.type === 'trial') {
      trialSignals.push({ ...result, fromAccount: account.address });
    } else if (result.type === 'receipt') {
      receiptSignals.push({ ...result, fromAccount: account.address });
    }
  }

  account.lastSyncAt = Date.now();
  return { trialSignals, receiptSignals, scanned: ids.length };
}

// Kullanıcının TÜM bağlı hesaplarını tarar ve sonuçları tek bir
// abonelik listesinde birleştirir (aynı merchant iki hesapta da görünse
// tek kayıt olarak kalır).
async function syncUserMailbox(email, user) {
  user.subs = user.subs || [];
  user.googleAccounts = user.googleAccounts || [];

  let totalScanned = 0;
  const allTrials = [];
  const receiptsByMerchant = {};

  for (const account of user.googleAccounts) {
    const { trialSignals, receiptSignals, scanned } = await scanOneAccount(account);
    totalScanned += scanned;
    allTrials.push(...trialSignals);
    receiptSignals.forEach(r => {
      if (!receiptsByMerchant[r.merchant]) receiptsByMerchant[r.merchant] = [];
      receiptsByMerchant[r.merchant].push(r);
    });
  }

  allTrials.forEach(result => {
    const exists = user.subs.find(s => s.kind === 'trial' && s.name === result.merchant && s.status !== 'cancelled');
    if (!exists) {
      user.subs.push({
        id: uid(), name: result.merchant, cancelUrl: result.cancelUrl,
        kind: 'trial', amount: result.amount || 0, cadence: 'monthly',
        status: 'flagged', source: 'email', sourceAccount: result.fromAccount,
        confidence: result.confidence, trialEnd: result.trialEnd.toISOString(), snoozedUntil: null
      });
    }
  });

  Object.entries(receiptsByMerchant).forEach(([merchant, receipts]) => {
    if (receipts.length < 2) return;
    receipts.sort((a, b) => a.date - b.date);
    const last = receipts[receipts.length - 1];
    const prev = receipts[receipts.length - 2];
    const gapDays = Math.round((last.date - prev.date) / 86400000);
    const cadence = gapDays > 300 ? 'yearly' : 'monthly';

    let item = user.subs.find(s => s.kind === 'forgotten' && s.name === merchant);
    if (item) {
      if (item.status === 'flagged') {
        item.occurrences = receipts.length;
        item.lastSeenReceiptAt = last.date.toISOString();
        item.amount = last.amount || item.amount;
        item.sourceAccount = last.fromAccount;
      }
    } else {
      user.subs.push({
        id: uid(), name: merchant, cancelUrl: last.cancelUrl,
        kind: 'forgotten', amount: last.amount || 0, cadence,
        status: 'flagged', source: 'email', sourceAccount: last.fromAccount,
        lastSeenReceiptAt: last.date.toISOString(), occurrences: receipts.length
      });
    }
  });

  processTimeTransitions(user);
  saveUser(email, user);
  return { scanned: totalScanned, totalSubs: user.subs.length, accountsScanned: user.googleAccounts.length };
}

module.exports = { syncUserMailbox, processTimeTransitions };
