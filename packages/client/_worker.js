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
      const escapedContent = content.replace(/"/g, '&quot;');
      tagsHtml += `<meta ${attrName}="${property}" content="${escapedContent}">\n`;
    }
    // Add standard width/height if an image is set
    if (this.tags['og:image']) {
      tagsHtml += '<meta property="og:image:width" content="1200">\n';
      tagsHtml += '<meta property="og:image:height" content="630">\n';
    }
    element.prepend(tagsHtml, { html: true });
  }
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    console.log(`[Worker] Request received for: ${url.pathname}`); // Log incoming path

    try {
      // --- Routing Logic ---

      // 1. API requests
      if (url.pathname.startsWith('/api/')) {
        console.log("[Worker] Path starts with /api/, letting it pass through...");
        // Assuming API handled elsewhere or by origin fetch
        return env.ASSETS.fetch(request); // Or just fetch(request) if proxied
      }

      // 2. Static Assets
      const assetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json', '.webmanifest', '.br', '.txt', '.map', '.woff', '.woff2'];
       if (assetExtensions.some(ext => url.pathname.endsWith(ext)) || url.pathname.includes('.')) { // Added broader check for files
           console.log(`[Worker] Path looks like an asset (${url.pathname}), serving static.`);
           return env.ASSETS.fetch(request);
       }

      // --- HTML Request Handling (SPA Fallback / OG Tags) ---
      console.log(`[Worker] Path is not API or known asset, assuming HTML request for: ${url.pathname}`);

      // --- TEMPORARY DEBUGGING ---
      // Instead of fetching index.html and using HTMLRewriter, return simple HTML
      console.log(`[Worker] Bypassing index.html fetch for path: ${url.pathname}. Returning simple HTML.`);
      return new Response('<html><head><title>Test Page</title></head><body><h1>Worker Responding (Debug)</h1></body></html>', {
        headers: { 'Content-Type': 'text/html' },
      });
      // --- END TEMPORARY DEBUGGING ---

      /* --- ORIGINAL LOGIC (Commented out for debugging) ---
      const spaRequest = new Request(new URL('/index.html', url.origin), request);
      let response = await env.ASSETS.fetch(spaRequest);

      // Ensure we got an HTML response
      if (response.headers.get('Content-Type')?.startsWith('text/html')) {
        console.log(`[Worker] Fetched index.html, proceeding with HTMLRewriter for ${url.pathname}`);
        const tokenPathRegex = /^\\/token\\/([a-zA-Z0-9]{32,44})$/;
        const match = url.pathname.match(tokenPathRegex);

        let ogTags = {};
        const defaultTitle = 'auto.fun';
        const defaultDescription = 'press the fun button';
        const siteBaseUrl = url.origin;

        if (match && match[1]) {
          // --- Token Route ---
          const mint = match[1];
          console.log(`[Worker] Matched token route for mint: ${mint}`);
          const dynamicImageUrl = `${siteBaseUrl}/api/og-image/${mint}.png`;
          ogTags['og:title'] = `Token ${mint.substring(0, 6)}... - ${defaultTitle}`;
          ogTags['og:description'] = `View details for token ${mint} on ${defaultTitle}`;
          ogTags['og:url'] = url.toString();
          ogTags['og:image'] = dynamicImageUrl;
          ogTags['og:image:type'] = 'image/png';
          ogTags['twitter:card'] = 'summary_large_image';
          ogTags['twitter:image'] = dynamicImageUrl;
          ogTags['twitter:title'] = ogTags['og:title'];
          ogTags['twitter:description'] = ogTags['og:description'];
        } else {
          // --- Default Route ---
          console.log(`[Worker] Using default OG tags for path: ${url.pathname}`);
          ogTags['og:title'] = defaultTitle;
          ogTags['og:description'] = defaultDescription;
          ogTags['og:url'] = url.toString();
          ogTags['og:image'] = `${siteBaseUrl}/og.png`; // Make sure og.png exists in your build output
          ogTags['og:image:type'] = 'image/png';
          ogTags['twitter:card'] = 'summary_large_image';
          ogTags['twitter:title'] = defaultTitle;
          ogTags['twitter:description'] = defaultDescription;
          ogTags['twitter:image'] = `${siteBaseUrl}/og.png`;
        }

        // Rewrite the HTML response
        console.log('[Worker] Applying HTMLRewriter...');
        // HTMLRewriter is global in Cloudflare Workers
        return new HTMLRewriter()
          .on('head', new MetaTagHandler(ogTags))
          .transform(response);
      } else {
        console.log(`[Worker] Fetched asset for ${url.pathname} was not HTML (${response.headers.get('Content-Type')}), returning directly.`);
        return response; // Return non-HTML response as-is
      }
      --- END ORIGINAL LOGIC --- */

    } catch (e) {
      console.error(`[Worker] Error during fetch for ${url.pathname}:`, e);
      // Optionally return a custom error page or simple error response
      return new Response('An error occurred processing the request.', { status: 500 });
    }
  },
}; 