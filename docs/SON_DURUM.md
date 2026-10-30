# Voldena 2.1.0 — teslimat durumu

30 Ekim 2026. Son kapsam sınırı, kullanım tüketimi geri bildirimi üzerine mevcut değişiklikleri doğrulayıp paketlemektir.

## Tamamlananlar

- Yönetici MFT taraması, ayrı tarama işlemi, canlı sayaç/ağaç, sayfalı klasörler, hata ayrıntıları, mantıksal ve ayrılmış alan ayrımı.
- Voldena ve klasik tablo görünümleri; tüm klasör satırından genişletme; daraltılabilir menü, büyütülen sürücü yazıları ve dört tema.
- Fiziksel sürücüler solda; Google Drive bağları yalnız sürücü durumunda. Gerçek Windows simgesi API’si ve yerel medya küçük resimleri.
- 500 MB / 1 GB / 5 GB / 10 GB eşikleri; korunan sistem ve uygulama verilerinin önerilerden çıkarılması; dosya açıklamaları ve taşıma/bulut önerileri.
- Önizlemeli kişisel dosya/klasör taşıma; üzerine yazmama; ana içerik ve NTFS veri akışlarının SHA-256 doğrulaması; tarihleri koruma; iptal ve kalıcı işlem kaydı.
- Windows tarafından desteklenen MSIX taşıması için plan ve işlem. Masaüstü uygulamalarında desteklenen yeniden kurulum yöntemi açıklanır; Program Files keyfi taşınmaz.
- Yaşa ve izinli konumlara göre temizlik, onay, Geri Dönüşüm Kutusu varsayılanı, kalıcı geçmiş ve boyutu sınırlı uygulama içi teknik günlük.
- Alan haritası, tür/yaş istatistikleri, SHA-256 ve ek veri akışlarıyla mükerrer incelemesi, bir kopyayı koruma denetimi, kayıtlı tarama ve klasör büyümesi karşılaştırması.
- Kurulu sürümde güncelleme boyutu/hızı/kalan süre, açık dosya işlemlerini bekleme, indirme sonrası kurulum ve kurulum hazırlık penceresi.
- Ayarlarda geri yükleme noktası düğmesi; paketlenmiş uygulama açılışında sessiz Windows isteği. Windows’un günlük sınırı ve koruma ayarları aşılmaz; başarısız istek başarılı gösterilmez. Klasik Sistem Geri Yükleme kişisel dosya yedeği değildir.
- Yönetici manifestli setup/portable; kurulumda masaüstü, Başlat menüsü, oturum açılışı ve gizli açılış seçenekleri.

## Doğrulama ve sınırlar

40 otomatik test ve 34 JavaScript dosyası sözdizimi denetimi geçti. Gerçek C→D aktarımı yalnız oluşturduğumuz test dosyalarıyla ana veri, ek akışlar ve tarih korunumu için sınandı. Kullanıcının mevcut dosyaları veya kurulu uygulamaları taşınmadı/silinmedi.

Önceki tam C ölçümü 23,2 saniye, yaklaşık 1,51 milyon dosya; WinSxS sayfa sorgusu 109 ms idi. Oyun veya başka disk etkinliği sürerken aynı süre garanti edilmez. TreeSize’ın kaynak/PE incelemesi tamamlandı; tam kod çözümlemesi zaman aşımına uğradı ve tüm kapalı kaynak özelliklerinin kopyalandığı iddia edilmez.

**Tamamlandı sayılmayanlar:** Portable EXE’nin kendini otomatik değiştirmesi etkin değildir; yeni portable dosyası indirilip kapalıyken değiştirilir. Gerçek kurulu eski sürümden GitHub üzerinden yeni sürüme geçiş ve MSIX uygulama taşıması kullanıcı programları üzerinde uçtan uca uygulanmadı. Windows’un izin vermediği geri yükleme noktası oluşturulamaz. Bulut yer tutucuları, şifreli/sıkıştırılmış/seyrek dosyalar ve diskler arası salt okunur özel dosyalar açıklamalı olarak korunur. Her masaüstü programını güvenle başka diske taşıyabilen genel bir yöntem sunulmaz.

Setup ve portable üretildi; yönetici manifestleri ve güncelleme SHA-512 özeti doğrulandı. Ayrıntılar [PAKETLER.json](PAKETLER.json) içindedir. Yayın: https://github.com/yavuzefekizmaz/voldena-depolama-duzenleyicisi/releases/tag/v2.1.0 . Ham REA kanıtları, tarama yolları ve test dosyaları GitHub’a eklenmez.
