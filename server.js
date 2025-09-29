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

        console.log('Starting cookie refresh process...');

        // Clean the cookie
        oldCookie = cleanCookie(oldCookie);
        
        // Validate cookie format
        if (!isValidCookie(oldCookie)) {
            return res.status(400).json({ error: "Invalid cookie format. Make sure it starts with _|WARNING:-DO-NOT-SHARE-THIS.--" });
        }

        // Try multiple methods
        console.log('Trying method 1: Direct refresh...');
        let newCookie = await method1DirectRefresh(oldCookie);
        
        if (!newCookie) {
            console.log('Method 1 failed, trying method 2: Auth ticket...');
            newCookie = await method2AuthTicket(oldCookie);
        }
        
        if (!newCookie) {
            console.log('Method 2 failed, trying method 3: Game join...');
            newCookie = await method3GameJoin(oldCookie);
        }

        if (!newCookie) {
            return res.status(400).json({ error: "All methods failed. The cookie may be invalid, expired, or security restrictions are blocking the refresh." });
        }

        // Get username for display
        const username = await getUsername(newCookie || oldCookie);

        res.json({
            success: true,
            newCookie: newCookie,
            length: newCookie.length,
            username: username,
            message: 'Cookie refreshed successfully!'
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
    return cookie.replace(/\s+/g, '').trim();
}

function isValidCookie(cookie) {
    return cookie && cookie.includes('_|WARNING:-DO-NOT-SHARE-THIS.--');
}

// METHOD 1: Direct refresh using settings endpoint
async function method1DirectRefresh(cookie) {
    try {
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) return null;

        const response = await axios.post('https://accountsettings.roblox.com/v1/email',
            { email: "test@test.com" }, // Dummy data to trigger refresh
            {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                validateStatus: () => true,
                timeout: 10000
            }
        );

        return extractCookieFromResponse(response);
    } catch (error) {
        console.log('Method 1 error:', error.message);
        return null;
    }
}

// METHOD 2: Authentication Ticket (Original method)
async function method2AuthTicket(cookie) {
    try {
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) return null;

        // Get auth ticket
        const authResponse = await axios.post('https://auth.roblox.com/v1/authentication-ticket',
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
                validateStatus: () => true,
                timeout: 15000
            }
        );

        const authTicket = authResponse.headers['rbx-authentication-ticket'];
        if (!authTicket) return null;

        // Redeem ticket
        const redeemResponse = await axios.post('https://auth.roblox.com/v1/authentication-ticket/redeem',
            { authenticationTicket: authTicket },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://www.roblox.com',
                    'Referer': 'https://www.roblox.com/',
                    'X-CSRF-TOKEN': csrfToken,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'RBXAuthenticationNegotiation': '1'
                },
                validateStatus: () => true,
                timeout: 15000
            }
        );

        return extractCookieFromResponse(redeemResponse);
    } catch (error) {
        console.log('Method 2 error:', error.message);
        return null;
    }
}

// METHOD 3: Game join method
async function method3GameJoin(cookie) {
    try {
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) return null;

        const response = await axios.post('https://gamejoin.roblox.com/v1/join-game-instance',
            {
                placeId: 1818, // Welcome to Roblox place
                isTeleport: false,
                gameId: "test-game-id"
            },
            {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'X-CSRF-TOKEN': csrfToken,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                validateStatus: () => true,
                timeout: 10000
            }
        );

        return extractCookieFromResponse(response);
    } catch (error) {
        console.log('Method 3 error:', error.message);
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
                validateStatus: () => true,
                timeout: 10000
            }
        );
        
        return response.headers['x-csrf-token'];
    } catch (error) {
        console.log('CSRF token error:', error.message);
        return null;
    }
}

// Extract cookie from response
function extractCookieFromResponse(response) {
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
        for (const header of setCookieHeaders) {
            if (header.includes('.ROBLOSECURITY=')) {
                const match = header.match(/\.ROBLOSECURITY=([^;]+)/);
                if (match && match[1]) {
                    console.log('Successfully obtained new cookie');
                    return match[1];
                }
            }
        }
    }
    return null;
}

// Get username
async function getUsername(cookie) {
    try {
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        return response.data.name || 'Unknown';
    } catch (error) {
        return 'Unknown';
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
