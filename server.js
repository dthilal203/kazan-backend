require('dotenv').config();

// JWT_SECRET tanımlı değilse (örn. Render'da ortam değişkeni eklenmemişse)
// giriş/kayıt istekleri sunucu tarafında sessizce çöküyordu. Artık çökmek
// yerine uyarı basıp geçici bir anahtarla devam ediyoruz — ama bunu
// GÖRDÜĞÜNDE Render panelinden gerçek bir JWT_SECRET eklemelisin, yoksa
// her yeniden başlatmada mevcut oturumlar geçersiz olur.
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET tanımlı değil — geçici bir anahtar üretildi. Render → Environment kısmından kalıcı bir JWT_SECRET eklemelisin.');
  process.env.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
}

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
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'allow' })); // dotfiles:allow -> /.well-known/assetlinks.json servis edilebilsin (TWA doğrulaması için gerekli)

app.use('/api/auth', authRoutes);
app.use('/', googleAuthRoutes); // /auth/google ve /auth/google/callback
app.use('/api', subscriptionRoutes);

app.get('/', (req, res) => res.redirect('/index.html'));

// Güvenlik ağı: bir route içinde beklenmeyen bir hata olursa (try/catch
// kaçırılmışsa bile) kullanıcı Express'in çıplak HTML hata sayfasını değil,
// anlaşılır bir JSON hata mesajı görsün — önceki "sunucu hatası" belirsizliğinin
// bir kısmı da buradan kaynaklanıyordu.
app.use((err, req, res, next) => {
  console.error('Beklenmeyen hata:', err);
  res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`kazan. çalışıyor → http://localhost:${PORT}`);
  scheduler.start();
});
