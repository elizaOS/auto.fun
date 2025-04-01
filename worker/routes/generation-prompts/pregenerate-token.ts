export function pregenerateTokenPrompt() {
  return `Generate prompt and engaging token metadata for a Solana token. The token should be fun and memorable. Return a JSON object with the following fields:
          - name: A memorable name for the token
          - symbol: A 3-8 character symbol for the token
          - description: A compelling description of the token
          - prompt: A detailed prompt for image generation
          
          Example format:
          {
            "name": "Fun Token Name",
            "symbol": "FUN",
            "description": "A fun and engaging token description",
            "prompt": "A detailed prompt for image generation"
          }`
}
