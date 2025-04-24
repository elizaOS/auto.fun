// packages/client/functions/_middleware.ts

// --- Added Import ---
import { HTMLRewriter, type PagesFunction, type Element } from '@cloudflare/workers-types';

// Define the shape of the environment variables
interface Env {
  // Add other environment variables if needed, e.g., for API calls
  ASSETS: {
    fetch: typeof fetch;
  };
}

// Define the handler for meta tags
class MetaTagHandler {
  private tags: Record<string, string>;

  constructor(tags: Record<string, string>) {
    this.tags = tags;
  }

  element(element: Element) {
    let tagsHtml = '';
    for (const [property, content] of Object.entries(this.tags)) {
      // Use property for og:, name for twitter:*, default to property otherwise
      const attrName = property.startsWith('og:') ? 'property' : (property.startsWith('twitter:') ? 'name' : 'property'); 
      // Escape content to prevent HTML injection issues
      const escapedContent = content.replace(/"/g, '&quot;'); 
      tagsHtml += `<meta ${attrName}="${property}" content="${escapedContent}">\n`;
    }

    // Add standard width/height if an image is set
    if (this.tags['og:image']) {
        tagsHtml += '<meta property="og:image:width" content="1200">\n';
        tagsHtml += '<meta property="og:image:height" content="630">\n';
    }

    // Prepend the block of new tags to the start of the <head>
    element.prepend(tagsHtml, { html: true });
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Only intercept requests for HTML pages (typically no file extension, or .html)
  // Adjust this condition if your routing/URL structure is different
  const isHtmlRequest = !url.pathname.includes('.') || url.pathname.endsWith('.html');

  if (request.method === 'GET' && isHtmlRequest) {
    // Exclude API routes or other specific paths if necessary
    if (url.pathname.startsWith('/api/')) {
      return next(); // Pass through API requests
    }

    // Pass through asset requests (like JS, CSS, images served directly)
    // More robust check for static assets
     const assetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json', '.webmanifest', '.br', '.txt'];
     if (assetExtensions.some(ext => url.pathname.endsWith(ext))) {
         return next();
     }

    let response = await env.ASSETS.fetch(request); // Fetch the original asset (index.html)

    // Ensure we're modifying an HTML response
    if (response.headers.get('Content-Type')?.startsWith('text/html')) {
      const tokenPathRegex = /^\/token\/([a-zA-Z0-9]{32,44})$/;
      const match = url.pathname.match(tokenPathRegex);

      let ogTags: Record<string, string> = {};

      if (match && match[1]) {
        // --- Token Route --- 
        const mint = match[1];
        const apiBaseUrl = url.origin; // Assume API is on the same origin
        const dynamicImageUrl = `${apiBaseUrl}/api/og-image/${mint}.png`;

        // TODO (Optional): Fetch minimal token data here for better title/description
        // Example (needs error handling & potentially using context.env for API keys):
        // try {
        //   const tokenApiUrl = `${apiBaseUrl}/api/token/${mint}`;
        //   const tokenRes = await fetch(tokenApiUrl);
        //   if (tokenRes.ok) {
        //      const tokenData = await tokenRes.json();
        //      ogTags['og:title'] = `${tokenData.name} (${tokenData.ticker}) - auto.fun`;
        //      ogTags['og:description'] = tokenData.description || `View details for ${tokenData.name} on auto.fun`;
        //   } else { throw new Error('Failed to fetch token data'); }
        // } catch (e) {
        //   console.error("Edge function error fetching token data:", e);
           // Use generic tags if API call fails
           ogTags['og:title'] = `Token ${mint.substring(0, 6)}... - auto.fun`;
           ogTags['og:description'] = `View details for token ${mint} on auto.fun`;
        // }

        ogTags['og:url'] = url.toString();
        ogTags['og:image'] = dynamicImageUrl;
        ogTags['og:image:type'] = 'image/png';
        ogTags['twitter:card'] = 'summary_large_image';
        ogTags['twitter:image'] = dynamicImageUrl;
        // Copy title/description for Twitter if not set separately
        if (!ogTags['twitter:title']) ogTags['twitter:title'] = ogTags['og:title'];
        if (!ogTags['twitter:description']) ogTags['twitter:description'] = ogTags['og:description'];

      } else {
        // --- Default Route --- 
        ogTags['og:title'] = 'auto.fun';
        ogTags['og:description'] = 'press the fun button';
        ogTags['og:url'] = url.toString();
        ogTags['og:image'] = `${url.origin}/og.png`; // Use absolute URL for default image
        ogTags['og:image:type'] = 'image/png';
        ogTags['twitter:card'] = 'summary_large_image';
        ogTags['twitter:title'] = 'auto.fun';
        ogTags['twitter:description'] = 'press the fun button';
        ogTags['twitter:image'] = `${url.origin}/og.png`;
      }

      // Rewrite the HTML response
      return new HTMLRewriter()
        .on('head', new MetaTagHandler(ogTags))
        .transform(response);
    }

    return response; // Return unmodified response if not HTML
  }

  // For non-GET requests or non-HTML requests, just pass through
  return next();
};
 