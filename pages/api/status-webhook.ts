import { NextApiRequest, NextApiResponse } from "next";
import twilio from "twilio";
import { deleteFile } from "../../utils/storage";
import sync from "../../utils/sync";

/**
 * Webhook endpoint to handle Twilio message status callbacks
 * This endpoint tracks media message delivery status and cleans up delivered media files
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Verify Twilio signature for security (optional but recommended)
  // Uncomment the following lines in production:
  // const signature = req.headers["x-twilio-signature"];
  // const url = process.env.STATUS_WEBHOOK_URL; // Full URL of this webhook
  // const isValid = twilio.validateRequest(
  //   process.env.TWILIO_AUTH_TOKEN,
  //   signature,
  //   url,
  //   req.body
  // );
  // if (!isValid) {
  //   return res.status(403).json({ message: "Invalid signature" });
  // }

  // Extract status callback data from Twilio
  const { MessageSid, MessageStatus, MediaUrl0, MediaUrl1, MediaUrl2, MediaUrl3 } = req.body;

  console.log(`Received status callback - MessageSid: ${MessageSid}, Status: ${MessageStatus}`);

  // Respond to Twilio immediately (within 3 seconds)
  res.status(200).setHeader("Content-Type", "text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);

  // Process status callback asynchronously
  try {
    // Only process delivered status to clean up media files
    if (MessageStatus === "delivered") {
      console.log(`Message ${MessageSid} has been delivered. Cleaning up media files...`);

      // Retrieve stored media filenames for this message
      const storedFilenames = await sync.get(`media:${MessageSid}`);
      
      if (storedFilenames) {
        try {
          const filenames: string[] = JSON.parse(storedFilenames);
          console.log(`Found ${filenames.length} media file(s) to delete for message ${MessageSid}`);

          // Delete each media file from the temp folder
          const deletePromises = filenames.map(async (filename) => {
            try {
              console.log(`Deleting media file: ${filename}`);
              await deleteFile(filename);
            } catch (error) {
              console.error(`Error deleting media file ${filename}:`, error);
              // Continue processing other files even if one fails
            }
          });

          await Promise.all(deletePromises);
          
          // Clean up the stored filenames entry
          await sync.del(`media:${MessageSid}`);
          
          console.log(`Completed cleanup for message ${MessageSid} - deleted ${filenames.length} file(s)`);
        } catch (error) {
          console.error(`Error parsing stored filenames for message ${MessageSid}:`, error);
        }
      } else {
        console.log(`No stored media filenames found for message ${MessageSid}`);
      }
    } else {
      console.log(`Message ${MessageSid} status: ${MessageStatus} - no cleanup needed`);
    }
  } catch (error) {
    console.error("Error processing status webhook:", error);
    // Don't throw - we already responded to Twilio
  }
}

