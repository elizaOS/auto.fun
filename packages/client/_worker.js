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
  fetch(request, env, ctx) {
    console.log(`Minimal worker received: ${request.url}`);
    return new Response("Minimal Worker OK");
  }
}; 