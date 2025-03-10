import OpenAI from "openai";
import { Personality } from "./schemas";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const together = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: "https://api.together.xyz/v1",
});

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
    inputs: AgentDetailsInput;
    requestedOutputs: string[];
  }
  
  export interface AgentDetailsResponse {
    systemPrompt?: string;
    bio?: string;
    lore?: string;
    postExamples?: string;
    adjectives?: string;
    style?: string;
    topics?: string;
  }

export async function completeJsonOAI(inputString: string): Promise<any> {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",  // or "gpt-3.5-turbo-1106"
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a talented creative writer, capable of writing characters with depth and personality, in a variety of styles, including funny, serious, sarcastic, and more. You always responds with valid JSON. The response should always include a 'response' field containing a string."
          },
          {
            role: "user",
            content: `${inputString}\nProvide a creative and detailed response in JSON format.`
          }
        ],
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content;
      if (!response) {
        throw new Error('No content in OpenAI response');
      }
      console.log('Generated JSON:', response);
      
      return JSON.parse(response);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to complete JSON: ${error.message}`);
      }
      throw error;
    }
}

export async function completeJsonTogether(inputString: string): Promise<any> {
    const response = await together.completions.create({
        model: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
        prompt: `You are a talented creative writer, capable of writing characters with depth and personality, in a variety of styles, including funny, serious, sarcastic, and more.

${inputString}\n\n

This response contains only basic text, with no markdown or formatting. It contains only the content of the response, with no narration or explanation.
The response:`,
        temperature: 0.7,
        max_tokens: 1000,
    });
    console.log('Generated Response:', response.choices[0].text);
    return {response: response.choices[0].text}
}
export async function createCharacterDetails(request: AgentDetailsRequest): Promise<AgentDetailsResponse> {
  console.log('Starting createCharacterDetails with request:', {
    name: request.inputs.name,
    description: request.inputs.description,
    requestedOutputs: request.requestedOutputs
  });

  const { inputs, requestedOutputs } = request;
  const response: AgentDetailsResponse = {};

  // Look up personality names if personality IDs are provided
  let personalityNames: string[] = [];
  if (inputs.personalities && inputs.personalities.length > 0) {
    const allPersonalities = await getAllPersonalities();

    personalityNames = inputs.personalities
      .map(id => allPersonalities.find(p => p.id === id)?.name)
      .filter((name): name is string => !!name); // Filter out undefined values
  }

  // Create prompts for each requested output
  const prompts = new Map<string, string>();
  
  for (const output of requestedOutputs) {
    console.log(`Creating prompt for output type: ${output}`);
    let prompt = `Given a character with:
- Name: ${inputs.name}
- Description: ${inputs.description}
${personalityNames.length > 0 ? `- Personality traits: ${personalityNames.join(', ')}` : ''}
${inputs.systemPrompt ? `- System prompt: ${inputs.systemPrompt}` : ''}
${inputs.bio ? `- Biography: \n${inputs.bio}` : ''}
${inputs.lore ? `- Lore: \n${inputs.lore}` : ''}
${inputs.postExamples ? `- Post examples: \n${inputs.postExamples}` : ''}
${inputs.adjectives ? `- Character adjectives: \n${inputs.adjectives}` : ''}
${inputs.style ? `- Writing style: \n${inputs.style}` : ''}\n\n`;

    switch (output) {
      case 'systemPrompt':
        prompt += 'Generate a base prompt that defines this character\'s behavior, and manner of speech. It should not contain too much information about the character, but rather instructions for how it should speak and behave, as well as key details about itself. Make it detailed but concise. One paragraph.';
        break;
      case 'bio':
        prompt += 'Generate a biography for this character. Each point should be separated by a new line character, in a single string. Do not use arrays, and do not list anything. Simply return each point independently on a new line. Include 5-7 key points about their background, experiences, and current situation.';
        break;
      case 'lore':
        prompt += 'Generate lore/background information for this character. Each piece of lore should be separated by a new line character, in a single string. Do not use arrays, and do not list anything. Simply return each point independently on a new line. Include 4-6 pieces of world-building or historical context.';
        break;
      case 'postExamples':
        prompt += 'Generate 3-4 example posts/messages that this character might write. Each example should be separated by a new line character, in a single string. Do not use arrays, and do not list anything. Simply return each point independently on a new line. Make them showcase different aspects of their personality.';
        break;
      case 'adjectives':
        prompt += 'Generate a list of adjectives that describe the personality of this character. Each adjective should be 1-3 words, and separated by a new line character, in a single string. Do not use arrays, and do not list anything. Simply return each point independently on a new line. Include 6-8 distinctive traits.';
        break;
      case 'style':
        prompt += 'Generate writing style guidelines for this character. Each guideline should be separated by a new line character, in a single string. Do not use arrays, and do not list anything. Simply return each point independently on a new line. Include 4-5 points about their speech patterns, vocabulary, and tone.';
        break;
      case 'topics':
        prompt += 'Generate a list of conversation topics this character would be interested in discussing. Each topic should be 1-4 words, and separated by a new line character, in a single string. Do not use arrays, and do not list anything. Simply return each topic independently on a new line. Include 6-8 topics that reflect their interests and expertise.';
        break;
    }

    prompts.set(output, prompt);
    console.log(`Generated prompt for ${output}:`, prompt.substring(0, 200) + '...');
  }

  // Process all requests in parallel
  console.log('Starting parallel completion requests for:', Array.from(prompts.keys()));
  try {
    const completions = await Promise.all(
      Array.from(prompts.entries()).map(async ([key, prompt]) => {
        console.log(`Starting completion for ${key}`);
        try {
          const completion = await completeJsonOAI(prompt);
          console.log(`Successful completion for ${key}`);
          return { key, value: completion.response };
        } catch (error) {
          console.error(`Error in completion for ${key}:`, error);
          throw error;
        }
      })
    );

    // Combine results into response object
    completions.forEach(({ key, value }) => {
      console.log(`Setting response for ${key}, value length: ${value?.length || 0}`);
      response[key as keyof AgentDetailsResponse] = value;
    });

    console.log('Successfully completed character details creation');
    return response;
  } catch (error) {
    console.error('Error in createCharacterDetails:', error);
    throw error;
  }
}

export async function getAllPersonalities() {
  try {
    const personalities = await Personality.find({
      deletedAt: null // Only fetch non-deleted personalities
    }); 
    return personalities;
  } catch (error) {
    console.error('Error fetching personalities:', error);
    throw error;
  }
}

export async function createPersonality(name: string, description: string) {
  try {
    const personality = await Personality.create({
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Successfully created new personality', {
      personalityId: personality.id,
      name: personality.name 
    });

    return personality;
  } catch (error) {
    console.error('Error creating personality', error);
    throw error;
  }
}