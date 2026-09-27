using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;
if(args.Length!=3)throw new Exception("RuntimeProbe PID EXPECTED_GAME_EXE NEW_OUTPUT_DIRECTORY");
var process=Process.GetProcessById(int.Parse(args[0]));
if(!string.Equals(process.MainModule!.FileName,Path.GetFullPath(args[1]),StringComparison.OrdinalIgnoreCase))throw new Exception("Unexpected executable");
if(Directory.Exists(args[2]))throw new Exception("Output exists");
var executableHash=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(args[1]))).ToLowerInvariant();
if(executableHash!="1198feb7b1f39653fe51f04c9b0acb4d125a67d0e8ba6bda1fa353b3368ab356")throw new Exception("Offsets are only validated for the captured F1M24 1.11.0 executable");
using var mem=new Memory(process.Id,process.MainModule.BaseAddress.ToInt64());
if(mem.Name(0)!="None")throw new Exception("Name pool does not match this build");
var global=mem.Base+0x07821460;var chunks=mem.I64(global);var count=mem.I32(global+0x14);
if(count<1||count>3000000)throw new Exception("Unexpected object count");
var found=new List<object>();var tracks=new List<object>();var cars=new List<object>();
var classes=new Dictionary<long,string>();var errors=0;
Directory.CreateDirectory(args[2]);
for(var start=0;start<count;start+=65536){
 var num=Math.Min(65536,count-start);var data=mem.Read(mem.I64(chunks+(start/65536)*8),num*24);
 for(var j=0;j<num;j++){
  var ptr=BitConverter.ToInt64(data,j*24);if(ptr==0)continue;
  try{
   var header=mem.Read(ptr,40);var klass=BitConverter.ToInt64(header,16);
   if(!classes.TryGetValue(klass,out var cn)){cn=mem.ObjectName(klass);classes[klass]=cn;}
   if(cn!="RaceSimTrackComponent"&&!cn.Contains("Car")&&cn!="RaceSimGameMode"&&!cn.Contains("PitGarage")&&!cn.Contains("PitStop")&&!cn.Contains("MiniMap")&&!cn.Contains("FullScreenMap"))continue;
   var full=mem.ObjectPath(ptr);
   if((BitConverter.ToUInt32(header,8)&0x10)!=0||full.Contains("Default__"))continue;
   found.Add(new{address=$"0x{ptr:X}",className=cn,fullPath=full});
   if(cn=="RaceSimPitStopDataAsset"){
    var values=mem.Read(ptr+0x30,16);
    File.WriteAllText(Path.Combine(args[2],"pit-stop-settings.json"),JsonSerializer.Serialize(new{fullPath=full,garageEntranceLength=BitConverter.ToSingle(values,0),garageEntranceDistanceStart=BitConverter.ToSingle(values,4),pitDistanceStart=BitConverter.ToSingle(values,8),pitDistanceEnd=BitConverter.ToSingle(values,12)}));
   }
   if(cn=="RaceSimTrackComponent"){
    var component=mem.Read(ptr,0x720);var n=BitConverter.ToInt32(component,0x540);var p=BitConverter.ToInt64(component,0x538);
    if(n<1||n>10000)continue;
    var raw=mem.Read(p,n*0x98);var nodes=new List<object>();
    for(var k=0;k<n;k++)nodes.Add(new{index=k,position=new[]{BitConverter.ToDouble(raw,k*0x98),BitConverter.ToDouble(raw,k*0x98+8),BitConverter.ToDouble(raw,k*0x98+16)},maxSpeed=BitConverter.ToSingle(raw,k*0x98+24),runtimeTailHex=Convert.ToHexString(raw.AsSpan(k*0x98+0x29,0x98-0x29))});
    var file="track-"+tracks.Count;File.WriteAllBytes(Path.Combine(args[2],file+"-nodes.bin"),raw);File.WriteAllBytes(Path.Combine(args[2],file+"-component.bin"),component);
    foreach(var field in new[]{(0x548,48,"edges"),(0x560,24,"pit-stops"),(0x580,24,"garages"),(0x590,24,"grid"),(0x5A0,24,"drs-detection"),(0x5B0,24,"drs-start"),(0x5C0,24,"drs-end"),(0x5D0,24,"sectors"),(0x658,24,"pit-mapping")}){
     var a=BitConverter.ToInt64(component,field.Item1);var c=BitConverter.ToInt32(component,field.Item1+8);
     if(c>0&&c<100000&&a!=0)File.WriteAllBytes(Path.Combine(args[2],file+"-"+field.Item3+".bin"),mem.Read(a,c*field.Item2));
    }
    for(var k=0;k<n;k++){
     var tableCount=BitConverter.ToInt32(raw,k*0x98+0x50);var tablePtr=BitConverter.ToInt64(raw,k*0x98+0x48);
     if(tableCount>0 && tableCount<10000 && tablePtr!=0)File.WriteAllBytes(Path.Combine(args[2],file+"-node-"+k+"-table8.bin"),mem.Read(tablePtr,tableCount*8));
    }
    tracks.Add(new{address=$"0x{ptr:X}",fullPath=full,raceCount=BitConverter.ToUInt32(component,0x620),pitCount=BitConverter.ToUInt32(component,0x624),nodes});
   }
   var ancestor=klass;bool isCar=false;
   for(var d=0;d<16&&ancestor!=0;d++){if(mem.ObjectName(ancestor)=="CarActor"){isCar=true;break;}ancestor=mem.I64(ancestor+0x40);}
   if(isCar){
    var root=mem.I64(ptr+0x198);var loc=root==0?null:mem.Read(root+0x128,24);var file="car-"+cars.Count+".bin";
    File.WriteAllBytes(Path.Combine(args[2],file),mem.Read(ptr,0xB58));
    var carLocation=mem.I64(ptr+0x308);
    if(carLocation!=0)File.WriteAllBytes(Path.Combine(args[2],"car-"+cars.Count+"-location.bin"),mem.Read(carLocation,0x4F0));
    cars.Add(new{address=$"0x{ptr:X}",fullPath=full,className=cn,file,rootComponent=$"0x{root:X}",relativeLocation=loc==null?null:new[]{BitConverter.ToDouble(loc,0),BitConverter.ToDouble(loc,8),BitConverter.ToDouble(loc,16)}});
   }
  }catch(Exception){errors++;}
 }
}
var world=mem.ObjectPath(mem.I64(mem.Base+0x0798F570));
var result=new{installable=false,capturedUtc=DateTime.UtcNow,pid=process.Id,executable=process.MainModule.FileName,executableSha256=executableHash,moduleBase=$"0x{mem.Base:X}",world,objects=count,errors,tracks,cars,selectedObjects=found,scope="ReadProcessMemory only; snapshot is not atomic"};
File.WriteAllText(Path.Combine(args[2],"snapshot.json"),JsonSerializer.Serialize(result,new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"Objects {count}, tracks {tracks.Count}, cars {cars.Count}, errors {errors}, world {world}");
sealed class Memory:IDisposable{
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int id);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadProcessMemory(IntPtr h,IntPtr a,byte[] b,nuint size,out nuint read);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 readonly IntPtr handle;public long Base{get;}readonly Dictionary<uint,string> names=new();
 public Memory(int id,long b){Base=b;handle=OpenProcess(0x1010,false,id);if(handle==IntPtr.Zero)throw new Exception("Read-only access failed");}
 public byte[] Read(long a,int n){if(a<0x10000||n<0||n>10000000)throw new Exception("Invalid range");var b=new byte[n];if(!ReadProcessMemory(handle,new IntPtr(a),b,(nuint)n,out var r)||r!=(nuint)n)throw new Exception("Read failed");return b;}
 public long I64(long a)=>BitConverter.ToInt64(Read(a,8));public int I32(long a)=>BitConverter.ToInt32(Read(a,4));
 public string Name(uint id){if(names.TryGetValue(id,out var n))return n;var block=id>>16;var offset=id&65535;if(block>8191)throw new Exception("Name block invalid");var entry=I64(Base+0x07781D80+0x10+block*8)+offset*2;var h=BitConverter.ToUInt16(Read(entry,2));var len=h>>6;if(len>1024)throw new Exception("Name length invalid");var wide=(h&1)!=0;n=(wide?Encoding.Unicode:Encoding.UTF8).GetString(Read(entry+2,len*(wide?2:1)));names[id]=n;return n;}
 public string ObjectName(long p){var b=Read(p+24,8);var n=Name(BitConverter.ToUInt32(b));var v=BitConverter.ToInt32(b,4);return v==0?n:n+"_"+(v-1);}
 public string ObjectPath(long p){var parts=new List<string>();for(var i=0;i<16&&p!=0;i++){parts.Add(ObjectName(p));p=I64(p+32);}parts.Reverse();return string.Join(".",parts);}
 public void Dispose()=>CloseHandle(handle);
}

