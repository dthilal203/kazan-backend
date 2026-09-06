// Bilinen servisler: gönderen domaini -> görünen ad + resmi iptal/hesap sayfası.
// Bu liste büyüdükçe "hızlı yol" (kural tabanlı) kapsamı büyür — tasarımda
// konuştuğumuz merchant şablon kütüphanesinin kod karşılığı budur.
const SERVICES = {
  'netflix.com':   { name: 'Netflix',              cancelUrl: 'https://www.netflix.com/cancelplan' },
  'spotify.com':   { name: 'Spotify',               cancelUrl: 'https://www.spotify.com/tr-tr/account/subscription/' },
  'adobe.com':     { name: 'Adobe Creative Cloud',  cancelUrl: 'https://account.adobe.com/plans' },
  'duolingo.com':  { name: 'Duolingo',               cancelUrl: 'https://www.duolingo.com/settings/account' },
  'storytel.com':  { name: 'Storytel',               cancelUrl: 'https://www.storytel.com/tr/tr/settings/subscription' },
  'exxen.com':     { name: 'Exxen',                  cancelUrl: 'https://www.exxen.com/hesabim' },
  'blutv.com':     { name: 'BluTV',                  cancelUrl: 'https://www.blutv.com/hesabim' },
  'calm.com':      { name: 'Calm',                   cancelUrl: 'https://www.calm.com/profile/subscription-management' }
};

const TRIAL_WORDS = ['ücretsiz deneme', 'free trial', 'deneme süreniz', 'deneme süresi', 'trial period', 'deneminiz'];
const RECEIPT_WORDS = ['ödeme alındı', 'ödemeniz alındı', 'payment received', 'fatura', 'invoice', 'receipt',
  'abonelik yenilendi', 'subscription renewed', 'ödeme onayı', 'payment confirmation', 'ücretlendirildi'];

function domainOf(fromHeader) {
  const m = fromHeader.match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : '';
}

function extractAmount(text) {
  let m = text.match(/(?:₺|TL|TRY)\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i);
  if (!m) m = text.match(/([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:₺|TL|TRY)/i);
  if (!m) return null;
  const num = m[1].replace(/\./g, '').replace(',', '.');
  const val = parseFloat(num);
  return isNaN(val) ? null : val;
}

function extractExplicitDate(text) {
  // dd.mm.yyyy veya dd/mm/yyyy
  let m = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function extractRelativeDays(text, fromDate) {
  const m = text.match(/(\d{1,2})\s*(gün|day)/i);
  if (m) return new Date(fromDate.getTime() + Number(m[1]) * 86400000);
  return null;
}

// Tek bir e-postayı sınıflandırır. LLM_extract sağlanırsa ve kural tabanlı
// eşleşme belirsiz kalırsa ona düşer (tasarımda konuştuğumuz hibrit model).
function classifyEmail(email) {
  const domain = domainOf(email.from);
  const known = SERVICES[domain];
  const lowerText = (email.subject + ' ' + email.body).toLowerCase();

  const isTrial = TRIAL_WORDS.some(w => lowerText.includes(w));
  const isReceipt = RECEIPT_WORDS.some(w => lowerText.includes(w));

  if (!isTrial && !isReceipt) return { type: 'irrelevant' };

  const amount = extractAmount(email.subject + ' ' + email.body);

  if (isTrial) {
    let trialEnd = extractExplicitDate(email.body) || extractRelativeDays(email.body, email.date);
    let confidence = trialEnd ? 'high' : 'low';
    if (!trialEnd) trialEnd = new Date(email.date.getTime() + 7 * 86400000); // varsayılan 7 gün, düşük güven
    return {
      type: 'trial',
      merchant: known ? known.name : (domain || 'Bilinmeyen servis'),
      cancelUrl: known ? known.cancelUrl : `https://${domain}`,
      amount, trialEnd, confidence, sourceDomain: domain
    };
  }

  return {
    type: 'receipt',
    merchant: known ? known.name : (domain || 'Bilinmeyen servis'),
    cancelUrl: known ? known.cancelUrl : `https://${domain}`,
    amount, date: email.date, confidence: known ? 'high' : 'medium', sourceDomain: domain
  };
}

// Opsiyonel: kural tabanlı sınıflandırma "irrelevant" veya düşük güvenli
// çıkarsa ve ANTHROPIC_API_KEY tanımlıysa, e-postayı LLM'e gönderip
// yapılandırılmış çıkarım ister. Gerçek bir API çağrısıdır — kendi
// anahtarınla çalışır, sahte değildir.
async function llmExtract(email) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const prompt = `Aşağıdaki e-postayı incele. Bu bir abonelik/deneme ile ilgiliyse
JSON döndür: {"type":"trial"|"receipt"|"irrelevant","merchant":string,"amount":number|null,"trial_end_date":"YYYY-MM-DD"|null,"confidence":"high"|"medium"|"low"}
Sadece JSON döndür, başka hiçbir şey yazma.

Konu: ${email.subject}
Gönderen: ${email.from}
İçerik: ${email.body.slice(0, 2000)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('LLM çıkarımı başarısız:', e.message);
    return null;
  }
}

module.exports = { SERVICES, classifyEmail, llmExtract };
