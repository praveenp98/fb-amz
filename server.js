require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const tokenManager = require('./tokenManager');

const app = express();
const port = process.env.PORT || 3001;

const FACEBOOK_API_VERSION = 'v18.0';
const FACEBOOK_API_BASE_URL = `https://graph.facebook.com/${FACEBOOK_API_VERSION}`;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
});

// Add timeout to avoid hanging requests
const axiosInstance = axios.create({
  timeout: 30000 // 30 seconds timeout
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Middleware to verify Firebase token
async function verifyToken(req, res, next) {
  const idToken = req.headers.authorization;
  if (!idToken) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Search interests endpoint
app.get('/api/interests', verifyToken, async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    // Track user request for security monitoring
    await tokenManager.trackUserRequest(req.user.uid, '/api/interests');

    console.log('API: Received query:', query);
    const access_token = await tokenManager.getValidToken();
    const ad_account_id = process.env.FACEBOOK_AD_ACCOUNT_ID;

    // Search for interests with more specific parameters
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

    console.log('API: Got search response:', searchResponse.data);

    if (!searchResponse.data.data || searchResponse.data.data.length === 0) {
      return res.json({ data: [] });
    }

    const results = searchResponse.data.data;
    const interests = [];

    // Process all results in batches of 10 to avoid rate limits
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
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
