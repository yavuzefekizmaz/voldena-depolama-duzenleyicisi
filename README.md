# Voldena Depolama Düzenleyicisi

Windows için yerel disk analizi ve kontrollü depolama yönetimi. Sürüm 2.1.0.

## Kullanım

GitHub Releases bölümündeki **setup.exe** kurulum içindir; **portable.exe** kurulmadan çalışır. Her ikisi Windows yönetici izni ister. Uygulama önce görünür, ardından sistem sürücüsünün taramasını başlatır. İlk aşamada NTFS kayıtları hazırlanır; sonra sayaçlar ve klasör ağacı canlı dolar.

- Dosya ağacında klasör satırının herhangi bir yerine tıklayarak açıp kapatın. Seçim ve işlem düğmeleri ayrı çalışır. Büyük klasörler sayfalar halinde yüklenir.
- Ayarlardan Voldena / klasik tablo görünümü, dosya gruplama, dört tema ve sol menüyü değiştirebilirsiniz.
- Boyut mantıksal dosya uzunluğudur; ayrılmış alan dosyanın diskte kullandığı alandır. Seyrek dosyalar, sıkıştırma, bulut yer tutucuları ve sabit bağlantılar fark yaratır.
- Büyük dosyalar 500 MB, 1 GB, 5 GB veya 10 GB eşikleriyle süzülür. Korumalı sistem ve uygulama verileri bu önerilerde gösterilmez. Uzantısız veya kaynağı bilinmeyen dosyalar otomatik olarak silinebilir sayılmaz.
- Taşıma için hedef klasörü seçip planı onaylayın. Var olan dosyaların üzerine yazılmaz. Diskler arasında dosya kopyası SHA-256 ile doğrulanır; doğrulama tamamlanmadan kaynak kaldırılmaz. Açık dosya, bulut bağlantısı, özel NTFS veri akışı ve desteklenmeyen öznitelikler için işlem durdurulur.
- Kurulu programlar Windows uygulama ayarlarından yönetilir. Program Files veya AppData klasörünü doğrudan taşımak desteklenmez.
- Temizlik önce adayları gösterir ve onay ister. Eski önbellek dosyaları işlem öncesi yeniden doğrulanır. Geri Dönüşüm Kutusu seçeneği varsayılandır; disk alanı kutu boşaltıldığında açılır. WinSxS ve Windows Update temizliğini Windows yönetir.
- Silme geçmişi otomatik silinmez. Teknik günlükler uygulama içinde okunur ve yaklaşık 8 MB ile sınırlandırılır; her ilerleme adımı için kayıt üretilmez. Kullanıcı veri klasörünü silmek veya diski kaybetmek geçmişi de kaybettirir; dışa aktarma ile yedekleyebilirsiniz.
- Başlangıç, bildirim alanında açılma, masaüstü ve Başlat menüsü kısayolları ayarlardan değişir. Görev çubuğuna sabitleme Windows sağ tık menüsünden yapılır. Portable sürüm kalıcı başlangıç/kısayol kaydı oluşturmaz.
- Güncellemeler GitHub Releases üzerinden kontrol edilir. Kurulu sürümde indirme boyutu, hız ve kalan süre gösterilir; indirme doğrulanınca açık dosya işlemleri beklenir ve kurulum başlar. Portable sürüm yeni EXE indirilerek değiştirilir.

## Tarama motoru ve kapsam

Yerel NTFS sürücülerinde yönetici erişimiyle MFT okunur. Adlar ve ana veri boyutları uzantı kayıtlarıyla birleştirilir, MFT sektör düzeltmeleri doğrulanır, kayıt sıra numaraları korunur ve sabit bağlantı alanı bir kez sayılır. Desteklenmeyen dosya sistemi veya erişim durumunda Windows FindFirstFileEx dizin taramasına geçilir. Bu durumda tahsis hesabı yaklaşık olabilir; hata ve kapsam bilgileri gösterilir.

Tarama ve sıralama ayrı bir iş parçacığında, yerel disk okuması ayrı yardımcı işlemde çalışır. Arayüze yalnız sınırlı sayfalar aktarılır. Tarama anlık bir disk görüntüsü değildir; dosya sistemi metaverileri, alternatif veri akışları, gölge kopyalar ve tarama sırasında değişen veriler nedeniyle kullanılan disk alanıyla tam eşitlik beklenmez.

## Geliştirme ve paketleme

Windows x64, Node.js 22.12+ ve Windows ile gelen .NET Framework 4 derleyicisi gerekir.

```powershell
npm ci
node node_modules/electron/install.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-native.ps1
npm test
npm run check
npm start
npm run build
```

Çıktılar `release/` klasöründe setup, portable, blockmap ve latest.yml olarak oluşur. Kod imzalama sertifikası bu projeye gömülmez; imzasız yeni yayınlarda Windows SmartScreen uyarısı çıkabilir.

Kaynaklar OneDrive altında isteğe bağlı dosyalarsa derleme için önce yerel bir kopya oluşturun. Ham disk testleri, yerel REA kanıtları ve günlükler GitHub’a eklenmez.

## Belgeler

- [TreeSize incelemesi ve özellik karşılaştırması](docs/research/treesize-inceleme.md)
- [Sürüm doğrulama sonuçları](docs/DOGRULAMA.md)
- [2.1.0 teslimat durumu ve doğrulanmamış sınırlar](docs/SON_DURUM.md)

Güncelleme deposu: https://github.com/yavuzefekizmaz/voldena-depolama-duzenleyicisi
