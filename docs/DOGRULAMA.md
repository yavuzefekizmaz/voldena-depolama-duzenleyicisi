# Voldena doğrulama sonuçları

## 2.2.0

49 test ve 38 JavaScript sözdizimi kontrolü geçti. Gizli Electron penceresinde 1440×900 ve 1080×760 yatay taşma, Windows simgeleri ve sürücü geçişinde açık klasör/sonuç korunumu doğrulandı. Geri yükleme komutlarının PowerShell sözdizimi Windows ayrıştırıcısıyla denetlendi; gerçek geri yükleme oluşturulmadı. Ayrıntılar [SURUM-2.2.0.md](SURUM-2.2.0.md), paket özetleri [PAKETLER.json](PAKETLER.json) içindedir. Aşağıdaki bölüm önceki sürümün tarihsel kaydıdır.

## 2.1.0 son doğrulama

40/40 otomatik test ve 34 JavaScript dosyası sözdizimi kontrolü geçti. Testler; gerçek C→D yapay dosya aktarımını, NTFS ek veri akışlarını, klasör taşıma ve tarih korunumunu, değişen kaynak/çakışma/iptal durumlarını, mükerrer grubunda bir kopyayı korumayı, kayıtlı tarama karşılaştırmasını ve güncelleme durum akışını içerir. Geri yükleme noktası için Windows sonucu taklit edilerek başarısız/sınırlı isteğin başarılı gösterilmemesi sınandı; gerçek sistem geri yükleme işlemi uygulanmadı.

Gizli gerçek Electron açılışı geçti. Gerçek Windows sürücü/klasör simgesi yanıtları, yerel PNG önizlemesi ve 1080×680 dahil kaydırmasız fiziksel sürücü alanı gözlendi. Paket içindeki main/preload/renderer/index/scanner/analiz/geri yükleme kaynakları paketleme kopyasıyla birebir karşılaştırıldı.

Kurulu güncellemede ETA ve otomatik kurulum tetikleme testleri başarılıdır; gerçek eski kurulumdan GitHub yayınına geçiş henüz uçtan uca uygulanmadı. Portable otomatik değiştirme etkin değildir. Son kapsam ve sınırlar [SON_DURUM.md](SON_DURUM.md) içinde yer alır.

## Önceki 2.0.0 ölçümleri

Tarih: 30 Ekim 2026. Ortam: Windows x64. Bu belge kaynak kod testlerini, gerçek disk ölçümünü, arayüz denemelerini ve dağıtım doğrulamasını ayrı tutar. Ölçümlerde kişisel dosyalar silinmedi veya taşınmadı; işlem testlerinde geçici yapay dosyalar kullanıldı. Ham disk kayıtları, günlükler ve kişisel yollar genel kaynak deposuna dahil edilmez.

## Otomatik kontroller

Son tam koşuda **21 testin 21'i geçti**; toplam süre 2.786 ms. JavaScript kontrolü **24 dosyada geçti**. Bu süre disk benchmark süresi değildir.

| Alan | Test sayısı | Doğrulanan davranışlar |
|---|---:|---|
| Ayarlar, geçmiş, günlükler, taşıma ve temizlik | 9 | Ayar doğrulama; kalıcı işlem niyeti ve sonuç kaydı; kesilen işlemin belirsiz olarak görünmesi; teknik günlük rotasyonu; ad çakışması ve değişmiş kaynağın reddi; taşıma/kopya doğrulaması ve iptal; yalnız taranmış eski dosyaların temizliği; Windows System özniteliği ve ADS engeli; geçmiş kaydı yazılamazsa işleme başlamama |
| Tarayıcı, worker ve dosya politikası | 9 | Sırası değişik MFT kayıtlarından doğru toplam; hardlink alanını bir kez sayma; 200 satır sınırı ve sayfalama; korumalı/bilinmeyen dosyaların önerilerden çıkarılması; 500 MiB alt sınırı; ağaç toplamlarını güncelleme; Unicode/gizli adlar; canlı worker ilerlemesi; bağlantı ve uygulama bileşeni koruması |
| Yerel NTFS ayrıştırıcısı | 1 | C# test programı içinde geçerli/bozuk sektör düzeltmesi, reddedilen kaydın değişmemesi, işaretli run ofseti, seyrek dosyanın gerçek tahsisi, uzantı adı/veri birleştirme ve tam kayıt sıra numarası |
| Sürücü bilgileri | 2 | Bulut bağlantısını fiziksel FAT32 diskten ayırma; bayt toplamları, boş alan, kullanım oranı ve sistem sürücüsü kimliği |

