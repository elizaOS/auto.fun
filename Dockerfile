# Use the official latest Bun image
FROM oven/bun:latest

ENV NODE_ENV=production
ENV PORT=3069

# Set working directory
WORKDIR /app

COPY package.json .

# Copy source files
COPY . .

COPY *.ts .
COPY lib/ ./lib/
COPY target/ ./target/

# Install dependencies
RUN bun install

EXPOSE ${PORT}

# Start the server
CMD ["bun", "run", "server.ts"]