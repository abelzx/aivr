import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

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

    let config: Configuration;
    let image_response: any;

    if (useOpenAI) {
      // Use OpenAI directly
      config = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const openai = new OpenAIApi(config);
      image_response = await openai.createImage({
        prompt,
        n: 1,
        size: "512x512",
      });
    } else {
      // Use Azure OpenAI
      config = new Configuration({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        basePath: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
        baseOptions: {
          headers: {
            "api-key": process.env.AZURE_OPENAI_API_KEY,
          },
        },
      });
      const openai = new OpenAIApi(config);
      const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";
      // For Azure OpenAI, append API version as query parameter
      image_response = await openai.createImage(
        {
          prompt,
          n: 1,
          size: "512x512",
        },
        {
          headers: {
            "api-key": process.env.AZURE_OPENAI_API_KEY,
          },
          params: {
            "api-version": apiVersion,
          },
        } as any
      );
    }

    console.log("Image generation response", image_response);

    return res.status(200).json(image_response);
  } catch (error) {
    console.log("Error generating image", error);
    return res.status(500).json({ error });
  }
}
