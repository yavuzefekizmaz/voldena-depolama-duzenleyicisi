# Devam notları — Voldena 2.0.0

Bu belge önceki ara durumu arşivler. Güncel 2.1.0 sonuçları için [SON_DURUM.md](SON_DURUM.md) dosyasını okuyun; aşağıdaki dondurma kararı ve tamamlanmamış UI maddeleri güncel durum değildir.

30 Ekim 2026. Kullanıcının kapsamı durdurma isteğiyle yeni uygulama değişikliği yapılmıyor; mevcut setup ve portable çıktıları tamamlanıyor. Bu liste sonraki çalışmanın başlangıç noktasıdır.

## Kullanıcının kalan istekleri

1. **Gerçek Windows simgeleri:** Mevcut tür simgelerine ek olarak klasör/dosya simgelerini `app.getFileIcon` üzerinden al. Kullanıcı mevcut SVG simgelerini beğenmedi. Görünür öğeleri yükle; eşzamanlılık ve bellek sınırı koy. Büyük ağaçta kaydırma, önbellek ve sistem/bulut dosyası davranışını dene. Medya küçük resimleri zaten var.
2. **Soldaki sürücü yazıları:** Yazı boyutunu büyüt. Fiziksel sürücü kartları ve daraltılmış menüde, 1.080 piksel genişlikte kesilme/taşma olmadığını doğrula.
3. **Güncelleme deneyimi:** Kontrol ve indirme mevcut; kurulum şu anda ayrı düğmeyle başlıyor. Kalan süre tahmini, indirme sonrası otomatik kurulum, ayrı “Yeni sürüm yükleniyor” bildirimi ve güncellenmiş uygulamanın yeniden açılması isteniyor. İndirme kesintisi, açık taşıma işlemi, UAC, kurulum hatası ve yeniden başlatma davranışı henüz uçtan uca denenmedi. Portable sürüm otomatik kurulumla aynı akışta ele alınmamalı.

## Sonraki yayın

- Sürümü 2.0.1'e yükselt; bağımlılık kilidini uyumlu tut.
- Testleri ve JavaScript kontrolünü çalıştır; yerel yardımcıyı yeniden derle.
- x64 setup, blockmap, `latest.yml` ve portable üret. Dosya adları, özetleri ve yönetici manifestini doğrula.
- `yavuzefekizmaz/voldena-depolama-duzenleyicisi` GitHub Releases yayınına bu çıktıları birlikte koy. `latest.yml` içindeki ad/boyut/SHA-512 gerçek setup ile eşleşmeli.
- Kurulu 2.0.0 üzerinden kontrol → indirme → kurulum → 2.0.1'in açılması akışını gerçek Windows oturumunda test et. Başlangıç, kısayollar ve işlem geçmişinin korunduğunu kontrol et. Yeni sürüme gerçek geçiş yapılmadan otomatik güncelleme tamamlandı sayılmaz.

## İleri kapsam

Treemap/grafikler, içerik hash'iyle mükerrer arama, kayıtlı tarama ve büyüme karşılaştırması, gelişmiş filtreler, ACL/sahiplik istatistikleri ve ek rapor formatları tamamlanmadı. Öncelik, kalan kullanıcı arayüzü ve güncelleme akışını kapatmak olmalı. Kurulu programları keyfi klasör taşımasıyla yönlendirme; desteklenmeyen NTFS/bulut dosyalarını özel özelliklerini kaybederek taşıma eklenmemeli.

[Doğrulama sonuçları](DOGRULAMA.md) ve [TreeSize özellik karşılaştırması](research/treesize-inceleme.md) mevcut kanıtı ve sınırları içerir. Son kaynak koşusu 21/21 test ve 24 JavaScript dosyası kontrolüyle geçti. Son paketlerin durumu doğrulama belgesindeki dağıtım bölümünden takip edilir.
