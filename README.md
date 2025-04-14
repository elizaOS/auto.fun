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
