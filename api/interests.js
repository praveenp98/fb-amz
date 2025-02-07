const admin = require('firebase-admin');
const axios = require('axios');
require('dotenv').config();

// Function to validate environment variables
function validateEnvVariables() {
    const required = [
        'FIREBASE_PROJECT_ID',
        'FIREBOOK_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_STORAGE_BUCKET',
        'FACEBOOK_ACCESS_TOKEN',
        'FACEBOOK_AD_ACCOUNT_ID'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    try {
        validateEnvVariables();
        
        // Initialize with environment variables
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBOOK_CLIENT_EMAIL,
                // Handle escaped newlines in the private key
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            }),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
        console.log('Firebase Admin initialized successfully');
    } catch (error) {
        console.error('Firebase Admin initialization error:', error);
    }
}

const FACEBOOK_API_VERSION = 'v18.0';
const FACEBOOK_API_BASE_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`;

// Create axios instance with timeout
const axiosInstance = axios.create({
    timeout: 30000 // 30 seconds timeout
});

async function verifyToken(authorization) {
    if (!authorization) {
        throw new Error('No token provided');
    }
    try {
        return await admin.auth().verifyIdToken(authorization);
    } catch (error) {
        console.error('Token verification failed:', error);
        throw error;
    }
}

module.exports = async (req, res) => {
    // Log request details for debugging
    console.log('API Request received:', {
        method: req.method,
        url: req.url,
        query: req.query,
        headers: {
            ...req.headers,
            authorization: req.headers.authorization ? '[REDACTED]' : undefined
        }
    });

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
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        console.log('Processing search query:', query);

        // Verify Firebase token
        const authorization = req.headers.authorization;
        await verifyToken(authorization);

        const access_token = process.env.FACEBOOK_ACCESS_TOKEN;
        const ad_account_id = process.env.FACEBOOK_AD_ACCOUNT_ID;

        if (!access_token || !ad_account_id) {
            console.error('Missing required environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

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

        console.log('Facebook API search response received');

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
                    console.error('Error getting audience size for interest:', result.name, error);
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

        console.log('Sending response with interests count:', interests.length);
        res.json({ data: interests });
    } catch (error) {
        console.error('API Error:', error);
        const errorMessage = error.response?.data?.error?.message || error.message;
        res.status(error.response?.status || 500).json({ 
            error: 'Failed to fetch interests',
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
