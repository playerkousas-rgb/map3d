import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { css, keyframes } from "@emotion/react";
import type { Map as LeafletMap } from "leaflet";
import { Loader2, Search, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { PlaceResult, searchPlaces } from "@/utils/geocode";
import { MOBILE_BREAKPOINT } from "@/hooks/useIsMobile";

const spin = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

const iconSize = css({ width: "16px", height: "16px" });

/**
 * Square, thumb-sized icon button. The app's 44 px minimum applies here too —
 * a 34 px button next to a keyboard is genuinely hard to hit one-handed.
 */
const iconButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "var(--tap)",
  alignSelf: "stretch",
  border: "none",
  background: "transparent",
  color: "#5f6368",
  cursor: "pointer",
  transition: "0.2s",
  ":hover": { color: "#007bff" },
  ":disabled": { cursor: "default", opacity: 0.45, color: "#5f6368" },
});

const panel = css({
  backgroundColor: "#ffffffee",
  backdropFilter: "blur(8px)",
  borderRadius: "10px",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
  fontSize: "13.5px",
  overflow: "hidden",
});

type Message = "searchNoResults" | "searchFailed";

/**
 * Place / address search for the selection map. Moves the map only —
 * the selected box and the rest of the flow are untouched.
 *
 * Mobile notes, because this is the control people fight with on a phone:
 *  • the input is **16 px** on small screens. Anything smaller makes iOS Safari
 *    zoom the page in on focus and never zoom back out, which leaves the map
 *    and the whole app half-scrolled until a reload;
 *  • every target is `--tap` (44 px) and the result rows are full-width, so
 *    nothing has to be hit with a stylus;
 *  • the result list is bounded and scrolls under the finger without the page
 *    or the map panning with it (`touch-action: pan-y` + contained overscroll);
 *  • picking a result blurs the field, so the on-screen keyboard closes and
 *    the map that just flew there is actually visible;
 *  • on a phone the bar sits on its own row *below* the map's own buttons
 *    instead of fighting them for the same strip of screen.
 */
export function MapSearch({ map }: { map: LeafletMap | null }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const requestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setResults([]);
    setMessage(null);
  }, []);

  const flyTo = (place: PlaceResult) => {
    close();
    // Hand the screen back to the map: on a phone the keyboard would
    // otherwise cover the place we just flew to.
    inputRef.current?.blur();
    if (!map) return;
    if (place.bounds) map.flyToBounds(place.bounds, { maxZoom: 17, duration: 0.8 });
    else map.flyTo([place.lat, place.lon], 16, { duration: 0.8 });
  };

  // A tap on the map itself dismisses the list, so it never sits between the
  // user and the area they are trying to circle.
  useEffect(() => {
    if (!map) return;
    const onClick = () => close();
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, close]);

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
        width: "min(320px, max(200px, calc(100% - 360px)))",
        // Phone: full width, on its own row under the map's own buttons so
        // neither control has to shrink to make room for the other.
        [`@media (max-width: ${MOBILE_BREAKPOINT}px)`]: {
          top: "calc(1rem + var(--tap) + 0.5rem)",
          left: "0.6rem",
          width: "auto",
          right: "0.6rem",
        },
      })}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
          inputRef.current?.blur();
        }
      }}
    >
      <form
        role="search"
        onSubmit={submit}
        css={css({
          display: "flex",
          alignItems: "stretch",
          minHeight: "var(--tap)",
          backgroundColor: "#ffffffe6",
          backdropFilter: "blur(8px)",
          borderRadius: "10px",
          outline: "rgba(240, 240, 244, 0.51) solid 0.1rem",
          boxShadow: "0 1px 6px rgba(0, 0, 0, 0.15)",
          overflow: "hidden",
        })}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          enterKeyHint="search"
          // A place name is not a sentence: the OS must not autocomplete,
          // autocorrect or capitalise it, and must not fire searches as the
          // user types (Nominatim's usage policy caps us at 1 request/second).
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setMessage(null);
          }}
          css={css({
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
            padding: "0 0.75rem",
            // 16 px on a phone: below that, iOS zooms the page on focus and
            // does not undo it when the field is dismissed.
            fontSize: "16px",
            lineHeight: 1.3,
            color: "#202124",
            outline: "none",
            "::-webkit-search-cancel-button": { display: "none" },
            [`@media (min-width: ${MOBILE_BREAKPOINT + 1}px)`]: { fontSize: "13.5px" },
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
              marginTop: "6px",
              padding: "9px 12px",
              color: message === "searchFailed" ? "#c5221f" : "#5f6368",
            }),
          ]}
        >
          {t(message)}
        </div>
      )}

      {results.length > 0 && (
        <ul
          aria-label={t("search")}
          css={[
            panel,
            css({
              listStyle: "none",
              margin: "6px 0 0",
              padding: "4px",
              // Bounded so the list can never grow past the map it floats on
              // (`--map-h` is the map's own height, 38dvh on a phone in
              // orienteering mode), and scrolls with the finger without
              // dragging the page or the map along with it.
              maxHeight: "min(38dvh, 280px, max(120px, calc(var(--map-h) - 8.5rem)))",
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }),
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
                  minHeight: "var(--tap)",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  lineHeight: 1.35,
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
          <li
            css={css({
              fontSize: "10.5px",
              color: "#9aa0a6",
              padding: "6px 10px 4px",
              textAlign: "right",
            })}
          >
            © OpenStreetMap · Nominatim
          </li>
        </ul>
      )}
    </div>
  );
}
