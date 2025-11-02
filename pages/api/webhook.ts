import { NextApiRequest, NextApiResponse } from "next";
import twilio from "twilio";
import sync from "../../utils/sync";
import OpenAI from "openai";
import Jimp from "jimp";
import { extractFilenameFromMediaUrl } from "../../utils/storage";

// Helper function to send WhatsApp message
const sendWhatsAppMessage = async (to: string, body: string, mediaUrl?: string[]) => {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM_NUMBER;
  if (!whatsappFrom) {
    throw new Error("TWILIO_WHATSAPP_FROM_NUMBER is not configured");
  }

  const messageOptions: any = {
    body: body,
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${to}`,
  };

  if (mediaUrl && mediaUrl.length > 0) {
    messageOptions.mediaUrl = mediaUrl;
    // Add status callback URL for tracking media message delivery
    // Construct the status webhook URL
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
    messageOptions.statusCallback = `${baseUrl}/api/status-webhook`;
  }

  const message = await client.messages.create(messageOptions);

  // Store media filenames for cleanup when message is delivered
  if (mediaUrl && mediaUrl.length > 0) {
    const filenames: string[] = [];
    for (const url of mediaUrl) {
      const filename = extractFilenameFromMediaUrl(url);
      if (filename) {
        filenames.push(filename);
      }
    }
    
    if (filenames.length > 0) {
      // Store filenames with MessageSid as key, expire after 7 days
      await sync.set(`media:${message.sid}`, JSON.stringify(filenames), { ex: 604800 });
      console.log(`Stored media filenames for message ${message.sid}:`, filenames);
    }
  }

  return message;
};

// Helper function to generate and send image
const generateImage = async (prompt: string, to: string) => {
  try {
    console.log(`Generating image for prompt: ${prompt} for WhatsApp: ${to}`);

    // Auto-detect which API to use based on available API keys
    const useAzure = !!process.env.AZURE_OPENAI_API_KEY;
    const useOpenAI = !!process.env.OPENAI_API_KEY;

    if (!useAzure && !useOpenAI) {
      console.log("Error: No API key configured. Please set either OPENAI_API_KEY or AZURE_OPENAI_API_KEY");
      await sendWhatsAppMessage(to, "Sorry, there was an error configuring the image generation service. Please try again later.");
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

    // Send processing message
    await sendWhatsAppMessage(to, "Generating your image... Please wait! 🎨");

    const image_response = await openai.images.generate({
      prompt: prompt,
      size: "1024x1024",
    });

    //
    // COMPOSITE IMAGE
    //
    const { saveFile } = await import("../../utils/storage");

    const image_target = await Jimp.read(image_response.data[0].url);
    const image_mask = await Jimp.read("https://sepia-loris-2302.twil.io/assets/twilio_mask.png");
    image_target.blit(image_mask, 0, 0);

    image_target.getBuffer(Jimp.MIME_PNG, async (err: Error | null, masked_image_buffer: Buffer) => {
      console.log("Got AI image");
      if (err) {
        console.log("Error getting image", err);
        await sendWhatsAppMessage(to, "Sorry, there was an error processing your image. Please try again.");
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
        await sendWhatsAppMessage(to, "Here's your generated image! 🎉", [end_image_url]);
      } catch (error) {
        console.log("Error uploading file", error);
        await sendWhatsAppMessage(to, "Sorry, there was an error uploading your image. Please try again.");
        return;
      }

      // Reset conversation state so user can generate another image
      await sync.del(`whatsapp:${to}:greeted`);
    });
  } catch (error) {
    console.log("Error processing image", error);
    await sendWhatsAppMessage(to, "Sorry, there was an error generating your image. Please try again.");
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Verify Twilio signature for security
  // In production, you should verify the request signature
  // const signature = req.headers["x-twilio-signature"];
  // const url = process.env.WEBHOOK_URL; // Full URL of this webhook
  // const isValid = twilio.validateRequest(
  //   process.env.TWILIO_AUTH_TOKEN,
  //   signature,
  //   url,
  //   req.body
  // );
  // if (!isValid) {
  //   return res.status(403).json({ message: "Invalid signature" });
  // }

  const { From, Body, MessageSid } = req.body;

  // Extract phone number from WhatsApp format (whatsapp:+1234567890 -> +1234567890)
  const fromNumber = From?.replace("whatsapp:", "") || "";
  const messageBody = Body?.trim() || "";

  if (!fromNumber) {
    return res.status(400).json({ message: "Missing From number" });
  }

  console.log(`Received WhatsApp message from ${fromNumber}: ${messageBody}`);

  // Respond to Twilio immediately (within 3 seconds)
  res.status(200).setHeader("Content-Type", "text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);

  // Process message asynchronously
  try {
    // Check if user has been greeted
    const greeted = await sync.get(`whatsapp:${fromNumber}:greeted`);

    if (!greeted) {
      // First time user - greet them
      await sendWhatsAppMessage(
        fromNumber,
        "👋 Hello! Welcome to AI Image Generator. What would you like me to generate for you?"
      );
      await sync.set(`whatsapp:${fromNumber}:greeted`, "true", { ex: 3600 }); // Expire after 1 hour
    } else {
      // User has been greeted, treat message as prompt
      if (messageBody) {
        await generateImage(messageBody, fromNumber);
      } else {
        await sendWhatsAppMessage(
          fromNumber,
          "Please send me a description of what you'd like me to generate!"
        );
      }
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
  }
}

