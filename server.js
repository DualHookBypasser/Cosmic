import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// API endpoint
app.post('/refresh', async (req, res) => {
    try {
        let cookie = req.body.cookie;
        
        if (!cookie) {
            return res.status(400).json({ error: "No cookie provided" });
        }

        console.log('Starting cookie refresh process...');

        // Clean the cookie
        cookie = cookie.trim();

        // Validate it's a REAL Roblox cookie
        if (!cookie.startsWith('_|WARNING:-DO-NOT-SHARE-THIS.--')) {
            return res.status(400).json({ 
                error: "INVALID COOKIE FORMAT",
                details: "Your cookie MUST start with: _|WARNING:-DO-NOT-SHARE-THIS.--"
            });
        }

        console.log('Valid cookie detected, starting authentication process...');

        // Step 1: Get CSRF token
        const csrfResponse = await axios.post('https://auth.roblox.com/v2/login', 
            {},
            {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                validateStatus: () => true
            }
        );
        
        const csrfToken = csrfResponse.headers['x-csrf-token'];
        if (!csrfToken) {
            return res.status(400).json({ error: "Failed to get CSRF token" });
        }

        console.log('CSRF token obtained');

        // Step 2: Get authentication ticket
        const ticketResponse = await axios.post('https://auth.roblox.com/v1/authentication-ticket',
            {},
            {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken,
                    'Content-Type': 'application/json',
                    'Origin': 'https://www.roblox.com',
                    'Referer': 'https://www.roblox.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'RBXAuthenticationNegotiation': '1'
                },
                validateStatus: () => true
            }
        );

        if (ticketResponse.status !== 200) {
            return res.status(400).json({ 
                error: "Authentication failed",
                details: `Roblox returned status ${ticketResponse.status}. Your cookie may be expired.`
            });
        }

        const authTicket = ticketResponse.headers['rbx-authentication-ticket'];
        if (!authTicket) {
            return res.status(400).json({ error: "No authentication ticket received" });
        }

        console.log('Authentication ticket obtained');

        // Step 3: Redeem ticket for new cookie
        const redeemResponse = await axios.post('https://auth.roblox.com/v1/authentication-ticket/redeem',
            {
                authenticationTicket: authTicket
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://www.roblox.com',
                    'Referer': 'https://www.roblox.com/',
                    'X-CSRF-TOKEN': csrfToken,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'RBXAuthenticationNegotiation': '1'
                },
                validateStatus: () => true
            }
        );

        // Extract new cookie from response
        const setCookieHeaders = redeemResponse.headers['set-cookie'];
        let newCookie = null;
        
        if (setCookieHeaders) {
            for (const header of setCookieHeaders) {
                if (header.includes('.ROBLOSECURITY=')) {
                    const match = header.match(/\.ROBLOSECURITY=([^;]+)/);
                    if (match && match[1]) {
                        newCookie = match[1];
                        break;
                    }
                }
            }
        }

        if (!newCookie) {
            return res.status(400).json({ error: "Failed to get new cookie from response" });
        }

        console.log('New cookie generated successfully!');

        // Get username for display
        const userResponse = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const username = userResponse.data.name || 'Unknown';

        res.json({
            success: true,
            newCookie: newCookie,
            length: newCookie.length,
            username: username,
            message: '✅ Cookie refreshed successfully!'
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;
