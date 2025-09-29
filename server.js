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

        // Clean and validate cookie format
        oldCookie = cleanCookie(oldCookie);
        if (!isValidCookie(oldCookie)) {
            return res.status(400).json({ error: "Invalid cookie format" });
        }

        // Step 1: Get CSRF token with better error handling
        const csrfToken = await getCSRFToken(oldCookie);
        if (!csrfToken) {
            return res.status(400).json({ error: "Failed to get CSRF token - Cookie may be invalid or expired" });
        }

        // Step 2: Get authentication ticket with improved headers
        const authTicket = await getAuthenticationTicket(oldCookie, csrfToken);
        if (!authTicket) {
            return res.status(400).json({ error: "Failed to get authentication ticket - Cookie may be invalid or security restrictions are active" });
        }

        // Step 3: Redeem ticket for new cookie
        const newCookie = await redeemAuthTicket(authTicket, csrfToken);
        if (!newCookie) {
            return res.status(400).json({ error: "Failed to redeem authentication ticket" });
        }

        // Get username for display
        const username = await getUsername(oldCookie);

        res.json({
            success: true,
            newCookie: newCookie,
            length: newCookie.length,
            username: username,
            message: 'Cookie refreshed successfully using authentication ticket system'
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Clean cookie function
function cleanCookie(cookie) {
    // Remove any extra spaces, newlines, or invalid characters
    return cookie
        .replace(/\s+/g, '')
        .replace(/\n/g, '')
        .trim();
}

// Validate cookie format
function isValidCookie(cookie) {
    // Check if cookie has the proper format
    return cookie && cookie.length > 100 && cookie.includes('_|WARNING:-DO-NOT-SHARE-THIS.--');
}

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
        
        if (response.status === 403 && response.headers['x-csrf-token']) {
            return response.headers['x-csrf-token'];
        }
        
        // Try alternative endpoint if first one fails
        const altResponse = await axios.post('https://www.roblox.com/favorite/toggle', 
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
        
        return altResponse.headers['x-csrf-token'];
        
    } catch (error) {
        console.error('CSRF token error:', error.message);
        return null;
    }
}

async function getAuthenticationTicket(cookie, csrfToken) {
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
                validateStatus: (status) => status < 500,
                timeout: 15000
            }
        );

        if (response.headers['rbx-authentication-ticket']) {
            return response.headers['rbx-authentication-ticket'];
        }

        console.log('Auth ticket response status:', response.status);
        console.log('Auth ticket response headers:', response.headers);
        
        return null;
    } catch (error) {
        console.error('Auth ticket error:', error.response?.data || error.message);
        return null;
    }
}

async function redeemAuthTicket(authTicket, csrfToken) {
    try {
        const response = await axios.post('https://auth.roblox.com/v1/authentication-ticket/redeem',
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

        console.log('Redeem response status:', response.status);
        console.log('Redeem response headers:', response.headers);

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
        
        console.log('No ROBLOSECURITY cookie found in response');
        return null;
    } catch (error) {
        console.error('Redeem error:', error.response?.data || error.message);
        return null;
    }
}

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
        console.error('Username fetch error:', error.message);
        return 'Unknown';
    }
}

// Start server only if not in Vercel
if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;
