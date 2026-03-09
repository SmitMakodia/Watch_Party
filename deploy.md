# Watch Party - Deployment Guide (Completely Free)

This guide will walk you through hosting your Watch Party app on the internet so your friends can join you, completely for free. We will use **Render** for your Node.js WebSocket backend and **Vercel** for your React frontend.

---

## Prerequisites
1. A **GitHub** account (https://github.com/)
2. A **Render** account (https://render.com/) - *Sign up with your GitHub account*
3. A **Vercel** account (https://vercel.com/) - *Sign up with your GitHub account*
4. Git installed on your computer.

---

## Step 1: Push your Code to GitHub

First, you need to upload your project to GitHub.

1. Go to [GitHub](https://github.com/) and create a new repository. Name it `watch-party` (or anything you like). Keep it **Public** or **Private** (both work).
2. Open a terminal in your project's root directory (`D:\codes\Watch_Party`) and run these commands:

```bash
# Initialize git
git init

# Add all files (the .gitignore file will ensure node_modules are ignored)
git add .

# Create your first commit
git commit -m "Initial commit of Watch Party"

# Link your local folder to your GitHub repository
# (Replace YOUR_USERNAME and YOUR_REPO with your actual GitHub username and repository name)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Change the branch name to main
git branch -M main

# Push the code to GitHub
git push -u origin main
```

*(Note: Once this is pushed, any future updates you make just require: `git add .`, `git commit -m "update"`, and `git push`)*

---

## Step 2: Deploy the Server to Render

Render is a great free hosting provider for backend servers like Node.js.

1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click the **"New +"** button at the top right and select **"Web Service"**.
3. Under "Connect a repository", click on your `watch-party` repository.
4. Fill in the deployment details exactly like this:
   - **Name:** `watch-party-server` (or whatever you like)
   - **Region:** Choose the region closest to you and your friends (e.g., US East, Frankfurt, Singapore).
   - **Branch:** `main`
   - **Root Directory:** `server` *(Important! Since your backend is in the `server` folder)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Select the **Free** tier ($0/month).
5. Click **"Create Web Service"**.

Render will now build your server. It takes about 2-3 minutes. 
Once it's done, look near the top left under the name of your service to find your new URL (it will look something like `https://watch-party-server-xxxxx.onrender.com`).

**Copy this URL** — you will need it for the next step!

*(Note: Render's free tier automatically goes to "sleep" after 15 minutes of inactivity. When you try to use it the next day, the very first connection might take 30-50 seconds to wake up, but after that, it's instantly fast).*

---

## Step 3: Deploy the Client to Vercel

Vercel is the fastest and easiest way to host React frontend applications.

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **"Add New..."** -> **"Project"**.
3. Find your `watch-party` repository in the list and click **"Import"**.
4. In the configuration window, adjust the following:
   - **Project Name:** `watch-party`
   - **Framework Preset:** Vercel should automatically detect this as **Vite**. Leave it as Vite.
   - **Root Directory:** Click "Edit", select the `client` folder, and click "Continue".
5. Expand the **Environment Variables** section to link your server:
   - **Name:** `VITE_SERVER_URL`
   - **Value:** Paste the URL you got from Render in Step 2 (e.g., `https://watch-party-server-xxxxx.onrender.com`).
   - Click **Add**.
6. Click **Deploy**.

Vercel will now build your React app. This takes about 1 minute. 

---

## Step 4: Start the Party! 🎉

Once Vercel finishes deploying, they will give you a live URL (e.g., `https://watch-party-yourname.vercel.app`). 

1. Click on that link. 
2. Wait a few seconds for your Render server to wake up.
3. Enter a Room ID and your Name.
4. Share the Vercel link and the Room ID with your friends.

You are now successfully hosting a free, fully-synced Watch Party!