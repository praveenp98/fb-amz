const axios = require('axios');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

class TokenManager {
    constructor() {
        this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
        this.lastRefresh = Date.now();
        this.refreshInterval = 45 * 24 * 60 * 60 * 1000; // 45 days in milliseconds
        this.setupEmailTransport();
        this.setupSecurityMonitoring();
    }

    setupEmailTransport() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });
    }

    async refreshLongLivedToken() {
        try {
            const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: process.env.FACEBOOK_APP_ID,
                    client_secret: process.env.FACEBOOK_APP_SECRET,
                    fb_exchange_token: this.accessToken
                }
            });

            if (response.data && response.data.access_token) {
                this.accessToken = response.data.access_token;
                this.lastRefresh = Date.now();
                
                // Store the new token in Firestore for persistence
                const tokenDoc = admin.firestore().collection('system').doc('facebook_token');
                await tokenDoc.set({
                    token: this.accessToken,
                    lastRefresh: this.lastRefresh
                });

                await this.sendNotificationEmail(
                    'Facebook Token Refreshed',
                    `Token was successfully refreshed at ${new Date().toLocaleString()}`
                );

                return this.accessToken;
            }
        } catch (error) {
            console.error('Error refreshing token:', error);
            await this.sendNotificationEmail(
                'Token Refresh Failed',
                `Failed to refresh Facebook token: ${error.message}`
            );
            throw error;
        }
    }

    async getValidToken() {
        // Check if token needs refresh (45 days old)
        if (Date.now() - this.lastRefresh >= this.refreshInterval) {
            await this.refreshLongLivedToken();
        }
        return this.accessToken;
    }

    setupSecurityMonitoring() {
        // Track API usage per user
        this.userRequests = new Map();
        
        // Clear tracking data every hour
        setInterval(() => {
            this.userRequests.clear();
        }, 60 * 60 * 1000);
    }

    async trackUserRequest(userId, endpoint) {
        const now = Date.now();
        if (!this.userRequests.has(userId)) {
            this.userRequests.set(userId, []);
        }

        const userHistory = this.userRequests.get(userId);
        userHistory.push(now);

        // Keep only requests from the last hour
        const oneHourAgo = now - (60 * 60 * 1000);
        const recentRequests = userHistory.filter(time => time > oneHourAgo);
        this.userRequests.set(userId, recentRequests);

        // Check for suspicious activity
        await this.checkSuspiciousActivity(userId, recentRequests, endpoint);
    }

    async checkSuspiciousActivity(userId, requests, endpoint) {
        const RATE_LIMIT = 100; // requests per hour
        const BURST_LIMIT = 20; // requests per minute

        // Check hourly rate limit
        if (requests.length > RATE_LIMIT) {
            await this.reportSuspiciousActivity(userId, 'Rate limit exceeded', {
                requests: requests.length,
                limit: RATE_LIMIT,
                timeframe: 'hour'
            });
        }

        // Check for burst requests
        const lastMinute = requests.filter(time => time > Date.now() - 60000);
        if (lastMinute.length > BURST_LIMIT) {
            await this.reportSuspiciousActivity(userId, 'Burst limit exceeded', {
                requests: lastMinute.length,
                limit: BURST_LIMIT,
                timeframe: 'minute'
            });
        }

        // Check for automated scanning patterns
        const intervals = [];
        for (let i = 1; i < requests.length; i++) {
            intervals.push(requests[i] - requests[i-1]);
        }

        const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const isAutomated = intervals.length > 10 && 
            intervals.every(interval => Math.abs(interval - averageInterval) < 100);

        if (isAutomated) {
            await this.reportSuspiciousActivity(userId, 'Automated scanning detected', {
                pattern: 'Consistent request intervals',
                averageInterval
            });
        }
    }

    async reportSuspiciousActivity(userId, reason, details) {
        try {
            // Log to Firestore
            await admin.firestore().collection('security_alerts').add({
                userId,
                reason,
                details,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Send email notification
            const userRecord = await admin.auth().getUser(userId);
            const emailContent = `
                Suspicious Activity Detected
                
                User: ${userRecord.email}
                Reason: ${reason}
                Details: ${JSON.stringify(details, null, 2)}
                Time: ${new Date().toLocaleString()}
            `;

            await this.sendNotificationEmail(
                'Suspicious Activity Alert',
                emailContent
            );
        } catch (error) {
            console.error('Error reporting suspicious activity:', error);
        }
    }

    async sendNotificationEmail(subject, content) {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL,
            subject: `[Facebook Interest Finder] ${subject}`,
            text: content
        };

        try {
            await this.transporter.sendMail(mailOptions);
        } catch (error) {
            console.error('Error sending notification email:', error);
        }
    }
}

module.exports = new TokenManager();
