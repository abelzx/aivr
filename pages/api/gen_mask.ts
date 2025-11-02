import { NextApiRequest, NextApiResponse } from "next";

import Jimp from "jimp";
import OpenAI from "openai";
import { saveFile } from "../../utils/storage";

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

  try {
    const prompt = query.prompt as string;
    console.log(`Generating image for prompt: ${prompt}`);

    // Auto-detect which API to use based on available API keys
    const useAzure = !!process.env.AZURE_OPENAI_API_KEY;
    const useOpenAI = !!process.env.OPENAI_API_KEY;

    if (!useAzure && !useOpenAI) {
      return res.status(500).json({ error: "No API key configured. Please set either OPENAI_API_KEY or AZURE_OPENAI_API_KEY" });
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

    const dataURL = image_response.data[0].url;
    console.log("Image generation url", dataURL);

    const image_target = await Jimp.read(image_response.data[0].url);

    const image_mask = await Jimp.read("https://images-5674.twil.io/mask.png");

    image_target.blit(image_mask, 0, 0);

    image_target.getBuffer(Jimp.MIME_PNG, async (err, masked_image_buffer) => {
      console.log("Got AI image");
      if (err) {
        console.log("Error getting image", err);
        return res.status(500).json({ message: "Error getting image" });
      } else {
        console.log("Returning masked image");
        try {
          const end_image_url = await saveFile(masked_image_buffer, Jimp.MIME_PNG);
          console.log(`Redirecting user to ${end_image_url}`);
          return res.redirect(end_image_url);
        } catch (error) {
          console.log("Error uploading file", error);
          return res.status(500).json({ error });
        }
      }
    });
  } catch (error) {
    console.log("Error processing image mask", error);
    return res.status(500).json({ error });
  }
}
