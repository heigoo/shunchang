import qrcode from 'qrcode-generator';

export interface QrResult {
  svg: string;
  modules: number;
}

interface QrMatrix {
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

const QUIET_ZONE = 4;
const DEFAULT_DARK = '#000000';
const DEFAULT_LIGHT = '#FFFFFF';

function buildModulesPath(matrix: QrMatrix, count: number): string {
  let data = '';

  for (let row = 0; row < count; row += 1) {
    let col = 0;
    while (col < count) {
      if (!matrix.isDark(row, col)) {
        col += 1;
        continue;
      }

      let end = col + 1;
      while (end < count && matrix.isDark(row, end)) {
        end += 1;
      }

      const length = end - col;
      data += `M${col} ${row}h${length}v1h-${length}z`;
      col = end;
    }
  }

  return data;
}

export function generateQrSvg(
  value: string,
  dark: string = DEFAULT_DARK,
  light: string = DEFAULT_LIGHT,
): QrResult {
  const code = qrcode(0, 'M');
  code.addData(value);
  code.make();

  const matrix = code as unknown as QrMatrix;
  const count = matrix.getModuleCount();
  const span = count + QUIET_ZONE * 2;
  const path = buildModulesPath(matrix, count);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-QUIET_ZONE} ${-QUIET_ZONE} ${span} ${span}" shape-rendering="crispEdges">` +
    `<rect x="${-QUIET_ZONE}" y="${-QUIET_ZONE}" width="${span}" height="${span}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    '</svg>';

  return { svg, modules: count };
}
