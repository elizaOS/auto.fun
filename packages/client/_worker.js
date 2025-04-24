// packages/client/_worker.js

// Define the handler for meta tags (same logic as before)
class MetaTagHandler {
  constructor(tags) {
    this.tags = tags;
  }

  element(element) {
    // Prepend all new tags
    let tagsHtml = '';
    for (const [property, content] of Object.entries(this.tags)) {
      const attrName = property.startsWith('og:') ? 'property' : (property.startsWith('twitter:') ? 'name' : 'property');
      // Ensure content is a string before replacing quotes
      const safeContent = String(content ?? '');
      const escapedContent = safeContent.replace(/"/g, '&quot;');
      tagsHtml += `<meta ${attrName}="${property}" content="${escapedContent}">\n`;
    }
    // OG:Image dimensions are set dynamically in the main fetch now
    element.prepend(tagsHtml, { html: true });
  }
}


export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        console.log(`[Worker v5] Request: ${url.pathname}, Full URL: ${url.href}`);

        // API requests go to api.auto.fun and won't hit this worker,
        // so the check for /api/ is removed.

        const tokenPathRegex = /^\/token\/([a-zA-Z0-9]{32,44})$/;
        const match = url.pathname.match(tokenPathRegex);

        // --- Only rewrite for /token/:mint routes --- 
        if (match && match[1]) {
            const mint = match[1];
            console.log(`[Worker v5] Token route matched (${mint}). Fetching and attempting rewrite.`);
            
            try {
                // Fetch the asset for the token page (likely index.html)
                let response = await env.ASSETS.fetch(request);
                
                // Clone response to check headers
                const clonedResponse = new Response(response.body, response);
                const contentType = clonedResponse.headers.get('Content-Type');

                if (contentType && contentType.toLowerCase().includes('text/html')) {
                    console.log(`[Worker v5] HTML detected for token route ${mint}. Generating OG tags.`);
                    
                    let ogTags = {};
                    const defaultTitle = 'auto.fun';
                    const serverUrl = env.SERVER_URL || 'https://api.auto.fun';
                    const dynamicImageUrl = `${serverUrl}/api/og-image/${mint}.png`;

                    ogTags['og:title'] = `Token ${mint.substring(0, 4)}...${mint.substring(mint.length - 4)} - ${defaultTitle}`;
                    ogTags['og:description'] = `View ${mint.substring(0,4)}...${mint.substring(mint.length - 4)} on ${defaultTitle}.`;
                    ogTags['og:url'] = url.toString();
                    ogTags['og:image'] = dynamicImageUrl;
                    ogTags['og:image:type'] = 'image/png';
                    ogTags['og:image:width'] = '1200';
                    ogTags['og:image:height'] = '630';
                    ogTags['twitter:card'] = 'summary_large_image';
                    ogTags['twitter:image'] = dynamicImageUrl;
                    ogTags['twitter:title'] = ogTags['og:title'];
                    ogTags['twitter:description'] = ogTags['og:description'];

                    console.log(`[Worker v5] Applying HTMLRewriter for token ${mint}...`);
                    // Return the *cloned* response transformed
                    return new HTMLRewriter()
                        .on('head', new MetaTagHandler(ogTags))
                        .transform(clonedResponse);
                } else {
                    // Not HTML, return the cloned response as-is
                    console.log(`[Worker v5] Non-HTML (${contentType}) for token route ${mint}, returning original response.`);
                    return clonedResponse;
                }
            } catch (e) {
                console.error(`[Worker v5] Error fetching/rewriting token route ${mint}:`, e);
                // Fallback: Try fetching the original request again without rewriting on error
                try {
                     return await env.ASSETS.fetch(request);
                } catch (fallbackError) {
                    console.error(`[Worker v5] Fallback env.ASSETS.fetch also failed:`, fallbackError);
                    return new Response('Error processing request.', { status: 500 });
                }
            }
        } else {
            // --- Not a token route, pass through directly --- 
            console.log(`[Worker v5] Path ${url.pathname} is not a token route. Passing through.`);
            try {
                return await env.ASSETS.fetch(request);
            } catch (e) {
                 console.error(`[Worker v5] Error during passthrough env.ASSETS.fetch for ${url.pathname}:`, e);
                 return new Response('Error fetching asset.', { status: 500 });
            }
        }
    }
}; 