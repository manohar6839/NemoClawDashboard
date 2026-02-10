const { spawn } = require('child_process');
const path = require('path');

console.log("Starting MCP Server test...");

const serverProcess = spawn('npm', ['start'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'inherit']
});

serverProcess.on('error', (err) => {
  console.error("Failed to start process:", err);
  process.exit(1);
});

let buffer = '';

// Send initialize request
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "test-client",
      version: "1.0.0"
    }
  }
};

console.log("Sending initialize request...");
serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');

serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log("Received data:", output);
  
  if (output.includes('"id":1') && output.includes('"result":')) {
      // Sent initialized notification
      serverProcess.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized"
      }) + '\n');

      // Send tools/list request
      console.log("Sending tools/list request...");
      serverProcess.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list"
      }) + '\n');
  }

  if (output.includes('"id":2') && output.includes('"result":')) {
      console.log("✅ Tools list received!");
      console.log(output);
      serverProcess.kill();
      process.exit(0);
  }
});
