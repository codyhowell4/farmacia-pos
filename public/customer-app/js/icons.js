// ============================================================
// Line icons instead of emoji (2026-11-25)
// The app's older screens use emoji as icons (menu, shop, tabs, cards).
// This module swaps every emoji in rendered UI text for a matching
// stroke icon in the style of the App Apolo mockup (24×24, 2px stroke,
// round caps). It watches the DOM, so old and new screens, modals and
// toasts all get the same icons without editing ~670 templates.
//   · An emoji that is the whole content of its element (an icon tile)
//     becomes a white icon on dark/colored tiles, navy on light ones.
//   · An emoji inline with text takes the text color.
//   · Inputs, selects/options, textareas, <svg> and [data-keep-emoji]
//     are never touched.
// ============================================================

const P = {
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  steth: '<path d="M6 3v6a6 6 0 0 0 12 0V3"/><path d="M12 15v2a4 4 0 0 0 8 0v-2"/><circle cx="20" cy="13" r="2"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  run: '<circle cx="13" cy="4" r="1.5"/><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 2 3 3 1"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  dumbbell: '<path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  drop: '<path d="M12 2.7C9 7 6 10.3 6 14a6 6 0 0 0 12 0c0-3.7-3-7-6-11.3z"/>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9a4 4 0 0 1 8 0z"/>',
  hospital: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 7v6M9 10h6M9 21v-4h6v4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  bellOff: '<path d="M8.7 3.4A6 6 0 0 1 18 8c0 3 .7 5 1.5 6.3M6 8c0 7-3 8-3 8h13M10 20a2 2 0 0 0 4 0M2 2l20 20"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 4 7"/>',
  doctor: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0M12 15v4M10 17h4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  syringe: '<path d="M18 2l4 4M17 7l3-3M19 9L9 19H5v-4L15 5zM11 11l2 2M8 14l2 2"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3L2 6M19 3l3 3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  pulse: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/><path d="M3.5 12h4l2-3 3 6 2-3h6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12A9 9 0 0 1 18.5 5.8L21 8M21 3v5h-5M3 21v-5h5"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.2A8 8 0 1 1 21 12z"/>',
  pin: '<path d="M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  food: '<path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7M12 17h.01"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  thermo: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
  pencil: '<path d="M17 3l4 4L8 20H4v-4z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-10-1 10-4 16-10 16M4 21c3-5 6-8 10-10"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  feet: '<path d="M8 15c-2 0-3-2-3-5s1-6 3-6 3 3 3 6-1 5-3 5zM8 15v5M16 19c-2 0-3-2-3-5s1-6 3-6 3 3 3 6-1 5-3 5zM16 19v2"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.2 13.9L7 22l5-3 5 3-1.2-8.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  micro: '<path d="M6 18h8M3 22h18M14 22a7 7 0 1 0 0-14h-1M9 14h2M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2zM12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2M10 2h4"/>',
  truck: '<rect x="1" y="4" width="14" height="12" rx="1"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 21h14M12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
  chair: '<path d="M7 3h10v9H7zM5 12h14M7 12v9M17 12v9"/>',
  trendDown: '<path d="M22 17l-8.5-8.5-5 5L2 7M16 17h6v-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bone: '<path d="M17 10l-7 7a2.8 2.8 0 1 1-4-2.4 2.8 2.8 0 1 1 2.4-4l7-7a2.8 2.8 0 1 1 4 2.4 2.8 2.8 0 1 1-2.4 4z"/>',
  ribbon: '<path d="M12 3a4 4 0 0 0-3 6.7L5 21l4-2 3 3 3-3 4 2-4-11.3A4 4 0 0 0 12 3z"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2M6 11v2"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zM12 8c2-4 6-4 6-1s-6 1-6 1z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h2"/>',
  waves: '<path d="M2 6c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 12c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 18c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2"/>',
  film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21a2 2 0 0 1 0-4h2a2 2 0 0 0 0-4"/>',
  door: '<path d="M3 21h18M6 21V3h12v18M14 12h.01"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  flower: '<circle cx="12" cy="12" r="3"/><path d="M12 2a3 3 0 0 1 0 7 3 3 0 0 1 0-7zM12 15a3 3 0 0 1 0 7 3 3 0 0 1 0-7zM2 12a3 3 0 0 1 7 0 3 3 0 0 1-7 0zM15 12a3 3 0 0 1 7 0 3 3 0 0 1-7 0z"/>',
  ear: '<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  meh: '<circle cx="12" cy="12" r="9"/><path d="M8 15h8M9 9h.01M15 9h.01"/>',
  frown: '<circle cx="12" cy="12" r="9"/><path d="M16 16s-1.5-2-4-2-4 2-4 2M9 9h.01M15 9h.01"/>',
  think: '<circle cx="12" cy="12" r="9"/><path d="M9 16h6M9 9h.01M15 9h.01M14 6l2-1"/>',
  sofa: '<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3M2 11a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v6H2zM4 17v2M20 17v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  home: '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.8 1.2 2.8 2.8 0 0 0-1.9-1.9A3.5 3.5 0 0 1 4 14.5 4.5 4.5 0 0 1 9 10z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  vibrate: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 8v8M21 8v8"/>',
  tv: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>',
  signal: '<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>',
  magnet: '<path d="M6 15A6 6 0 0 0 18 15V4h-4v11a2 2 0 0 1-4 0V4H6zM6 8h4M14 8h4"/>',
  lungs: '<path d="M12 4v8M12 12l-3-2M12 12l3-2M8.5 6C6 6 3 11 3 17a2 2 0 0 0 2.5 2c2-.5 4.5-2 4.5-6V8M15.5 6C18 6 21 11 21 17a2 2 0 0 1-2.5 2c-2-.5-4.5-2-4.5-6V8"/>',
  bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4M8 4h8M9 14h.01M15 14h.01"/>',
  baby: '<circle cx="12" cy="10" r="7"/><path d="M9 11h.01M15 11h.01M10 14.5c1 .7 3 .7 4 0M12 3c-1 1-1 2 0 3"/>',
  egg: '<path d="M12 22c4 0 7-3 7-8S15.5 2 12 2 5 9 5 14s3 8 7 8z"/>',
  apple: '<path d="M12 7c-2-2-7-2-7 4s4 11 7 9c3 2 7-3 7-9s-5-6-7-4zM12 7c0-2 1-4 3-4"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
  ticket: '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  scissor: '<path d="M18 6L6 18M6 6l12 12"/>',
};

