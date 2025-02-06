import { config } from 'dotenv';
import admin from 'firebase-admin';
import axios from 'axios';

config();

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
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

export const config = {
    runtime: 'edge',
    regions: ['bom1'], // Mumbai region for better performance
};

export default async function handler(req) {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
        'Content-Type': 'application/json',
    };

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers }
        );
    }

    try {
        const url = new URL(req.url);
        const query = url.searchParams.get('query');

        if (!query) {
            return new Response(
                JSON.stringify({ error: 'Query parameter is required' }),
                { status: 400, headers }
            );
        }

        // Verify Firebase token
        const authorization = req.headers.get('authorization');
        await verifyToken(authorization);

        const access_token = process.env.FACEBOOK_ACCESS_TOKEN;
        const ad_account_id = process.env.FACEBOOK_AD_ACCOUNT_ID;

        if (!access_token || !ad_account_id) {
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { status: 500, headers }
            );
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

        if (!searchResponse.data.data || searchResponse.data.data.length === 0) {
            return new Response(
                JSON.stringify({ data: [] }),
                { status: 200, headers }
            );
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

        return new Response(
            JSON.stringify({ data: interests }),
            { status: 200, headers }
        );
    } catch (error) {
        console.error('API Error:', error);
        return new Response(
            JSON.stringify({ 
                error: 'Failed to fetch interests',
                message: error.message
            }),
            { status: 500, headers }
        );
    }
}
