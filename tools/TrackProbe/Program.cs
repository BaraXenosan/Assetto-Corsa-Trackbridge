using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.Compression;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using CUE4Parse.MappingsProvider;
using CUE4Parse.UE4.Assets;
using CUE4Parse.MappingsProvider.Usmap;
using System.Security.Cryptography;

if (args.Length < 3) {
    Console.Error.WriteLine("TrackProbe PAKS OUTPUT FMODEL_SETTINGS [--metadata-only | --usmap FILE] [--overlay DIR] [--package-list JSON] [--shader-maps] [PACKAGE_PATH ...]");
    return 1;
}
var root = Path.GetFullPath(args[0]);
var output = Path.GetFullPath(args[1]);
if (Directory.Exists(output)) throw new IOException("Output already exists; choose a new directory.");
var packages = new List<string>();
string? mappingFile = null;
string? overlayDirectory = null;
var metadataOnly = false;
var readShaderMaps = false;
var recursive = false;
for (int i = 3; i < args.Length; i++) {
    if (args[i] == "--recursive") recursive = true;
    else if (args[i] == "--metadata-only") metadataOnly = true;
    else if (args[i] == "--shader-maps") readShaderMaps = true;
    else if (args[i] == "--usmap" && i + 1 < args.Length) mappingFile = Path.GetFullPath(args[++i]);
    else if (args[i] == "--overlay" && i + 1 < args.Length) overlayDirectory = Path.GetFullPath(args[++i]);
    else if (args[i] == "--package-list" && i + 1 < args.Length) {
        var list = JsonConvert.DeserializeObject<string[]>(File.ReadAllText(args[++i])) ?? throw new ArgumentException("Expected JSON package array");
        if (list.Any(string.IsNullOrWhiteSpace)) throw new ArgumentException("Empty package path in list");
        packages.AddRange(list);
    }
    else if (args[i].StartsWith("--")) throw new ArgumentException("Unknown or incomplete option: " + args[i]);
    else packages.Add(args[i]);
}
if (metadataOnly && mappingFile != null) throw new ArgumentException("Choose metadata-only or a mapping file, not both");
var config = JObject.Parse(File.ReadAllText(args[2]));
var perDirectory = (JObject?)config["PerDirectory"] ?? throw new Exception("Missing FModel game settings");
var game = perDirectory.Properties().FirstOrDefault(p => string.Equals(Path.GetFullPath(p.Name), root, StringComparison.OrdinalIgnoreCase))?.Value
    ?? throw new Exception("No FModel settings match the requested game directory");
