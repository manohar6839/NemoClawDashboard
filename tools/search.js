const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Resolve API Key
let apiKey = process.env.SERPER_API_KEY;

if (!apiKey) {
    // Try reading from .env in parent dir
    try {
        const envPath = path.join(__dirname, '../.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/SERPER_API_KEY=(.+)/);
        if (match) {
            apiKey = match[1].trim();
        }
    } catch (e) {
        // ignore
    }
}

if (!apiKey) {
    console.error("Error: SERPER_API_KEY not found in environment or ../.env");
    process.exit(1);
}

// 2. Parse Query
const query = process.argv[2];
if (!query) {
    console.error("Usage: node search.js <query>");
    process.exit(1);
}

// 3. Make Request
const data = JSON.stringify({
    "q": query
});

const options = {
    hostname: 'google.serper.dev',
    path: '/search',
    method: 'POST',
    headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        try {
            const result = JSON.parse(body);
            // 4. Format Output (Markdown)
            console.log(`# Search Results for "${query}"\n`);
            
            if (result.organic) {
                result.organic.forEach((item, index) => {
                    console.log(`### ${index + 1}. ${item.title}`);
                    console.log(`**Link**: ${item.link}`);
                    console.log(`> ${item.snippet}\n`);
                });
            } else {
              console.log("No organic results found.");
            }
            
            if (result.peopleAlsoAsk) {
                console.log(`## People Also Ask`);
                 result.peopleAlsoAsk.forEach(q => {
                     console.log(`- ${q.question}`);
                 });
            }

        } catch (e) {
            console.error("Failed to parse response:", e);
            console.log("Raw body:", body);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
