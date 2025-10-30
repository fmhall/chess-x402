import { config } from "dotenv";
import { Hono } from "hono";
import { serveStatic } from 'hono/bun'
import { paymentMiddleware, Network, Resource, SolanaAddress } from "x402-hono";
import { zValidator } from '@hono/zod-validator'
import * as z from 'zod'
import { inputSchemaToX402, zodToJsonSchema } from "./lib/schema";
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress;
const network = process.env.NETWORK as Network;

if (!facilitatorUrl || !payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}


const inputSchema = z.object({
  fen: z.string(),
  depth: z.number().optional().default(10),
});

// Validate the response data with zod
const responseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    evaluation: z.number(),
    bestmove: z.string(),
    mate: z.number().nullable(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

const app = new Hono();

console.log("Server is running");

app.use(
  paymentMiddleware(
    payTo,
    {
      "/best-move": {
        price: "$0.001",
        network,
        config: {
          discoverable: true, // make your endpoint discoverable
          description: "Get stockfish analysis for a given FEN",
          inputSchema: inputSchemaToX402(inputSchema),  
          outputSchema: zodToJsonSchema(responseSchema),
        }
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

// Serve static files from public directory
app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' }));
app.use('/og-image.png', serveStatic({ path: './public/og-image.png' }));

// https://stockfish.online/api/s/v2.php
app.get("/best-move",
  zValidator(
    'query',
    z.object({
      fen: z.string(),
      depth: z.string().optional().default("10"),
    })
  ),
  async c => {
    try {
      const { fen, depth } = c.req.valid('query');
      console.log(`[/best-move] Request - FEN: ${fen}, Depth: ${depth}`);

      const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;
      console.log(`[/best-move] Fetching: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[/best-move] API Error - Status: ${response.status} ${response.statusText}`);
        return c.json({
          success: false,
          error: `Stockfish API returned ${response.status}: ${response.statusText}`
        }, 500);
      }

      const data = await response.json();
      console.log(`[/best-move] Raw API Response:`, JSON.stringify(data, null, 2));
      
      const validatedData = responseSchema.parse(data);
      console.log(`[/best-move] Validation successful`);
      
      return c.json(validatedData);
    } catch (error) {
      console.error(`[/best-move] Error:`, error);
      
      if (error instanceof z.ZodError) {
        console.error(`[/best-move] Validation Error:`, JSON.stringify(error.issues, null, 2));
        return c.json({
          success: false,
          error: 'Invalid response format from Stockfish API',
          details: error.issues
        }, 500);
      }
      
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }, 500);
    }
  }
);


app.get("/", c => {
  const host = c.req.header('host') || 'localhost:4021';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chess Best Move x402 API</title>
        <link rel="icon" href="/favicon.ico" type="image/x-icon">
        <meta property="og:title" content="Chess Best Move x402 API" />
        <meta property="og:description" content="Get Stockfish chess analysis for any position - Monetized with x402" />
        <meta property="og:image" content="${protocol}://${host}/og-image.png" />
        <meta property="og:url" content="${protocol}://${host}" />
        <meta name="twitter:card" content="summary_large_image" />
        <style>
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
          }
          h1 { color: #1a1a1a; }
          .status { 
            background: #e8f5e9; 
            padding: 15px; 
            border-radius: 8px;
            margin: 20px 0;
          }
          .endpoint {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            font-family: 'Courier New', monospace;
          }
          code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
          }
          a { color: #1976d2; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>♟️ Chess Best Move x402 API</h1>
        <div class="status">
          <p><strong>Status:</strong> healthy ✓</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>Uptime:</strong> ${Math.floor(process.uptime())}s</p>
          <p><strong>Version:</strong> ${process.version}</p>
        </div>

        <h2>About</h2>
        <p>This API provides Stockfish chess engine analysis for any chess position using FEN notation. Each request costs $0.001 and is powered by the x402 payment protocol.</p>

        <h2>API Endpoint</h2>
        <div class="endpoint">
          GET /best-move?fen=&lt;FEN_STRING&gt;&depth=&lt;DEPTH&gt;
        </div>

        <h3>Parameters</h3>
        <ul>
          <li><code>fen</code> (required): FEN string representing the chess position</li>
          <li><code>depth</code> (optional): Analysis depth (1-30, default: 10)</li>
        </ul>

        <h3>Example</h3>
        <div class="endpoint">
          ${protocol}://${host}/best-move?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201&depth=15
        </div>

        <h2>Resources</h2>
        <p>
          If you made it here, you are probably developing an x402 app. 
          Here are the <a href="https://echo.merit.systems/docs" target="_blank">Docs</a>.
        </p>
        <p>
          DM me on Discord at <strong>@.masonhall</strong> with the keyword "The white rabbit told me to say 'Echo'" and I'll send you some free credits.
        </p>
      </body>
    </html>
  `);
});

export default {
  fetch: app.fetch,
  port: 4021,
}