import { config } from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, Network, Resource, SolanaAddress } from "x402-hono";
import { zValidator } from '@hono/zod-validator'
import * as z from 'zod'
config();

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const payTo = process.env.ADDRESS as `0x${string}` | SolanaAddress;
const network = process.env.NETWORK as Network;

if (!facilitatorUrl || !payTo || !network) {
  console.error("Missing required environment variables");
  process.exit(1);
}

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
          inputSchema: { 
            queryParams: { 
              fen: JSON.stringify({ 
                type: "string", 
                description: "FEN string (e.g., 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')", 
                required: "true"
            }),
              depth: JSON.stringify(  { 
                type: "string", 
                description: "Depth of the analysis (1-30, default 10)", 
                required: "false"
              })
            }
          },
          outputSchema: {
            type: "object",
            properties: { 
              success: { type: "boolean", description: "Whether the request was successful" },
              evaluation: { type: "number", description: "The evaluation of the position" },
              bestmove: { type: "string", description: "The best move for the position" },
              mate: { type: "number", description: "The number of moves to mate the opponent (can be null)" },
            }
          }
        }
      },
    },
    {
      url: facilitatorUrl,
    },
  ),
);

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
  return c.json({
    message: "Get the best move for a given FEN",
  });
});

serve({
  fetch: app.fetch,
  port: 4021,
});