// Windows metadata scanner and narrow no-replace move primitive. Enumeration never reads file content.
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.Win32.SafeHandles;

class VoldeScan {
    const uint READ=0x80000000, SHARE=7, OPEN=3, DIR=0x10, REPARSE=0x400;
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode, Pack=4)] struct FIND {
        public uint attr; public long created,access,modified; public uint high,low,r0,r1;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string name;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)] public string alternate;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr FindFirstFileEx(string p,int level,out FIND data,int search,IntPtr filter,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool FindNextFile(IntPtr h,out FIND data);
    [DllImport("kernel32.dll")] static extern bool FindClose(IntPtr h);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetCompressedFileSize(string p,out uint high);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string p,uint access,uint share,IntPtr sa,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle h,uint code,byte[] input,int insize,byte[] output,int outsize,out int returned,IntPtr overlapped);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFilePointerEx(SafeFileHandle h,long offset,out long current,uint method);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(SafeFileHandle h,byte[] buffer,int count,out int read,IntPtr overlapped);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFileAttributes(string path);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool MoveFile(string source,string destination);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool SetFileAttributes(string path,uint attributes);
    [StructLayout(LayoutKind.Sequential)] struct FILETIME {public uint low,high;}
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileTime(SafeFileHandle handle,out FILETIME created,out FILETIME accessed,out FILETIME written);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileTime(SafeFileHandle handle,ref FILETIME created,ref FILETIME accessed,ref FILETIME written);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STREAM {
        public long size;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=296)]public string name;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr FindFirstStreamW(string path,int level,out STREAM data,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool FindNextStreamW(IntPtr handle,out STREAM data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumePathName(string path,StringBuilder root,uint capacity);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformation(string root,StringBuilder name,uint nameCapacity,out uint serial,out uint componentLength,out uint flags,StringBuilder fileSystem,uint fileSystemCapacity);
    static StreamWriter output;
    static long serial=1;
    static string Q(string value) {
        StringBuilder b=new StringBuilder("\"");
        foreach(char c in value) { if(c=='"'||c=='\\') {b.Append('\\');b.Append(c);} else if(c<32)b.Append("\\u"+((int)c).ToString("x4")); else b.Append(c); }
        return b.Append('"').ToString();
    }
    static void Row(string id,string parent,string name,bool dir,long logical,long allocated,long time,uint attr,bool duplicate) {
        output.WriteLine("["+Q(id)+","+Q(parent)+","+Q(name)+","+(dir?"1":"0")+","+logical+","+allocated+","+time+","+attr+","+(duplicate?"1":"0")+"]");
    }
    static string Long(string p) {return p.StartsWith(@"\\?\")?p:@"\\?\"+p;}
    static void Error(string p,int code) {output.WriteLine("{\"error\":"+Q(p)+",\"code\":"+code+"}");}
    static void MetadataServer() {
        string input;while((input=Console.ReadLine())!=null) {
            try {
                string p=Encoding.UTF8.GetString(Convert.FromBase64String(input));uint attr=GetFileAttributes(Long(p));
                if(attr==UInt32.MaxValue)throw new Win32Exception(Marshal.GetLastWin32Error());
                var volumeRoot=new StringBuilder(2048);var fileSystem=new StringBuilder(260);uint serial,componentLength,volumeFlags;
                if(!GetVolumePathName(p,volumeRoot,(uint)volumeRoot.Capacity)||!GetVolumeInformation(volumeRoot.ToString(),null,0,out serial,out componentLength,out volumeFlags,fileSystem,(uint)fileSystem.Capacity))throw new Win32Exception(Marshal.GetLastWin32Error());
                bool named=false;var streams=new List<string>();STREAM stream;IntPtr handle=FindFirstStreamW(Long(p),0,out stream,0);
                if(handle==new IntPtr(-1)) {int code=Marshal.GetLastWin32Error();if(code!=38 && !((code==1||code==50)&&(volumeFlags&0x40000)==0))throw new Win32Exception(code);}
                else try {do {if(stream.name!="::$DATA")named=true;streams.Add("{\"name\":"+Q(stream.name)+",\"size\":"+stream.size+"}");}while(FindNextStreamW(handle,out stream));int code=Marshal.GetLastWin32Error();if(code!=38)throw new Win32Exception(code);}finally{FindClose(handle);}
                output.WriteLine("{\"attributes\":"+attr+",\"hasNamedStreams\":"+(named?"true":"false")+",\"streams\":["+String.Join(",",streams.ToArray())+"],\"fileSystem\":"+Q(fileSystem.ToString())+",\"volumeRoot\":"+Q(volumeRoot.ToString())+",\"supportsNamedStreams\":"+((volumeFlags&0x40000)!=0?"true":"false")+"}");
            }catch(Exception error){output.WriteLine("{\"error\":"+Q(error.Message)+"}");}
            output.Flush();
        }
    }
    static long Millis(long filetime) {try{return (filetime-116444736000000000L)/10000;}catch{return 0;}}
    static void Enumerate(string root) {
        output.WriteLine("{\"engine\":\"native-enumeration\",\"rootId\":\"0\"}");
        Row("0","",root,true,0,0,0,DIR,false);
        Stack<Tuple<string,string>> queue=new Stack<Tuple<string,string>>();queue.Push(Tuple.Create(root,"0"));
        while(queue.Count>0) {
            var item=queue.Pop(); FIND data; IntPtr h=FindFirstFileEx(Long(Path.Combine(item.Item1,"*")),1,out data,0,IntPtr.Zero,2);
            if(h==new IntPtr(-1)) {Error(item.Item1,Marshal.GetLastWin32Error());continue;}
            try { do {
                if(data.name=="."||data.name=="..")continue;
                string full=Path.Combine(item.Item1,data.name),id=(serial++).ToString(); bool dir=(data.attr&DIR)!=0;
                long size=dir?0:((long)data.high<<32)|data.low,allocated=size;
                // Compressed/sparse/cloud placeholders need their physical allocation, not logical length.
                if(!dir && (data.attr & (0x200|0x800|0x1000|0x400000|0x100000))!=0) {
                    uint hi; uint lo=GetCompressedFileSize(Long(full),out hi);
                    if(lo!=UInt32.MaxValue || Marshal.GetLastWin32Error()==0) allocated=((long)hi<<32)|lo;
                }
                Row(id,item.Item2,data.name,dir,size,allocated,Millis(data.modified),data.attr,false);
                // Reparse directories are represented but never followed onto another volume or loop.
                if(dir && (data.attr&REPARSE)==0)queue.Push(Tuple.Create(full,id));
            } while(FindNextFile(h,out data));
            int code=Marshal.GetLastWin32Error();if(code!=18)Error(item.Item1,code);
            } finally {FindClose(h);}
        }
    }
    class Run {public long start,length; public Run(long s,long l){start=s;length=l;}}
    static List<Run> Runs(byte[] b,int offset,int end) {
        var runs=new List<Run>();long lcn=0;
        while(offset<end && b[offset]!=0) {
            int head=b[offset++],lc=head&15,oc=head>>4;
            if(lc<1||lc>8||oc>8||offset+lc+oc>end)throw new Exception("Invalid MFT runlist");
            long count=0;for(int i=0;i<lc;i++)count|=(long)b[offset++]<<(8*i);
            long delta=0;for(int i=0;i<oc;i++)delta|=(long)b[offset++]<<(8*i);
            if(oc>0 && oc<8 && (delta&(1L<<(oc*8-1)))!=0)delta|=(-1L)<<(oc*8);
            lcn+=delta;if(oc==0||count<=0||lcn<0)throw new Exception("Unsupported sparse MFT run");
            runs.Add(new Run(lcn,count));
        } return runs;
    }
    static ushort U16(byte[] b,int o){return BitConverter.ToUInt16(b,o);}
    static uint U32(byte[] b,int o){return BitConverter.ToUInt32(b,o);}
    static long I64(byte[] b,int o){return BitConverter.ToInt64(b,o);}
    static void ReadAt(SafeFileHandle h,long at,byte[] b,int count) {
        long pos;int got;
        if(!SetFilePointerEx(h,at,out pos,0)||!ReadFile(h,b,count,out got,IntPtr.Zero)||got!=count)throw new Win32Exception(Marshal.GetLastWin32Error(),"MFT read failed");
    }
    static bool Fixup(byte[] b,int sector) {
        if(b.Length<48 || U32(b,0)!=0x454c4946)return false;
        int off=U16(b,4),count=U16(b,6);if(off<8||off+count*2>b.Length||count<2)return false;
        ushort sequence=U16(b,off);
        for(int i=1;i<count;i++) {int end=i*sector-2;if(end<0||end+2>b.Length||U16(b,end)!=sequence)return false;}
        for(int i=1;i<count;i++) {int end=i*sector-2;b[end]=b[off+i*2];b[end+1]=b[off+i*2+1];}
        return true;
    }
    static byte[] Record(SafeFileHandle volume,long reference,int record,int sector) {
        byte[] input=BitConverter.GetBytes(reference),result=new byte[record+16];int got;
        if(!DeviceIoControl(volume,0x90068,input,8,result,result.Length,out got,IntPtr.Zero)||got<record+12||(I64(result,0)&0x0000ffffffffffffL)!=(reference&0x0000ffffffffffffL))throw new Exception("MFT extension record unavailable");
        byte[] b=new byte[record];Buffer.BlockCopy(result,12,b,0,record);
        if(!Fixup(b,sector)) {
            // FSCTL can return a record with fixups already applied.
            int off=U16(b,4),count=U16(b,6);bool fixedAlready=U32(b,0)==0x454c4946&&off+count*2<=record;
            for(int i=1;i<count&&fixedAlready;i++){int at=i*sector-2;fixedAlready=at+2<=record&&U16(b,at)==U16(b,off+i*2);}
            if(!fixedAlready)throw new Exception("MFT extension record invalid");
        }return b;
    }
    class Extra {
        public List<Tuple<string,long>> names=new List<Tuple<string,long>>();
        public long size=-1,allocated=-1,time=0;public uint attr=0;public bool hasData=false,hasList=false;
    }
    static void Attributes(byte[] rec,Extra data) {
        int record=rec.Length;
        for(int a=U16(rec,20);a+24<=record;) {
            uint type=U32(rec,a);if(type==UInt32.MaxValue)break;int len=(int)U32(rec,a+4);if(len<24||a+len>record)break;
            bool nonresident=rec[a+8]!=0;
            if(type==0x20)data.hasList=true;
            if(!nonresident) {
                int value=a+U16(rec,a+20),length=(int)U32(rec,a+16);
                if(value>=a+24&&value+length<=a+len) {
                    if(type==0x10 && length>=36){data.time=Millis(I64(rec,value+8));data.attr=U32(rec,value+32);}
                    if(type==0x30 && length>=66) {
                        int chars=rec[value+64],ns=rec[value+65];
                        if(ns!=2 && 66+chars*2<=length)data.names.Add(Tuple.Create(Encoding.Unicode.GetString(rec,value+66,chars*2),I64(rec,value)));
                    }
                    if(type==0x80 && rec[a+9]==0){data.size=length;data.allocated=0;data.hasData=true;}
                }
            } else if(type==0x80 && rec[a+9]==0 && len>=64 && I64(rec,a+16)==0) {
                data.size=I64(rec,a+48);data.allocated=I64(rec,a+40);data.hasData=true;
                if((U16(rec,a+12)&0x8001)!=0 && U16(rec,a+32)>=72 && len>=72)data.allocated=I64(rec,a+64);
            }
            a+=len;
        }
    }
    static void Mft(string root) {
        if(root.Length!=3 || root[1]!=':')throw new Exception("MFT mode requires a local volume root");
        using(var volume=CreateFile(@"\\.\"+root.Substring(0,2),READ,SHARE,IntPtr.Zero,OPEN,0,IntPtr.Zero)) {
            if(volume.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());
            byte[] info=new byte[128];int got;
            if(!DeviceIoControl(volume,0x90064,null,0,info,info.Length,out got,IntPtr.Zero)||got<96)throw new Exception("NTFS volume metadata unavailable");
            int sector=(int)U32(info,40),cluster=(int)U32(info,44),record=(int)U32(info,48);
            long mftLength=I64(info,56),mftLcn=I64(info,64);
            if(record<512||record>65536||cluster<512||cluster>2097152||sector<512||mftLength<=0)throw new Exception("Invalid NTFS dimensions");
            byte[] first=new byte[record];ReadAt(volume,mftLcn*cluster,first,record);
            if(!Fixup(first,sector))throw new Exception("MFT header fixup failed");
            List<Run> runs=null;long dataLength=0;var extensionIds=new HashSet<long>();
            for(int a=U16(first,20);a+24<record;) {
                uint type=U32(first,a);if(type==UInt32.MaxValue)break;int len=(int)U32(first,a+4);if(len<24||a+len>record)break;
                if(type==0x80 && first[a+8]==1 && first[a+9]==0 && len>=64 && I64(first,a+16)==0) {runs=Runs(first,a+U16(first,a+32),a+len);dataLength=I64(first,a+48);}
                if(type==0x20) {
                    byte[] list=null;
                    if(first[a+8]==0){int start=a+U16(first,a+20),length=(int)U32(first,a+16);if(start+length<=a+len){list=new byte[length];Buffer.BlockCopy(first,start,list,0,length);}}
                    else if(len>=64) {
                        long length=I64(first,a+48);if(length>1048576)throw new Exception("MFT attribute list exceeds safety bound");
                        var listRuns=Runs(first,a+U16(first,a+32),a+len);using(var memory=new MemoryStream()) {
                            foreach(var run in listRuns){int count=(int)Math.Min(run.length*cluster,length-memory.Length);if(count<=0)break;int rounded=(count+sector-1)/sector*sector;byte[] temp=new byte[rounded];ReadAt(volume,run.start*cluster,temp,rounded);memory.Write(temp,0,count);}list=memory.ToArray();
                        }
                    }
                    if(list==null)throw new Exception("MFT attribute list unavailable");
                    for(int p=0;p+26<=list.Length;){int length=U16(list,p+4);if(length<26||p+length>list.Length)break;if(U32(list,p)==0x80 && list[p+6]==0 && I64(list,p+8)>0)extensionIds.Add(I64(list,p+16));p+=length;}
                }a+=len;
            }
            if(runs==null||dataLength<mftLength)throw new Exception("MFT extents unavailable");
            var extents=new SortedDictionary<long,List<Run>>();extents.Add(0,runs);
            foreach(long reference in extensionIds) {
                byte[] ext=Record(volume,reference,record,sector);
                for(int a=U16(ext,20);a+24<record;){uint type=U32(ext,a);if(type==UInt32.MaxValue)break;int length=(int)U32(ext,a+4);if(length<24||a+length>record)break;if(type==0x80&&ext[a+8]==1&&ext[a+9]==0&&length>=64)extents[I64(ext,a+16)]=Runs(ext,a+U16(ext,a+32),a+length);a+=length;}
            }
            runs=new List<Run>();long vcn=0;foreach(var extent in extents){if(extent.Key!=vcn)throw new Exception("MFT extents have a gap");foreach(var run in extent.Value){runs.Add(run);vcn+=run.length;}}
            foreach(var run in runs)if((run.length*cluster)%record!=0)throw new Exception("MFT record spans an unsupported extent boundary");
            long runBytes=0;foreach(var run in runs)runBytes+=run.length*cluster;
            if(runBytes<dataLength)throw new Exception("MFT has extension extents; using safe directory enumeration");
            byte[] rootRecord=Record(volume,5,record,sector);
            string rootId=(((long)U16(rootRecord,16)<<48)|5).ToString();
            Extra rootData=new Extra();Attributes(rootRecord,rootData);
            output.WriteLine("{\"engine\":\"ntfs-mft\",\"rootId\":"+Q(rootId)+",\"mftBytes\":"+mftLength+"}");
            Row(rootId,"",root,true,0,0,rootData.time,rootData.attr,false);output.Flush();
            byte[] buffer=new byte[Math.Max(1024*1024,cluster)], rec=new byte[record];long index=0,remaining=mftLength;
            // Extension records can hold names and the initial DATA attribute of large files.
            // Collect them first so no named files silently lose size or disappear from the tree.
            var extra=new Dictionary<long,Extra>();long indexed=0,lastIndexOutput=0;
            foreach(var run in runs) {
                long available=Math.Min(run.length*cluster,remaining),physical=run.start*cluster;
                while(available>0) {
                    int count=(int)Math.Min(buffer.Length,available);count-=count%record;if(count<=0)break;ReadAt(volume,physical,buffer,count);
                    for(int p=0;p+record<=count;p+=record) {
                        indexed++;
                        Buffer.BlockCopy(buffer,p,rec,0,record);if(!Fixup(rec,sector)||(U16(rec,22)&1)==0)continue;
                        long baseId=I64(rec,32);
                        if(baseId!=0){Extra data;if(!extra.TryGetValue(baseId,out data)){data=new Extra();extra.Add(baseId,data);}Attributes(rec,data);}
                    }
                    if(indexed-lastIndexOutput>=32768){output.WriteLine("{\"phase\":\"indexing\",\"indexedRecords\":"+indexed+"}");output.Flush();lastIndexOutput=indexed;}
                    physical+=count;available-=count;remaining-=count;
                }if(remaining<=0)break;
            }
            remaining=mftLength;output.WriteLine("{\"phase\":\"inventory\",\"indexedRecords\":"+indexed+"}");output.Flush();
            foreach(var run in runs) {
                long runRemaining=Math.Min(run.length*cluster,remaining),physical=run.start*cluster;
                while(runRemaining>0) {
                    int count=(int)Math.Min(buffer.Length,runRemaining);count-=count%record;if(count<=0)break;
                    ReadAt(volume,physical,buffer,count);
                    for(int p=0;p+record<=count;p+=record,index++) {
                        Buffer.BlockCopy(buffer,p,rec,0,record);
                        if(!Fixup(rec,sector) || (U16(rec,22)&1)==0 || I64(rec,32)!=0)continue;
                        bool dir=(U16(rec,22)&2)!=0;Extra data;
                        long identity=((long)U16(rec,16)<<48)|index;
                        if(!extra.TryGetValue(identity,out data))data=new Extra();Attributes(rec,data);
                        if(index==5)continue;
                        bool duplicate=false;var unique=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        foreach(var name in data.names) {
                            if(name.Item1=="."||name.Item2==identity||!unique.Add(name.Item2+"\\"+name.Item1))continue;
                            string id=dir?identity.ToString():identity+"_"+unique.Count;
                            Row(id,name.Item2.ToString(),name.Item1,dir,Math.Max(0,data.size),duplicate?0:Math.Max(0,data.allocated),data.time,data.attr,duplicate||U16(rec,18)>1);
                            duplicate=true;
                        }
                        if(data.hasList)output.WriteLine("{\"attributeList\":1}");
                    }
                    output.Flush();physical+=count;runRemaining-=count;remaining-=count;
                } if(remaining<=0)break;
            }
        }
    }
    static int Main(string[] args) {
        Console.OutputEncoding=new UTF8Encoding(false);
        bool scanOutput=args.Length>2 && !args[0].StartsWith("--",StringComparison.Ordinal);
        output=new StreamWriter(scanOutput?new FileStream(args[2],FileMode.CreateNew,FileAccess.Write,FileShare.Read):Console.OpenStandardOutput(),new UTF8Encoding(false),65536);output.AutoFlush=false;
        try {
            if(args.Length>0 && args[0]=="--copy-metadata") {
                if(args.Length!=3||!Path.IsPathRooted(args[1])||!Path.IsPathRooted(args[2]))throw new Exception("Two absolute local paths required");
                string source=Long(args[1]),destination=Long(args[2]);uint attributes=GetFileAttributes(source),targetAttributes=GetFileAttributes(destination);
                if(attributes==UInt32.MaxValue||targetAttributes==UInt32.MaxValue)throw new Win32Exception(Marshal.GetLastWin32Error());
                if((attributes&(4|0x200|0x400|0x800|0x1000|0x4000|0x40000|0x400000))!=0)throw new Exception("Unsupported source metadata");
                bool directory=(attributes&DIR)!=0;
                if(directory!=((targetAttributes&DIR)!=0))throw new Exception("Metadata target type differs");
                using(var sourceHandle=CreateFile(source,0x80,SHARE,IntPtr.Zero,OPEN,0x02000000,IntPtr.Zero))
                using(var targetHandle=CreateFile(destination,0x100,SHARE,IntPtr.Zero,OPEN,0x02000000,IntPtr.Zero)) {
                    if(sourceHandle.IsInvalid||targetHandle.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());
                    FILETIME created,accessed,written;
                    if(!GetFileTime(sourceHandle,out created,out accessed,out written)||!SetFileTime(targetHandle,ref created,ref accessed,ref written))throw new Win32Exception(Marshal.GetLastWin32Error());
                }
                uint preserved=attributes&(1|2|32|0x100|0x2000);if(directory)preserved|=DIR;if(preserved==0)preserved=0x80;
                if(!SetFileAttributes(destination,preserved))throw new Win32Exception(Marshal.GetLastWin32Error());
                output.WriteLine("{\"success\":true}");output.Flush();return 0;
            }
            if(args.Length>0 && args[0]=="--move-no-replace") {
                if(args.Length!=3||!Path.IsPathRooted(args[1])||!Path.IsPathRooted(args[2]))throw new Exception("Two absolute local paths required");
                if(!MoveFile(Long(args[1]),Long(args[2]))){int code=Marshal.GetLastWin32Error();output.WriteLine("{\"error\":"+Q(new Win32Exception(code).Message)+",\"code\":"+code+"}");output.Flush();return 3;}
                output.WriteLine("{\"success\":true}");output.Flush();return 0;
            }
            if(args.Length>0 && args[0]=="--metadata-server"){MetadataServer();return 0;}
            if(args.Length<1)throw new Exception("Target required");string root=Path.GetFullPath(args[0]);
            if(args.Length>1 && args[1]=="mft")Mft(root);else Enumerate(root);
            output.Flush();return 0;
        }catch(Exception ex) {output.Flush();Console.Error.WriteLine(ex.Message);return 2;}
    }
}
