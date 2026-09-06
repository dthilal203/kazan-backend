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

## 3. Kullanım

1. Hesap oluştur / giriş yap (e-posta + şifre, bu kısım Google'dan bağımsız,
   uygulamanın kendi hesabı).
2. "E-posta hesabı bağla" ile Google'ın **gerçek** izin ekranına yönlendirilirsin.
3. İzin verdikten sonra son 6 ayın maili taranır, tespit edilen denemeler ve
   tekrarlayan faturalar panelde görünür.
4. Sağ üstteki profil menüsünden "Bağlı hesaplar" ile **ikinci, üçüncü bir
   e-posta adresini** aynı akışla ekleyebilirsin — her biri ayrı ayrı taranır,
   sonuçlar tek panelde birleşir.
5. "İptal et" bir servisin resmi hesap sayfasını yeni sekmede açar; o sekmede
   işlemi bitirip bu sekmeye döndüğünde onay kutusu seni bekliyor olur.

## Bilerek basit bıraktığım / bilmen gereken sınırlar

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
