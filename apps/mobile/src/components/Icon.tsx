import Svg, { Circle, Path } from "react-native-svg";

// Iconografía propia en SVG (react-native-svg ya es dependencia): glifos
// geométricos de trazo, 18-20 px, como pide el handoff. Se dibujan aquí en vez
// de añadir un paquete de iconos para no arrastrar fuentes de ~2 MB al bundle.
export type IconName =
  | "activity"
  | "calendar"
  | "clock"
  | "wallet"
  | "chart"
  | "users"
  | "user"
  | "box"
  | "building"
  | "bell"
  | "star"
  | "clipboard"
  | "grid"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "plus"
  | "minus"
  | "check"
  | "close"
  | "search"
  | "camera"
  | "trash"
  | "alert"
  | "eye"
  | "calendar-plus";

const PATHS: Record<IconName, string[]> = {
  activity: ["M3 12h4l2.5-7 4 14 2.5-7H21"],
  calendar: ["M4 6.5h16v14H4z", "M4 10.5h16", "M8.5 3.5v4", "M15.5 3.5v4"],
  clock: ["M12 7v5.2l3.2 2"],
  wallet: ["M3.5 7.5h14A2.5 2.5 0 0 1 20 10v8.5H6a2.5 2.5 0 0 1-2.5-2.5z", "M3.5 7.5A2 2 0 0 1 5.5 5.5H16", "M15.5 13h4.5"],
  chart: ["M4 20V12", "M10 20V4", "M16 20v-6", "M21 20H3"],
  users: ["M2.5 20c0-3 2.6-4.6 6-4.6s6 1.6 6 4.6", "M16.5 15.8c2.7.4 4.5 2 4.5 4.2"],
  user: ["M4.5 20.5c0-3.6 3.2-5.6 7.5-5.6s7.5 2 7.5 5.6"],
  box: ["M12 3.2 20.5 8v8L12 20.8 3.5 16V8z", "M3.5 8 12 12.7 20.5 8", "M12 12.7v8.1"],
  building: ["M5 21V4.5h14V21", "M9 8.5h2M13 8.5h2M9 12.5h2M13 12.5h2", "M10 21v-4.5h4V21"],
  // El cuerpo, la base y el badajo por separado: en un único trazo la base se
  // dibujaba dos veces encima de sí misma (`H4.5h15`) y quedaba más gruesa que
  // el resto del glifo.
  bell: ["M6.5 17.5V11a5.5 5.5 0 1 1 11 0v6.5", "M4.5 17.5h15", "M10 20.5h4"],
  star: ["m12 3.8 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 10l5.9-.9z"],
  clipboard: ["M9 4.5H7A1.5 1.5 0 0 0 5.5 6v13A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-2", "M9 3.5h6v3H9z", "M9 11h6M9 15h4"],
  grid: ["M4 7.5h16M4 12h16M4 16.5h16", "M8 5.5v13"],
  "chevron-left": ["m14.5 5.5-7 6.5 7 6.5"],
  "chevron-right": ["m9.5 5.5 7 6.5-7 6.5"],
  "chevron-down": ["m5.5 9.5 6.5 7 6.5-7"],
  plus: ["M12 5v14M5 12h14"],
  minus: ["M5 12h14"],
  check: ["m4.5 12.5 5 5 10-11"],
  close: ["M6 6l12 12M18 6 6 18"],
  search: ["M20.5 20.5 16 16"],
  camera: ["M3.5 8.5h3.2l1.6-2.4h7.4l1.6 2.4h3.2v11H3.5z"],
  trash: ["M5 7h14", "M9 7V4.5h6V7", "M6.5 7l1 13h9l1-13", "M10 10.5v6.5M14 10.5v6.5"],
  alert: ["M12 4 2.8 20h18.4z", "M12 10v4.5M12 17.4v.2"],
  eye: ["M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12"],
  "calendar-plus": ["M4 6.5h16v14H4z", "M4 10.5h16", "M8.5 3.5v4", "M15.5 3.5v4", "M12 13v5M9.5 15.5h5"],
};

const CIRCLES: Partial<Record<IconName, { cx: number; cy: number; r: number }[]>> = {
  clock: [{ cx: 12, cy: 12, r: 8.5 }],
  users: [
    { cx: 8.5, cy: 8.5, r: 3.4 },
    { cx: 16.5, cy: 9.5, r: 2.6 },
  ],
  user: [{ cx: 12, cy: 8.5, r: 4 }],
  search: [{ cx: 10.5, cy: 10.5, r: 6 }],
  camera: [{ cx: 12, cy: 14, r: 3.6 }],
  eye: [{ cx: 12, cy: 12, r: 2.6 }],
};

export function Icon({
  name,
  size = 20,
  color,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {(CIRCLES[name] ?? []).map((c, i) => (
        <Circle key={`c${i}`} cx={c.cx} cy={c.cy} r={c.r} stroke={color} strokeWidth={strokeWidth} />
      ))}
      {PATHS[name].map((d, i) => (
        <Path key={`p${i}`} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
