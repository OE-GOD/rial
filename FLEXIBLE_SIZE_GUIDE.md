# 📐 Flexible Image Size Support

## Current Implementation

The Rial app **already supports flexible image sizes**! The 300×300 mentioned in docs is just one option.

### How to Use Different Sizes

#### 1. **In the Crop Editor**
- After taking/selecting a photo, you'll see the crop overlay
- **Drag the corners** to resize to ANY dimension
- Or tap preset buttons: Small (256), Medium (512), Large (768), HD (1024)
- The crop can be **any size you want** - not limited to presets

#### 2. **What Gets Certified**
```
Your Photo → Custom Crop (any size) → Merkle Root → Blockchain
                    ↓
              Exact size stored
```

#### 3. **Backend Support**
The backend accepts and processes any size:
```json
{
  "transformations": [
    {
      "Crop": {
        "x": 0,
        "y": 0,
        "width": 800,    // Can be any width
        "height": 600    // Can be any height
      }
    }
  ]
}
```

## Recommended Sizes

### For Different Use Cases:

**Legal Evidence / Insurance:**
- Use HD (1024×1024) for maximum detail
- Larger file but more evidence quality

**Quick Verification:**
- Use Medium (512×512) for balance
- Good quality, reasonable size

**Batch Processing:**
- Use Small (256×256) for many photos
- Faster processing, less storage

**Original Aspect Ratio:**
- Drag crop to match photo dimensions
- Preserves original composition

## Technical Details

### Size Impact:

| Size | File Size | Processing Time | Quality |
|------|-----------|-----------------|---------|
| 256×256 | ~5-10 KB | Very Fast | Basic |
| 512×512 | ~20-40 KB | Fast | Good |
| 768×768 | ~50-80 KB | Normal | High |
| 1024×1024 | ~100-200 KB | Slower | Maximum |
| Custom | Varies | Varies | Varies |

### Limitations:

1. **Maximum:** Limited by device memory (typically 4096×4096)
2. **Minimum:** Should be at least 100×100 for meaningful content
3. **Aspect Ratio:** Any ratio supported (square, portrait, landscape)

## How to Add More Presets

In `ImageEditView.swift`, add to the presets array:
```swift
let sizePresets = [
    (label: "Instagram", width: CGFloat(1080), height: CGFloat(1080)),
    (label: "4K", width: CGFloat(3840), height: CGFloat(2160)),
    (label: "Custom", width: croppingWidth, height: croppingHeight)
]
```

## Best Practices

1. **For Legal Use:** Use larger sizes (768+ px)
2. **For Quick Sharing:** Use medium sizes (512 px)
3. **For Batch Certs:** Use smaller sizes (256 px)
4. **For Artistic:** Use original aspect ratio

## Future Enhancements

We could add:
1. **Free-form crop** (non-square shapes)
2. **Aspect ratio lock** (16:9, 4:3, etc.)
3. **Size templates** (passport photo, ID card, etc.)
4. **Auto-optimize** (based on content detection)

The system is ready for any size - just drag and crop!


