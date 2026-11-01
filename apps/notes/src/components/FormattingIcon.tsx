import Svg, { Path } from "react-native-svg";
import type { AppIconProps } from "./AppIcons";

export type FormattingIconName = "bold" | "italic" | "strikethrough" | "bullet" | "numbered" | "checklist" | "done";

/** One optical size and stroke weight for the editor's formatting controls. */
export function FormattingIcon({ name, size = 22, color = "currentColor" }: AppIconProps & { name: FormattingIconName }) {
  const paths: Record<FormattingIconName, string> = {
    bold: "M6 4h7a4 4 0 0 1 0 8H6m0-8v16h8a4 4 0 0 0 0-8H6",
    italic: "M10 4h10M4 20h10M15 4 9 20",
    strikethrough: "M17 6c-1-2-3-3-5-3-3 0-5 1.5-5 4 0 1 .5 2 1.5 2.5M4 12h16m-9 2c4 .5 6 1 6 3.5S15 21 12 21c-2.5 0-4.5-1-5.5-3",
    bullet: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
    numbered: "M10 6h10M10 12h10M10 18h10M4 3h1v6M3.5 9h3M3 14c0-2 4-2 4 0 0 1-4 3-4 5h4",
    checklist: "m3 5 2 2 3-4m3 3h10M3 13l2 2 3-4m3 3h10M3 21l2 2 3-4m3 3h10",
    done: "m5 12 4 4L19 6",
  };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d={paths[name]} />
  </Svg>;
}
