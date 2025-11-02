import { NextApiRequest, NextApiResponse } from "next";
import twilio from "twilio";
import sync from "../../utils/sync";
import { extractFilenameFromMediaUrl } from "../../utils/storage";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { query } = req;

  if (!query.api_key || query.api_key != process.env.API_KEY) {
    return res.status(401).json({ message: "API Key incorrect" });
  }

  if (!query.to) {
    return res.status(400).json({ message: "Missing 'to'" });
  }

  if (!query.url) {
    return res.status(400).json({ message: "Missing 'url'" });
  }

  const to = query.to as string;
  const url = query.url as string;

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM_NUMBER;
    if (!whatsappFrom) {
      return res.status(500).json({ error: "TWILIO_WHATSAPP_FROM_NUMBER is not configured" });
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
      mediaUrl: [url],
      statusCallback: `${baseUrl}/api/status-webhook`,
    });

    // Store media filename for cleanup when message is delivered
    const filename = extractFilenameFromMediaUrl(url);
    if (filename) {
      // Store filename with MessageSid as key, expire after 7 days
      await sync.set(`media:${message.sid}`, JSON.stringify([filename]), { ex: 604800 });
      console.log(`Stored media filename for message ${message.sid}:`, filename);
    }

    return res.status(200).send({ status: "complete" });
  } catch (error) {
    return res.status(500).json({ error });
  }
}
