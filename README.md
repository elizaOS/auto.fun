![post](https://github.com/user-attachments/assets/b21a3ede-ae4d-4e0d-be8e-2eeac18f5778)

# Auto.fun

Press the fun button.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) must be installed on your system.

### Installation & Setup

1. **Configure Environment Variables**

   Copy the example environment file and add your specific values:

   ```sh
   cp .env.example .env
   ```

2. **Install Dependencies**

   Install the project dependencies using bun:

   ```sh
   bun i
   ```

3. **Build the Project**

   Build the application by running:

   ```sh
   bun run build
   ```

4. **Start Development Server**

   Start the development server with:

   ```sh
   bun run dev
   ```

5. **Configure webhooks for chain events**

   In order to test webhooks properly in dev, create your own helius account on https://dashboard.helius.dev.

   This is so that each developer has a separate web hook and we aren't overwriting each other's webhooks.

   `bun run dev` will then automatically tunnel your local server to a public https url, and then add
   that url as a web hook to helius.

## Usage

After starting the development server, visit the `https://localhost:3000` in your browser to interact with Auto.fun.
