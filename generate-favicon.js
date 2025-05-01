const fs = require('fs');
const { createCanvas } = require('canvas');

// Create a canvas (32x32 pixels)
const canvas = createCanvas(32, 32);
const ctx = canvas.getContext('2d');

// Fill background
ctx.fillStyle = '#0F172A'; // Dark blue background (matches your app theme)
ctx.fillRect(0, 0, 32, 32);

// Add text
ctx.fillStyle = '#FFFFFF'; // White text
ctx.font = 'bold 18px sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('NP', 16, 16);

// Convert to PNG buffer
const buffer = canvas.toBuffer('image/png');

// Save to file
fs.writeFileSync('./client/public/favicon.png', buffer);

console.log('Favicon generated at client/public/favicon.png'); 