// Emoji → icon. Unlisted pictographs fall back to a neutral dot icon so no
// emoji is left as an icon.
const MAP = {
  '💊': 'pill', '✅': 'check', '✔️': 'check', '🩺': 'steth', '⚠️': 'alert', '⚠': 'alert', '🚨': 'siren', '🏃': 'run', '🚶': 'run',
  '📋': 'clipboard', '⏳': 'hourglass', '⌛': 'hourglass', '🛒': 'cart', '💪': 'dumbbell', '🏋️': 'dumbbell', '📦': 'box', '📷': 'camera',
  '📸': 'camera', '🔒': 'lock', '🔐': 'lock', '📊': 'chart', '📈': 'chart', '📉': 'trendDown', '💡': 'bulb', '💧': 'drop', '🩸': 'drop',
  '⚖️': 'scale', '🏥': 'hospital', '📞': 'phone', '📱': 'phone', '☎️': 'phone', '🔔': 'bell', '🔕': 'bellOff', '📅': 'cal', '📆': 'cal',
  '🗓️': 'cal', '🔥': 'flame', '👤': 'user', '👨': 'user', '👩': 'user', '👦': 'user', '👧': 'user', '👴': 'user', '👵': 'user',
  '🙋': 'hand', '👋': 'hand', '👨‍⚕️': 'doctor', '👩‍⚕️': 'doctor', '⚕️': 'steth', '👨‍👩‍👧‍👦': 'users', '👨‍👩‍👧': 'users', '🤝': 'users',
  '🎯': 'target', '💉': 'syringe', '⏰': 'alarm', '⏱️': 'timer', '🕐': 'clock', '❤️': 'heart', '❤': 'heart', '💓': 'pulse', '🫀': 'pulse',
  '📄': 'file', '📝': 'note', '📃': 'file', '📏': 'ruler', '😴': 'moon', '🌙': 'moon', '📚': 'book', '📖': 'book', '🔄': 'refresh',
  '📹': 'video', '🎬': 'film', '⭐': 'star', '🌟': 'star', '✨': 'sparkle', '💬': 'chat', '📍': 'pin', '💳': 'card', '💵': 'cash',
  '🍽️': 'food', '🥗': 'leaf', '🥑': 'apple', '🍎': 'apple', '🥚': 'egg', '🍳': 'egg', '🥩': 'food', '🍗': 'food', '🍚': 'food', '🌮': 'food',
  '🫘': 'food', '🥛': 'drop', '❓': 'help', '❔': 'help', '❌': 'x', '✖': 'x', '✖️': 'x', '🌡️': 'thermo', '✏️': 'pencil', '🖊️': 'pen',
  '✍️': 'pen', '🔍': 'search', '🔎': 'search', '🎤': 'mic', '⚙️': 'gear', '👣': 'feet', '👟': 'feet', '💨': 'wind', '🫁': 'lungs',
  '🗑️': 'trash', '🏅': 'award', '🏆': 'trophy', '🎖️': 'award', '👶': 'baby', '🧘': 'wind', 'ℹ️': 'info', '🔬': 'micro', '📁': 'folder',
  '📂': 'folder', '📎': 'link', '🔗': 'link', '🚚': 'truck', '📤': 'upload', '🌿': 'leaf', '🌸': 'flower', '⚧': 'user', '🪑': 'chair',
  '🦴': 'bone', '🎀': 'ribbon', '🔋': 'battery', '🔑': 'key', '📧': 'mail', '✉️': 'mail', '🌐': 'globe', '🏢': 'building', '🏠': 'home',
  '➕': 'plus', '⚡': 'zap', '🎁': 'gift', '⏹️': 'stop', '🚴': 'bike', '🏊': 'waves', '🛡️': 'shield', '🎨': 'palette', '🚪': 'door',
  '🖨️': 'printer', '👂': 'ear', '🤔': 'think', '😕': 'frown', '😐': 'meh', '😊': 'smile', '😍': 'smile', '🙂': 'smile', '😟': 'frown',
  '🛋️': 'sofa', '🤖': 'bot', '➤': 'play', '▶️': 'play', '🎟️': 'ticket', '🐶': 'paw', '🐱': 'paw', '📳': 'vibrate', '📺': 'tv',
  '📶': 'signal', '🧲': 'magnet', '🩹': 'plus', '🧴': 'drop', '🧪': 'micro', '🌱': 'leaf', '😀': 'smile', '😢': 'frown',
};
const FALLBACK = '<circle cx="12" cy="12" r="4"/>';

