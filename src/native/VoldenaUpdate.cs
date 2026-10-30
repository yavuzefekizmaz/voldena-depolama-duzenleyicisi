using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;

// Portable replacement runs independently of Electron and its temporary folder.
class VoldenaUpdate : Form {
    public class Plan {
        public string source,target,backup,sha512,version,nonce,ackPath,createdAt;
        public long size; public int parentPid;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool MoveFileEx(string source,string destination,uint flags);
    Label title,status;ProgressBar bar;Button close;Plan plan;string planPath;
    static string Full(string p){return Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar);}
    static bool Same(string a,string b){return String.Equals(Full(a),Full(b),StringComparison.OrdinalIgnoreCase);}
    static Plan LoadPlan(string file){
        var info=new FileInfo(file);if(!info.Exists||info.Length>32768)throw new Exception("Güncelleme planı bulunamadı veya geçersiz.");
        var data=new JavaScriptSerializer().Deserialize<Plan>(File.ReadAllText(file,Encoding.UTF8));
        if(data==null||String.IsNullOrEmpty(data.nonce)||!System.Text.RegularExpressions.Regex.IsMatch(data.nonce,"^[a-f0-9]{32}$"))throw new Exception("Güncelleme kimliği geçersiz.");
        if(String.IsNullOrEmpty(data.version)||!System.Text.RegularExpressions.Regex.IsMatch(data.version,"^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$"))throw new Exception("Sürüm geçersiz.");
        foreach(string p in new[]{data.source,data.target,data.backup,data.ackPath})if(String.IsNullOrEmpty(p)||!Path.IsPathRooted(p)||p.StartsWith(@"\\")||p.IndexOf('\0')>=0)throw new Exception("Yerel güncelleme yolu geçersiz.");
        string parent=Path.GetDirectoryName(Full(data.target));
        if(!Same(parent,Path.GetDirectoryName(data.source))||!Same(parent,Path.GetDirectoryName(data.backup))||Same(data.source,data.target)||!data.target.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))throw new Exception("Güncelleme dosyaları aynı klasörde olmalı.");
        if(Path.GetFileName(data.source)!=".voldena-update-"+data.nonce+".exe"||!Same(data.backup,data.target+".voldena-backup-"+data.nonce))throw new Exception("Güncelleme dosya adları geçersiz.");
        if(!Same(Path.GetDirectoryName(data.ackPath),Path.GetDirectoryName(file))||Path.GetFileName(data.ackPath)!="started.json")throw new Exception("Başlangıç onayı yolu geçersiz.");
        DateTime created;if(!DateTime.TryParse(data.createdAt,null,System.Globalization.DateTimeStyles.RoundtripKind,out created)||DateTime.UtcNow-created.ToUniversalTime()>TimeSpan.FromMinutes(30)||created.ToUniversalTime()-DateTime.UtcNow>TimeSpan.FromMinutes(5))throw new Exception("Güncelleme planı süresi dolmuş.");
        if(data.parentPid<=0||data.size<=0||data.size>2147483648L||String.IsNullOrEmpty(data.sha512))throw new Exception("Güncelleme bilgileri eksik.");
        RejectReparse(data.source);RejectReparse(data.target);RejectReparse(parent);
        return data;
    }
    static void RejectReparse(string file){if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new Exception("Bağlantı veya bulut klasörü üzerinden otomatik değiştirme yapılamaz.");}
    static void Verify(Plan p){
        if(new FileInfo(p.source).Length!=p.size)throw new Exception("İndirilen dosyanın boyutu değişti; eski sürüm korunuyor.");
        byte[] expected=Convert.FromBase64String(p.sha512),actual;
        using(var sha=SHA512.Create())using(var file=new FileStream(p.source,FileMode.Open,FileAccess.Read,FileShare.Read))actual=sha.ComputeHash(file);
        int different=expected.Length^actual.Length;for(int i=0;i<Math.Min(expected.Length,actual.Length);i++)different|=expected[i]^actual[i];
        if(different!=0)throw new Exception("Dosya doğrulaması başarısız; eski sürüm korunuyor.");
    }
    static void Replace(Plan p){
        if(File.Exists(p.backup))throw new Exception("Güncelleme yedeği zaten var; eski sürüm korunuyor.");
        File.Copy(p.target,p.backup,false);
        using(var backup=new FileStream(p.backup,FileMode.Open,FileAccess.ReadWrite,FileShare.Read))backup.Flush(true);
        DateTime until=DateTime.UtcNow.AddSeconds(45);
        while(!MoveFileEx(p.source,p.target,0x1|0x8)){
            int code=Marshal.GetLastWin32Error();if((code!=32&&code!=5)||DateTime.UtcNow>until)throw new System.ComponentModel.Win32Exception(code,"Yeni sürüm yerleştirilemedi. Eski EXE ve yedeği korunuyor.");Thread.Sleep(250);
        }
    }
    void TextStatus(string text){if(!IsDisposed)BeginInvoke((Action)(()=>status.Text=text));}
    void Record(string outcome,string detail){try{File.AppendAllText(Path.Combine(Path.GetDirectoryName(planPath),"result.jsonl"),new JavaScriptSerializer().Serialize(new{time=DateTime.UtcNow.ToString("o"),outcome=outcome,detail=detail})+Environment.NewLine,Encoding.UTF8);}catch{}}
    async void RunUpdate(object sender,EventArgs e){
        try{
            await Task.Run(()=>{
                TextStatus("İndirilen yeni sürüm son kez doğrulanıyor…");Verify(plan);
                TextStatus("Voldena’nın kapanması bekleniyor…");
                try{using(var parent=Process.GetProcessById(plan.parentPid)){if(!parent.WaitForExit(120000))throw new Exception("Voldena kapanmadı. Eski sürüm korunuyor; uygulamayı kapatıp tekrar deneyin.");}}catch(ArgumentException){}
                TextStatus("Yeni sürüm yükleniyor…");Verify(plan);Replace(plan);Record("replaced",plan.version);
                TextStatus("Yeni sürüm açılıyor. Windows izin penceresi görünürse onaylayın.");
                try{Process.Start(new ProcessStartInfo(plan.target,"--voldena-update-plan=\""+planPath+"\""){UseShellExecute=true,Verb="runas",WorkingDirectory=Path.GetDirectoryName(plan.target)});}
                catch(Exception launch){
                    bool restored=MoveFileEx(plan.backup,plan.target,0x1|0x8);Record("launch-failed",launch.Message+"; rollback="+restored);
                    throw new Exception(restored?"Yeni sürüm açılamadı. Önceki EXE geri yüklendi; yeniden açabilirsiniz.":"Yeni sürüm açılamadı. Önceki EXE yedeği korunuyor: "+plan.backup,launch);
                }
                DateTime until=DateTime.UtcNow.AddSeconds(60);bool confirmed=false;
                while(DateTime.UtcNow<until){
                    if(File.Exists(plan.ackPath))try{var ack=new JavaScriptSerializer().Deserialize<Plan>(File.ReadAllText(plan.ackPath,Encoding.UTF8));confirmed=ack.nonce==plan.nonce&&ack.version==plan.version&&Same(ack.target,plan.target);}catch{}
                    if(confirmed)break;Thread.Sleep(250);
                }
                if(!confirmed){Record("unconfirmed","Yeni sürümün açıldığı doğrulanamadı. Yedek korundu.");throw new Exception("Yeni sürüm başlatıldı ancak açılış onayı gelmedi. Önceki EXE yedeği korunuyor; dosyalarınızı değiştirmeyin. Yedek: "+plan.backup);}
                File.Delete(plan.backup);Record("complete",plan.version);TextStatus("Güncelleme tamamlandı. Voldena hazır.");
            });
            await Task.Delay(1200);Close();
        }catch(Exception error){Record("error",error.Message);bar.Style=ProgressBarStyle.Continuous;bar.Value=0;title.Text="Güncelleme tamamlanamadı";status.Text=error.Message;close.Visible=true;ControlBox=true;}
    }
    VoldenaUpdate(string file,Plan data){
        planPath=file;plan=data;Text="Voldena — Yeni sürüm yükleniyor";ClientSize=new Size(540,245);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ControlBox=false;StartPosition=FormStartPosition.CenterScreen;TopMost=true;Font=new Font("Segoe UI",11);BackColor=Color.FromArgb(23,19,28);ForeColor=Color.White;
        title=new Label{Text="Yeni sürüm yükleniyor",AutoSize=false,Font=new Font("Segoe UI",17,FontStyle.Bold),Location=new Point(28,25),Size=new Size(490,36)};
        bar=new ProgressBar{Location=new Point(30,78),Size=new Size(480,12),Style=ProgressBarStyle.Marquee};
        status=new Label{Text="Kurulum hazırlanıyor…",AutoSize=false,Location=new Point(28,110),Size=new Size(484,80),ForeColor=Color.FromArgb(215,208,222)};
        close=new Button{Text="Kapat",Location=new Point(410,204),Size=new Size(100,29),Visible=false,DialogResult=DialogResult.Cancel};close.Click+=(s,e)=>Close();
        Controls.AddRange(new Control[]{title,bar,status,close});Shown+=RunUpdate;
    }
    [STAThread] static int Main(string[] args){try{if(args.Length!=1)throw new Exception("Güncelleme planı gerekli.");string file=Path.GetFullPath(args[0]);Plan data=LoadPlan(file);Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new VoldenaUpdate(file,data));return 0;}catch(Exception error){MessageBox.Show(error.Message,"Voldena güncellemesi",MessageBoxButtons.OK,MessageBoxIcon.Error);return 2;}}
}
