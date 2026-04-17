import fs from "node:fs/promises";
import path from "node:path";
import pngToIco from "png-to-ico";

async function generateIconSet(baseDir) {
  const pngFiles = [
    "icon-16x16.png",
    "icon-32x32.png",
    "icon-48x48.png",
    "icon-64x64.png",
    "icon-256x256.png",
  ].map((fileName) => path.join(baseDir, fileName));

  const outputPath = path.join(baseDir, "icon.ico");
  const iconBuffer = await pngToIco(pngFiles);
  await fs.writeFile(outputPath, iconBuffer);
  return outputPath;
}

async function main() {
  const root = process.cwd();
  const windowsSets = [
    path.join(root, "public/assets/red-set/windows"),
    path.join(root, "public/assets/green-set/windows"),
  ];

  for (const setPath of windowsSets) {
    const outputPath = await generateIconSet(setPath);
    console.log(`Generated ${outputPath}`);
  }
}

await main();
