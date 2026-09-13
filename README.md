# Image SVG Studio

Image SVG Studio is an open-source Windows desktop editor for importing raster images, extracting visual objects, refining masks and layers, and exporting faithful SVG/PNG results.

Built with **Go**, **Wails**, **Vite**, **Fabric.js** and **ImageTracerJS**.

## Highlights

- Import PNG, JPG, WebP and BMP images.
- Detect visual objects automatically.
- Create manual rectangular and polygon selections.
- Edit each crop as an independent group of layers.
- Photoshop-inspired layer editor with visibility, lock, ordering and opacity controls.
- Brush, eraser, restore, paint, blend and rectangular cut tools.
- Copy selected objects to the clipboard as PNG/SVG.
- Export faithful SVG without forcing raster content into vector paths.
- Optional SVG path vectorization.
- Zoom with `Ctrl + mouse wheel` and pan with mouse wheel/right-button drag.
- Native Windows executable generated with Wails.

## Development

Requirements:

- Go 1.24+
- Node.js 22+
- Wails CLI 2.10.2

Run in development mode:

```bat
dev.bat
```

Build Windows x64 locally:

```bat
build.bat
```

The executable is generated at:

```text
build\bin\ImageSVGStudio.exe
```

## Releases

GitHub Actions builds the Windows x64 executable automatically.

To publish a release, create and push a version tag such as:

```bash
git tag v0.2.10
git push origin v0.2.10
```

The release workflow attaches:

- `ImageSVGStudio-<version>-windows-amd64.exe`
- `ImageSVGStudio-<version>-windows-amd64.zip`
- `ImageSVGStudio-<version>-windows-amd64.sha256`

You can also run the workflow manually from the **Actions** tab and choose whether to create a release.

## License

Released under the [MIT License](LICENSE).

Copyright © 2026 Ricardo Alberto Walter.
