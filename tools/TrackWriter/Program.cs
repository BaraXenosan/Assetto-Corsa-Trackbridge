using UAssetAPI;
using UAssetAPI.UnrealTypes;
using UAssetAPI.Unversioned;
using UAssetAPI.ExportTypes;
using UAssetAPI.PropertyTypes.Objects;
using UAssetAPI.PropertyTypes.Structs;
if(args.Length==5 && args[3]=="--level-patch") {
    if(Directory.Exists(args[2]))throw new IOException("Output exists");
    var level=new UAsset(args[0],EngineVersion.VER_UE5_1,new Usmap(args[1]));
    if(!level.VerifyBinaryEquality())throw new Exception("Input roundtrip failed");
    using var doc=System.Text.Json.JsonDocument.Parse(File.ReadAllText(args[4]));var root=doc.RootElement;
    if(root.TryGetProperty("removeActors",out var remove)) {
        var names=remove.EnumerateArray().Select(x=>x.GetString()).ToHashSet();
        var persistent=level.Exports.OfType<LevelExport>().Single();
        persistent.Actors=persistent.Actors.Where(x=>!x.IsExport() || !names.Contains(x.ToExport(level).ObjectName.ToString())).ToList();
    }
    if(root.TryGetProperty("keepActors",out var keep)) {
        var names=keep.EnumerateArray().Select(x=>x.GetString()).ToHashSet();
        var persistent=level.Exports.OfType<LevelExport>().Single();
        persistent.Actors=persistent.Actors.Where(x=>x.IsExport() && names.Contains(x.ToExport(level).ObjectName.ToString())).ToList();
    }
    foreach(var edit in root.GetProperty("exports").EnumerateArray()) {
        var e=(NormalExport)level.Exports[edit.GetProperty("index").GetInt32()];
        if(e.ObjectName.ToString()!=edit.GetProperty("name").GetString())throw new Exception("Export name mismatch");
        foreach(var field in edit.GetProperty("Properties").EnumerateObject())ComponentPatch.Apply(level,e.Data.Single(p=>p.Name.ToString()==field.Name),field.Value);
    }
    Directory.CreateDirectory(args[2]);var patchedOutput=Path.Combine(args[2],Path.GetFileName(args[0]));level.Write(patchedOutput);
    if(!new UAsset(patchedOutput,EngineVersion.VER_UE5_1,new Usmap(args[1])).VerifyBinaryEquality())throw new Exception("Output roundtrip failed");
    Console.WriteLine("Level patch roundtrip passed");return 0;
}
if(args.Length==4 && args[3]=="--daylight") {
    if(Directory.Exists(args[2]))throw new IOException("Output exists");
    var level=new UAsset(args[0],EngineVersion.VER_UE5_1,new Usmap(args[1]));
    if(!level.VerifyBinaryEquality())throw new Exception("Lighting input roundtrip failed");
    var sky=level.Exports.OfType<NormalExport>().Single(e=>e.ObjectName.ToString()=="BPC_Ultra_Dynamic_Sky_0");
    var zone=sky.Data.Single(p=>p.Name.ToString()=="Time Zone");
    if(zone is not DoublePropertyData z)throw new Exception("Unexpected time zone property type");
    double before=z.Value;if(Math.Abs(before-3)>0.0001)throw new Exception("Unexpected original time zone");
    z.Value=9;z.IsZero=false;
    Directory.CreateDirectory(args[2]);var dest=Path.Combine(args[2],Path.GetFileName(args[0]));level.Write(dest);
    var reread=new UAsset(dest,EngineVersion.VER_UE5_1,new Usmap(args[1]));
    if(!reread.VerifyBinaryEquality())throw new Exception("Lighting output roundtrip failed");
    File.WriteAllText(Path.Combine(args[2],Path.GetFileNameWithoutExtension(args[0])+"-daylight.json"),System.Text.Json.JsonSerializer.Serialize(new {installable=false,originalTimeZone=before,newTimeZone=9,solarShiftHours=-6,runtimeValidated=false}));
    Console.WriteLine("Daylight solar offset written and reread: "+dest);return 0;
}
if (args.Length < 3 || args.Length > 5 || (args.Length == 4 && args[3] != "--probe-speed" && args[3] != "--describe") || (args.Length == 5 && args[3] != "--component-json")) { Console.Error.WriteLine("TrackWriter INPUT.umap MAPPINGS.usmap NEW_OUTPUT_DIRECTORY [--probe-speed | --describe | --component-json FILE]"); return 1; }
if (Directory.Exists(args[2])) throw new IOException("Output exists");
var asset = new UAsset(args[0], EngineVersion.VER_UE5_1, new Usmap(args[1]));
var equal = asset.VerifyBinaryEquality();
Console.WriteLine($"Exports: {asset.Exports.Count}; binary roundtrip equality: {equal}");
if (!equal) throw new Exception("Input cannot be reproduced exactly; refusing to write");
var track = asset.Exports.OfType<NormalExport>().SingleOrDefault(e => e.ObjectName.ToString() == "RaceTrackSpline") ?? throw new Exception("Track component not decoded");
Console.WriteLine($"Track properties: {track.Data.Count}");
Directory.CreateDirectory(args[2]);
float? originalSpeed = null;
if (args.Length == 4 && args[3] == "--describe") {
    object Describe(PropertyData p) => new { name=p.Name.ToString(), type=p.GetType().Name, zero=p.IsZero,
        children=p is StructPropertyData s ? s.Value.Select(Describe).ToArray() : p is ArrayPropertyData a ? a.Value.Take(1).Select(Describe).ToArray() : null,
        value=p is StructPropertyData || p is ArrayPropertyData ? null : p.RawValue?.ToString() };
    File.WriteAllText(Path.Combine(args[2],"track-property-types.json"),System.Text.Json.JsonSerializer.Serialize(track.Data.Select(Describe),new System.Text.Json.JsonSerializerOptions { WriteIndented=true }));
    foreach(var export in asset.Exports.Where(e=>e.ObjectName.ToString() is "WorldComposition_0" or "PersistentLevel" or "Lvl_Bahrain")) {
        Console.WriteLine($"{export.ObjectName}: {export.GetType().Name}, extras {export.Extras?.Length}");
        if(export.Extras != null) File.WriteAllBytes(Path.Combine(args[2],export.ObjectName+"-extras.bin"),export.Extras);
    }
}
if (args.Length == 4 && args[3] == "--probe-speed") {
    var nodes = (ArrayPropertyData)track.Data.Single(p => p.Name.ToString() == "m_trackNodes");
    var node = (StructPropertyData)nodes.Value[0];
    var speed = (FloatPropertyData)node.Value.Single(p => p.Name.ToString() == "m_maxSpeed");
    originalSpeed = speed.Value;
    speed.Value -= 1;
    speed.IsZero = false;
}
if (args.Length == 5) {
    using var proposal = System.Text.Json.JsonDocument.Parse(File.ReadAllText(args[4]));
    var root = proposal.RootElement;
    if(root.GetProperty("installable").GetBoolean() || root.GetProperty("targetSlot").GetString() != "Bahrain")
        throw new Exception("Only offline Bahrain prototypes supported");
    if(root.TryGetProperty("scenePackage",out var scene)) {
        var tiles=WorldTiles.Replace(asset,scene.GetString()!);
        var persistent=asset.Exports.OfType<LevelExport>().Single();
        persistent.Actors=persistent.Actors.Where(index=>!index.IsExport() || !new[]{"InstancedFoliageActor_0","LandscapeGizmoActiveActor_0"}.Contains(index.ToExport(asset).ObjectName.ToString()) && !index.ToExport(asset).ObjectName.ToString().StartsWith("DecalActor")).ToList();
        File.WriteAllText(Path.Combine(args[2],"world-tiles-report.json"),System.Text.Json.JsonSerializer.Serialize(tiles));
    }
    var fields = root.GetProperty("Properties");
    var raceCount=fields.GetProperty("m_trackNodesCount").GetInt32();
    var pitCount=fields.GetProperty("m_pitNodesCount").GetInt32();
    if(raceCount<4 || pitCount<4 || fields.GetProperty("m_trackNodes").GetArrayLength()!=raceCount+pitCount)
        throw new Exception("Invalid topology counts");
    foreach(var field in fields.EnumerateObject()) {
        var property=track.Data.SingleOrDefault(p=>p.Name.ToString()==field.Name) ?? throw new Exception("Unknown component property "+field.Name);
        ComponentPatch.Apply(asset,property,field.Value);
    }
}
File.WriteAllText(Path.Combine(args[2],"writer-report.json"), System.Text.Json.JsonSerializer.Serialize(new {
    installable = false, mode = args.Length > 3 ? args[3] : "unchanged-roundtrip", binaryEqualityBeforeEdit = equal,
    input = Path.GetFullPath(args[0]), originalSpeed, editedSpeed = originalSpeed - 1
}));
var output = Path.Combine(args[2],Path.GetFileName(args[0]));
asset.Write(output);
var check = new UAsset(output, EngineVersion.VER_UE5_1, new Usmap(args[1]));
if(!check.VerifyBinaryEquality()) throw new Exception("Output failed binary roundtrip");
Console.WriteLine($"Written and reread {check.Exports.Count} exports; output binary roundtrip passed");
return 0;
