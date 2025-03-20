# NewsPlatform

A dynamic news platform enabling creators to publish, manage, and share content through personalized channels.

## Current Features

### User Authentication

- User registration and login
- Protected routes requiring authentication
- Session-based authentication
- User-specific content access

### Channel Management

- Create personal channels with name and description
- View channels in the main feed
- Channel-specific article management
- Automatic redirect to article creation after channel setup

### Article Management

- Create articles with rich content
- Associate articles with specific channels
- Categorize articles by topic
- Add optional location information
- View articles in the main feed

### User Interface

- Clean, responsive design
- Navigation bar with user controls
- Toast notifications for user feedback
- Loading states and error handling
- Form validation with immediate feedback

## Technical Implementation

- React + TypeScript frontend
- Express.js backend (traditional mode) / Serverless API (Vercel deployment mode)
- Session-based authentication
- Supabase database integration
- Form validation using react-hook-form and zod
- UI components from shadcn/ui
- Responsive design with Tailwind CSS

## Current Workflow

1. Users register/login
2. Create a channel (required for publishing)
3. Create articles within their channel
4. View all articles in the main feed

## Running the Application

### Traditional Mode (Express backend + React frontend)

```bash
npm run dev
```

This runs the Express server which serves both the API and the frontend on port 5001.

### Serverless Mode (for Vercel compatibility)

```bash
npm run dev:serverless
```

This runs:

- A local serverless API server on port 3000
- The Vite development server for the frontend on port 5001
- The frontend server proxies API requests to the serverless API

The serverless mode is compatible with Vercel deployment and allows you to develop locally in an environment that matches the production setup.

## Deployment

The application is configured for deployment on Vercel using the serverless architecture. The `vercel.json` file contains the routing rules and build configurations needed for proper deployment.

When deployed to Vercel:

1. The frontend is built as a static site
2. The API is deployed as serverless functions
3. All API routes are directed to the appropriate serverless function

# NewsPlatform MVP - Subscription System

## Overview

The subscription system allows users to subscribe to channels of interest, enabling them to:

- Follow content from their favorite creators
- Support content creators by increasing their subscriber counts
- Access a more personalized content experience

## Recent Improvements

We've implemented several enhancements to the subscription system:

1. **Fixed Critical Issues**

   - Corrected API errors in subscription endpoints
   - Fixed UI inconsistencies in subscription buttons
   - Resolved accurate subscriber count display across the platform
   - Ensured subscription status is reflected correctly in user profiles

2. **Enhanced Subscriber Management**

   - Added comprehensive "Manage Subscribers" page for channel owners
   - Implemented sorting and searching of subscriber lists
   - Added subscriber engagement metrics (total channels subscribed to)

3. **Improved User Experience**
   - Better visual indication of subscription status
   - Prevention of duplicate subscriptions
   - Clearer error handling and feedback

## Implementation Details

### Components

- **ChannelCard**: Displays channel information with subscribe button on explore page
- **ChannelPage**: Shows channel details with subscribe/unsubscribe functionality
- **ManageSubscribersPage**: Allows channel owners to manage their subscribers

### API Endpoints

- **POST /api/channels/:id/subscribe**: Subscribe to a channel
- **DELETE /api/channels/:id/subscribe**: Unsubscribe from a channel
- **GET /api/channels/:id/subscribers**: Get a list of channel subscribers (owner only)
- **GET /api/user/subscriptions**: Get all channels a user is subscribed to

### Database Structure

- **subscriptions table**: Stores relationship between users and channels
  - `user_id`: The subscriber's ID
  - `channel_id`: The channel being subscribed to
  - `created_at`: When the subscription was created

## Fixed Issues

### 1. API Error in User Subscriptions Endpoint

- **Problem**: The `/api/user/subscriptions` endpoint was failing with a 500 error due to a missing column in the database schema.
- **Solution**: Added schema validation to check for column existence before querying.

### 2. Profile Page Subscription Display

- **Problem**: User profile pages showed "subscribed to 0 channels" even when subscriptions existed.
- **Solution**:
  - Implemented multiple fallback data sources for subscription information
  - Added subscriber count enrichment to API responses

### 3. Subscribe Button Behavior

- **Problem**: Users could click "Subscribe" on channels they were already subscribed to.
- **Solution**:
  - Enhanced subscription state checking with proper caching
  - Updated UI to show "Subscribed" with separate "Unsubscribe" action

### 4. Subscriber Count Accuracy

- **Problem**: Subscriber counts showed as "0" in profile page for subscribed channels.
- **Solution**:
  - Enhanced API endpoints to include accurate subscriber counts
  - Implemented robust count extraction from multiple data sources

## New Feature: Manage Subscribers Page

The new Manage Subscribers page allows channel owners to:

- View a complete list of their subscribers
- See when each user subscribed to their channel
- View how many total channels each subscriber follows (engagement metric)
- Sort subscribers by username, subscription date, or engagement
- Search for specific subscribers by username

### Security and Access Control

- Only channel owners can access the subscriber management page
- API endpoint verifies ownership before providing subscriber data
- Proper error handling and permission checks throughout

## Testing

To verify the subscription system is working correctly:

1. **Subscribe to a Channel**:

   - The button should change to "Subscribed" + "Unsubscribe"
   - The subscriber count should increase
   - You shouldn't be able to click Subscribe again

2. **Check Profile Page**:

   - Subscribed channels should appear in your profile
   - Subscription counts should be accurate
   - The total number of subscriptions should be correct

3. **Manage Subscribers** (for channel owners):
   - Click "Manage Subscribers" on your channel page
   - View, sort, and search your subscriber list
   - Verify subscriber counts and subscription dates
