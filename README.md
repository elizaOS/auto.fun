![post](https://github.com/user-attachments/assets/b21a3ede-ae4d-4e0d-be8e-2eeac18f5778)

# Auto.fun

Press the fun button.

### Installation & Setup

1. **Configure Environment Variables**

   Copy the example environment file and add your specific values:

   ```sh
   cp .env.example .env
   ```

2. **Install Dependencies**

   Install the project dependencies using npm:

   ```sh
   npm i
   ```

3. **Build the Project**

   Build the application by running:

   ```sh
   npm run build
   ```

4. **Start Development Server**

   Start the development server with:

   ```sh
   npm run dev
   ```

5. **Configure webhooks for chain events**

   By default, we will mock the webhook events using a web socket server in mock-helius-webhook.js. If you want to test with real webhooks in dev, modify the dev script in package.json
   to call the setup-webhook.js rather than mock-helius-webhook.js. Then:

   Create your own helius account on https://dashboard.helius.dev.

   This is so that each developer has a separate web hook and we aren't overwriting each other's webhooks.

   `npm run dev` will then automatically tunnel your local server to a public https url, and then add
   that url as a web hook to helius.

   *NOTE: sometimes the webhook takes a minute or so to propagate to helius so
   for now it's recommended to kill the server as little as possible.

## Usage

After starting the development server, visit the `https://localhost:3000` in your browser to interact with Auto.fun.

## Deployment to Cloudflare

This project is designed to be deployed using Cloudflare Pages for the frontend and Cloudflare Workers for the backend API.

1.  **Fork the Repository**
    *   Click the "Fork" button on the top right of the GitHub repository page to create your own copy.

2.  **Create a Cloudflare Account**
    *   If you don't have one already, sign up for a free Cloudflare account at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).

3.  **Deploy the Frontend with Cloudflare Pages**
    *   Navigate to the "Workers & Pages" section in your Cloudflare dashboard.
    *   Click "Create application" > "Pages" > "Connect to Git".
    *   Select your forked repository.
    *   In "Set up builds and deployments":
        *   Select "Next.js" as the framework preset. Cloudflare should automatically detect the correct build settings.
        *   Configure environment variables (see step 5).
    *   Click "Save and Deploy".

4.  **Deploy the Backend with Cloudflare Workers**
    *   You will need the Wrangler CLI. Install it if you haven't: `npm install -g wrangler`.
    *   Log in to Cloudflare: `wrangler login`.
    *   Navigate to the `api/` directory in your local project clone: `cd api`.
    *   Rename `wrangler.example.toml` to `wrangler.toml`. You might need to adjust settings inside, like the worker name, if needed.
    *   Deploy the worker: `wrangler deploy`. This command builds and publishes your worker. Note the URL of your deployed worker.

5.  **Connect Pages to Worker & Configure Environment Variables**
    *   **In your Cloudflare Pages project settings:**
        *   Go to "Settings" > "Functions".
        *   Under "Service bindings", click "Add binding".
        *   Set the "Variable name" to `API` (or whatever your frontend code expects for the worker binding, check `lib/config.ts`).
        *   Select the Worker you deployed in step 4 as the "Service name".
    *   **Environment Variables:**
        *   Go to "Settings" > "Environment variables".
        *   Add the necessary environment variables required by both your Pages build (e.g., `NEXT_PUBLIC_*` variables) and your Worker (`API` binding usually handles backend vars, but check your `.env` and `wrangler.toml`). You'll need to replicate the variables from your local `.env` file here, especially secrets like `HELIUS_API_KEY`.
        *   Ensure you set variables for both "Production" and "Preview" environments as needed.

6.  **Access Your Deployed Application**
    *   Once deployed, Cloudflare Pages will provide you with a unique URL (e.g., `your-project.pages.dev`). Your backend API will be accessible via the binding configured in Pages.

