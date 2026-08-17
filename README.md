<p align='center'>
<h1 align='center'>🗺️ map3d</h1>
<p align='center'>Generate real-world 3D maps & 3D-printable GPX models / 生成真實世界 3D 地圖與可列印 GPX 模型</p>
</p>

![img](./.github/screenshot.png)

## About The Project

A 3D mapping tool built with [React-Three-Fiber](https://github.com/pmndrs/react-three-fiber), merging the features of the original [cartesiancs/map3d](https://github.com/cartesiancs/map3d) and my earlier `building3d` project into one:

**Mode 1 — Map → 3D Buildings（地圖 → 3D 建築）**

- Select an area on the map (OpenStreetMap / Leaflet)
- Fetch buildings & roads from the Overpass API
- Render real-world 3D buildings (height from OSM `height` / `building:levels` tags)
- Roads rendered as solid meshes with widths based on highway type
- Click a building to see its OSM info (name, height, address, translations...)
- A base plate is generated underneath so exports are 3D-printable

**Mode 2 — GPX → 3D Print Model（GPX → 3D 列印模型）**

- Import a hiking / cycling GPX track (drag & drop)
- Generates a solid 3D model: base plate + track ribbon following the elevation profile, with start/end markers
- Adjustable elevation exaggeration, track width and base thickness
- Track statistics: distance, elevation gain, elevation range
- One-click STL export, ready for slicing & printing

**Export formats:** GLB / glTF / OBJ / STL

**Bilingual UI:** English / 繁體中文 (toggle in the top bar)

> [!IMPORTANT]
> 📢 <strong>This project cannot guarantee the accuracy of the data.</strong> Map data comes from OpenStreetMap; some building heights may be missing or incorrect.

## Development

```bash
npm install
npm run dev
```

## Credits

- Original map3d project by [cartesiancs](https://github.com/cartesiancs/map3d) (MIT License), created by Hyeong Jun Huh [(GitHub)](https://github.com/DipokalLab)
- Multi-format export & solid-mesh road ideas merged from my `building3d` project

## License

MIT License
