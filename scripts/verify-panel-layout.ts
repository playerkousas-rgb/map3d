import { SCENE_CLEARANCE, sheetStops } from '../src/utils/panelLayout';

type Check = (condition: boolean, label: string, detail?: string) => void;
export function verifyPanelLayout(ok: Check) {
  const tall = sheetStops(900, 52, 220);
  ok(tall.peek === 220 && tall.half === 414 && tall.full === 732, 'phone sheet reserves actual navigation and scene controls at full stop');
  const small = sheetStops(320, 52, 220);
  ok(small.peek === 152 && small.half === 152 && small.full === 152, 'short viewport clamps all stops instead of producing negative drag offsets');
  const notched = sheetStops(568, 76, 220);
  ok(notched.full === 376, 'measured navigation including notch reduces available sheet height');
  const keyboard = sheetStops(400, 52, 220);
  ok(keyboard.full === 232, 'visual viewport shrink preserves a scene-control clearance');
  const zero = sheetStops(0, 52, 220);
  ok(Object.values(zero).every(value => value === 0), 'empty viewport never produces negative sheet heights');
  ok(Object.values(sheetStops(Number.NaN, 52, 220)).every(value => value === 0), 'non-finite viewport is bounded');
  ok(sheetStops(568, 52, 9999).peek === sheetStops(568, 52, 9999).full, 'oversized requested peek is capped at the full stop');
  ok(sheetStops(568, 52, -1).peek === 0, 'negative requested peek is bounded');
  ok(SCENE_CLEARANCE >= 44 + 28 + 30, 'clearance budgets a 44px control row, wrapped attribution and gaps');
  for (const [height, nav, peek] of [[568, 52, 220], [390, 48, 220], [320, 52, 132],
    [900, 76, 220], [400, 76, 220], [150, 52, 220], [1000, 48, 0], [900, 48, Number.NaN]]) {
    const stops = sheetStops(height, nav, peek);
    const values = [stops.peek, stops.half, stops.full];
    ok(values.every(Number.isFinite) && values.every(value => value >= 0 && Number.isInteger(value)) &&
      stops.peek <= stops.half && stops.half <= stops.full &&
      stops.full <= Math.max(0, height - nav - SCENE_CLEARANCE),
    `ordered finite sheet stops preserve clearance: viewport ${height}, nav ${nav}, peek ${String(peek)}`);
  }
}
