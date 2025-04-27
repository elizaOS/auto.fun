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

// Function to safely load the logo buffer - REMOVED as it's no longer used
/*
async function loadLogoBuffer(logoPath: string): Promise<Buffer | null> {
    try {
        // Check if file exists before attempting to read
        if (fs.existsSync(logoPath)) {
            return await sharp(logoPath).toBuffer();
        } else {
            logger.warn(`[OG Image Gen] Logo file not found at: ${logoPath}`);
            return null;
        }
    } catch (error) {
        logger.error(`[OG Image Gen] Error loading logo from ${logoPath}:`, error);
        return null;
    }
}
*/

export async function generateOgImage(mint: string): Promise<Buffer> {
    logger.log(`[OG Image Gen] Starting generation for mint: ${mint}`);
    const db = getDB();

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

        // Load and Prepare logo_wide.svg - REMOVED
        /*
        const logoWidePath = path.resolve(__dirname, '../static/logo_wide.svg');
        const logoWideBuffer = await loadLogoBuffer(logoWidePath);
        let resizedLogoWideBuffer: Buffer | null = null;
        let logoWideFinalWidth = 0;
        let logoWideFinalHeight = 0;

        if (logoWideBuffer) {
            const metadata = await sharp(logoWideBuffer).metadata();
            const originalWidth = metadata.width ?? 100;
            const originalHeight = metadata.height ?? 50;
            logoWideFinalWidth = originalWidth * 4;
            logoWideFinalHeight = originalHeight * 4;

            resizedLogoWideBuffer = await sharp(logoWideBuffer)
                .resize(logoWideFinalWidth, logoWideFinalHeight)
                .toBuffer();
        }
        */

        // Calculate wide logo position - REMOVED
        /*
        const logoWideX = 0; // Flush left
        const logoWideY = height - logoWideFinalHeight; // Flush bottom
        */

        // Format text data
        const priceText = formatCurrency(priceUSD, priceUSD < 0.01 ? 6 : 2);
        const marketCapText = formatMarketCap(marketCapUSD);
        const cashtagText = `$${ticker.toUpperCase()}`;

        // --- Dynamic Text Styling & Positioning ---
        const baseCashtagFontSize = 100;
        const baseTitleFontSize = 50;
        const dataFontSize = 76;
        const labelFontSize = 34;
        // CJK character detection (Unicode range for common CJK ideographs)
        const cjkRegex = /[\u4E00-\u9FFF]/;
        const hasCJK = cjkRegex.test(name) || cjkRegex.test(ticker);
        const fontFamily = hasCJK
            ? "'Noto Sans CJK', Arial, sans-serif" // Prioritize Noto Sans CJK if CJK chars detected
            : "'Arial', sans-serif"; // Default to Arial
        const textAnchor = 'end'; // Right justified

        // Calculate dynamic cashtag font size
        const maxTickerLength = 7;
        let dynamicCashtagFontSize = baseCashtagFontSize;
        if (ticker.length > maxTickerLength) {
            dynamicCashtagFontSize = Math.max(30, Math.floor(baseCashtagFontSize * Math.pow(maxTickerLength / ticker.length, 1.2))); // Added min size
            logger.log(`[OG Image Gen] Ticker "${ticker}" is long (${ticker.length}), reducing cashtag font size to ${dynamicCashtagFontSize}`);
        }

        // Calculate dynamic title font size and handle line breaking
        const maxNameLengthSingleLine = 12;
        const breakNameLength = 24;
        let dynamicTitleFontSize = baseTitleFontSize;
        let nameLine1 = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Escape HTML entities
        let nameLine2 = '';
        const titleLineHeightFactor = 1.2; // Factor to control line spacing

        if (name.length >= breakNameLength) {
            dynamicTitleFontSize = 40; // Fixed smaller size for two lines
            // Find a space near the middle to break the line
            const middle = Math.floor(name.length / 2);
            let breakPoint = name.lastIndexOf(' ', middle); // Look for space before middle
            if (breakPoint === -1) { // No space found before middle, look after
                breakPoint = name.indexOf(' ', middle);
            }
            if (breakPoint !== -1) {
                nameLine1 = name.substring(0, breakPoint).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                nameLine2 = name.substring(breakPoint + 1).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            } else {
                // No space found, just split crudely (or maybe truncate?) - simple split for now
                nameLine1 = name.substring(0, middle).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                nameLine2 = name.substring(middle).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            
            logger.log(`[OG Image Gen] Name "${name}" is very long (${name.length}), breaking into two lines and reducing title font size to ${dynamicTitleFontSize}`);
        } else if (name.length > maxNameLengthSingleLine) {
            // Scale down more aggressively using a power function (exponent > 1)
            const scaleFactor = Math.pow(maxNameLengthSingleLine / name.length, 1.6); // Exponent 1.5 for faster scaling
            dynamicTitleFontSize = Math.max(30, Math.floor(baseTitleFontSize * scaleFactor)); // Ensure minimum size 30

            console.log('*** scaleFactor', scaleFactor);
            console.log('*** dynamicTitleFontSize', dynamicTitleFontSize)


            logger.log(`[OG Image Gen] Name "${name}" is long (${name.length}), reducing title font size to ${dynamicTitleFontSize} using aggressive scaling`);
        }
 
        // Define text styles using dynamic sizes
        const cashtagStyle = `fill: ${textColorTop}; font-size: ${dynamicCashtagFontSize}px; font-family: ${fontFamily}; font-weight: 900; text-anchor: ${textAnchor};`;
        const titleStyle = `fill: ${textColorTop}; font-size: ${dynamicTitleFontSize}px; font-family: ${fontFamily}; font-weight: bold; text-anchor: ${textAnchor};`;
        const labelBottomStyle = `fill: ${labelColorBottom}; font-size: ${labelFontSize}px; font-family: ${fontFamily}; text-anchor: ${textAnchor};`;
        const valueBottomStyle = `fill: ${valueColorBottom}; font-size: ${dataFontSize}px; font-family: ${fontFamily}; font-weight: bold; text-anchor: ${textAnchor};`;


        // --- Calculate Text Positions (relative to right-half SVG using textPadding) ---
        const svgRightWidth = rightAreaWidth;
        const svgRightHeight = height;
        const textXInSvg = svgRightWidth - textPadding;

        // Top section text (within top 40% green area)
        // Adjust vertical positioning for consistent top anchor and spacing
        const topSectionCenterY = rightTopHeight / 2;
        const cashtagBaselineAdjust = dynamicCashtagFontSize * 0.75; // Approx baseline position
        const titleBaselineAdjust = dynamicTitleFontSize * 0.75;    // Approx baseline position
        const cashtagToTitleGap = 15; // Fixed gap between bottom of cashtag and top of title

        // Calculate total approximate height for vertical centering adjustment
        let approxTitleHeight = dynamicTitleFontSize;
        if (nameLine2) {
            approxTitleHeight += dynamicTitleFontSize * titleLineHeightFactor;
        }
        const totalApproxHeight = dynamicCashtagFontSize + cashtagToTitleGap + approxTitleHeight;
        const additionalTopPadding = 15; // Add 15px extra padding at the top
        const startYOffset = (topSectionCenterY - totalApproxHeight / 2) + additionalTopPadding;

        // Position Cashtag based on adjusted start Y
        const cashtagYInSvg = startYOffset + cashtagBaselineAdjust;

        // Position Title Line 1 relative to Cashtag
        const titleYInSvgLine1 = cashtagYInSvg + (dynamicCashtagFontSize - cashtagBaselineAdjust) + cashtagToTitleGap + titleBaselineAdjust;

        // Position Title Line 2 relative to Line 1
        let titleYInSvgLine2: number | null = null;
        if (nameLine2) {
            titleYInSvgLine2 = titleYInSvgLine1 + dynamicTitleFontSize * titleLineHeightFactor;
        }


        // Bottom section text (within bottom 60% black area, relative to top of bottom section)
        // Use textPadding for bottom edge alignment within the SVG (relative to overall height)
        // Positions remain relative to the bottom, unaffected by top text changes
        const mcapValueYInSvg = svgRightHeight - textPadding; // Anchor to overall bottom padding
        const mcapLabelYInSvg = mcapValueYInSvg - dataFontSize * 1.1; // Space above value
        const priceValueYInSvg = mcapLabelYInSvg - labelFontSize * 2.5; // Reduced multiplier for smaller gap
        const priceLabelYInSvg = priceValueYInSvg - dataFontSize * 1.1; // Space above price value


        // Generate Name Lines HTML
        let nameSvgLines = `<text x="${textXInSvg}" y="${titleYInSvgLine1}" style="${titleStyle}">${nameLine1}</text>`;
        if (nameLine2 && titleYInSvgLine2) {
            nameSvgLines += `\n            <text x="${textXInSvg}" y="${titleYInSvgLine2}" style="${titleStyle}">${nameLine2}</text>`;
        }

        const svgTextOverlay = `
        <svg width="${svgRightWidth}" height="${svgRightHeight}" viewBox="0 0 ${svgRightWidth} ${svgRightHeight}">
            <style>
                /* Define styles directly here using calculated values */
                .cashtag { ${cashtagStyle} }
                .title { ${titleStyle} } /* Style for title is now applied directly */
                .label-bottom { ${labelBottomStyle} }
                .value-bottom { ${valueBottomStyle} }
            </style>

            {/* Background Rects for Right Half - Drawn first */}
            <rect x="0" y="0" width="${svgRightWidth}" height="${svgRightHeight}" fill="${rightBgColorBottom}" />
            <rect x="0" y="0" width="${svgRightWidth}" height="${rightTopHeight}" fill="${rightBgColorTop}" />

            {/* Top Aligned Text (On Green) */}
            <text x="${textXInSvg}" y="${cashtagYInSvg}" class="cashtag">${cashtagText}</text>
            ${nameSvgLines} {/* Insert single or double line name SVG */}

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

        // Add wide logo overlay if loaded - REMOVED
        /*
        if (resizedLogoWideBuffer) {
             const finalLogoX = Math.max(0, Math.round(logoWideX));
             const finalLogoY = Math.max(0, Math.round(logoWideY));
             // Check bounds before adding
             if (finalLogoX >= 0 && finalLogoY >= 0 && finalLogoX + logoWideFinalWidth <= width && finalLogoY + logoWideFinalHeight <= height) {
                compositeOperations.push({
                    input: resizedLogoWideBuffer,
                    top: finalLogoY,
                    left: finalLogoX
                });
                logger.log(`[OG Image Gen] Adding resized logo_wide.svg at (${finalLogoX}, ${finalLogoY})`);
             } else {
                 logger.warn(`[OG Image Gen] Resized logo_wide.svg position (${finalLogoX}, ${finalLogoY}) with dimensions (${logoWideFinalWidth}x${logoWideFinalHeight}) exceeds canvas bounds or has negative coordinates. Skipping.`);
             }
        } else {
            logger.warn(`[OG Image Gen] logo_wide.svg could not be loaded or resized. Skipping overlay.`);
        }
        */

        const finalImageBuffer = await baseCanvas
            .composite(compositeOperations)
            .png()
            .toBuffer();

        logger.log(`[OG Image Gen] Successfully generated image for ${mint}`);
        return finalImageBuffer;

} 