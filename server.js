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

        // Try ACTUAL refresh methods
        let newCookie = null;
        let methodUsed = '';

        // Method 1: ACTUAL Authentication Ticket Refresh
        newCookie = await method1AuthTicketRefresh(oldCookie);
        if (newCookie && newCookie !== oldCookie) {
            methodUsed = 'Auth Ticket Refresh';
            console.log('Successfully generated NEW cookie via auth ticket');
        }

        // Method 2: Game Join Method (Alternative)
        if (!newCookie || newCookie === oldCookie) {
            newCookie = await method2GameJoinRefresh(oldCookie);
            if (newCookie && newCookie !== oldCookie) {
                methodUsed = 'Game Join Refresh';
                console.log('Successfully generated NEW cookie via game join');
            }
        }

        // Method 3: Legacy Method
        if (!newCookie || newCookie === oldCookie) {
            newCookie = await method3LegacyRefresh(oldCookie);
            if (newCookie && newCookie !== oldCookie) {
                methodUsed = 'Legacy Refresh';
                console.log('Successfully generated NEW cookie via legacy method');
            }
        }

        // If all methods failed to generate a NEW cookie
        if (!newCookie || newCookie === oldCookie) {
            return res.status(400).json({ 
                error: "Unable to generate new cookie",
                details: "All refresh methods returned the original cookie. The cookie may already be fresh or refresh is blocked."
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
            message: `✅ Successfully generated NEW cookie using ${methodUsed}`
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

// METHOD 1: ACTUAL Authentication Ticket Refresh
async function method1AuthTicketRefresh(cookie) {
    try {
        console.log('Attempting Auth Ticket method...');
        
        // Step 1: Get CSRF token
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) {
            console.log('Failed to get CSRF token for auth ticket');
            return null;
        }

        // Step 2: Get authentication ticket
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
        if (!authTicket) {
            console.log('No auth ticket received');
            return null;
        }

        console.log('Got auth ticket, attempting redemption...');

        // Step 3: Redeem auth ticket for NEW cookie
        const redeemResponse = await axios.post('https://auth.roblox.com/v1/authentication-ticket/redeem',
            {
                authenticationTicket: authTicket,
                // Add additional parameters that might help
                matchWebsiteVersion: true
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
                validateStatus: () => true,
                timeout: 15000
            }
        );

        console.log('Redeem response status:', redeemResponse.status);

        // Extract NEW cookie from response
        const newCookie = extractCookieFromResponse(redeemResponse);
        if (newCookie && newCookie !== cookie) {
            console.log('Successfully generated NEW cookie via auth ticket');
            return newCookie;
        }

        return null;

    } catch (error) {
        console.log('Auth ticket method error:', error.message);
        return null;
    }
}

// METHOD 2: Game Join Refresh
async function method2GameJoinRefresh(cookie) {
    try {
        console.log('Attempting Game Join method...');
        
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) return null;

        const response = await axios.post('https://gamejoin.roblox.com/v1/join-game-instance',
            {
                placeId: 2753915549, // Popular game ID
                gameId: "test-game-join-session"
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

        const newCookie = extractCookieFromResponse(response);
        if (newCookie && newCookie !== cookie) {
            console.log('Successfully generated NEW cookie via game join');
            return newCookie;
        }

        return null;
    } catch (error) {
        console.log('Game join method error:', error.message);
        return null;
    }
}

// METHOD 3: Legacy Refresh
async function method3LegacyRefresh(cookie) {
    try {
        console.log('Attempting Legacy method...');
        
        const csrfToken = await getCSRFToken(cookie);
        if (!csrfToken) return null;

        // Try to trigger a cookie refresh by accessing a protected endpoint
        const response = await axios.post('https://auth.roblox.com/v2/login',
            {},
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

        const newCookie = extractCookieFromResponse(response);
        if (newCookie && newCookie !== cookie) {
            console.log('Successfully generated NEW cookie via legacy method');
            return newCookie;
        }

        return null;
    } catch (error) {
        console.log('Legacy method error:', error.message);
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
                    console.log('Found NEW cookie in response headers');
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
