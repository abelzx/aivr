import { NextApiRequest, NextApiResponse } from "next";

import Jimp from "jimp";
import OpenAI from "openai";
import { saveFile, extractFilenameFromMediaUrl } from "../../utils/storage";
import twilio from "twilio";
import sync from "../../utils/sync";

const generateImage = async (prompt: string, to: string) => {
  try {
    console.log(`Generating image for prompt: ${prompt}`);

    //
    // GENERATE IMAGE
    //
    // Auto-detect which API to use based on available API keys
    const useAzure = !!process.env.AZURE_OPENAI_API_KEY;
    const useOpenAI = !!process.env.OPENAI_API_KEY;

    if (!useAzure && !useOpenAI) {
      console.log("Error: No API key configured. Please set either OPENAI_API_KEY or AZURE_OPENAI_API_KEY");
      return;
    }

    let openai: any;
    if (useOpenAI) {
      // Use OpenAI directly
      openai = new (OpenAI as any)({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } else {
      // Use Azure OpenAI
      openai = new (OpenAI as any)({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
        defaultQuery: {
          "api-version": process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview",
        },
        defaultHeaders: {
          "api-key": process.env.AZURE_OPENAI_API_KEY,
        },
      });
    }

    const image_response = await openai.images.generate({
      prompt: prompt,
      size: "512x512",
    });

    //
    // COMPOSITE IMAGE
    //
    const image_target = await Jimp.read(image_response.data[0].url);
    const image_mask = await Jimp.read("https://images-5674.twil.io/mask.png");
    image_target.blit(image_mask, 0, 0);

    image_target.getBuffer(Jimp.MIME_PNG, async (err, masked_image_buffer) => {
      console.log("Got AI image");
      if (err) {
        console.log("Error getting image", err);
        return;
      }

      console.log("Returning masked image");
      //
      // UPLOAD IMAGE
      //
      try {
        const end_image_url = await saveFile(masked_image_buffer, Jimp.MIME_PNG);
        console.log(`Uploaded URL is ${end_image_url}`);

        //
        // SEND MESSAGE
        //
        const client = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );

        const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM_NUMBER;
        if (!whatsappFrom) {
          console.log("Error: TWILIO_WHATSAPP_FROM_NUMBER is not configured");
          return;
        }

        // Ensure phone numbers are in WhatsApp format
        const fromWhatsApp = whatsappFrom.startsWith("whatsapp:") ? whatsappFrom : `whatsapp:${whatsappFrom}`;
        const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

        // Construct status callback URL
        let baseUrl: string;
        if (process.env.NGROK_URL) {
          baseUrl = process.env.NGROK_URL;
        } else if (process.env.NEXT_PUBLIC_BASE_URL) {
          baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
        } else if (process.env.VERCEL_URL) {
          baseUrl = `https://${process.env.VERCEL_URL}`;
        } else if (process.env.NODE_ENV === 'production') {
          baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        } else {
          baseUrl = `http://localhost:${process.env.PORT || 3000}`;
        }
        baseUrl = baseUrl.replace(/\/$/, '');

        const message = await client.messages.create({
          body: "Yo!",
          from: fromWhatsApp,
          to: toWhatsApp,
          mediaUrl: [end_image_url],
          statusCallback: `${baseUrl}/api/status-webhook`,
        });

        // Store media filename for cleanup when message is delivered
        const filename = extractFilenameFromMediaUrl(end_image_url);
        if (filename) {
          // Store filename with MessageSid as key, expire after 7 days
          await sync.set(`media:${message.sid}`, JSON.stringify([filename]), { ex: 604800 });
          console.log(`Stored media filename for message ${message.sid}:`, filename);
        }
      } catch (error) {
        console.log("Error uploading file", error);
        return;
      }
    });
  } catch (error) {
    console.log("Error processing image mask", error);
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // console.log("Request", req);

  const { query } = req;

  if (!query.api_key || query.api_key != process.env.API_KEY) {
    return res.status(401).json({ message: "API Key incorrect" });
  }

  if (!query.prompt) {
    return res.status(400).json({ message: "Missing prompt" });
  }

  if (!query.to) {
    return res.status(400).json({ message: "Missing 'to'" });
  }

  generateImage(query.prompt as string, query.to as string).then(() => {
    console.log("Image generation complete");
  });

  res.status(200).json({ message: "Image generation started" });
}
