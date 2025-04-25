// packages/client/_worker.js

// MetaTagHandler class needed for token route rewriting
class MetaTagHandler {
  constructor(tags) {
    this.tags = tags;
  }

  element(element) {
    let tagsHtml = '';
    for (const [property, content] of Object.entries(this.tags)) {
      const attrName = property.startsWith('og:') ? 'property' : (property.startsWith('twitter:') ? 'name' : 'property');
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
        console.log(`[Worker V6] Request: ${url.pathname}, Full URL: ${url.href}`);

        const isRootPath = url.pathname === '/';
        // Check url.search for query params - more reliable than checking href
        const hasDevQuery = url.search.includes('dev');
        // Check hostname for localhost variants
        const isLocalhost = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '127.0.0.1';

        // --- Redirect Logic moved from main.tsx ---
        // Only apply this redirect logic if the request is for the root path '/'
        if (isRootPath && !hasDevQuery && !isLocalhost) {
            console.log(`[Worker V6] Root path without ?dev on non-localhost. Redirecting to Twitter.`);
            // Use a temporary redirect (302)
            return Response.redirect("https://twitter.com/autodotfun", 302);
        }

        // --- Passthrough or Token Rewriting ---
        // For root path with ?dev, localhost root, or any other path:
        // Let Cloudflare Pages handle fetching the asset (index.html, css, js, /token/*)
        console.log(`[Worker V6] Passing request through to env.ASSETS.fetch for: ${url.pathname}${url.search}`);
        try {
            // We still need to potentially rewrite OG tags for /token/* routes,
            // so we always fetch first for non-redirected root or other paths.
            const response = await env.ASSETS.fetch(request);

            // Clone response to check headers safely
            let clonedResponse = new Response(response.body, response);
            const contentType = clonedResponse.headers.get('Content-Type');

            // Only proceed with rewriting if it's an HTML response
            if (contentType && contentType.toLowerCase().includes('text/html')) {
                const tokenPathRegex = /^\/token\/([a-zA-Z0-9]{32,44})$/;
                const match = url.pathname.match(tokenPathRegex);
                let ogTags = {};
                const defaultTitle = 'auto.fun';

                if (match && match[1]) {
                    // --- Generate Token-Specific OG Tags ---
                    const mint = match[1];
                    console.log(`[Worker V6] Rewriting OG tags for token route: ${mint}`);
                    const serverUrl = env.SERVER_URL || 'https://api.auto.fun'; // Use env var
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
                    // --- End Token OG Tag Generation ---
                } else {
                    // --- Generate Default OG Tags ---
                    console.log(`[Worker V6] Rewriting default OG tags for: ${url.pathname}`);
                    const defaultImageUrl = `${url.origin}/og.png`; // Use origin + relative path

                    ogTags['og:title'] = defaultTitle;
                    ogTags['og:description'] = 'Explore and analyze Solana tokens.'; // Generic description
                    ogTags['og:url'] = url.toString();
                    ogTags['og:image'] = defaultImageUrl;
                    ogTags['og:image:type'] = 'image/png';
                    ogTags['og:image:width'] = '1200';
                    ogTags['og:image:height'] = '630';
                    ogTags['twitter:card'] = 'summary_large_image';
                    ogTags['twitter:image'] = defaultImageUrl;
                    ogTags['twitter:title'] = defaultTitle;
                    ogTags['twitter:description'] = ogTags['og:description'];
                    // --- End Default OG Tag Generation ---
                }

                // Apply Rewriter with the determined tags
                return new HTMLRewriter()
                    .on('head', new MetaTagHandler(ogTags))
                    .transform(clonedResponse);

            } else {
                // Not HTML, return the original response (use the already cloned one)
                console.log(`[Worker V6] Response is not HTML (${contentType}), returning original.`);
                return clonedResponse;
            }
        } catch (e) {
             console.error(`[Worker V6] Error during env.ASSETS.fetch for ${url.pathname}:`, e);
             return new Response('Error fetching asset.', { status: 500 });
        }
    }
}; 