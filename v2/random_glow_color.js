
// Generate a cryptographically secure random 24-bit number
const randomArray = new Uint32Array(1);
crypto.getRandomValues(randomArray);
const randomColor = (randomArray[0] % 0xFFFFFF).toString(16).padStart(6, '0');

// Set the CSS variable dynamically
document.documentElement.style.setProperty('--glow-color', `#${randomColor}`);
