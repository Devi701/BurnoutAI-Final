const http = require('http');

console.log("🔍 Reproducing ERR_INVALID_REDIRECT issue...");

// This simulates the value from your .env file before the fix
const badUrl = " https://burnoutai-final.onrender.com"; // Note the leading space
console.log(`Testing URL with leading space: "${badUrl}"`);

try {
  // Simulate setting the Location header, which Express res.redirect() does internally
  const req = new http.IncomingMessage(null);
  const res = new http.ServerResponse(req);
  
  res.setHeader("Location", badUrl);
  
  console.log("❌ Node.js accepted the header. The BROWSER will reject this with ERR_INVALID_REDIRECT.");
} catch (error) {
  console.log("✅ Node.js threw an error:", error.message);
  console.log("This confirms that the leading space causes a server-side crash or invalid header error.");
}