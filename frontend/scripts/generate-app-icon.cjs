/* global __dirname */
// Preserve the supplied logo's alpha exactly; only tint and compose the icon.
const path = require('node:path');
const Jimp = require('jimp-compact');
async function main() {
  const root = path.resolve(__dirname, '..');
  const source = await Jimp.read(
    path.join(root, 'assets/brand/egofocus-logo.png'),
  );
  const logo = source
    .crop(224, 250, 800, 800)
    .resize(700, 700, Jimp.RESIZE_BICUBIC);
  logo.scan(0, 0, 700, 700, function (x, y, i) {
    this.bitmap.data[i] = 103;
    this.bitmap.data[i + 1] = 223;
    this.bitmap.data[i + 2] = 178;
  });
  const icon = new Jimp(1024, 1024, '#080e0d');
  icon.scan(0, 0, 1024, 1024, function (x, y, i) {
    const glow = Math.exp(-(((x - 420) / 490) ** 2 + ((y - 300) / 490) ** 2));
    this.bitmap.data[i] = Math.round(8 + glow * 8);
    this.bitmap.data[i + 1] = Math.round(14 + glow * 31);
    this.bitmap.data[i + 2] = Math.round(13 + glow * 22);
    this.bitmap.data[i + 3] = 255;
  });
  icon.composite(logo, 162, 162);
  await icon.writeAsync(path.join(root, 'assets/brand/app-icon.png'));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
