# Voldena 2.2.0

1 Kasım 2026

## Bu güncelleme

- Disk başına tarama ve açık klasör durumu uygulama açık kaldığı sürece korunur. Başka sürücü seçmek önceki taramayı iptal etmez; taramalar sırayla yürütülür. Tara düğmesi sonuçları bilerek yeniler.
- Klasörler gerçek Windows klasör simgesini kullanır. Sürücü ve program simgeleri ayrı alınır. Simge istekleri tek yardımcı işlemde önbelleğe alınır.
- Koyu gri tema ve Mix tablo eklendi. Daha belirgin girinti, dal çizgileri, etkin satır ve konum yolu; okunabilen Bilgi/Taşı/Sil düğmeleri; daha küçük tarama başlığı ve sayfalar arasında sürücü seçimi vardır.
- Büyük kişisel dosyalar mantıksal boyutlarına göre bulunur. OneDrive dosyalarının listeden yanlışlıkla çıkarılması düzeltildi; özel dosyaların taşıma/silme koruması sürer. Sistem ve uygulama verileri kişisel temizlik önerisi yapılmaz.
- Temizleme sayfası açılırken adaylar otomatik yüklenir. Programlar ve temizleme kategorileri seçilen sürücüye göre süzülür. Kurulum yeri belirsiz programlara C: varsayımı yapılmaz; Riot kurulum kaydı kullanılır.
- CSV raporu etkin sayfanın içeriğini kullanır. GitHub güncelleme deposu arayüzde ve ayar doğrulamasında sabittir.
- Uygun masaüstü uygulamaları için uygulama içinden kontrollü taşıma eklendi. Önizleme, boş alan ve çalışan süreç/servis denetimi, dosyalar ve ek veri akışlarında SHA-256 doğrulaması, iptal, işlem kaydı ve yarım kalan kaynak konumunu kurtarma vardır. Eski kurulum yolu Windows klasör bağlantısıyla korunur.
- Geri yükleme isteği Windows'un günlük oluşturma sıklığını geçici olarak kaldırıp önceki ayarı geri koyar. Elle oluşturma sistem sürücüsünde Sistem Korumasını etkinleştirmeyi dener. Gerçek yeni nokta doğrulanmadan başarı gösterilmez.

## Doğrulama

49 otomatik test ve 38 JavaScript dosyasının sözdizimi kontrolü geçti. Testler tarama kuyruğu/önbelleği, büyük dosya politikası, sabit depo, CSV, Windows simgeleri, uygulama taşıma, iptal, başarısız bağlantı oluşturma ve yarım kalan taşımanın geri alınmasını kapsar.

Gizli Electron penceresinde 1440×900 ve 1080×760 kontrol edildi: yatay taşma yok, üç gerçek dosya/klasör simgesi yükleniyor, etkin satır ve iki açık klasör sürücü geçişinden sonra korunuyor, konsol/renderer hatası yok. Gerçek kullanıcı programları taşınmadı veya silinmedi.

Paylaşılan günlükte normal MFT taramaları yaklaşık 15–19 saniyeydi. Yaklaşık 67 saniyelik tarama, hızlı sürücü geçişleri sırasında MFT yanıt hatasından sonra yedek taramaya düşmüştü; işlem yaşam döngüsü ve tarama oturumları düzeltildi. Yeni sürüm için tam C: performans ölçümü henüz yapılmadı. Korunan Windows klasörlerindeki 20 erişim reddi için izinler değiştirilmez; ayrıntılar günlükte kalır.

## Sınırlar

Masaüstü taşıması her program için uygun değildir: çalışan uygulamalar, servis/sürücü ve anti-cheat içeren uygulamalar, özel dosyalar ve ortak kurulum kökleri reddedilir. Hedef yerel NTFS olmalı ve bağlı kalmalıdır. Bazı kurulum/güncelleme araçları klasör bağlantısını değiştirebilir. Bu yöntem Windows'un paketli uygulama taşımasından ayrıdır.

Windows geri yükleme noktası kişisel dosya yedeği değildir. Windows ilkeleri/hizmetleri oluşturmayı engelleyebilir; yeni sürümde gerçek Windows geri yükleme oluşturma işlemi test amacıyla çalıştırılmadı. Başarısızlık ayarlarda açıkça gösterilir.

Kurulu 2.1.0 üzerinden gerçek güncelleme kurulumu kullanıcıya bırakılmıştır. Portable sürüm yeni EXE indirilerek değiştirilir. Paket manifesti ve özet denetimleri gerçek kurulum denemesinin yerine geçmez.
