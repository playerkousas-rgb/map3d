import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useAreaStore } from "@/state/areaStore";
import { Html, Sky, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ExportListener } from "./ExportListener";
import { SafeEnvironment } from "./SafeEnvironment";
import { normalizeBBox, overpassQuery } from "@/utils/overpass";
import { useI18n } from "@/i18n";

const scale = 51000;

function Building({
  shape,
  extrudeSettings,
  tags,
}: {
  shape: THREE.Shape;
  extrudeSettings: any;
  tags: any;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [hoverPos, setHoverPos] = useState<THREE.Vector3 | null>(null);
  const [showTranslations, setShowTranslations] = useState(false);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);

  const tagLabels: { [key: string]: string } = {
    building: t("tagType"),
    height: t("tagHeight"),
    "building:levels": t("tagLevels"),
    amenity: t("tagAmenity"),
    denomination: t("tagDenomination"),
  };

  return (
    <mesh
      onPointerOver={(e) => {
        setHovered(true);
        e.stopPropagation();
      }}
      onPointerOut={(e) => {
        setHovered(false);
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        setHoverPos(e.point.clone());
        e.stopPropagation();
      }}
      onClick={(e) => {
        setClicked(!clicked);
        e.stopPropagation();
      }}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ exportable: true }}
    >
      <extrudeGeometry args={[shape, extrudeSettings]} />
      <meshStandardMaterial color={hovered || clicked ? "#007bff" : "#9da0a3"} />
      {(hovered || clicked) && hoverPos && (
        <Html position={[hoverPos.x, hoverPos.y + extrudeSettings.depth + 0.5, hoverPos.z]} center>
          <div
            role="dialog"
            aria-label={tags.name || t("buildingInfo")}
            style={{
              color: "#000000",
              backgroundColor: "#ffffff96",
              backdropFilter: "blur(8px)",
              border: "none",
              padding: "14px",
              borderRadius: "10px",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: "13px",
              width: "200px",
              boxShadow: "0 2px 14px rgba(0, 0, 0, 0.16)",
              transition: "all 0.2s ease-in-out",
            }}
          >
            <div
              style={{
                fontWeight: "600",
                fontSize: "15px",
                borderBottom: tags.name ? "1px solid rgba(0, 0, 0, 0.08)" : "none",
                paddingBottom: tags.name ? "6px" : "0",
                marginBottom: tags.name ? "8px" : "4px",
              }}
            >
              {tags.name || t("buildingInfo")}
            </div>
            {["building", "height", "building:levels", "amenity", "denomination"].map(
              (key) =>
                tags[key] &&
                (key !== "building" || tags[key] !== "yes") && (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      margin: "4px 0",
                    }}
                  >
                    <span style={{ fontWeight: "500", color: "#5f6368" }}>
                      {tagLabels[key] || key.replace(/_/g, " ")}:
                    </span>
                    <span style={{ textTransform: "capitalize" }}>
                      {key === "height" ? `${tags[key]} m` : tags[key]}
                    </span>
                  </div>
                )
            )}
            {[
              "addr:street",
              "addr:housenumber",
              "addr:district",
              "addr:city",
              "addr:postcode",
            ].some((key) => tags[key]) && (
              <div
                style={{
                  margin: "10px 0 8px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                }}
              >
                <div style={{ fontWeight: "500", marginBottom: "4px", color: "#5f6368" }}>
                  {t("address")}
                </div>
                <div style={{ marginLeft: "4px", fontSize: "12px", color: "#5f6368" }}>
                  {[
                    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
                    tags["addr:district"],
                    tags["addr:city"],
                    tags["addr:postcode"],
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            )}
            {Object.entries(tags).filter(
              ([key]) =>
                ![
                  "building",
                  "name",
                  "height",
                  "building:levels",
                  "source",
                  "amenity",
                  "denomination",
                ].includes(key) &&
                !key.startsWith("addr:") &&
                !key.startsWith("name:") &&
                !key.startsWith("alt_name:")
            ).length > 0 && (
              <div
                style={{
                  margin: "10px 0 4px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                }}
              >
                <div
                  style={{
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#5f6368",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
                >
                  {t("additionalInfo")}
                  <span>{showAdditionalInfo ? "▲" : "▼"}</span>
                </div>
                {showAdditionalInfo && (
                  <div>
                    {Object.entries(tags)
                      .filter(
                        ([key]) =>
                          ![
                            "building",
                            "name",
                            "height",
                            "building:levels",
                            "source",
                            "amenity",
                            "denomination",
                          ].includes(key) &&
                          !key.startsWith("addr:") &&
                          !key.startsWith("name:") &&
                          !key.startsWith("alt_name:")
                      )
                      .map(([key, value]) => {
                        if (
                          key === "description" ||
                          (typeof value === "string" && value.length > 80)
                        ) {
                          return (
                            <div key={key} style={{ margin: "8px 0" }}>
                              <div
                                style={{ fontWeight: "500", color: "#5f6368", marginBottom: "4px" }}
                              >
                                {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}
                              </div>
                              <div
                                style={{
                                  textAlign: "left",
                                  fontSize: "12px",
                                  color: "#5f6368",
                                  fontWeight: "400",
                                  textWrap: "wrap",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: "1.4",
                                  backgroundColor: "rgba(0,0,0,0.02)",
                                  padding: "6px 8px",
                                  borderRadius: "4px",
                                }}
                              >
                                {String(value)}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              margin: "4px 0",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "700",
                                color: "#5f6368",
                                textAlign: "left",
                              }}
                            >
                              {key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}:
                            </span>
                            <span
                              style={{
                                textTransform: "capitalize",
                                fontWeight: "400",
                                textAlign: "right",
                              }}
                            >
                              {String(value)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
            {Object.entries(tags).filter(([key]) => key.startsWith("name:")).length > 0 && (
              <div
                style={{
                  margin: "10px 0 4px",
                  borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                  paddingTop: "8px",
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    fontWeight: "500",
                    marginBottom: "4px",
                    color: "#5f6368",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => setShowTranslations(!showTranslations)}
                >
                  {t("nameTranslations")}
                  <span>{showTranslations ? "▲" : "▼"}</span>
                </div>
                {showTranslations && (
                  <div>
                    {Object.entries(tags)
                      .filter(([key]) => key.startsWith("name:"))
                      .map(([key, value]) => (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            margin: "4px 0",
                          }}
                        >
                          <span style={{ fontWeight: "500", color: "#5f6368" }}>
                            {key.replace("name:", "").toUpperCase()}:
                          </span>
                          <span style={{ textTransform: "capitalize" }}>{String(value)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Html>
      )}
    </mesh>
  );
}

/** Approximate road width in scene units by highway type (merged from building3d) */
function roadWidth(tags: any): number {
  const laneWidth = 1.6;
  const lanes = parseFloat(tags?.lanes || "");
  if (!isNaN(lanes) && lanes > 0) return lanes * laneWidth;
  switch (tags?.highway) {
    case "motorway":
    case "trunk":
      return 5;
    case "primary":
      return 4;
    case "secondary":
      return 3.2;
    case "tertiary":
      return 2.6;
    case "residential":
    case "unclassified":
      return 2.2;
    case "footway":
    case "path":
    case "cycleway":
      return 1;
    default:
      return 1.8;
  }
}

/**
 * Roads rendered as solid meshes (instead of lines) so they can be
 * exported to OBJ / STL as well — merged idea from building3d.
 */
function Roads({ area }: { area: any }) {
  const [roads, setRoads] = useState<any[]>([]);

  useEffect(() => {
    if (!area || area.length < 2) return;
    const { south, west, north, east } = normalizeBBox(area[0], area[1]);
    const query = `[out:json][timeout:25];(way["highway"](${south},${west},${north},${east}););out body geom;`;
    let stale = false;
    overpassQuery(query)
      .then((elements) => {
        if (!stale) setRoads(elements);
      })
      .catch((err) => console.error(err));
    return () => {
      stale = true;
    };
  }, [area]);

  const geometry = useMemo(() => {
    if (!area || area.length < 2 || roads.length === 0) return null;
    const refLat = (area[1].lat + area[0].lat) / 2;
    const refLng = (area[1].lng + area[0].lng) / 2;

    const project = (lat: number, lng: number) => {
      const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
      const z = -(lat - refLat) * scale;
      return { x, z };
    };

    const parts: THREE.BufferGeometry[] = [];
    const roadHeight = 0.4;

    roads.forEach((road) => {
      if (!road.geometry || road.geometry.length < 2) return;
      const width = roadWidth(road.tags);

      for (let i = 0; i < road.geometry.length - 1; i++) {
        const a = project(road.geometry[i].lat, road.geometry[i].lon);
        const b = project(road.geometry[i + 1].lat, road.geometry[i + 1].lon);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.01) continue;

        const seg = new THREE.BoxGeometry(length, roadHeight, width);
        const angle = Math.atan2(dz, dx);
        seg.rotateY(-angle);
        seg.translate((a.x + b.x) / 2, roadHeight / 2, (a.z + b.z) / 2);
        parts.push(seg);
      }
    });

    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    return merged;
  }, [roads, area]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} userData={{ exportable: true }}>
      <meshStandardMaterial color="#4a5568" roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

/** Base plate under the selected area — makes exported STL printable */
function BasePlate({ area }: { area: any }) {
  const geometry = useMemo(() => {
    if (!area || area.length < 2) return null;
    const refLat = (area[1].lat + area[0].lat) / 2;
    const refLng = (area[1].lng + area[0].lng) / 2;
    const cos = Math.cos((refLat * Math.PI) / 180);

    const x1 = (area[1].lng - refLng) * scale * cos;
    const x2 = (area[0].lng - refLng) * scale * cos;
    const z1 = -(area[1].lat - refLat) * scale;
    const z2 = -(area[0].lat - refLat) * scale;

    const width = Math.abs(x2 - x1) + 8;
    const depth = Math.abs(z2 - z1) + 8;
    const thickness = 2;

    const geo = new THREE.BoxGeometry(width, thickness, depth);
    geo.translate((x1 + x2) / 2, -thickness / 2, (z1 + z2) / 2);
    return geo;
  }, [area]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} userData={{ exportable: true }} receiveShadow>
      <meshStandardMaterial color="#e6e8eb" roughness={0.9} metalness={0.05} />
    </mesh>
  );
}

export function Space() {
  const areas = useAreaStore((state) => state.areas);
  const areasLoaded = useAreaStore((state) => state.areasLoaded);
  const [realCenter, setRealCenter] = useState<any>();
  // Roads are only requested for an area whose buildings were fetched.
  // (Previously the default area was queried on every page load — with an
  // inverted bbox that made Overpass return 100k+ roads.)
  const [roadsArea, setRoadsArea] = useState<any>();
  const center = useAreaStore((state) => state.center);
  const refLat = (center[1].lat + center[0].lat) / 2;
  const refLng = (center[1].lng + center[0].lng) / 2;

  function project(lat: number, lng: number) {
    const x = (lng - refLng) * scale * Math.cos((refLat * Math.PI) / 180);
    const y = (lat - refLat) * scale;
    return new THREE.Vector2(x, y);
  }

  const areaData = () => {
    const result: Array<{
      shape: THREE.Shape;
      extrudeSettings: any;
      tags: any;
    }> = [];
    areas.forEach((bld: any) => {
      if (!bld.geometry || bld.geometry.length < 3) return;
      const shapePoints = bld.geometry.map((pt: any) => project(pt.lat, pt.lng));
      if (!shapePoints[0].equals(shapePoints[shapePoints.length - 1]))
        shapePoints.push(shapePoints[0]);
      const shape = new THREE.Shape(shapePoints);
      let heightValue = parseFloat(bld.tags.height || "");
      const heightLevels = parseFloat(bld.tags["building:levels"] || "");
      if (isNaN(heightValue)) heightValue = 10;
      if (!isNaN(heightLevels)) heightValue = heightLevels * 2.2;
      const extrudeSettings = {
        steps: 1,
        depth: heightValue,
        bevelEnabled: false,
      };
      result.push({ shape, extrudeSettings, tags: bld.tags });
    });
    return result;
  };

  useEffect(() => {
    setRealCenter(center);
    if (areasLoaded) setRoadsArea(center);
  }, [areas]);

  const buildingsData = areaData();

  return (
    <Canvas camera={{ fov: 90, near: 0.1, far: 7000 }}>
      <ambientLight intensity={Math.PI / 2} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
      {buildingsData.map((item, index) => (
        <Building
          key={index}
          shape={item.shape}
          extrudeSettings={item.extrudeSettings}
          tags={item.tags}
        />
      ))}

      <BasePlate area={realCenter} />
      <Roads area={roadsArea} />
      <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
      <OrbitControls />
      <ExportListener />
      <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25} />
      <SafeEnvironment preset="city" />
    </Canvas>
  );
}
