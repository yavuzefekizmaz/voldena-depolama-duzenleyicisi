# TreeSize incelemesi ve Voldena için sonuçlar

İnceleme tarihi: 30 Ekim 2026. Bu rapor, bilgisayarda bulunan iki uygulamanın salt okunur dosya incelemesini, REA kaynak envanterini, üreticinin belgelerini ve Voldena için alınan tasarım kararlarını birbirinden ayırır. Uygulamaların lisans ya da etkinleştirme mekanizmaları bu çalışmanın konusu değildir. TreeSize kaynak kodu Voldena'ya kopyalanmadı.

## 1. İncelenen kurulumlar ve kanıt sınırı

| Kurulum | Dosya sürümü | Mimari | Dosya boyutu | SHA-256 |
|---|---|---|---:|---|
| `%ProgramFiles%\JAM Software\TreeSize Free\TreeSizeFree.exe` | 4.8.1.610; ürün 4.8.1 | PE32+, x64 | 60.945.496 bayt | `d72bfe9b69b656df864a9c7ca14abc8be38d4b273e5a09e5bc042eee587ecf31` |
| `%LocalAppData%\Programs\JAM Software\TreeSize\TreeSize.exe` | 9.8.0.2301; ürün 9.8 | PE32+, x64 | 74.363.264 bayt | `817064aee3482d88852ea3303c6605a5bdfcae56255231299fad1846d2cf9700` |

Sürümler, Windows sürüm kaynaklarından; mimari ve ithalat tablosu PE başlıklarından okundu. Bunlar dosyanın gözlenen özellikleridir. Ürün sürüm kaynağı, kurulu ücretli lisansın hangi yetenekleri açtığını tek başına kanıtlamaz.

REA `inspect_pe_resources` ile iki dosyanın kaynak ağacı incelendi:

| Kanıt | Sonuç | Tamamlanmış kapsam |
|---|---|---|
| `ev_39ec7c48b71e6b17ef7a96ae43bc66540ba2fc920837d46880268e7cd7f5b648` | TreeSize Free | 688 kaynak ağacı girdisi, 337 kaynak |
| `ev_42a801308ca69f8b0071eb999b120fe1f51d58f381e068aa10a23cb9db9cd780` | TreeSize | 1.135 kaynak ağacı girdisi, 560 kaynak |

İki dosyada da sürüm, simge ve manifest kaynaklarının yanında `VCLSTYLE`, `UIFILE`, `UNICODEDATA` kaynak türleri görüldü. Bu bulgu, PE içindeki sınıf adlarıyla birlikte Delphi/VCL tabanlı yerel bir arayüze işaret eder; tek başına hangi kod yolunun çalıştığını göstermez. Kaynak sayısının fazla olması performans veya kalite ölçüsü değildir.

Ana incelemedeki REA/Ghidra derin analiz girişimi, Free dosyası için 330.000 ms başlangıç sınırında zaman aşımına uğradı. Bu yüzden bu rapor tam işlev ayrıştırması veya çalışan MFT algoritmasının decompilation ile doğrulandığı iddiasında bulunmaz. Kaynak envanteri başarıyla tamamlandı; PE ithalatları ve dosya içi belirteçler ayrıca `pefile` ile okundu. Aynı başarısız analiz, değişmeyen koşullarda tekrar edilmedi. Hedef uygulamalar bu inceleme sırasında çalıştırılmadı; kullanıcı ekran görüntüleri ayrıca kullanıcı gözlemi olarak ele alındı.

Yerel kanıt dosyaları `docs/research/evidence/` altında tutulur. Ham kanıtlar kurulum yolları ve dosya içi belirteçler içerdiği için genel kaynak yayınına dahil edilmemelidir. REA kanıt paketi iki tamamlanmış kaynak incelemesini içerir; Ghidra zaman aşımı kaydı bu paket içinde tamamlanmış analiz gibi sunulmaz.

## 2. Tarama neden daha hızlı görünüyor ve gerçekten ne yapıyor?

