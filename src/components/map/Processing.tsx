import { css, keyframes } from "@emotion/react";
import { CheckCircle2, Loader2, SearchX } from "lucide-react";
import { useI18n } from "@/i18n";

export interface Building {
  id: number;
  tags: { [key: string]: string | undefined };
  geometry?: { lat: number; lng: number }[];
}

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

/**
 * Clear, friendly status card for the fetch step — what is happening right
 * now, how long it usually takes and what to do next. (Replaces the old raw
 * JSON dump that looked like the app had crashed.)
 */
export function FetchStatus({
  buildings,
  loading,
  fetched,
}: {
  buildings: Building[];
  loading: boolean;
  fetched: boolean;
}) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-live="polite"
      css={css({
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        padding: "1rem 1.1rem",
        borderRadius: "12px",
        backgroundColor: "#ffffffcc",
        border: "1px solid #e8eaee",
        boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
        fontSize: "14px",
        color: "#3c4043",
        minWidth: "min(360px, 70vw)",
      })}
    >
      {loading && (
        <div css={css({ display: "flex", alignItems: "center", gap: "0.55rem" })}>
          <Loader2
            css={css({ animation: `${spinAnimation} 1s linear infinite`, flexShrink: 0 })}
            size={16}
            color="#007bff"
          />
          <span>{t("fetchingBuildings")}</span>
        </div>
      )}

      {loading && (
        <div css={css({ fontSize: "12.5px", color: "#80868b", paddingLeft: "1.5rem" })}>
          {t("fetchSeconds")}
        </div>
      )}

      {!loading && !fetched && (
        <div css={css({ display: "flex", alignItems: "center", gap: "0.55rem" })}>
          <SearchX size={16} color="#80868b" css={{ flexShrink: 0 }} />
          <span>{t("fetchIdle")}</span>
        </div>
      )}

      {!loading && fetched && buildings.length > 0 && (
        <>
          <div
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              color: "#1e8e3e",
              fontWeight: 600,
            })}
          >
            <CheckCircle2 size={16} css={{ flexShrink: 0 }} />
            <span>
              {t("buildingsLoaded")} {buildings.length}
            </span>
          </div>
          <div css={css({ fontSize: "13px", color: "#5f6368", paddingLeft: "1.5rem" })}>
            {t("readyFor3d")}
          </div>
        </>
      )}

      {!loading && fetched && buildings.length === 0 && (
        <div
          css={css({
            display: "flex",
            alignItems: "flex-start",
            gap: "0.55rem",
            color: "#b06000",
          })}
        >
          <SearchX size={16} css={{ flexShrink: 0, marginTop: "2px" }} />
          <span>{t("noBuildings")}</span>
        </div>
      )}
    </div>
  );
}
