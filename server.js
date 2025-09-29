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
        const oldCookie = req.body.cookie?.trim();
        
        if (!oldCookie) {
            return res.status(400).json({ error: "No cookie provided" });
        }

        console.log('Starting authentication process with REAL cookie...');

        // Validate it's a real Roblox cookie
        if (!oldCookie.startsWith('_|WARNING:-DO-NOT-SHARE-THIS.--')) {
            return res.status(400).json({ 
                error: "Invalid cookie format",
                details: "Cookie must start with _|WARNING:-DO-NOT-SHARE-THIS.--"
            });
        }

        console.log('Valid Roblox cookie detected');

        // Step 1: Get user info to validate cookie
        const userInfo = await getUserInfo(oldCookie);
        if (!userInfo) {
            return res.status(400).json({ error: "Cookie is invalid or expired" });
        }

        console.log(`Cookie validated for user: ${userInfo.name}`);

        // Step 2: Get CSRF token
        const csrfToken = await getCSRFToken(oldCookie);
        if (!csrfToken) {
            return res.status(400).json({ error: "Failed to get CSRF token" });
        }

        console.log('CSRF token obtained');

        // Step 3: Get authentication ticket
        const authTicket = await getAuthTicket(oldCookie, csrfToken);
        if (!authTicket) {
            return res.status(400).json({ error: "Failed to get authentication ticket" });
        }

        console.log('Authentication ticket obtained');

        // Step 4: Redeem ticket for new cookie
        const newCookie = await redeemAuthTicket(authTicket, csrfToken);
        if (!newCookie) {
            return res.status(400).json({ error: "Failed to redeem authentication ticket" });
        }

        console.log('NEW cookie generated successfully!');

        res.json({
            success: true,
            newCookie: newCookie,
            length: newCookie.length,
            username: userInfo.name,
            message: '✅ Cookie refreshed successfully via authentication ticket!'
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

// Get user info to validate cookie
async function getUserInfo(cookie) {
    try {
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        console.log('User info error:', error.message);
        return null;
    }
}

// Get CSRF token
async function getCSRFToken(cookie) {
    try {
        const response = await axios.post('https://auth.roblox.com/v2/login', 
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
        return response.headers['x-csrf-token'];
    } catch (error) {
        console.log('CSRF error:', error.message);
        return null;
    }
}

// Get authentication ticket
async function getAuthTicket(cookie, csrfToken) {
    try {
        const response = await axios.post('https://auth.roblox.com/v1/authentication-ticket',
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

        if (response.status === 200) {
            return response.headers['rbx-authentication-ticket'];
        } else {
            console.log('Auth ticket failed:', response.status, response.statusText);
            return null;
        }
    } catch (error) {
        console.log('Auth ticket error:', error.message);
        return null;
    }
}

// Redeem authentication ticket for new cookie
async function redeemAuthTicket(authTicket, csrfToken) {
    try {
        const response = await axios.post('https://auth.roblox.com/v1/authentication-ticket/redeem',
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

        // Extract new cookie from response headers
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            for (const header of setCookieHeaders) {
                if (header.includes('.ROBLOSECURITY=')) {
                    const match = header.match(/\.ROBLOSECURITY=([^;]+)/);
                    if (match && match[1]) {
                        console.log('Successfully extracted new cookie');
                        return match[1];
                    }
                }
            }
        }
        
        console.log('No new cookie found in response');
        return null;
    } catch (error) {
        console.log('Redeem error:', error.message);
        return null;
    }
}

// Start server
if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;
