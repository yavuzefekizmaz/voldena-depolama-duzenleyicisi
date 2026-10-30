using System;
using System.IO;
using System.Reflection;
using System.Collections;
using System.Text;
class NativeParserTests {
 static Type scanner;
 static object Call(string name,params object[] args){return scanner.GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,args);}
 static void Put(byte[] b,int at,byte[] v){Buffer.BlockCopy(v,0,b,at,v.Length);}
 static void U16(byte[] b,int at,ushort v){Put(b,at,BitConverter.GetBytes(v));}
 static void U32(byte[] b,int at,uint v){Put(b,at,BitConverter.GetBytes(v));}
 static void I64(byte[] b,int at,long v){Put(b,at,BitConverter.GetBytes(v));}
 static void Check(bool value,string text){if(!value)throw new Exception(text);}
 static int Main(string[] args){try{
  scanner=Assembly.LoadFile(Path.GetFullPath(args[0])).GetType("VoldeScan");
  byte[] good=new byte[1024];U32(good,0,0x454c4946);U16(good,4,48);U16(good,6,3);U16(good,48,0xabcd);U16(good,50,0x1234);U16(good,52,0x5678);U16(good,510,0xabcd);U16(good,1022,0xabcd);
  Check((bool)Call("Fixup",good,512),"Valid USA must pass");Check(BitConverter.ToUInt16(good,510)==0x1234&&BitConverter.ToUInt16(good,1022)==0x5678,"Both sector trailers restored");
  byte[] bad=(byte[])good.Clone();U16(bad,510,0xabcd);U16(bad,1022,0x9999);byte[] original=(byte[])bad.Clone();Check(!(bool)Call("Fixup",bad,512),"Torn record rejected");Check(Convert.ToBase64String(bad)==Convert.ToBase64String(original),"Rejected record must remain unchanged");
  byte[] run={0x11,3,10,0x11,2,0xfe,0};var runs=(IList)Call("Runs",run,0,run.Length);Check(runs.Count==2,"Two MFT runs parsed");var runType=runs[1].GetType();Check((long)runType.GetField("start").GetValue(runs[1])==8,"Signed relative LCN decoded");
  byte[] rec=new byte[1024];U16(rec,20,56);int a=56;U32(rec,a,0x80);U32(rec,a+4,80);rec[a+8]=1;U16(rec,a+12,0x8000);U16(rec,a+32,72);I64(rec,a+40,1024*1024);I64(rec,a+48,100L*1024*1024*1024);I64(rec,a+64,4096);U32(rec,a+80,0xffffffff);
  Type extra=scanner.GetNestedType("Extra",BindingFlags.NonPublic);object data=Activator.CreateInstance(extra,true);Call("Attributes",rec,data);Check((long)extra.GetField("size").GetValue(data)==100L*1024*1024*1024,"Sparse logical size retained");Check((long)extra.GetField("allocated").GetValue(data)==4096,"Sparse actual allocation used");
  byte[] ext=new byte[1024];U16(ext,20,56);U32(ext,56,0x30);string filename="Türkçe.mp4";int length=24+66+filename.Length*2;U32(ext,60,(uint)length);U32(ext,72,(uint)(66+filename.Length*2));U16(ext,76,24);long parent=(9L<<48)|12345;I64(ext,80,parent);ext[144]=(byte)filename.Length;ext[145]=1;Put(ext,146,Encoding.Unicode.GetBytes(filename));U32(ext,56+length,0xffffffff);Call("Attributes",ext,data);
  var names=(IList)extra.GetField("names").GetValue(data);Check(names.Count==1,"Extension filename merged");object name=names[0];Check((long)name.GetType().GetProperty("Item2").GetValue(name,null)==parent,"Full parent reference sequence preserved");Check((long)extra.GetField("allocated").GetValue(data)==4096,"Extension filename must not erase DATA allocation");
  Console.WriteLine("PASS: fixup, torn record, signed runs, sparse allocation, extension merge, reference sequence");return 0;
 }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
