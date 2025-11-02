import { NextApiRequest, NextApiResponse } from "next";
const QSTASH = `https://qstash.upstash.io/v1/publish/`;
const VERCEL_URL = "https://a1085a7a8f3b.ngrok.app";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { prompt } = req.query;
  try {
    // Auto-detect which API to use based on available API keys
    const useAzure = !!process.env.AZURE_OPENAI_API_KEY;
    const useOpenAI = !!process.env.OPENAI_API_KEY;

    if (!useAzure && !useOpenAI) {
      return res.status(500).json({ message: "No API key configured. Please set either OPENAI_API_KEY or AZURE_OPENAI_API_KEY", type: "Configuration error" });
    }

    let endpoint: string;
    let headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
      "Content-Type": "application/json",
      "Upstash-Callback": `${VERCEL_URL}/api/callback`,
    };

    if (useOpenAI) {
      // Use OpenAI directly
      endpoint = "https://api.openai.com/v1/images/generations";
      headers["upstash-forward-Authorization"] = `Bearer ${process.env.OPENAI_API_KEY}`;
    } else {
      // Use Azure OpenAI
      endpoint = `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/images/generations?api-version=${process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview"}`;
      headers["upstash-forward-api-key"] = process.env.AZURE_OPENAI_API_KEY;
    }

    const response = await fetch(`${QSTASH + endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });
    const json = await response.json();
    console.log("QStash response", json);
    return res.status(202).json({ id: json.messageId });
  } catch (error) {
    return res
      .status(500)
      .json({ message: error.message, type: "Internal server error" });
  }
}
