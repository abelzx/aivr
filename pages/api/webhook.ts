import { NextApiRequest, NextApiResponse } from "next";
import twilio from "twilio";
import sync from "../../utils/sync";
import OpenAI from "openai";
import Jimp from "jimp";
import { extractFilenameFromMediaUrl, getDownloadFilePath } from "../../utils/storage";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import FormData from "form-data";

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

// Helper function to send WhatsApp content template
const sendWhatsAppContentTemplate = async (to: string, contentSid: string) => {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM_NUMBER;
  if (!whatsappFrom) {
    throw new Error("TWILIO_WHATSAPP_FROM_NUMBER is not configured");
  }

  if (!contentSid) {
    throw new Error("Content SID is not provided");
  }

  const messageOptions: any = {
    contentSid: contentSid,
    from: `whatsapp:${whatsappFrom}`,
    to: `whatsapp:${to}`,
  };

  const message = await client.messages.create(messageOptions);
  console.log(`Sent content template ${contentSid} to ${to}, MessageSid: ${message.sid}`);

  return message;
};

// Helper function to download file from buffer to /temp/downloads
const downloadFileFromBuffer = async (buffer: Buffer, contentType: string): Promise<string> => {
  const DOWNLOADS_DIR = path.join(process.cwd(), "temp", "downloads");
  
  // Ensure downloads directory exists
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
  
  // Get extension from content type
  const extensions: { [key: string]: string } = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  const extension = extensions[contentType] || '.jpg';
  const filename = `${uuidv4()}${extension}`;
  const filePath = path.join(DOWNLOADS_DIR, filename);
  
  await fs.promises.writeFile(filePath, buffer);
  console.log(`Saved file to: ${filePath}`);
  
  return filePath;
};