var key = game["AesKeys"]?["mainKey"]?.Value<string>() ?? throw new Exception("No configured game key");
var version = (EGame)(game["UeVersion"]?.Value<int>() ?? throw new Exception("No configured engine version"));
var outputBase = config["OutputDirectory"]?.Value<string>() ?? "";
var oodle = Path.Combine(outputBase, ".data", "oodle-data-shared.dll");
if (!File.Exists(oodle)) throw new FileNotFoundException("Existing FModel Oodle library required", oodle);
OodleHelper.Initialize(oodle);
using var provider = new DefaultFileProvider(root, recursive ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly, new VersionContainer(version), StringComparer.OrdinalIgnoreCase);
provider.ReadShaderMaps = readShaderMaps;
provider.Initialize();
if (overlayDirectory != null) {
    foreach (var file in Directory.EnumerateFiles(overlayDirectory).Where(f => Path.GetExtension(f) is ".utoc" or ".pak").Where(f => !Path.GetFileName(f).StartsWith("global."))) provider.RegisterVfs(file);
}
provider.SubmitKey(new FGuid(), new FAesKey(key));
provider.PostMount();
// An empty provider permits header inspection only. Never deserialize properties with it.
if (metadataOnly) provider.MappingsContainer = new HeaderOnlyMappings();
else if (mappingFile != null) provider.MappingsContainer = new FileUsmapTypeMappingsProvider(mappingFile);
CUE4Parse.Globals.FatalObjectSerializationErrors = true;
Directory.CreateDirectory(output);
void Save(string relative, object value) {
    var file = Path.GetFullPath(Path.Combine(output, relative));
    if (!file.StartsWith(output + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Output path escaped destination");
    Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    using var stream = new FileStream(file, FileMode.CreateNew);
    using var writer = new StreamWriter(stream);
    writer.Write(JsonConvert.SerializeObject(value, Formatting.Indented));
}
var paths = provider.Files.Keys.Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(p => p).ToArray();
Save("files.json", paths);
Console.WriteLine($"Mounted {paths.Length} paths using {version}; recursive scan: {recursive}.");
var results = new List<object>();
var failures = 0;
foreach (var requested in packages) {
    var package = paths.FirstOrDefault(p => p.Equals(requested, StringComparison.OrdinalIgnoreCase));
    if (package == null) { results.Add(new { requested, error = "Not found" }); failures++; continue; }
    try {
        if (!package.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase) && !package.EndsWith(".umap", StringComparison.OrdinalIgnoreCase)) {
            var bytes = provider.SaveAsset(package);
            var destination = Path.GetFullPath(Path.Combine(output, "raw", package));
            if (!destination.StartsWith(output + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Unsafe raw file path");
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            using (var stream = new FileStream(destination, FileMode.CreateNew)) stream.Write(bytes);
            results.Add(new { package, status="raw-file", bytes=bytes.Length, sha256=Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant() });
            continue;
        }
        var loaded = provider.LoadPackage(package);
        var container = (provider.Files[package] as CUE4Parse.UE4.VirtualFileSystem.VfsEntry)?.Vfs.Name;
        Console.WriteLine($"Source container: {container}");
        if (loaded is IoPackage io) {
            Save("metadata/" + package + ".json", new {
                package, metadataOnly, io.Name,
                names = io.NameMap.Select(x => x.Name),
                exports = io.ExportMap.Select((e, i) => new {
                    index = i, name = io.CreateFNameFromMappedName(e.ObjectName).Text,
                    type = io.ResolveObjectIndex(e.ClassIndex)?.GetPathName(),
                    outer = io.ResolveObjectIndex(e.OuterIndex)?.GetPathName(),
                    serialOffset = e.CookedSerialOffset, serialSize = e.CookedSerialSize
                }),
                imports = io.ImportMap.Select(e => io.ResolveObjectIndex(e)?.GetPathName()),
                dependencies = io.ImportedPackages.Value.Select(p => p?.Name)
            });
        }
        var rawHashes = new List<object>();
        foreach (var raw in provider.SavePackage(package)) {
            var dest = Path.GetFullPath(Path.Combine(output, "raw", raw.Key));
            if (!dest.StartsWith(output + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Unsafe raw path");
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            using var stream = new FileStream(dest, FileMode.CreateNew);
            stream.Write(raw.Value);
            rawHashes.Add(new { path = raw.Key, bytes = raw.Value.Length, sha256 = Convert.ToHexString(SHA256.HashData(raw.Value)).ToLowerInvariant() });
        }
        Save("hashes/" + package + ".json", rawHashes);
        if (metadataOnly) {
            results.Add(new { package, status = "metadata-only", propertiesDecoded = false, loaded.ExportMapLength });
            Console.WriteLine($"Metadata {package}: {loaded.ExportMapLength} exports");
            continue;
        }
        var objects = loaded.GetExports().ToArray();
        var relative = "properties/" + package.Replace(':', '_') + ".json";
        Save(relative, objects);
        results.Add(new { package, container, output = relative, exports = objects.Count() });
        Console.WriteLine($"Exported {package}: {objects.Count()} objects");
    } catch (Exception e) {
        failures++;
        results.Add(new { package, error = e.ToString() });
        Console.WriteLine($"Failed {package}: {e.GetType().Name}: {e.Message}");
    }
}
Save("manifest.json", new {
    schemaVersion = 1, installable = false, root, overlayDirectory, version = version.ToString(),
    cue4Parse = typeof(DefaultFileProvider).Assembly.GetName().Version?.ToString(),
    createdUtc = DateTime.UtcNow, files = paths.Length, metadataOnly, readShaderMaps,
    mappingFile, mappingSha256 = mappingFile == null ? null : Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(mappingFile))).ToLowerInvariant(), results,
    scope = "Property export for research; no cooking, packaging or game validation."
});
return failures > 0 ? 2 : 0;

sealed class HeaderOnlyMappings : AbstractTypeMappingsProvider {
    public override TypeMappings? MappingsForGame { get; protected set; } = new();
    public override void Load(string path, StringComparer? comparer = null) => throw new NotSupportedException();
    public override void Load(byte[] bytes, StringComparer? comparer = null) => throw new NotSupportedException();
    public override void Reload() => throw new NotSupportedException();
}
