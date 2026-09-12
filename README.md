# kazan. — gerçek işlevsel prototip (sadece e-posta entegrasyonu)

Bu, konuştuğumuz tasarımın **gerçekten çalışan** kod hâlidir: gerçek Google OAuth2,
gerçek Gmail API taraması, gerçek regex tabanlı tespit motoru, gerçek dosya tabanlı
veritabanı, gerçek zamanlanmış (cron) tarama işi. Kartla ilgili hiçbir şey yok —
sadece e-posta, ve birden fazla e-posta hesabı bağlanabiliyor.

Çalıştırmak için kendi Google Cloud kimlik bilgilerini oluşturman gerekiyor —
bunlar sana ait olmak zorunda, benim üretebileceğim bir şey değil.

## 1. Google Cloud kurulumu (tek seferlik, ~10 dakika)

1. https://console.cloud.google.com adresinde yeni bir proje oluştur.
2. **APIs & Services → Library** içinden **Gmail API**'yi bul ve etkinleştir.
3. **APIs & Services → OAuth consent screen**:
   - User type: External
   - Uygulama adı, destek e-postası vb. gir
   - Scopes bölümüne `.../auth/gmail.readonly` ekle
   - **Test users** bölümüne kendi Gmail adresini (ve test etmek istediğin diğer
     adresleri) ekle — Google onaylamadığı sürece uygulama sadece buradaki
     kullanıcılarla çalışır (bu normal ve beklenen bir durum, gerçek kullanıcılara
     açmadan önce Google'ın doğrulama sürecinden geçmen gerekir).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Oluşan **Client ID** ve **Client Secret**'ı bir sonraki adımda `.env`'e yapıştır.

## 2. Kurulum

```bash
cp .env.example .env
# .env dosyasını aç, GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / JWT_SECRET doldur
npm install
npm start
```

Tarayıcıda `http://localhost:3000` adresini aç.

## 3. Render'a deploy etme (adım adım)

1. **GitHub'a push et** (yaptın). `.env` dosyasının repo'da OLMADIĞINDAN emin ol
   (`.gitignore` zaten engelliyor) — sırları asla GitHub'a koyma.
2. Render'da **New + → Web Service**, GitHub reponu seç.
3. Ayarlar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (denemek için yeterli)
4. **Environment** sekmesinden (Settings → Environment → Add Environment Variable)
   şunları tek tek ekle — `.env` dosyası deploy'a hiç gitmediği için bunlar
   Render'da **elle** girilmek zorunda, en sık atlanan adım burası:
   - `JWT_SECRET` → rastgele uzun bir metin (örn. terminalde `openssl rand -hex 32`)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` → Google Cloud Console'dan
   - `GOOGLE_REDIRECT_URI` → **dikkat:** artık `localhost` değil, Render'ın sana
     verdiği gerçek adres olmalı: `https://senin-servisin.onrender.com/auth/google/callback`
   - Bunu Google Cloud Console → Credentials → OAuth Client'ındaki **Authorized
     redirect URIs** kısmına da aynen eklemen lazım, yoksa Google bağlantıyı reddeder.
5. **Deploy**'a bas, Render loglarının bitmesini bekle ("Live" yazana kadar).
6. `https://senin-servisin.onrender.com` adresini aç, kayıt olmayı dene.

**"Sunucu hatası" görürsen:** Render panelinde **Logs** sekmesine gir, tam hata
mesajını (stack trace) bul. En sık nedenler:
- `JWT_SECRET` tanımlı değil → artık kod bunun yerine geçici bir anahtar üretip
  uyarı basıyor, çökmüyor — ama loglardaki uyarıyı görürsen `JWT_SECRET`'ı ekle.
- `GOOGLE_REDIRECT_URI` yanlış/eksik → sadece Google bağlama adımını etkiler,
  normal giriş/kayıtı etkilemez.
- Render'ın ücretsiz planı **kalıcı disk desteklemez** — `data/db.json` her
  yeniden başlatmada (deploy, ya da 15 dakika hareketsizlik sonrası "uyuma")
  sıfırlanır. Bu bir hata değil, ücretsiz planın bir sınırı — kalıcı veri için
  ileride Render'ın ücretli "Persistent Disk" özelliğine ya da bir Postgres
  eklentisine geçmen gerekecek.

Loglardaki hatayı bana yapıştırırsan birlikte çözeriz.

## 4. Kullanım

1. Hesap oluştur / giriş yap (e-posta + şifre, bu kısım Google'dan bağımsız,
   uygulamanın kendi hesabı).
2. "E-posta hesabı bağla" ile Google'ın **gerçek** izin ekranına yönlendirilirsin.
3. İzin verdikten sonra son 6 ayın maili taranır, tespit edilen denemeler ve
   tekrarlayan faturalar panelde görünür.
4. Sağ üstteki profil menüsünden "Bağlı hesaplar" ile **ikinci, üçüncü bir
   e-posta adresini** aynı akışla ekleyebilirsin — her biri ayrı ayrı taranır,
   sonuçlar tek panelde birleşir. Birden fazla hesap bağlıyken başlıkta beliren
   hesap anahtarına (ör. "Tüm hesaplar") tıklayarak sadece belirli bir hesabın
   sonuçlarını görüntülemeye geçebilirsin — uygulamadan çıkıp tekrar girmen
   gerekmez, oturum boyunca aynı ekranda geçiş yaparsın.
5. "İptal et" bir servisin resmi hesap sayfasını yeni sekmede açar; o sekmede
   işlemi bitirip bu sekmeye döndüğünde onay kutusu seni bekliyor olur.

## 5. Android uygulamasına dönüştürme

Kod artık gerçek bir PWA (manifest.json + service worker + ikonlar) — bu iki farklı gerçek yol açıyor:

### A) En hızlı yol — kurulum gerektirmez (Play Store'da yayınlanmaz)

Render'a deploy ettiğin adresi Android'de Chrome ile aç. Artık manifest + service
worker kriterleri karşılandığı için Chrome kendiliğinden "Ana ekrana ekle" / yükleme
istemi gösterir (göstermezse ⋮ menüsünden "Uygulamayı yükle"). Yüklendiğinde ayrı bir
ikon, adres çubuğu olmayan tam ekran bir pencere — gerçek bir uygulama gibi davranır.
Kod değişikliği gerekmiyor, bu adım zaten tamamlandı.

### B) Play Store'a koyabileceğin gerçek APK/AAB — TWA (Trusted Web Activity)

Google'ın resmi yolu bu — basit bir WebView sarmalayıcı değil, gerçek bir Android
paketi üretir. Kendi bilgisayarında (bende değil, çünkü imzalama anahtarını SENİN
güvenle saklaman gerekiyor):

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://SENIN-RENDER-ADRESIN/manifest.json
```

Sırasında sorduğu paket adını (örn. `com.senin.kazan`) ve imzalama bilgilerini gir —
bu bir `android.keystore` dosyası oluşturur. **Bu dosyayı ve şifresini kaybetme** —
uygulamayı güncellemek için her seferinde aynı anahtar gerekiyor.

```bash
bubblewrap build
```

Bu, `app-release-signed.apk` (telefona direkt yükleyip test etmek için) ve
`app-release-bundle.aab` (Play Console'a yüklemek için) üretir.

**Adres çubuğunu tamamen kaldırmak için** (yoksa tarayıcıda açılmış gibi görünür),
Digital Asset Links doğrulaması gerekiyor:

```bash
keytool -list -v -keystore android.keystore -alias android
```

çıktısındaki SHA256 parmak izini kopyala, `public/.well-known/assetlinks.json`
oluştur:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.senin.kazan",
    "sha256_cert_fingerprints": ["BURAYA:SHA256:PARMAK:IZINI:YAPISTIR"]
  }
}]
```

Bunu GitHub'a push edip Render yeniden deploy ettikten sonra
`https://SENIN-RENDER-ADRESIN/.well-known/assetlinks.json` adresinde erişilebilir
olmalı (server.js'te bunun için `dotfiles: 'allow'` zaten ayarlı — Express varsayılan
olarak nokta ile başlayan klasörleri gizler).

Play Store'da yayınlamak için Google Play Console hesabı (tek seferlik 25$) ve
`.aab` dosyasını yüklemen yeterli. Sadece kendi telefonuna kurmak istiyorsan
`adb install app-release-signed.apk` ile direkt yükleyebilirsin.



- **Gerçek zamanlılık = polling, push değil.** Varsayılan olarak her 15 dakikada
  bir tüm bağlı hesaplar taranır (`SYNC_INTERVAL_MINUTES`). Gerçek anlık
  bildirim için Gmail'in `users.watch()` + Google Cloud Pub/Sub webhook'u
  kurulmalı — bu, herkese açık bir HTTPS adresi ve ek GCP yapılandırması
  gerektirir, bu yüzden minimal başlangıç için dahil etmedim.
- **Veritabanı** `data/db.json` — gerçek, kalıcı, ama tek dosyalı. Birden fazla
  sunucu örneği veya ciddi trafik için Postgres/SQLite'a taşınmalı.
- **Refresh token'lar şifresiz saklanıyor** (`data/db.json` içinde düz metin).
  Gerçek kullanıcı verisiyle çalışacaksan bunları şifreleyerek saklamalısın
  (örn. KMS/Vault ile) — tasarımda konuştuğumuz "hassas veri güvenliği" zor
  parçası burada hâlâ çözülmedi, bilerek.
- **Tespit motoru** kural tabanlı (regex + bilinen 8 servis). Yeni bir merchant
  eklemek `services/detection.js` içindeki `SERVICES` haritasına birkaç satır
  eklemek kadar basit. `ANTHROPIC_API_KEY` tanımlarsan, eşleşmeyen mailler için
  LLM tabanlı çıkarıma otomatik düşer (hibrit model — tasarımda konuştuğumuz gibi).
- **"Kullanıyorum" / iptal onayı kullanıcı beyanına dayanır** — sistem gerçekten
  ücretin kesilip kesilmediğini doğrulamıyor (bunun için banka verisi gerekirdi,
  bilerek kapsam dışı bıraktık).
