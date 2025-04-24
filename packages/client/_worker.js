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
    // Conditionally add width/height if it's the *static* OG image
    if (this.tags['og:image'] && this.tags['og:image'].endsWith('/og.png')) {
         tagsHtml += '<meta property="og:image:width" content="1200">\n';
         tagsHtml += '<meta property="og:image:height" content="630">\n';
    }
    element.prepend(tagsHtml, { html: true });
  }
}


export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        console.log(`[Worker v3] Request: ${url.pathname}`);
        console.log(`[Worker v3] Full URL received: ${url.href}`);

        // Let API requests pass through to be handled by the backend/functions
        if (url.pathname.startsWith('/api/')) {
            console.log("[Worker v3] API request, passing through.");
            // Allow Pages to handle this - it might route to a Function, serve a static file, or 404.
            return env.ASSETS.fetch(request);
        }

        // Fetch the asset AS IS from the Pages platform first.
        // This handles static assets AND the index.html for SPA routes correctly.
        console.log(`[Worker v3] Fetching asset/page via env.ASSETS.fetch for: ${url.pathname}`);
        console.log(`[Worker v3] Original request URL passed to ASSETS.fetch: ${request.url}`);
        let response = await env.ASSETS.fetch(request);

        // Clone the response so we can read headers and still use the body
        response = new Response(response.body, response);

        // Check if it's an HTML response - only modify HTML
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.toLowerCase().includes('text/html')) {
            console.log(`[Worker v3] HTML detected for ${url.pathname}. Rewriting OG tags.`);

            const tokenPathRegex = /^\/token\/([a-zA-Z0-9]{32,44})$/;
            const match = url.pathname.match(tokenPathRegex);

            let ogTags = {};
            const defaultTitle = 'auto.fun';
            const defaultDescription = 'press the fun button';
            // Use url.origin which correctly reflects the current domain (pages.dev or custom)
            const siteBaseUrl = url.origin;
            const serverUrl = env.SERVER_URL || 'https://api.auto.fun';

            if (match && match[1]) {
                // --- Dynamic Token Route ---
                const mint = match[1];
                console.log(`[Worker v3] Matched token route: ${mint}`);
                // Point og:image to the API endpoint that generates the image
                const dynamicImageUrl = `${serverUrl}/api/og-image/${mint}.png`;
                ogTags['og:title'] = `Token ${mint.substring(0, 4)}...${mint.substring(mint.length - 4)} - ${defaultTitle}`;
                ogTags['og:description'] = `View ${mint.substring(0,4)}...${mint.substring(mint.length - 4)} on ${defaultTitle}.`; // More concise
                ogTags['og:url'] = url.toString(); // Current full URL
                ogTags['og:image'] = dynamicImageUrl;
                ogTags['og:image:type'] = 'image/png'; // The API serves PNG
                // Width/Height are implicitly set by the generated image via the API
                 ogTags['og:image:width'] = '1200'; // Specify standard dimensions
                 ogTags['og:image:height'] = '630';
                ogTags['twitter:card'] = 'summary_large_image';
                ogTags['twitter:image'] = dynamicImageUrl;
                ogTags['twitter:title'] = ogTags['og:title'];
                ogTags['twitter:description'] = ogTags['og:description'];

            } else {
                // --- Default Route (e.g., /) ---
                console.log(`[Worker v3] Default OG tags for path: ${url.pathname}`);
                ogTags['og:title'] = defaultTitle;
                ogTags['og:description'] = defaultDescription;
                ogTags['og:url'] = url.toString(); // Current full URL
                ogTags['og:image'] = `${siteBaseUrl}/og.png`; // Static default image
                ogTags['og:image:type'] = 'image/png';
                // Set width/height for the static default image
                ogTags['og:image:width'] = '1200';
                ogTags['og:image:height'] = '630';
                ogTags['twitter:card'] = 'summary_large_image';
                ogTags['twitter:title'] = defaultTitle;
                ogTags['twitter:description'] = defaultDescription;
                ogTags['twitter:image'] = `${siteBaseUrl}/og.png`;
            }

            // Apply the HTMLRewriter to inject meta tags into the <head>
            try {
                console.log(`[Worker v3] Applying HTMLRewriter...`);
                return new HTMLRewriter()
                    .on('head', new MetaTagHandler(ogTags))
                    .transform(response);
            } catch (rewriteError) {
                console.error(`[Worker v3] HTMLRewriter error for ${url.pathname}:`, rewriteError);
                // Return the original response if rewriting fails
                return response;
            }

        } else {
            // Not HTML, return original response (e.g., CSS, JS, images, etc.)
            console.log(`[Worker v3] Non-HTML content type (${contentType}), returning original response.`);
            return response;
        }
    }
}; 