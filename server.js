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

        console.log('Starting cookie refresh...');

        // Clean the cookie
        oldCookie = cleanCookie(oldCookie);
        
        // STRICT validation - must have the warning header
        if (!oldCookie.includes('_|WARNING:-DO-NOT-SHARE-THIS.--')) {
            return res.status(400).json({ 
                error: "INVALID COOKIE - Missing security header",
                details: "Your cookie MUST start with: _|WARNING:-DO-NOT-SHARE-THIS.--"
            });
        }

        console.log('Valid cookie format detected');

        // Get CSRF token first
        const csrfToken = await getCSRFToken(oldCookie);
        if (!csrfToken) {
            return res.status(400).json({ error: "Failed to get CSRF token" });
        }

        console.log('Got CSRF token');

        // Get authentication ticket
        const authTicket = await getAuthTicket(oldCookie, csrfToken);
        if (!authTicket) {
            return res.status(400).json({ error: "Failed to get authentication ticket" });
        }

        console.log('Got auth ticket');

        // Redeem for new cookie
        const newCookie = await redeemAuthTicket(authTicket, csrfToken);
        if (!newCookie) {
            return res.status(400).json({ error: "Failed to redeem auth ticket" });
        }

        console.log('Got new cookie');

        // Get username
        const username = await getUsername(oldCookie);

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

function cleanCookie(cookie) {
    return cookie.replace(/\s+/g, '').trim();
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
                validateStatus: () => true
            }
        );
        return response.headers['x-csrf-token'];
    } catch (error) {
        throw new Error('CSRF token failed: ' + error.message);
    }
}

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
            throw new Error(`Status ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        throw new Error('Auth ticket failed: ' + error.message);
    }
}

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

        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders) {
            for (const header of setCookieHeaders) {
                if (header.includes('.ROBLOSECURITY=')) {
                    const match = header.match(/\.ROBLOSECURITY=([^;]+)/);
                    if (match && match[1]) {
                        return match[1];
                    }
                }
            }
        }
        throw new Error('No new cookie in response');
    } catch (error) {
        throw new Error('Redeem failed: ' + error.message);
    }
}

async function getUsername(cookie) {
    try {
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return response.data.name || 'Unknown';
    } catch (error) {
        return 'Unknown';
    }
}

if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;
