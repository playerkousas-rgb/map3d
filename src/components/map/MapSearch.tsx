import { FormEvent, useRef, useState } from "react";
import { css, keyframes } from "@emotion/react";
import type { Map as LeafletMap } from "leaflet";
import { Loader2, Search, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { PlaceResult, searchPlaces } from "@/utils/geocode";

const spin = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

const iconSize = css({ width: "14px", height: "14px" });

const iconButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "34px",
  padding: "0 0.6rem",
  border: "none",
  background: "transparent",
  color: "#5f6368",
  cursor: "pointer",
  transition: "0.2s",
  ":hover": { color: "#007bff" },
  ":disabled": { cursor: "default", opacity: 0.5, color: "#5f6368" },
});

const panel = css({
  marginTop: "6px",
  backgroundColor: "#ffffffee",
  backdropFilter: "blur(8px)",
  borderRadius: "8px",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
  fontSize: "12.5px",
});

type Message = "searchNoResults" | "searchFailed";

/**
 * Place / address search for the selection map. Moves the map only —
 * the selected box and the rest of the flow are untouched.
 */
export function MapSearch({ map }: { map: LeafletMap | null }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const requestRef = useRef(0);

  const flyTo = (place: PlaceResult) => {
    setResults([]);
    if (!map) return;
    if (place.bounds) map.flyToBounds(place.bounds, { maxZoom: 17, duration: 0.8 });
    else map.flyTo([place.lat, place.lon], 16, { duration: 0.8 });
  };

  const clear = () => {
    requestRef.current++;
    setQuery("");
    setResults([]);
    setMessage(null);
    setLoading(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    const id = ++requestRef.current;
    setLoading(true);
    setMessage(null);
    setResults([]);
    try {
      const b = map?.getBounds();
      const found = await searchPlaces(q, {
        lang,
        viewbox: b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : undefined,
      });
      if (id !== requestRef.current) return;
      if (found.length === 0) setMessage("searchNoResults");
      else if (found.length === 1) flyTo(found[0]);
      else setResults(found);
    } catch (err) {
      if (id !== requestRef.current) return;
      console.warn("[map3d] Place search failed:", err);
      setMessage("searchFailed");
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  };

  return (
    <div
      css={css({
        position: "absolute",
        zIndex: 9998,
        top: "10px",
        left: "52px",
        width: "min(320px, calc(100% - 352px))",
        "@media (max-width: 720px)": {
          top: "84px",
          left: "10px",
          width: "calc(100% - 20px)",
        },
      })}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setResults([]);
          setMessage(null);
        }
      }}
    >
      <form
        role="search"
        onSubmit={submit}
        css={css({
          display: "flex",
          alignItems: "center",
          backgroundColor: "#ffffffe6",
          backdropFilter: "blur(8px)",
          borderRadius: "8px",
          outline: "rgba(240, 240, 244, 0.51) solid 0.1rem",
          boxShadow: "0 1px 6px rgba(0, 0, 0, 0.15)",
          overflow: "hidden",
        })}
      >
        <input
          type="search"
          value={query}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          enterKeyHint="search"
          onChange={(e) => {
            setQuery(e.target.value);
            setMessage(null);
          }}
          css={css({
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
            padding: "0.5rem 0.75rem",
            fontSize: "13px",
            color: "#202124",
            outline: "none",
            "::-webkit-search-cancel-button": { display: "none" },
          })}
        />
        {query && (
          <button type="button" css={iconButton} aria-label={t("searchClear")} onClick={clear}>
            <X css={iconSize} />
          </button>
        )}
        <button
          type="submit"
          css={iconButton}
          aria-label={t("search")}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <Loader2 css={[iconSize, css({ animation: `${spin} 1s linear infinite` })]} />
          ) : (
            <Search css={iconSize} />
          )}
        </button>
      </form>

      {message && (
        <div
          role="status"
          css={[
            panel,
            css({
              padding: "6px 10px",
              color: message === "searchFailed" ? "#ef4444" : "#5f6368",
            }),
          ]}
        >
          {t(message)}
        </div>
      )}

      {results.length > 0 && (
        <ul
          css={[
            panel,
            css({ listStyle: "none", margin: "6px 0 0", padding: "4px", maxHeight: "240px", overflowY: "auto" }),
          ]}
        >
          {results.map((place, i) => (
            <li key={`${place.lat},${place.lon},${i}`}>
              <button
                type="button"
                title={place.name}
                onClick={() => flyTo(place)}
                css={css({
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  fontSize: "12.5px",
                  color: "#202124",
                  cursor: "pointer",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  ":hover": { backgroundColor: "#f0f6ff" },
                })}
              >
                {place.name}
              </button>
            </li>
          ))}
          <li css={css({ fontSize: "10.5px", color: "#9aa0a6", padding: "4px 8px 2px", textAlign: "right" })}>
            © OpenStreetMap · Nominatim
          </li>
        </ul>
      )}
    </div>
  );
}
