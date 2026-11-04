import { css } from "@emotion/react";
import { SUBTITLE_COLOR } from "@/theme/color";

export function Title({ children, as: Tag = "h2" }: { children?: React.ReactNode; as?: "h1" | "h2" }) {
  return (
    <Tag
      css={css({
        margin: 0,
        color: SUBTITLE_COLOR,
        fontSize: "1.125rem",
        fontWeight: "600",
      })}
    >
      {children}
    </Tag>
  );
}
