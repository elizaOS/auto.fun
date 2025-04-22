import { Env } from "../../env";
import { ideas, adjectives, nouns, exampleFormats } from "./constants";

export async function createTokenPrompt(validatedData?: any) {
  // Customize AI prompt based on user input
  let userInstructions = "";
  if (validatedData && validatedData.prompt) {
    userInstructions = `The token should be based on this concept: "${validatedData.prompt}". 
      Make sure the token name, symbol, description and image prompt directly incorporate elements from this concept.
      For example, if the concept is "a halloween token about arnold schwarzenegger", the token might be named "Spooky Schwartz" with symbol "SPKS" and an image prompt that describes a muscular halloween figure resembling Arnold.
      Be creative but stay faithful to the concept.`;
  } else {
    // Generate a random concept if user didn't provide one
    const randomIdea = ideas[Math.floor(Math.random() * ideas.length)];
    const randomAdjective =
      adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

    const randomIdea2 = ideas[Math.floor(Math.random() * ideas.length)];
    const randomAdjective2 =
      adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun2 = nouns[Math.floor(Math.random() * nouns.length)];

    userInstructions = `The token should be based on this concept: "${randomAdjective} ${randomIdea} ${randomNoun}".
    Alternatively, you can use the following concept: "${randomAdjective2} ${randomIdea2} ${randomNoun2}".
      Make it edgy, funny, and internet culture related. The name should be catchy and memorable.
      The symbol should be 3-5 characters and easily recognizable.`;
  }

  // Get trending topics for inspiration
  const newsApiKey = process.env.NEWS_API_KEY;
  let trendingTopics = [];

  if (newsApiKey) {
    try {
      const trendingTopicsResponse = await fetch(
        `https://newsapi.org/v2/top-headlines?country=us&apiKey=${newsApiKey}`,
        {
          headers: { Accept: "application/json" },
        },
      );

      if (trendingTopicsResponse.ok) {
        const trendingTopicsJson = await trendingTopicsResponse.json();
        trendingTopics = trendingTopicsJson.articles
          .filter((article: any) => article.title)
          .map((article: any) => article.title.replace(/\s-\s.*$/, "").trim()) // Remove source name
          .slice(0, 5); // Take only top 5
      }
    } catch (error) {
      console.error("Error fetching trending topics:", error);
      // Continue without trending topics
    }
  }

  // Build the prompt with trending topics if available
  let trendingTopicsPrompt = "";
  if (trendingTopics.length > 0) {
    trendingTopicsPrompt = `
        Here are some current trending topics for inspiration (optional):
        - ${trendingTopics.join("\n        - ")}
      `;
  }

  const content = `Generate prompt and engaging token metadata for a Solana token. The token should be fun, memorable, and captivating to crypto enthusiasts. ${userInstructions}
        
        ${trendingTopicsPrompt}
        
        The token should have meme potential and appeal to internet culture. Make it attention-grabbing and shareable.
        
        Return ONLY a JSON object with the following fields:
        - name: A memorable name for the token that clearly reflects the concept (max 20 characters)
        - symbol: A 3-5 character symbol for the token (preferably all caps)
        - description: A compelling description of the token that incorporates the concept (100-150 characters)
        - prompt: A detailed prompt for image generation that will create a visual representation of the concept
        
        Example format:
        \`\`\`json
        ${exampleFormats[Math.floor(Math.random() * exampleFormats.length)]}
        \`\`\`
        
        Only provide the JSON object. Do not include any other text, explanation, or formatting.`;

  return content;
}
