import { isNull } from "drizzle-orm";
import { getDB, personalities } from "./db";
import { Env } from "./env";
import { logger } from './logger';

export interface AgentDetailsInput {
    name: string;
    description: string;
    personalities?: string[];
    systemPrompt?: string;
    bio?: string;
    lore?: string;
    postExamples?: string;
    adjectives?: string;
    style?: string;
    topics?: string;
}
  
export interface AgentDetailsRequest {
  inputs: {
    name: string;
    description: string;
    mood?: string;
    model?: string;
  };
  requestedOutputs: string[];
}

export interface AgentDetails {
  systemPrompt?: string;
  bio?: string;
  lore?: string;
  postExamples?: string[];
  adjectives?: string[];
  style?: string[];
  topics?: string[];
  [key: string]: string | string[] | undefined; // Add index signature for string keys
}

/**
 * Creates character details for an agent using either static response or AI generation
 * @param request The request details including inputs and requested outputs
 * @param env CloudFlare environment
 * @returns Generated agent details
 */
export async function createCharacterDetails(
  request: AgentDetailsRequest,
  env?: Env
): Promise<AgentDetails> {
  try {
    const { inputs, requestedOutputs } = request;
    const { name, description, mood = 'helpful' } = inputs;
    
    // Start with more detailed base outputs 
    const baseDetails: AgentDetails = {
      systemPrompt: `You are ${name}, an AI assistant created to ${description}.
Your goal is to be ${mood} while maintaining a consistent persona.
You should provide responses that are informative, engaging, and relevant to user queries.
Always stay within ethical and legal boundaries in your responses.`,
      
      bio: `${name} is an AI created to ${description}.
With expertise in relevant topics, ${name} aims to assist users with their needs while maintaining a ${mood} demeanor.
${name} is always up-to-date with the latest information and strives to provide accurate and helpful responses.`,
      
      lore: `${name} was created as a specialized AI assistant to ${description}.
Its knowledge and capabilities were carefully crafted to excel in related fields.
While maintaining a ${mood} persona, ${name} has evolved to understand complex user needs and anticipate questions.
${name} continues to learn and improve with each interaction.`,
      
      postExamples: [
        `Just spent some time thinking about how I can better ${description}. I'm excited to share my insights with you all! #AI #Assistance`,
        `Today's tip: When you're looking for help with ${description.split(' ').slice(0, 3).join(' ')}..., remember that clarity helps me understand your needs better! #Tips #AIAssistance`,
        `Did you know that when it comes to ${description.split(' ').slice(0, 4).join(' ')}..., there are several approaches? Let me know if you'd like to learn more!`
      ],
      
      adjectives: [
        mood,
        "knowledgeable",
        "responsive",
        "thoughtful",
        "precise",
        "resourceful",
        "adaptable"
      ],
      
      style: [
        "conversational",
        "informative", 
        "clear",
        "concise",
        "respectful",
        "patient"
      ],
      
      topics: [
        ...description.split(' ')
          .filter(word => word.length > 4)
          .map(word => word.replace(/[^a-zA-Z]/g, ''))
          .filter(word => word.length > 4)
      ]
    };
    
    // If we have an API key for an AI service and it's requested, generate with AI
    if (env && 'OPENAI_API_KEY' in env && env.OPENAI_API_KEY && inputs.model) {
      try {
        const aiGenerated = await generateWithAI(request, env.OPENAI_API_KEY as string);
        // Merge AI generated content with base details as fallback
        return {
          ...baseDetails,
          ...aiGenerated
        };
      } catch (error) {
        logger.error('Failed to generate with AI, using fallback:', error);
      }
    }
    
    // Filter the responses to only include requested outputs
    const filteredResponse: AgentDetails = {};
    for (const output of requestedOutputs) {
      if (output in baseDetails) {
        filteredResponse[output] = baseDetails[output];
      }
    }
    
    return filteredResponse;
  } catch (error) {
    logger.error('Error in createCharacterDetails:', error);
    // Return minimal placeholder response on error
    return {
      systemPrompt: "You are a helpful assistant.",
      bio: "This is a helpful AI assistant."
    };
  }
}

/**
 * Generate character details using OpenAI API
 * @param request The agent details request
 * @param apiKey OpenAI API key
 * @returns AI-generated agent details
 */
async function generateWithAI(
  request: AgentDetailsRequest,
  apiKey: string
): Promise<Partial<AgentDetails>> {
  const { inputs, requestedOutputs } = request;
  
  // Construct the prompt for AI
  const prompt = `
You are an expert AI character designer.
Create character details for an AI assistant with the following specifications:
Name: ${inputs.name}
Purpose/Description: ${inputs.description}
Mood/Temperament: ${inputs.mood || 'helpful'}

Please generate ONLY the following attributes (one per line, no explanations):
${requestedOutputs.map(output => `- ${output}`).join('\n')}
  `.trim();

  // Call OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: inputs.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an AI character designer who creates detailed personas for AI assistants.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  // Add type assertion for the JSON response
  const data = await response.json() as { 
    choices: Array<{ message: { content: string } }> 
  };
  
  const result = data.choices[0]?.message?.content;
  
  if (!result) {
    throw new Error('No response from OpenAI API');
  }
  
  // Parse the result into the expected format
  return parseAIResponse(result, requestedOutputs);
}

/**
 * Parse the AI response into the expected format
 * @param response The raw AI response
 * @param requestedOutputs The requested output fields
 * @returns Parsed agent details
 */
function parseAIResponse(response: string, requestedOutputs: string[]): Partial<AgentDetails> {
  const result: Partial<AgentDetails> = {};
  
  // Simple parsing approach - we can make this more sophisticated if needed
  const sections = response.split(/\n{2,}/); // Split by multiple newlines
  
  for (const section of sections) {
    const lines = section.split('\n').filter(line => line.trim());
    
    for (const output of requestedOutputs) {
      const regex = new RegExp(`^(${output}|${output}:)`, 'i');
      const matchingLines = lines.filter(line => regex.test(line));
      
      if (matchingLines.length > 0) {
        // Extract the content after the output name and colon
        const content = matchingLines
          .map(line => line.replace(regex, '').trim())
          .filter(line => line.length > 0)
          .join('\n');
        
        if (content) {
          // Handle array types vs string types
          if (output === 'postExamples' || output === 'adjectives' || output === 'style' || output === 'topics') {
            (result as any)[output] = content.split(/,|;|\n/).map(item => item.trim()).filter(item => item.length > 0);
          } else {
            (result as any)[output] = content;
          }
        }
      }
    }
  }
  
  return result;
}

export async function getAllPersonalities(env: Env) {
  try {
    const db = getDB(env);
    return await db.select().from(personalities).where(isNull(personalities.deletedAt));
  } catch (error) {
    console.error('Error fetching personalities:', error);
    throw error;
  }
}

/**
 * Create a new personality record in the database
 * @param name Personality name
 * @param description Personality description
 * @param env CloudFlare environment
 * @returns The created personality
 */
export async function createPersonality(name: string, description: string, env: Env) {
  const db = getDB(env);
  
  // Create a new personality with the correct column format
  const [personality] = await db.insert(personalities)
    .values({
      id: undefined, // Let the DB handle ID generation
      name: name,
      description: description,
      // Convert to proper timestamp format
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    })
    .returning();
  
  return personality;
}