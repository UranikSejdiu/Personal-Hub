import Svg, { Path, Rect, Circle } from "react-native-svg";
import type { AppIconProps } from "./AppIcons";

export function AttachmentIcon({ name, size = 22, color = "currentColor" }: AppIconProps & {
  name: "image" | "camera" | "audio" | "file" | "play" | "pause" | "stop";
}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {name === "image" && <><Rect x={3} y={3} width={18} height={18} rx={4} /><Circle cx={8} cy={8} r={1.5} /><Path d="m3 17 5-5 4 4 4-6 5 7" /></>}
    {name === "camera" && <><Path d="M8 5 9.5 3h5L16 5h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><Circle cx={12} cy={13} r={4} /></>}
    {name === "audio" && <><Rect x={9} y={2} width={6} height={12} rx={3} /><Path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>}
    {name === "file" && <Path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7a7 7 0 0 1 10 10l-6 6" />}
    {name === "play" && <Path d="m8 4 12 8-12 8Z" />}
    {name === "pause" && <Path d="M8 5v14M16 5v14" />}
    {name === "stop" && <Rect x={5} y={5} width={14} height={14} rx={2} />}
  </Svg>;
}
