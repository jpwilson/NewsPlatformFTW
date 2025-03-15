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