Kopyala/doğrula yolu yapay dosyayla zorlanarak test edildi. **İki ayrı fiziksel sürücü arasında gerçek taşıma yapılmadı.** Testler elektrik kesintisini, her dosya sistemi türünü veya bütün Windows kurulumlarını kapsamaz.

## Gerçek C: sürücüsü ölçümü

Yönetici erişimiyle, Voldena worker istemcisi ve yerel MFT yardımcısı birlikte çalıştırıldı. Ham sonuç yerel ve yayın dışı `test-artifacts/integrated-benchmark.json` dosyasında tutulur.

| Ölçüm | Sonuç |
|---|---:|
| Yöntem | NTFS MFT, uzantı kayıtları için iki geçiş |
| Toplam süre | **23,179 saniye** |
| Dosya sayısı | 1.511.135 |
| Klasör sayısı | 260.361 |
| Taranan ayrılmış alan | 224.444.637.184 bayt, yaklaşık 209,03 GiB |
| Mantıksal boyut | 814.104.030.421 bayt, yaklaşık 758,19 GiB |
| Windows'un bildirdiği sürücü kullanım alanı | 229.149.708.288 bayt |
| İki ölçüm arasındaki fark | 4.705.071.104 bayt, yaklaşık 4,38 GiB |
| Bildirilen tarama hatası | 0 |
| Ebeveyni eşleşmeyen kayıt | 0 |
| Canlı ilerleme güncellemesi | 45 |
| İlk dosya verisinin gelişi | 10,732 saniye |

İlk dosya verisinden önce uzantı kayıtları hazırlanır. Arayüz bu hazırlık aşamasını ve indekslenen kayıt sayısını gösterir; dosya boyutu sayacı ikinci geçişte artar. İlk dosya verisi süresi ile ilk pencerenin görünme süresi aynı ölçüm değildir. İndeksleme sayacı eklendikten sonra ayrı bir tam C: zamanlaması yapılmadı.

MFT referanslarının sıra numaraları korunur, uzantı kayıtlarındaki ad ve ana veri boyutları birleştirilir, hardlink fiziksel alanı tek kez sayılır. Mantıksal boyutun sürücü kapasitesinden büyük olması; seyrek/sıkıştırılmış dosyalar, yer tutucular ve birden çok dosya adının aynı veriyi göstermesiyle uyumludur.

Sürücü kullanımındaki yaklaşık 4,38 GiB farkın tamamı belirli dosyalara bağlanmış değildir. Alternatif veri akışları, dosya sistemi yönetim alanı, gölge kopyalar ve tarama sırasında değişen veriler tam eşitliği engelleyebilir. **Sıfır hata, bütün fiziksel alanın dosyalara eksiksiz dağıtıldığı anlamına gelmez.** Tarama bir VSS anlık görüntüsü değildir.

Bu ölçümde koruma politikasına uygun büyük kişisel dosya önerisi sayısı sıfırdı. Bu nedenle gerçek diskte temizlik/taşıma önerisi bulunduğu veya yer açıldığı iddia edilmez. Öneri eşikleri ve sistem dosyası dışlamaları yapay envanter testleriyle ayrıca doğrulandı.

Önceki kullanıcı gözlemi olan 97 saniye ile bu ölçüm farklı koşullardadır. TreeSize ile aynı hedef/önbellek/izin koşullarında yeni bir karşılaştırmalı runtime testi yapılmadı; doğrudan hız üstünlüğü veya her diskte aynı süre garantisi verilmez.

## WinSxS ve arayüz

| Deneme | Gözlenen sonuç |
|---|---|
| C: MFT sonucunda WinSxS sorgusu | 27.141 doğrudan öğeden ilk 100 satır 109 ms'de geldi; kalan öğeler sayfalı |
| Gerçek arayüzde, yönetici olmayan WinSxS taraması | Yerel dizin taraması: 130.647 dosya, 59.754 klasör; 12,25 saniye, sıfır bildirilen hata |
| Aynı arayüz denemesinde ilk kök verisi | 674 ms |
| Klasik ve Voldena görünümleri | Her ikisinde klasör satırının tamamıyla aç/kapat denendi |
| Küçük pencere | 1.080 piksel genişlikte iki görünüm ve menü daraltma denendi; incelenen tabloda yatay taşma görülmedi |
| Sürücü ayrımı | Yerel fiziksel C:/D:/F:/G:/I: listesi ile E:/H: bulut bağlantılarının durum gösterimi ayrıldı |
| Kişisel medya | Dosya adıyla açma, tür simgesi ve görünür kişisel görsel/video için sınırlı küçük resim istekleri mevcut |

Bu iki WinSxS sayısı aynı kapsamı ölçmez: 27.141 sayısı doğrudan çocuklar; 130.647 ve 59.754 sayıları alt ağaçtaki dosya ve klasörlerdir. Sıfır hata, ileride erişim kısıtı olmayacağı veya uygulamanın hiçbir koşulda kapanmayacağı garantisi değildir.

