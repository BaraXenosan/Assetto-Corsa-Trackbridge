using System.Text.Json;
using UAssetAPI;
using UAssetAPI.UnrealTypes;
using UAssetAPI.PropertyTypes.Objects;
using UAssetAPI.PropertyTypes.Structs;

static class ComponentPatch {
    public static void Apply(UAsset asset, PropertyData property, JsonElement value) {
        property.IsZero = false;
        switch(property) {
            case ArrayPropertyData array:
                if(value.ValueKind != JsonValueKind.Array) throw new Exception("Expected array: " + property.Name);
                if(value.GetArrayLength() == 0) { array.Value = Array.Empty<PropertyData>(); break; }
                if(array.Value.Length == 0) throw new Exception("No array element template: " + property.Name);
                var template = array.Value[0];
                array.Value = value.EnumerateArray().Select((element,index) => {
                    var copy = (PropertyData)template.Clone();
                    copy.Name = new FName(asset,index.ToString());
                    Apply(asset,copy,element); return copy;
                }).ToArray();
                break;
            case StructPropertyData structure:
                if(structure.Value.Count == 1 && (structure.Value[0] is VectorPropertyData || structure.Value[0] is RotatorPropertyData)) {
                    Apply(asset,structure.Value[0],value); break;
                }
                foreach(var field in value.EnumerateObject()) {
                    var bracket=field.Name.IndexOf('[');
                    var fieldName=bracket<0?field.Name:field.Name[..bracket];
                    var arrayIndex=bracket<0?0:int.Parse(field.Name[(bracket+1)..^1]);
                    var child = structure.Value.SingleOrDefault(p=>p.Name.ToString()==fieldName && p.ArrayIndex==arrayIndex)
                        ?? throw new Exception("Unknown struct field: " + property.Name + "." + field.Name);
                    Apply(asset,child,field.Value);
                }
                break;
            case VectorPropertyData vector:
                vector.Value = new FVector(value.GetProperty("X").GetDouble(),value.GetProperty("Y").GetDouble(),value.GetProperty("Z").GetDouble()); break;
            case RotatorPropertyData rotation: rotation.Value=new FRotator(value.GetProperty("Pitch").GetDouble(),value.GetProperty("Yaw").GetDouble(),value.GetProperty("Roll").GetDouble()); break;
            case DoublePropertyData real: real.Value=value.GetDouble();if(!double.IsFinite(real.Value))throw new Exception("Nonfinite double");break;
            case FloatPropertyData scalar: scalar.Value=value.GetSingle(); if(!float.IsFinite(scalar.Value))throw new Exception("Nonfinite float"); break;
            case UInt32PropertyData integer: integer.Value=value.GetUInt32(); break;
            case IntPropertyData integer: integer.Value=value.GetInt32(); break;
            case BoolPropertyData boolean: boolean.Value=value.GetBoolean(); break;
            case EnumPropertyData enumeration: enumeration.Value=new FName(asset,value.GetString()!.Split("::").Last()); break;
            case BytePropertyData octet: octet.Value=value.GetByte(); break;
            case MapPropertyData map:
                if(value.ValueKind!=JsonValueKind.Array || value.GetArrayLength()!=0)throw new Exception("Only explicit empty map supported");
                map.Value.Clear(); break;
            default: throw new Exception("Unsupported property type " + property.GetType().Name);
        }
    }
}
