# Astro Print

A browser tool for printing astrophotos with a caption. Open a photo, check the caption it builds from the file's metadata, frame it, and print it borderless or save it as a print-ready PNG.

> [!IMPORTANT]
> In the print dialog, set the scale to **100%** and the margins to **None**. Anything else shrinks the print and leaves white borders.

<br>

## Features

<dl>
<dt>Captions from metadata</dt>
<dd>Subject, date, camera, lens, focal length, aperture, exposure, ISO and processing software, read from EXIF, XMP, IPTC and PNG text</dd>
<dt>Catalogue names</dt>
<dd>Picks up M, NGC, IC, Sh2 and Caldwell numbers from the file name when there's no title</dd>
<dt>Date checks</dt>
<dd>Uses the original capture time, and tells you when it had to fall back to something less reliable</dd>
<dt>Paper sizes</dt>
<dd>6×4, 7×5 and 10×8 in, A6, A5, A4 and US Letter, landscape or portrait</dd>
<dt>Framing</dt>
<dd>Fill or fit, zoom up to 400%, drag to reposition, and rotate</dd>
<dt>Caption style</dt>
<dd>Any corner, sans-serif, serif or monospace, white or black text, shaded background, size in points and margin in millimetres</dd>
<dt>Print-ready PNGs</dt>
<dd>300 or 600 dpi, with the DPI written into the file so it opens at the right physical size</dd>
<dt>Wait between prints (optional)</dt>
<dd>Holds the Print button for a set time so each print can dry before the next one comes out</dd>
<dt>Remembers settings</dt>
<dd>Paper, caption style and print options are kept between visits</dd>
</dl>

<br>

## Usage

There's nothing to install. It's a static page with no dependencies and no build step, and photos are processed in the browser.

### Open it directly

Download or clone the repo and open `source/index.html` in a browser.

```
git clone https://github.com/T3chieJack/astro-photos.git
```

### Run a local server

Any static file server works:

```
npx serve source
```

or

```
python -m http.server --directory source
```

### Host it

Upload the contents of `source` to any static host.

> [!TIP]
> GitHub Pages only publishes from the repo root or a `docs` folder. To use it, rename `source` to `docs`, then choose **Settings > Pages > Deploy from a branch**, your branch, and `/docs`.

<br>

## Printing

1. Open a photo, or drop one onto the page.
2. Check the caption fields. Anything can be edited.
3. Choose the paper size and drag or scroll on the preview to frame the photo.
4. Press **Print**, then use these settings in the print dialog:

| Setting | Value |
| --- | --- |
| Paper size | The size chosen in Astro Print |
| Orientation | The orientation chosen in Astro Print |
| Scale | 100% / Actual size |
| Margins | None / Borderless |
| Quality | Best |

Ctrl+P (or Cmd+P) goes through the same steps, so the printer always gets the current preview.

> [!TIP]
> Borderless printing crops slightly past the edge of the paper. Keep the caption margin at 3 mm or more.

<br>

## Output sizes

| Paper | 300 dpi | 600 dpi |
| --- | --- | --- |
| 6×4 in | 1800 × 1200 | 3600 × 2400 |
| 7×5 in | 2100 × 1500 | 4200 × 3000 |
| 10×8 in | 3000 × 2400 | 6000 × 4800 |
| A6 | 1748 × 1240 | 3496 × 2480 |
| A5 | 2480 × 1748 | 4961 × 3496 |
| A4 | 3508 × 2480 | 7016 × 4961 |
| US Letter | 3300 × 2550 | 6600 × 5100 |

Sizes are in pixels, landscape. Portrait swaps them.

<br>

## Metadata

Each caption line is filled from the first source that has a value.

| Line | Sources, in order |
| --- | --- |
| Subject | XMP title, IPTC title, Windows title, EXIF description, PNG title, IPTC caption, XMP description, Windows subject, then the file name |
| Date | EXIF capture time, XMP capture time, Photoshop date created, EXIF digitised time, XMP create date |
| Equipment | Capture method (chosen by you), camera, lens, focal length, aperture, exposure, ISO and processing software |

If none of the date sources are there, it falls back to a date in the file name, the EXIF modified time, the PNG creation time, and finally the file's date on disk. You'll see a warning when that happens, and another one if the file went through Photoshop, since the date may then be when it was edited rather than shot.

Processing software it recognises includes PixInsight, Siril, DeepSkyStacker, Astro Pixel Processor, StarTools, GraXpert, Sequator, RegiStax, AutoStakkert, Photoshop, Lightroom, GIMP, Affinity Photo, darktable and RawTherapee. Smart telescopes from ZWO (Seestar), DwarfLab, Vaonis, Unistellar and Celestron (Origin) set the capture method automatically.

<br>

## Limits

- **File types:** JPG, PNG and WebP. Export TIFF, FITS and camera raw files to one of those first.
- **Long captions:** lines wider than about 60% of the print are shortened with an ellipsis.
- **Settings and the print wait:** stored in the browser, so they're per browser and aren't kept in a private window.

<br>

## Disclaimer

Colour and brightness on paper depend on your printer, paper and driver settings, so a print can look different from the preview. Do a test print before using expensive paper.

<br>

## License

[MIT](LICENSE)