const EMOJI_RE = /(?:\p{Extended_Pictographic}|ℹ)(?:️|‍(?:\p{Extended_Pictographic})️?)*/gu;
// Typographic marks stay as text (arrows, check/cross marks used in copy).
const KEEP = new Set(['✓', '✕', '→', '←', '↑', '↓', '©', '®', '™', '•', '↗']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'TITLE', 'NOSCRIPT']);

function svgFor(emoji, color) {
  const key = MAP[emoji] ? emoji : MAP[emoji.replace(/️/g, '')] ? emoji.replace(/️/g, '') : null;
  const paths = key ? P[MAP[key]] : FALLBACK;
  return `<svg class="apolo-ico" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// Background of the nearest painted ancestor → dark? (white icon) / light (navy icon)
function isDarkBackground(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const img = cs.backgroundImage;
    let c = null;
    if (img && img !== 'none') { const m = img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i); if (m) c = m[0]; }
    if (!c && cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) c = cs.backgroundColor;
    if (!c) continue;
    const rgb = toRgb(c);
    if (!rgb || rgb[3] < 0.35) continue;
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum < 0.55;
  }
  return false;
}
function toRgb(c) {
  let m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
  m = c.match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
}

function shouldSkip(node) {
  for (let n = node.parentElement; n; n = n.parentElement) {
    if (SKIP_TAGS.has(n.tagName.toUpperCase()) || n.isContentEditable || n.hasAttribute('data-keep-emoji')) return true;
  }
  return false;
}

function processTextNode(t) {
  const text = t.nodeValue;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(text)) return;
  if (shouldSkip(t)) return;
  const parent = t.parentElement;
  const standalone = text.trim().replace(EMOJI_RE, '').trim() === '' && parent && parent.childNodes.length === 1;
  const color = standalone ? (isDarkBackground(parent) ? '#FFFFFF' : '#1E2A8A') : null;
  const frag = document.createDocumentFragment();
  let last = 0;
  EMOJI_RE.lastIndex = 0;
  let m;
  while ((m = EMOJI_RE.exec(text))) {
    if (KEEP.has(m[0])) continue;
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'apolo-ico-wrap';
    span.innerHTML = svgFor(m[0], color);
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last === 0) return;
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  t.replaceWith(frag);
}

// ── Contrast guard ─────────────────────────────────────────────
// Older screens were built for a dark "glass" theme and set white text
// inline; on today's light backgrounds that text disappears. Any element
// whose inline color is near-white while its real background is light
// gets the mockup ink color (or muted ink for faded text); faded glass
// buttons/chips become white cards. Text on dark/gradient backgrounds
// and images is left alone.
const INK = '#141B3A', INK_MUTED = '#4A5578';
function lightBackground(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n.tagName === 'IMG' || n.tagName === 'VIDEO') return false;
    const cs = getComputedStyle(n);
    const img = cs.backgroundImage;
    if (img && img !== 'none') {
      if (/url\(/.test(img)) return false;
      const m = img.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i);
      const rgb = m && toRgb(m[0]);
      if (rgb && rgb[3] >= 0.35) return lum(rgb) > 0.7;
    }
    const rgb = toRgb(cs.backgroundColor || '');
    if (rgb && rgb[3] >= 0.35) return lum(rgb) > 0.7;
  }
  return true;
}
const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
function fixContrast(root) {
  if (!root || root.nodeType !== 1) return;
  const els = [root, ...root.querySelectorAll('[style*="color"]')];
  els.forEach((el) => {
    const inline = el.getAttribute && el.getAttribute('style');
    if (!inline || !/(^|;)\s*color\s*:\s*(white|#fff\b|#ffffff|rgba?\(\s*255\s*,\s*255\s*,\s*255)/i.test(inline)) return;
    if (el.closest('svg, [data-keep-color]')) return;
    const cs = getComputedStyle(el);
    const c = toRgb(cs.color);
    if (!c || lum(c) < 0.85) return;
    if (!lightBackground(el)) return;
    el.style.color = c[3] < 0.8 || parseFloat(cs.opacity) < 0.85 ? INK_MUTED : INK;
    if (el.tagName === 'BUTTON') {
      const bg = toRgb(cs.backgroundColor || '');
      if (!bg || bg[3] < 0.35) { el.style.background = '#FFFFFF'; el.style.border = '1px solid #E3E8F2'; }
    }
  });
}

export function iconize(root) {
  if (!root) return;
  if (root.nodeType === 3) { processTextNode(root); return; }
  if (root.nodeType !== 1 || SKIP_TAGS.has(root.tagName.toUpperCase())) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(processTextNode);
}

let pending = new Set();
let scheduled = false;
function flush() {
  scheduled = false;
  const list = [...pending];
  pending = new Set();
  list.forEach((n) => { if (n.isConnected) { iconize(n); fixContrast(n.nodeType === 1 ? n : n.parentElement); } });
}
export function startIconizer() {
  if (window.__apoloIconizer) return;
  window.__apoloIconizer = true;
  const style = document.createElement('style');
  style.textContent = '.apolo-ico-wrap{display:inline-flex;align-items:center;justify-content:center;line-height:1;vertical-align:-0.15em}.apolo-ico{flex-shrink:0}';
  document.head.appendChild(style);
  iconize(document.body);
  fixContrast(document.body);
  new MutationObserver((muts) => {
    muts.forEach((mu) => {
      if (mu.type === 'characterData') pending.add(mu.target);
      mu.addedNodes.forEach((n) => pending.add(n));
    });
    if (!scheduled && pending.size) { scheduled = true; requestAnimationFrame(flush); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
