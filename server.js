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

        // Clean and validate cookie
        oldCookie = cleanCookie(oldCookie);
        
        if (!isValidCookie(oldCookie)) {
            return res.status(400).json({ 
                error: "Invalid cookie format",
                details: "Make sure you're copying the ENTIRE cookie starting with _|WARNING:-DO-NOT-SHARE-THIS.--"
            });
        }

        // Test if cookie is valid by getting user info first
        const userTest = await testCookieValidity(oldCookie);
        if (!userTest.valid) {
            return res.status(400).json({ 
                error: "Cookie validation failed",
                details: userTest.error
            });
        }

        console.log('Cookie validated for user:', userTest.username);

        // Try refresh methods
        let newCookie = null;
        let methodUsed = '';

        // Method 1: Simple refresh via auth endpoint
        newCookie = await method1SimpleRefresh(oldCookie);
        if (newCookie) methodUsed = 'Simple Refresh';

        // Method 2: Use the original cookie if refresh fails but cookie is valid
        if (!newCookie && userTest.valid) {
            newCookie = oldCookie;
            methodUsed = 'Original (Valid)';
            console.log('Using original cookie as it appears valid');
        }

        if (!newCookie) {
            return res.status(400).json({ 
                error: "Unable to refresh cookie",
                details: "The cookie is valid but refresh methods are blocked. Your original cookie may still work."
            });
        }

        // Verify the new cookie works
        const finalUserCheck = await testCookieValidity(newCookie);
        const finalUsername = finalUserCheck.valid ? finalUserCheck.username : userTest.username;

        res.json({
            success: true,
            newCookie: newCookie,
            length: newCookie.length,
            username: finalUsername,
            method: methodUsed,
            message: `Cookie processed successfully using ${methodUsed} method`
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

function isValidCookie(cookie) {
    const hasWarning = cookie.includes('_|WARNING:-DO-NOT-SHARE-THIS.--');
    const hasReasonableLength = cookie.length > 200 && cookie.length < 5000;
    
    return hasWarning && hasReasonableLength;
}

// Test if cookie is valid by making a simple API call
async function testCookieValidity(cookie) {
    try {
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000,
            validateStatus: () => true
        });

        if (response.status === 200 && response.data && response.data.id) {
            return {
                valid: true,
                username: response.data.name,
                userId: response.data.id
            };
        } else if (response.status === 401) {
            return {
                valid: false,
                error: 'Cookie is expired or invalid'
            };
        } else {
            return {
                valid: false,
                error: `API returned status ${response.status}`
            };
        }
    } catch (error) {
        return {
            valid: false,
            error: `Network error: ${error.message}`
        };
    }
}

// METHOD 1: Simple refresh using economy endpoint
async function method1SimpleRefresh(cookie) {
    try {
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) {
            console.log('Method 1: Failed to get CSRF token');
            return null;
        }

        const response = await axios.get('https://economy.roblox.com/v1/user/currency', {
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'X-CSRF-TOKEN': csrfToken,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            validateStatus: () => true,
            timeout: 10000
        });

        const newCookie = extractCookieFromResponse(response);
        if (newCookie) {
            console.log('Method 1: Successfully refreshed cookie');
            return newCookie;
        }

        return null;
    } catch (error) {
        console.log('Method 1 error:', error.message);
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
                    console.log('Found new cookie in response');
                    return match[1];
                }
            }
        }
    }
    return null;
}

// Start server
if (process.env.VERCEL !== '1') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;