Üretici, TreeSize Free'nin yerel NTFS sürücülerinde MFT'yi kullandığını; MFT erişimi olmayan hedeflerde ve ağ sürücülerinde dosya sistemi taramasına geçtiğini açıklıyor. Aynı sayfa Free için iki, Professional için en fazla 32 paralel tarama iş parçacığı belirtiyor. Tarama sürerken sonuçların gezilebilmesi de ayrı bir özellik. [Üreticinin özellik sayfası](https://www.jam-software.com/treesize/features.shtml)

İncelenen iki EXE'de de `JAM.WinApi.NTFS.MFT`, `MftRecordNumber`, `FixupMFT`, `TMftFileSizeData`, `TMftUniqueHardlinkData` ve `TMftRootWorkItem` gibi adlar bulundu. Free'deki `JAM.WinApi.NTFS.MFT` adayı dosya ofseti 16.360.702'de; TreeSize'daki karşılığı 37.596.430'da. Bunlar MFT ayrıştırma ve sabit bağlantı muhasebesinin paket içinde bulunduğuna ilişkin statik kanıttır. Bir belirtecin bulunması, ilgili yöntemin her taramada seçildiğini kanıtlamaz.

Her iki ithalat tablosunda `DeviceIoControl`, `GetFileInformationByHandle`, `GetCompressedFileSizeW`, `BackupRead`, `AdjustTokenPrivileges`, `LookupPrivilegeValueW`, `NtQueryDirectoryFile` ve dosya bulma API'leri yer alıyor. Free'de `NtQueryDirectoryFileEx` gecikmeli ithalatı da var. `SeBackupPrivilege` belirteci iki dosyada da bulundu. Bunlar üretici belgelerindeki NTFS, izin ve yedekleme erişimi açıklamalarıyla uyumlu. Kesin IOCTL değerleri, seçilen iş parçacığı sayısı ve tarama sırasındaki çağrı dizisi bu statik çalışmada gözlenmedi.

MFT yaklaşımında her dosyanın içeriğini açmak yerine dosya sisteminin kayıtları toplu okunur. Özellikle milyonlarca küçük dosyada çok sayıda dizin ve metadata çağrısının maliyeti azalır. Bunun yanında canlı sayaç ve erken klasör listesi kullanıcının boş bir ekran beklemesini engeller. Bunlar farklı kazanımlardır: canlı sonuç göstermek süreyi tek başına kısaltmaz.

Voldena'daki karşılık:

1. NTFS sürücü kökü için salt okunur MFT yolu; destek veya yetki yoksa açıkça belirtilen yerel dizin taraması.
2. Dosya adları ve boyutları için yerel Windows metadata yardımcısı; her sıradan dosyaya ayrı JavaScript `stat` çağrısını azaltma.
3. Metadata ağacı, toplama ve sıralamayı ayrı worker'da tutma.
4. Sonucu bitişte tek büyük paket olarak göndermek yerine yaklaşık yarım saniyelik sınırlı ilerleme paketleri.
5. Görünen klasörün çocuklarını en çok 200 satırlık sayfalarla isteme; bütün diski arayüz öğelerine dönüştürmeme.

Son uygulamada MFT uzantı kayıtlarındaki dosya adları ve ana veri boyutları iki geçişle birleştiriliyor. Tam MFT kayıt referansları sıra numaralarıyla korunuyor; sektör düzeltmesi önce doğrulanıyor, ardından uygulanıyor. Desteklenmeyen kayıt/extent düzeninde sessiz eksik sonuç yerine yedek tarama seçiliyor. İlk geçişte işlenen kayıt sayısı da arayüze ilerleme olarak aktarılıyor.

Gerçek C: sürücüsünde yönetici erişimiyle yapılan Voldena ölçümü 23,179 saniye sürdü: 1.511.135 dosya ve 260.361 klasör, 224.444.637.184 bayt ayrılmış alan; 45 canlı arayüz güncellemesi. İlk dosya verisi 10,732 saniyede geldi; öncesi MFT uzantı indeksinin hazırlanmasıydı. Yeni indeksleme sayacı bu hazırlığı da görünür kılıyor. WinSxS içindeki 27.141 doğrudan öğenin ilk 100 satırı 109 ms'de sorgulandı. Bu ölçüm TreeSize ile aynı koşullarda yapılmış karşılaştırmalı bir yarış değildir. [Doğrulama koşulları ve sınırlar](../DOGRULAMA.md)

Bu seçimler Voldena'nın kendi uygulamasıdır. TreeSize'ın iç veri yapılarının aynısının yeniden kurulduğu söylenemez. Disk, dosya sayısı, izinler, önbellek ve sistem yükü süreyi değiştirir; “her diski X saniyede tarar” sözü verilmemelidir.

## 3. 148 GB ile sürücü kullanımının farklı olmasının nedenleri

Kullanıcının 148 GB sonucu, 222 GB toplam ve 11 GB boş alan gözlemiyle tek başına tam neden belirlenemez. Önceki Voldena kodunda bazı sistem dizinlerinin isimle atlandığı doğrudan görüldü. Ayrıca yöneticilik ve erişim hataları sonuçtan ayrı gösterilmiyordu. Bu eksik kapsama neden olabilir.

Windows'un sürücü kullanım değeri ile dosya boyutları toplamı aynı ölçüm değildir. Üretici; erişim kısıtları, fiziksel tahsis, dosya sistemi yönetim alanı ve ayrılmış sistem depolamasını olası fark kaynakları olarak açıklıyor. Yönetici çalıştırmak erişimi artırır; bütün farkı otomatik olarak ortadan kaldırmaz. [TreeSize bilgi bankası](https://knowledgebase.jam-software.com/treesize/)

Kullanıcının ekran görüntüsünde aynı kökte yaklaşık 753,3 GB “Boyut” ve 218,0 GB “Ayrılmış” görünüyor. Bu, mantıksal dosya uzunlukları ile fiziksel alanı ayırmanın neden gerekli olduğunu gösterir; 753 GB verinin gerçekten bu küçük diskte fiziksel olarak tutulduğu anlamına gelmez. Görüntüdeki tek tek dosyaların bu farktaki payı ölçülmedi.

| Durum | Görünen fark | Doğru davranış |
|---|---|---|
| Seyrek sanal disk | `.img`/`.vhdx` dosyasının uzunluğu, ayrılan alanından çok büyük olabilir | İki boyutu ayrı göster; imajın içindeki veriyi gereksiz sayma |
| Sıkıştırılmış dosya | İçerik uzunluğu fiziksel tahsisten büyüktür | Sıkıştırmayı metadata üzerinden tanı |
| Birden çok sabit bağlantı | Birçok ad aynı fiziksel veriyi gösterir | Fiziksel toplamda bir kez say; tek adın silinmesini bütün alanın kazanılması gibi gösterme |
| Bulut yer tutucusu | Ad ve mantıksal boyut var; içerik yerelde olmayabilir | Sırf analiz için dosya içeriğini indirip diski doldurma |
| Junction/mount point | Başka klasör veya diske yönlendirir | Varsayılan olarak izleme; tekrar sayma ve döngüyü engelle |
| ADS | Normal akışın boyutu dışında veri vardır | Hızlı modun kapsam sınırını belirt; tam doğruluk modunu ayrıca tasarla |
| Erişilemeyen klasör | Boyut eksik kalır | Hata sayısı ve sınırlı örnek listesi göster |

NTFS davranışları üreticinin [NTFS notlarında](https://manuals.jam-software.com/treesize/EN/notesonntfs.html) açıklanıyor. Daha pahalı sabit bağlantı/ADS denetimi ve sahiplik istatistiklerinin süreyi uzatabildiği de [tarama seçeneklerinde](https://manuals.jam-software.com/treesize/EN/scan_options.html) belirtiliyor. Voldena uzantı kayıtlarını ana veri hesabına birleştiriyor; alternatif veri akışları ve özel dosya sistemi özellikleri için tam tahsis eşitliği iddia etmiyor.

## 4. Arayüzden alınan somut dersler

Kullanıcının görsellerindeki okunabilirliği sağlayan şey tek başına pencere genişliği değil: az dikey boşluk, aynı satırda sayısal sütunlar, türüne göre simge, genişletilebilir ağaç ve büyüklüğü anlatan yüzdelik çubuklar birlikte çalışıyor. Klasör içindeki dosyaların ayrı toplu satır altında gösterilmesi de klasörleri bulmayı kolaylaştırıyor.

Voldena'de iki görünüm kararı bu ihtiyaca dayanıyor: açıklamalı Voldena görünümü ve daha sıkı Klasik tablo. Sol menünün kapanabilmesi, dosya adının esnemesi, sayısal sütunların korunması ve uzun yolun ayrıntıya taşınması küçük pencerelerde işe yarar. Klasik tablodaki alanlar: ad, mantıksal boyut, ayrılmış alan, dosya sayısı, klasör sayısı, üst klasöre oran ve son değişiklik. Son değişiklik klasörün kendi metadata zamanı mı, alt ağacın en yeni değişimi mi açıkça tanımlanmalıdır.

Üreticinin [dizin ağacı belgesi](https://manuals.jam-software.com/treesize/EN/directorytree.html), boyut çubuğu, genişletme, eşik ve araç ipuçlarını; [ayrıntılar belgesi](https://manuals.jam-software.com/treesize/EN/details.html) ise mantıksal/tahsis boyutlarını, dosya/klasör sayılarını, oranı ve zaman alanlarını ayırıyor. Voldena'nın açıklama ve risk etiketleri bunlara ek olarak yeni kullanıcıya işlem sonucunu anlatmayı amaçlıyor. Kişisel görsel/video dosyalarında küçük resim isteği yalnız görünür öğeler için sınırlı eşzamanlılıkla yapılır; sistem ve bulut dosyaları için bu amaçla içerik okuması yapılmaz.

## 5. Özellik matrisi: mevcut kapsam ve ek geliştirme alanları

Bu tablo “TreeSize ile eksiksiz eşitlik” iddiası değildir. Voldena sütunundaki mevcut özellikler son kaynak kodla karşılaştırıldı; ileri aşama olarak belirtilenler uygulamada tamamlanmış sayılmaz. Kaynak testleri, gerçek disk ölçümü ve arayüz denemeleri [doğrulama belgesinde](../DOGRULAMA.md) yer alır. Kurulum ve güncelleme paketlerinin son doğrulaması ayrıca izlenir.

| Yetenek | TreeSize tarafındaki kanıt | Voldena kapsamı / karar |
|---|---|---|
| Yerel NTFS hızlı analiz | Üretici MFT açıklaması + iki EXE'deki MFT belirteçleri | MFT yardımcısı; uyumsuz durumda dizin taraması |
| Tararken görünen sonuçlar | Üretici özellik belgesi ve kullanıcı görselleri | Artan sayaç, sınırlı kök özeti, tararken ağaç sorgulama |
| Çok büyük dizinlerin gezilmesi | Üretici ayrıntı/ağaç belgeleri | Worker sorguları ve sayfalama; gerçek WinSxS ağacı ve 27.141 öğeli sayfa sorgusu denendi |
| Dosya/klasör tarihleri ve sayıları | Ayrıntılar belgesi | Klasik tablo sütunları |
| Boyut ile tahsisin ayrılması | Ayrıntılar/NTFS belgeleri | Ayrı alanlar ve kapsam açıklaması |
| Dosya türü ve kullanıcı açıklaması | Voldena tasarım kararı | Uzantı/konuma dayalı açıklama; belirsizlik açık etiketlenir |
| Sistem dosyası koruması | Arama seçeneklerindeki sistem dışlama önerisi | Öneri listesinden dışlama ve backend işlem engeli |
| Büyük kişisel dosyalar | Üretici genel bakış belgesi | En az 500 MB; 1/5/10 GB seçenekleri |
| Eski/geçici dosyalar | Üretici arama belgeleri | Yaş ve izinli konumla daraltılan adaylar; önizleme/onay |
| Dosyayı başka diske taşıma | Ayrıntılar ve dosya araması belgeleri | Hedef klasör seçimi, çakışma/boş alan kontrolü, doğrulamalı kopyalama |
| Kurulu uygulamayı taşıma | Keyfi klasör taşıması için bu çalışmada kanıt yok | Windows'un desteklediği yönetim ekranına yönlendirme; program klasörü doğrudan taşınmaz |
| Bulutta saklama önerisi | Voldena tasarım kararı | Kişisel medya için öneri; otomatik yükleme entegrasyonu yok |
| Kalıcı silme geçmişi | Kullanıcı gereksinimi | Ayrı işlem kaydı; teknik günlük rotasyonundan bağımsız |
| Boyutu sınırlı teknik günlük | Kullanıcı gereksinimi | Uygulama içi görüntüleme, eylem/hata kaydı; yaklaşık 8 MiB toplam teknik günlük, ayrı kalıcı geçmiş |
| Tema / görünüm / menü | Kullanıcı gereksinimi | İki görünüm, kapanabilen sol menü, tema seçenekleri |
| Güncelleme ve dağıtım | Kullanıcı gereksinimi | GitHub sürümleri, manuel kontrol/indirme/kurma akışı, setup ve portable |
| Mükerrer içerik bulma | Üretici mükerrer dosya belgesi | İleri aşama: aynı boyut adayları, kademeli hash ve son SHA-256 doğrulaması |
| Mükerrer klasör/benzersiz dosya arama | Üretici mükerrer dosya belgesi | Henüz genel yetenek olarak tamamlanmış sayılmaz |
| Hardlink ile otomatik tekilleştirme | Üretici mükerrer dosya belgesi | Ayrı riskli özellik; bu sürümde otomatik eklenmedi |
| Gelişmiş içerik/regex/izin filtreleri | Üretici filtre belgesi | İleri aşama; basit ad aramasının karşılığı değildir |
| Treemap, pasta/sütun grafikleri | Üretici genel bakış belgesi | İleri görselleştirme alanı; tabloyla aynı özellik sayılmaz |
| Sahiplik, ACL, yaş/tür istatistikleri | Üretici tarama/ayrıntı belgeleri | İleri analiz alanı; ek süre/RAM maliyeti ölçülmeli |
| Kayıtlı tarama ve büyüme kıyaslama | Üretici genel bakış belgesi | İleri aşama: sürümlemeli snapshot formatı ve karşılaştırma |
| VSS anlık görüntü kıyaslama | Üretici belge gezinimi | Ayrı Windows yeteneği; sıradan dosya taramasıyla eş tutulmaz |
| Excel/PDF/HTML/XML/CSV dışa aktarma | Üretici arama şeridi belgesi | Mevcut: büyük dosya CSV raporu, işlem geçmişi JSONL, teknik günlük metni. Genel Excel/PDF/HTML/XML raporları yok |
| Çoklu yeniden adlandırma, ZIP arşivleme | Üretici arama şeridi belgesi | İleri dosya yönetimi alanı |
| Zamanlanmış tarama/işlem ve CLI | Üretici zamanlama/CLI belgeleri | İleri otomasyon alanı; Windows açılışında başlatmayla aynı özellik değildir |
| SSH/S3/Azure/SharePoint/Outlook/MTP hedefleri | Üretici hedef listesi | Ayrı bağlayıcılar yok. Yerelde bağlı Google Drive sürücülerinin durumunun gösterilmesi, bulut hesabının tamamının analiz edildiği anlamına gelmez |
| NTFS sıkıştırma/izin değişiklikleri | Üretici NTFS/ayrıntılar belgesi | Ayrı, açık onaylı yönetim işi; otomatik temizlik gibi sunulmaz |

Mükerrer arama için üretici içerik hash'i ile yalnız ad/boyut/tarih eşleşmesini açıkça ayırıyor; dosyaların aynı ada sahip olması eşit içerik kanıtı değildir. [Mükerrer dosya araması](https://manuals.jam-software.com/treesize/EN/duplicate_file_search.html)

İçerik aramasının düz metin ve Windows IFilter gibi ek mekanizmalara ihtiyaç duyduğu, yol uzunluğu ve hardlink filtrelerinin ayrı seçenekler olduğu belgeleniyor. [Desteklenen filtre türleri](https://manuals.jam-software.com/treesize/EN/availablefiltertypes.html)

Dosya işlemleri, toplu yeniden adlandırma, ZIP, çıktı formatları ve önizleme gibi komutlar ayrı arama arayüzünde bulunuyor. [Dosya araması komutları](https://manuals.jam-software.com/treesize/EN/file_search_main_menu.html)

Zamanlama Professional sürüme bağlı bir özellik olarak açıklanıyor; zamanlanmış silme ve taşıma için dosya işlemlerinin ayrıca yapılandırılması gerekiyor. [Tarama zamanlama](https://manuals.jam-software.com/treesize/EN/schedule_scans.html), [zamanlanmış taşıma/silme](https://manuals.jam-software.com/treesize/EN/howtoschedulemove.html)

## 6. Güvenilir öneri ve taşıma için ürün kuralları

“Ne dosyası?” açıklaması, uzantı ve konumdan çıkarılabildiği ölçüde verilir. Özellikle `aggregate.img`, `userdata.img`, `Microsoft.ListSync.db` veya uzantısız uzun adlar için içerik incelenmeden kesin sahip uygulama söylenmemelidir. Bir imaj kişisel video gibi değerlendirilemez. Sistem koruması yalnızca arayüzdeki gizleme davranışına bırakılmamalıdır; silme/taşıma isteği backend'de yeniden kontrol edilmelidir.

Temizleme önerisinde toplam kazanımın kaynağı ayrı olmalı: güvenli konumdaki eski önbellek, incelenecek kişisel dosyalar ve Windows'un kendi aracından yönetilecek alan. Kullanıcıya gösterilmeden “tek tuş” adı altında farklı risk sınıfları silinmemelidir. Geri dönüşüm kutusuna gönderilen dosya, kutu boşaltılana kadar aynı sürücüde alan tutabilir.

Diskler arası taşımada hedefin yeterli alanı, ad çakışması, kaynak değişikliği ve kopyanın hash'i denetlenmelidir. Kaynak, doğrulanmış hedef tamamlanmadan kaldırılmamalıdır. ADS, EFS, bulut yer tutucusu ve seyrek dosya gibi özel durumlar desteklenmiyorsa işlem reddedilip neden açıklanmalıdır. Kesinti sonrası kaynak/hedef durumunu anlamaya yarayan kalıcı işlem kaydı tutulmalıdır.

Kurulu bir programın birkaç GB'lık klasörünü başka sürücüye taşımak; kayıt defteri, servis, güncelleme ve kısayol bağımlılıklarını kendiliğinden düzeltmez. Antigravity gibi belirli bir program için taşınabilirlik ayrıca doğrulanmadıkça Windows'un izin verdiği taşıma, yeniden kurma veya uygulamanın kendi konum ayarı önerilir. Bu sınır, kullanıcı verisinin kaybını önleyen bir ürün davranışıdır.

## 7. Kabul ölçütleri ve kalan belirsizlikler

- İlk pencere çizildikten sonra otomatik sistem diski taraması başlar; hazırlık sırasında boş pencere bekletilmez.
- Tarama boyunca sayaç ve ağaç güncellenir; yeni klasörün gelmesi mevcut genişletilmiş dalları kapatmaz.
- WinSxS gibi kalabalık bir klasörde gezinme ana pencereyi kilitlemez; her sorgu sınırlı sayfa döndürür.
- Klasik ve Voldena görünümleri normal pencere boyutunda denenir; ad, tür ve boyut birlikte görünür.
- Gizli dosyalar isimleri nedeniyle topluca atlanmaz; erişim reddi ve izlenmeyen bağlantılar raporlanır.
- Mantıksal ve ayrılmış alan ayrıdır; sürücü kullanılan alan farkı “eksik dosya” olarak kesinleştirilmez.
- Sistem/uygulama verileri büyük dosya temizleme listesinden dışlanır ve backend'de korunur.
- Silme/taşıma testleri yalnız yapay test dosyalarında yapılır; işlem geçmişi ve başarısızlık kayıtları denetlenir.
- Yönetici MFT yolu, normal yetkili yedek yol ve NTFS dışı hedef ayrı test koşullarıdır.
- Benchmark hedef, dosya sayısı, yöntem, yetki, süre ve hata sayısıyla raporlanır; TreeSize için yeni bir karşılaştırmalı runtime ölçümü yapılmadıysa hız eşitliği ileri sürülmez.

Bu inceleme MFT stratejisini ve arayüz derslerini yeterli biçimde temellendiriyor. Kapalı kaynak uygulamanın bütün algoritmalarının ve her sürüme bağlı yeteneğinin tersine mühendisliği tamamlanmış değildir. Yukarıdaki ileri özellikler, bir sonraki kapsam kararının somut listesidir; tamamlanmamış özellikler teslimatta varmış gibi gösterilmemelidir.
