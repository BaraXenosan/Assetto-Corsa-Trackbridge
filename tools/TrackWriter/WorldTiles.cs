using System.Text;
using UAssetAPI;
using UAssetAPI.UnrealTypes;

static class WorldTiles {
    record Tile(string Name, byte[] Bytes);
    static string ReadString(BinaryReader r) {
        int n=r.ReadInt32(); if(n==0)return "";
        if(n<0 || n>10000)throw new Exception("Unsupported tile FString");
        byte[] bytes=r.ReadBytes(n); if(bytes.Length!=n || bytes[^1]!=0)throw new Exception("Truncated FString");
        return Encoding.UTF8.GetString(bytes,0,n-1);
    }
    static void WriteString(BinaryWriter w,string s){var b=Encoding.UTF8.GetBytes(s);w.Write(b.Length+1);w.Write(b);w.Write((byte)0);}
    public static object Replace(UAsset asset,string scene) {
        if(!scene.StartsWith("/Game/TrackBridge/KalinagoScene/Run_") || !scene.EndsWith("/KalinagoVisual"))throw new Exception("Unexpected scene path");
        var export=asset.Exports.Single(e=>e.ObjectName.ToString()=="WorldComposition_0");
        byte[] bytes=export.Extras;using var stream=new MemoryStream(bytes);using var r=new BinaryReader(stream);
        string root=ReadString(r);long countAt=stream.Position;int count=r.ReadInt32();if(count!=84)throw new Exception("Unexpected stock tile count");
        var tiles=new List<Tile>();
        for(int i=0;i<count;i++){
            int start=(int)stream.Position;string name=asset.GetNameReference(r.ReadInt32()).ToString();if(r.ReadInt32()!=0)throw new Exception("Numbered tile name");
            r.ReadBytes(12+49);ReadString(r);r.ReadBytes(12+4+4+4);ReadString(r);
            int lods=r.ReadInt32();if(lods<0||lods>10)throw new Exception("Bad LOD count");r.ReadBytes(lods*20);r.ReadInt32();
            int names=r.ReadInt32();if(names<0||names>10)throw new Exception("Bad LOD names");r.ReadBytes(names*8);
            tiles.Add(new Tile(name,bytes[start..(int)stream.Position]));
        }
        int tailAt=(int)stream.Position;int streaming=r.ReadInt32();if(streaming!=count)throw new Exception("Streaming array count mismatch"); for(int i=0;i<streaming;i++)if(r.ReadInt32()!=0)throw new Exception("Non-null streaming reference needs explicit remap"); if(stream.Position!=stream.Length)throw new Exception("Unparsed world composition tail");
        using var round=new MemoryStream();using(var w=new BinaryWriter(round,Encoding.UTF8,true)){w.Write(bytes[..(int)countAt]);w.Write(count);foreach(var tile in tiles)w.Write(tile.Bytes);w.Write(bytes[tailAt..]);}
        if(!round.ToArray().SequenceEqual(bytes))throw new Exception("World composition roundtrip failed");
        string[] keep={"/Game/Circuits/Bahrain/Levels/Section_01/Lvl_Bahrain_Section01_Props","/Game/Circuits/Bahrain/Levels/Lvl_Lighting_High","/Game/Circuits/Bahrain/Levels/Lvl_Lighting_Mobile"};
        var lights=tiles.Where(t=>keep.Contains(t.Name)).ToArray();if(lights.Length!=3)throw new Exception("Lighting tile names differ: "+string.Join(",",tiles.Where(t=>t.Name.Contains("Lighting")).Select(t=>t.Name)));
        using var result=new MemoryStream();using(var w=new BinaryWriter(result,Encoding.UTF8,true)){
            w.Write(bytes[..(int)countAt]);w.Write(lights.Length+1);foreach(var tile in lights)w.Write(tile.Bytes);
            w.Write(asset.AddNameReference(new FString(scene)));w.Write(0);
            w.Write(0);w.Write(0);w.Write(0);
            foreach(double v in new double[]{-500000,-500000,-100000,500000,500000,100000})w.Write(v);w.Write((byte)1);
            WriteString(w,"Always_Loaded");w.Write(0);w.Write(0);w.Write(0);w.Write(1000000);w.Write(1);w.Write(0);WriteString(w,"None");w.Write(0);w.Write(0);w.Write(0);
            w.Write(lights.Length+1);for(int i=0;i<lights.Length+1;i++)w.Write(0);
        }
        export.Extras=result.ToArray();return new { originalTiles=count, retainedLighting=lights.Select(t=>t.Name).ToArray(), scene, replacementTiles=lights.Length+1, originalRoundtrip=true };
    }
}
