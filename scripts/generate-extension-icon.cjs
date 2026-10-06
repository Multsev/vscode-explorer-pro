const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256, scale = 8;
const pixels = Buffer.alloc(size * size * 4);
const shapes = [];
function rect(x, y, width, height, color) {
  shapes.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}"/>`);
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  for (let row = y * scale; row < (y + height) * scale; row++) {
    for (let col = x * scale; col < (x + width) * scale; col++) {
      const offset = (row * size + col) * 4;
      pixels.set([...rgb, 255], offset);
    }
  }
}
rect(0, 0, 32, 32, '#008080');
rect(2, 3, 28, 26, '#000000');
rect(3, 4, 26, 24, '#C0C0C0');
rect(3, 4, 26, 1, '#FFFFFF');
rect(3, 5, 1, 22, '#FFFFFF');
rect(28, 5, 1, 23, '#808080');
rect(4, 27, 24, 1, '#808080');
rect(5, 6, 22, 3, '#000080');
rect(6, 7, 2, 1, '#FFFFFF');
rect(24, 7, 2, 1, '#C0C0C0');
rect(5, 10, 22, 15, '#008080');
// Raised yellow folder, with a tab and an inset edge.
rect(8, 13, 8, 3, '#000000');
rect(7, 15, 18, 8, '#000000');
rect(9, 14, 6, 2, '#FFFF80');
rect(8, 16, 16, 6, '#FFFF00');
rect(8, 16, 16, 1, '#FFFFFF');
rect(8, 17, 1, 5, '#FFFF80');
rect(23, 17, 1, 5, '#808000');
rect(9, 21, 14, 1, '#808000');
// Four focus corners keep the silhouette readable at extension-list size.
for (const [x, y, right, bottom] of [[6, 11, false, false], [22, 11, true, false], [6, 23, false, true], [22, 23, true, true]]) {
  rect(x, y, 4, 1, '#FFFFFF');
  rect(right ? x + 3 : x, bottom ? y - 2 : y, 1, 3, '#FFFFFF');
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  label.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([label, data])), 8 + data.length);
  return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
header[8] = 8; header[9] = 6;
const rows = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
const target = path.resolve(__dirname, '../resources');
fs.writeFileSync(path.join(target, 'extension-icon.png'), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))
]));
fs.writeFileSync(path.join(target, 'extension-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 32 32" shape-rendering="crispEdges">${shapes.join('')}</svg>\n`);
console.log('Original Explorer Pro icon generated: 256 × 256 PNG and SVG source.');
