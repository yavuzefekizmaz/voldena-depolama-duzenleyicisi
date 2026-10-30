'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
const inside = (value, root) => normalize(value) === normalize(root) || normalize(value).startsWith(normalize(root) + path.sep);
const win = value => String(value).replace(/\//g, '\\').toLowerCase();
const types = [
  ['Video', 'video', /\.(mp4|mkv|avi|mov|wmv|webm|m4v|mpeg|mpg|ts)$/i, 'Bir video dosyası. İzlemek için medya oynatıcıyla açabilirsiniz.'],
  ['Fotoğraf ve görsel', 'image', /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|raw|psd|svg)$/i, 'Fotoğraf veya görsel dosyası; kişisel içeriğiniz olabilir.'],
  ['Ses ve müzik', 'audio', /\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i, 'Müzik veya ses kaydı.'],
  ['Belge', 'document', /\.(pdf|docx?|xlsx?|pptx?|txt|csv|odt|rtf|epub)$/i, 'Belge veya çalışma dosyası; silmeden önce içeriğini kontrol edin.'],
  ['Arşiv', 'archive', /\.(zip|rar|7z|tar|gz|bz2|xz)$/i, 'Birden çok dosya içerebilen sıkıştırılmış arşiv. Açılmış kopyası varsa arşive hâlâ ihtiyaç duyup duymadığınızı inceleyin.'],
  ['Kurulum paketi', 'installer', /\.(exe|msi|msix|appx|dmg|pkg|deb|rpm)$/i, 'Program kurulum paketi veya çalıştırılabilir dosya. Kurulu bir uygulamayı kaldırmak için bu dosyayı silmek yeterli değildir.'],
  ['Disk ve sanal makine imajı', 'disk', /\.(img|iso|vhdx?|vmdk|qcow2?)$/i, 'Diskin veya sanal makinenin içeriğini barındırabilir. Silmek içindeki tüm verileri kaybettirebilir; ilgili uygulama kapalı olmadan taşımayın.'],
  ['Veritabanı / uygulama verisi', 'database', /\.(db|sqlite3?|dat|bin|pak|dll|sys|reg|log)$/i, 'Bir uygulamanın verisi, veritabanı veya bileşeni olabilir. Dosya adı içeriğini güvenilir biçimde açıklamaz.'],
  ['Kaynak kod ve proje', 'document', /\.(js|ts|jsx|tsx|py|cs|cpp|c|h|rs|go|java|html|css|json|xml|yaml|yml|toml|lock)$/i, 'Bir yazılım projesinin kodu veya yapılandırmasıdır. Tek dosyayı silmek ya da taşımak projeyi bozabilir; proje bütünlüğünü koruyun.'],
];

