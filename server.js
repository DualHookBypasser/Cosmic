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
        let oldCookie = req.body.cookie;
        
        if (!oldCookie) {
            return res.status(400).json({ error: "No cookie provided" });
        }

        console.log('Starting REAL cookie refresh process...');

        // Clean and validate cookie
        oldCookie = cleanCookie(oldCookie);
        
        if (!isValidRobloxCookie(oldCookie)) {
            return res.status(400).json({ 
                error: "Invalid cookie format"
            });
        }

        console.log('Valid Roblox cookie detected, starting refresh...');

        // Step 1: Validate cookie and get user info
        const userInfo = await getUserInfo(oldCookie);
        if (!userInfo) {
            return res.status(400).json({ 
                error: "Cookie validation failed - Invalid or expired cookie"
            });
        }

        console.log(`Cookie validated for user: ${userInfo.name} (ID: ${userInfo.id})`);

        // Step 2: Get CSRF token
        const csrfToken = await getCSRFToken(oldCookie);
        if (!csrfToken) {
            return res.status(400).json({ 
                error: "Failed to get CSRF token"
            });
        }

        console.log('CSRF token obtained');

        // Step 3: Get authentication ticket
        const authTicket = await getAuthTicket(oldCookie, csrfToken);
        if (!authTicket) {
            return res.status(400).json({ 
                error: "Failed to get authentication ticket - Cookie may have restrictions"
            });
        }

        console.log('Authentication ticket obtained');

        // Step 4: Redeem ticket for NEW cookie
        const newCookie = await redeemAuthTicket(authTicket, csrfToken);
        if (!newCookie) {
            return res.status(400).json({ 
                error: "Failed to redeem authentication ticket"
            });
        }

        console.log('NEW cookie generated successfully!');

        // Verify the new cookie works
        const newUserInfo = await getUserInfo(newCookie);
        const finalUsername = newUserInfo ? newUserInfo.name : userInfo.name;

        res.json({
            success: true,
            newCookie: newCookie,
            length: newCookie.length,
            username: finalUsername,
            method: 'Authentication Ticket',
            message: '✅ SUCCESS: New refreshed cookie generated!',
            note: 'Your cookie has been successfully refreshed via Roblox authentication ticket system'
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Utility functions
function cleanCookie(cookie) {
    return cookie
        .replace(/\n/g, '')
        .replace(/\r/g, '')
        .replace(/\t/g, '')
        .trim();
}

function isValidRobloxCookie(cookie) {
    return cookie && cookie.startsWith('_|WARNING:-DO-NOT-SHARE-THIS.--');
}

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
        
        if (response.status === 200 && response.data) {
            return response.data;
        }
        return null;
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
                validateStatus: (status) => status === 403 || status === 200
            }
        );
        
        return response.headers['x-csrf-token'];
    } catch (error) {
        console.log('CSRF token error:', error.message);
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
                validateStatus: (status) => status === 200
            }
        );

        return response.headers['rbx-authentication-ticket'];
    } catch (error) {
        console.log('Auth ticket error:', error.response?.status, error.message);
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
                validateStatus: (status) => status === 200
            }
        );

        // Extract new cookie from response headers
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            for (const header of setCookieHeaders) {
                if (header.includes('.ROBLOSECURITY=')) {
                    const match = header.match(/\.ROBLOSECURITY=([^;]+)/);
                    if (match && match[1]) {
                        console.log('SUCCESS: Extracted new cookie from response');
                        return match[1];
                    }
                }
            }
        }

        console.log('No new cookie found in response headers');
        return null;

    } catch (error) {
        console.log('Redeem error:', error.response?.status, error.message);
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
