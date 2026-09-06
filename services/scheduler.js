const cron = require('node-cron');
const { allUsers, saveUser } = require('../db');
const { syncUserMailbox, processTimeTransitions } = require('./sync');

function start() {
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES || 15);
  const expr = `*/${minutes} * * * *`;

  cron.schedule(expr, async () => {
    console.log(`[scheduler] tarama başladı — ${new Date().toISOString()}`);
    for (const user of allUsers()) {
      if (user.googleAccounts && user.googleAccounts.length > 0) {
        try {
          await syncUserMailbox(user.id, user);
        } catch (e) {
          console.error(`[scheduler] ${user.id} taranamadı:`, e.message);
        }
      } else {
        processTimeTransitions(user);
        saveUser(user.id, user);
      }
    }
  });

  console.log(`[scheduler] her ${minutes} dakikada bir, kullanıcının TÜM bağlı hesapları taranacak şekilde planlandı`);
  console.log('[scheduler] not: gerçek anlık bildirim için Gmail push (watch + Pub/Sub) kurulmalı — bu polling, dürüst bir başlangıç noktasıdır');
}

module.exports = { start };