function describePath(target, meta = {}) {
  const p = win(target), name = path.win32.basename(p), isDir = !!meta.isDir;
  let category = isDir ? 'Klasör' : 'Tanımlanamayan dosya', icon = isDir ? 'folder' : 'file';
  let description = isDir ? 'Alt klasör ve dosyaları içerir. İçeriği incelemek için genişletin.' : 'Dosya uzantısından içerik belirlenemedi. Hangi uygulamanın oluşturduğu doğrulanmadan silme önerisi verilmez.';
  for (const [label, glyph, pattern, text] of types) if (!isDir && pattern.test(name)) { category = label; icon = glyph; description = text; break; }
  if (!isDir && name === 'microsoft.listsync.db') description = 'Microsoft Lists / liste eşitleme veritabanı olabilir. Adı bu kullanıma işaret eder; sahip uygulama doğrulanmadığı için silme önerilmez.';
  let risk = 'unknown', canDelete = false, canMove = false;
  const windows = win(process.env.SystemRoot || 'C:\\Windows');
  const protectedPath = p === windows || p.startsWith(windows + '\\') || /(^|\\)(system volume information|recovery|\$recycle\.bin|\$extend|\$secure|\$mft|\$boot)(\\|$)/.test(p) || /(^|\\)(pagefile\.sys|swapfile\.sys|hiberfil\.sys|bootmgr|bootnxt|ntldr|bcd|dumpstack\.log(?:\.tmp)?)$/.test(p) || /(^|\\)(efi|boot)(\\|$)/.test(p) || /^[a-z]:\\?$/.test(p);
  const application = /(^|\\)(program files(?: \(x86\))?|programdata|windowsapps|appdata|msocache|node_modules|\.git|\.venv|venv|steamapps|xboxgames)(\\|$)/.test(p);
  if (protectedPath || (Number(meta.attributes) & 4)) {
    risk = 'protected'; description = 'Windows veya korumalı sistem verisi. El ile silmek ya da taşımak Windows’un çalışmasını veya kurtarma özelliğini bozabilir. ' + (p.includes('winsxs') ? 'WinSxS, Windows bileşen deposudur; alan yönetimi için Windows Depolama / Disk Temizleme kullanılmalıdır.' : description);
  } else if (application) {
    risk = 'caution'; description = 'Kurulu bir uygulamanın ayarları, önbelleği veya kullanıcı verisi olabilir. Elle silme/taşıma uygulamayı bozabilir. ' + description;
    if (name === 'microsoft.listsync.db') description = 'Microsoft Lists / liste eşitleme veritabanı olabilir. Adı bu kullanıma işaret eder; sahip uygulama doğrulanmadığı için silme önerilmez.';
    if (name === 'userdata.img' || name === 'aggregate.img') description = 'Bir emülatör veya sanal disk uygulamasının disk imajı olabilir. Oyunları ve kullanıcı verilerini içerebilir. Seyrek dosyalarda görünen boyut ile diskteki alan farklıdır. Sahip uygulama belirlenmeden silmeyin.';
  } else {
    const knownUserRoot = /(^|\\)(downloads|indirilenler|desktop|masaüstü|documents|belgeler|pictures|resimler|videos|videolar|music|müzik)(\\|$)/.test(p);
    const userHome = inside(target, os.homedir());
    const ordinary = ['Video', 'Fotoğraf ve görsel', 'Ses ve müzik', 'Belge', 'Arşiv', 'Kurulum paketi'].includes(category);
    const otherProfile = /^[a-z]:\\users\\/i.test(p) && !userHome;
    const executable = category === 'Kurulum paketi' && /\.(exe|msix|appx)$/i.test(name);
    const installerLocation = /(^|\\)(downloads|indirilenler|desktop|masaüstü)(\\|$)/.test(p);
    const reservedPersonalRoot = isDir && (normalize(target) === normalize(os.homedir()) || /^(users|desktop|masaüstü|documents|belgeler|downloads|indirilenler|pictures|resimler|videos|videolar|music|müzik|onedrive(?: - .+)?)$/.test(name));
    if (isDir && !otherProfile && !reservedPersonalRoot) { risk='personal';canMove=true;description+=' Taşımadan önce bütün alt dosyalar doğrulanır; uygulama veya sistem bileşeni varsa işlem durdurulur.'; }
    else if (ordinary && !otherProfile && (!executable || installerLocation) && (knownUserRoot || userHome || !/^[a-z]:\\users\\/i.test(p))) { risk = 'personal'; canDelete = true; canMove = true; }
    else if (executable) {risk = 'caution'; description += ' Çalıştırılabilir uygulama bileşenleri yalnızca konumlarına bakılarak kurulum artığı sayılamaz.';}
    else if (category === 'Disk ve sanal makine imajı' || category === 'Veritabanı / uygulama verisi') risk = 'caution';
  }
  if (meta.isReparse || (Number(meta.attributes) & 0x400)) { if(risk!=='protected')risk = 'caution'; canDelete = false; canMove = false; description += ' Bağlantı veya bulut yer tutucusu; bağlantı hedefi ve eşitleme durumu doğrulanmadan işlem yapılmaz.'; }
  if (isDir) {
    const explanations = {
      users:'Windows kullanıcı hesaplarının kişisel klasörlerini ve uygulama ayarlarını barındırır. Alt klasörlerden hangi hesabın alan kullandığını görebilirsiniz.',
      'program files':'Kurulu 64 bit uygulamaların dosyaları. Programları kaldırmak veya desteklenen bir diske taşımak için Kurulu uygulamalar bölümünü kullanın.',
      'program files (x86)':'Kurulu 32 bit uygulamaların dosyaları. Klasörü elle taşımak uygulamaları çalışmaz hâle getirebilir.',
      programdata:'Uygulamaların tüm kullanıcılar için ortak verileri, modelleri, veritabanları ve önbellekleri. Dosyaları sahip uygulama üzerinden yönetin.',
      appdata:'Kullanıcıya ait uygulama ayarları ve verileri. İçinde silinmemesi gereken hesap, profil ve veritabanları da bulunur.',
      downloads:'İndirilen dosyalar. Büyük ve eski kurulum paketlerini inceleyebilirsiniz; dosyanın yaşı tek başına gereksiz olduğunu göstermez.',
      documents:'Kişisel belgeler ve bazı uygulama projeleri. Yedeklemeden önce içeriklerini kontrol edin.',
      pictures:'Kişisel fotoğraf ve görseller. Başka diske ya da buluta kopyaladıktan sonra yedeğin açıldığını doğrulayın.',
      videos:'Video dosyalarınız. Büyük videoları başka diske taşıyarak bu sürücüde alan açabilirsiniz.',
    };
    if(explanations[name])description=explanations[name]+(risk==='protected'?' Sistem koruması uygulanır.':'');
  }
  if (!isDir && (meta.isHardlink || meta.nlink > 1)) { canDelete = false; canMove = false; if (risk !== 'protected') risk = 'caution'; description += ' Sabit bağlantı: aynı veri birden çok adla görünebilir; alan tek kez sayılır.'; }
  const labels = {protected:'Sistem dosyası', caution:'Silinmesi önerilmez',personal:'Kişisel dosya', cache:'Önbellek', unknown:'İçeriği doğrulanmalı'};
  let advice = canMove ? 'Başka bir sürücüye taşıyabilirsiniz. Bulutta saklayacaksanız yüklemenin tamamlandığını ve dosyanın açıldığını doğrulayın; buluta yüklemek tek başına yerel alanı boşaltmaz.' : risk === 'protected' ? 'Yönetim için Windows Depolama ayarlarını kullanın.' : 'Önce dosyanın ait olduğu uygulamayı ve içeriğini kontrol edin.';
  if (category === 'Video' && canMove) advice = 'Videoyu başka bir diske taşıyabilir veya Google Drive’a yükleyebilirsiniz. Yerel kopyayı kaldırmadan önce yüklemeyi ve videonun açıldığını doğrulayın.';
  return {category, label:category, icon, description, risk, riskLabel:labels[risk], canDelete, canMove, advice};
}

