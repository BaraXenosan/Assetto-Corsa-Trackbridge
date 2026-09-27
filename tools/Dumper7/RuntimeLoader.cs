using System;
using System.Diagnostics;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class TrackBridgeRuntimeDump {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int id);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr VirtualAllocEx(IntPtr p,IntPtr a,UIntPtr size,uint type,uint protect);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteProcessMemory(IntPtr p,IntPtr a,byte[] bytes,UIntPtr size,out UIntPtr written);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateRemoteThread(IntPtr p,IntPtr attr,UIntPtr stack,IntPtr start,IntPtr arg,uint flags,out uint id);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr mod,string name);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeThread(IntPtr h,out uint code);
 [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr p,IntPtr a,UIntPtr size,uint type);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 public static string Run(int id,string expectedExe,string dll) {
  var target=Process.GetProcessById(id);
  if(!string.Equals(target.MainModule.FileName,expectedExe,StringComparison.OrdinalIgnoreCase)) throw new Exception("Unexpected process path");
  var localEntry=GetProcAddress(GetModuleHandle("kernel32.dll"),"LoadLibraryW");
  if(localEntry==IntPtr.Zero) throw new Win32Exception();
  ProcessModule owner=null;
  foreach(ProcessModule m in Process.GetCurrentProcess().Modules) if(localEntry.ToInt64()>=m.BaseAddress.ToInt64() && localEntry.ToInt64()<m.BaseAddress.ToInt64()+m.ModuleMemorySize) owner=m;
  if(owner==null) throw new Exception("LoadLibrary owner not found");
  ProcessModule remote=null;
  foreach(ProcessModule m in target.Modules) if(string.Equals(m.ModuleName,owner.ModuleName,StringComparison.OrdinalIgnoreCase)) remote=m;
  if(remote==null) throw new Exception("Remote loader module missing");
  var entry=new IntPtr(remote.BaseAddress.ToInt64()+localEntry.ToInt64()-owner.BaseAddress.ToInt64());
  var process=OpenProcess(0x43A,false,id);
  if(process==IntPtr.Zero) throw new Win32Exception();
  IntPtr mem=IntPtr.Zero,thread=IntPtr.Zero; bool finished=false;
  try {
   var data=Encoding.Unicode.GetBytes(dll+"\0");
   mem=VirtualAllocEx(process,IntPtr.Zero,(UIntPtr)data.Length,0x3000,4);
   if(mem==IntPtr.Zero) throw new Win32Exception();
   UIntPtr written;
   if(!WriteProcessMemory(process,mem,data,(UIntPtr)data.Length,out written)||written.ToUInt64()!=(ulong)data.Length) throw new Win32Exception();
   uint threadId;
   thread=CreateRemoteThread(process,IntPtr.Zero,UIntPtr.Zero,entry,mem,0,out threadId);
   if(thread==IntPtr.Zero) throw new Win32Exception();
   if(WaitForSingleObject(thread,30000)!=0) throw new Exception("Loader is still pending; do not retry");
   finished=true; uint code; GetExitCodeThread(thread,out code);
   return "Loader thread finished; result="+code+". Check generated mapping files.";
  } finally { if(thread!=IntPtr.Zero)CloseHandle(thread); if(mem!=IntPtr.Zero && finished)VirtualFreeEx(process,mem,UIntPtr.Zero,0x8000); CloseHandle(process); }
 }
}
