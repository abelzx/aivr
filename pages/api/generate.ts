import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { body, query } = req;
  const { prompt } = body;

  if (!query.api_key || query.api_key != process.env.API_KEY) {
    return res.status(401).json({ message: "API Key incorrect" });
  }

  try {
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

    console.log("Image generation response", image_response);

    return res.status(200).json(image_response);
  } catch (error) {
    console.log("Error generating image", error);
    return res.status(500).json({ error });
  }
}