async function assertMutable(target, options = {}) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || target.includes('\0') || (process.platform === 'win32' && (/^\\\\/.test(target) || /:[^\\/]/.test(target.slice(2)) || /[. ](?:[\\/]|$)/.test(target)))) throw new Error('Geçerli bir yerel dosya yolu seçin.');
  const resolved = path.resolve(target);
  const stats = await fs.promises.lstat(resolved);
  if (stats.isSymbolicLink() || (!stats.isDirectory()&&stats.nlink > 1) || (!stats.isFile() && !stats.isDirectory())) throw new Error('Bağlantılar ve birden fazla sabit bağlantısı olan dosyalar değiştirilemez.');
  if (stats.isDirectory() && !options.allowDirectory) throw new Error('Bu işlem tek tek kişisel dosyalar için kullanılabilir.');
  const actual = await fs.promises.realpath(resolved);
  if (normalize(actual) !== normalize(resolved)) throw new Error('Bağlantı üzerinden işlem yapılamaz.');
  const classification = describePath(resolved, {isDir:stats.isDirectory(), nlink:stats.nlink});
  // Cache permission is narrow: only files beneath explicit, non-system roots.
  const cache = options.operation === 'delete' && stats.isFile() && (options.cacheRoots || []).some(root => inside(resolved, root) && normalize(resolved) !== normalize(root)) && classification.risk !== 'protected';
  if (!(options.operation === 'move' ? classification.canMove : classification.canDelete) && !cache) throw new Error('Bu öğe korumalı veya içeriği doğrulanmamış. Windows ya da ilgili uygulamanın kendi yönetimini kullanın.');
  return {path:actual,stats,classification};
}
module.exports = {describePath,assertMutable,inside};