## İşlem ve kayıt sınırları

- Sistem ve uygulama verileri önerilerde gösterilmez; işlem isteği geldiğinde backend yol, bağlantı, kimlik ve Windows metadata denetimini yeniden yapar. WinSxS doğrudan temizlenmez.
- Hedefte aynı ad varsa üzerine yazılmaz. Diskler arası kopyalama SHA-256 ile doğrulanır; doğrulanmış hedef tamamlanmadan kaynak kaldırılmaz. Kaynak değişirse işlem durur.
- ADS, EFS/şifreleme, seyrek veya sıkıştırılmış dosya, bağlantı ve desteklenmeyen bulut/çevrimdışı öznitelikleri için taşıma reddedilir. Bu özellikler sessizce kaybedilerek taşınmaz; Windows Dosya Gezgini önerilir.
- Kurulu programların klasörlerini keyfi taşıma desteklenmez. Windows uygulama yönetimi veya uygulamanın kendi kurulum/taşıma yöntemi kullanılır.
- Bulut sürücüsünün durumunu göstermek, Google Drive hesabının bütün içeriğini tarama veya dosyayı otomatik yükleme değildir. Yerel kopyayı kaldırmadan buluta yüklemek tek başına alan açmaz.
- Silme/taşıma niyeti işlemden önce kalıcı olarak yazılır. Sonuç kaydı eksikse geçmişte işlem belirsiz görünür. Geçmiş otomatik temizlenmez; veri klasörünün silinmesi ya da diskin kaybına karşı yedekleme garantisi değildir.
- Teknik günlükler uygulama içinde görüntülenir; eylemler ve hatalar kaydedilir. Yaklaşık 2 MiB'lık dört metin dosyasıyla toplam yaklaşık 8 MiB tutulur. Her ilerleme güncellemesi ayrı günlük satırı üretmez. Kalıcı geçmiş bu rotasyona dahil değildir.
- Geri Dönüşüm Kutusu'na gönderme, aynı sürücüde kutu boşaltılana kadar fiziksel alanı serbest bırakmayabilir.

## Kaynak ve iletişim denetimleri

REA ile okunan EXE kaynakları ve belirteçler veri olarak ele alındı; dosya içeriği çalıştırılmadı veya talimat kabul edilmedi. Tam decompilation başarıyla tamamlanmış gibi raporlanmadı. [İnceleme raporu ve kanıt sınırları](research/treesize-inceleme.md)

Electron penceresinde `contextIsolation`, `sandbox` ve web güvenliği açık; Node erişimi renderer'a kapalı. Yeni pencere açma ve uygulama sayfasından dışarı gezinme engelleniyor. IPC isteklerinde uygulamanın kendi pencere/frame kaynağı denetleniyor. Dosya yolları kabuk komutuna birleştirilmeden yardımcı programa bağımsız argüman veya metadata protokolünde Base64 UTF-8 satırı olarak aktarılıyor. Bu gözlemler kapsamlı sızma testi yerine geçmez.

## Dağıtım doğrulaması

2.1.0 setup (121.598.894 bayt) ve portable (110.790.560 bayt) üretildi. Her iki EXE ve paketlenmiş ana uygulamada gerçek PE kaynak manifesti `requireAdministrator` olarak doğrulandı. `latest.yml` sürüm/dosya adı ve SHA-512 özeti gerçek setup ile eşleşti. SHA-256 özetleri [PAKETLER.json](PAKETLER.json) içinde kayıtlıdır.

Yerel teslimat `release/` içindeki 2.1.0 dosyalarıdır. Kurulumun gerçek çalıştırılması veya sürümler arası geçiş, yalnız manifest ve özet denetimleriyle doğrulanmış sayılmaz. Önceki geçici markalı deneme çıktıları teslimat değildir.

Kaynak yapılandırması yönetici manifestini, kurulumda başlangıç/masaüstü/Başlat menüsü seçeneklerini ve GitHub güncelleme akışını içeriyor. Oturum başlangıcı, gerçek kurulum/kaldırma ve daha yeni sürüme uçtan uca güncelleme; yalnız kaynak testleriyle tamamlanmış sayılmaz. Portable sürüm kalıcı başlangıç/kısayol ayarları oluşturmaz; güncel EXE indirilerek değiştirilir.

İmzalama sertifikası sağlanmadığından kod imzası beklenmez. Güncelleme metadatası ve dosya özeti denetimleri kod imzasının yerine geçmez. Son yayın bilgileri ve paket denetimi tamamlandığında bu bölüm gerçek sonuçlarla güncellenmelidir.
