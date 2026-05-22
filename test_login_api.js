const http = require("http");

const data = JSON.stringify({
  email: "admin@hortifruti.com",
  password: "admin123456"
});

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/auth/login",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length
  }
};

const req = http.request(options, (res) => {
  let body = "";
  console.log(`Status Code: ${res.statusCode}`);
  res.on("data", (chunk) => body += chunk);
  res.on("end", () => {
    console.log("Response Body:", body);
    process.exit(0);
  });
});

req.on("error", (e) => {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
});

req.write(data);
req.end();
