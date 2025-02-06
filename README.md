# Facebook Interest Finder

A web application that helps find targeting interests for Facebook Ads using the Facebook Marketing API. The application includes Firebase Authentication for user management.

## Prerequisites

1. Node.js and npm installed
2. Facebook Developer Account and App
3. Firebase Project
4. Facebook Marketing API Access Token

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   FACEBOOK_ACCESS_TOKEN=your_access_token
   FIREBASE_API_KEY=your_firebase_api_key
   FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Features

- User authentication with Firebase
- Search for Facebook ad targeting interests
- View interest details including audience size
- Save favorite interests to user profile
