const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 256, scale = 4, highSize = size * scale;
const highPixels = Buffer.alloc(highSize * highSize * 4);
const pixels = Buffer.alloc(size * size * 4);
const shapes = [];
function rect(x, y, width, height, color, radius = 0) {
  shapes.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${color}"/>`);
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  for (let row = y * scale; row < (y + height) * scale; row++) {
    for (let col = x * scale; col < (x + width) * scale; col++) {
      const px = (col + 0.5) / scale, py = (row + 0.5) / scale;
      const cx = Math.max(x + radius, Math.min(px, x + width - radius));
      const cy = Math.max(y + radius, Math.min(py, y + height - radius));
      if (radius && (px - cx) ** 2 + (py - cy) ** 2 > radius ** 2) continue;
      highPixels.set([...rgb, 255], (row * highSize + col) * 4);
    }
  }
}
// Original artwork: a blue folder and four focus corners on a dark rounded tile.
rect(0, 0, 256, 256, '#18232E', 44);
rect(56, 80, 78, 48, '#379FE8', 10);
rect(56, 98, 144, 83, '#379FE8', 10);
rect(52, 112, 152, 80, '#007ACC', 12);
rect(70, 135, 76, 7, '#72C5FF', 3);
rect(70, 151, 48, 7, '#72C5FF', 3);
for (const [x, y, right, bottom] of [[32, 54, false, false], [190, 54, true, false], [32, 202, false, true], [190, 202, true, true]]) {
  rect(x, y, 34, 6, '#EAF6FF', 3);
  rect(right ? x + 28 : x, bottom ? y - 28 : y, 6, 34, '#EAF6FF', 3);
}
// Supersampling preserves smooth edges at small extension-list sizes.
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const sums = [0, 0, 0, 0];
  for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
    const offset = ((y * scale + dy) * highSize + x * scale + dx) * 4;
    for (let channel = 0; channel < 4; channel++) sums[channel] += highPixels[offset + channel];
  }
  const alpha = sums[3];
  const offset = (y * size + x) * 4;
  for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = alpha ? Math.round(sums[channel] * 255 / alpha) : 0;
  pixels[offset + 3] = Math.round(alpha / (scale * scale));
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
fs.writeFileSync(path.join(target, 'extension-icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${shapes.join('')}</svg>\n`);
console.log('Original Explorer Pro icon generated: 256 × 256 PNG and SVG source.');
