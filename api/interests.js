const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
}

const FACEBOOK_API_VERSION = 'v18.0';
const FACEBOOK_API_BASE_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`;

// Create axios instance with timeout
const axiosInstance = axios.create({
    timeout: 30000 // 30 seconds timeout
});

async function verifyToken(req) {
    const idToken = req.headers.authorization;
    if (!idToken) {
        throw new Error('No token provided');
    }
    return await admin.auth().verifyIdToken(idToken);
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify Firebase token
        await verifyToken(req);

        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const access_token = process.env.FACEBOOK_ACCESS_TOKEN;
        const ad_account_id = process.env.FACEBOOK_AD_ACCOUNT_ID;

        // Search for interests
        const searchResponse = await axiosInstance.get(`${FACEBOOK_API_BASE_URL}/search`, {
            params: {
                q: query,
                type: 'adinterest',
                limit: 500,
                access_token: access_token,
                locale: 'en_US',
                disable_scoping: true
            }
        });

        if (!searchResponse.data.data || searchResponse.data.data.length === 0) {
            return res.json({ data: [] });
        }

        const results = searchResponse.data.data;
        const interests = [];

        // Process results in batches
        for (let i = 0; i < results.length; i += 10) {
            const batch = results.slice(i, i + 10);
            const batchPromises = batch.map(async (result) => {
                try {
                    const targeting_spec = {
                        geo_locations: { countries: ['US'] },
                        interests: [{ id: result.id, name: result.name }]
                    };

                    const estimateResponse = await axiosInstance.get(
                        `${FACEBOOK_API_BASE_URL}/act_${ad_account_id}/delivery_estimate`,
                        {
                            params: {
                                optimization_goal: 'REACH',
                                targeting_spec: JSON.stringify(targeting_spec),
                                access_token: access_token
                            }
                        }
                    );

                    return {
                        name: result.name || 'N/A',
                        audience_size: estimateResponse.data.data?.[0]?.estimate_dau || 0,
                        path: Array.isArray(result.path) ? result.path : result.path ? [result.path] : [],
                        topic: result.topic || result.disambiguation_category || 'N/A',
                        id: result.id
                    };
                } catch (error) {
                    console.error('Error getting audience size:', error);
                    return {
                        name: result.name || 'N/A',
                        audience_size: 0,
                        path: Array.isArray(result.path) ? result.path : result.path ? [result.path] : [],
                        topic: result.topic || result.disambiguation_category || 'N/A',
                        id: result.id
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            interests.push(...batchResults);
        }

        res.json({ data: interests });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch interests' });
    }
};
