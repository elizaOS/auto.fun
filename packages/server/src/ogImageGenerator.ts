import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import path from 'node:path'; // Import path for resolving asset path
import fs from 'node:fs'; // Import fs for checking file existence
import { getDB, tokens } from './db';
import { eq } from 'drizzle-orm';
import { logger } from './util';
import { getSOLPrice } from './mcap'; // Assuming this is available and gives SOL price

// --- Helper Functions ---

// Simple fetch with timeout
async function fetchWithTimeout(resource: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
    const { timeout = 8000 } = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);

    return response;
}

// Format numbers nicely
function formatCurrency(value: number | null | undefined, decimals: number = 2): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '$--';
    }
    return Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

function formatMarketCap(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '$--';
    }
    if (value >= 1_000_000_000) {
        return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (value >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
        return `$${(value / 1_000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
}

// --- Main Generation Function ---

// Function to safely load the logo buffer
async function loadLogoBuffer(logoPath: string, density: number | null = null): Promise<Buffer | null> {
    try {
        // Check if file exists before attempting to read
        if (fs.existsSync(logoPath)) {
            let sharpInstance = sharp(logoPath);
            if (density !== null) {
                sharpInstance = sharp(logoPath, { density });
            }
            return await sharpInstance.toBuffer();
        } else {
            logger.warn(`[OG Image Gen] Logo file not found at: ${logoPath}`);
            return null;
        }
    } catch (error) {
        logger.error(`[OG Image Gen] Error loading logo from ${logoPath}:`, error);
        return null;
    }
}

export async function generateOgImage(mint: string): Promise<Buffer> {
    logger.log(`[OG Image Gen] Starting generation for mint: ${mint}`);
    const db = getDB();

    try {
        // 1. Fetch Token Data (including ticker)
        const tokenDataResult = await db
            .select({
                name: tokens.name,
                ticker: tokens.ticker,
                image: tokens.image,
                tokenPriceUSD: tokens.tokenPriceUSD,
                marketCapUSD: tokens.marketCapUSD,
                solPriceUSD: tokens.solPriceUSD // Needed if price is in SOL
            })
            .from(tokens)
            .where(eq(tokens.mint, mint))
            .limit(1);

        if (!tokenDataResult || tokenDataResult.length === 0) {
            throw new Error(`Token not found: ${mint}`);
        }
        const token = tokenDataResult[0];

        const name = token.name || 'Unknown Token';
        const ticker = token.ticker || 'TOKEN';
        const imageUrl = token.image;
        const priceUSD = token.tokenPriceUSD ?? 0;
        const marketCapUSD = token.marketCapUSD ?? 0;

        logger.log(`[OG Image Gen] Fetched data for ${name}: Price=${priceUSD}, MCAP=${marketCapUSD}, Image=${imageUrl}`);

        if (!imageUrl) {
            throw new Error(`Token ${mint} has no image URL.`);
        }

        // 2. Fetch Base Image (Token Image)
        let imageResponse: Response;
        try {
            logger.log(`[OG Image Gen] Fetching base image: ${imageUrl}`);
            imageResponse = await fetchWithTimeout(imageUrl, { timeout: 10000 }); // 10s timeout
            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch image (${imageResponse.status}): ${imageUrl}`);
            }
        } catch (fetchError) {
            logger.error(`[OG Image Gen] Error fetching base image ${imageUrl}:`, fetchError);
            throw new Error(`Could not fetch base image for token ${mint}.`);
        }
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        logger.log(`[OG Image Gen] Fetched base image successfully (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

        // 3. Image Manipulation
        const width = 1200;
        const height = 630;
        const sidePadding = 50;   // Padding for elements near the left edge
        const textPadding = 60;   // <<< CONSISTENT PADDING for text area (top, right, bottom)
        const rightBgColorTop = '#03FF24'; // Green
        const rightBgColorBottom = '#000000'; // Black
        const textColorTop = '#000000'; // Black
        const labelColorBottom = '#FFFFFF'; // White
        const valueColorBottom = '#03FF24'; // Green

        // Left Area Dimensions
        const leftAreaWidth = width / 2;

        // Right Area Dimensions & Split
        const rightAreaWidth = width / 2;
        const rightTopHeight = height * 0.4; // Make top section 40% of height
        const rightBottomHeight = height * 0.6; // Bottom section is 60%

        // Prepare base image (token logo) - Resize to fill left half
        const baseImageProcessed = await sharp(imageBuffer)
            .resize(leftAreaWidth, height, { fit: 'cover' }) // Cover left half
            .toBuffer();

        // Load and Prepare logo_wide.svg with higher density for better scaling
        const logoWidePath = path.resolve(__dirname, '../static/logo_wide.svg');
        const logoWideBuffer = await loadLogoBuffer(logoWidePath, 300); // Load with 300 DPI
        let resizedLogoWideBuffer: Buffer | null = null;
        let logoWideFinalWidth = 0;
        let logoWideFinalHeight = 0;

        if (logoWideBuffer) {
            const metadata = await sharp(logoWideBuffer).metadata();
            const originalWidth = metadata.width ?? 100;
            const originalHeight = metadata.height ?? 50;
            // Increase size by 100% from previous (multiply original by 4)
            logoWideFinalWidth = originalWidth * 4;
            logoWideFinalHeight = originalHeight * 4;

            resizedLogoWideBuffer = await sharp(logoWideBuffer)
                .resize(logoWideFinalWidth, logoWideFinalHeight)
                .toBuffer();
        }

        // Calculate wide logo position (Flush Bottom-Left)
        const logoWideX = 0; // Flush left
        const logoWideY = height - logoWideFinalHeight; // Flush bottom

        // Format text data
        const priceText = formatCurrency(priceUSD, priceUSD < 0.01 ? 6 : 2);
        const marketCapText = formatMarketCap(marketCapUSD);
        const cashtagText = `$${ticker.toUpperCase()}`;

        // Define text styles
        const cashtagFontSize = 110; // Increased size again
        const titleFontSize = 60;   // Increased size
        const dataFontSize = 76;    // Increased size for values
        const labelFontSize = 34;   // Keep label size the same
        const fontFamily = 'Arial, sans-serif'; // Ensure Arial
        // Text colors are now defined above and applied in SVG styles
        const textAnchor = 'end'; // Right justified

        // --- Calculate Text Positions (relative to right-half SVG using textPadding) ---
        const svgRightWidth = rightAreaWidth;
        const svgRightHeight = height;
        // Use textPadding for the right edge alignment within the SVG
        const textXInSvg = svgRightWidth - textPadding;

        // Top section text (within top 40% green area)
        // Center vertically within the top section (rightTopHeight)
        const topSectionCenterY = rightTopHeight / 2;
        const topTextTotalHeight = cashtagFontSize + titleFontSize * 0.5; // Approx height + spacing
        const cashtagYInSvg = topSectionCenterY - topTextTotalHeight / 2 + cashtagFontSize * 0.7; // Adjust for baseline
        const titleYInSvg = cashtagYInSvg + titleFontSize * 1.2; // Space below cashtag

        // Bottom section text (within bottom 60% black area, relative to top of bottom section)
        const bottomSectionStartY = rightTopHeight; // Y position where the bottom section starts
        // Use textPadding for bottom edge alignment within the SVG (relative to overall height)
        const mcapValueYInSvg = svgRightHeight - textPadding; // Anchor to overall bottom padding
        const mcapLabelYInSvg = mcapValueYInSvg - dataFontSize * 1.1; // Space above value (uses new dataFontSize)
        // Decrease gap above market cap block slightly to move price down
        const priceValueYInSvg = mcapLabelYInSvg - labelFontSize * 2.5; // Reduced multiplier for smaller gap
        const priceLabelYInSvg = priceValueYInSvg - dataFontSize * 1.1; // Space above price value (uses new dataFontSize)


        const svgTextOverlay = `
        <svg width="${svgRightWidth}" height="${svgRightHeight}" viewBox="0 0 ${svgRightWidth} ${svgRightHeight}">
            <style>
                /* Top Section Styles */
                .cashtag { fill: ${textColorTop}; font-size: ${cashtagFontSize}px; font-family: ${fontFamily}; font-weight: 900; text-anchor: ${textAnchor}; } /* Bolder weight */
                .title { fill: ${textColorTop}; font-size: ${titleFontSize}px; font-family: ${fontFamily}; font-weight: bold; text-anchor: ${textAnchor}; }

                /* Bottom Section Styles */
                .label-bottom { fill: ${labelColorBottom}; font-size: ${labelFontSize}px; font-family: ${fontFamily}; text-anchor: ${textAnchor}; }
                .value-bottom { fill: ${valueColorBottom}; font-size: ${dataFontSize}px; font-family: ${fontFamily}; font-weight: bold; text-anchor: ${textAnchor}; }
            </style>

            {/* Background Rects for Right Half - Drawn first */}
            <rect x="0" y="0" width="${svgRightWidth}" height="${svgRightHeight}" fill="${rightBgColorBottom}" />
            <rect x="0" y="0" width="${svgRightWidth}" height="${rightTopHeight}" fill="${rightBgColorTop}" />

            {/* Top Aligned Text (On Green) */}
            <text x="${textXInSvg}" y="${cashtagYInSvg}" class="cashtag">${cashtagText}</text>
            <text x="${textXInSvg}" y="${titleYInSvg}" class="title">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>

            {/* Bottom Aligned Text (On Black) */}
            <text x="${textXInSvg}" y="${priceLabelYInSvg}" class="label-bottom">Price</text>
            <text x="${textXInSvg}" y="${priceValueYInSvg}" class="value-bottom">${priceText}</text>

            <text x="${textXInSvg}" y="${mcapLabelYInSvg}" class="label-bottom">Market Cap</text>
            <text x="${textXInSvg}" y="${mcapValueYInSvg}" class="value-bottom">${marketCapText}</text>
        </svg>
        `;

        // 4. Create Background and Composite
        // Base canvas is transparent
        const baseCanvas = sharp({ create: { width: width, height: height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

        const compositeOperations = [
             // Token image covering left half (Drawn first)
            { input: baseImageProcessed, top: 0, left: 0 },
            // Text SVG covering right half (includes its own background rects now)
            { input: Buffer.from(svgTextOverlay), top: 0, left: width / 2 }
        ];

        // Add wide logo overlay if loaded (position adjusted for reduced padding)
        if (resizedLogoWideBuffer) {
             const finalLogoX = Math.max(0, Math.round(logoWideX));
             const finalLogoY = Math.max(0, Math.round(logoWideY));
             if (finalLogoX + logoWideFinalWidth <= width && finalLogoY + logoWideFinalHeight <= height) {
                compositeOperations.push({
                    input: resizedLogoWideBuffer,
                    top: finalLogoY,
                    left: finalLogoX
                });
                logger.log(`[OG Image Gen] Adding resized logo_wide.svg at (${finalLogoX}, ${finalLogoY})`);
             } else {
                 logger.warn(`[OG Image Gen] Resized logo_wide.svg position (${finalLogoX}, ${finalLogoY}) with dimensions (${logoWideFinalWidth}x${logoWideFinalHeight}) exceeds canvas bounds. Skipping.`);
             }
        } else {
            logger.warn(`[OG Image Gen] logo_wide.svg could not be loaded or resized. Skipping overlay.`);
        }

        const finalImageBuffer = await baseCanvas
            .composite(compositeOperations)
            .png()
            .toBuffer();

        logger.log(`[OG Image Gen] Successfully generated image for ${mint}`);
        return finalImageBuffer;

    } catch (error) {
        logger.error(`[OG Image Gen] Failed to generate OG image for ${mint}:`, error);
        throw error;
    }
} 