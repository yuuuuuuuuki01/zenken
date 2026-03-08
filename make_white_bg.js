const Jimp = require('jimp');

async function main() {
    console.log("Loading transparent logo...");
    const logo = await Jimp.read('c:/agent/gigacompute/branding/logo-transparent.png');

    // Create new white image (same size as logo)
    console.log(`Creating white background ${logo.bitmap.width}x${logo.bitmap.height}...`);
    const bg = new Jimp(logo.bitmap.width, logo.bitmap.height, 0xFFFFFFFF);

    // Composite logo on top of white bg
    bg.composite(logo, 0, 0);

    const outPath = 'c:/agent/gigacompute/demander/frontend/branding/logo-white.png';
    await bg.writeAsync(outPath);
    console.log("Saved white bg logo to", outPath);
}

main().catch(console.error);