// Helper function to generate image-to-image transformation
const generateImageToImage = async (imagePath: string, stylePrompt: string, to: string) => {
  try {
    console.log(`Generating img2img for style: ${stylePrompt} for WhatsApp: ${to}`);

    if (!process.env.AZURE_OPENAI_API_KEY) {
      console.log("Error: AZURE_OPENAI_API_KEY is not configured");
      await sendWhatsAppMessage(to, "Sorry, the image transformation service is not configured. Please try again later.");
      return;
    }

    if (!process.env.AZURE_OPENAI_ENDPOINT) {
      console.log("Error: AZURE_OPENAI_ENDPOINT is not configured");
      await sendWhatsAppMessage(to, "Sorry, the image transformation service endpoint is not configured. Please try again later.");
      return;
    }

    const img2imgDeployment = process.env.AZURE_OPENAI_IMG2IMG_DEPLOYMENT_NAME || "FLUX.1-Kontext-pro";
    const apiVersion = process.env.AZURE_OPENAI_IMG2IMG_API_VERSION || process.env.AZURE_OPENAI_API_VERSION || "2024-02-01";
    
    // Construct the endpoint URL following Azure AI Foundry pattern
    let endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    
    // Remove trailing slash if present
    endpoint = endpoint.replace(/\/$/, '');
    
    // Construct the base path and edit URL
    const basePath = `openai/deployments/${img2imgDeployment}/images`;
    const params = `?api-version=${apiVersion}`;
    const editUrl = `${endpoint}/${basePath}/edits${params}`;
    
    console.log(`Using endpoint: ${editUrl}`);

    // Send processing message
    await sendWhatsAppMessage(to, "Transforming your image with the requested style... Please wait! 🎨");

    // Get filename and content type from path for FormData
    const filename = path.basename(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    
    // Determine content type based on file extension
    const mimeTypes: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = mimeTypes[ext] || 'image/png';
    
    // Determine output format
    const outputFormat = ext === '.png' ? 'png' : 'png'; // Default to PNG

    // Create FormData following the reference pattern
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath), {
      filename: filename,
      contentType: contentType,
    });
    formData.append('prompt', stylePrompt);
    formData.append('n', '1');
    formData.append('size', '1024x1024');
    formData.append('model', img2imgDeployment.toLowerCase());
    formData.append('output_format', outputFormat);

    // Make the API call using axios
    const response = await axios.post(editUrl, formData, {
      headers: {
        'Authorization': `Bearer ${process.env.AZURE_OPENAI_API_KEY}`,
        ...formData.getHeaders(), // Important for FormData to set Content-Type with boundary
      },
    });

    console.log('Image editing successful!');
    console.log('API Response:', response.data);
    
    const { saveFile } = await import("../../utils/storage");

    // Handle response following the reference pattern
    // Assuming the response contains base64 encoded image data
    const responseData = response.data;
    let generatedImageBuffer: Buffer;
    
    if (responseData.data && responseData.data[0] && responseData.data[0].b64_json) {
      // Standard response format with b64_json
      const b64_img = responseData.data[0].b64_json;
      generatedImageBuffer = Buffer.from(b64_img, 'base64');
    } else if (responseData.image_data) {
      // Alternative format with image_data
      generatedImageBuffer = Buffer.from(responseData.image_data, 'base64');
    } else if (responseData.b64_json) {
      // Direct b64_json in response
      generatedImageBuffer = Buffer.from(responseData.b64_json, 'base64');
    } else {
      throw new Error('Unexpected response format from Azure OpenAI API');
    }

    const generatedImage = await Jimp.read(generatedImageBuffer);

    //
    // COMPOSITE IMAGE WITH MASK
    //
    const image_mask = await Jimp.read("https://sepia-loris-2302.twil.io/assets/twilio_mask.png");
    generatedImage.blit(image_mask, 0, 0);

    generatedImage.getBuffer(Jimp.MIME_PNG, async (err: Error | null, transformed_image_buffer: Buffer) => {
      if (err) {
        console.log("Error getting transformed image", err);
        await sendWhatsAppMessage(to, "Sorry, there was an error processing your transformed image. Please try again.");
        return;
      }

      try {
        const end_image_url = await saveFile(transformed_image_buffer, Jimp.MIME_PNG);
        console.log(`Uploaded transformed image URL is ${end_image_url}`);

        await sendWhatsAppMessage(to, "Here's your transformed image! 🎉", [end_image_url]);
        
        // Clean up the downloaded original image
        try {
          await fs.promises.unlink(imagePath);
          console.log(`Cleaned up downloaded image: ${imagePath}`);
        } catch (cleanupError) {
          console.error("Error cleaning up downloaded image:", cleanupError);
        }

        // Reset state so user can upload another image
        await sync.del(`whatsapp:${to}:waiting_for_style`);
        await sync.del(`whatsapp:${to}:image_path`);
      } catch (error) {
        console.log("Error uploading transformed file", error);
        await sendWhatsAppMessage(to, "Sorry, there was an error uploading your transformed image. Please try again.");
      }
    });
  } catch (error: any) {
    console.log("Error processing img2img", error);
    const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error("Error details:", errorMessage);
    await sendWhatsAppMessage(to, "Sorry, there was an error transforming your image. Please try again.");
  }
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

  const { From, Body, MessageSid, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

  // Extract phone number from WhatsApp format (whatsapp:+1234567890 -> +1234567890)
  const fromNumber = From?.replace("whatsapp:", "") || "";
  const messageBody = Body?.trim() || "";
  const numMedia = parseInt(NumMedia || "0", 10);
  const mediaUrl = MediaUrl0;

  if (!fromNumber) {
    return res.status(400).json({ message: "Missing From number" });
  }

  console.log(`Received WhatsApp message from ${fromNumber}: ${messageBody}, NumMedia: ${numMedia}`);

  // Respond to Twilio immediately (within 3 seconds)
  res.status(200).setHeader("Content-Type", "text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);

  // Process message asynchronously
  try {
    // Check if user is waiting for style prompt
    const waitingForStyle = await sync.get(`whatsapp:${fromNumber}:waiting_for_style`);
    
    if (waitingForStyle) {
      // User is in style prompt mode - treat message as style selection
      const imagePath = await sync.get(`whatsapp:${fromNumber}:image_path`);
      
      if (messageBody && imagePath) {
        // Validate that the file still exists
        const fs = require("fs");
        if (fs.existsSync(imagePath)) {
          // Check if message matches one of the quick reply styles
          const normalizedMessage = messageBody.toLowerCase().trim();
          
          // Determine selected style - check exact matches first, then numeric/emoji, then keywords
          let selectedStyle: string | null = null;
          
          // Check for numeric/emoji responses first (exact match)
          if (normalizedMessage === '1' || normalizedMessage.includes('1️⃣')) {
            selectedStyle = 'Anime';
          } else if (normalizedMessage === '2' || normalizedMessage.includes('2️⃣')) {
            selectedStyle = 'Chibi Cartoon';
          } else if (normalizedMessage === '3' || normalizedMessage.includes('3️⃣')) {
            selectedStyle = 'Studio Ghibli';
          } else if (normalizedMessage === '4' || normalizedMessage.includes('4️⃣')) {
            selectedStyle = 'Western Cartoon';
          } else if (normalizedMessage === '5' || normalizedMessage.includes('5️⃣')) {
            selectedStyle = 'Chinese Anime';
          } else if (normalizedMessage === '6' || normalizedMessage.includes('6️⃣')) {
            selectedStyle = 'Disney';
          } 
          // Check for exact word matches (including button text from template)
          else if (normalizedMessage === 'anime') {
            selectedStyle = 'Anime';
          } else if (normalizedMessage === 'chibi') {
            selectedStyle = 'Chibi Cartoon';
          } else if (normalizedMessage === 'studio ghibli' || normalizedMessage === 'studioghibli' || normalizedMessage === 'ghibli') {
            selectedStyle = 'Studio Ghibli';
          } else if (normalizedMessage === 'western cartoon' || normalizedMessage === 'westerncartoon' || normalizedMessage === 'comic') {
            selectedStyle = 'Western Cartoon';
          } else if (normalizedMessage === 'chinese anime' || normalizedMessage === 'chineseanime' || normalizedMessage === 'donghua') {
            selectedStyle = 'Chinese Anime';
          } else if (normalizedMessage === 'disney') {
            selectedStyle = 'Disney';
          }
          // Check for partial matches (in case user types "anime style" or similar)
          else if (normalizedMessage.includes('disney')) {
            selectedStyle = 'Disney';
          } else if (normalizedMessage.includes('chinese') && normalizedMessage.includes('anime')) {
            selectedStyle = 'Chinese Anime';
          } else if (normalizedMessage.includes('donghua')) {
            selectedStyle = 'Chinese Anime';
          } else if (normalizedMessage.includes('anime') && !normalizedMessage.includes('ghibli') && !normalizedMessage.includes('chibi') && !normalizedMessage.includes('comic') && !normalizedMessage.includes('cartoon') && !normalizedMessage.includes('chinese')) {
            selectedStyle = 'Anime';
          } else if (normalizedMessage.includes('chibi') && !normalizedMessage.includes('ghibli') && !normalizedMessage.includes('anime') && !normalizedMessage.includes('comic') && !normalizedMessage.includes('cartoon')) {
            selectedStyle = 'Chibi Cartoon';
          } else if ((normalizedMessage.includes('hero') || normalizedMessage.includes('ghibli')) && !normalizedMessage.includes('anime') && !normalizedMessage.includes('chibi') && !normalizedMessage.includes('comic') && !normalizedMessage.includes('cartoon')) {
            selectedStyle = 'Studio Ghibli';
          } else if ((normalizedMessage.includes('comic') || normalizedMessage.includes('western') || normalizedMessage.includes('cartoon')) && !normalizedMessage.includes('anime') && !normalizedMessage.includes('chibi') && !normalizedMessage.includes('ghibli')) {
            selectedStyle = 'Western Cartoon';
          }
          
          // Format prompt based on selected style or use message as-is
          const stylePrompt = selectedStyle 
            ? `transform the photo into ${selectedStyle} style`
            : messageBody;
          
          await generateImageToImage(imagePath, stylePrompt, fromNumber);
        } else {
          await sendWhatsAppMessage(
            fromNumber,
            "Sorry, the image file is no longer available. Please upload a new photo."
          );
          await sync.del(`whatsapp:${fromNumber}:waiting_for_style`);
          await sync.del(`whatsapp:${fromNumber}:image_path`);
        }
      } else {
        // Send content template with style options
        const contentSid = process.env.TWILIO_WHATSAPP_AIVR_TEMPLATE;
        if (contentSid) {
          await sendWhatsAppContentTemplate(fromNumber, contentSid);
        } else {
          // Fallback to text message if template not configured
          await sendWhatsAppMessage(
            fromNumber,
            "Please choose a style:\n1️⃣ Anime (Japanese animation)\n2️⃣ Chibi (Cute caricature)\n3️⃣ Ghibli (Hand-drawn artistry)\n4️⃣ Western cartoon (Comic)\n5️⃣ Chinese Anime (Donghua)\n6️⃣ Disney (Classic animation)"
          );
        }
      }
      return;
    }

    // Handle media messages (photo uploads)
    if (numMedia > 0 && mediaUrl) {
      try {
        console.log(`Received media message from ${fromNumber}, downloading from: ${mediaUrl}`);
        
        // Download the image to /temp/downloads
        // Twilio media URLs require authentication
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        
        if (!accountSid || !authToken) {
          throw new Error("Twilio credentials not configured");
        }
        
        // Download with Basic Auth
        const response = await fetch(mediaUrl, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to download media: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Get content type from response
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const imagePath = await downloadFileFromBuffer(buffer, contentType);
        console.log(`Downloaded image to: ${imagePath}`);

        // Store the image path and mark that we're waiting for style
        await sync.set(`whatsapp:${fromNumber}:image_path`, imagePath, { ex: 3600 }); // Expire after 1 hour
        await sync.set(`whatsapp:${fromNumber}:waiting_for_style`, "true", { ex: 3600 }); // Expire after 1 hour

        // Send content template with style options
        const contentSid = process.env.TWILIO_WHATSAPP_AIVR_TEMPLATE;
        if (contentSid) {
          await sendWhatsAppContentTemplate(fromNumber, contentSid);
        } else {
          // Fallback to text message if template not configured
          await sendWhatsAppMessage(
            fromNumber,
            "Great! I received your photo. What style would you like me to apply to transform it? 🎨\n\nChoose one:\n1️⃣ Anime (Japanese animation)\n2️⃣ Chibi (Cute caricature)\n3️⃣ Ghibli (Hand-drawn artistry)\n4️⃣ Western cartoon (Comic)\n5️⃣ Chinese Anime (Donghua)\n6️⃣ Disney (Classic animation)"
          );
        }
      } catch (error) {
        console.error("Error processing media message:", error);
        await sendWhatsAppMessage(
          fromNumber,
          "Sorry, there was an error downloading your image. Please try uploading again."
        );
      }
      return;
    }

    // Handle text messages (normal flow)
    // Check if user has been greeted
    const greeted = await sync.get(`whatsapp:${fromNumber}:greeted`);

    if (!greeted) {
      // First time user - greet them
      await sendWhatsAppMessage(
        fromNumber,
        "👋 Hello! Welcome to Twilio AI Magic. You can:\n1. Send me a photo to transform it with a style!\n2. Send me a text description to generate an image~"
      );
      await sync.set(`whatsapp:${fromNumber}:greeted`, "true", { ex: 3600 }); // Expire after 1 hour
    } else {
      // User has been greeted, treat message as prompt
      if (messageBody) {
        await generateImage(messageBody, fromNumber);
      } else {
        await sendWhatsAppMessage(
          fromNumber,
          "Please send me either:\n1. A photo to transform with a style!\n2. A text description of what you'd like me to generate"
        );
      }
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
  }
}

