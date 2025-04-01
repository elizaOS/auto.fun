export function enhancePrompt(userPrompt, tokenMetadata) {
  return `Enhance this prompt for image generation by combining it with the token metadata. Create a single, coherent image prompt that incorporates both the user's ideas and the token's identity.

Token Metadata:
- Name: ${tokenMetadata.name}
- Symbol: ${tokenMetadata.symbol}
- Description: ${tokenMetadata.description || ""}
- Original token prompt: ${tokenMetadata.prompt || ""}

User's prompt: "${userPrompt}"

Return only the enhanced prompt, nothing else. The prompt should be detailed and descriptive, focusing on visual elements that would create a compelling image.`;
}
