export function createTokenPrompt(validatedData) {
  // Customize AI prompt based on user input
  let userInstructions = "";
  if (validatedData.prompt) {
    userInstructions = `The token should be based on this concept: "${validatedData.prompt}". 
      Make sure the token name, symbol, description and image prompt directly incorporate elements from this concept.
      For example, if the concept is "a halloween token about arnold schwarzenegger", the token might be named "Spooky Schwartz" with symbol "SPKS" and an image prompt that describes a muscular halloween figure resembling Arnold.
      Be creative but stay faithful to the concept.`;
  }

  const content = `Generate prompt and engaging token metadata for a Solana token. The token should be fun and memorable. ${userInstructions} 
        
        Return ONLY a JSON object with the following fields:
        - name: A memorable name for the token that clearly reflects the concept
        - symbol: A 3-8 character symbol for the token
        - description: A compelling description of the token that incorporates the concept
        - prompt: A detailed prompt for image generation that will create a visual representation of the concept
        
        Example format:
        {
          "name": "Fun Token Name",
          "symbol": "FUN",
          "description": "A fun and engaging token description",
          "prompt": "A detailed prompt for image generation"
        }
        
        Only provide the JSON object. Do not include any other text, explanation, or formatting.`;

  return content;
}
